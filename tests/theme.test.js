import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTheme, colorScheme, normalizeTheme, themeAttribute } from "../extension/theme.js";

test("知らない値や未設定はシステムに合わせる", () => {
  assert.equal(normalizeTheme(undefined), "system");
  assert.equal(normalizeTheme("sepia"), "system");
  assert.equal(normalizeTheme(""), "system");
  assert.equal(normalizeTheme("light"), "light");
  assert.equal(normalizeTheme("dark"), "dark");
});

test("color-scheme は選んだテーマだけにし、システムに合わせるときは両方にする", () => {
  assert.equal(colorScheme("system"), "light dark");
  assert.equal(colorScheme("light"), "light");
  assert.equal(colorScheme("dark"), "dark");
  assert.equal(colorScheme("sepia"), "light dark");
});

test("システムに合わせるときは data-theme を付けない", () => {
  assert.equal(themeAttribute("system"), null);
  assert.equal(themeAttribute(undefined), null);
  assert.equal(themeAttribute("light"), "light");
  assert.equal(themeAttribute("dark"), "dark");
});

test("applyTheme は data-theme を付け替え、システムに戻すと外す", () => {
  const root = { dataset: {} };
  applyTheme("dark", root);
  assert.equal(root.dataset.theme, "dark");
  applyTheme("light", root);
  assert.equal(root.dataset.theme, "light");
  applyTheme("system", root);
  assert.equal("theme" in root.dataset, false);
});
