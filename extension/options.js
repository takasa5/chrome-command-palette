import { getNewWindowPins } from "./commands.js";
import { defaultFavorites, formatFavorites, getFavorites, parseFavorites } from "./favorites.js";
import { isJapanese, t } from "./i18n.js";
import { favoritePreview, formatHours, siteSearchPreview, staleTabsPreview } from "./options-preview.js";
import { formatEngines, getEngines, parseEngines } from "./site-search.js";
import { getStaleSettings } from "./stale-tabs.js";
import { getTheme, syncTheme } from "./theme.js";

const theme = document.getElementById("theme");
const input = document.getElementById("stale-hours");
const staleEnabled = document.getElementById("stale-enabled");
const stalePinned = document.getElementById("stale-pinned");
const staleGrouped = document.getElementById("stale-grouped");
const newWindowPins = document.getElementById("new-window-pins");
const siteSearch = document.getElementById("site-search");
const siteSearchErrors = document.getElementById("site-search-errors");
const favorites = document.getElementById("favorites");
const favoritesErrors = document.getElementById("favorites-errors");
const resetFavorites = document.getElementById("reset-favorites");
const staleHoursError = document.getElementById("stale-hours-error");
const swatches = [...document.querySelectorAll("[data-theme-value]")];
const stalePreview = document.querySelector(".stale-preview");
const pinsPreview = document.querySelector(".pins-preview");
const favoritesPreview = document.querySelector(".favorites-preview");
const siteSearchPreviewBox = document.querySelector(".site-search-preview");

// 各項目の右の図を、今の設定に合わせて描き直す。保存とは別に、入力のたびに呼ぶ。
function drawTheme() {
  for (const swatch of swatches) swatch.setAttribute("aria-pressed", String(swatch.dataset.themeValue === theme.value));
}

const TAB_COLORS = ["#378add", "#1d9e75", "#d4537e", "#7f77dd"];
// 不正な値は保存しないので、図は保存してある値のまま残し、薄くして「まだ効いていない」ことを示す。
// オフのときは、時間と巻き込む範囲を変えても効かないので、入力欄を無効にし、図も薄くする。
function drawStaleTabs() {
  for (const control of [input, stalePinned, staleGrouped]) control.disabled = !staleEnabled.checked;
  const valid = input.valueAsNumber > 0;
  stalePreview.classList.toggle("sample", !valid || !staleEnabled.checked);
  if (!valid) return;
  const { threshold, tabs } = staleTabsPreview(input.valueAsNumber);
  stalePreview.style.setProperty("--x", threshold);
  stalePreview.querySelector(".stale-label span").textContent = formatHours(input.valueAsNumber);
  stalePreview.querySelector(".stale-tabs").replaceChildren(
    ...tabs.map(({ age, position, stale }, index) => {
      const tab = document.createElement("div");
      tab.className = stale ? "stale-tab stale" : "stale-tab";
      tab.style.setProperty("--x", position);
      tab.innerHTML = stale
        ? `<span class="box"><svg class="i"><use href="#i-x" /></svg></span>`
        : `<span class="box"><span class="dot" style="background: ${TAB_COLORS[index % TAB_COLORS.length]}"></span></span>`;
      tab.append(formatHours(age));
      return tab;
    }),
  );
}

function drawPins() {
  pinsPreview.classList.toggle("on", newWindowPins.checked);
}

// 登録がないときは、図を空にせず、見本を薄く出す。
function drawFavorites(list) {
  const preview = favoritePreview(list);
  const shown = preview ?? favoritePreview(defaultFavorites(isJapanese()));
  favoritesPreview.classList.toggle("sample", !preview);
  favoritesPreview.querySelector(".query").textContent = shown.query;
  favoritesPreview.querySelector(".title").textContent = shown.title;
}

function drawSiteSearch(engines) {
  const preview = siteSearchPreview(engines);
  const shown = preview ?? siteSearchPreview(parseEngines(siteSearch.placeholder, t).engines);
  siteSearchPreviewBox.classList.toggle("sample", !preview);
  siteSearchPreviewBox.querySelector(".keyword").textContent = shown.keyword;
  siteSearchPreviewBox.querySelector(".chip").textContent = shown.name;
}

