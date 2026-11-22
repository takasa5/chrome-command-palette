import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_GROUP, focusAfterClosing, groupDomain, listTabGroups, planDomainGroups } from "../extension/tab-groups.js";

let nextIndex = 0;
const tab = (id, url, extra = {}) => ({ id, url, index: nextIndex++, pinned: false, groupId: NO_GROUP, ...extra });

test("groupDomain は http と https のホスト名から www. を外して返す", () => {
  assert.equal(groupDomain("https://www.example.com/a?b#c"), "example.com");
  assert.equal(groupDomain("http://docs.example.com:8080/"), "docs.example.com");
  assert.equal(groupDomain("chrome://settings"), null);
  assert.equal(groupDomain("file:///home/user/a.txt"), null);
  assert.equal(groupDomain("not a url"), null);
  assert.equal(groupDomain(undefined), null);
});

test("2 つ以上あるドメインのタブを、最初に出てくる順にまとめる", () => {
  const tabs = [
    tab(1, "https://b.example/1"),
    tab(2, "https://a.example/1"),
    tab(3, "https://c.example/"),
    tab(4, "https://www.a.example/2"),
    tab(5, "https://b.example/2"),
  ];
  assert.deepEqual(planDomainGroups(tabs), [
    { title: "b.example", tabIds: [1, 5] },
    { title: "a.example", tabIds: [2, 4] },
  ]);
});

test("タブの並びは index で決め、渡した配列の順には頼らない", () => {
  const tabs = [tab(1, "https://a.example/", { index: 9 }), tab(2, "https://b.example/", { index: 1 }), tab(3, "https://a.example/", { index: 5 }), tab(4, "https://b.example/", { index: 2 })];
  assert.deepEqual(planDomainGroups(tabs), [
    { title: "b.example", tabIds: [2, 4] },
    { title: "a.example", tabIds: [3, 1] },
  ]);
});

test("固定したタブ、グループに入っているタブ、http でないタブは動かさない", () => {
  const tabs = [
    tab(1, "https://a.example/", { pinned: true }),
    tab(2, "https://a.example/", { groupId: 7 }),
    tab(3, "https://a.example/"),
    tab(4, "chrome://settings"),
    tab(5, "chrome://history"),
  ];
  assert.deepEqual(planDomainGroups(tabs), []);
});

test("同じ名前のグループがあれば、1 つだけのタブでもそこへ入れる", () => {
  const tabs = [tab(1, "https://a.example/"), tab(2, "https://b.example/"), tab(3, "https://a.example/x", { groupId: 7 })];
  assert.deepEqual(planDomainGroups(tabs, [{ id: 7, title: "a.example" }]), [{ title: "a.example", tabIds: [1], groupId: 7 }]);
});

test("読み込み中のタブは移り先の URL で振り分ける", () => {
  const tabs = [tab(1, "https://a.example/"), tab(2, "", { pendingUrl: "https://a.example/next" })];
  assert.deepEqual(planDomainGroups(tabs), [{ title: "a.example", tabIds: [1, 2] }]);
});

test("groupId がないタブはグループに入っていないとみなす", () => {
  const tabs = [tab(1, "https://a.example/", { groupId: undefined }), tab(2, "https://a.example/", { groupId: undefined })];
  assert.deepEqual(planDomainGroups(tabs), [{ title: "a.example", tabIds: [1, 2] }]);
});

const group = (id, title = "") => ({ id, title });

test("listTabGroups はタブの並びで先に出てくるグループから返し、タブのないグループは出さない", () => {
  const tabs = [
    tab(1, "https://a.example/", { index: 0, groupId: 20, title: "A" }),
    tab(2, "https://b.example/", { index: 1, groupId: 10, title: "B" }),
    tab(3, "https://c.example/", { index: 2, title: "C" }),
    tab(4, "https://d.example/", { index: 3, groupId: 20, title: "D" }),
  ];
  const listed = listTabGroups("", [group(10, "work"), group(20, "news"), group(30, "empty")], tabs);
  assert.deepEqual(
    listed.map(({ group, tabIds, tabTitles }) => ({ id: group.id, tabIds, tabTitles })),
    [
      { id: 20, tabIds: [1, 4], tabTitles: ["A", "D"] },
      { id: 10, tabIds: [2], tabTitles: ["B"] },
    ],
  );
});

test("listTabGroups はグループの名前とタブのタイトルで絞り込む", () => {
  const tabs = [
    tab(1, "https://a.example/", { index: 0, groupId: 10, title: "Inbox" }),
    tab(2, "https://b.example/", { index: 1, groupId: 20, title: "Headlines" }),
  ];
  const groups = [group(10, "work"), group(20, "news")];
  assert.deepEqual(listTabGroups("work", groups, tabs).map(({ group }) => group.id), [10]);
  assert.deepEqual(listTabGroups("headlines", groups, tabs).map(({ group }) => group.id), [20]);
  assert.deepEqual(listTabGroups("zzz", groups, tabs), []);
});

test("focusAfterClosing は残る対象のタブを選び、閉じるなら最後に見ていたタブを選ぶ", () => {
  const tabs = [
    { id: 1, lastAccessed: 30 },
    { id: 2, lastAccessed: 10 },
    { id: 3, lastAccessed: 20 },
  ];
  assert.equal(focusAfterClosing(tabs, [2], 1), 1);
  assert.equal(focusAfterClosing(tabs, [1], 1), 3);
  assert.equal(focusAfterClosing(tabs, [1], null), 3);
  assert.equal(focusAfterClosing(tabs, [1, 2, 3], 1), null);
});
