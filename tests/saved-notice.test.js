import assert from "node:assert/strict";
import { test } from "node:test";
import { createSavedNotice } from "../extension/saved-notice.js";

// 時計を手で進める setTimeout の代わり。
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer(callback, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    get pending() {
      return timers.size;
    },
  };
}

function setup(duration = 1000) {
  const clock = fakeClock();
  const log = [];
  const notice = createSavedNotice({
    show: () => log.push("show"),
    hide: () => log.push("hide"),
    duration,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  return { clock, log, notice };
}

test("createSavedNotice は保存したら出し、時間がたったら消す", () => {
  const { clock, log, notice } = setup();
  assert.equal(notice.shown, false);
  notice.notify();
  assert.deepEqual(log, ["show"]);
  assert.equal(notice.shown, true);
  clock.advance(999);
  assert.deepEqual(log, ["show"]);
  clock.advance(1);
  assert.deepEqual(log, ["show", "hide"]);
  assert.equal(notice.shown, false);
});

test("createSavedNotice は出ている間に続けて保存したら、出し直さずに消すまでを延ばす", () => {
  const { clock, log, notice } = setup();
  notice.notify();
  for (let i = 0; i < 5; i++) {
    clock.advance(600);
    notice.notify();
  }
  assert.deepEqual(log, ["show"]);
  assert.equal(clock.pending, 1);
  clock.advance(999);
  assert.deepEqual(log, ["show"]);
  clock.advance(1);
  assert.deepEqual(log, ["show", "hide"]);
});

test("createSavedNotice は消えたあとに保存したら、また出す", () => {
  const { clock, log, notice } = setup();
  notice.notify();
  clock.advance(1000);
  notice.notify();
  assert.deepEqual(log, ["show", "hide", "show"]);
  clock.advance(1000);
  assert.deepEqual(log, ["show", "hide", "show", "hide"]);
});

test("createSavedNotice は保存しなければ何も出さない", () => {
  const { clock, log } = setup();
  clock.advance(5000);
  assert.deepEqual(log, []);
});
