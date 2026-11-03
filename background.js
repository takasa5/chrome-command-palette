import { toggleOverlay } from "./overlay.js";
import { switchAccount } from "./x-accounts.js";

const paletteUrl = chrome.runtime.getURL("palette.html");

chrome.runtime.onMessage.addListener(({ type, tabId, handle, openHome }) => {
  if (type === "switch-x-account") switchAccount(tabId, handle, { openHome }).catch(console.error);
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
