import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_LINES,
  cachedVerdict,
  classifyPaths,
  commentBody,
  decide,
  packageJsonConcerns,
  parseApprove,
  parseVerdict,
  shaMatches,
} from "../.github/merge-gate/gate.js";

const BASE_DIRS = new Set(["docs", "e2e", "e2e/example", "e2e/graph", "e2e/support", "tests", "scripts", "scripts/demo", ".github"]);
const PKG = { name: "x", scripts: { test: "node --test" }, devDependencies: { "playwright-core": "1.64.1" } };
const file = (filename, extra = {}) => ({ filename, status: "modified", additions: 5, deletions: 1, ...extra });
const classify = (files, headPackage = PKG) => classifyPaths({ files, basePackage: PKG, headPackage, baseDirs: BASE_DIRS });

test("README と docs/ だけなら docs", () => {
  assert.equal(classify([file("README.md"), file("docs/demo.gif")]).tier, "docs");
});

test("コードやテストは LLM に回す", () => {
  const result = classify([file("commands.js"), file("tests/search.test.js"), file("README.md")]);
  assert.equal(result.tier, "code");
  assert.deepEqual(result.reasons, []);
});

test("CLAUDE.md と skill は LLM に回す", () => {
  assert.equal(classify([file("CLAUDE.md"), file(".claude/skills/e2e/SKILL.md")]).tier, "code");
});

test(".github/、manifest.json、状態遷移モデルは人間", () => {
  for (const path of [".github/workflows/test.yml", ".github/merge-gate/gate.js", "manifest.json", "e2e/graph/palette.qnt", ".claude/settings.json", ".claude/hooks/block-approve.js"]) {
    const result = classify([file("commands.js"), file(path)]);
    assert.equal(result.tier, "human", path);
    assert.match(result.reasons[0], /人間が見るファイル/);
  }
});

test("人間が見るファイルからの rename も人間", () => {
  assert.equal(classify([file("old.yml", { status: "renamed", previous_filename: ".github/workflows/test.yml" })]).tier, "human");
});

test("package.json の scripts だけの変更は LLM に回す", () => {
  const head = { ...PKG, scripts: { ...PKG.scripts, lint: "eslint ." } };
  assert.equal(classify([file("package.json")], head).tier, "code");
});

test("依存パッケージや install スクリプトが変わると人間", () => {
  assert.deepEqual(packageJsonConcerns(PKG, { ...PKG, devDependencies: { "playwright-core": "1.65.0" } }), ["package.json の devDependencies が変わる"]);
  assert.deepEqual(packageJsonConcerns(PKG, { ...PKG, dependencies: { a: "1" } }), ["package.json の dependencies が変わる"]);
  assert.deepEqual(packageJsonConcerns(PKG, { ...PKG, scripts: { ...PKG.scripts, postinstall: "node x.js" } }), [
    "package.json の scripts.postinstall が変わる（install のときに動く）",
  ]);
  const head = { ...PKG, devDependencies: { ...PKG.devDependencies, quint: "1" } };
  const result = classify([file("package.json"), file("package-lock.json")], head);
  assert.equal(result.tier, "human");
  assert.deepEqual(result.reasons, ["package.json の devDependencies が変わる"]);
});

test("package-lock.json だけが変わると人間", () => {
  const result = classify([file("package-lock.json")]);
  assert.equal(result.tier, "human");
  assert.match(result.reasons[0], /package-lock\.json だけが変わる/);
});

test("新しいトップレベルのディレクトリや e2e/ の下の新しいディレクトリができると人間", () => {
  assert.deepEqual(classify([file("lib/a.js", { status: "added" })]).reasons, ["新しいディレクトリ lib/ ができる"]);
  assert.deepEqual(classify([file("e2e/visual/a.e2e.js", { status: "added" })]).reasons, ["新しいディレクトリ e2e/visual/ ができる"]);
  // 今あるディレクトリに足すだけなら LLM に回す
  assert.equal(classify([file("e2e/example/b.e2e.js", { status: "added" }), file("new.js", { status: "added" })]).tier, "code");
  // tests/ の下のサブディレクトリは e2e/ ほど大きな判断ではないので見ない
  assert.equal(classify([file("tests/fixtures/a.json", { status: "added" })]).tier, "code");
});

