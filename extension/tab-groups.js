// タブグループの操作。名前や色を付けるのに tabGroups 権限を使う。

import { t } from "./i18n.js";

// chrome.tabGroups.TAB_GROUP_ID_NONE と同じ値。テストでも使えるよう、ここに持つ。
export const NO_GROUP = -1;

function isGrouped(tab) {
  return tab.groupId !== undefined && tab.groupId !== NO_GROUP;
}

// グループ名にするドメイン。http と https のページだけを対象にし、先頭の www. は外す。
export function groupDomain(url) {
  if (!URL.canParse(url ?? "")) return null;
  const { protocol, hostname } = new URL(url);
  if (!/^https?:$/.test(protocol) || !hostname) return null;
  return hostname.replace(/^www\./, "");
}

// 同じウィンドウのタブをドメインごとに振り分ける。
// 固定したタブと、すでにグループに入っているタブは動かさない。
// 同じ名前のグループがあればそこへ入れ、なければ 2 つ以上あるドメインだけで新しいグループを作る。
// 返す順は、ドメインのタブが最初に出てくる順。
export function planDomainGroups(tabs, groups = []) {
  const byDomain = new Map();
  for (const tab of [...tabs].sort((a, b) => a.index - b.index)) {
    if (tab.pinned || isGrouped(tab)) continue;
    const domain = groupDomain(tab.pendingUrl || tab.url);
    if (!domain) continue;
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push(tab.id);
  }
  const plans = [];
  for (const [domain, tabIds] of byDomain) {
    const groupId = groups.find((group) => group.title === domain)?.id;
    if (groupId === undefined && tabIds.length < 2) continue;
    plans.push(groupId === undefined ? { title: domain, tabIds } : { title: domain, tabIds, groupId });
  }
  return plans;
}

async function groupTab(ctx, title) {
  if (!ctx.target) throw new Error(t("noTabToGroup"));
  if (ctx.target.pinned) throw new Error(t("cannotGroupPinnedTab"));
  const groupId = await chrome.tabs.group({ tabIds: [ctx.target.id], createProperties: { windowId: ctx.target.windowId } });
  if (title) await chrome.tabGroups.update(groupId, { title });
  await ctx.leave();
}

export async function ungroupTab(ctx) {
  if (!ctx.target || !isGrouped(ctx.target)) throw new Error(t("tabNotInGroup"));
  await chrome.tabs.ungroup(ctx.target.id);
  await ctx.leave();
}

export async function groupTabsByDomain(ctx) {
  const groups = await chrome.tabGroups.query({ windowId: ctx.self.windowId });
  const plans = planDomainGroups(ctx.windowTabs, groups);
  if (plans.length === 0) throw new Error(t("noTabsToGroupByDomain"));
  for (const { title, tabIds, groupId } of plans) {
    if (groupId !== undefined) {
      await chrome.tabs.group({ tabIds, groupId });
    } else {
      const created = await chrome.tabs.group({ tabIds, createProperties: { windowId: ctx.self.windowId } });
      await chrome.tabGroups.update(created, { title });
    }
  }
  await ctx.leave();
}

// コマンドから入り、入力した語を新しいグループの名前にする。空のまま Enter なら名前なしで作る。
export const groupTabScope = {
  keyword: "",
  get title() {
    return t("groupTabTitle");
  },
  search: async (query) => {
    const title = query.trim();
    return [
      {
        kind: "tabGroup",
        key: "tabGroup:new",
        title: title ? t("groupTabNamed", title) : t("groupTabUnnamed"),
        subtitle: t("groupTabHint"),
        run: (ctx) => groupTab(ctx, title),
      },
    ];
  },
};
