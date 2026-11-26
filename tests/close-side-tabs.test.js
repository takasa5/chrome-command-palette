import assert from "node:assert/strict";
import { test } from "node:test";
import { sideTabIds } from "../extension/commands.js";

const tabs = [
  { id: 1, index: 0, pinned: true },
  { id: 2, index: 1, pinned: false },
  { id: 3, index: 2, pinned: false },
  { id: 4, index: 3, pinned: false },
  { id: 5, index: 4, pinned: false },
];

test("左側の固定していないタブを閉じる", () => {
  assert.deepEqual(sideTabIds(tabs, tabs[3], "left"), [2, 3]);
});

test("右側の固定していないタブを閉じる", () => {
  assert.deepEqual(sideTabIds(tabs, tabs[1], "right"), [3, 4, 5]);
});

test("対象のタブ自身は閉じない", () => {
  assert.ok(!sideTabIds(tabs, tabs[2], "left").includes(3));
  assert.ok(!sideTabIds(tabs, tabs[2], "right").includes(3));
});

test("端のタブなら、その側には何も閉じない", () => {
  assert.deepEqual(sideTabIds(tabs, tabs[1], "left"), []);
  assert.deepEqual(sideTabIds(tabs, tabs[4], "right"), []);
});
