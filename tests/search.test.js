import assert from "node:assert/strict";
import { test } from "node:test";
import { translator } from "./support/i18n.js";
import { COMMANDS } from "../extension/commands.js";
import { flattenBookmarks, isSameOrigin, normalize, rankCommands, rankFolderContents, rankResults, recentlyClosedTabs, removeResult, scoreFields, toUrl, withGroupTitles } from "../extension/search.js";

const t = translator("ja");

const top = (query, sources = {}) => rankResults(query, { t, commands: COMMANDS, ...sources })[0];

test("normalize は全角・大文字・カタカナをそろえる", () => {
  assert.equal(normalize(" ＮＥＷ シークレット "), "new しーくれっと");
});

test("直感的な単語でコマンドが先頭に来る", () => {
  for (const [query, id] of [
    ["new window", "new-window"],
    ["incognito", "incognito"],
    ["シークレット", "incognito"],
    ["しーくれっと", "incognito"],
    ["reload", "reload"],
    ["履歴", "history"],
    ["nw", "new-window"],
  ]) {
    assert.equal(top(query).command?.id, id, query);
  }
});

test("タブのタイトルで引ける", () => {
  const tabs = [{ id: 1, title: "Pull requests", url: "https://github.com/pulls" }];
  const result = top("pull requ", { tabs });
  assert.equal(result.kind, "tab");
  assert.equal(result.tab.id, 1);
});

test("複数語は別々のフィールドにまたがって一致する", () => {
  assert.ok(scoreFields("github pulls", [{ text: "Pull requests" }, { text: "github.com/pulls" }]) > 0);
  assert.equal(scoreFields("github zzz", [{ text: "github.com" }]), 0);
});

test("同じ URL はタブ > ブックマーク > 履歴 の順で 1 つになる", () => {
  const url = "https://example.com/a";
  const results = rankResults("example", { t,
    tabs: [{ id: 1, title: "Example", url }],
    bookmarks: [{ id: "b", title: "Example", url }],
    history: [{ id: "h", title: "Example", url }],
  });
  assert.deepEqual(results.filter((r) => r.url === url).map((r) => r.kind), ["tab"]);
});

const bookmarkTree = [
  {
    id: "0",
    title: "",
    children: [
      {
        id: "1",
        title: "ブックマーク バー",
        children: [
          { id: "a", title: "Top Level", url: "https://top.example/" },
          {
            id: "2",
            title: "仕事",
            children: [
              { id: "b", title: "Repo", url: "https://github.com/a/b" },
              { id: "3", title: "Docs", children: [{ id: "c", title: "Manual", url: "https://manual.example/" }] },
            ],
          },
        ],
      },
    ],
  },
];

test("flattenBookmarks はリンクとフォルダに親フォルダ名を付け、標準フォルダは含めない", () => {
  assert.deepEqual(flattenBookmarks(bookmarkTree).map((b) => [b.id, b.folders]), [
    ["a", []],
    ["2", []],
    ["b", ["仕事"]],
    ["3", ["仕事"]],
    ["c", ["仕事", "Docs"]],
  ]);
});

const nestedTree = [
  {
    id: "0",
    title: "",
    children: [
      {
        id: "1",
        title: "ブックマーク バー",
        children: [
          {
            id: "top",
            title: "Top",
            children: [
              {
                id: "first",
                title: "First",
                children: [
                  { id: "c1", title: "content1", url: "https://example.com/1" },
                  { id: "c2", title: "content2", url: "https://example.com/2" },
                  { id: "deep", title: "Deep", children: [{ id: "d1", title: "deep1", url: "https://example.com/d1" }] },
                ],
              },
              { id: "second", title: "Second", children: [{ id: "ca", title: "contentA", url: "https://example.com/a" }] },
            ],
          },
        ],
      },
    ],
  },
];

test("フォルダ名を入れると直下のサブフォルダが先頭に並び、その下にリンクが出る", () => {
  const results = rankResults("Top", { t, bookmarks: flattenBookmarks(nestedTree) });
  assert.deepEqual(results.slice(0, 2).map((r) => [r.kind, r.title]), [["folder", "First"], ["folder", "Second"]]);
  assert.equal(results[0].subtitle, "Top · 3 件");
  assert.ok(results.some((r) => r.title === "content1"));
  assert.ok(!results.some((r) => r.title === "Top" || r.title === "Deep"));
});

test("サブフォルダの名前を直接入れるとその中身が出る", () => {
  const results = rankResults("First", { t, bookmarks: flattenBookmarks(nestedTree) });
  assert.deepEqual(results.slice(0, 2).map((r) => r.title), ["Deep", "content1"]);
});

test("フォルダの中に入ると直下の項目がフォルダ、リンクの順に並び、検索は付かない", () => {
  const first = flattenBookmarks(nestedTree).find((node) => node.id === "first");
  assert.deepEqual(rankFolderContents("", first, { t }).map((r) => r.title), ["Deep", "content1", "content2"]);
});

