import assert from "node:assert/strict";
import { test } from "node:test";
import { filterAccounts, parseAccounts, pickHomeTab } from "../x-accounts.js";

test("parseAccounts は改行区切りを読み、@ と重複を取り除く", () => {
  assert.deepEqual(parseAccounts("@main\n\n sub \nmain\n"), ["main", "sub"]);
});

test("filterAccounts は空の入力で全件を返す", () => {
  assert.deepEqual(filterAccounts("", ["main", "sub"]), ["main", "sub"]);
});

test("filterAccounts は入力に当たるアカウントだけを返す", () => {
  assert.deepEqual(filterAccounts("su", ["main", "sub"]), ["sub"]);
});

test("pickHomeTab は今のウィンドウのホームを優先する", () => {
  const other = { id: 1, windowId: 1, url: "https://x.com/home" };
  const here = { id: 2, windowId: 2, url: "https://x.com/home?foo=1" };
  assert.equal(pickHomeTab([other, here], 2), here);
  assert.equal(pickHomeTab([other], 2), other);
});

test("pickHomeTab は /home で始まるプロフィールを選ばない", () => {
  assert.equal(pickHomeTab([{ id: 1, windowId: 1, url: "https://x.com/homeboy" }], 1), null);
});
