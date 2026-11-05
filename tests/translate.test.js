import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { baseLanguage, canTranslate, originPattern, pickSourceLanguage } from "../translate.js";

// translate-page.js は module ではないので、別の環境で読み込んで関数を取り出す。
const sandbox = {};
vm.runInNewContext(readFileSync(new URL("../translate-page.js", import.meta.url), "utf8"), sandbox);
const { splitWhitespace, hasWords, chunk } = sandbox.paletteTranslation;

test("baseLanguage は地域を除いて小文字にする", () => {
  assert.equal(baseLanguage("en-US"), "en");
  assert.equal(baseLanguage("ZH_tw"), "zh");
  assert.equal(baseLanguage("ja"), "ja");
  assert.equal(baseLanguage(""), "");
  assert.equal(baseLanguage(undefined), "");
});

test("pickSourceLanguage は確かな判定結果を使う", () => {
  const detected = [{ detectedLanguage: "fr", confidence: 0.9 }, { detectedLanguage: "en", confidence: 0.05 }];
  assert.equal(pickSourceLanguage({ detected, pageLanguage: "en" }), "fr");
});

test("pickSourceLanguage は判定が不確かなら lang 属性を使う", () => {
  assert.equal(pickSourceLanguage({ detected: [{ detectedLanguage: "fr", confidence: 0.3 }], pageLanguage: "en-GB" }), "en");
  assert.equal(pickSourceLanguage({ detected: [{ detectedLanguage: "und", confidence: 1 }], pageLanguage: "de" }), "de");
  assert.equal(pickSourceLanguage({ pageLanguage: "ko" }), "ko");
});

test("pickSourceLanguage はどちらもなければ null を返す", () => {
  assert.equal(pickSourceLanguage({ detected: [], pageLanguage: "" }), null);
});

test("canTranslate は http、https、file のページだけを受け付ける", () => {
  assert.equal(canTranslate("https://example.com/"), true);
  assert.equal(canTranslate("http://example.com/"), true);
  assert.equal(canTranslate("file:///tmp/a.html"), true);
  assert.equal(canTranslate("chrome://settings"), false);
  assert.equal(canTranslate("chrome-extension://abc/palette.html"), false);
  assert.equal(canTranslate(undefined), false);
});

test("originPattern はそのサイトだけを指す", () => {
  assert.equal(originPattern("https://example.com:8080/a?b"), "https://example.com:8080/*");
  assert.equal(originPattern("file:///tmp/a.html"), "file:///*");
});

test("splitWhitespace は前後の空白を取り分ける", () => {
  assert.deepEqual({ ...splitWhitespace("  Hello world\n") }, { lead: "  ", core: "Hello world", trail: "\n" });
  assert.deepEqual({ ...splitWhitespace("Hello") }, { lead: "", core: "Hello", trail: "" });
});

test("hasWords は文字を含むテキストだけを訳す対象にする", () => {
  assert.equal(hasWords("Hello"), true);
  assert.equal(hasWords("こんにちは"), true);
  assert.equal(hasWords(" 12:30 / 100% "), false);
  assert.equal(hasWords("\n  "), false);
});

test("chunk は決まった数ずつに分ける", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(chunk([1, 2, 3, 4, 5], 2))), [[1, 2], [3, 4], [5]]);
});