test("フォルダの中での入力はそのフォルダ以下だけを絞り込む", () => {
  const top = flattenBookmarks(nestedTree).find((node) => node.id === "top");
  assert.deepEqual(rankFolderContents("contenta", top, { t }).map((r) => r.title), ["contentA"]);
  assert.deepEqual(rankFolderContents("sec", top, { t }).map((r) => r.title), ["Second", "contentA"]);
  assert.deepEqual(rankFolderContents("zzz", top, { t }), []);
});

test("フォルダ名で中のリンクが引ける", () => {
  const bookmarks = flattenBookmarks(bookmarkTree);
  const hits = rankResults("仕事", { t, bookmarks }).filter((r) => r.kind === "bookmark");
  assert.deepEqual(hits.map((r) => r.title), ["Repo", "Manual"]);
  assert.equal(hits[0].subtitle, "仕事 · github.com/a/b");
  assert.equal(hits[1].subtitle, "仕事 / Docs · manual.example/");
});

test("フォルダ名とリンク名を組み合わせて絞り込める", () => {
  const bookmarks = flattenBookmarks(bookmarkTree);
  const hits = rankResults("仕事 repo", { t, bookmarks }).filter((r) => r.kind === "bookmark");
  assert.deepEqual(hits.map((r) => r.title), ["Repo"]);
});

test("標準フォルダの名前では引けず、リンク自身に当たれば URL だけを表示する", () => {
  const bookmarks = flattenBookmarks(bookmarkTree);
  assert.equal(rankResults("ブックマーク", { t, bookmarks }).filter((r) => r.kind === "bookmark").length, 0);
  assert.equal(rankResults("repo", { t, bookmarks }).find((r) => r.kind === "bookmark").subtitle, "github.com/a/b");
});

test("toUrl は URL らしい入力だけを変換する", () => {
  assert.equal(toUrl("example.com/path"), "https://example.com/path");
  assert.equal(toUrl("localhost:3000"), "http://localhost:3000");
  assert.equal(toUrl("chrome://flags"), "chrome://flags");
  assert.equal(toUrl("new window"), null);
  assert.equal(toUrl("javascript:alert(1)"), null);
});

test("URL を入力すると開く項目が先頭に来る", () => {
  assert.equal(top("example.com").kind, "url");
});

test("一致しない入力は検索にフォールバックする", () => {
  const result = top("zzzqqq");
  assert.equal(result.kind, "search");
  assert.equal(result.text, "zzzqqq");
});

test("isSameOrigin はパスが違っても同じオリジンなら true を返す", () => {
  assert.equal(isSameOrigin("https://mail.google.com/a#inbox", "https://mail.google.com/b"), true);
});

test("isSameOrigin はサブドメインやスキームが違えば false を返す", () => {
  assert.equal(isSameOrigin("https://docs.google.com/", "https://mail.google.com/"), false);
  assert.equal(isSameOrigin("http://example.com/", "https://example.com/"), false);
});

test("isSameOrigin はオリジンが null の URL を完全一致で比べる", () => {
  assert.equal(isSameOrigin("file:///a.html", "file:///b.html"), false);
  assert.equal(isSameOrigin("file:///a.html", "file:///a.html"), true);
});

test("isSameOrigin は読み込み前の空の URL で失敗しない", () => {
  assert.equal(isSameOrigin("", "https://example.com/"), false);
});

test("rankCommands は入力が空なら全コマンドを返す", () => {
  assert.deepEqual(rankCommands(" ", COMMANDS, { t }).map((item) => item.command), COMMANDS);
});

test("rankCommands はコマンドだけを返し、Web 検索や URL の候補を足さない", () => {
  const items = rankCommands("example.com", COMMANDS, { t });
  assert.ok(items.every((item) => item.kind === "command"));
  assert.ok(rankCommands("New Window", COMMANDS, { t }).some((item) => item.title === "New Window"));
});

test("removeResult は選んでいた行を外し、同じ位置の次の行を選ぶ", () => {
  const results = ["a", "b", "c"].map((key) => ({ key }));
  assert.deepEqual(removeResult(results, "b", "b"), { results: [{ key: "a" }, { key: "c" }], selectedKey: "c" });
  assert.deepEqual(removeResult(results, "c", "c"), { results: [{ key: "a" }, { key: "b" }], selectedKey: "b" });
  assert.deepEqual(removeResult([{ key: "a" }], "a", "a"), { results: [], selectedKey: null });
  assert.deepEqual(results.map((item) => item.key), ["a", "b", "c"]);
});

test("removeResult は選んでいない行を外しても選択を変えず、ない行なら何もしない", () => {
  const results = ["a", "b", "c"].map((key) => ({ key }));
  assert.deepEqual(removeResult(results, "a", "c"), { results: [{ key: "b" }, { key: "c" }], selectedKey: "c" });
  assert.deepEqual(removeResult(results, "x", "b"), { results, selectedKey: "b" });
});

