import assert from "node:assert/strict";
import { test } from "node:test";
import { canAddToReadingList, rankReadingList } from "../reading-list.js";

test("canAddToReadingList は http と https のページだけを受け付ける", () => {
  assert.equal(canAddToReadingList("https://example.com/"), true);
  assert.equal(canAddToReadingList("http://example.com/"), true);
  assert.equal(canAddToReadingList("chrome://settings"), false);
  assert.equal(canAddToReadingList("file:///tmp/a.html"), false);
  assert.equal(canAddToReadingList(undefined), false);
});

const entries = [
  { title: "Old unread", url: "https://a.example/", hasBeenRead: false, creationTime: 1 },
  { title: "New read", url: "https://b.example/", hasBeenRead: true, creationTime: 3 },
  { title: "New unread", url: "https://c.example/", hasBeenRead: false, creationTime: 2 },
];

test("rankReadingList は空の入力で未読を先に、新しい順に並べる", () => {
  assert.deepEqual(
    rankReadingList("", entries).map((entry) => entry.title),
    ["New unread", "Old unread", "New read"],
  );
});

test("rankReadingList はタイトルと URL で絞り込む", () => {
  assert.deepEqual(rankReadingList("old", entries).map((entry) => entry.title), ["Old unread"]);
  assert.deepEqual(rankReadingList("b.example", entries).map((entry) => entry.title), ["New read"]);
});
