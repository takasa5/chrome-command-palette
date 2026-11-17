// ストアの小さいプロモーション タイル（440×280）を、言語ごとに docs/store/<lang>/promo-small.png に書き出す。
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const svg = readFileSync(join(root, "icon.svg"), "utf8");
const out = join(root, "docs", "store");

// 下の一行は言語ごとに変える。
const TAGLINES = {
  ja: "<kbd>⌘T</kbd> でタブ、ブックマーク、履歴をまとめて検索",
  en: "<kbd>⌘T</kbd> to search tabs, bookmarks, and history",
};

const html = (tagline) => `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; }
  body {
    width: 440px;
    height: 280px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    background: linear-gradient(160deg, #24324f, #1a1f2e);
    color: #f3f4f6;
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
  }
  svg { width: 88px; height: 88px; }
  h1 { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: 0.01em; }
  p { margin: 0; color: #b8c4e0; font-size: 15px; }
  kbd { padding: 1px 7px; border: 1px solid #5b6b91; border-radius: 5px; font: inherit; color: #f3f4f6; }
</style>
${svg}
<h1>Command Palette</h1>
<p>${tagline}</p>`;

const browser = await chromium.launch({ channel: "chromium" });
try {
  const page = await browser.newPage({ viewport: { width: 440, height: 280 } });
  for (const [lang, tagline] of Object.entries(TAGLINES)) {
    mkdirSync(join(out, lang), { recursive: true });
    await page.setContent(html(tagline));
    await page.screenshot({ path: join(out, lang, "promo-small.png") });
  }
} finally {
  await browser.close();
}
