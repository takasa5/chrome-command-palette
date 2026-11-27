import assert from "node:assert/strict";
import { test } from "node:test";
import { tabMoveIndex } from "../extension/commands.js";

// 0: 固定 P1、1: 固定 P2、2〜4: 固定していない A〜C。
const tabs = [
  { id: 1, index: 0, pinned: true },
  { id: 2, index: 1, pinned: true },
  { id: 3, index: 2, pinned: false },
  { id: 4, index: 3, pinned: false },
  { id: 5, index: 4, pinned: false },
];
const [p1, p2, a, b, c] = tabs;

test("左右へは隣のタブの位置へ動かす", () => {
  assert.equal(tabMoveIndex(tabs, b, "left"), 2);
  assert.equal(tabMoveIndex(tabs, b, "right"), 4);
  assert.equal(tabMoveIndex(tabs, p2, "left"), 0);
});

test("先頭と末尾へは、固定しているかどうかが同じタブの端へ動かす", () => {
  assert.equal(tabMoveIndex(tabs, c, "start"), 2);
  assert.equal(tabMoveIndex(tabs, a, "end"), 4);
  assert.equal(tabMoveIndex(tabs, p1, "end"), 1);
  assert.equal(tabMoveIndex(tabs, p2, "start"), 0);
});

test("固定したタブとそうでないタブの境目は越えない", () => {
  assert.equal(tabMoveIndex(tabs, a, "left"), null);
  assert.equal(tabMoveIndex(tabs, p2, "right"), null);
});

test("すでに端にいるなら動かさない", () => {
  assert.equal(tabMoveIndex(tabs, c, "right"), null);
  assert.equal(tabMoveIndex(tabs, c, "end"), null);
  assert.equal(tabMoveIndex(tabs, a, "start"), null);
  assert.equal(tabMoveIndex(tabs, p1, "start"), null);
});

test("パレットのタブ（windowTabs に入らない）を挟んでいても、隣のタブを越えて 1 つ動く", () => {
  // index 3 にパレットが開いていて、windowTabs には入っていない。
  const withPalette = [
    { id: 3, index: 2, pinned: false },
    { id: 5, index: 4, pinned: false },
    { id: 6, index: 5, pinned: false },
  ];
  assert.equal(tabMoveIndex(withPalette, withPalette[0], "right"), 4);
  assert.equal(tabMoveIndex(withPalette, withPalette[1], "left"), 2);
  assert.equal(tabMoveIndex(withPalette, withPalette[0], "end"), 5);
});

test("windowTabs が index の順に並んでいなくても位置で判断する", () => {
  const shuffled = [c, a, p2, b, p1];
  assert.equal(tabMoveIndex(shuffled, b, "left"), 2);
  assert.equal(tabMoveIndex(shuffled, b, "right"), 4);
});
