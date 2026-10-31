import { switchAccount } from "./x-accounts.js";

chrome.runtime.onMessage.addListener(({ type, tabId, handle }) => {
  if (type === "switch-x-account") switchAccount(tabId, handle).catch(console.error);
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
