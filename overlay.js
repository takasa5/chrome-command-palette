// 今のページの上にパレットを重ねて開く。
// toggleOverlay は background.js が chrome.scripting でページへ送り込むので、外の変数を参照しない。

// パレットを読み込む前に押したキーを、入力欄へ渡す内容に直す。
export function applyBufferedKeys(keys) {
  let text = "";
  for (const key of keys) {
    if (key === "Enter") return { text, submit: true };
    if (key === "Backspace") text = text.slice(0, -1);
    else if ([...key].length === 1) text += key;
  }
  return { text, submit: false };
}

// 開いていれば閉じる。パレットの iframe とは chrome.runtime のメッセージでやり取りし、ページからは偽装できないようにする。
export function toggleOverlay(src) {
  if (window.__commandPalette) {
    window.__commandPalette.close();
    return "closed";
  }

  const html = document.documentElement;
  const previousFocus = document.activeElement;
  const previousOverflow = html.style.overflow;
  const keys = [];
  let ready = false;

  // ページの CSS が届かないよう、独自の要素名と閉じた Shadow DOM に入れる。
  const host = document.createElement("command-palette-overlay");
  host.style.cssText = "all: initial !important";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    dialog {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      max-width: none;
      max-height: none;
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 0;
      outline: 0;
      background: transparent;
    }
    dialog::backdrop {
      background: transparent;
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: transparent;
      /* パレットと揃えないと、Chrome が iframe を不透明に塗る。 */
      color-scheme: light dark;
    }
  `;
  const dialog = document.createElement("dialog");
  // 読み込み途中の iframe がフォーカスを受けるとその間のキーが消えるので、ダイアログ自身にフォーカスを置く。
  dialog.tabIndex = -1;
  const frame = document.createElement("iframe");
  frame.allow = "clipboard-write";
  frame.src = src;
  root.append(style, dialog);

  // 読み込みが終わるまでのキーはページへ渡さず、ためておいてパレットへ渡す。
  const holdKeys = (event) => {
    if (ready) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== "keydown" || event.isComposing || event.repeat) return;
    if (event.key === "Escape") close();
    else if (!event.metaKey && !event.ctrlKey && !event.altKey) keys.push(event.key);
  };
  const keyEvents = ["keydown", "keypress", "keyup"];

  const onMessage = (message, _sender, sendResponse) => {
    if (message.type === "palette-ready") {
      ready = true;
      frame.focus();
      sendResponse(keys);
    } else if (message.type === "close-palette") {
      close();
    }
  };

  function close() {
    window.__commandPalette = null;
    chrome.runtime.onMessage.removeListener(onMessage);
    keyEvents.forEach((type) => window.removeEventListener(type, holdKeys, true));
    dialog.close();
    host.remove();
    html.style.overflow = previousOverflow;
    previousFocus?.focus?.({ preventScroll: true });
  }

  chrome.runtime.onMessage.addListener(onMessage);
  keyEvents.forEach((type) => window.addEventListener(type, holdKeys, true));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  html.append(host);
  // モーダルにすると最前面に出て、ページの残りはクリックもフォーカスも受け付けなくなる。
  dialog.showModal();
  // 開くときに iframe へフォーカスが移らないよう、開いてから入れる。
  dialog.focus();
  dialog.append(frame);
  html.style.overflow = "hidden";
  window.__commandPalette = { close };
  return "opened";
}
