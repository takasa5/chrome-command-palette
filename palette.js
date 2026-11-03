import { COMMANDS } from "./commands.js";
import { GOOGLE_SERVICES, findServiceTab } from "./google-services.js";
import { commandItem, flattenBookmarks, isSameOrigin, normalize, rankCommands, rankFolderContents, rankResults, stripUrl } from "./search.js";
import { applyBufferedKeys } from "./overlay.js";
import { getEngines, siteSearchScope } from "./site-search.js";
import { xScope } from "./x-accounts.js";

const DEBOUNCE_MS = 80;
const RECENT_TAB_COUNT = 5;
const BROWSER_RESULT_LIMIT = 30;
const KIND_LABELS = { command: "コマンド", service: "Google", tab: "タブ", folder: "フォルダ", bookmark: "ブックマーク", history: "履歴", url: "URL", search: "検索", siteSearch: "サイト内検索", account: "アカウント" };

const input = document.getElementById("query");
const list = document.getElementById("results");
const toast = document.getElementById("toast");
const breadcrumb = document.getElementById("breadcrumb");
const paletteUrl = chrome.runtime.getURL("palette.html");
const params = new URLSearchParams(location.search);
// ページの上に重ねて開いたときは、新規タブではなく、そのページのタブ（hostTabId）の中の iframe で動く。
const overlayToken = params.get("overlay");
const overlay = overlayToken !== null;
let hostTabId = null;

const ctx = {
  self: null,
  windowTabs: [],
  target: null,
  nextTarget: null,
  isPalette: (tab) => (tab.url ?? tab.pendingUrl ?? "").startsWith(paletteUrl),
  navigate,
  pageTabId,
  leave,
  openTab,
};

// 重ねたときは見ているページを残し、隣に新しいタブを開く。
async function navigate(url) {
  if (!overlay) return chrome.tabs.update(ctx.self.id, { url });
  await chrome.tabs.create({ url, windowId: ctx.self.windowId, index: ctx.self.index + 1 });
  await closeOverlay();
}

// ページを読み込むタブ。新規タブならパレット自身、重ねたときは隣の空のタブ。
async function pageTabId() {
  if (!overlay) return ctx.self.id;
  const tab = await chrome.tabs.create({ url: "about:blank", windowId: ctx.self.windowId, index: ctx.self.index + 1 });
  return tab.id;
}

function closeOverlay() {
  return chrome.tabs.sendMessage(hostTabId, { type: "close-palette" }, { frameId: 0 }).catch(() => {});
}

let allTabs = [];
let results = [];
let selectedKey = null;
let selectionMoved = false;
let searchSeq = 0;
let busy = false;
// 開いているフォルダの階層。query は入る前の入力で、戻るときに復元する。
let folderStack = [];
let activeScope = null;
// キーワードを入力して Tab を押すと入れる、候補の絞り込み先。
let scopes = [xScope];
const scopeIcons = new WeakMap();

// パレットのタブを閉じて focusTabId のタブへ戻る。
// ウィンドウ最後のタブなら、閉じるとウィンドウごと消えるので開いたままにする。
// 重ねたときはタブを閉じず、パレットだけを閉じる。
async function leave(focusTabId = ctx.target?.id) {
  if (overlay) {
    if (focusTabId && focusTabId !== hostTabId) await chrome.tabs.update(focusTabId, { active: true });
    await closeOverlay();
    return;
  }
  const tabs = await chrome.tabs.query({ windowId: ctx.self.windowId });
  if (tabs.length <= 1) {
    input.value = "";
    folderStack = [];
    activeScope = null;
    await refreshTabs();
    update();
    return;
  }
  if (focusTabId) await chrome.tabs.update(focusTabId, { active: true });
  await chrome.tabs.remove(ctx.self.id);
}

function currentTab() {
  return overlay ? chrome.tabs.get(hostTabId) : chrome.tabs.getCurrent();
}

// 重ねたときは、見ているページが操作の対象になる。
async function refreshTabs() {
  ctx.self = await currentTab();
  allTabs = (await chrome.tabs.query({})).filter((tab) => !ctx.isPalette(tab));
  ctx.windowTabs = allTabs.filter((tab) => tab.windowId === ctx.self.windowId);
  const recent = ctx.windowTabs.filter((tab) => tab.id !== ctx.self.id).sort((a, b) => b.lastAccessed - a.lastAccessed);
  ctx.target = overlay ? ctx.self : (recent[0] ?? null);
  ctx.nextTarget = overlay ? (recent[0] ?? null) : (recent[1] ?? null);
}

