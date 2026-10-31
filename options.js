import { getStaleHours } from "./stale-tabs.js";

const input = document.getElementById("stale-hours");
const toast = document.getElementById("toast");

input.value = await getStaleHours();

input.addEventListener("input", async () => {
  // 0 以下だと実行のたびにほとんどのタブが閉じてしまう。
  if (!(input.valueAsNumber > 0)) {
    toast.textContent = "0 より大きい数を入力してください";
    return;
  }
  toast.textContent = "";
  await chrome.storage.sync.set({ staleHours: input.valueAsNumber });
});
