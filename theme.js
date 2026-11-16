// テーマ（システムに合わせる / ライト / ダーク）。Chrome API に依存しない判定と、設定の読み出し、画面への反映を置く。

export const THEMES = ["system", "light", "dark"];
export const DEFAULT_THEME = "system";
// theme-init.js が開いた直後に読む、localStorage のキー。
export const THEME_CACHE_KEY = "theme";

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : DEFAULT_THEME;
}

// CSS の color-scheme に入れる値。ページに重ねるときは iframe にも同じ値を付ける。
export function colorScheme(theme) {
  const normalized = normalizeTheme(theme);
  return normalized === "system" ? "light dark" : normalized;
}

// html の data-theme に入れる値。システムに合わせるときは付けない（null）。
export function themeAttribute(theme) {
  const normalized = normalizeTheme(theme);
  return normalized === "system" ? null : normalized;
}

export async function getTheme() {
  const { theme } = await chrome.storage.sync.get("theme");
  return normalizeTheme(theme);
}

export function applyTheme(theme, root = document.documentElement) {
  const attribute = themeAttribute(theme);
  if (attribute) root.dataset.theme = attribute;
  else delete root.dataset.theme;
}

// 新しいタブと設定画面で使う。保存したテーマを当て、次に開いたとき theme-init.js がすぐ当てられるよう localStorage に写す。
// 設定を変えたら、開いている画面にもすぐ当てる。
export async function syncTheme() {
  const set = (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_CACHE_KEY, normalizeTheme(theme));
    } catch {
      // 写せなくても、次に開いたときに一瞬システムの色になるだけ。
    }
  };
  // 読み出しを待つ間に変更が届いたら、古い読み出しで上書きしない。
  let changed = false;
  chrome.storage.sync.onChanged.addListener((changes) => {
    if (!changes.theme) return;
    changed = true;
    set(changes.theme.newValue);
  });
  const theme = await getTheme();
  if (!changed) set(theme);
}
