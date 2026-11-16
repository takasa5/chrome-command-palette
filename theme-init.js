// CSS より先に、選んだテーマを html に付けて、開いた瞬間に違う色が見えないようにする。
// chrome.storage は非同期で間に合わないので、ページに重ねたときは background.js が URL で渡したものを、
// それ以外は theme.js が localStorage に写したものを使う。
(() => {
  const params = new URLSearchParams(location.search);
  let theme = params.get("theme");
  if (!params.has("overlay")) {
    try {
      theme = localStorage.getItem("theme");
    } catch {
      theme = null;
    }
  }
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
})();
