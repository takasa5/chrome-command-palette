// 拡張機能を読み込んだ Chromium を起動し、パレットを操作するための共通処理。
import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ext = resolve(import.meta.dirname, "..");
const output = join(import.meta.dirname, ".output");

// 外部サイトにはつながず、どの URL にもタイトルだけのページを返す。
// URL の title がそのままページのタイトルになる。
function fakePage(route) {
  const title = new URL(route.request().url()).searchParams.get("title") ?? "page";
  const escaped = title.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);
  return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><title>${escaped}</title><h1>${escaped}</h1>` });
}

export const pageUrl = (title, origin = "https://example.test") => `${origin}/?title=${encodeURIComponent(title)}`;

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "command-palette-e2e-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    // 既定の headless shell は拡張機能を読み込めない。
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  await ctx.route(/^https?:/, fakePage);
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));

  const extId = new URL(sw.url()).host;

  return {
    ctx,
    sw,
    extensionUrl: (path) => `chrome-extension://${extId}/${path}`,
    async openPage(title, origin) {
      const page = await ctx.newPage();
      await page.goto(pageUrl(title, origin));
      return page;
    },
    // Cmd+T と同じく新しいタブを開き、パレットが表示されるのを待つ。
    async openPalette() {
      const opened = ctx.waitForEvent("page");
      await sw.evaluate(() => chrome.tabs.create({}));
      const page = await opened;
      await page.waitForURL(/palette\.html\?focus/);
      await page.waitForSelector("#results li");
      return page;
    },
    // Cmd+Shift+S と同じく page の上にパレットを重ねる。ブラウザのショートカットは Playwright から押せないので、onCommand を直接起こす。
    // activeTab の権限はショートカットを押したときにしか付かないので、page は host_permissions にある https://x.com に置く。
    async openOverlay(page) {
      await page.bringToFront();
      await sw.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        chrome.commands.onCommand.dispatch("open-palette", tab);
      });
      await page.waitForSelector("command-palette-overlay", { state: "attached" });
    },
    // 重ねたパレットの iframe。閉じた Shadow DOM の中にあるので、フレームの一覧から探す。
    async overlayFrame(page) {
      for (;;) {
        const frame = page.frames().find((f) => f.url().includes("palette.html?overlay"));
        if (frame) return frame;
        await page.waitForTimeout(50);
      }
    },
    tabs: () => sw.evaluate(() => chrome.tabs.query({ lastFocusedWindow: true })),
    activeTab: () => sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]),
    async close() {
      await ctx.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

// page を閉じるキーを押す。press は keydown と keyup を続けて送るので、keydown で閉じると keyup が閉じたページに届いて失敗する。
// 押すだけにして、閉じたのを待つ。
export async function pressToClose(page, key) {
  const closed = page.waitForEvent("close");
  await page.keyboard.down(key).catch((e) => {
    if (!page.isClosed()) throw e;
  });
  await closed;
}

// 失敗したテストの画面を残し、CI の artifact から見られるようにする。
export async function screenshotOnFailure(t, page) {
  if (!page || page.isClosed() || t.passed) return;
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, `${t.name}.png`) });
}
