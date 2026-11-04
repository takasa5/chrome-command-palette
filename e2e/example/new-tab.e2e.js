import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { launch, pageUrl, pressToClose, saveScreenshot } from "../support/browser.js";

describe("例ベース", () => {
  describe("新しいタブで開く", () => {
    let browser;
    let page;
    before(async () => (browser = await launch()));
    after(() => browser.close());
    afterEach(async (t) => {
      if (!t.passed) await saveScreenshot(page, "example", t.name);
    });

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
      await pressToClose(page, "Enter");

      const active = await browser.activeTab();
      assert.equal(active.title, "Alpha Notes");
    });

    test("履歴を選ぶとパレットのタブでそのページを開く", async () => {
      const url = pageUrl("Release Notes", "https://docs.example.test");
      await browser.sw.evaluate((url) => chrome.history.addUrl({ url }), url);
      page = await browser.openPalette();

      await page.keyboard.type("release");
      await page.locator('#results li[aria-selected="true"] .kind', { hasText: "履歴" }).waitFor();
      await page.keyboard.press("Enter");

      await page.waitForURL(url);
      assert.equal(await page.title(), "Release Notes");
    });

    test("タブを閉じるコマンドは直前に見ていたタブを閉じる", async () => {
      await browser.openPage("Keep Page");
      await browser.openPage("Close Me");
      page = await browser.openPalette();

      await page.keyboard.type("close tab");
      await page.locator('#results li[aria-selected="true"] .title', { hasText: /^(Close Tab|タブを閉じる)$/ }).waitFor();
      await pressToClose(page, "Enter");

      const titles = (await browser.tabs()).map((tab) => tab.title);
      assert.ok(!titles.includes("Close Me"));
      assert.ok(titles.includes("Keep Page"));
    });
  });
});