test("recentlyClosedTabs は閉じたタブを新しい順に取り出し、ウィンドウと除外するタブと重複した URL を外す", () => {
  const sessions = [
    { lastModified: 5, tab: { sessionId: "5", title: "A", url: "https://a.example/" } },
    { lastModified: 4, window: { sessionId: "4", tabs: [{ sessionId: "41", url: "https://w.example/" }] } },
    { lastModified: 3, tab: { sessionId: "3", title: "Palette", url: "chrome-extension://id/palette.html" } },
    { lastModified: 2, tab: { sessionId: "2", title: "A (old)", url: "https://a.example/" } },
    { lastModified: 1, tab: { sessionId: "1", title: "B", url: "https://b.example/" } },
  ];
  const tabs = recentlyClosedTabs(sessions, (tab) => tab.url.startsWith("chrome-extension://"));
  assert.deepEqual(tabs.map((tab) => tab.sessionId), ["5", "1"]);
  assert.deepEqual(recentlyClosedTabs(undefined), []);
});

test("最近閉じたタブをタイトルや URL で引ける", () => {
  const closedTabs = [{ sessionId: "7", title: "Release notes", url: "https://closed.example/notes" }];
  const byTitle = rankResults("release", { t, closedTabs }).find((r) => r.kind === "closedTab");
  assert.equal(byTitle?.sessionId, "7");
  assert.equal(byTitle.key, "closedTab:7");
  assert.ok(rankResults("closed.example", { t, closedTabs }).some((r) => r.kind === "closedTab"));
  assert.ok(!rankResults("zzz", { t, closedTabs }).some((r) => r.kind === "closedTab"));
});

test("同じ URL はブックマーク > 最近閉じたタブ > 履歴 の順で 1 つになる", () => {
  const url = "https://example.com/closed";
  const closedTabs = [{ sessionId: "1", title: "Example", url }];
  const history = [{ id: "h", title: "Example", url }];
  const kinds = (sources) => rankResults("example", { t, ...sources }).filter((r) => r.url === url).map((r) => r.kind);
  assert.deepEqual(kinds({ closedTabs, history }), ["closedTab"]);
  assert.deepEqual(kinds({ closedTabs, history, bookmarks: [{ id: "b", title: "Example", url }] }), ["bookmark"]);
  assert.deepEqual(kinds({ closedTabs, tabs: [{ id: 1, title: "Example", url }] }), ["tab"]);
});

test("最近閉じたタブは、同じように一致する開いているタブより下に出る", () => {
  const results = rankResults("docs", { t,
    closedTabs: [{ sessionId: "1", title: "Docs", url: "https://closed.example/" }],
    tabs: [{ id: 1, title: "Docs", url: "https://open.example/" }],
  });
  const kinds = results.filter((r) => r.kind === "tab" || r.kind === "closedTab").map((r) => r.kind);
  assert.deepEqual(kinds, ["tab", "closedTab"]);
});

test("withGroupTitles は名前のあるグループに入ったタブにだけグループ名を付ける", () => {
  const tabs = [
    { id: 1, groupId: 10 },
    { id: 2, groupId: 11 },
    { id: 3, groupId: -1 },
    { id: 4, groupId: 99 },
  ];
  const groups = [
    { id: 10, title: "仕事" },
    { id: 11, title: "" },
  ];
  assert.deepEqual(
    withGroupTitles(tabs, groups).map((tab) => tab.groupTitle),
    ["仕事", undefined, undefined, undefined],
  );
});

test("タブグループの名前でタブが引け、グループ名をサブタイトルに併記する", () => {
  const tabs = [
    { id: 1, title: "Pull requests", url: "https://github.com/pulls", groupTitle: "仕事" },
    { id: 2, title: "Weather", url: "https://example.com/weather" },
  ];
  const results = rankResults("仕事", { t, tabs }).filter((item) => item.kind === "tab");
  assert.deepEqual(results.map((item) => [item.tab.id, item.subtitle]), [[1, "仕事 · github.com/pulls"]]);
});

test("タブのタイトルで当たったときは、グループ名を併記しない", () => {
  const tabs = [{ id: 1, title: "Pull requests", url: "https://github.com/pulls", groupTitle: "Pull" }];
  const item = rankResults("pull requests", { t, tabs }).find((entry) => entry.kind === "tab");
  assert.equal(item.subtitle, "github.com/pulls");
});

test("グループ名とタイトルを組み合わせてタブを絞り込める", () => {
  const tabs = [
    { id: 1, title: "Docs", url: "https://a.example/docs", groupTitle: "仕事" },
    { id: 2, title: "Docs", url: "https://b.example/docs", groupTitle: "趣味" },
  ];
  const results = rankResults("仕事 docs", { t, tabs }).filter((item) => item.kind === "tab");
  assert.deepEqual(results.map((item) => item.tab.id), [1]);
});

test("グループ名で当たったタブは、タイトルで当たったタブより下に出る", () => {
  const tabs = [
    { id: 1, title: "Mail", url: "https://mail.example/", groupTitle: "Work" },
    { id: 2, title: "Work log", url: "https://log.example/" },
  ];
  const results = rankResults("work", { t, tabs }).filter((item) => item.kind === "tab");
  assert.deepEqual(results.map((item) => item.tab.id), [2, 1]);
});
