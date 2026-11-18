// 放置されたタブの判定。Chrome API に依存しない判定と、設定の読み出しを置く。

export const DEFAULT_STALE_HOURS = 6;
const HOUR_MS = 60 * 60 * 1000;
const NO_GROUP = -1; // chrome.tabGroups.TAB_GROUP_ID_NONE。tabGroups 権限なしでは参照できない

export async function getStaleHours() {
  const { staleHours = DEFAULT_STALE_HOURS } = await chrome.storage.sync.get("staleHours");
  return staleHours;
}

// lastAccessed はタブを表示し始めた時刻で、離れても更新されない。
// 長く見ていたタブを離れた直後に閉じないよう、leftAt（タブ ID ごとの離れた時刻）も見る。
export function findStaleTabs(tabs, { now, hours, leftAt = {}, keepTabId = null }) {
  return tabs.filter((tab) => {
    if (tab.active || tab.pinned || tab.audible || tab.groupId !== NO_GROUP || tab.id === keepTabId) return false;
    return now - Math.max(tab.lastAccessed, leftAt[tab.id] ?? 0) >= hours * HOUR_MS;
  });
}
