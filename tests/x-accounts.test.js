import assert from "node:assert/strict";
import { test } from "node:test";
import { filterAccounts, parseAccounts } from "../x-accounts.js";

test("parseAccounts は改行区切りを読み、@ と重複を取り除く", () => {
  assert.deepEqual(parseAccounts("@main\n\n sub \nmain\n"), ["main", "sub"]);
});

test("filterAccounts は空の入力で全件を返す", () => {
  assert.deepEqual(filterAccounts("", ["main", "sub"]), ["main", "sub"]);
});

test("filterAccounts は入力に当たるアカウントだけを返す", () => {
  assert.deepEqual(filterAccounts("su", ["main", "sub"]), ["sub"]);
});
