// icon.svg から、manifest.json の icons に使う PNG を icons/ に書き出す。
// ストアは SVG のアイコンを受け付けない。icon.svg を変えたら作り直す。
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const svg = readFileSync(join(root, "icon.svg"), "utf8");
const out = join(root, "icons");

// ストアの 128px は、絵を 96px にして周りに 16px の透明な余白を取る決まりになっている。
// ツールバーなどの小さいサイズは余白を取らない。
const SIZES = [
  { size: 16, padding: 0 },
  { size: 32, padding: 0 },
  { size: 48, padding: 0 },
  { size: 128, padding: 16 },
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
try {
  for (const { size, padding } of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const inner = size - padding * 2;
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${inner}px;height:${inner}px;margin:${padding}px}</style>${svg}`,
    );
    await page.screenshot({ path: join(out, `icon-${size}.png`), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
