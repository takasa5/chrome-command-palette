// 重複したタブの判定。Chrome API に依存しない。

// 同じページかどうかは、フラグメント（#...）を除いた URL で比べる。
// 読み込み中のタブは、移り先の URL（pendingUrl）で比べる。
// シークレットと通常のウィンドウは別のものとして扱う。
function pageKey(tab) {
  const url = tab.pendingUrl || tab.url;
  if (!url) return null;
  return `${tab.incognito ? "incognito" : "normal"} ${url.split("#")[0]}`;
}

// 残す優先順。keepTabIds（パレット自身と、開く前に見ていたタブ）、固定、表示中、並びの早いもの。
function keepRank(tab, keepTabIds) {
  if (keepTabIds.includes(tab.id)) return 0;
  if (tab.pinned) return 1;
  if (tab.active) return 2;
  return 3;
}

// 同じ URL のタブを 1 つずつ残し、閉じるタブを返す。固定したタブと keepTabIds のタブは閉じない。
export function findDuplicateTabs(tabs, { keepTabIds = [] } = {}) {
  const groups = new Map();
  for (const tab of tabs) {
    const key = pageKey(tab);
    if (key === null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }
  const duplicates = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // sort は安定なので、同じ順位なら並びの早いものが先に来る。
    const [, ...rest] = [...group].sort((a, b) => keepRank(a, keepTabIds) - keepRank(b, keepTabIds));
    duplicates.push(...rest.filter((tab) => !tab.pinned && !keepTabIds.includes(tab.id)));
  }
  return duplicates;
}