// 候補に出すタブ。今いるタブは選んでも意味がないので出さない。
function otherTabs() {
  return allTabs.filter((tab) => tab.id !== ctx.self.id);
}

async function refreshScopes() {
  scopes = [xScope, ...(await getEngines()).map(siteSearchScope)];
  // キーワードを打ち終える前に読み込んでおき、ヒントと同時に出せるようにする。
  scopes.forEach(scopeIcon);
}

function availableCommands() {
  return COMMANDS.filter((command) => !command.needsTarget || ctx.target);
}

// 何も入力せずに Tab を押すと入る。キーワードがないので scopes には入れない。
const commandScope = {
  keyword: "",
  title: "コマンド",
  search: async (query) => rankCommands(query, availableCommands()),
};

function emptyQueryResults() {
  const tabs = otherTabs().sort((a, b) => b.lastAccessed - a.lastAccessed).slice(0, RECENT_TAB_COUNT);
  return [
    ...tabs.map((tab) => ({ kind: "tab", key: `tab:${tab.id}`, title: tab.title || tab.url, subtitle: stripUrl(tab.url), url: tab.url, tab })),
    ...availableCommands()
      .filter((command) => command.featured)
      .map((command) => commandItem(command)),
  ];
}

function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}

function renderFavicon(pageUrl) {
  const img = document.createElement("img");
  img.className = "icon";
  img.alt = "";
  img.src = faviconUrl(pageUrl);
  return img;
}

function renderIcon(item) {
  if (item.url && item.kind !== "url" && item.kind !== "siteSearch") return renderFavicon(item.url);
  const span = document.createElement("span");
  span.className = "icon";
  span.textContent = { command: "⌘", folder: "📁", url: "↗", search: "⌕", siteSearch: "⌕", account: "@" }[item.kind];
  return span;
}

function isOtherWindowTab(item) {
  return item.kind === "tab" && item.tab.windowId !== ctx.self.windowId;
}

function kindLabel(item) {
  if (!isOtherWindowTab(item)) return KIND_LABELS[item.kind];
  if (item.key !== selectedKey) return "別ウィンドウのタブ";
  return `Enter そのウィンドウへ / Shift+Enter ${item.tab.pinned ? "ここで開く" : "ここへ移動"}`;
}

function renderRow(item) {
  const li = document.createElement("li");
  li.role = "option";
  li.setAttribute("aria-selected", String(item.key === selectedKey));
  li.dataset.key = item.key;

  const text = document.createElement("span");
  text.className = "text";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = item.title;
  const subtitle = document.createElement("span");
  subtitle.className = "subtitle";
  subtitle.textContent = item.subtitle;
  text.append(title, subtitle);

  const kind = document.createElement("span");
  kind.className = "kind";
  kind.textContent = kindLabel(item);

  li.append(renderIcon(item), text, kind);
  li.addEventListener("click", (event) => execute(item, { moveHere: event.shiftKey }));
  return li;
}

function render() {
  // 矢印キーで選んだ行だけを維持し、それ以外は常に最上位の候補を選ぶ。
  if (!selectionMoved || !results.some((item) => item.key === selectedKey)) selectedKey = results[0]?.key ?? null;
  list.replaceChildren(...results.map(renderRow));
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}

// 文字の位置がずれないように枠を先に作り、同じ要素を使い回して読み込み直しのちらつきも防ぐ。
function scopeIcon(scope) {
  if (!scopeIcons.has(scope)) {
    const slot = document.createElement("span");
    slot.className = "icon";
    scopeIcons.set(scope, slot);
    scope.findVisitedPage().then((pageUrl) => slot.replaceChildren(pageUrl ? renderFavicon(pageUrl) : "⌕"));
  }
  return scopeIcons.get(scope);
}

