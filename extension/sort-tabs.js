// タブをドメイン順に並べ替える順番を決める。Chrome API に依存しない。

import { groupDomain, isGrouped } from "./tab-groups.js";

// 並べ替えの対象は、固定していない、グループに入っていないタブ。
// ドメイン（groupDomain と同じく先頭の www. を外したホスト名）の文字の順に並べ、
// 同じドメインの中と、ドメインを持たないタブ（chrome:// や file: など。最後に置く）は今の順を保つ。
// 並べたタブは固定したタブの直後へまとめて置く。グループは中の順を変えず、その後ろに続く。
// 返す index は chrome.tabs.move に渡す移し先。並べ替えるものが 2 つ未満なら null を返す。
export function planDomainSort(tabs) {
  const sorted = [...tabs].sort((a, b) => a.index - b.index);
  const index = sorted.filter((tab) => tab.pinned).length;
  const targets = sorted
    .filter((tab) => !tab.pinned && !isGrouped(tab))
    .map((tab) => ({ id: tab.id, domain: groupDomain(tab.pendingUrl || tab.url) }));
  if (targets.length < 2) return null;
  // sort は安定なので、同じドメインなら今の順のまま残る。
  targets.sort((a, b) => {
    if (a.domain === b.domain) return 0;
    if (a.domain === null) return 1;
    if (b.domain === null) return -1;
    return a.domain < b.domain ? -1 : 1;
  });
  return { index, tabIds: targets.map((target) => target.id) };
}
