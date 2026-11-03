import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBufferedKeys } from "../overlay.js";

test("文字キーをつなげる", () => {
  assert.deepEqual(applyBufferedKeys(["g", "i", "t", " ", "h"]), { text: "git h", submit: false });
});

test("Backspace で 1 文字消す", () => {
  assert.deepEqual(applyBufferedKeys(["a", "b", "Backspace", "c"]), { text: "ac", submit: false });
  assert.deepEqual(applyBufferedKeys(["Backspace"]), { text: "", submit: false });
});

test("文字以外のキーは無視する", () => {
  assert.deepEqual(applyBufferedKeys(["Shift", "A", "ArrowDown", "Tab"]), { text: "A", submit: false });
});

test("Enter で実行し、その後のキーは使わない", () => {
  assert.deepEqual(applyBufferedKeys(["r", "e", "Enter", "x"]), { text: "re", submit: true });
});
