import assert from "node:assert/strict";
import { test } from "node:test";
import { translator } from "./support/i18n.js";
import { COMMANDS } from "../extension/commands.js";
import { DEFAULT_FAVORITES, findFavoriteTab, formatFavorites, parseFavorites, withoutAccountNumber } from "../extension/favorites.js";
import { rankResults } from "../extension/search.js";

const t = translator("ja");

const favorite = (title) => DEFAULT_FAVORITES.find((f) => f.title === title);
const top = (query, sources = {}) => rankResults(query, { t, commands: COMMANDS, favorites: DEFAULT_FAVORITES, ...sources })[0];

test("英語・日本語・打ちかけの入力でお気に入りが先頭に来る", () => {
  for (const [query, id] of [
    ["mail", "Gmail"],
    ["gmail", "Gmail"],
    ["メール", "Gmail"],
    ["cal", "Google Calendar"],
    ["カレンダー", "Google Calendar"],
    ["google map", "Google Maps"],
    ["地図", "Google Maps"],
    ["dri", "Google Drive"],
    ["ドライブ", "Google Drive"],
    ["スプレッドシート", "Google Sheets"],
  ]) {
    assert.equal(top(query).favorite?.title, id, query);
  }
});

test("同じ当たり方のタブ・ブックマーク・履歴より上に出る", () => {
  const result = top("cal", {
    tabs: [{ id: 1, title: "Calculator", url: "https://calc.example/" }],
    bookmarks: [{ id: "b", title: "Calories", url: "https://cal.example/", folders: [] }],
    history: [{ id: "h", title: "Calendar of events", url: "https://events.example/" }],
  });
  assert.equal(result.favorite?.title, "Google Calendar");
});

test("既存のコマンドは順位を奪われない", () => {
  for (const [query, id] of [
    ["go", "back"],
    ["reload", "reload"],
    ["do", "downloads"],
  ]) {
    assert.equal(top(query).command?.id, id, query);
  }
});

test("お気に入りと同じ URL のブックマークは 1 つにまとまる", () => {
  const bookmarks = [{ id: "b", title: "Mail", url: "https://mail.google.com/", folders: [] }];
  const hits = rankResults("mail", { t, favorites: DEFAULT_FAVORITES, bookmarks }).filter((r) => r.url === "https://mail.google.com/");
  assert.deepEqual(hits.map((r) => r.kind), ["favorite"]);
});

test("開いているタブは今のウィンドウを優先して再利用する", () => {
  const other = { id: 1, windowId: 2, url: "https://mail.google.com/mail/u/0/#inbox" };
  const here = { id: 2, windowId: 1, url: "https://mail.google.com/mail/u/1/#inbox" };
  assert.equal(findFavoriteTab([other, here], favorite("Gmail"), 1), here);
  assert.equal(findFavoriteTab([other], favorite("Gmail"), 1), other);
  assert.equal(findFavoriteTab([{ id: 3, windowId: 1, url: "https://calendar.google.com/" }], favorite("Gmail"), 1), null);
});

test("個別のファイルのタブはドキュメントのホームとして再利用しない", () => {
  const file = { id: 1, windowId: 1, url: "https://docs.google.com/document/d/abc/edit" };
  const home = { id: 2, windowId: 1, url: "https://docs.google.com/document/u/0/" };
  assert.equal(findFavoriteTab([file], favorite("Google Docs"), 1), null);
  assert.equal(findFavoriteTab([file, home], favorite("Google Docs"), 1), home);
});

test("1 行に名前、URL、別名を読む。名前には空白を含められる", () => {
  const { favorites, errors } = parseFavorites("Slack https://app.slack.com/ chat チャット\n\nGoogle Calendar https://calendar.google.com/\n", t);
  assert.deepEqual(errors, []);
  assert.deepEqual(favorites, [
    { title: "Slack", url: "https://app.slack.com/", keywords: ["chat", "チャット"] },
    { title: "Google Calendar", url: "https://calendar.google.com/", keywords: [] },
  ]);
});

test("不正な行は保存せず、行番号付きで理由を返す", () => {
  const { favorites, errors } = parseFavorites(["Slack", "https://app.slack.com/", "Evil javascript:alert(1)", "A https://a.example/", "B https://a.example/"].join("\n"), t);
  assert.deepEqual(favorites, [{ title: "A", url: "https://a.example/", keywords: [] }]);
  assert.deepEqual(errors, [
    "1 行目: http:// か https:// で始まる URL を入れてください",
    "2 行目: URL の前に名前を入れてください",
    "3 行目: http:// か https:// で始まる URL を入れてください",
    "5 行目: https://a.example/ はすでに登録されています",
  ]);
});

test("書き出した内容を読み直すと同じ一覧になる", () => {
  assert.deepEqual(parseFavorites(formatFavorites(DEFAULT_FAVORITES), t), { favorites: DEFAULT_FAVORITES, errors: [] });
});

test("別のアカウント（/u/1/）で開いているホームのタブも再利用する", () => {
  const home = { id: 2, windowId: 1, url: "https://docs.google.com/document/u/1/" };
  assert.equal(findFavoriteTab([home], favorite("Google Docs"), 1), home);
  assert.equal(findFavoriteTab([{ id: 3, windowId: 1, url: "https://docs.google.com/document/d/abc/edit" }], favorite("Google Docs"), 1), null);
  assert.equal(findFavoriteTab([{ id: 4, windowId: 1, url: "https://docs.google.com/spreadsheets/u/2/?tgif=d" }], favorite("Google Sheets"), 1)?.id, 4);
});

test("アカウントの番号だけを置き換える", () => {
  assert.equal(withoutAccountNumber("https://docs.google.com/document/u/12/"), "https://docs.google.com/document/u/*/");
  assert.equal(withoutAccountNumber("https://mail.google.com/mail/u/0"), "https://mail.google.com/mail/u/*");
  assert.equal(withoutAccountNumber("https://example.com/u/name/"), "https://example.com/u/name/");
  assert.equal(withoutAccountNumber("https://example.com/menu/1/"), "https://example.com/menu/1/");
});
