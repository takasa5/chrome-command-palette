// HTML に書いたキーの文言を入れる。描画の前に入れ替わるよう、module ではなく本文の最後で読み込む。
// data-i18n は中身の文字、data-i18n-placeholder などは同じ名前の属性に入れる。

document.documentElement.lang = chrome.i18n.getMessage("locale");
for (const element of document.querySelectorAll("[data-i18n]")) {
  // 文言の `…` で囲んだ部分は、書式や %s のように入力するとおりの文字なので、コードの見た目で出す。
  // split で分けると、奇数番目（0 から数える）が囲んだ部分になる。innerHTML は使わず、要素を組み立てる。
  element.replaceChildren(
    ...chrome.i18n.getMessage(element.dataset.i18n).split("`").map((segment, index) => {
      if (index % 2 === 0) return segment;
      const code = document.createElement("code");
      code.textContent = segment;
      return code;
    }),
  );
}
for (const attribute of ["placeholder", "aria-label"]) {
  for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
    element.setAttribute(attribute, chrome.i18n.getMessage(element.getAttribute(`data-i18n-${attribute}`)));
  }
}
