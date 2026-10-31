// 新規タブページのままだと Chrome はアドレスバーにフォーカスを置く。
// 一度遷移するとページ側にフォーカスが移るので、入力欄へすぐ入力できる。
if (!location.search.includes("focus")) {
  location.replace("palette.html?focus");
}
