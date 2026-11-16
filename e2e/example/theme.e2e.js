import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { inflateSync } from "node:zlib";
import { HOST_ORIGIN, launch, saveScreenshot } from "../support/browser.js";

// Playwright は OS の設定をライトとして開くので、ダークになっていれば選んだテーマが効いている。
const DARK_BG = "rgb(24, 24, 27)";

// 画面の 1 点の色を [r, g, b] で返す。閉じた Shadow DOM の iframe の中は DOM から読めないので、画面を撮って読む。
async function pixel(page, x, y) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const chunks = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.toString("ascii", at + 4, at + 8) === "IDAT") chunks.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  // 1 行目の先頭はフィルタの種類。1 画素だけなので、続く 3 バイトがそのまま色になる。
  return [...inflateSync(Buffer.concat(chunks)).subarray(1, 4)];
}

describe("例ベース", () => {
  describe("テーマ", () => {
    let browser;
    let page;
    before(async () => (browser = await launch()));
    after(() => browser.close());
    afterEach(async (t) => {
      if (!t.passed) await saveScreenshot(page, "example", t.name);
    });

    const background = (target) => target.evaluate(() => getComputedStyle(document.body).backgroundColor);

    test("設定でダークを選ぶと、設定画面と新しいタブがダークになる", async () => {
      page = await browser.ctx.newPage();
      await page.goto(browser.extensionUrl("options.html"));
      await page.selectOption("#theme", "dark");
      await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
      assert.equal(await background(page), DARK_BG);

      page = await browser.openPalette();
      assert.equal(await background(page), DARK_BG);
    });

    test("ダークを選ぶと、ページに重ねたパレットもダークになり、ページは透けて見える", async () => {
      await browser.sw.evaluate(() => chrome.storage.sync.set({ theme: "dark" }));
      page = await browser.openPage("Host Page", HOST_ORIGIN);
      await browser.openOverlay(page);
      const frame = await browser.overlayFrame(page);
      await frame.locator("#results li").first().waitFor();

      assert.equal(await frame.evaluate(() => document.documentElement.dataset.theme), "dark");
      assert.equal(await frame.evaluate(() => getComputedStyle(document.querySelector(".palette")).backgroundColor), "rgb(36, 36, 40)");
      // パレットの外は、白いページを少し暗くした色になる。iframe の color-scheme がずれると、Chrome が不透明に塗る。
      const [r, g, b] = await pixel(page, 4, 4);
      assert.ok(r > 150 && g > 150 && b > 150, `パレットの外の色: ${[r, g, b]}`);
    });
  });
});
