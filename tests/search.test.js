import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMANDS } from "../commands.js";
import { flattenBookmarks, isSameOrigin, normalize, rankCommands, rankFolderContents, rankResults, scoreFields, toUrl } from "../search.js";

const top = (query, sources = {}) => rankResults(query, { commands: COMMANDS, ...sources })[0];

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
  const results = rankResults("example", {
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
  const results = rankResults("Top", { bookmarks: flattenBookmarks(nestedTree) });
  assert.deepEqual(results.slice(0, 2).map((r) => [r.kind, r.title]), [["folder", "First"], ["folder", "Second"]]);
  assert.equal(results[0].subtitle, "Top · 3 件");
  assert.ok(results.some((r) => r.title === "content1"));
  assert.ok(!results.some((r) => r.title === "Top" || r.title === "Deep"));
});

test("サブフォルダの名前を直接入れるとその中身が出る", () => {
  const results = rankResults("First", { bookmarks: flattenBookmarks(nestedTree) });
  assert.deepEqual(results.slice(0, 2).map((r) => r.title), ["Deep", "content1"]);
});

test("フォルダの中に入ると直下の項目がフォルダ、リンクの順に並び、検索は付かない", () => {
  const first = flattenBookmarks(nestedTree).find((node) => node.id === "first");
  assert.deepEqual(rankFolderContents("", first).map((r) => r.title), ["Deep", "content1", "content2"]);
});

test("フォルダの中での入力はそのフォルダ以下だけを絞り込む", () => {
  const top = flattenBookmarks(nestedTree).find((node) => node.id === "top");
  assert.deepEqual(rankFolderContents("contenta", top).map((r) => r.title), ["contentA"]);
  assert.deepEqual(rankFolderContents("sec", top).map((r) => r.title), ["Second", "contentA"]);
  assert.deepEqual(rankFolderContents("zzz", top), []);
});

test("フォルダ名で中のリンクが引ける", () => {
  const bookmarks = flattenBookmarks(bookmarkTree);
  const hits = rankResults("仕事", { bookmarks }).filter((r) => r.kind === "bookmark");
  assert.deepEqual(hits.map((r) => r.title), ["Repo", "Manual"]);
  assert.equal(hits[0].subtitle, "仕事 · github.com/a/b");
  assert.equal(hits[1].subtitle, "仕事 / Docs · manual.example/");
});

test("フォルダ名とリンク名を組み合わせて絞り込める", () => {
  const bookmarks = flattenBookmarks(bookmarkTree);
  const hits = rankResults("仕事 repo", { bookmarks }).filter((r) => r.kind === "bookmark");
  assert.deepEqual(hits.map((r) => r.title), ["Repo"]);
});

test("標準フォルダの名前では引けず、リンク自身に当たれば URL だけを表示する", () => {
  const bookmarks = flattenBookmarks(bookmarkTree);
  assert.equal(rankResults("ブックマーク", { bookmarks }).filter((r) => r.kind === "bookmark").length, 0);
  assert.equal(rankResults("repo", { bookmarks }).find((r) => r.kind === "bookmark").subtitle, "github.com/a/b");
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
  assert.deepEqual(rankCommands(" ", COMMANDS).map((item) => item.command), COMMANDS);
});

test("rankCommands はコマンドだけを返し、Web 検索や URL の候補を足さない", () => {
  const items = rankCommands("example.com", COMMANDS);
  assert.ok(items.every((item) => item.kind === "command"));
  assert.ok(rankCommands("New Window", COMMANDS).some((item) => item.title === "New Window"));
});
