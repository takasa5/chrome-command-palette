import assert from "node:assert/strict";
import { test } from "node:test";
import { findStaleTabs } from "../stale-tabs.js";

const HOUR = 60 * 60 * 1000;
const now = 100 * HOUR;
const tab = (id, hoursAgo, extra = {}) => ({ id, lastAccessed: now - hoursAgo * HOUR, active: false, pinned: false, audible: false, ...extra });
const ids = (tabs, options = {}) => findStaleTabs(tabs, { now, hours: 6, ...options }).map((t) => t.id);

test("しきい値以上見ていないタブだけを返す", () => {
  assert.deepEqual(ids([tab(1, 7), tab(2, 6), tab(3, 5)]), [1, 2]);
});

test("表示中、固定、音が出ているタブは残す", () => {
  assert.deepEqual(ids([tab(1, 7, { active: true }), tab(2, 7, { pinned: true }), tab(3, 7, { audible: true })]), []);
});

test("パレットを開く前に見ていたタブは残す", () => {
  assert.deepEqual(ids([tab(1, 7), tab(2, 7)], { keepTabId: 1 }), [2]);
});

test("長く見ていて離れたばかりのタブは残す", () => {
  assert.deepEqual(ids([tab(1, 7), tab(2, 7)], { leftAt: { 1: now - HOUR } }), [2]);
});

test("離れてからしきい値を過ぎたタブは閉じる", () => {
  assert.deepEqual(ids([tab(1, 9)], { leftAt: { 1: now - 7 * HOUR } }), [1]);
});
