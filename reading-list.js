// Chrome のリーディングリスト。リーディングリストに入れられるのは http と https のページだけ。

import { t } from "./i18n.js";
import { normalize, scoreFields, stripUrl } from "./search.js";

export function canAddToReadingList(url) {
  return /^https?:\/\//i.test(url ?? "");
}

// 未読を先に、それぞれ新しく追加した順に並べる。
export function rankReadingList(query, entries) {
  const sorted = [...entries].sort((a, b) => a.hasBeenRead - b.hasBeenRead || b.creationTime - a.creationTime);
  if (!normalize(query)) return sorted;
  return sorted.filter((entry) => scoreFields(query, [{ text: entry.title }, { text: stripUrl(entry.url), weight: 0.7 }], { fuzzy: true }) > 0);
}

export async function addToReadingList(tab) {
  if (!canAddToReadingList(tab.url)) throw new Error(t("readingListCannotAdd"));
  const existing = await chrome.readingList.query({ url: tab.url });
  if (existing.length === 0) {
    await chrome.readingList.addEntry({ title: tab.title || tab.url, url: tab.url, hasBeenRead: false });
  }
}

export async function markAsRead(tab) {
  const [entry] = await chrome.readingList.query({ url: tab.url });
  if (!entry) throw new Error(t("readingListNotFound"));
  if (!entry.hasBeenRead) await chrome.readingList.updateEntry({ url: tab.url, hasBeenRead: true });
}

// コマンドから入る。キーワードはないので、Backspace で戻ると入力は空になる。
export const readingListScope = {
  keyword: "",
  get title() {
    return t("readingListTitle");
  },
  search: async (query) => {
    const entries = await chrome.readingList.query({});
    if (entries.length === 0) {
      return [{ kind: "readingList", key: "readingList:empty", title: t("readingListEmpty"), subtitle: t("readingListEmptyHint"), run: () => {} }];
    }
    return rankReadingList(query, entries).map((entry) => ({
      kind: "readingList",
      key: `readingList:${entry.url}`,
      title: entry.title || entry.url,
      subtitle: `${t(entry.hasBeenRead ? "readingListRead" : "readingListUnread")} · ${stripUrl(entry.url)}`,
      url: entry.url,
      run: (ctx) => ctx.navigate(entry.url),
    }));
  },
};
