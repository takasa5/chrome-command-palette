// お気に入り: 1 つのタブで開いておくサイト。開いているタブがあればそこへ移り、なければ開く。
// 名前と別名で引け、同じ当たり方のタブやブックマークより上に出る。設定画面で編集でき、未設定のうちは初期値を使う。

import { isJapanese, t } from "./i18n.js";

// Google ドキュメントなどは、個別のファイルのタブをホームの代わりにしないよう、ホームの URL にしておく。
export const DEFAULT_FAVORITES = [
  { title: "Gmail", url: "https://mail.google.com/", keywords: ["mail", "メール"] },
  { title: "Google Calendar", url: "https://calendar.google.com/", keywords: ["calendar", "gcal", "カレンダー", "予定"] },
  { title: "Google Maps", url: "https://www.google.com/maps", keywords: ["map", "マップ", "地図", "ちず"] },
  { title: "Google Drive", url: "https://drive.google.com/", keywords: ["drive", "ドライブ"] },
  { title: "Google Docs", url: "https://docs.google.com/document/u/0/", keywords: ["docs", "ドキュメント"] },
  { title: "Google Sheets", url: "https://docs.google.com/spreadsheets/u/0/", keywords: ["sheets", "spreadsheet", "スプレッドシート", "表計算"] },
  { title: "Google Slides", url: "https://docs.google.com/presentation/u/0/", keywords: ["slides", "presentation", "スライド"] },
  { title: "Google Meet", url: "https://meet.google.com/", keywords: ["meet", "ミート", "会議"] },
  { title: "Google Photos", url: "https://photos.google.com/", keywords: ["photos", "フォト", "写真"] },
  { title: "Google Translate", url: "https://translate.google.com/", keywords: ["translate", "翻訳", "ほんやく"] },
];

// 日本語の別名は、日本語の環境でだけ初期値に入れる。ほかの言語の設定画面に日本語が並ばないようにする。
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
export function defaultFavorites(japanese = isJapanese()) {
  if (japanese) return DEFAULT_FAVORITES;
  return DEFAULT_FAVORITES.map((favorite) => ({ ...favorite, keywords: favorite.keywords.filter((keyword) => !JAPANESE.test(keyword)) }));
}

// javascript: などは開くとページ内でスクリプトが動くので、http と https だけを URL とみなす。
function isWebUrl(text) {
  return URL.canParse(text) && /^https?:$/.test(new URL(text).protocol);
}

// 1 行に「名前 URL 別名…」。名前には空白を含められ、最初の URL より前を名前、後ろを別名とする。
// 不正な行は favorites に入れず、行番号付きの理由を errors に返す。同じ URL は先の行を残す。
export function parseFavorites(text) {
  const favorites = [];
  const errors = [];
  const used = new Set();
  text.split("\n").forEach((line, index) => {
    const fail = (message) => errors.push(t("lineError", index + 1, message));
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;
    const at = tokens.findIndex(isWebUrl);
    if (at === -1) return fail(t("favoritesNoUrl"));
    if (at === 0) return fail(t("favoritesNoName"));
    const url = tokens[at];
    if (used.has(url)) return fail(t("favoritesDuplicateUrl", url));
    used.add(url);
    favorites.push({ title: tokens.slice(0, at).join(" "), url, keywords: tokens.slice(at + 1) });
  });
  return { favorites, errors };
}

export function formatFavorites(favorites) {
  return favorites.map(({ title, url, keywords }) => [title, url, ...keywords].join(" ")).join("\n");
}

export async function getFavorites() {
  const { favorites } = await chrome.storage.sync.get("favorites");
  return favorites ?? defaultFavorites();
}

// Google のサービスは /u/0/、/u/1/ のようにパスにアカウントの番号が入るので、番号を区別せずに比べる。
// 番号の部分だけを置き換え、/document/u/0/（ホーム）と /document/d/…（個別のファイル）は区別したままにする。
export function withoutAccountNumber(url) {
  return url.replace(/\/u\/\d+(?=\/|$)/g, "/u/*");
}

// URL で始まるタブを再利用する。今のウィンドウのタブを優先する。
export function findFavoriteTab(tabs, favorite, windowId) {
  const prefix = withoutAccountNumber(favorite.url);
  const open = tabs.filter((tab) => tab.url && withoutAccountNumber(tab.url).startsWith(prefix));
  return open.find((tab) => tab.windowId === windowId) ?? open[0] ?? null;
}
