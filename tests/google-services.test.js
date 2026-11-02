import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMANDS } from "../commands.js";
import { GOOGLE_SERVICES, findServiceTab } from "../google-services.js";
import { rankResults } from "../search.js";

const service = (id) => GOOGLE_SERVICES.find((s) => s.id === id);
const top = (query, sources = {}) => rankResults(query, { commands: COMMANDS, services: GOOGLE_SERVICES, ...sources })[0];

test("英語・日本語・打ちかけの入力でサービスが先頭に来る", () => {
  for (const [query, id] of [
    ["mail", "gmail"],
    ["gmail", "gmail"],
    ["メール", "gmail"],
    ["cal", "calendar"],
    ["カレンダー", "calendar"],
    ["google map", "maps"],
    ["地図", "maps"],
    ["dri", "drive"],
    ["ドライブ", "drive"],
    ["スプレッドシート", "sheets"],
  ]) {
    assert.equal(top(query).service?.id, id, query);
  }
});

test("同じ当たり方のタブ・ブックマーク・履歴より上に出る", () => {
  const result = top("cal", {
    tabs: [{ id: 1, title: "Calculator", url: "https://calc.example/" }],
    bookmarks: [{ id: "b", title: "Calories", url: "https://cal.example/", folders: [] }],
    history: [{ id: "h", title: "Calendar of events", url: "https://events.example/" }],
  });
  assert.equal(result.service?.id, "calendar");
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

test("サービスと同じ URL のブックマークは 1 つにまとまる", () => {
  const bookmarks = [{ id: "b", title: "Mail", url: "https://mail.google.com/", folders: [] }];
  const hits = rankResults("mail", { services: GOOGLE_SERVICES, bookmarks }).filter((r) => r.url === "https://mail.google.com/");
  assert.deepEqual(hits.map((r) => r.kind), ["service"]);
});

test("開いているタブは今のウィンドウを優先して再利用する", () => {
  const other = { id: 1, windowId: 2, url: "https://mail.google.com/mail/u/0/#inbox" };
  const here = { id: 2, windowId: 1, url: "https://mail.google.com/mail/u/1/#inbox" };
  assert.equal(findServiceTab([other, here], service("gmail"), 1), here);
  assert.equal(findServiceTab([other], service("gmail"), 1), other);
  assert.equal(findServiceTab([{ id: 3, windowId: 1, url: "https://calendar.google.com/" }], service("gmail"), 1), null);
});

test("個別のファイルのタブはドキュメントのホームとして再利用しない", () => {
  const file = { id: 1, windowId: 1, url: "https://docs.google.com/document/d/abc/edit" };
  const home = { id: 2, windowId: 1, url: "https://docs.google.com/document/u/0/" };
  assert.equal(findServiceTab([file], service("docs"), 1), null);
  assert.equal(findServiceTab([file, home], service("docs"), 1), home);
});
