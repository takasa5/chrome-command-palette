// 2 つの palette.md の状態遷移図を比べ、変わったところに印を付けた図を作る。PR のコメントに載せる。
// node e2e/graph/scripts/diagram-diff.js <元の palette.md> <新しい palette.md> で、コメントの本文を出す。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// コメントを探して上書きするための目印。表示はされない。
export const MARKER = "<!-- palette-state-diagram -->";
// 「開いている」の枠の外に置く状態。
const OUTSIDE = new Set(["[*]", "closed", "開いている"]);

// build.js が書いた図を、状態と遷移に戻す。状態は id ではなく名前で表す（id は図ごとに振り直されるため）。
export function parseDiagram(markdown) {
  const block = markdown.match(/```mermaid\n([\s\S]*?)```/)?.[1];
  if (!block) return null;
  const names = new Map([["[*]", "[*]"], ["開いている", "開いている"]]);
  const states = new Map();
  const edges = [];
  for (const line of block.split("\n").map((l) => l.trim())) {
    const edge = line.match(/^(\S+) --> (\S+)(?: : (.+))?$/);
    if (edge) {
      edges.push({ from: edge[1], to: edge[2], label: edge[3] ?? "" });
      continue;
    }
    const state = line.match(/^(\S+) : (.+)$/);
    if (state) {
      const [name, ...internal] = state[2].split("<br/>");
      names.set(state[1], name);
      states.set(name, { name, internal, inside: !OUTSIDE.has(state[1]) });
    }
  }
  return {
    states,
    edges: edges.map(({ from, to, label }) => ({ from: names.get(from), to: names.get(to), label })),
  };
}

// 「Cmd+T / Cmd+Shift+S」のようにまとめたラベルは、並びが違っても同じ遷移として比べる。
const edgeKey = ({ from, to, label }) => `${from}\t${label.split(" / ").sort().join(" / ")}\t${to}`;

// head の図に、base からの変化の印を付けて Mermaid にする。base がなければ印は付けない。
export function renderDiff(base, head) {
  const states = new Map(head.states);
  if (base) for (const [name, state] of base.states) if (!states.has(name)) states.set(name, state);

  const status = new Map();
  const internalLines = new Map();
  for (const [name, state] of states) {
    const before = base?.states.get(name);
    const after = head.states.get(name);
    if (base && !before) status.set(name, "added");
    else if (base && !after) status.set(name, "removed");
    const lines = [...new Set([...(after?.internal ?? []), ...(before?.internal ?? [])])].map((line) => {
      if (!base || (before?.internal.includes(line) && after?.internal.includes(line))) return line;
      if (!status.has(name)) status.set(name, "changed");
      return `${after?.internal.includes(line) ? "＋" : "−"} ${line}`;
    });
    internalLines.set(name, lines);
  }

  const headEdges = new Set(head.edges.map(edgeKey));
  const baseEdges = new Set((base?.edges ?? []).map(edgeKey));
  const edges = [
    ...head.edges.map((e) => ({ ...e, mark: base && !baseEdges.has(edgeKey(e)) ? "＋ " : "" })),
    ...(base?.edges ?? []).filter((e) => !headEdges.has(edgeKey(e))).map((e) => ({ ...e, mark: "− " })),
  ];

  const ids = new Map([["[*]", "[*]"], ["閉じている", "closed"], ["開いている", "開いている"]]);
  let next = 0;
  for (const name of states.keys()) if (!ids.has(name)) ids.set(name, `s${next++}`);
  const mark = { added: "＋ ", removed: "− " };
  const declare = (state) => `${ids.get(state.name)} : ${[`${mark[status.get(state.name)] ?? ""}${state.name}`, ...internalLines.get(state.name)].join("<br/>")}`;
  const arrow = (e) => `${ids.get(e.from)} --> ${ids.get(e.to)}${e.label ? ` : ${e.mark}${e.label}` : ""}`;
  // build.js と同じく、枠の中の状態から出る遷移は枠の中に書く。
  const inside = (e) => !OUTSIDE.has(ids.get(e.from));

  const lines = ["stateDiagram-v2"];
  for (const state of states.values()) if (!state.inside) lines.push(`  ${declare(state)}`);
  lines.push("  state 開いている {");
  for (const state of states.values()) if (state.inside) lines.push(`    ${declare(state)}`);
  for (const e of edges.filter(inside)) lines.push(`    ${arrow(e)}`);
  lines.push("  }");
  for (const e of edges.filter((e) => !inside(e))) lines.push(`  ${arrow(e)}`);

  if (status.size > 0) {
    lines.push(
      "  classDef added fill:#EAF3DE,stroke:#3B6D11,color:#173404",
      "  classDef removed fill:#FCEBEB,stroke:#A32D2D,color:#501313,stroke-dasharray:4 4",
      "  classDef changed fill:#FAEEDA,stroke:#854F0B,color:#412402",
    );
    for (const kind of ["added", "removed", "changed"]) {
      const names = [...status].filter(([, s]) => s === kind).map(([name]) => ids.get(name));
      if (names.length > 0) lines.push(`  class ${names.join(",")} ${kind}`);
    }
  }
  return lines.join("\n");
}

export function commentBody(baseMarkdown, headMarkdown) {
  const head = parseDiagram(headMarkdown);
  if (!head) throw new Error("新しい palette.md に状態遷移図がない");
  return `${MARKER}\n\`\`\`mermaid\n${renderDiff(parseDiagram(baseMarkdown), head)}\n\`\`\`\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [basePath, headPath] = process.argv.slice(2);
  process.stdout.write(commentBody(readFileSync(basePath, "utf8"), readFileSync(headPath, "utf8")));
}
