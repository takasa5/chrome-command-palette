// 新しいタブで開いたときは、module の読み込みを待たずに入力欄へフォーカスする。
// autofocus はページに重ねたとき（iframe の中）にエラーになるので使わない。重ねたときは palette.js がフォーカスする。
if (window.top === window) document.getElementById("query").focus();
