// パレットにキーを 1 つずつランダムな順で送り、どの順でも成り立つべき性質を確かめる（プロパティベーステスト）。
// グラフベース（graph/）は意味のある操作（フォルダに入る、Enter で開く）の遷移を全部通す。
// こちらはパレットを閉じないキー（任意の文字、Backspace、Tab、矢印、全選択して削除）を細かく混ぜ、モデルに書いていない入力の順を試す。
// 1 操作ごとに、入力欄、パンくず、フォーカス、選択中の行、コンソールのエラーを確かめる。失敗したら fast-check が操作列を最小まで縮める。
//
// 環境変数
//   E2E_PROPERTY_RUNS  試す操作列の本数。手元で時間をかけて探るときに増やす
//   E2E_PROPERTY_SEED, E2E_PROPERTY_PATH  失敗したときに表示される値。渡すと同じ操作列を再生する
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fc from "fast-check";
import { normalize } from "../../extension/search.js";
import { HOST_ORIGIN, launch, saveScreenshot } from "../support/browser.js";

const SITE = { keyword: "gh", name: "GitHub", url: "https://github.com/search?q=%s" };
// 50 本で手元 10〜30 秒ほど（操作列の長さで変わる）。CI の e2e ジョブ全体を 5 分に収めつつ、シードは毎回変わるので、CI が回るたびに違う操作列を試す。
const RUNS = Number(process.env.E2E_PROPERTY_RUNS ?? 50);
const MAX_COMMANDS = 25;

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
  await browser.sw.evaluate((site) => chrome.storage.sync.set({ siteSearchEngines: [site] }), SITE);
  await browser.openPage("Alpha Notes");
  host = await browser.openPage("Host Page", HOST_ORIGIN);
});
after(() => browser.close());

const overlayOpen = () => host.evaluate(() => document.querySelector("command-palette-overlay") !== null);

async function open(mode) {
  if (mode === "newTab") {
    const page = await browser.openPalette();
    palette = { frame: page, page, keyboard: page.keyboard };
  } else {
    await browser.openOverlay(host);
    const frame = await browser.overlayFrame(host);
    await frame.locator("#results li").first().waitFor();
    palette = { frame, page: host, keyboard: host.keyboard };
  }
}

// Esc で閉じ、用意したタブだけを残す。閉じるキーは keydown だけを応答を待たずに送る（replay.e2e.js の closeWith と同じ理由）。
async function close() {
  if (!palette) return;
  const { page } = palette;
  page.keyboard.down("Escape").catch(() => {});
  await eventually(async () => {
    const tabs = await browser.sw.evaluate(() => chrome.tabs.query({}));
    assert.equal(tabs.some((tab) => (tab.url || tab.pendingUrl).includes("palette.html")), false, "パレットのタブが残っている");
    assert.equal(await overlayOpen(), false, "重ねたパレットが残っている");
  });
  if (!page.isClosed()) await page.keyboard.up("Escape");
  palette = null;
  await host.bringToFront();
}

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

// ---- モデル ----
// scope: none / commands / gh、query: 入力欄の文字。パレットを閉じる操作は入れないので、開き方とフォルダは持たない。

// モデルの状態から、画面に出るはずのもの。開いている間は、いつも入力欄にフォーカスがある。
function expectedScreen({ scope, query }) {
  let breadcrumb = "";
  if (scope === "commands") breadcrumb = "コマンド";
  else if (scope === SITE.keyword) breadcrumb = `${SITE.name} を検索`;
  else if (normalize(query) === SITE.keyword) breadcrumb = `Tab で ${SITE.name} を検索`;
  return { query, breadcrumb, focused: true };
}

