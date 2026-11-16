// テストで i18n.js の t の代わりに使う、_locales の messages.json から文言を作る関数。

import { readFileSync } from "node:fs";
import { formatMessage } from "../../i18n.js";

export function loadMessages(locale) {
  return JSON.parse(readFileSync(new URL(`../../_locales/${locale}/messages.json`, import.meta.url), "utf8"));
}

// chrome.i18n.getMessage と同じく、置き換える値は文字列にしてから埋める。
export function translator(locale) {
  const messages = loadMessages(locale);
  return (key, ...substitutions) => formatMessage(messages[key], substitutions.map(String));
}
