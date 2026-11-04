// generated/paths.json の操作列を実物のパレットで再生する（グラフベーステスト）。
// 1 操作ごとに、画面がモデルの状態と一致すること、コンソールにエラーが出ていないことを確かめる。
// E2E_PATHS にファイルを渡すと、その操作列を使う（npm run e2e:walk が乱数で作ったもの）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { launch, pageUrl, press, saveScreenshot } from "../support/browser.js";
import { ACTIONS as LABELS, describeState } from "./scripts/labels.js";

const paths = JSON.parse(readFileSync(process.env.E2E_PATHS ?? new URL("./generated/paths.json", import.meta.url), "utf8"));

// モデルの前提にするブラウザの中身。閉じた状態では、毎回このタブだけが残る。
const ALPHA = pageUrl("Alpha Notes");
// 重ねるには host_permissions のあるページが要る。
const HOST = pageUrl("Host Page", "https://x.com");
const HISTORY = pageUrl("Release Notes", "https://docs.example.test");
const SITE = { keyword: "gh", name: "GitHub", url: "https://github.com/search?q=%s" };
const FOLDERS = { Work: { Docs: { Specs: { Guide: pageUrl("Guide", "https://docs.example.test") } } } };
// フォルダに入るときに打つ文字。名前を打つと直下のフォルダが出るので、Docs には親の work で入る。
const FOLDER_QUERIES = { Docs: "work", Specs: "specs" };

let browser;
let host;
// 今開いているパレット。新しいタブならそのページ、重ねたときは iframe と、キーを受けるページ。
let palette = null;
const errors = [];

before(async () => {
  browser = await launch();
  browser.ctx.on("console", (message) => {
    if (message.type() === "error") errors.push(`${message.text()} (${message.location().url})`);
  });
  browser.ctx.on("weberror", (error) => errors.push(error.error().message));
  await browser.sw.evaluate(
    async ({ folders, site, history }) => {
      const add = async (parentId, nodes) => {
        for (const [title, value] of Object.entries(nodes)) {
          if (typeof value === "string") await chrome.bookmarks.create({ parentId, title, url: value });
          else await add((await chrome.bookmarks.create({ parentId, title })).id, value);
        }
      };
      await add("1", folders);
      await chrome.storage.sync.set({ siteSearchEngines: [site] });
      await chrome.history.addUrl({ url: history });
    },
    { folders: FOLDERS, site: SITE, history: HISTORY },
  );
  await browser.openPage("Alpha Notes");
  host = await browser.openPage("Host Page", "https://x.com");
});
after(() => browser.close());

const overlayOpen = () => host.evaluate(() => document.querySelector("command-palette-overlay") !== null);

// 閉じた状態を毎回同じにする。用意したタブだけを残し、重ねる先のページを前に出す。
async function resetBrowser() {
  for (const page of browser.ctx.pages()) if (page.url() !== ALPHA && page.url() !== HOST) await page.close();
  if (await overlayOpen()) await host.reload();
  await host.bringToFront();
  palette = null;
}

const selected = () => palette.frame.locator('#results li[aria-selected="true"]');

async function clearQuery() {
  if (!(await palette.frame.locator("#query").inputValue())) return;
  await press(palette.page, "ControlOrMeta+a");
  await press(palette.page, "Backspace");
}

// 入力を打ち直し、目当ての候補が選ばれてから Enter を押す。
async function pick(text, { title, kind }) {
  await clearQuery();
  await palette.keyboard.type(text);
  const row = selected();
  if (title) await row.locator(".title", { hasText: new RegExp(`^${title}$`) }).waitFor();
  if (kind) await row.locator(".kind", { hasText: kind }).waitFor();
  await press(palette.page, "Enter");
}

