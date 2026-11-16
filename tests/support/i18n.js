// テストで chrome.i18n の代わりに _locales の messages.json を引く。既定は日本語。
// isJapanese は messages.json の locale で決まるので、getUILanguage は使わない。
// import するだけで使え、useLocale で言語を切り替えられる。

import { readFileSync } from "node:fs";
import { formatMessage } from "../../i18n.js";

export function loadMessages(locale) {
  return JSON.parse(readFileSync(new URL(`../../_locales/${locale}/messages.json`, import.meta.url), "utf8"));
}

let messages = loadMessages("ja");

export function useLocale(locale) {
  messages = loadMessages(locale);
}

globalThis.chrome = {
  ...globalThis.chrome,
  i18n: {
    getMessage: (key, substitutions) => formatMessage(messages[key], substitutions),
  },
};
