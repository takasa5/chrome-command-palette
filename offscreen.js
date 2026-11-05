// ページの翻訳を受け持つ、表示しない拡張機能のページ。
// Translator は Service Worker では使えず、ページの中で作ると翻訳モデルのダウンロードにページ側の操作が要る。
// パレットで一度作ってモデルを用意しておけば、同じ拡張機能のこのページからは操作なしで作れる。

const translators = new Map();

function getTranslator(sourceLanguage, targetLanguage) {
  const key = `${sourceLanguage}:${targetLanguage}`;
  if (!translators.has(key)) {
    const created = Translator.create({ sourceLanguage, targetLanguage });
    created.catch(() => translators.delete(key));
    translators.set(key, created);
  }
  return translators.get(key);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "offscreen-translate") return;
  (async () => {
    const translator = await getTranslator(message.source, message.target);
    const translations = [];
    for (const text of message.texts) translations.push(text ? await translator.translate(text) : text);
    return { translations };
  })().then(sendResponse, (error) => sendResponse({ error: error.message }));
  return true;
});
