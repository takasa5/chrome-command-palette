import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchUrl, formatEngines, parseEngines, pickVisitedPage, siteSearchScope } from "../site-search.js";

const GITHUB = { keyword: "gh", name: "GitHub", url: "https://github.com/search?q=%s" };

test("buildSearchUrl は検索語をエンコードして埋め込む", () => {
  assert.equal(buildSearchUrl(GITHUB.url, " a&b=c 日本語/? "), "https://github.com/search?q=a%26b%3Dc%20%E6%97%A5%E6%9C%AC%E8%AA%9E%2F%3F");
});

test("buildSearchUrl は %s をすべて置き換え、検索語の $ を特別扱いしない", () => {
  assert.equal(buildSearchUrl("https://a.example/%s?q=%s", "$&"), "https://a.example/%24%26?q=%24%26");
});

test("parseEngines はキーワード、空白を含む名前、URL を読む", () => {
  assert.deepEqual(parseEngines("gh GitHub https://github.com/search?q=%s\n\n  mdn MDN Web Docs  https://developer.mozilla.org/search?q=%s  "), {
    engines: [GITHUB, { keyword: "mdn", name: "MDN Web Docs", url: "https://developer.mozilla.org/search?q=%s" }],
    errors: [],
  });
});

test("parseEngines はパレットの入力と比べられるようにキーワードを正規化する", () => {
  assert.equal(parseEngines("ＧＨ GitHub https://github.com/search?q=%s").engines[0].keyword, "gh");
});

test("parseEngines は項目が足りない行を保存しない", () => {
  assert.deepEqual(parseEngines("gh https://github.com/search?q=%s"), {
    engines: [],
    errors: ["1 行目: キーワード、名前、URL を空白で区切って入力してください"],
  });
});

test("parseEngines は %s のない URL を保存しない", () => {
  assert.deepEqual(parseEngines("gh GitHub https://github.com/search"), { engines: [], errors: ["1 行目: URL に %s がありません"] });
});

test("parseEngines は http と https 以外の URL を保存しない", () => {
  for (const url of ["javascript:alert(%s)", "chrome://%s", "github.com/search?q=%s"]) {
    assert.deepEqual(parseEngines(`gh GitHub ${url}`), { engines: [], errors: ["1 行目: URL は http:// か https:// で始めてください"] });
  }
});

test("parseEngines は重複したキーワードの先の行を残す", () => {
  assert.deepEqual(parseEngines("gh GitHub https://github.com/search?q=%s\nGH Other https://other.example/?q=%s"), {
    engines: [GITHUB],
    errors: ["2 行目: キーワード gh はすでに使われています"],
  });
});

test("parseEngines は予約済みのキーワードを保存しない", () => {
  assert.deepEqual(parseEngines("x Example https://example.com/?q=%s", ["x"]), { engines: [], errors: ["1 行目: キーワード x はすでに使われています"] });
});

test("formatEngines の出力は parseEngines で元に戻る", () => {
  const engines = [GITHUB, { keyword: "mdn", name: "MDN Web Docs", url: "https://developer.mozilla.org/search?q=%s" }];
  assert.deepEqual(parseEngines(formatEngines(engines)), { engines, errors: [] });
});

test("pickVisitedPage はパスの先頭が同じページを優先する", () => {
  const pages = [{ url: "https://www.google.com/search?q=a" }, { url: "https://www.google.com/maps/place/b" }];
  assert.equal(pickVisitedPage(pages, "https://www.google.com/maps/search/test"), "https://www.google.com/maps/place/b");
});

test("pickVisitedPage はなければ同じオリジンのページを返す", () => {
  assert.equal(pickVisitedPage([{ url: "https://github.com/foo" }], "https://github.com/search?q=test"), "https://github.com/foo");
});

test("pickVisitedPage は別オリジンのページを選ばない", () => {
  assert.equal(pickVisitedPage([{ url: "https://example.com/?u=github.com" }], "https://github.com/search?q=test"), null);
});

test("siteSearchScope は入力が空なら候補を出さない", async () => {
  assert.deepEqual(await siteSearchScope(GITHUB).search("  "), []);
});

test("siteSearchScope は検索結果の URL を持つ候補を返す", async () => {
  const [item] = await siteSearchScope(GITHUB).search("foo bar");
  assert.equal(item.kind, "siteSearch");
  assert.equal(item.title, "「foo bar」を検索");
  assert.equal(item.url, "https://github.com/search?q=foo%20bar");
});
