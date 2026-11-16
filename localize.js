// HTML に書いたキーの文言を入れる。描画の前に入れ替わるよう、module ではなく本文の最後で読み込む。
// data-i18n は中身の文字、data-i18n-placeholder などは同じ名前の属性に入れる。
document.documentElement.lang = chrome.i18n.getMessage("locale");
for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = chrome.i18n.getMessage(element.dataset.i18n);
}
for (const attribute of ["placeholder", "aria-label"]) {
  for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
    element.setAttribute(attribute, chrome.i18n.getMessage(element.getAttribute(`data-i18n-${attribute}`)));
  }
}
