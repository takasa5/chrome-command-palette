// 新規タブページのままだと Chrome はアドレスバーにフォーカスを置く。
// 一度遷移するとページ側にフォーカスが移るので、入力欄へすぐ入力できる。
// ページに重ねるときは CSS より先に印を付け、背景が一瞬不透明になるのを防ぐ。
const params = new URLSearchParams(location.search);
if (params.has("overlay")) {
  document.documentElement.classList.add("overlay");
} else if (!params.has("focus")) {
  location.replace("palette.html?focus");
}
