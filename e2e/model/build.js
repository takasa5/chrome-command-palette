// palette.qnt から、人が読む palette.md と、CI で全遷移を通す paths.json を作る。
// シードを固定しているので、モデルが変わらなければ同じものができる。CI で作り直して差分がないことを確かめる。
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateTraces, stateKey, toPathJson } from "./traces.js";

const SEED = 1;
const SAMPLES = 300;
const STEPS = 25;

const ACTIONS = {
  openNewTab: "Cmd+T",
  openOverlay: "Cmd+Shift+S",
  clearQuery: "入力を消す",
  enterFolder: "フォルダ名 + Enter",
  exitFolder: "Backspace",
  enterCommandScope: "Tab",
  enterSiteScope: "gh + Tab",
  exitScope: "Backspace",
  escape: "Esc",
  switchTab: "タブを選んで Enter",
  openHistory: "履歴を選んで Enter",
  openBookmark: "ブックマークを選んで Enter",
  runSiteSearch: "検索語 + Enter",
};
const MODES = { closed: "閉じている", newTab: "新しいタブ", overlay: "ページに重ねる" };

const traces = generateTraces({ seed: SEED, samples: SAMPLES, steps: STEPS });
const unknown = new Set(traces.flat().map((s) => s.action).filter((a) => a !== "init" && !ACTIONS[a]));
if (unknown.size > 0) throw new Error(`build.js に操作の説明がない: ${[...unknown].join(", ")}`);

const edgesOf = (trace) => trace.slice(1).map((step, i) => ({ from: trace[i].state, action: step.action, to: step.state }));
const edgeKey = ({ from, action, to }) => `${stateKey(from)} ${action} ${stateKey(to)}`;

// ---- paths.json: 全遷移を通す操作列 ----
// 遷移の一覧から、まだ通っていない遷移へ最短でたどり着く道を選び続ける。
// 失敗したときに原因を追いやすいよう、閉じた状態へ戻るたびに、ある程度の長さで区切る。
const PATH_STEPS = 20;
const allEdges = new Set(traces.flatMap(edgesOf).map(edgeKey));
const edgeList = [...new Map(traces.flatMap(edgesOf).map((e) => [edgeKey(e), e])).values()];
const initial = traces[0][0].state;
const covered = new Set();

// from から、まだ通っていない遷移を最後に通る、いちばん短い遷移の列。
function nearestUncovered(from) {
  const queue = [[from, []]];
  const seen = new Set([stateKey(from)]);
  while (queue.length > 0) {
    const [state, route] = queue.shift();
    const next = edgeList.filter((e) => stateKey(e.from) === stateKey(state));
    const fresh = next.find((e) => !covered.has(edgeKey(e)));
    if (fresh) return [...route, fresh];
    for (const e of next) {
      if (seen.has(stateKey(e.to))) continue;
      seen.add(stateKey(e.to));
      queue.push([e.to, [...route, e]]);
    }
  }
  return null;
}

const paths = [];
let path = [{ action: "init", state: initial }];
while (covered.size < allEdges.size) {
  const route = nearestUncovered(path.at(-1).state);
  for (const e of route) {
    covered.add(edgeKey(e));
    path.push({ action: e.action, state: e.to });
    if (e.to.mode === "closed" && path.length > PATH_STEPS) {
      paths.push(path);
      path = [{ action: "init", state: initial }];
      break;
    }
  }
}
if (path.length > 1) paths.push(path);
writeFileSync(join(import.meta.dirname, "paths.json"), toPathJson(paths));

// ---- palette.md: 人が読む状態遷移図と遷移表 ----
// 新しいタブと重ねたときは同じ形になるはずなので、開き方を除いた画面の状態で 1 枚にまとめる。
// 形が違えば、どちらかにしかない遷移として表に書く。
const screen = ({ mode, folders, scope, query }) => (mode === "closed" ? "closed" : [folders.join("/"), scope, query].join("|"));
const describe = (key) => {
  if (key === "closed") return MODES.closed;
  const [folders, scope, query] = key.split("|");
  const parts = [];
  if (folders) parts.push(`フォルダ ${folders.replaceAll("/", " / ")}`);
  if (scope === "commands") parts.push("コマンドに絞り込み");
  if (scope === "gh") parts.push("サイト内検索 gh");
  parts.push(query ? `入力「${query}」` : "入力なし");
  return parts.join("・");
};