function renderBreadcrumb() {
  const scope = activeScope ?? scopeForInput();
  const text = activeScope?.title ?? scope?.hint ?? folderStack.map(({ folder }) => folder.title).join(" / ");
  breadcrumb.replaceChildren(...(scope?.findVisitedPage ? [scopeIcon(scope)] : []), text);
  breadcrumb.hidden = !text;
}

function moveSelection(delta) {
  if (results.length === 0) return;
  const index = results.findIndex((item) => item.key === selectedKey);
  selectedKey = results[(index + delta + results.length) % results.length].key;
  selectionMoved = true;
  render();
}

async function update() {
  const query = input.value;
  const seq = ++searchSeq;
  toast.textContent = "";
  selectionMoved = false;
  renderBreadcrumb();
  if (activeScope) {
    const scoped = await activeScope.search(query);
    if (seq !== searchSeq) return;
    results = scoped;
    render();
    return;
  }
  if (folderStack.length > 0) {
    results = rankFolderContents(query, folderStack.at(-1).folder);
    render();
    return;
  }
  if (!query.trim()) {
    results = emptyQueryResults();
    render();
    return;
  }
  // コマンドとタブは同期で出し、Enter を素早く押しても待たされないようにする。
  const sources = { commands: availableCommands(), services: GOOGLE_SERVICES, tabs: otherTabs() };
  results = rankResults(query, sources);
  render();

  await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
  if (seq !== searchSeq) return;
  const [bookmarkTree, history] = await Promise.all([
    chrome.bookmarks.getTree(),
    chrome.history.search({ text: query.trim(), startTime: 0, maxResults: BROWSER_RESULT_LIMIT }),
  ]);
  if (seq !== searchSeq) return;
  results = rankResults(query, {
    ...sources,
    bookmarks: flattenBookmarks(bookmarkTree),
    history: history.filter((page) => !page.url.startsWith(paletteUrl)),
  });
  render();
}

function scopeForInput() {
  if (activeScope || folderStack.length > 0) return null;
  return scopes.find((scope) => scope.keyword === normalize(input.value)) ?? null;
}

function scopeForTab() {
  if (activeScope || folderStack.length > 0) return null;
  return input.value.trim() ? scopeForInput() : commandScope;
}

function enterScope(scope) {
  activeScope = scope;
  input.value = "";
  update();
}

function exitScope() {
  input.value = activeScope.keyword;
  activeScope = null;
  update();
}

function enterFolder(folder) {
  folderStack.push({ folder, query: input.value });
  input.value = "";
  update();
}

function exitFolder() {
  input.value = folderStack.pop().query;
  update();
}

async function openTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  // leave で元のタブへ戻るとパレットが閉じるので、別ウィンドウへのフォーカスは先に済ませる。
  if (tab.windowId !== ctx.self.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  await leave(tab.windowId === ctx.self.windowId ? tab.id : ctx.target?.id);
}

// パレットの位置へ移すので、パレットを閉じた後もその位置に残る。
// ピンのタブは移動せず、このウィンドウで開く。同じオリジンのピンがあれば増やさず、そこで開く。
// 元のピンはオリジンのトップへ戻し、同じ動画が 2 つのウィンドウで再生されないようにする。
async function showInPinHere(tab) {
  const pins = ctx.windowTabs.filter((other) => other.pinned && isSameOrigin(other.url, tab.url));
  const samePage = pins.find((pin) => pin.url === tab.url);
  if (samePage) return samePage;
  if (pins.length > 0) return chrome.tabs.update(pins[0].id, { url: tab.url });
  return chrome.tabs.create({ url: tab.url, windowId: ctx.self.windowId, pinned: true, active: false });
}

async function openPinnedHere(tab) {
  const here = await showInPinHere(tab);
  const { origin } = new URL(tab.url);
  if (origin !== "null") await chrome.tabs.update(tab.id, { url: origin });
  await leave(here.id);
}

async function moveTabHere(tab) {
  if (tab.pinned) return openPinnedHere(tab);
  // 新規タブならパレットの位置、重ねたときは見ているページの隣へ移す。
  await chrome.tabs.move(tab.id, { windowId: ctx.self.windowId, index: ctx.self.index + (overlay ? 1 : 0) });
  await leave(tab.id);
}

async function search(text) {
  await chrome.search.query({ text, tabId: await pageTabId() });
  if (overlay) await closeOverlay();
}

