// ストアに載せるスクリーンショット（1280×800）を、言語ごとに docs/store/<lang>/ に書き出す。
// パレットを撮ってから、デモ GIF と同じ見た目の台紙に載せ、何をしているかの説明と押すキーを添える。
// 外部サイトにはつながず、どの URL にもタイトルと favicon だけのページを返す。
import { chromium } from "playwright-core";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const logo = `data:image/svg+xml;base64,${readFileSync(join(root, "icon.svg")).toString("base64")}`;

// 台紙は 1280×800。パレットは台紙の窓（1080×588）にちょうど収まるよう、900×490 を 1.2 倍で撮る。
const VIEWPORT = { width: 900, height: 490 };
const SCALE = 1.2;

const SITES = {
  "github.com": { color: "#24292f", letter: "G" },
  "developer.mozilla.org": { color: "#1b1b1b", letter: "M" },
  "news.ycombinator.com": { color: "#ff6600", letter: "Y" },
  "www.youtube.com": { color: "#ff0033", letter: "▶" },
  "nodejs.org": { color: "#5fa04e", letter: "N" },
  "caniuse.com": { color: "#c9502a", letter: "C" },
  "kubernetes.io": { color: "#326ce5", letter: "K" },
};

const OPEN_TABS = [
  ["https://github.com/takasa5/chrome-command-palette", "takasa5/chrome-command-palette"],
  ["https://news.ycombinator.com/", "Hacker News"],
  ["https://www.youtube.com/", "YouTube"],
  ["https://developer.mozilla.org/docs/Web/API", "Web API | MDN"],
];

const HISTORY = [
  ["https://github.com/microsoft/playwright/issues", "Issues · microsoft/playwright"],
  ["https://github.com/notifications", "Notifications"],
  ["https://developer.mozilla.org/docs/Web/JavaScript", "JavaScript | MDN"],
];

// 言語ごとの、ブックマークのフォルダ名、コマンドを探す語、台紙の説明。
const LANGS = {
  ja: {
    folders: { work: "仕事", frontend: "フロントエンド", libraries: "ライブラリ", backend: "バックエンド", infra: "インフラ" },
    command: "閉じる",
    captions: [
      "タブ、ブックマーク、履歴をまとめて検索",
      "ブラウザの操作を日本語でも探して実行",
      "ブックマークをフォルダ階層でたどる",
      "キーワード + Tab でサイト内検索",
    ],
  },
  en: {
    folders: { work: "Work", frontend: "Frontend", libraries: "Libraries", backend: "Backend", infra: "Infrastructure" },
    command: "close",
    captions: [
      "Search tabs, bookmarks, and history at once",
      "Find and run browser actions",
      "Browse bookmarks by folder",
      "Keyword + Tab for site search",
    ],
  },
};

const bookmarkTree = ({ work, frontend, libraries, backend, infra }) => ({
  [work]: {
    [frontend]: {
      [libraries]: {
        React: "https://github.com/facebook/react",
        "Next.js": "https://github.com/vercel/next.js",
        Playwright: "https://github.com/microsoft/playwright",
      },
      "MDN Web Docs": "https://developer.mozilla.org/",
      "Can I use": "https://caniuse.com/",
    },
    [backend]: { "Node.js": "https://nodejs.org/", "GitHub Actions": "https://github.com/features/actions" },
    [infra]: { Kubernetes: "https://kubernetes.io/" },
  },
});

