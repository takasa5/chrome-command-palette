import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { loadMessages, translator } from "./support/i18n.js";
import { COMMANDS } from "../extension/commands.js";
import { DEFAULT_FAVORITES, defaultFavorites, parseFavorites } from "../extension/favorites.js";
import { formatMessage, isJapanese } from "../extension/i18n.js";
import { linkCountLabel, rankCommands, rankResults } from "../extension/search.js";
import { parseEngines, siteSearchScope } from "../extension/site-search.js";

const root = new URL("../extension/", import.meta.url);
const LOCALES = readdirSync(new URL("_locales/", root));
const read = (file) => readFileSync(new URL(file, root), "utf8");
const placeholderNames = (entry) => Object.keys(entry.placeholders ?? {}).sort();

test("formatMessage は名前付きの置き換えと $1、$$ を Chrome と同じように埋める", () => {
  const entry = { message: "$LINE$ 行目: $Message$ ($$5)", placeholders: { line: { content: "$1" }, message: { content: "$2" } } };
  assert.equal(formatMessage(entry, ["3", "$1 です"]), "3 行目: $1 です ($5)");
  assert.equal(formatMessage(undefined, []), "");
});

test("isJapanese は ja と ja-JP を日本語とみなす", () => {
  assert.equal(isJapanese("ja"), true);
  assert.equal(isJapanese("ja-JP"), true);
  assert.equal(isJapanese("en-US"), false);
  assert.equal(isJapanese("jv"), false);
});

test("messages.json の locale は置いたフォルダの言語と一致する", () => {
  for (const locale of LOCALES) assert.equal(loadMessages(locale).locale.message, locale);
});

test("どの言語も同じキーと置き換えの名前を持つ", () => {
  const [base, ...others] = LOCALES.map(loadMessages);
  for (const [index, messages] of others.entries()) {
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(base).sort(), LOCALES[index + 1]);
    for (const key of Object.keys(base)) assert.deepEqual(placeholderNames(messages[key]), placeholderNames(base[key]), key);
  }
});

test("コードと HTML と manifest.json が使うキーはすべて messages.json にある", () => {
  const messages = loadMessages("en");
  const files = readdirSync(root).filter((file) => /\.(js|html)$/.test(file));
  const used = new Set([
    ...files.flatMap((file) => [...read(file).matchAll(/\bt\(\s*"([^"]+)"/g)].map((match) => match[1])),
    ...files.flatMap((file) => [...read(file).matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((match) => match[1])),
    ...[...read("manifest.json").matchAll(/__MSG_(\w+)__/g)].map((match) => match[1]),
    ...[...read("palette.js").match(/const KIND_LABELS = \{([^}]+)\}/)[1].matchAll(/"(\w+)"/g)].map((match) => match[1]),
  ]);
  assert.ok(used.size > 20);
  for (const key of used) assert.ok(messages[key], key);
});

test("コマンドの説明はどの言語にもあり、日本語では今までの日本語名を出す", () => {
  const ja = loadMessages("ja");
  for (const locale of LOCALES) {
    const messages = loadMessages(locale);
    for (const command of COMMANDS) assert.ok(messages[`command_${command.id.replaceAll("-", "_")}`]?.message, `${locale} ${command.id}`);
  }
  for (const command of COMMANDS) assert.equal(ja[`command_${command.id.replaceAll("-", "_")}`].message, command.ja, command.id);
});

test("英語の環境では文言が英語になり、日本語の名前やひらがなでも引ける", () => {
  const t = translator("en");
  assert.equal(rankResults("しーくれっと", { t, commands: COMMANDS })[0].command.id, "incognito");
  assert.equal(rankCommands("incognito", COMMANDS, { t })[0].subtitle, "Open a private window");
  assert.deepEqual(
    rankResults("example.com", { t }).map(({ title, subtitle }) => [title, subtitle]),
    [
      ["Open https://example.com", "URL"],
      ["Search for “example.com”", "Default search engine"],
    ],
  );
  assert.deepEqual(parseFavorites("https://a.example/", t).errors, ["Line 1: Enter a name before the URL"]);
  assert.deepEqual(parseEngines("gh https://github.com/search?q=%s", t).errors, ["Line 1: Enter a keyword, a name, and a URL separated by spaces"]);
  const scope = siteSearchScope({ keyword: "gh", name: "GitHub", url: "https://github.com/search?q=%s" }, t);
  assert.equal(scope.hint, "Press Tab to search GitHub");
  assert.equal(linkCountLabel(1, t), "1 item");
  assert.equal(linkCountLabel(3, t), "3 items");
});

test("日本語の環境では今と同じ文言になる", () => {
  const t = translator("ja");
  assert.equal(rankCommands("incognito", COMMANDS, { t })[0].subtitle, "シークレットウィンドウ");
  assert.equal(rankResults("foo", { t }).at(-1).title, "「foo」を検索");
  assert.equal(linkCountLabel(1, t), "1 件");
});

test("純粋関数を置くファイルは chrome.i18n を使う i18n.js を読み込まない", () => {
  for (const file of ["search.js", "site-search.js"]) assert.doesNotMatch(read(file), /from "\.\/i18n\.js"/, file);
});

test("お気に入りの初期値は、日本語の環境でだけ日本語の別名を含む", () => {
  assert.deepEqual(defaultFavorites(true), DEFAULT_FAVORITES);
  const en = defaultFavorites(false);
  assert.deepEqual(
    en.map((favorite) => favorite.title),
    DEFAULT_FAVORITES.map((favorite) => favorite.title),
  );
  assert.ok(en.every((favorite) => favorite.keywords.every((keyword) => /^[\x20-\x7e]+$/.test(keyword))));
  assert.deepEqual(en.find((favorite) => favorite.title === "Google Calendar").keywords, ["calendar", "gcal"]);
});

// localize.js は data-i18n の文言の `…` をコードの見た目で出す。t() や属性に入る文言では ` がそのまま出てしまう。
test("` を含む文言は対になっていて、HTML の data-i18n でだけ使う", () => {
  const html = ["palette.html", "options.html"].map(read).join("\n");
  for (const locale of LOCALES) {
    for (const [key, { message }] of Object.entries(loadMessages(locale))) {
      if (!message.includes("`")) continue;
      assert.equal(message.split("`").length % 2, 1, `${locale} ${key}`);
      assert.ok(html.includes(`data-i18n="${key}"`), `${locale} ${key}`);
    }
  }
});
