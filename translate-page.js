// ページに送り込んで、テキストを翻訳文に置き換え、元に戻す。
// chrome.scripting の files で入れるので module にはできない。関数は globalThis.paletteTranslation に置く。
// 翻訳そのものは offscreen.js が行い、ここからは background.js 経由で文字列だけを渡す。

(() => {
  if (globalThis.paletteTranslation) return;

  // 中身を翻訳しない要素。
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "CODE", "PRE", "KBD", "SAMP", "TEXTAREA", "SVG", "MATH"]);
  const BATCH_SIZE = 40;
  const OBSERVE_DELAY_MS = 300;

  // 前後の空白は訳文に含まれないので、取り分けて付け直す。
  function splitWhitespace(text) {
    const [, lead, core, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return { lead, core, trail };
  }

  // 文字を含まない、数字や記号だけのテキストは訳さない。
  function hasWords(text) {
    return /\p{L}/u.test(text);
  }

  function chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  function skipsElement(element) {
    return (
      SKIP_TAGS.has(element.tagName.toUpperCase()) ||
      element.isContentEditable ||
      element.getAttribute("translate") === "no" ||
      element.classList.contains("notranslate")
    );
  }

  function isTranslatable(node) {
    if (!hasWords(node.data)) return false;
    for (let element = node.parentElement; element; element = element.parentElement) {
      if (skipsElement(element)) return false;
    }
    return true;
  }

  function textNodesIn(root) {
    if (root.nodeType === Node.TEXT_NODE) return isTranslatable(root) ? [root] : [];
    if (root.nodeType !== Node.ELEMENT_NODE || !root.isConnected) return [];
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (isTranslatable(walker.currentNode)) nodes.push(walker.currentNode);
    }
    return nodes;
  }

  // 翻訳中の状態。restore で消す。
  let state = null;

  async function translateTexts(texts) {
    const response = await chrome.runtime.sendMessage({ type: "translate-texts", source: state.source, target: state.target, texts });
    if (response?.error) throw new Error(response.error);
    return response.translations;
  }

  // originals には、置き換えたノードごとに原文と、置き換えた訳文を入れる。
  // ページがあとから書き換えたノードは訳文と一致しないので、原文に戻さない。
  async function translateNodes(nodes) {
    const session = state;
    const pending = nodes.filter((node) => {
      const record = session.originals.get(node);
      return !record || record.translated !== node.data;
    });
    for (const batch of chunk(pending, BATCH_SIZE)) {
      const parts = batch.map((node) => ({ node, original: node.data, ...splitWhitespace(node.data) }));
      const translations = await translateTexts(parts.map((part) => part.core));
      if (state !== session) return;
      parts.forEach((part, i) => {
        // 翻訳を待つ間にページが書き換えたテキストは、次の変更の監視で訳し直す。
        if (part.node.data !== part.original) return;
        const translated = part.lead + translations[i] + part.trail;
        session.originals.set(part.node, { original: part.original, translated });
        part.node.data = translated;
      });
    }
  }

  async function translateTitle() {
    const session = state;
    const title = document.title;
    if (!hasWords(title)) return;
    const [translated] = await translateTexts([title]);
    if (state !== session || document.title !== title) return;
    session.title = { original: title, translated };
    document.title = translated;
  }

  // 後から読み込まれた部分も訳す。自分で書き換えた分は translateNodes で除く。
  function observe(session) {
    let queued = new Set();
    let timer = null;
    const flush = () => {
      timer = null;
      const roots = [...queued];
      queued = new Set();
      session.queue = session.queue.then(() => translateNodes(roots.flatMap(textNodesIn))).catch(() => {});
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") queued.add(mutation.target);
        else mutation.addedNodes.forEach((node) => queued.add(node));
      }
      if (queued.size > 0 && !timer) timer = setTimeout(flush, OBSERVE_DELAY_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }

  // 題名と最初のひとまとまりを訳すまで待ち、失敗はパレットに返す。残りは待たずに訳し続ける。
  async function translate(source, target) {
    if (state) return;
    const session = { source, target, originals: new Map(), title: null, queue: Promise.resolve(), stop: null };
    state = session;
    session.stop = observe(session);
    const nodes = textNodesIn(document.body);
    const first = (async () => {
      await translateTitle();
      await translateNodes(nodes.slice(0, BATCH_SIZE));
    })();
    session.queue = first.then(() => translateNodes(nodes.slice(BATCH_SIZE)));
    session.queue.catch(() => {
      if (state === session) restore();
    });
    await first;
  }

  function restore() {
    if (!state) return false;
    const session = state;
    state = null;
    session.stop();
    for (const [node, { original, translated }] of session.originals) {
      if (node.data === translated) node.data = original;
    }
    if (session.title && document.title === session.title.translated) document.title = session.title.original;
    return true;
  }

  globalThis.paletteTranslation = {
    splitWhitespace,
    hasWords,
    chunk,
    translate,
    restore,
    isTranslated: () => state !== null,
  };
})();