// モデルの操作名ごとの、実物での操作。next は操作の後のモデルの状態。
const ACTIONS = {
  init: async () => {},
  openNewTab: async () => {
    const page = await browser.openPalette();
    palette = { frame: page, page, keyboard: page.keyboard };
  },
  openOverlay: async () => {
    await browser.openOverlay(host);
    const frame = await browser.overlayFrame(host);
    await frame.locator("#results li").first().waitFor();
    palette = { frame, page: host, keyboard: host.keyboard };
  },
  clearQuery,
  enterFolder: (next) => pick(FOLDER_QUERIES[next.folders.at(-1)], { title: next.folders.at(-1) }),
  exitFolder: () => press(palette.page, "Backspace"),
  enterCommandScope: () => press(palette.page, "Tab"),
  enterSiteScope: async () => {
    await clearQuery();
    await palette.keyboard.type(SITE.keyword);
    await palette.frame.locator("#breadcrumb", { hasText: `Tab で ${SITE.name} を検索` }).waitFor();
    await press(palette.page, "Tab");
  },
  exitScope: () => press(palette.page, "Backspace"),
  escape: () => press(palette.page, "Escape"),
  switchTab: () => pick("alpha", { title: "Alpha Notes" }),
  openHistory: () => pick("release", { kind: "履歴" }),
  openBookmark: () => pick("guide", { title: "Guide" }),
  runSiteSearch: async () => {
    await palette.keyboard.type("playwright");
    await selected().locator(".title", { hasText: "「playwright」を検索" }).waitFor();
    await press(palette.page, "Enter");
  },
};

// モデルの状態から、画面に出るはずの入力欄と、上のパンくずの表示。
function expectedScreen({ folders, scope, query }) {
  let breadcrumb = folders.join(" / ");
  if (scope === "commands") breadcrumb = "コマンド";
  else if (scope === SITE.keyword) breadcrumb = `${SITE.name} を検索`;
  else if (query === SITE.keyword) breadcrumb = `Tab で ${SITE.name} を検索`;
  return { query, breadcrumb };
}

const screen = () =>
  palette.frame.evaluate(() => {
    // 絞り込みのアイコンを除いた文字だけを比べる。
    const breadcrumb = document.getElementById("breadcrumb");
    const text = [...breadcrumb.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("");
    return { query: document.getElementById("query").value, breadcrumb: breadcrumb.hidden ? "" : text };
  });

async function eventually(check, timeout = 5000) {
  const until = Date.now() + timeout;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function expectState(state) {
  if (state.mode === "closed") {
    await eventually(async () => {
      const tabs = await browser.sw.evaluate(() => chrome.tabs.query({}));
      assert.deepEqual(tabs.map((tab) => tab.url || tab.pendingUrl).filter((url) => url.includes("palette.html")), [], "パレットのタブが残っている");
      assert.equal(await overlayOpen(), false, "重ねたパレットが残っている");
    });
    await resetBrowser();
  } else {
    await eventually(async () => assert.deepEqual(await screen(), expectedScreen(state)));
  }
  assert.deepEqual(errors, [], "コンソールにエラーが出た");
}

// 1 操作が止まったときに、経路全体の時間切れではなく、どの操作で止まったかが分かるようにする。
const STEP_TIMEOUT = 15000;

// 結果は「グラフベース › 経路 › 操作」の入れ子で出す。操作の行は「操作 → 操作の後のモデルの状態」。
describe("グラフベース", () => {
  paths.forEach((steps, index) => {
    const name = `経路 ${index + 1}`;
    test(`${name}（${steps.length - 1} 操作）`, async (t) => {
      await resetBrowser();
      errors.length = 0;
      for (const [i, { action, ...state }] of steps.entries()) {
        let done = false;
        await t.test(`${i}. ${LABELS[action]} → ${describeState(state)}`, { timeout: STEP_TIMEOUT }, async () => {
          await ACTIONS[action](state);
          await expectState(state);
          done = true;
        });
        // 失敗したら残りの操作は前提が崩れているので進めない。
        if (!done) {
          await saveScreenshot(palette?.page ?? host, "graph", `${name}-${i}`);
          return;
        }
      }
      // 開いたまま終わった経路は閉じて、次の経路に持ち越さない。
      if (palette) await ACTIONS.escape();
    });
  });
});
