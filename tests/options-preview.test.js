import assert from "node:assert/strict";
import { test } from "node:test";
import { translator } from "./support/i18n.js";
import { DEFAULT_FAVORITES, parseFavorites } from "../favorites.js";
import { favoritePreview, formatHours, siteSearchPreview, staleTabsPreview } from "../options-preview.js";
import { rankResults } from "../search.js";
import { parseEngines } from "../site-search.js";
import { DEFAULT_STALE_HOURS } from "../stale-tabs.js";

const t = translator("ja");

test("staleTabsPreview はしきい値以上のタブを閉じる対象にする", () => {
  const { tabs } = staleTabsPreview(12, [1, 12, 30]);
  assert.deepEqual(tabs.map((tab) => tab.stale), [false, true, true]);
});

test("staleTabsPreview は経過時間の短いタブほど左に置き、点線をタブの間に置く", () => {
  const { threshold, tabs } = staleTabsPreview(12, [1, 5, 15, 30]);
  const positions = tabs.map((tab) => tab.position);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.ok(tabs[1].position < threshold && threshold < tabs[2].position);
});

test("staleTabsPreview は大きなしきい値でも点線を図の中に収め、どのタブも閉じない", () => {
  const { threshold, tabs } = staleTabsPreview(1000, [1, 30]);
  assert.ok(threshold > 0 && threshold < 1);
  assert.ok(tabs.every((tab) => !tab.stale && tab.position < threshold));
});

test("staleTabsPreview は小さなしきい値ではすべてのタブを閉じる対象にする", () => {
  const { tabs } = staleTabsPreview(0.5, [1, 30]);
  assert.ok(tabs.every((tab) => tab.stale));
});

test("favoritePreview は最初のお気に入りを、別名があれば別名で引く", () => {
  const { favorites } = parseFavorites("Gmail https://mail.google.com/ gm mail\nMaps https://maps.google.com/", t);
  assert.deepEqual(favoritePreview(favorites), { title: "Gmail", query: "gm" });
  assert.deepEqual(favoritePreview(favorites.slice(1)), { title: "Maps", query: "maps" });
});

test("favoritePreview は不正な行を飛ばし、お気に入りがなければ null を返す", () => {
  const { favorites } = parseFavorites("壊れた行\nGmail https://mail.google.com/", t);
  assert.equal(favoritePreview(favorites).title, "Gmail");
  assert.equal(favoritePreview([]), null);
});

test("favoritePreview の入力で引くと、そのお気に入りが先頭に出る", () => {
  for (const favorite of DEFAULT_FAVORITES) {
    const { query, title } = favoritePreview([favorite]);
    assert.equal(rankResults(query, { t, commands: [], favorites: DEFAULT_FAVORITES })[0].favorite?.title, title, query);
  }
});

test("siteSearchPreview は最初に登録したキーワードと名前を返す", () => {
  const { engines } = parseEngines("壊れた行\ngh GitHub https://github.com/search?q=%s\nmdn MDN https://developer.mozilla.org/search?q=%s", t);
  assert.deepEqual(siteSearchPreview(engines), { keyword: "gh", name: "GitHub" });
  assert.equal(siteSearchPreview([]), null);
});

test("staleTabsPreview の見本のタブは、初期値のしきい値で残すものと閉じるものに分かれる", () => {
  const { tabs } = staleTabsPreview(DEFAULT_STALE_HOURS);
  assert.ok(tabs.some((tab) => tab.stale) && tabs.some((tab) => !tab.stale));
});

test("formatHours は小数第 1 位まで出す", () => {
  assert.equal(formatHours(12), "12h");
  assert.equal(formatHours(1.25), "1.3h");
  assert.equal(formatHours(0.1 + 0.2), "0.3h");
});
