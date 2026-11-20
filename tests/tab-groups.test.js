import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_GROUP, groupDomain, planDomainGroups } from "../extension/tab-groups.js";

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