// 読み込みを待つ間に選ばれても保存できるよう、どの await よりも先にリスナーを付ける。
// 保存すると syncTheme が storage の変更を受けて、この画面にも当てる。
let themeChosen = false;
theme.addEventListener("change", () => {
  themeChosen = true;
  drawTheme();
  chrome.storage.sync.set({ theme: theme.value });
});
// 見本を押しても、セレクトで選んだのと同じに扱う。
for (const swatch of swatches) {
  swatch.addEventListener("click", () => {
    theme.value = swatch.dataset.themeValue;
    theme.dispatchEvent(new Event("change"));
  });
}
syncTheme();

const savedEngines = await getEngines();
let savedEnginesJson = JSON.stringify(savedEngines);

const savedTheme = await getTheme();
if (!themeChosen) theme.value = savedTheme;
const staleSettings = await getStaleSettings();
staleEnabled.checked = staleSettings.staleTabsEnabled;
input.value = staleSettings.staleHours;
stalePinned.checked = staleSettings.staleIncludePinned;
staleGrouped.checked = staleSettings.staleIncludeGrouped;
newWindowPins.checked = await getNewWindowPins();
siteSearch.value = formatEngines(savedEngines);
favorites.value = formatFavorites(await getFavorites());
drawTheme();
drawStaleTabs();
drawPins();
drawSiteSearch(savedEngines);

for (const [checkbox, key] of [
  [staleEnabled, "staleTabsEnabled"],
  [stalePinned, "staleIncludePinned"],
  [staleGrouped, "staleIncludeGrouped"],
]) {
  checkbox.addEventListener("change", () => {
    drawStaleTabs();
    chrome.storage.sync.set({ [key]: checkbox.checked });
  });
}

newWindowPins.addEventListener("change", () => {
  drawPins();
  chrome.storage.sync.set({ newWindowPins: newWindowPins.checked });
});

// 1 つでも直すと初期値ではなく、この一覧を保存して使う。空にすればお気に入りはなくなる。
const initialFavorites = parseFavorites(favorites.value, t).favorites;
let savedFavoritesJson = JSON.stringify(initialFavorites);
drawFavorites(initialFavorites);

async function saveFavorites() {
  const parsed = parseFavorites(favorites.value, t);
  favoritesErrors.textContent = parsed.errors.join("\n");
  drawFavorites(parsed.favorites);
  const json = JSON.stringify(parsed.favorites);
  if (json === savedFavoritesJson) return;
  try {
    await chrome.storage.sync.set({ favorites: parsed.favorites });
    savedFavoritesJson = json;
  } catch (error) {
    favoritesErrors.textContent = t("saveFailed", error.message);
  }
}

favorites.addEventListener("input", saveFavorites);

resetFavorites.addEventListener("click", async () => {
  favorites.value = formatFavorites(defaultFavorites(isJapanese()));
  favoritesErrors.textContent = "";
  drawFavorites(defaultFavorites(isJapanese()));
  // 初期値が変わったときに追いつけるよう、保存した一覧を消して初期値に任せる。
  await chrome.storage.sync.remove("favorites");
  savedFavoritesJson = JSON.stringify(defaultFavorites(isJapanese()));
});

siteSearch.addEventListener("input", async () => {
  const { engines, errors } = parseEngines(siteSearch.value, t);
  siteSearchErrors.textContent = errors.join("\n");
  drawSiteSearch(engines);
  // storage.sync は書き込み回数に上限があるので、登録内容が変わったときだけ保存する。
  const json = JSON.stringify(engines);
  if (json === savedEnginesJson) return;
  try {
    await chrome.storage.sync.set({ siteSearchEngines: engines });
    savedEnginesJson = json;
  } catch (error) {
    siteSearchErrors.textContent = t("saveFailed", error.message);
  }
});

input.addEventListener("input", async () => {
  // 0 以下だと実行のたびにほとんどのタブが閉じてしまう。
  if (!(input.valueAsNumber > 0)) {
    staleHoursError.textContent = t("staleHoursInvalid");
    drawStaleTabs();
    return;
  }
  staleHoursError.textContent = "";
  drawStaleTabs();
  await chrome.storage.sync.set({ staleHours: input.valueAsNumber });
});