const collectUrls = (tree) => Object.entries(tree).flatMap(([title, value]) => (typeof value === "string" ? [[value, title]] : collectUrls(value)));
const escape = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// デモ GIF（scripts/demo/stage.html）と同じ配色の台紙。
const stage = ({ shot, caption, keys }) => `<!doctype html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1280px; height: 800px; overflow: hidden; }
  body { position: relative; background: #0b0d16; color: #fff; font: 16px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif; }
  .glow { position: absolute; inset: 0; opacity: .55;
    background: radial-gradient(860px 460px at 18% -8%, #2c3f8f 0%, transparent 70%), radial-gradient(720px 440px at 92% 0%, #55308a 0%, transparent 70%); }
  .head { position: absolute; left: 100px; right: 100px; top: 34px; height: 100px; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 8px; color: #aab3d0; font-size: 16px; font-weight: 600; letter-spacing: .02em; }
  .brand img { width: 20px; height: 20px; }
  .caption { margin-top: 6px; font-size: 40px; font-weight: 700; letter-spacing: .01em; white-space: nowrap; }
  .keys { display: flex; gap: 10px; }
  .key { min-width: 62px; height: 62px; padding: 0 16px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(#f5f6fb, #d7daea); border-radius: 13px; box-shadow: 0 5px 0 #8d93b3; color: #171a2b; font-size: 26px; font-weight: 700; }
  .window { position: absolute; left: 100px; top: 168px; width: 1080px; height: 632px; overflow: hidden;
    background: #f3f4f6; border: 1px solid #3b3e52; border-bottom: 0; border-radius: 16px 16px 0 0; }
  .strip { height: 44px; display: flex; align-items: flex-end; padding: 0 12px; background: #101116; }
  .lights { display: flex; gap: 8px; align-self: center; margin: 0 14px 0 4px; }
  .lights i { width: 12px; height: 12px; border-radius: 50%; }
  .tab { width: 200px; height: 34px; padding: 0 14px; display: flex; align-items: center; gap: 8px;
    border-radius: 10px 10px 0 0; background: #26272d; color: #f0f0f5; font-size: 13px; }
  .tab img { width: 15px; height: 15px; }
  .page { display: block; width: 1080px; height: 588px; }
</style>
<div class="glow"></div>
<div class="head">
  <div>
    <div class="brand"><img src="${logo}" alt="">Command Palette</div>
    <div class="caption">${escape(caption)}</div>
  </div>
  <div class="keys">${keys.map((k) => `<div class="key">${escape(k)}</div>`).join("")}</div>
</div>
<div class="window">
  <div class="strip">
    <div class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
    <div class="tab"><img src="${logo}" alt="">Command Palette</div>
  </div>
  <img class="page" src="${shot}" alt="">
</div>`;

