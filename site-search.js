// キーワード + Tab で入るサイト内検索。
// 拡張機能の API ではブラウザのカスタム検索を読み取れないので、設定画面で登録してもらう。

import { isSameOrigin, normalize } from "./search.js";

const VISITED_PAGE_LIMIT = 100;

export function buildSearchUrl(template, query) {
  return template.replaceAll("%s", () => encodeURIComponent(query.trim()));
}

function urlError(template) {
  if (!template.includes("%s")) return "URL に %s がありません";
  // %s のままだと URL として読めない位置もあるので、置き換えてから確かめる。
  // javascript: などは開くとページ内でスクリプトが動くので、http と https だけを許す。
  const url = buildSearchUrl(template, "test");
  if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) return "URL は http:// か https:// で始めてください";
  return null;
}

// 1 行に「キーワード 名前 URL」。名前には空白を含められる。
// 不正な行は engines に入れず、行番号付きの理由を errors に返す。重複は先の行を残す。
export function parseEngines(text, reservedKeywords = []) {
  const engines = [];
  const errors = [];
  const used = new Set(reservedKeywords);
  text.split("\n").forEach((line, index) => {
    const fail = (message) => errors.push(`${index + 1} 行目: ${message}`);
    if (!line.trim()) return;
    const [keyword, ...rest] = line.trim().split(/\s+/);
    if (rest.length < 2) return fail("キーワード、名前、URL を空白で区切って入力してください");
    const url = rest.pop();
    const error = urlError(url);
    if (error) return fail(error);
    // パレットは正規化した入力と比べるので、同じ形で持つ。
    const normalized = normalize(keyword);
    if (used.has(normalized)) return fail(`キーワード ${normalized} はすでに使われています`);
    used.add(normalized);
    engines.push({ keyword: normalized, name: rest.join(" "), url });
  });
  return { engines, errors };
}

export function formatEngines(engines) {
  return engines.map(({ keyword, name, url }) => `${keyword} ${name} ${url}`).join("\n");
}

function firstPathSegment(url) {
  return new URL(url).pathname.split("/")[1];
}

// favicon は開いたことのある URL でしか引けないので、同じサイトの訪問済みページを探す。
// www.google.com/maps のように 1 つのオリジンに複数のサービスがあるので、パスの先頭が同じページを優先する。
export function pickVisitedPage(pages, searchUrl) {
  const sameOrigin = pages.filter((page) => isSameOrigin(page.url, searchUrl));
  return (sameOrigin.find((page) => firstPathSegment(page.url) === firstPathSegment(searchUrl)) ?? sameOrigin[0])?.url ?? null;
}

export async function findVisitedPage(url) {
  const pages = await chrome.history.search({ text: new URL(url).hostname, startTime: 0, maxResults: VISITED_PAGE_LIMIT });
  return pickVisitedPage(pages, url);
}

export async function getEngines() {
  const { siteSearchEngines = [] } = await chrome.storage.sync.get("siteSearchEngines");
  return siteSearchEngines;
}

export function siteSearchScope({ keyword, name, url }) {
  return {
    keyword,
    title: `${name} を検索`,
    hint: `Tab で ${name} を検索`,
    findVisitedPage: () => findVisitedPage(buildSearchUrl(url, "test")),
    search: async (query) => {
      if (!query.trim()) return [];
      return [{ kind: "siteSearch", key: `site-search:${keyword}`, title: `「${query.trim()}」を検索`, subtitle: name, url: buildSearchUrl(url, query) }];
    },
  };
}