const screen = () =>
  palette.frame.evaluate(() => {
    const breadcrumb = document.getElementById("breadcrumb");
    // 絞り込みのアイコンを除いた文字だけを比べる。
    const text = [...breadcrumb.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("");
    const input = document.getElementById("query");
    const rows = document.querySelectorAll("#results li").length;
    const selected = document.querySelectorAll('#results li[aria-selected="true"]').length;
    return {
      screen: { query: input.value, breadcrumb: breadcrumb.hidden ? "" : text, focused: document.hasFocus() && document.activeElement === input },
      rows,
      selected,
    };
  });

// どの操作の後でも成り立つこと。
async function expectInvariants(model) {
  await eventually(async () => {
    const { screen: actual, rows, selected } = await screen();
    assert.deepEqual(actual, expectedScreen(model));
    // Enter で何を開くかが決まっているよう、候補があれば選択中はちょうど 1 つ、なければ 0。
    assert.equal(selected, rows > 0 ? 1 : 0, `候補 ${rows} 件のうち選択中が ${selected} 件`);
  });
  assert.deepEqual(errors, [], "コンソールにエラーが出た");
}

// ---- 操作 ----
// どれもパレットを閉じない。閉じる操作（Esc、Enter）の後の状態はグラフベースが確かめる。

class Type {
  constructor(text) {
    this.text = text;
  }
  check = () => true;
  async run(model) {
    await palette.keyboard.type(this.text);
    model.query += this.text;
    await expectInvariants(model);
  }
  toString = () => `type(${JSON.stringify(this.text)})`;
}

class Backspace {
  check = () => true;
  async run(model) {
    await palette.keyboard.press("Backspace");
    if (model.query) model.query = [...model.query].slice(0, -1).join("");
    else if (model.scope !== "none") {
      // 絞り込みから出ると、入るときのキーワードが入力欄に戻る。コマンドの絞り込みにキーワードはない。
      model.query = model.scope === SITE.keyword ? SITE.keyword : "";
      model.scope = "none";
    }
    await expectInvariants(model);
  }
  toString = () => "Backspace";
}

class Tab {
  check = () => true;
  async run(model) {
    await palette.keyboard.press("Tab");
    if (model.scope === "none") {
      if (!model.query.trim()) model.scope = "commands";
      else if (normalize(model.query) === SITE.keyword) model.scope = SITE.keyword;
      if (model.scope !== "none") model.query = "";
    }
    await expectInvariants(model);
  }
  toString = () => "Tab";
}

// 押しても何も変えないキー。矢印は選択を動かすだけなので、選択中がちょうど 1 つのままかを確かめる。
class Press {
  constructor(key) {
    this.key = key;
  }
  check = () => true;
  async run(model) {
    await palette.keyboard.press(this.key);
    await expectInvariants(model);
  }
  toString = () => this.key;
}

// 全選択して Delete で消す。Backspace だと、入力が空のときに絞り込みから出てしまう。
class ClearAll {
  check = () => true;
  async run(model) {
    await palette.keyboard.press("ControlOrMeta+a");
    await palette.keyboard.press("Delete");
    model.query = "";
    await expectInvariants(model);
  }
  toString = () => "Cmd+A, Delete";
}

// キーワード（全角、大文字も同じに扱う）と、それ以外の文字。日本語は 1 文字ずつ確定した形で入れる。
const text = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom("gh", "GH", "ｇｈ", " gh") },
  { weight: 3, arbitrary: fc.string({ unit: fc.constantFrom("a", "g", "h", "x", "1", " ", "あ", "ア", "-"), minLength: 1, maxLength: 3 }) },
);

const commands = fc.commands(
  [
    text.map((value) => new Type(value)),
    fc.constant(new Backspace()),
    fc.constant(new Tab()),
    fc.constantFrom("Shift+Tab", "ArrowDown", "ArrowUp").map((key) => new Press(key)),
    fc.constant(new ClearAll()),
  ],
  { maxCommands: MAX_COMMANDS },
);

test("プロパティベース › キー操作の順によらず画面がモデルと一致する", { timeout: 15 * 60_000 }, async () => {
  const property = fc.asyncProperty(fc.constantFrom("newTab", "overlay"), commands, async (mode, cmds) => {
    errors.length = 0;
    await open(mode);
    try {
      const model = { scope: "none", query: "" };
      await expectInvariants(model);
      await fc.asyncModelRun(() => ({ model, real: undefined }), cmds);
    } catch (error) {
      // 縮めるたびに上書きされるので、最後に残るのは最小の反例の画面。
      await saveScreenshot(palette?.page, "property", "palette");
      throw error;
    } finally {
      await close();
    }
  });
  const seed = process.env.E2E_PROPERTY_SEED;
  const path = process.env.E2E_PROPERTY_PATH;
  await fc.assert(property, {
    numRuns: RUNS,
    ...(seed && { seed: Number(seed), path }),
    reporter(details) {
      if (!details.failed) return;
      const replay = `E2E_PROPERTY_SEED=${details.seed} E2E_PROPERTY_PATH=${details.counterexamplePath} npm run e2e:property`;
      throw new Error(`${fc.defaultReportMessage(details)}\n\n再現するには: ${replay}`);
    },
  });
});
