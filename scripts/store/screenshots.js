// ストアに載せるスクリーンショット（1280×800）を docs/store/ に書き出す。
// 外部サイトにはつながず、どの URL にもタイトルと favicon だけのページを返す。
import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const out = join(root, "docs", "store");

// 800×500 を 1.6 倍で撮ると、ストアの 1280×800 になり、パレットも大きく写る。
const VIEWPORT = { width: 800, height: 500 };
const SCALE = 1.6;

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
  ["https://developer.mozilla.org/ja/docs/Web/API", "Web API | MDN"],
];

const HISTORY = [
  ["https://github.com/microsoft/playwright/issues", "Issues · microsoft/playwright"],
  ["https://github.com/notifications", "Notifications"],
  ["https://developer.mozilla.org/ja/docs/Web/JavaScript", "JavaScript | MDN"],
];

const BOOKMARK_TREE = {
  仕事: {
    フロントエンド: {
      ライブラリ: {
        React: "https://github.com/facebook/react",
        "Next.js": "https://github.com/vercel/next.js",
        Playwright: "https://github.com/microsoft/playwright",
      },
      "MDN Web Docs": "https://developer.mozilla.org/ja/",
      "Can I use": "https://caniuse.com/",
    },
    バックエンド: { "Node.js": "https://nodejs.org/ja", "GitHub Actions": "https://github.com/features/actions" },
    インフラ: { Kubernetes: "https://kubernetes.io/ja/" },
  },
};

const titles = new Map([...OPEN_TABS, ...HISTORY]);
const collectUrls = (tree) => Object.entries(tree).flatMap(([title, value]) => (typeof value === "string" ? [[value, title]] : collectUrls(value)));
for (const [url, title] of collectUrls(BOOKMARK_TREE)) titles.set(url, title);

const escape = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function fakeSite(route) {
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
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(join(tmpdir(), "command-palette-store-"));
const ctx = await chromium.launchPersistentContext(profile, {
  // 既定の headless shell は拡張機能を読み込めない。
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, "--lang=ja", "--host-resolver-rules=MAP * ~NOTFOUND"],
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: "light",
  locale: "ja-JP",
});

try {
  await ctx.route(/^https?:/, fakeSite);
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));

  // favicon は開いたことのあるページでしか引けないので、すべて一度開く。開いたページはそのまま履歴になる。
  const blank = ctx.pages()[0];
  for (const [url] of [...HISTORY, ...collectUrls(BOOKMARK_TREE)]) {
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
    [BOOKMARK_TREE],
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

  async function shoot(page, name) {
    // 履歴とブックマークの検索と favicon が返るのを待つ。
    await settle(600);
    await page.screenshot({ path: join(out, name), caret: "initial" });
    await page.close();
  }

  mkdirSync(out, { recursive: true });

  // 1. 開いているタブ、ブックマーク、履歴をまとめて探す
  let palette = await openPalette();
  await palette.keyboard.type("github");
  await shoot(palette, "screenshot-1.png");

  // 2. コマンドを日本語で探す
  palette = await openPalette();
  await palette.keyboard.type("閉じる");
  await shoot(palette, "screenshot-2.png");

  // 3. ブックマークをフォルダでたどる
  palette = await openPalette();
  await palette.keyboard.type("仕事");
  await settle(400);
  await palette.keyboard.press("Enter");
  await settle(250);
  await palette.keyboard.press("Enter");
  await shoot(palette, "screenshot-3.png");

  // 4. キーワード + Tab でサイト内検索
  palette = await openPalette();
  await palette.keyboard.type("gh");
  await settle(300);
  await palette.keyboard.press("Tab");
  await settle(200);
  await palette.keyboard.type("playwright");
  await shoot(palette, "screenshot-4.png");
} finally {
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
}
