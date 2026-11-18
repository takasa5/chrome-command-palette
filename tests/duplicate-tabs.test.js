import assert from "node:assert/strict";
import { test } from "node:test";
import { findDuplicateTabs } from "../extension/duplicate-tabs.js";

const tab = (id, url, extra = {}) => ({ id, url, active: false, pinned: false, incognito: false, ...extra });
const ids = (tabs, options) => findDuplicateTabs(tabs, options).map((t) => t.id).sort((a, b) => a - b);

test("同じ URL のタブを 1 つ残して返す", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/"), tab(2, "https://b.example/"), tab(3, "https://a.example/"), tab(4, "https://a.example/")]), [3, 4]);
});

test("重複がなければ何も返さない", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/"), tab(2, "https://a.example/?q=1")]), []);
});

test("フラグメントだけが違うタブは同じページとみなす", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/doc#top"), tab(2, "https://a.example/doc#section"), tab(3, "https://a.example/doc")]), [2, 3]);
});

test("パレットを開く前に見ていたタブを優先して残す", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/"), tab(2, "https://a.example/")], { keepTabIds: [2] }), [1]);
});

test("固定したタブを表示中のタブより優先して残す", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/", { active: true }), tab(2, "https://a.example/", { pinned: true })]), [1]);
});

test("ほかに優先するものがなければ表示中のタブを残す", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/"), tab(2, "https://a.example/", { active: true })]), [1]);
});

test("固定したタブと keepTabIds のタブは重複していても閉じない", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/", { pinned: true }), tab(2, "https://a.example/", { pinned: true }), tab(3, "https://a.example/")]), [3]);
  assert.deepEqual(ids([tab(1, "https://a.example/"), tab(2, "https://a.example/"), tab(3, "https://a.example/")], { keepTabIds: [1, 3] }), [2]);
});

test("シークレットと通常のウィンドウのタブは重複とみなさない", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/"), tab(2, "https://a.example/", { incognito: true })]), []);
});

test("読み込み中のタブは pendingUrl で比べ、URL のないタブは無視する", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/"), tab(2, "", { pendingUrl: "https://a.example/" }), tab(3, undefined), tab(4, undefined)]), [2]);
});

test("別のページへ移る途中のタブは、移り先の URL で比べる", () => {
  assert.deepEqual(ids([tab(1, "https://a.example/"), tab(2, "https://b.example/", { pendingUrl: "https://a.example/" }), tab(3, "https://b.example/")]), [2]);
});
