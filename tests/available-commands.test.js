import assert from "node:assert/strict";
import { test } from "node:test";
import { availableCommands, COMMANDS } from "../extension/commands.js";

const commands = [
  { id: "plain" },
  { id: "target", needsTarget: true },
  { id: "optional", enabledBy: "optionalEnabled" },
  { id: "grouped", needsTarget: true, needsGroupedTarget: true },
];
const ungroupedTab = { id: 1, groupId: -1 };
const groupedTab = { id: 1, groupId: 7 };
const ids = (options) => availableCommands(commands, options).map((command) => command.id);

test("対象のタブがないときは、タブを操作するコマンドを出さない", () => {
  assert.deepEqual(ids({ target: null }), ["plain", "optional"]);
  assert.deepEqual(ids({ target: ungroupedTab }), ["plain", "target", "optional"]);
});

test("設定でオフにしたコマンドだけを出さない。未保存なら出す", () => {
  assert.deepEqual(ids({ target: ungroupedTab, settings: { optionalEnabled: false } }), ["plain", "target"]);
  assert.deepEqual(ids({ target: ungroupedTab, settings: { optionalEnabled: true } }), ["plain", "target", "optional"]);
  assert.deepEqual(ids({ target: ungroupedTab, settings: {} }), ["plain", "target", "optional"]);
});

test("Archive Stale Tabs は staleTabsEnabled でオフにできる", () => {
  const shown = (settings) => availableCommands(COMMANDS, { target: ungroupedTab, settings }).some((command) => command.id === "archive-stale-tabs");
  assert.equal(shown({}), true);
  assert.equal(shown({ staleTabsEnabled: false }), false);
});

test("グループのタブを操作するコマンドは、対象のタブがグループに入っているときだけ出す", () => {
  assert.deepEqual(ids({ target: groupedTab }), ["plain", "target", "optional", "grouped"]);
  const shown = (target) => availableCommands(COMMANDS, { target }).map((command) => command.id).filter((id) => ["ungroup-tab", "close-tab-group"].includes(id));
  assert.deepEqual(shown(ungroupedTab), []);
  assert.deepEqual(shown(groupedTab), ["ungroup-tab", "close-tab-group"]);
});
