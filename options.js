import { getNewWindowPins } from "./commands.js";
import { formatEngines, getEngines, parseEngines } from "./site-search.js";
import { getStaleHours } from "./stale-tabs.js";

const input = document.getElementById("stale-hours");
const newWindowPins = document.getElementById("new-window-pins");
const siteSearch = document.getElementById("site-search");
const siteSearchErrors = document.getElementById("site-search-errors");
const toast = document.getElementById("toast");

const savedEngines = await getEngines();
let savedEnginesJson = JSON.stringify(savedEngines);

input.value = await getStaleHours();
newWindowPins.checked = await getNewWindowPins();
siteSearch.value = formatEngines(savedEngines);

newWindowPins.addEventListener("change", () => chrome.storage.sync.set({ newWindowPins: newWindowPins.checked }));

siteSearch.addEventListener("input", async () => {
  const { engines, errors } = parseEngines(siteSearch.value);
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

input.addEventListener("input", async () => {
  // 0 以下だと実行のたびにほとんどのタブが閉じてしまう。
  if (!(input.valueAsNumber > 0)) {
    toast.textContent = "0 より大きい数を入力してください";
    return;
  }
  toast.textContent = "";
  await chrome.storage.sync.set({ staleHours: input.valueAsNumber });
});
