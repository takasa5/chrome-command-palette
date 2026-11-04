import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { launch, pageUrl, pressToClose, pressToCloseOverlay, saveScreenshot } from "../support/browser.js";

describe("例ベース", () => {
  describe("ページに重ねて開く", () => {
    // 重ねて開くには host_permissions のあるページが要る。
    const HOST = "https://x.com";

    let browser;
    let page;
    before(async () => (browser = await launch()));
    after(() => browser.close());
    afterEach(async (t) => {
      if (!t.passed) await saveScreenshot(page, "example", t.name);
    });

    const overlayOpen = (page) => page.evaluate(() => document.querySelector("command-palette-overlay") !== null);

    test("重ねたパレットで検索し、Enter でタブへ移る", async () => {
      // 入力しなければ直近の Beta Board が先頭に来るので、検索が効いたかで区別できる。
      await browser.openPage("Alpha Notes");
      await browser.openPage("Beta Board");
      page = await browser.openPage("Host Page", HOST);
      await browser.openOverlay(page);
      const frame = await browser.overlayFrame(page);
      await frame.locator("#results li").first().waitFor();

      await page.keyboard.type("alpha");
      await frame.locator('#results li[aria-selected="true"] .title', { hasText: "Alpha Notes" }).waitFor();
      await pressToCloseOverlay(page, "Enter");

      assert.equal((await browser.activeTab()).title, "Alpha Notes");
    });

    test("ページを開くと見ていたページは残し、隣のタブで開く", async () => {
      const url = pageUrl("Release Notes", "https://docs.example.test");
      await browser.sw.evaluate((url) => chrome.history.addUrl({ url }), url);
      page = await browser.openPage("Reading Page", HOST);
      await browser.openOverlay(page);
      const frame = await browser.overlayFrame(page);
      await frame.locator("#results li").first().waitFor();

      const opened = browser.ctx.waitForEvent("page");
      await page.keyboard.type("release");
      await frame.locator('#results li[aria-selected="true"] .kind', { hasText: "履歴" }).waitFor();
      await pressToCloseOverlay(page, "Enter");
      await (await opened).waitForURL(url);

      assert.equal(await overlayOpen(page), false);
      assert.equal(page.url(), pageUrl("Reading Page", HOST));
      const tabs = await browser.tabs();
      const host = tabs.findIndex((tab) => tab.url === page.url());
      assert.equal(tabs[host + 1].url, url);
    });

    test("タブを閉じるコマンドは重ねたページを閉じる", async () => {
      await browser.openPage("Keep Page");
      page = await browser.openPage("Close Me", HOST);
      await browser.openOverlay(page);
      const frame = await browser.overlayFrame(page);
      await frame.locator("#results li").first().waitFor();

      await page.keyboard.type("close tab");
      await frame.locator('#results li[aria-selected="true"] .title', { hasText: /^(Close Tab|タブを閉じる)$/ }).waitFor();
      await pressToClose(page, "Enter");

      const titles = (await browser.tabs()).map((tab) => tab.title);
      assert.ok(titles.includes("Keep Page"));
    });
  });
});
