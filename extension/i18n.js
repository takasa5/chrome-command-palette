// 画面の文言。_locales/<言語>/messages.json に置き、chrome.i18n で引く。
// 言語はブラウザの表示言語で決まり、対応していない言語では manifest.json の default_locale（英語）になる。

export function t(key, ...substitutions) {
  return chrome.i18n.getMessage(key, substitutions.map(String));
}

// getUILanguage は、実際に使う messages.json と食い違うことがある（macOS は --lang を無視してシステムの言語で選ぶ）。
// 表示と処理をそろえるため、使われている messages.json の locale で判断する。
export function isJapanese(language = chrome.i18n.getMessage("locale")) {
  return /^ja\b/i.test(language);
}

// chrome.i18n.getMessage と同じ規則で、messages.json の 1 項目に置き換える値を入れる。
// $名前$ を placeholders の content に、$1〜$9 を substitutions に置き換え、$$ は $ にする。
// テストで Chrome の代わりに使う。
export function formatMessage(entry, substitutions = []) {
  if (!entry) return "";
  const placeholders = Object.fromEntries(Object.entries(entry.placeholders ?? {}).map(([name, value]) => [name.toLowerCase(), value.content]));
  const fill = (text) => text.replace(/\$\$|\$([1-9])/g, (match, index) => (match === "$$" ? "$" : (substitutions[index - 1] ?? "")));
  return fill(entry.message.replace(/\$([a-z0-9_@]+)\$/gi, (match, name) => placeholders[name.toLowerCase()] ?? match));
}
