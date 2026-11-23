// パレットのタブかどうかの判定。background.js と palette.js で同じものを使う。Chrome API に依存しない。

// タブや履歴に残るパレットの URL。extensionId には chrome.runtime.id を渡す。
// runtime.getURL は use_dynamic_url により起動ごとに変わる値を返し、タブの URL と合わないので使わない。
export function paletteUrlOf(extensionId) {
  return `chrome-extension://${extensionId}/palette.html`;
}

// url がないタブは、移り先の URL（pendingUrl）で判定する。
export function isPaletteTab(tab, paletteUrl) {
  return (tab.url ?? tab.pendingUrl ?? "").startsWith(paletteUrl);
}