const screenEdges = new Map();
for (const e of [...allEdges].map((k) => k.split(" "))) {
  const [fromKey, action, toKey] = e;
  const [fromMode] = fromKey.split("|");
  const [toMode] = toKey.split("|");
  const from = screen(parse(fromKey));
  const to = screen(parse(toKey));
  const mode = fromMode === "closed" ? toMode : fromMode;
  const k = `${from} ${action} ${to}`;
  if (!screenEdges.has(k)) screenEdges.set(k, { from, action, to, modes: new Set() });
  screenEdges.get(k).modes.add(mode);
}
function parse(key) {
  const [mode, folders, scope, query] = key.split("|");
  return { mode, folders: folders ? folders.split("/") : [], scope, query };
}

const states = [...new Set([...screenEdges.values()].flatMap((e) => [e.from, e.to]))]
  .filter((s) => s !== "closed")
  .sort((a, b) => {
    // 浅い画面から順に並べる。フォルダの深さ、絞り込み、入力の順に比べる。
    const [fa, sa, qa] = a.split("|");
    const [fb, sb, qb] = b.split("|");
    const depth = (f) => (f ? f.split("/").length : 0);
    return depth(fa) - depth(fb) || (sa !== "none") - (sb !== "none") || sa.localeCompare(sb) || qa.localeCompare(qb);
  });
const id = (s) => (s === "closed" ? "closed" : `s${states.indexOf(s)}`);
const opens = (e) => e.from === "closed";
// Esc はどの画面からでも閉じるので、図では 1 本にまとめる。
const escapeEverywhere = states.every((s) => [...screenEdges.values()].some((e) => e.from === s && e.action === "escape"));

const mermaid = ["stateDiagram-v2", `  closed : ${MODES.closed}`, "  [*] --> closed", "  state 開いている {"];
for (const s of states) mermaid.push(`    ${id(s)} : ${describe(s)}`);
const openLabels = new Map();
for (const e of screenEdges.values()) {
  if (opens(e)) {
    openLabels.set(e.to, [...(openLabels.get(e.to) ?? []), ACTIONS[e.action]]);
  } else if (!(escapeEverywhere && e.action === "escape")) {
    mermaid.push(`    ${id(e.from)} --> ${id(e.to)} : ${ACTIONS[e.action]}`);
  }
}
mermaid.push("  }");
for (const [to, labels] of openLabels) mermaid.push(`  closed --> ${id(to)} : ${labels.join(" / ")}`);
if (escapeEverywhere) mermaid.push(`  開いている --> closed : ${ACTIONS.escape}`);

const bothModes = (e) => opens(e) || (e.modes.has("newTab") && e.modes.has("overlay"));
const rows = [...screenEdges.values()]
  .sort((a, b) => states.indexOf(a.from) - states.indexOf(b.from) || Object.keys(ACTIONS).indexOf(a.action) - Object.keys(ACTIONS).indexOf(b.action))
  .map((e) => `| ${describe(e.from)} | ${ACTIONS[e.action]} | ${describe(e.to)} | ${bothModes(e) ? "" : [...e.modes].map((m) => MODES[m]).join("、") + "のみ"} |`);

const md = `# パレットの状態遷移

このファイルは \`npm run model\` が [palette.qnt](palette.qnt) から作る。手で書き換えない。

新しいタブで開いたときと、ページに重ねたときの遷移は同じ形なので、開き方を除いてまとめている。
片方にしかない遷移は、表の「開き方」の列に書く。

\`\`\`mermaid
${mermaid.join("\n")}
\`\`\`

| 状態 | 操作 | 次の状態 | 開き方 |
| --- | --- | --- | --- |
${rows.join("\n")}

E2E では、上の遷移を開き方ごとにすべて通す ${paths.length} 本の操作列（[paths.json](paths.json)、計 ${paths.reduce((n, p) => n + p.length - 1, 0)} 操作）を実物で再生する。
`;
writeFileSync(join(import.meta.dirname, "palette.md"), md);
console.log(`states ${states.length + 1}, transitions ${allEdges.size}, paths ${paths.length}, steps ${paths.reduce((n, p) => n + p.length - 1, 0)}`);
