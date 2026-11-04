import assert from "node:assert/strict";
import { test } from "node:test";
import { MARKER, commentBody, parseDiagram, renderDiff } from "../e2e/graph/scripts/diagram-diff.js";

const diagram = (body) => `# 状態遷移\n\n\`\`\`mermaid\n${body}\n\`\`\`\n\n| 表 |\n`;

const BASE = diagram(`stateDiagram-v2
  closed : 閉じている
  [*] --> closed
  state 開いている {
    s0 : 入力なし
    s1 : フォルダ Docs・入力なし
    s0 --> s1 : フォルダ名 + Enter
    s1 --> s0 : Backspace
  }
  closed --> s0 : Cmd+T
  開いている --> closed : Esc`);

test("parseDiagram は状態を名前で、内部遷移と遷移も取り出す", () => {
  const head = parseDiagram(
    diagram(`stateDiagram-v2
  closed : 閉じている
  state 開いている {
    s0 : 入力なし<br/>Backspace / 何もしない
    s0 --> closed : タブを選んで Enter
  }
  closed --> s0 : Cmd+T`),
  );
  assert.deepEqual(head.states.get("入力なし"), { name: "入力なし", internal: ["Backspace / 何もしない"], inside: true });
  assert.equal(head.states.get("閉じている").inside, false);
  assert.deepEqual(head.edges.at(-1), { from: "閉じている", to: "入力なし", label: "Cmd+T" });
});

test("parseDiagram は図がなければ null を返す", () => {
  assert.equal(parseDiagram("# 図なし\n"), null);
});

test("元がなければ印を付けない", () => {
  const out = renderDiff(null, parseDiagram(BASE));
  assert.doesNotMatch(out, /＋|−|classDef/);
  assert.match(out, /s0 --> s1 : フォルダ名 \+ Enter/);
});

test("足された遷移に ＋、消えた遷移に − を付けて両方描く", () => {
  const head = BASE.replace("    s1 --> s0 : Backspace\n", "    s0 --> s0 : Tab\n");
  const out = renderDiff(parseDiagram(BASE), parseDiagram(head));
  assert.match(out, /s0 --> s0 : ＋ Tab/);
  assert.match(out, /s1 --> s0 : − Backspace/);
  assert.match(out, /s0 --> s1 : フォルダ名 \+ Enter/);
});

test("まとめたラベルの並びが違うだけなら、変わっていないものとする", () => {
  const base = BASE.replace("closed --> s0 : Cmd+T", "closed --> s0 : Cmd+Shift+S / Cmd+T");
  const head = BASE.replace("closed --> s0 : Cmd+T", "closed --> s0 : Cmd+T / Cmd+Shift+S");
  const out = renderDiff(parseDiagram(base), parseDiagram(head));
  assert.match(out, /closed --> s0 : Cmd\+T \/ Cmd\+Shift\+S$/m);
  assert.doesNotMatch(out, /＋|−/);
});

test("足された状態と消えた状態に印と色を付ける", () => {
  const head = BASE.replace("s1 : フォルダ Docs・入力なし", "s1 : フォルダ Specs・入力なし");
  const out = renderDiff(parseDiagram(BASE), parseDiagram(head));
  assert.match(out, /s1 : ＋ フォルダ Specs・入力なし/);
  assert.match(out, /s2 : − フォルダ Docs・入力なし/);
  assert.match(out, /class s1 added/);
  assert.match(out, /class s2 removed/);
});

test("内部遷移だけ変わった状態は changed にし、変わった行に印を付ける", () => {
  const head = BASE.replace("s0 : 入力なし", "s0 : 入力なし<br/>Backspace / 何もしない");
  const out = renderDiff(parseDiagram(BASE), parseDiagram(head));
  assert.match(out, /s0 : 入力なし<br\/>＋ Backspace \/ 何もしない/);
  assert.match(out, /class s0 changed/);
});

test("枠の外の状態への矢印は、枠の外に書く", () => {
  const head = BASE.replace("    s1 --> s0 : Backspace\n", "    s1 --> s0 : Backspace\n    s1 --> closed : ブックマークを選んで Enter\n");
  const out = renderDiff(null, parseDiagram(head));
  const [inside, outside] = out.split("\n  }\n");
  assert.doesNotMatch(inside, /--> closed/);
  assert.match(outside, /^  s1 --> closed : ブックマークを選んで Enter$/m);
});

test("commentBody は目印と Mermaid の図だけを返す", () => {
  const body = commentBody(BASE, BASE);
  assert.ok(body.startsWith(`${MARKER}\n\`\`\`mermaid\nstateDiagram-v2`));
  assert.ok(body.trimEnd().endsWith("```"));
  assert.doesNotMatch(body, /\| 表 \|/);
});
