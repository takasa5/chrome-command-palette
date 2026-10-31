import { getStaleHours } from "./stale-tabs.js";
import { getAccounts, parseAccounts, readAccountsFromX } from "./x-accounts.js";

const input = document.getElementById("stale-hours");
const accounts = document.getElementById("x-accounts");
const readButton = document.getElementById("read-x-accounts");
const toast = document.getElementById("toast");

input.value = await getStaleHours();
accounts.value = (await getAccounts()).join("\n");

accounts.addEventListener("input", () => chrome.storage.sync.set({ xAccounts: parseAccounts(accounts.value) }));

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
