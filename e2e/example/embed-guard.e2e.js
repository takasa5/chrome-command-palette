import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { launch, saveScreenshot } from "../support/browser.js";

describe("例ベース", () => {
  describe("他のサイトへの埋め込み", () => {
    // palette.html は重ねるために全サイトへ公開しているので、どのサイトからでも iframe で埋め込める。
    // 埋め込まれたパレットが動くと、そのサイトにタブや履歴が見え、クリックを誘われて操作されるおそれがある。

    let browser;
    let page;
    before(async () => (browser = await launch()));
    after(() => browser.close());
    afterEach(async (t) => {
      if (!t.passed) await saveScreenshot(page, "example", t.name);
    });

    // 他のサイトのページに iframe でパレットを埋め込み、読み込みが終わったフレームを返す。
    async function embed(page, src, loaded = src) {
      await page.evaluate((src) => {
        const frame = document.createElement("iframe");
        frame.src = src;
        document.body.append(frame);
      }, src);
      for (;;) {
        const frame = page.frames().find((f) => f.url() === loaded);
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

    test("他のサイトに埋め込まれたパレットは動かない", async () => {
      page = await browser.openPage("Evil Page", "https://evil.test");
      const focus = browser.extensionUrl("palette.html?focus");
      // 引数なしの palette.html は ?focus へ移ってから止まる。
      await assertNotRunning(await embed(page, browser.extensionUrl("palette.html"), focus));
      await assertNotRunning(await embed(page, focus));
    });

    test("一度使った合言葉では、他のサイトに埋め込んでも動かない", async () => {
      const host = await browser.openPage("Host Page", "https://x.com");
      await browser.openOverlay(host);
      const overlay = await browser.overlayFrame(host);
      await overlay.locator("#results li").first().waitFor();

      page = await browser.openPage("Evil Page", "https://evil.test");
      await assertNotRunning(await embed(page, overlay.url()));
    });
  });
});
