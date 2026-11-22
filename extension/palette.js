import { availableCommands as filterCommands, COMMANDS } from "./commands.js";
import { t } from "./i18n.js";
import { findFavoriteTab, getFavorites } from "./favorites.js";
import { commandItem, flattenBookmarks, isSameOrigin, normalize, rankCommands, rankFolderContents, rankResults, removeResult, stripUrl } from "./search.js";
import { applyBufferedKeys } from "./overlay.js";
import { getEngines, siteSearchScope } from "./site-search.js";
import { syncTheme } from "./theme.js";
import { USAGE_STORAGE_KEY, sortByUsage, usageKey } from "./usage.js";

const DEBOUNCE_MS = 80;
const RECENT_TAB_COUNT = 5;
const BROWSER_RESULT_LIMIT = 30;
const KIND_LABELS = {
  command: "kindCommand",
  favorite: "kindFavorite",
  tab: "kindTab",
  folder: "kindFolder",
  bookmark: "kindBookmark",
  history: "kindHistory",
  url: "kindUrl",
  search: "kindSearch",
  siteSearch: "kindSiteSearch",
  readingList: "kindReadingList",
  tabGroup: "kindTabGroup",
};

const input = document.getElementById("query");
const list = document.getElementById("results");
const toast = document.getElementById("toast");
const breadcrumb = document.getElementById("breadcrumb");
// タブや履歴に残るパレットの URL。runtime.getURL は use_dynamic_url により起動ごとに変わる値を返し、タブの URL と合わないので使わない。
// ページに重ねた iframe の中でも拡張機能の ID になるよう、location ではなく runtime.id から作る。
const paletteUrl = `chrome-extension://${chrome.runtime.id}/palette.html`;
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
  enterScope,
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
let scopes = [];
let favorites = [];
// 設定でオフにできるコマンドの、オンかオフか（enabledBy のキーごと）。
let commandSettings = {};
// パレットで候補を選んだ記録。よく選ぶ候補を上に出すのに使う。
let usage = {};
const scopeIcons = new WeakMap();
// パレットで履歴から消した URL。消す前に始まった検索の結果に、消したページが戻ってこないようにする。
// 消したあとにまた訪れたページは履歴に戻るので、onVisited で外す。
const deletedUrls = new Set();

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

// 設定画面で編集されたときに追いつけるよう、サイト内検索と一緒に読み直す。
async function refreshScopes() {
  const settingKeys = COMMANDS.flatMap((command) => command.enabledBy ?? []);
  [scopes, favorites, commandSettings] = await Promise.all([
    getEngines().then((engines) => engines.map((engine) => siteSearchScope(engine, t))),
    getFavorites(),
    chrome.storage.sync.get(settingKeys),
  ]);
  // キーワードを打ち終える前に読み込んでおき、ヒントと同時に出せるようにする。
  scopes.forEach(scopeIcon);
}

async function refreshUsage() {
  const { [USAGE_STORAGE_KEY]: stored } = await chrome.storage.local.get(USAGE_STORAGE_KEY);
  usage = stored ?? {};
}

// 記録の書き換えは background.js にまとめ、別のパレットや履歴の削除と書き込みがぶつからないようにする。
async function rememberUsage(item) {
  const key = usageKey(item);
  if (!key) return;
  try {
    usage = (await chrome.runtime.sendMessage({ type: "record-usage", key })) ?? usage;
  } catch {
    // 記録できなくても、選んだ候補は開く。
  }
}

function availableCommands() {
  return filterCommands(COMMANDS, { hasTarget: Boolean(ctx.target), settings: commandSettings });
}

// 何も入力せずに Tab を押すと入る。キーワードがないので scopes には入れない。
const commandScope = {
  keyword: "",
  title: t("commandScopeTitle"),
  search: async (query) => rankCommands(query, availableCommands(), { t, usage }),
};

