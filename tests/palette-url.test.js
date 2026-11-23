import { test } from "node:test";
import assert from "node:assert/strict";
import { isPaletteTab, paletteUrlOf } from "../extension/palette-url.js";

const paletteUrl = paletteUrlOf("abc");

test("拡張機能の ID からパレットの URL を作る", () => {
  assert.equal(paletteUrl, "chrome-extension://abc/palette.html");
});

test("パレットの URL で始まるタブをパレットとみなす", () => {
  assert.equal(isPaletteTab({ url: "chrome-extension://abc/palette.html?focus" }, paletteUrl), true);
  assert.equal(isPaletteTab({ url: "chrome-extension://abc/palette.html?overlay=x" }, paletteUrl), true);
});

test("他のページや別の拡張機能のパレットはパレットとみなさない", () => {
  assert.equal(isPaletteTab({ url: "https://example.com/" }, paletteUrl), false);
  assert.equal(isPaletteTab({ url: "chrome-extension://other/palette.html" }, paletteUrl), false);
  assert.equal(isPaletteTab({ url: "chrome-extension://abc/options.html" }, paletteUrl), false);
});

test("url がないタブは pendingUrl で判定する", () => {
  assert.equal(isPaletteTab({ pendingUrl: "chrome-extension://abc/palette.html?focus" }, paletteUrl), true);
  assert.equal(isPaletteTab({ pendingUrl: "https://example.com/" }, paletteUrl), false);
  assert.equal(isPaletteTab({}, paletteUrl), false);
});

test("url があれば pendingUrl より url を使う", () => {
  assert.equal(isPaletteTab({ url: "https://example.com/", pendingUrl: "chrome-extension://abc/palette.html" }, paletteUrl), false);
});
