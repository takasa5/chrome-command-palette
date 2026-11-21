import assert from "node:assert/strict";
import { test } from "node:test";
import { availableCommands, COMMANDS } from "../extension/commands.js";

const commands = [
  { id: "plain" },
  { id: "target", needsTarget: true },
  { id: "optional", enabledBy: "optionalEnabled" },
];
const ids = (options) => availableCommands(commands, options).map((command) => command.id);

test("対象のタブがないときは、タブを操作するコマンドを出さない", () => {
  assert.deepEqual(ids({ hasTarget: false }), ["plain", "optional"]);
  assert.deepEqual(ids({ hasTarget: true }), ["plain", "target", "optional"]);
});

test("設定でオフにしたコマンドだけを出さない。未保存なら出す", () => {
  assert.deepEqual(ids({ hasTarget: true, settings: { optionalEnabled: false } }), ["plain", "target"]);
  assert.deepEqual(ids({ hasTarget: true, settings: { optionalEnabled: true } }), ["plain", "target", "optional"]);
  assert.deepEqual(ids({ hasTarget: true, settings: {} }), ["plain", "target", "optional"]);
});

test("Archive Stale Tabs は staleTabsEnabled でオフにできる", () => {
  const shown = (settings) => availableCommands(COMMANDS, { hasTarget: true, settings }).some((command) => command.id === "archive-stale-tabs");
  assert.equal(shown({}), true);
  assert.equal(shown({ staleTabsEnabled: false }), false);
});
