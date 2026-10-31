import { COMMANDS } from "./commands.js";
import { flattenBookmarks, rankFolderContents, rankResults, stripUrl } from "./search.js";

const DEBOUNCE_MS = 80;
const RECENT_TAB_COUNT = 5;
const BROWSER_RESULT_LIMIT = 30;
const KIND_LABELS = { command: "コマンド", tab: "タブ", folder: "フォルダ", bookmark: "ブックマーク", history: "履歴", url: "URL", search: "検索" };

const input = document.getElementById("query");
const list = document.getElementById("results");
const toast = document.getElementById("toast");
const breadcrumb = document.getElementById("breadcrumb");
const paletteOrigin = chrome.runtime.getURL("");

const ctx = {
  self: null,
  windowTabs: [],
  target: null,
  nextTarget: null,
  isPalette: (tab) => (tab.url ?? tab.pendingUrl ?? "").startsWith(paletteOrigin),
  navigate: (url) => chrome.tabs.update(ctx.self.id, { url }),
  leave,
};

let allTabs = [];
let results = [];
let selectedKey = null;
let selectionMoved = false;
let searchSeq = 0;
let busy = false;
// 開いているフォルダの階層。query は入る前の入力で、戻るときに復元する。
let folderStack = [];

// パレットのタブを閉じて focusTabId のタブへ戻る。
// ウィンドウ最後のタブなら、閉じるとウィンドウごと消えるので開いたままにする。
async function leave(focusTabId = ctx.target?.id) {
  const tabs = await chrome.tabs.query({ windowId: ctx.self.windowId });
  if (tabs.length <= 1) {
    input.value = "";
    folderStack = [];
    await refreshTabs();
    update();
    return;
  }
  if (focusTabId) await chrome.tabs.update(focusTabId, { active: true });
  await chrome.tabs.remove(ctx.self.id);
}

async function refreshTabs() {
  ctx.self = await chrome.tabs.getCurrent();
  allTabs = (await chrome.tabs.query({})).filter((tab) => !ctx.isPalette(tab));
  ctx.windowTabs = allTabs.filter((tab) => tab.windowId === ctx.self.windowId);
  const recent = [...ctx.windowTabs].sort((a, b) => b.lastAccessed - a.lastAccessed);
  ctx.target = recent[0] ?? null;
  ctx.nextTarget = recent[1] ?? null;
}

function availableCommands() {
  return COMMANDS.filter((command) => !command.needsTarget || ctx.target);
}

function emptyQueryResults() {
  const tabs = [...allTabs].sort((a, b) => b.lastAccessed - a.lastAccessed).slice(0, RECENT_TAB_COUNT);
  return [
    ...tabs.map((tab) => ({ kind: "tab", key: `tab:${tab.id}`, title: tab.title || tab.url, subtitle: stripUrl(tab.url), url: tab.url, tab })),
    ...availableCommands()
      .filter((command) => command.featured)
      .map((command) => ({ kind: "command", key: `command:${command.id}`, title: command.title, subtitle: command.ja, command })),
  ];
}

function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}

function renderIcon(item) {
  if (item.url && item.kind !== "url") {
    const img = document.createElement("img");
    img.className = "icon";
    img.alt = "";
    img.src = faviconUrl(item.url);
    return img;
  }
  const span = document.createElement("span");
  span.className = "icon";
  span.textContent = { command: "⌘", folder: "📁", url: "↗", search: "⌕" }[item.kind];
  return span;
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
  kind.textContent = KIND_LABELS[item.kind];

  li.append(renderIcon(item), text, kind);
  li.addEventListener("click", () => execute(item));
  return li;
}

function render() {
  // 矢印キーで選んだ行だけを維持し、それ以外は常に最上位の候補を選ぶ。
  if (!selectionMoved || !results.some((item) => item.key === selectedKey)) selectedKey = results[0]?.key ?? null;
  list.replaceChildren(...results.map(renderRow));
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
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
  breadcrumb.textContent = folderStack.map(({ folder }) => folder.title).join(" / ");
  breadcrumb.hidden = folderStack.length === 0;
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
  const sources = { commands: availableCommands(), tabs: allTabs };
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
    history: history.filter((page) => !page.url.startsWith(paletteOrigin)),
  });
  render();
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
  await leave(tab.windowId === ctx.self.windowId ? tab.id : ctx.target?.id);
  if (tab.windowId !== ctx.self.windowId) await chrome.windows.update(tab.windowId, { focused: true });
}

function runItem(item) {
  switch (item.kind) {
    case "command":
      return item.command.run(ctx);
    case "tab":
      return openTab(item.tab);
    case "folder":
      return enterFolder(item.folder);
    case "search":
      return chrome.search.query({ text: item.text, tabId: ctx.self.id });
    default:
      return ctx.navigate(item.url);
  }
}

async function execute(item) {
  if (busy || !item) return;
  busy = true;
  try {
    await refreshTabs();
    await runItem(item);
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
    execute(results.find((item) => item.key === selectedKey));
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
  await refreshTabs();
  if (!input.value.trim()) update();
}

async function init() {
  await refreshTabs();
  input.addEventListener("input", update);
  input.addEventListener("keydown", handleKeydown);
  window.addEventListener("focus", reactivate);
  input.focus();
  update();
}

if (location.search.includes("focus")) init();
