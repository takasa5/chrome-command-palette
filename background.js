import { toggleOverlay } from "./overlay.js";
import { switchAccount } from "./x-accounts.js";

const paletteUrl = chrome.runtime.getURL("palette.html");

chrome.runtime.onMessage.addListener(({ type, tabId, handle, openHome }) => {
  if (type === "switch-x-account") switchAccount(tabId, handle, { openHome }).catch(console.error);
});

// 翻訳中のページから届いた文字列を、offscreen.html の Translator に渡す。
let offscreenReady = null;

function ensureOffscreen() {
  offscreenReady ??= chrome.offscreen
    .hasDocument()
    .then((exists) => exists || chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["DOM_PARSER"], justification: "組み込みの Translator API でページを翻訳する" }))
    .catch((error) => {
      offscreenReady = null;
      throw error;
    });
  return offscreenReady;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "translate-texts") return;
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ ...message, type: "offscreen-translate" }))
    .then(sendResponse, (error) => sendResponse({ error: error.message }));
  return true;
});

// 今のページの上にパレットを開く。chrome:// などスクリプトを入れられないページでは、新しいタブで開く。
// パレットには一度だけ使える合言葉で開いたタブを渡し、他のサイトに埋め込まれたときは動かないようにする。
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "open-palette" || !tab?.id) return;
  if ((tab.url ?? tab.pendingUrl ?? "").startsWith(paletteUrl)) return;
  const token = crypto.randomUUID();
  const key = `overlay:${token}`;
  await chrome.storage.session.set({ [key]: tab.id });
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: toggleOverlay,
      args: [`${paletteUrl}?overlay=${token}`],
    });
    if (result === "closed") await chrome.storage.session.remove(key);
  } catch {
    await chrome.storage.session.remove(key);
    await chrome.tabs.create({ url: `${paletteUrl}?focus`, windowId: tab.windowId, index: tab.index + 1 });
  }
});

// タブを離れた時刻を記録する。Chrome が閉じると消えるが、再起動後は lastAccessed も起動時刻に戻るので問題ない。
// onActivated は直前のタブを教えてくれないので、最後に表示し始めたタブを直前のタブとみなす。
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const others = (await chrome.tabs.query({ windowId })).filter((tab) => tab.id !== tabId);
  if (others.length === 0) return;
  const previous = others.reduce((a, b) => (b.lastAccessed > a.lastAccessed ? b : a));
  await chrome.storage.session.set({ [previous.id]: Date.now() });
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(String(tabId)));
