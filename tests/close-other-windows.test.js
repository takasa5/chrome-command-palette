import assert from "node:assert/strict";
import { test } from "node:test";
import { otherWindowIds } from "../extension/commands.js";

test("パレットのあるウィンドウ以外を閉じる", () => {
  assert.deepEqual(otherWindowIds([{ id: 1 }, { id: 2 }, { id: 3 }], 2), [1, 3]);
});

test("ほかにウィンドウがなければ何も閉じない", () => {
  assert.deepEqual(otherWindowIds([{ id: 2 }], 2), []);
});
