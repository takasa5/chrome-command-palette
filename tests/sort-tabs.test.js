import assert from "node:assert/strict";
import { test } from "node:test";
import { planDomainSort } from "../extension/sort-tabs.js";
import { NO_GROUP } from "../extension/tab-groups.js";

const tabsOf = (specs) => specs.map(([id, url, extra = {}], index) => ({ id, url, index, pinned: false, groupId: NO_GROUP, ...extra }));

test("ドメインの文字の順に並べ、先頭の www. は無視する", () => {
  const tabs = tabsOf([
    [1, "https://c.example/"],
    [2, "https://www.b.example/"],
    [3, "https://a.example/"],
  ]);
  assert.deepEqual(planDomainSort(tabs), { index: 0, tabIds: [3, 2, 1] });
});

test("同じドメインのタブは今の順を保つ", () => {
  const tabs = tabsOf([
    [1, "https://b.example/2"],
    [2, "https://a.example/"],
    [3, "https://www.b.example/1"],
  ]);
  assert.deepEqual(planDomainSort(tabs).tabIds, [2, 1, 3]);
});

test("ドメインを持たないタブは最後に、今の順のまま置く", () => {
  const tabs = tabsOf([
    [1, "chrome://settings"],
    [2, "https://b.example/"],
    [3, "file:///home/user/a.txt"],
    [4, "https://a.example/"],
  ]);
  assert.deepEqual(planDomainSort(tabs).tabIds, [4, 2, 1, 3]);
});

test("固定したタブとグループのタブは動かさず、並べたタブは固定したタブの直後に置く", () => {
  const tabs = tabsOf([
    [1, "https://z.example/", { pinned: true }],
    [2, "https://c.example/"],
    [3, "https://a.example/", { groupId: 7 }],
    [4, "https://b.example/", { groupId: 7 }],
    [5, "https://a.example/"],
  ]);
  assert.deepEqual(planDomainSort(tabs), { index: 1, tabIds: [5, 2] });
});

test("index の順で判断し、配列の並びには左右されない", () => {
  const tabs = tabsOf([
    [1, "https://z.example/", { pinned: true }],
    [2, "https://b.example/"],
    [3, "https://a.example/"],
  ]).reverse();
  assert.deepEqual(planDomainSort(tabs), { index: 1, tabIds: [3, 2] });
});

test("読み込み中のタブは移り先の URL（pendingUrl）で並べる", () => {
  const tabs = tabsOf([
    [1, "https://b.example/"],
    [2, "", { pendingUrl: "https://a.example/" }],
  ]);
  assert.deepEqual(planDomainSort(tabs).tabIds, [2, 1]);
});

test("並べ替えるタブが 2 つ未満なら null を返す", () => {
  assert.equal(planDomainSort([]), null);
  assert.equal(planDomainSort(tabsOf([[1, "https://a.example/"]])), null);
  const tabs = tabsOf([
    [1, "https://b.example/", { pinned: true }],
    [2, "https://a.example/", { groupId: 3 }],
    [3, "https://c.example/"],
  ]);
  assert.equal(planDomainSort(tabs), null);
});