async function capture(lang) {
  const { folders, command, captions } = LANGS[lang];
  const tree = bookmarkTree(folders);
  const titles = new Map([...OPEN_TABS, ...HISTORY, ...collectUrls(tree)]);
  const out = join(root, "docs", "store", lang);

  const fakeSite = (route) => {
    const url = new URL(route.request().url());
    const site = SITES[url.host] ?? { color: "#6b7280", letter: url.host[0].toUpperCase() };
    if (url.pathname === "/favicon.svg") {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${site.color}"/><text x="16" y="23" font-family="sans-serif" font-size="19" font-weight="700" fill="#fff" text-anchor="middle">${escape(site.letter)}</text></svg>`;
      return route.fulfill({ contentType: "image/svg+xml", body: svg });
    }
    const title = titles.get(url.href) ?? url.host;
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><title>${escape(title)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><h1>${escape(title)}</h1>`,
    });
  };

  // macOS の Chrome は --lang を無視してシステムの言語で文言を選ぶ。
  // 拡張機能をコピーして、撮る言語の _locales だけを残し、それを既定の言語にする。
  const ext = mkdtempSync(join(tmpdir(), "command-palette-store-ext-"));
  const SKIP = new Set(["node_modules", "scripts", "tests", "e2e", "docs", "dist", ".git", ".github", ".claude"]);
  cpSync(root, ext, { recursive: true, filter: (src) => src === root || !SKIP.has(src.slice(root.length + 1).split("/")[0]) });
  for (const locale of Object.keys(LANGS)) if (locale !== lang) rmSync(join(ext, "_locales", locale), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
  writeFileSync(join(ext, "manifest.json"), JSON.stringify({ ...manifest, default_locale: lang }, null, 2));

  const profile = mkdtempSync(join(tmpdir(), "command-palette-store-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    // 既定の headless shell は拡張機能を読み込めない。
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${lang}`, "--host-resolver-rules=MAP * ~NOTFOUND"],
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: "light",
    locale: lang === "ja" ? "ja-JP" : "en-US",
  });

  try {
    await ctx.route(/^https?:/, fakeSite);
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));

    // favicon は開いたことのあるページでしか引けないので、すべて一度開く。開いたページはそのまま履歴になる。
    const blank = ctx.pages()[0];
    for (const [url] of [...HISTORY, ...collectUrls(tree)]) {
      await blank.goto(url, { waitUntil: "load" });
      await settle(150);
    }
    for (const [url] of OPEN_TABS) {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "load" });
      await settle(150);
    }
    await blank.close();

    await sw.evaluate(
      async ([tree]) => {
        const add = async (parentId, nodes) => {
          for (const [title, value] of Object.entries(nodes)) {
            if (typeof value === "string") await chrome.bookmarks.create({ parentId, title, url: value });
            else await add((await chrome.bookmarks.create({ parentId, title })).id, value);
          }
        };
        await add("1", tree);
        await chrome.storage.sync.set({ siteSearchEngines: [{ keyword: "gh", name: "GitHub", url: "https://github.com/search?q=%s" }] });
      },
      [tree],
    );

    async function openPalette() {
      // 前に開いたタブが遅れて届くことがあるので、新しく現れたパレットのページを探す。
      const before = new Set(ctx.pages());
      await sw.evaluate(() => chrome.tabs.create({}));
      let page;
      while (!(page = ctx.pages().find((p) => !before.has(p) && p.url().includes("palette.html?focus")))) await settle(50);
      await page.waitForSelector("#results li");
      await settle(400);
      return page;
    }

    // パレットを撮り、台紙に載せて書き出す。台紙は拡張機能の外のページなので、別のタブで描く。
    const board = await ctx.newPage();
    await board.setViewportSize({ width: 1280, height: 800 });
    mkdirSync(out, { recursive: true });
    let count = 0;
    async function shoot(page, keys) {
      // 履歴とブックマークの検索と favicon が返るのを待つ。
      await settle(600);
      const shot = `data:image/png;base64,${(await page.screenshot({ caret: "initial" })).toString("base64")}`;
      await page.close();
      await board.setContent(stage({ shot, caption: captions[count], keys }));
      await board.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
      count += 1;
      // 台紙は 1 倍で撮り、ストアの 1280×800 にそろえる。
      await board.screenshot({ path: join(out, `screenshot-${count}.png`), scale: "css" });
    }

    // 1. 開いているタブ、ブックマーク、履歴をまとめて探す
    let palette = await openPalette();
    await palette.keyboard.type("github");
    await shoot(palette, ["⌘", "T"]);

    // 2. コマンドを探す。日本語では日本語の語で探す
    palette = await openPalette();
    await palette.keyboard.type(command);
    await shoot(palette, []);

    // 3. ブックマークをフォルダでたどる
    palette = await openPalette();
    await palette.keyboard.type(folders.work);
    await settle(400);
    await palette.keyboard.press("Enter");
    await settle(250);
    await palette.keyboard.press("Enter");
    await shoot(palette, ["Enter"]);

    // 4. キーワード + Tab でサイト内検索
    palette = await openPalette();
    await palette.keyboard.type("gh");
    await settle(300);
    await palette.keyboard.press("Tab");
    await settle(200);
    await palette.keyboard.type("playwright");
    await shoot(palette, ["Tab"]);
  } finally {
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
    rmSync(ext, { recursive: true, force: true });
  }
}

for (const lang of Object.keys(LANGS)) await capture(lang);
