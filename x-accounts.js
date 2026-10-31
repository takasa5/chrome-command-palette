// X のアカウント切り替え。X の画面構成への依存はこのファイルに閉じ込める。

import { normalize, scoreFields } from "./search.js";

const HOME_URL = "https://x.com/home";

export function parseAccounts(text) {
  return [...new Set(text.split(/[\s,]+/).map((line) => line.replace(/^@/, "")).filter(Boolean))];
}

export function filterAccounts(query, accounts) {
  if (!normalize(query)) return accounts;
  return accounts.filter((handle) => scoreFields(query, [{ text: handle }], { fuzzy: true }) > 0);
}

export async function getAccounts() {
  const { xAccounts = [] } = await chrome.storage.sync.get("xAccounts");
  return xAccounts;
}

// X のページ内で実行するので、外の変数を参照できない。handle が null ならメニューのアカウント名を返す。
// メニューの UserCell のうち、今のアカウントは LI、切り替え先は BUTTON になっている。
// おすすめのユーザーも UserCell なので、メニュー（HoverCard）の中だけを見る。
async function useAccountMenu(handle) {
  const waitFor = async (find) => {
    for (let i = 0; i < 50; i++) {
      const found = find();
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return null;
  };
  const opener = await waitFor(() => document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]'));
  if (!opener) return [];
  opener.click();
  const findCells = () => [...document.querySelectorAll('[data-testid="HoverCard"] [data-testid="UserCell"]')];
  const cells = (await waitFor(() => (findCells().length > 0 ? findCells() : null))) ?? [];
  const handleOf = (cell) => [...cell.querySelectorAll("span")].map((span) => span.textContent).find((text) => /^@\w+$/.test(text))?.slice(1);
  if (handle === null) return cells.map(handleOf).filter(Boolean);
  const cell = cells.find((candidate) => handleOf(candidate)?.toLowerCase() === handle.toLowerCase());
  if (!cell) throw new Error(`X のメニューから @${handle} を見つけられません`);
  if (cell.tagName === "LI") location.reload();
  else cell.click();
  return [];
}

function waitForXPage(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(id, change, tab) {
      if (id !== tabId || change.status !== "complete" || !tab.url?.startsWith("https://x.com/")) return;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    });
  });
}

export async function switchAccount(tabId, handle) {
  const loaded = waitForXPage(tabId);
  await chrome.tabs.update(tabId, { url: HOME_URL });
  await loaded;
  await chrome.scripting.executeScript({ target: { tabId }, func: useAccountMenu, args: [handle] });
}

// 裏のタブだとメニューが描画されないことがあるので、一時的に表へ出して読む。
export async function readAccountsFromX() {
  const self = await chrome.tabs.getCurrent();
  const tab = await chrome.tabs.create({ url: HOME_URL, index: self.index + 1 });
  try {
    await waitForXPage(tab.id);
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: useAccountMenu, args: [null] });
    return result;
  } finally {
    await chrome.tabs.update(self.id, { active: true });
    await chrome.tabs.remove(tab.id);
  }
}

export const xScope = {
  keyword: "x",
  title: "X のアカウント",
  hint: "Tab で X のアカウントを選ぶ",
  search: async (query) => {
    const accounts = await getAccounts();
    if (accounts.length === 0) {
      return [{ kind: "account", key: "account:settings", title: "アカウントが未登録です", subtitle: "設定画面で X から読み込む", run: (ctx) => ctx.navigate(chrome.runtime.getURL("options.html")) }];
    }
    return filterAccounts(query, accounts).map((handle) => ({
      kind: "account",
      key: `account:${handle}`,
      title: `@${handle}`,
      subtitle: "このアカウントのホームを開く",
      // パレットのタブは遷移で消えるので、切り替えは background.js に任せる。
      run: (ctx) => chrome.runtime.sendMessage({ type: "switch-x-account", tabId: ctx.self.id, handle }),
    }));
  },
};
