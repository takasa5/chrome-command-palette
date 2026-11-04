import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { launch, screenshotOnFailure } from "./helpers.js";

let browser;
let page;
before(async () => (browser = await launch()));
after(() => browser.close());
afterEach((t) => screenshotOnFailure(t, page));

test("新しいタブで開くと入力欄にフォーカスがある", async () => {
  page = await browser.openPalette();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "query");
});

test("タブを検索して Enter でそのタブへ移る", async () => {
  await browser.openPage("Alpha Notes");
  await browser.openPage("Beta Board");
  page = await browser.openPalette();

  await page.keyboard.type("alpha");
  const selected = page.locator('#results li[aria-selected="true"] .title');
  await selected.filter({ hasText: "Alpha Notes" }).waitFor();
  await page.keyboard.press("Enter");

  await page.waitForEvent("close");
  const active = await browser.activeTab();
  assert.equal(active.title, "Alpha Notes");
});
