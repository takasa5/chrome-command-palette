// 実物の拡張機能を操作して、画面とタブの状態を .work/ に保存する。
import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const here = import.meta.dirname;
const ext = resolve(here, "../..");
const work = join(here, ".work");
const raw = join(work, "raw");
const profile = mkdtempSync(join(tmpdir(), "command-palette-demo-"));
rmSync(raw, { recursive: true, force: true });
mkdirSync(raw, { recursive: true });

const OPEN_TABS = [
  "https://github.com/takasa5/chrome-command-palette",
  "https://news.ycombinator.com/",
  "https://www.youtube.com/",
  "https://developer.mozilla.org/ja/",
];
// 仕事 / フロントエンド / ライブラリ のように階層をたどれるようにする。
const BOOKMARK_TREE = {
  仕事: {
    フロントエンド: {
      ライブラリ: { React: "https://github.com/facebook/react", "Next.js": "https://github.com/vercel/next.js", Playwright: "https://github.com/microsoft/playwright" },
      "MDN Web Docs": "https://developer.mozilla.org/ja/",
      "Can I use": "https://caniuse.com/",
    },
    バックエンド: { "Node.js": "https://github.com/nodejs/node", Express: "https://github.com/expressjs/express" },
    インフラ: { Kubernetes: "https://github.com/kubernetes/kubernetes" },
  },
};
const collectUrls = (tree) => Object.values(tree).flatMap((v) => (typeof v === "string" ? [v] : collectUrls(v)));

const ctx = await chromium.launchPersistentContext(profile, {
  // 既定の headless shell は拡張機能を読み込めない。
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--lang=ja"],
  viewport: { width: 720, height: 470 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  locale: "ja-JP",
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const extId = new URL(sw.url()).host;

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const blank = ctx.pages()[0];

// favicon は開いたことのあるページでしか引けないので、ブックマーク先も一度開く。
for (const url of collectUrls(BOOKMARK_TREE)) {
  await blank.goto(url, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await settle(800);
}

const tabs = [];
for (const url of OPEN_TABS) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 30000 }).catch((e) => console.log("goto", url, e.message));
  await settle(1500);
  tabs.push(page);
}
await blank.close();
for (const page of tabs) {
  await page.bringToFront();
  await settle(150);
}

await sw.evaluate(async ([tree]) => {
  const add = async (parentId, nodes) => {
    for (const [title, value] of Object.entries(nodes)) {
      if (typeof value === "string") await chrome.bookmarks.create({ parentId, title, url: value });
      else await add((await chrome.bookmarks.create({ parentId, title })).id, value);
    }
  };
  await add("1", tree);
  await chrome.storage.sync.set({ siteSearchEngines: [{ keyword: "gh", name: "GitHub", url: "https://github.com/search?q=%s" }] });
}, [BOOKMARK_TREE]);

const timeline = [];
let n = 0;

async function snap(page, dur, meta = {}) {
  const shot = `${String(n++).padStart(3, "0")}.png`;
  await page.screenshot({ path: join(raw, shot), caret: "initial" });
  const openTabs = await sw.evaluate(() => chrome.tabs.query({}).then((list) => list.map(({ id, url, pendingUrl, title, active, index }) => ({ id, url: url || pendingUrl, title, active, index }))));
  timeline.push({ shot, dur, tabs: openTabs.sort((a, b) => a.index - b.index), ...meta });
}

async function openPalette() {
  const opened = ctx.waitForEvent("page");
  await sw.evaluate(() => chrome.tabs.create({}));
  const page = await opened;
  await page.waitForURL(/palette\.html\?focus/);
  await page.waitForSelector("#results li");
  await settle(400);
  return page;
}

async function type(page, text, meta) {
  for (const char of text) {
    await page.keyboard.type(char);
    await settle(30);
    await snap(page, 0.07, meta);
  }
  // 履歴とブックマークの検索が返るのを待つ。
  await settle(350);
}

async function clear(page) {
  await page.evaluate(() => document.getElementById("query").select());
  await page.keyboard.press("Backspace");
  await settle(200);
}

const CAP = {
  open: "「新しいタブ」を置き換え",
  tab: "開いているタブへすぐ移動",
  folder: "ブックマークをフォルダ階層でたどる",
  site: "キーワード + Tab でサイト内検索",
};

// 1. いま見ているページから Cmd+T
const startPage = tabs.at(-1);
await startPage.bringToFront();
await settle(300);
await snap(startPage, 0.6, { caption: CAP.open });
let palette = await openPalette();
await snap(palette, 1.0, { caption: CAP.open, keys: ["⌘", "T"], event: "open" });

// 2. タブ移動
await type(palette, "github", { caption: CAP.tab });
await snap(palette, 0.6, { caption: CAP.tab });
await palette.keyboard.press("Enter");
await settle(500);
const repo = tabs[0];
await snap(repo, 0.8, { caption: CAP.tab, keys: ["Enter"], event: "switch" });

// 3. フォルダ階層をたどる
palette = await openPalette();
await snap(palette, 0.45, { caption: CAP.folder, keys: ["⌘", "T"], event: "open" });
await type(palette, "仕事", { caption: CAP.folder });
await snap(palette, 0.8, { caption: CAP.folder });
await palette.keyboard.press("Enter");
await settle(250);
await snap(palette, 0.9, { caption: CAP.folder, keys: ["Enter"], event: "key" });
await palette.keyboard.press("Enter");
await settle(250);
await snap(palette, 1.2, { caption: CAP.folder, keys: ["Enter"], event: "key" });

// 4. サイト内検索。フォルダから出てから入力する。
await palette.keyboard.press("Backspace");
await palette.keyboard.press("Backspace");
await settle(100);
await clear(palette);
await type(palette, "gh", { caption: CAP.site });
await snap(palette, 0.5, { caption: CAP.site });
await palette.keyboard.press("Tab");
await settle(200);
await snap(palette, 0.35, { caption: CAP.site, keys: ["Tab"], event: "key" });
await type(palette, "playwright", { caption: CAP.site });
await snap(palette, 0.5, { caption: CAP.site });
await palette.keyboard.press("Enter");
await palette.waitForURL(/github\.com\/search/);
await palette.waitForLoadState("load");
await settle(2500);
await snap(palette, 1.8, { caption: CAP.site, keys: ["Enter"], event: "switch" });

// タブ列に出す favicon を拡張機能のページから読む。
const reader = await ctx.newPage();
await reader.goto(`chrome-extension://${extId}/options.html`);
const favicons = await reader.evaluate(async (urls) => {
  const entries = await Promise.all(urls.map(async (url) => {
    const icon = new URL(chrome.runtime.getURL("/_favicon/"));
    icon.searchParams.set("pageUrl", url);
    icon.searchParams.set("size", "32");
    const blob = await (await fetch(icon)).blob();
    const data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    return [url, data];
  }));
  return Object.fromEntries(entries);
}, [...new Set(timeline.flatMap((f) => f.tabs.map((t) => t.url)))].filter((u) => u.startsWith("http")));

writeFileSync(join(work, "timeline.json"), JSON.stringify({ extId, favicons, frames: timeline }, null, 1));
console.log("frames", timeline.length, "seconds", timeline.reduce((sum, f) => sum + f.dur, 0).toFixed(1));
console.log(timeline.at(-1).tabs.map((t) => `${t.title} | ${t.url}`).join("\n"));
await ctx.close();
rmSync(profile, { recursive: true, force: true });
