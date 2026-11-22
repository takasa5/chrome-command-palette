// パレットで候補を選んだ回数と最後に選んだ時刻から、よく選ぶ候補を上に出すための点数を出す。
// Chrome API に依存しない純粋関数だけを置く。記録は chrome.storage.local に置き、外部へは送らない。

export const USAGE_STORAGE_KEY = "usage";
// 一致の点数（前方一致 80、単語の先頭 60、途中 40）の差より小さくし、同じくらい一致する候補の間だけで順番を変える。
export const MAX_USAGE_BONUS = 10;
const BONUS_PER_DOUBLING = 4;
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
// 入力した語で作る URL（サイト内検索）や、中身が入れ替わるリーディングリストは記録しない。
const RECORDED_KINDS = new Set(["command", "favorite", "tab", "closedTab", "folder", "bookmark", "history", "url"]);

// 同じページはタブ、ブックマーク、最近閉じたタブ、履歴のどれで選んでも同じものとして数える。
export function usageKey(item) {
  if (!RECORDED_KINDS.has(item?.kind)) return null;
  if (item.kind === "command") return `command:${item.command.id}`;
  if (item.kind === "folder") return `folder:${item.folder.id}`;
  return item.url ? `url:${item.url}` : null;
}

// 選んだ回数が倍になるごとに点数を足し、最後に選んでから半減期ごとに半分にする。
export function usageBonus(entry, now) {
  if (!entry?.count) return 0;
  const age = Math.max(0, now - (entry.lastUsed ?? 0));
  const frequency = Math.min(MAX_USAGE_BONUS, BONUS_PER_DOUBLING * Math.log2(1 + entry.count));
  return frequency * 0.5 ** (age / HALF_LIFE_MS);
}

export function itemUsageBonus(item, usage, now) {
  const key = usageKey(item);
  return key && usage ? usageBonus(usage[key], now) : 0;
}

// key（usageKey）の候補を選んだことを記録した新しいオブジェクトを返す。件数が上限を超えたら、点数の低いものから消す。
export function recordUsage(usage, key, now, maxEntries = MAX_ENTRIES) {
  if (typeof key !== "string" || !key) return usage;
  const next = { ...usage, [key]: { count: (usage[key]?.count ?? 0) + 1, lastUsed: now } };
  const keys = Object.keys(next);
  if (keys.length <= maxEntries) return next;
  const kept = keys.sort((a, b) => usageBonus(next[b], now) - usageBonus(next[a], now)).slice(0, maxEntries);
  return Object.fromEntries(kept.map((k) => [k, next[k]]));
}

// 閲覧履歴から消したページは、選んだ記録からも消す。allHistory なら全部消す。
export function forgetUrls(usage, { allHistory = false, urls = [] }) {
  if (allHistory) return Object.fromEntries(Object.entries(usage).filter(([key]) => !key.startsWith("url:")));
  const removed = new Set(urls.map((url) => `url:${url}`));
  return Object.fromEntries(Object.entries(usage).filter(([key]) => !removed.has(key)));
}

// 点数の高い順に並べ直す。同点なら元の順番を保つ。
export function sortByUsage(items, usage, now) {
  return items
    .map((item, index) => ({ item, index, bonus: itemUsageBonus(item, usage, now) }))
    .sort((a, b) => b.bonus - a.bonus || a.index - b.index)
    .map(({ item }) => item);
}
