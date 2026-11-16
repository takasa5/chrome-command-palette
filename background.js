import { toggleOverlay } from "./overlay.js";
import { colorScheme, getTheme } from "./theme.js";
import { USAGE_STORAGE_KEY, forgetUrls, recordUsage } from "./usage.js";

// タブや履歴に残るパレットの URL。拡張機能の ID が入る。
const paletteUrl = `chrome-extension://${chrome.runtime.id}/palette.html`;
// ページに重ねる iframe の URL。use_dynamic_url により、ID の代わりに起動ごとに変わる値が入るので、
// サイトが palette.html を読み込んで拡張機能を入れているか調べることはできない。
const embedUrl = chrome.runtime.getURL("palette.html");

// 今のページの上にパレットを開く。chrome:// などスクリプトを入れられないページでは、新しいタブで開く。
// パレットには一度だけ使える合言葉で開いたタブを渡し、他のサイトに埋め込まれたときは動かないようにする。
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "open-palette" || !tab?.id) return;
  if ((tab.url ?? tab.pendingUrl ?? "").startsWith(paletteUrl)) return;
  const token = crypto.randomUUID();
  const key = `overlay:${token}`;
  // ページに重ねたパレットは localStorage が分けられることがあるので、テーマは URL で渡す。
  const [theme] = await Promise.all([getTheme(), chrome.storage.session.set({ [key]: tab.id })]);
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: toggleOverlay,
      args: [`${embedUrl}?overlay=${token}&theme=${theme}`, colorScheme(theme)],
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

// パレットで選んだ記録は、ここだけで順番に書き換える。
// パレットと履歴の削除が同時に書くと、片方の変更が古い記録で上書きされる（消したページが残るなど）ため。
let usageWrites = Promise.resolve();

function updateUsage(change) {
  const write = usageWrites.then(async () => {
    const { [USAGE_STORAGE_KEY]: usage = {} } = await chrome.storage.local.get(USAGE_STORAGE_KEY);
    const next = change(usage);
    if (next !== usage) await chrome.storage.local.set({ [USAGE_STORAGE_KEY]: next });
    return next;
  });
  usageWrites = write.catch(() => {});
  return write;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "record-usage") return;
  updateUsage((usage) => recordUsage(usage, message.key, Date.now())).then(sendResponse, () => sendResponse(null));
  return true;
});

// 閲覧履歴から消したページは、パレットで選んだ記録からも消す。
chrome.history.onVisitRemoved.addListener((removed) => updateUsage((usage) => forgetUrls(usage, removed)));
