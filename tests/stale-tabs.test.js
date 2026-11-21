import assert from "node:assert/strict";
import { test } from "node:test";
import { findStaleTabs } from "../extension/stale-tabs.js";

const HOUR = 60 * 60 * 1000;
const now = 100 * HOUR;
const tab = (id, hoursAgo, extra = {}) => ({ id, lastAccessed: now - hoursAgo * HOUR, active: false, pinned: false, audible: false, groupId: -1, ...extra });
const ids = (tabs, options = {}) => findStaleTabs(tabs, { now, hours: 6, ...options }).map((t) => t.id);

test("しきい値以上見ていないタブだけを返す", () => {
  assert.deepEqual(ids([tab(1, 7), tab(2, 6), tab(3, 5)]), [1, 2]);
});

test("表示中、固定、音が出ているタブは残す", () => {
  assert.deepEqual(ids([tab(1, 7, { active: true }), tab(2, 7, { pinned: true }), tab(3, 7, { audible: true })]), []);
});

test("グループに入っているタブは残す", () => {
  assert.deepEqual(ids([tab(1, 7, { groupId: 42 }), tab(2, 7)]), [2]);
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

test("固定したタブは、設定でオンにしたときだけ閉じる", () => {
  const tabs = [tab(1, 7, { pinned: true }), tab(2, 7)];
  assert.deepEqual(ids(tabs, { includePinned: true }), [1, 2]);
  assert.deepEqual(ids(tabs, { includeGrouped: true }), [2]);
});

test("グループに入っているタブは、設定でオンにしたときだけ閉じる", () => {
  const tabs = [tab(1, 7, { groupId: 42 }), tab(2, 7)];
  assert.deepEqual(ids(tabs, { includeGrouped: true }), [1, 2]);
  assert.deepEqual(ids(tabs, { includePinned: true }), [2]);
});

test("巻き込む設定がオンでも、しきい値に届かないタブ、表示中、音が出ているタブは残す", () => {
  const options = { includePinned: true, includeGrouped: true };
  assert.deepEqual(ids([tab(1, 5, { pinned: true }), tab(2, 5, { groupId: 42 })], options), []);
  assert.deepEqual(ids([tab(1, 7, { pinned: true, active: true }), tab(2, 7, { groupId: 42, audible: true })], options), []);
});
