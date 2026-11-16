import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { HOST_ORIGIN, launch, saveScreenshot } from "../support/browser.js";

describe("例ベース", () => {
  describe("他のサイトへの埋め込み", () => {
    // palette.html は重ねるために全サイトへ公開しているので、URL を知っていればどのサイトからでも iframe で埋め込める。
    // 埋め込まれたパレットが動くと、そのサイトにタブや履歴が見え、クリックを誘われて操作されるおそれがある。

    let browser;
    let page;
    before(async () => (browser = await launch()));
    after(() => browser.close());
    afterEach(async (t) => {
      if (!t.passed) await saveScreenshot(page, "example", t.name);
    });

    // サイトから読み込める palette.html の URL。use_dynamic_url により、拡張機能の ID の代わりに起動ごとに変わる値が入る。
    // ここではテストのために Service Worker から受け取るが、サイトはこの値を知らない。
    const embedUrl = (search = "") => browser.sw.evaluate((search) => chrome.runtime.getURL(`palette.html${search}`), search);

    // 他のサイトのページに iframe でパレットを埋め込み、読み込みが終わったフレームを返す。
    // フレームの URL は拡張機能の ID で報告されるので、パスと引数（loaded）で探す。
    async function embed(page, src, loaded) {
      const before = new Set(page.frames());
      await page.evaluate((src) => {
        const frame = document.createElement("iframe");
        frame.src = src;
        document.body.append(frame);
      }, src);
      for (;;) {
        const frame = page.frames().find((f) => !before.has(f) && f.url().endsWith(loaded));
        if (frame) {
          await frame.waitForLoadState("load");
          return frame;
        }
        await page.waitForTimeout(50);
      }
    }

    // 起動していれば候補が出るので、しばらく待っても出ないことを確かめる。
    async function assertNotRunning(frame) {
      await frame.page().waitForTimeout(1000);
      assert.equal(await frame.locator("#results li").count(), 0);
    }

    test("他のサイトから、拡張機能の ID の URL で palette.html を読み込めない", async () => {
      page = await browser.openPage("Evil Page", "https://evil.test");
      // 読み込めると、サイトが拡張機能を入れているか調べられる。
      const status = await page.evaluate(async (url) => {
        try {
          return (await fetch(url)).status;
        } catch {
          return "blocked";
        }
      }, browser.extensionUrl("palette.html"));
      assert.equal(status, "blocked");
    });

    test("他のサイトに埋め込まれたパレットは動かない", async () => {
      page = await browser.openPage("Evil Page", "https://evil.test");
      // 引数なしの palette.html は ?focus へ移ってから止まる。
      await assertNotRunning(await embed(page, await embedUrl(), "/palette.html?focus"));
      await assertNotRunning(await embed(page, await embedUrl("?focus"), "/palette.html?focus"));
    });

    test("一度使った合言葉では、他のサイトに埋め込んでも動かない", async () => {
      const host = await browser.openPage("Host Page", HOST_ORIGIN);
      await browser.openOverlay(host);
      const overlay = await browser.overlayFrame(host);
      await overlay.locator("#results li").first().waitFor();
      const { search } = new URL(overlay.url());

      page = await browser.openPage("Evil Page", "https://evil.test");
      await assertNotRunning(await embed(page, await embedUrl(search), `/palette.html${search}`));
    });
  });
});
