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

    test("履歴の候補で Shift+Delete を押すと、パレットを閉じずに履歴と候補から消す", async () => {
      const url = pageUrl("Forget Me", "https://forget.example.test");
      await browser.sw.evaluate((url) => chrome.history.addUrl({ url }), url);
      page = await browser.openPalette();

      await page.keyboard.type("forget");
      await page.locator('#results li[aria-selected="true"] .kind', { hasText: "履歴" }).waitFor();
      await page.keyboard.press("Shift+Delete");

      await page.locator("#results li .subtitle", { hasText: "forget.example.test" }).waitFor({ state: "detached" });
      assert.equal(await page.inputValue("#query"), "forget");
      assert.equal(await page.locator('#results li[aria-selected="true"]').count(), 1);
      const visits = await browser.sw.evaluate((url) => chrome.history.getVisits({ url }), url);
      assert.equal(visits.length, 0);
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

    // パレットのタブも「閉じたタブ」に記録されるので、それを飛ばしてページを開き直す。
    // パレットかどうかはタブの URL で見分けるので、拡張機能の URL の扱いが変わると壊れる（use_dynamic_url など）。
    test("閉じたタブを開き直すコマンドは、パレットではなく閉じたページを開き直す", async () => {
      const closedPage = await browser.openPage("Closed Page");
      await browser.sw.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        await chrome.tabs.remove(tab.id);
      }, closedPage.url());
      page = await browser.openPalette();
      await pressToClose(page, "Escape");

      page = await browser.openPalette();
      await page.keyboard.type("reopen");
      await page.locator('#results li[aria-selected="true"] .title', { hasText: /^(Reopen Closed Tab|閉じたタブを開き直す)$/ }).waitFor();
      await pressToClose(page, "Enter");

      // タイトルではなく URL で確かめる。Edge は開き直したタブを読み込む途中で、一時的にタイトルをホスト名にするため。
      const active = await browser.activeTab();
      assert.equal(active.url, pageUrl("Closed Page"));
    });

    // 同じページは履歴にもあるが、閉じたタブとして出し、選ぶと sessions.restore で元のタブを戻す。
    test("最近閉じたタブを検索して Enter で復元する", async () => {
      const closedPage = await browser.openPage("Recently Closed Notes");
      await browser.sw.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        await chrome.tabs.remove(tab.id);
      }, closedPage.url());

      page = await browser.openPalette();
      await page.keyboard.type("recently closed");
      await page.locator('#results li[aria-selected="true"] .kind', { hasText: "閉じたタブ" }).waitFor();
      await pressToClose(page, "Enter");

      const active = await browser.activeTab();
      assert.equal(active.url, pageUrl("Recently Closed Notes"));
      const titles = (await browser.tabs()).map((tab) => tab.title);
      assert.ok(!titles.includes("コマンドパレット"));
    });
  });
});
