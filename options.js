import { formatEngines, getEngines, parseEngines } from "./site-search.js";
import { getStaleHours } from "./stale-tabs.js";
import { getAccounts, parseAccounts, readAccountsFromX, xScope } from "./x-accounts.js";

const input = document.getElementById("stale-hours");
const accounts = document.getElementById("x-accounts");
const readButton = document.getElementById("read-x-accounts");
const siteSearch = document.getElementById("site-search");
const siteSearchErrors = document.getElementById("site-search-errors");
const toast = document.getElementById("toast");

const savedEngines = await getEngines();
let savedEnginesJson = JSON.stringify(savedEngines);

input.value = await getStaleHours();
accounts.value = (await getAccounts()).join("\n");
siteSearch.value = formatEngines(savedEngines);

accounts.addEventListener("input", () => chrome.storage.sync.set({ xAccounts: parseAccounts(accounts.value) }));

siteSearch.addEventListener("input", async () => {
  const { engines, errors } = parseEngines(siteSearch.value, [xScope.keyword]);
  siteSearchErrors.textContent = errors.join("\n");
  // storage.sync は書き込み回数に上限があるので、登録内容が変わったときだけ保存する。
  const json = JSON.stringify(engines);
  if (json === savedEnginesJson) return;
  try {
    await chrome.storage.sync.set({ siteSearchEngines: engines });
    savedEnginesJson = json;
  } catch (error) {
    siteSearchErrors.textContent = `保存できませんでした: ${error.message}`;
  }
});

readButton.addEventListener("click", async () => {
  readButton.disabled = true;
  toast.textContent = "";
  try {
    const handles = await readAccountsFromX();
    if (handles.length === 0) throw new Error("読み込めませんでした。X にログインしているか確認してください");
    accounts.value = handles.join("\n");
    await chrome.storage.sync.set({ xAccounts: handles });
  } catch (error) {
    toast.textContent = error.message;
  } finally {
    readButton.disabled = false;
  }
});

input.addEventListener("input", async () => {
  // 0 以下だと実行のたびにほとんどのタブが閉じてしまう。
  if (!(input.valueAsNumber > 0)) {
    toast.textContent = "0 より大きい数を入力してください";
    return;
  }
  toast.textContent = "";
  await chrome.storage.sync.set({ staleHours: input.valueAsNumber });
});
