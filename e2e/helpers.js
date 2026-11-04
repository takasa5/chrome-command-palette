// 拡張機能を読み込んだ Chromium を起動し、パレットを操作するための共通処理。
import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ext = resolve(import.meta.dirname, "..");
const output = join(import.meta.dirname, ".output");

// 外部サイトにはつながず、タイトルだけのページを返すサーバーを開いておくタブに使う。
async function startServer() {
  const server = createServer((req, res) => {
    const title = decodeURIComponent(new URL(req.url, "http://localhost").searchParams.get("title") ?? "page");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>${title}</title><h1>${title}</h1>`);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "command-palette-e2e-"));
  const { server, origin } = await startServer();
  const ctx = await chromium.launchPersistentContext(profile, {
    // 既定の headless shell は拡張機能を読み込めない。
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  await ctx.route(/^https?:/, (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));

  return {
    ctx,
    sw,
    // テスト用のページを開く。URL の title がそのままページのタイトルになる。
    async openPage(title) {
      const page = await ctx.newPage();
      await page.goto(`${origin}/?title=${encodeURIComponent(title)}`);
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
    activeTab: () => sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]),
    async close() {
      await ctx.close();
      server.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

// 失敗したテストの画面を残し、CI の artifact から見られるようにする。
export async function screenshotOnFailure(t, page) {
  if (!page || page.isClosed() || t.passed) return;
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, `${t.name}.png`) });
}