test(`${MAX_LINES} 行を超える変更は人間`, () => {
  const result = classify([file("a.js", { additions: 300, deletions: 101 })]);
  assert.equal(result.tier, "human");
  assert.match(result.reasons[0], /401 行/);
  assert.equal(classify([file("a.js", { additions: 300, deletions: 100 })]).tier, "code");
});

test("ファイルの分類を返す", () => {
  assert.deepEqual(classify([file("README.md"), file("manifest.json"), file("a.js")]).files, [
    { path: "README.md", tier: "docs" },
    { path: "manifest.json", tier: "human" },
    { path: "a.js", tier: "code" },
  ]);
});

test("parseVerdict は形がおかしい答えを null にする", () => {
  assert.deepEqual(parseVerdict({ structured_output: { kind: "test", reason: " テストを足す " } }), { kind: "test", reason: "テストを足す" });
  assert.equal(parseVerdict({ is_error: true, structured_output: { kind: "test", reason: "x" } }), null);
  assert.equal(parseVerdict({ structured_output: { kind: "safe", reason: "x" } }), null);
  assert.equal(parseVerdict({ result: "test" }), null);
  assert.equal(parseVerdict(null), null);
});

test("decide: パスで人間なら LLM の答えに関係なく pending", () => {
  const paths = classify([file("manifest.json")]);
  const result = decide({ paths, verdict: { kind: "test", reason: "x" } });
  assert.equal(result.state, "pending");
  assert.match(result.description, /^人間が見る: manifest\.json/);
});

test("decide: docs は LLM なしで success", () => {
  assert.equal(decide({ paths: classify([file("README.md")]), verdict: null }).state, "success");
});

test("decide: コードは LLM の種類で決める", () => {
  const paths = classify([file("a.js")]);
  for (const kind of ["docs", "test", "refactor", "fix"]) assert.equal(decide({ paths, verdict: { kind, reason: "x" } }).state, "success", kind);
  for (const kind of ["feature", "infra", "risky"]) {
    const result = decide({ paths, verdict: { kind, reason: "新しいコマンド" } });
    assert.equal(result.state, "pending", kind);
    assert.deepEqual(result.reasons, [`LLM の判定が ${kind}: 新しいコマンド`]);
  }
});

test("decide: LLM の答えがなければ pending", () => {
  const paths = classify([file("a.js")]);
  assert.deepEqual(decide({ paths, verdict: null }).reasons, ["LLM の判定が得られなかった"]);
  assert.deepEqual(decide({ paths, verdict: null, llmSkipped: "PR の作者が対象外" }).reasons, ["PR の作者が対象外"]);
});

test("decide: description は 140 文字に収める", () => {
  const paths = classify([file("a.js")]);
  const result = decide({ paths, verdict: { kind: "risky", reason: "あ".repeat(300) } });
  assert.equal([...result.description].length, 140);
});

test("parseApprove は 1 行目の /approve <sha> だけを読む", () => {
  assert.equal(parseApprove("/approve 0123456789AB"), "0123456789ab");
  assert.equal(parseApprove("/approve 0123456789ab\nよさそう"), "0123456789ab");
  assert.equal(parseApprove("/approve 01234"), null);
  assert.equal(parseApprove("/approve"), null);
  assert.equal(parseApprove("LGTM\n/approve 0123456789ab"), null);
  assert.equal(parseApprove(null), null);
});

test("shaMatches は head の SHA の先頭と比べる", () => {
  const head = "0123456789abcdef0123456789abcdef01234567";
  assert.ok(shaMatches("0123456789ab", head));
  assert.ok(!shaMatches("123456789abc", head));
});

test("コメントに隠した判定を、同じ SHA のときだけ使い回す", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const paths = classify([file("a.js")]);
  const verdict = { kind: "fix", reason: "小さな修正" };
  const body = commentBody({ sha, paths, verdict, result: decide({ paths, verdict }) });
  assert.match(body, /自動でマージしてよい/);
  assert.deepEqual(cachedVerdict(body, sha), verdict);
  assert.equal(cachedVerdict(body, "f".repeat(40)), null);
  assert.equal(cachedVerdict("関係ないコメント", sha), null);
});

test("pending のコメントには承認のしかたを書く", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const paths = classify([file("manifest.json")]);
  const body = commentBody({ sha, paths, verdict: null, result: decide({ paths, verdict: null }) });
  assert.match(body, /`\/approve 0123456789ab`/);
  assert.match(body, /\| `manifest\.json` \| 人間 \|/);
});
