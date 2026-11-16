import assert from "node:assert/strict";
import { test } from "node:test";
import { translator } from "./support/i18n.js";
import { COMMANDS } from "../commands.js";
import { commandItem, rankCommands, rankFolderContents, rankResults } from "../search.js";
import { MAX_USAGE_BONUS, forgetUrls, recordUsage, sortByUsage, usageBonus, usageKey } from "../usage.js";

const t = translator("ja");

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

test("usageKey は同じページをタブ、ブックマーク、履歴で同じキーにする", () => {
  const url = "https://example.com/a";
  assert.equal(usageKey({ kind: "tab", url }), `url:${url}`);
  assert.equal(usageKey({ kind: "bookmark", url }), `url:${url}`);
  assert.equal(usageKey({ kind: "history", url }), `url:${url}`);
  assert.equal(usageKey(commandItem(COMMANDS[0], t)), `command:${COMMANDS[0].id}`);
  assert.equal(usageKey({ kind: "folder", folder: { id: "7" } }), "folder:7");
});

test("usageKey は検索やサイト内検索、リーディングリストを記録しない", () => {
  assert.equal(usageKey({ kind: "search", text: "foo" }), null);
  assert.equal(usageKey({ kind: "siteSearch", url: "https://example.com/?q=foo" }), null);
  assert.equal(usageKey({ kind: "readingList", url: "https://example.com/" }), null);
  assert.equal(usageKey(undefined), null);
});

test("usageBonus は回数が多いほど大きく、上限を超えない", () => {
  const bonus = (count) => usageBonus({ count, lastUsed: NOW }, NOW);
  assert.equal(usageBonus(undefined, NOW), 0);
  assert.ok(bonus(1) > 0);
  assert.ok(bonus(3) > bonus(1));
  assert.equal(bonus(1000), MAX_USAGE_BONUS);
});

test("usageBonus は時間がたつと弱まる", () => {
  const entry = { count: 10, lastUsed: NOW };
  assert.ok(usageBonus(entry, NOW + 14 * DAY) < usageBonus(entry, NOW));
  assert.ok(Math.abs(usageBonus(entry, NOW + 14 * DAY) - MAX_USAGE_BONUS / 2) < 1e-9);
  assert.ok(usageBonus(entry, NOW + 365 * DAY) < 0.01);
  // 時計が戻っても、上限を超えない。
  assert.equal(usageBonus(entry, NOW - DAY), MAX_USAGE_BONUS);
});

test("recordUsage は回数を増やし、最後に選んだ時刻を更新する", () => {
  const key = usageKey({ kind: "tab", url: "https://example.com/" });
  const once = recordUsage({}, key, NOW);
  const twice = recordUsage(once, key, NOW + DAY);
  assert.deepEqual(twice["url:https://example.com/"], { count: 2, lastUsed: NOW + DAY });
  assert.deepEqual(once["url:https://example.com/"], { count: 1, lastUsed: NOW });
});

test("recordUsage はキーがなければそのまま返す", () => {
  const usage = {};
  assert.equal(recordUsage(usage, null, NOW), usage);
  assert.equal(recordUsage(usage, undefined, NOW), usage);
});

test("recordUsage は上限を超えたら点数の低いものから消す", () => {
  const usage = {
    "url:old": { count: 50, lastUsed: NOW - 300 * DAY },
    "url:often": { count: 50, lastUsed: NOW - DAY },
  };
  const next = recordUsage(usage, "url:new", NOW, 2);
  assert.deepEqual(Object.keys(next).sort(), ["url:new", "url:often"]);
});

test("forgetUrls は履歴から消したページの記録を消す", () => {
  const usage = { "url:a": { count: 1, lastUsed: NOW }, "url:b": { count: 1, lastUsed: NOW }, "command:reload": { count: 1, lastUsed: NOW } };
  assert.deepEqual(Object.keys(forgetUrls(usage, { allHistory: false, urls: ["a"] })), ["url:b", "command:reload"]);
  assert.deepEqual(Object.keys(forgetUrls(usage, { allHistory: true, urls: [] })), ["command:reload"]);
});

test("よく選ぶページが、同じくらい一致するほかの候補より上に出る", () => {
  const history = [
    { id: "1", title: "Project Alpha", url: "https://a.example/", visitCount: 50 },
    { id: "2", title: "Project Beta", url: "https://b.example/", visitCount: 1 },
  ];
  assert.equal(rankResults("project", { t, history, now: NOW })[0].url, "https://a.example/");
  const usage = { "url:https://b.example/": { count: 5, lastUsed: NOW - DAY } };
  assert.equal(rankResults("project", { t, history, usage, now: NOW })[0].url, "https://b.example/");
});

test("よく選ぶ候補でも、ずっとよく一致する候補は追い越さない", () => {
  const tabs = [
    { id: 1, title: "Notes", url: "https://notes.example/" },
    { id: 2, title: "Team meeting notes", url: "https://meeting.example/" },
  ];
  const usage = { "url:https://meeting.example/": { count: 1000, lastUsed: NOW } };
  assert.equal(rankResults("notes", { t, tabs, usage, now: NOW })[0].tab.id, 1);
});

test("選んでからしばらくたつと、効きが弱まって元の順に戻る", () => {
  const tabs = [
    { id: 1, title: "Docs", url: "https://docs.example/" },
    { id: 2, title: "Docs", url: "https://docs2.example/" },
  ];
  const usage = { "url:https://docs2.example/": { count: 1, lastUsed: NOW } };
  // 同点なら元の順のまま。
  assert.equal(rankResults("docs", { t, tabs, now: NOW })[0].tab.id, 1);
  assert.equal(rankResults("docs", { t, tabs, usage, now: NOW })[0].tab.id, 2);
  assert.ok(rankResults("docs", { t, tabs, usage, now: NOW + 365 * DAY })[0].boost < 0.01);
});

test("よく選ぶコマンドが上に出る", () => {
  const reload = COMMANDS.find((command) => command.id === "reload");
  const usage = { "command:reload": { count: 3, lastUsed: NOW } };
  assert.equal(rankCommands("", COMMANDS, { t, usage, now: NOW })[0].command.id, "reload");
  assert.deepEqual(
    rankCommands("", COMMANDS, { t, now: NOW }).map((item) => item.command.id),
    COMMANDS.map((command) => command.id),
  );
  assert.ok(reload);
});

test("フォルダの中でも、よく選ぶブックマークが上に出る", () => {
  const folder = {
    id: "f",
    title: "仕事",
    children: [
      { id: "1", title: "Wiki Home", url: "https://wiki.example/" },
      { id: "2", title: "Wiki Search", url: "https://wiki.example/search" },
    ],
  };
  assert.equal(rankFolderContents("wiki", folder, { t, now: NOW })[0].url, "https://wiki.example/");
  const usage = { "url:https://wiki.example/search": { count: 2, lastUsed: NOW } };
  assert.equal(rankFolderContents("wiki", folder, { t, usage, now: NOW })[0].url, "https://wiki.example/search");
});

test("sortByUsage は記録のない候補の順番を保つ", () => {
  const items = ["a", "b", "c"].map((id) => ({ kind: "command", command: { id } }));
  const usage = { "command:c": { count: 1, lastUsed: NOW } };
  assert.deepEqual(sortByUsage(items, usage, NOW).map((item) => item.command.id), ["c", "a", "b"]);
});
