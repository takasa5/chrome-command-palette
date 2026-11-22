// タブグループの操作。名前や色を付けるのに tabGroups 権限を使う。

import { t } from "./i18n.js";
import { normalize, scoreFields } from "./search.js";

// chrome.tabGroups.TAB_GROUP_ID_NONE と同じ値。テストでも使えるよう、ここに持つ。
export const NO_GROUP = -1;

// コマンドを出すかの判定と、実行するときの確認で同じものを使う。
export function isGrouped(tab) {
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

// ウィンドウのグループを、タブの並びで先に出てくる順に返す。タブのないグループは出さない。
// query があれば、グループの名前とタブのタイトルで絞り込む。
export function listTabGroups(query, groups, tabs) {
  const sorted = [...tabs].sort((a, b) => a.index - b.index);
  const listed = [];
  for (const tab of sorted) {
    if (!isGrouped(tab) || listed.some((entry) => entry.group.id === tab.groupId)) continue;
    const group = groups.find((g) => g.id === tab.groupId);
    if (!group) continue;
    const members = sorted.filter((other) => other.groupId === group.id);
    listed.push({ group, tabIds: members.map((other) => other.id), tabTitles: members.map((other) => other.title ?? "") });
  }
  if (!normalize(query)) return listed;
  return listed.filter(({ group, tabTitles }) => scoreFields(query, [{ text: group.title ?? "" }, ...tabTitles.map((text) => ({ text, weight: 0.5 }))], { fuzzy: true }) > 0);
}

// タブを閉じたあとに移るタブ。preferredId のタブが残るならそこへ、閉じるなら残るタブのうち最後に見ていたタブへ移る。
export function focusAfterClosing(tabs, closedIds, preferredId) {
  const closed = new Set(closedIds);
  if (preferredId !== undefined && preferredId !== null && !closed.has(preferredId)) return preferredId;
  const rest = tabs.filter((tab) => !closed.has(tab.id)).sort((a, b) => b.lastAccessed - a.lastAccessed);
  return rest[0]?.id ?? null;
}

async function closeTabs(ctx, tabIds) {
  const focusTabId = focusAfterClosing(ctx.windowTabs, tabIds, ctx.target?.id);
  await chrome.tabs.remove(tabIds);
  await ctx.leave(focusTabId);
}

// 今のタブが入っているグループのタブを、まとめて閉じる。
export async function closeCurrentTabGroup(ctx) {
  if (!ctx.target || !isGrouped(ctx.target)) throw new Error(t("tabNotInGroup"));
  const tabIds = ctx.windowTabs.filter((tab) => tab.groupId === ctx.target.groupId).map((tab) => tab.id);
  await closeTabs(ctx, tabIds);
}

// コマンドから入り、パレットのウィンドウのグループを選んで閉じる。
export const closeTabGroupScope = (windowId) => ({
  keyword: "",
  get title() {
    return t("closeTabGroupTitle");
  },
  search: async (query) => {
    const [groups, tabs] = await Promise.all([chrome.tabGroups.query({ windowId }), chrome.tabs.query({ windowId })]);
    const listed = listTabGroups(query, groups, tabs);
    if (listed.length === 0) {
      return [{ kind: "tabGroup", key: "tabGroup:none", title: t("noTabGroups"), subtitle: "", run: () => {} }];
    }
    return listed.map(({ group, tabIds, tabTitles }) => ({
      kind: "tabGroup",
      key: `tabGroup:${group.id}`,
      title: group.title || t("unnamedTabGroup"),
      subtitle: `${t("tabGroupTabCount", String(tabIds.length))} · ${tabTitles.join(" · ")}`,
      run: (ctx) => closeTabs(ctx, ctx.windowTabs.filter((tab) => tab.groupId === group.id).map((tab) => tab.id)),
    }));
  },
});

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
