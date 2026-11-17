// ストアのプロモーション タイルを、言語ごとに docs/store/<lang>/ に書き出す。
// 小さいタイル（440×280）は promo-small.png、大きいタイル（1400×560）は promo-large.png。
// 大きいタイルにはその言語の screenshot-1.png のパレットを切り抜いて載せるので、screenshots.js のあとに動かす。
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const svg = readFileSync(join(root, "icon.svg"), "utf8");
const out = join(root, "docs", "store");

// 名前の下の一行は言語ごとに変える。
const TAGLINES = {
  ja: "<kbd>⌘T</kbd> でタブ、ブックマーク、履歴をまとめて検索",
  en: "<kbd>⌘T</kbd> to search tabs, bookmarks, and history",
};

const base = `
  html, body { margin: 0; }
  body {
    background: linear-gradient(160deg, #24324f, #1a1f2e);
    color: #f3f4f6;
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
  }
  h1 { margin: 0; font-weight: 700; letter-spacing: 0.01em; }
  p { margin: 0; color: #b8c4e0; }
  kbd { padding: 1px 0.45em; border: 1px solid #5b6b91; border-radius: 0.33em; font: inherit; color: #f3f4f6; }`;

const small = (tagline) => `<!doctype html>
<meta charset="utf-8">
<style>${base}
  body { width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
  svg { width: 88px; height: 88px; }
  h1 { font-size: 30px; }
  p { font-size: 15px; }
</style>
${svg}
<h1>Command Palette</h1>
<p>${tagline}</p>`;

// screenshot-1.png（1280×800）のうち、パレットが写っている範囲。
const PALETTE = { x: 258, y: 307, width: 766, height: 416 };

const large = (tagline, shot, lang) => `<!doctype html>
<html lang="${lang}">
<meta charset="utf-8">
<style>${base}
  body { position: relative; width: 1400px; height: 560px; overflow: hidden; }
  .text { position: absolute; left: 80px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  svg { width: 112px; height: 112px; }
  h1 { font-size: 54px; }
  p { font-size: 26px; line-height: 1.5; word-break: auto-phrase; }
  .shot { position: absolute; left: 594px; top: 72px; width: ${PALETTE.width}px; height: ${PALETTE.height}px; border-radius: 12px; overflow: hidden;
    background: url(${shot}) -${PALETTE.x}px -${PALETTE.y}px no-repeat; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45); }
</style>
<div class="text">
  ${svg}
  <h1>Command Palette</h1>
  <p>${tagline}</p>
</div>
<div class="shot"></div>`;

const browser = await chromium.launch({ channel: "chromium" });
try {
  for (const [lang, tagline] of Object.entries(TAGLINES)) {
    mkdirSync(join(out, lang), { recursive: true });

    const smallPage = await browser.newPage({ viewport: { width: 440, height: 280 } });
    await smallPage.setContent(small(tagline));
    await smallPage.screenshot({ path: join(out, lang, "promo-small.png") });
    await smallPage.close();

    const shot = `data:image/png;base64,${readFileSync(join(out, lang, "screenshot-1.png")).toString("base64")}`;
    const largePage = await browser.newPage({ viewport: { width: 1400, height: 560 } });
    await largePage.setContent(large(tagline, shot, lang));
    await largePage.screenshot({ path: join(out, lang, "promo-large.png") });
    await largePage.close();
  }
} finally {
  await browser.close();
}
