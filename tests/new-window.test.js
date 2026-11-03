import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMANDS } from "../commands.js";

const newWindow = COMMANDS.find((command) => command.id === "new-window");

async function run(windowTabs, stored = {}) {
  const created = [];
  const windows = [];
  let left = false;
  globalThis.chrome = {
    storage: { sync: { get: async () => stored } },
    windows: { create: async () => (windows.push(2), { id: 2 }) },
    tabs: { create: async (props) => created.push(props) },
  };
  await newWindow.run({ windowTabs, leave: async () => (left = true) });
  return { created, windows, left };
}

test("New Window は今のウィンドウのピンだけをオリジンで順に開き、新しいタブを選択したままにする", async () => {
  const { created, left } = await run([
    { url: "https://a.example/watch?v=1", pinned: true },
    { url: "https://b.example/page", pinned: true },
    { url: "https://c.example/", pinned: false },
  ]);
  assert.deepEqual(created, [
    { windowId: 2, url: "https://a.example", pinned: true, active: false },
    { windowId: 2, url: "https://b.example", pinned: true, active: false },
  ]);
  assert.equal(left, true);
});

test("New Window はオリジンを持たないピンをそのままの URL で開く", async () => {
  const { created } = await run([{ url: "file:///tmp/a.html", pinned: true }]);
  assert.deepEqual(created, [{ windowId: 2, url: "file:///tmp/a.html", pinned: true, active: false }]);
});

test("New Window はピンがなければタブを追加しない", async () => {
  const { created } = await run([{ url: "https://c.example/", pinned: false }]);
  assert.deepEqual(created, []);
});

test("New Window は設定がオフならピンを開かずにウィンドウだけ開く", async () => {
  const { created, windows, left } = await run([{ url: "https://a.example/", pinned: true }], { newWindowPins: false });
  assert.deepEqual(created, []);
  assert.equal(windows.length, 1);
  assert.equal(left, true);
});
