// モデルの操作と状態を、人が読む言葉にする。palette.md の図と表、E2E の結果の表示で使う。
export const ACTIONS = {
  init: "始める",
  openNewTab: "Cmd+T",
  openOverlay: "Cmd+Shift+S",
  clearQuery: "入力を消す",
  enterFolder: "フォルダ名 + Enter",
  exitFolder: "Backspace",
  enterCommandScope: "Tab",
  enterSiteScope: "gh + Tab",
  exitScope: "Backspace",
  ignoredBackspace: "Backspace",
  ignoredTab: "Tab",
  escape: "Esc",
  switchTab: "タブを選んで Enter",
  openHistory: "履歴を選んで Enter",
  openBookmark: "ブックマークを選んで Enter",
  runSiteSearch: "検索語 + Enter",
};

export const MODES = { closed: "閉じている", newTab: "新しいタブ", overlay: "ページに重ねる" };

// 開き方を除いた、パレットの中の状態。
export function describeScreen({ folders, scope, query }) {
  const parts = [];
  if (folders.length > 0) parts.push(`フォルダ ${folders.join(" / ")}`);
  if (scope === "commands") parts.push("コマンドに絞り込み");
  if (scope === "gh") parts.push("サイト内検索 gh");
  parts.push(query ? `入力「${query}」` : "入力なし");
  return parts.join("・");
}

export const describeState = (state) => (state.mode === "closed" ? MODES.closed : `${MODES[state.mode]}・${describeScreen(state)}`);