function runItem(item, { moveHere }) {
  switch (item.kind) {
    case "command":
      return item.command.run(ctx);
    case "service": {
      const tab = findServiceTab(allTabs, item.service, ctx.self.windowId);
      return tab ? openTab(tab) : ctx.navigate(item.url);
    }
    case "tab":
      return moveHere && isOtherWindowTab(item) ? moveTabHere(item.tab) : openTab(item.tab);
    case "folder":
      return enterFolder(item.folder);
    case "account":
      return item.run(ctx);
    case "search":
      return search(item.text);
    default:
      return ctx.navigate(item.url);
  }
}

async function execute(item, { moveHere = false } = {}) {
  if (busy || !item) return;
  busy = true;
  try {
    await refreshTabs();
    await runItem(item, { moveHere });
  } catch (error) {
    toast.textContent = error.message;
  } finally {
    busy = false;
  }
}

function handleKeydown(event) {
  // 日本語入力の確定 Enter でコマンドを実行しない。
  if (event.isComposing || event.keyCode === 229) return;
  const ctrl = event.ctrlKey && !event.metaKey;
  if (event.key === "ArrowDown" || (ctrl && event.key === "n")) {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === "ArrowUp" || (ctrl && event.key === "p")) {
    event.preventDefault();
    moveSelection(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    execute(results.find((item) => item.key === selectedKey), { moveHere: event.shiftKey });
  } else if (event.key === "Tab") {
    // 入るところがなくても、入力欄からフォーカスを外さない。
    event.preventDefault();
    const scope = event.shiftKey ? null : scopeForTab();
    if (scope) enterScope(scope);
  } else if (event.key === "Backspace" && !input.value && activeScope) {
    event.preventDefault();
    exitScope();
  } else if (event.key === "Backspace" && !input.value && folderStack.length > 0) {
    event.preventDefault();
    exitFolder();
  } else if (event.key === "Escape") {
    event.preventDefault();
    leave();
  }
}

async function reactivate() {
  input.focus();
  await Promise.all([refreshTabs(), refreshScopes()]);
  if (!input.value.trim()) update();
}

// 同じウィンドウで別のタブへ移ったら閉じて、放置したパレットが増えないようにする。
async function closeWhenLeft({ tabId, windowId }) {
  // タブが別ウィンドウへ移されていることがあるので、最新の状態で判定する。
  const self = await currentTab();
  if (windowId !== self.windowId || tabId === self.id) return;
  if (overlay) return closeOverlay();
  // leave が同時に閉じていることがあるので、失敗は無視する。
  await chrome.tabs.remove(self.id).catch(() => {});
}

// background.js が渡した合言葉から、重ねたページのタブを受け取る。合言葉は一度しか使えない。
async function claimHostTab() {
  const key = `overlay:${overlayToken}`;
  const { [key]: tabId } = await chrome.storage.session.get(key);
  await chrome.storage.session.remove(key);
  return tabId ?? null;
}

// 読み込むまでに打った文字をページから受け取る。受け取ると、ページはパレットへフォーカスを移す。
async function takeBufferedKeys() {
  const keys = await chrome.tabs.sendMessage(hostTabId, { type: "palette-ready" }, { frameId: 0 });
  const { text, submit } = applyBufferedKeys(keys ?? []);
  input.value = text;
  update();
  if (submit) execute(results.find((item) => item.key === selectedKey));
}

async function init() {
  if (overlay) {
    hostTabId = await claimHostTab();
    if (!hostTabId) return;
    // パレットの外（暗くした部分）をクリックしたら閉じる。
    document.addEventListener("mousedown", (event) => {
      if (!event.target.closest(".palette")) leave();
    });
  }
  await Promise.all([refreshTabs(), refreshScopes()]);
  chrome.tabs.onActivated.addListener(closeWhenLeft);
  input.addEventListener("input", update);
  input.addEventListener("keydown", handleKeydown);
  window.addEventListener("focus", reactivate);
  input.focus();
  if (overlay) await takeBufferedKeys();
  else update();
}

// 他のサイトに埋め込まれたときは動かない。重ねるときも合言葉がなければ動かない。
const embedded = window.top !== window;
if (overlay ? embedded : params.has("focus") && !embedded) init();
