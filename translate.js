// 今のタブを Chrome 組み込みの Translator API で翻訳する。翻訳は端末の中で行い、外部には送らない。
// パレットで翻訳モデルを用意してから translate-page.js をページに入れ、ページのテキストを置き換える。

// "en-US" の "en" のように、言語の部分だけを小文字で返す。
export function baseLanguage(tag) {
  return (tag ?? "").trim().split(/[-_]/)[0].toLowerCase();
}

// detected は LanguageDetector の結果で、確からしい順に並ぶ。迷う結果は使わず、ページの lang 属性に頼る。
export function pickSourceLanguage({ detected = [], pageLanguage }) {
  const [top] = detected;
  if (top && top.detectedLanguage !== "und" && top.confidence >= 0.5) return baseLanguage(top.detectedLanguage);
  return baseLanguage(pageLanguage) || null;
}

export function canTranslate(url) {
  return /^(https?|file):\/\//i.test(url ?? "");
}

// パーミッションを求めるときのパターン。file: はホストを持たないので丸ごと指定する。
export function originPattern(url) {
  const { protocol, host } = new URL(url);
  return protocol === "file:" ? "file:///*" : `${protocol}//${host}/*`;
}

function readPage() {
  return {
    language: document.documentElement.lang,
    sample: (document.body?.innerText ?? "").slice(0, 2000),
    translated: globalThis.paletteTranslation?.isTranslated() ?? false,
  };
}

function startTranslation(source, target) {
  globalThis.paletteTranslation.translate(source, target).catch(console.error);
}

function restoreTranslation() {
  return globalThis.paletteTranslation?.restore() ?? false;
}

async function runInPage(tabId, func, args = []) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return result;
}

// 新しいタブで開いたパレットには、ショートカットで開いたときのような今のタブへの許可がないので、そのサイトだけ許可を求める。
async function ensureAccess(ctx) {
  if (ctx.target.id === ctx.self.id) return;
  const granted = await chrome.permissions.request({ origins: [originPattern(ctx.target.url)] });
  if (!granted) throw new Error("このページへのアクセスが許可されなかったので翻訳できません");
}

async function detectLanguage(sample) {
  if (typeof LanguageDetector === "undefined" || (await LanguageDetector.availability()) !== "available") return [];
  const detector = await LanguageDetector.create();
  try {
    return await detector.detect(sample);
  } finally {
    detector.destroy();
  }
}

// モデルのダウンロードにはこのページでの操作が要るので、パレットで作っておく。
async function prepareModel(sourceLanguage, targetLanguage, ctx) {
  const availability = await Translator.availability({ sourceLanguage, targetLanguage });
  if (availability === "unavailable") throw new Error(`この言語（${sourceLanguage} → ${targetLanguage}）の翻訳には対応していません`);
  if (availability === "available") return;
  ctx.status("翻訳モデルをダウンロードしています");
  try {
    const translator = await Translator.create({
      sourceLanguage,
      targetLanguage,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => ctx.status(`翻訳モデルをダウンロードしています ${Math.round(event.loaded * 100)}%`));
      },
    });
    translator.destroy();
  } catch (error) {
    // 許可のダイアログを挟むと、キー操作から時間が空いてダウンロードを始められない。
    if (error.name === "NotAllowedError") throw new Error("もう一度実行すると翻訳モデルをダウンロードします");
    throw error;
  }
}

export async function translateTab(ctx) {
  if (!canTranslate(ctx.target.url)) throw new Error("このページは翻訳できません");
  if (typeof Translator === "undefined") throw new Error("この Chrome では翻訳機能を使えません");
  await ensureAccess(ctx);
  const tabId = ctx.target.id;
  await chrome.scripting.executeScript({ target: { tabId }, files: ["translate-page.js"] });
  const page = await runInPage(tabId, readPage);
  if (page.translated) throw new Error("このページはすでに翻訳しています");
  const target = baseLanguage(chrome.i18n.getUILanguage());
  const source = pickSourceLanguage({ detected: await detectLanguage(page.sample), pageLanguage: page.language });
  if (!source) throw new Error("ページの言語が分からないので翻訳できません");
  if (source === target) throw new Error("このページはすでに表示言語で書かれています");
  await prepareModel(source, target, ctx);
  await runInPage(tabId, startTranslation, [source, target]);
  await ctx.leave();
}

export async function restoreTab(ctx) {
  if (!canTranslate(ctx.target.url)) throw new Error("このページは翻訳していません");
  await ensureAccess(ctx);
  const restored = await runInPage(ctx.target.id, restoreTranslation);
  if (!restored) throw new Error("このページは翻訳していません");
  await ctx.leave();
}
