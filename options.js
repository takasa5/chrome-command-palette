import { getNewWindowPins } from "./commands.js";
import { DEFAULT_FAVORITES, formatFavorites, getFavorites, parseFavorites } from "./favorites.js";
import { formatEngines, getEngines, parseEngines } from "./site-search.js";
import { getStaleHours } from "./stale-tabs.js";
import { getTheme, syncTheme } from "./theme.js";

const theme = document.getElementById("theme");
const input = document.getElementById("stale-hours");
const newWindowPins = document.getElementById("new-window-pins");
const siteSearch = document.getElementById("site-search");
const siteSearchErrors = document.getElementById("site-search-errors");
const favorites = document.getElementById("favorites");
const favoritesErrors = document.getElementById("favorites-errors");
const resetFavorites = document.getElementById("reset-favorites");
const toast = document.getElementById("toast");

// 読み込みを待つ間に選ばれても保存できるよう、どの await よりも先にリスナーを付ける。
// 保存すると syncTheme が storage の変更を受けて、この画面にも当てる。
let themeChosen = false;
theme.addEventListener("change", () => {
  themeChosen = true;
  chrome.storage.sync.set({ theme: theme.value });
});
syncTheme();

const savedEngines = await getEngines();
let savedEnginesJson = JSON.stringify(savedEngines);

const savedTheme = await getTheme();
if (!themeChosen) theme.value = savedTheme;
input.value = await getStaleHours();
newWindowPins.checked = await getNewWindowPins();
siteSearch.value = formatEngines(savedEngines);
favorites.value = formatFavorites(await getFavorites());

newWindowPins.addEventListener("change", () => chrome.storage.sync.set({ newWindowPins: newWindowPins.checked }));

// 1 つでも直すと初期値ではなく、この一覧を保存して使う。空にすればお気に入りはなくなる。
let savedFavoritesJson = JSON.stringify(parseFavorites(favorites.value).favorites);

async function saveFavorites() {
  const parsed = parseFavorites(favorites.value);
  favoritesErrors.textContent = parsed.errors.join("\n");
  const json = JSON.stringify(parsed.favorites);
  if (json === savedFavoritesJson) return;
  try {
    await chrome.storage.sync.set({ favorites: parsed.favorites });
    savedFavoritesJson = json;
  } catch (error) {
    favoritesErrors.textContent = `保存できませんでした: ${error.message}`;
  }
}

favorites.addEventListener("input", saveFavorites);

resetFavorites.addEventListener("click", async () => {
  favorites.value = formatFavorites(DEFAULT_FAVORITES);
  favoritesErrors.textContent = "";
  // 初期値が変わったときに追いつけるよう、保存した一覧を消して初期値に任せる。
  await chrome.storage.sync.remove("favorites");
  savedFavoritesJson = JSON.stringify(DEFAULT_FAVORITES);
});

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