function emptyQueryResults() {
  const tabs = otherTabs().sort((a, b) => b.lastAccessed - a.lastAccessed).slice(0, RECENT_TAB_COUNT);
  return [
    ...tabs.map((tab) => ({ kind: "tab", key: `tab:${tab.id}`, title: tab.title || tab.url, subtitle: stripUrl(tab.url), url: tab.url, tab })),
    ...sortByUsage(
      availableCommands()
        .filter((command) => command.featured)
        .map((command) => commandItem(command, t)),
      usage,
      Date.now(),
    ),
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
  span.textContent = { command: "⌘", folder: "📁", url: "↗", search: "⌕", siteSearch: "⌕", readingList: "📖", tabGroup: "▣" }[item.kind];
  return span;
}

function isOtherWindowTab(item) {
  return item.kind === "tab" && item.tab.windowId !== ctx.self.windowId;
}

function kindLabel(item) {
  if (!isOtherWindowTab(item)) return t(KIND_LABELS[item.kind]);
  if (item.key !== selectedKey) return t("kindOtherWindowTab");
  return t("otherWindowHint", t(item.tab.pinned ? "otherWindowOpenHere" : "otherWindowMoveHere"));
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

function selectedItem() {
  return results.find((item) => item.key === selectedKey);
}

function moveSelection(delta) {
  if (results.length === 0) return;
  const index = results.findIndex((item) => item.key === selectedKey);
  selectedKey = results[(index + delta + results.length) % results.length].key;
  selectionMoved = true;
  render();
}

// keepSelection は、入力ではなくタブの変化で出し直すとき。矢印キーで選んだ行とメッセージを残す。
async function update({ keepSelection = false } = {}) {
  const query = input.value;
  const seq = ++searchSeq;
  if (!keepSelection) {
    toast.textContent = "";
    selectionMoved = false;
  }
  renderBreadcrumb();
  if (activeScope) {
    const scoped = await activeScope.search(query);
    if (seq !== searchSeq) return;
    results = scoped;
    render();
    return;
  }
  if (folderStack.length > 0) {
    results = rankFolderContents(query, folderStack.at(-1).folder, { t, usage });
    render();
    return;
  }
  if (!query.trim()) {
    results = emptyQueryResults();
    render();
    return;
  }
  // コマンドとタブは同期で出し、Enter を素早く押しても待たされないようにする。
  const sources = { t, commands: availableCommands(), favorites, tabs: otherTabs(), usage };
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
    history: history.filter((page) => !page.url.startsWith(paletteUrl) && !deletedUrls.has(page.url)),
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
    case "favorite": {
      const tab = findFavoriteTab(allTabs, item.favorite, ctx.self.windowId);
      return tab ? openTab(tab) : ctx.navigate(item.url);
    }
    case "tab":
      return moveHere && isOtherWindowTab(item) ? moveTabHere(item.tab) : openTab(item.tab);
    case "folder":
      return enterFolder(item.folder);
    case "readingList":
    case "tabGroup":
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
    // 候補を出し直す前に閉じられたタブは、エラーにせず候補から外す。
    if (item.kind === "tab" && !allTabs.some((tab) => tab.id === item.tab.id)) {
      await update({ keepSelection: true });
      return;
    }
    await rememberUsage(item);
    await runItem(item, { moveHere });
  } catch (error) {
    toast.textContent = error.message;
  } finally {
    busy = false;
  }
}

// 履歴の候補を履歴から消す。パレットは閉じず、候補からも外して次の行を選ぶ。
async function deleteFromHistory(item) {
  try {
    await chrome.history.deleteUrl({ url: item.url });
  } catch (error) {
    toast.textContent = error.message;
    return;
  }
  deletedUrls.add(item.url);
  ({ results, selectedKey } = removeResult(results, item.key, selectedKey));
  render();
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
    execute(selectedItem(), { moveHere: event.shiftKey });
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
  } else if (event.key === "Delete" && event.shiftKey && selectedItem()?.kind === "history") {
    // 履歴以外の候補では、入力欄の既定の動き（切り取りなど）のままにする。
    event.preventDefault();
    deleteFromHistory(selectedItem());
  } else if (event.key === "Escape") {
    event.preventDefault();
    leave();
  }
}

async function reactivate() {
  input.focus();
  await Promise.all([refreshTabs(), refreshScopes(), refreshUsage()]);
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

// パレットを開いている間に開いたり閉じたりしたタブを、候補に反映する。
// 読み込み中のタブは何度も変わるので、まとめて読み直す。
let tabsChangedTimer = null;
function onTabsChanged() {
  clearTimeout(tabsChangedTimer);
  tabsChangedTimer = setTimeout(async () => {
    await refreshTabs();
    // タブが候補に出るのは、フォルダや絞り込みに入っていないときだけ。
    if (!activeScope && folderStack.length === 0) update({ keepSelection: true });
  }, DEBOUNCE_MS);
}

function watchTabs() {
  chrome.tabs.onCreated.addListener(onTabsChanged);
  chrome.tabs.onRemoved.addListener(onTabsChanged);
  chrome.tabs.onAttached.addListener(onTabsChanged);
  chrome.tabs.onUpdated.addListener((_tabId, change) => {
    if ("title" in change || "url" in change || "pinned" in change) onTabsChanged();
  });
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
  if (submit) execute(selectedItem());
}

async function init() {
  // ページに重ねたときは、theme-init.js が URL のテーマを当てる。iframe の color-scheme と揃えるため、開いている間は変えない。
  if (!overlay) syncTheme();
  if (overlay) {
    hostTabId = await claimHostTab();
    if (!hostTabId) return;
    // パレットの外（暗くした部分）をクリックしたら閉じる。
    document.addEventListener("mousedown", (event) => {
      if (!event.target.closest(".palette")) leave();
    });
  }
  await Promise.all([refreshTabs(), refreshScopes(), refreshUsage()]);
  chrome.tabs.onActivated.addListener(closeWhenLeft);
  watchTabs();
  chrome.history.onVisited.addListener(({ url }) => deletedUrls.delete(url));
  input.addEventListener("input", () => update());
  input.addEventListener("keydown", handleKeydown);
  window.addEventListener("focus", reactivate);
  input.focus();
  if (overlay) await takeBufferedKeys();
  else update();
}

// 他のサイトに埋め込まれたときは動かない。重ねるときも合言葉がなければ動かない。
const embedded = window.top !== window;
if (overlay ? embedded : params.has("focus") && !embedded) init();
