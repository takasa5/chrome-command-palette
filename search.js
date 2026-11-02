// 検索とランキング。Chrome API に依存しない純粋関数だけを置く。

const KIND_BONUS = { command: 3, service: 3, tab: 2, folder: 2, bookmark: 1, history: 0 };
const SCORE_URL_ITEM = 85;
const SCORE_API_FLOOR = 10;
const MAX_RESULTS = 30;

// 全角半角と大文字小文字をそろえ、カタカナはひらがなにして「しーくれっと」でも引けるようにする。
export function normalize(text) {
  return (text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .trim();
}

function isWordStart(text, index) {
  return index === 0 || !/[\p{L}\p{N}]/u.test(text[index - 1]);
}

function isSubsequence(query, text) {
  let i = 0;
  for (const c of text) {
    if (c === query[i]) i++;
    if (i === query.length) return true;
  }
  return false;
}

function scoreToken(token, text, fuzzy) {
  if (!text) return 0;
  const first = text.indexOf(token);
  if (first === 0) return 80;
  if (first > 0) {
    for (let i = first; i !== -1; i = text.indexOf(token, i + 1)) {
      if (isWordStart(text, i)) return 60;
    }
    return 40;
  }
  return fuzzy && token.length >= 2 && isSubsequence(token, text) ? 30 : 0;
}

// fields は { text, weight } の配列。トークンがどれか 1 つでも当たらなければ 0 を返す。
export function scoreFields(query, fields, { fuzzy = false } = {}) {
  const q = normalize(query);
  if (!q) return 0;
  const normalized = fields.map((f) => ({ text: normalize(f.text), weight: f.weight ?? 1 }));
  let whole = 0;
  for (const f of normalized) {
    if (f.text === q) whole = Math.max(whole, 100 * f.weight);
    else if (f.text.startsWith(q)) whole = Math.max(whole, 90 * f.weight);
  }
  const tokens = q.split(/\s+/);
  let sum = 0;
  for (const token of tokens) {
    const best = Math.max(...normalized.map((f) => scoreToken(token, f.text, fuzzy) * f.weight));
    if (best === 0) return whole;
    sum += best;
  }
  return Math.max(whole, sum / tokens.length);
}

export function stripUrl(url) {
  return (url ?? "").replace(/^[a-z-]+:\/\/(www\.)?/i, "");
}

// file: や data: はオリジンが null になるので、URL の一致で比べる。
export function isSameOrigin(a, b) {
  if (a === b) return true;
  if (!URL.canParse(a) || !URL.canParse(b)) return false;
  const origin = new URL(a).origin;
  return origin !== "null" && origin === new URL(b).origin;
}

function pageFields(item) {
  return [
    { text: item.title, weight: 1 },
    { text: stripUrl(item.url), weight: 0.7 },
  ];
}

function folderFields(bookmark) {
  return (bookmark.folders ?? []).map((text) => ({ text, weight: 0.8 }));
}

// ブックマークツリーを平らにし、リンクとフォルダに親フォルダ名を持たせる。
// ルートと「ブックマーク バー」などの標準フォルダは、全リンクに当たってしまうので含めない。
export function flattenBookmarks(nodes, depth = 0, folders = []) {
  return nodes.flatMap((node) => {
    if (node.url) return [{ ...node, folders }];
    if (depth < 2) return flattenBookmarks(node.children ?? [], depth + 1, folders);
    return [{ ...node, folders }, ...flattenBookmarks(node.children ?? [], depth + 1, [...folders, node.title])];
  });
}

function countLinks(folder) {
  return (folder.children ?? []).reduce((count, node) => count + (node.url ? 1 : countLinks(node)), 0);
}

function bookmarkItem(query, bookmark) {
  const pageScore = scoreFields(query, pageFields(bookmark));
  const score = scoreFields(query, [...pageFields(bookmark), ...folderFields(bookmark)]);
  // フォルダ名で当たった候補は、理由が分かるようにフォルダを併記する。
  const subtitle = score > pageScore ? `${bookmark.folders.join(" / ")} · ${stripUrl(bookmark.url)}` : stripUrl(bookmark.url);
  return { kind: "bookmark", key: `bookmark:${bookmark.id}`, title: bookmark.title || bookmark.url, subtitle, url: bookmark.url, score };
}

function folderItem(folder, score) {
  const subtitle = [...folder.folders.slice(-1), `${countLinks(folder)} 件`].join(" · ");
  return { kind: "folder", key: `folder:${folder.id}`, title: folder.title, subtitle, folder, score };
}

function byScore(a, b) {
  return b.score + KIND_BONUS[b.kind] - (a.score + KIND_BONUS[a.kind]) || (b.visitCount ?? 0) - (a.visitCount ?? 0);
}

// フォルダの中に入っているときの結果。入力が空なら直下の項目をフォルダ、リンクの順に返す。
export function rankFolderContents(query, folder) {
  const nodes = flattenBookmarks(folder.children ?? [], 2);
  if (!normalize(query)) {
    const direct = nodes.filter((node) => node.folders.length === 0);
    return [
      ...direct.filter((node) => !node.url).map((node) => folderItem(node, 0)),
      ...direct.filter((node) => node.url).map((node) => bookmarkItem(query, node)),
    ];
  }
  return nodes
    .map((node) => (node.url ? bookmarkItem(query, node) : folderItem(node, scoreFields(query, [{ text: node.title }, ...folderFields(node)]))))
    .filter((item) => item.score > 0)
    .sort(byScore);
}

function commandFields(command) {
  return [
    { text: command.title },
    { text: command.ja },
    ...(command.keywords ?? []).map((text) => ({ text, weight: 0.95 })),
  ];
}

// URL として開けそうな入力を完全な URL にする。そうでなければ null。
export function toUrl(input) {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i.test(text)) return `http://${text}`;
  if (/^[^\s/@]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text)) return `https://${text}`;
  return null;
}

// サービス > 開いているタブ > ブックマーク > 履歴 の順で同じ URL を 1 つにまとめる。
function dedupeByUrl(entries) {
  const order = ["service", "tab", "bookmark", "history"];
  const seen = new Set();
  const kept = new Set();
  for (const kind of order) {
    for (const entry of entries) {
      if (entry.kind !== kind) continue;
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
      kept.add(entry);
    }
  }
  return entries.filter((entry) => !entry.url || kept.has(entry));
}

// 入力に対して表示する結果を、スコアの高い順に返す。
export function rankResults(query, { commands = [], services = [], tabs = [], bookmarks = [], history = [] }) {
  const entries = [];
  for (const command of commands) {
    const score = scoreFields(query, commandFields(command), { fuzzy: true });
    if (score > 0) entries.push({ kind: "command", key: `command:${command.id}`, title: command.title, subtitle: command.ja, command, score });
  }
  for (const service of services) {
    // キーワードも重みを下げず、同じ当たり方のタブやブックマークより上に出す。
    const score = scoreFields(query, [{ text: service.title }, ...service.keywords.map((text) => ({ text }))]);
    if (score > 0) entries.push({ kind: "service", key: `service:${service.id}`, title: service.title, subtitle: stripUrl(service.url), url: service.url, service, score });
  }
  for (const tab of tabs) {
    const score = scoreFields(query, pageFields(tab));
    if (score > 0) entries.push({ kind: "tab", key: `tab:${tab.id}`, title: tab.title || tab.url, subtitle: stripUrl(tab.url), url: tab.url, tab, score });
  }
  for (const bookmark of bookmarks) {
    // フォルダの行は、親フォルダの名前で当たったときだけ出す（Top と打つと First, Second が並ぶ）。
    const item = bookmark.url
      ? bookmarkItem(query, bookmark)
      : folderItem(bookmark, scoreFields(query, [{ text: bookmark.folders.at(-1), weight: 0.8 }]));
    if (item.score > 0) entries.push(item);
  }
  for (const page of history) {
    const score = Math.max(scoreFields(query, pageFields(page)), SCORE_API_FLOOR) * 0.9;
    entries.push({ kind: "history", key: `history:${page.id}`, title: page.title || page.url, subtitle: stripUrl(page.url), url: page.url, visitCount: page.visitCount ?? 0, score });
  }

  const ranked = dedupeByUrl(entries)
    .sort(byScore)
    .slice(0, MAX_RESULTS);

  const url = toUrl(query);
  if (url) {
    const item = { kind: "url", key: "url", title: `${url} を開く`, subtitle: "URL", url, score: SCORE_URL_ITEM };
    const index = ranked.findIndex((entry) => entry.score + KIND_BONUS[entry.kind] < SCORE_URL_ITEM);
    ranked.splice(index === -1 ? ranked.length : index, 0, item);
  }
  ranked.push({ kind: "search", key: "search", title: `「${query.trim()}」を検索`, subtitle: "既定の検索エンジン", text: query.trim(), score: 0 });
  return ranked;
}
