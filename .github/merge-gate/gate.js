// PR を自動でマージしてよいかを決める。GitHub に触れない純粋関数だけを置く（run.js が呼ぶ）。
// このディレクトリを変える PR は、いつも人間が見る。

// commit status の名前。ブランチ保護の required check にこの名前を使う。
export const CONTEXT = "merge-gate";
// 判定のコメントを探して上書きするための目印。
export const MARKER = "<!-- merge-gate -->";
// これより大きい PR は人間が見る（追加と削除の行数の合計）。
export const MAX_LINES = 400;
// LLM に判定させる種類のうち、自動でマージしてよいもの。
export const AUTO_KINDS = new Set(["docs", "test", "refactor", "fix"]);
export const KINDS = ["docs", "test", "refactor", "fix", "feature", "infra", "risky"];

// .claude/settings.json には、Claude が /approve をコメントできないようにする deny ルールがある。
const HUMAN_PATHS = [/^\.github\//, /^manifest\.json$/, /^e2e\/graph\/palette\.qnt$/, /^\.claude\/settings\.json$/];
const DOCS_PATHS = [/^README\.md$/, /^docs\//];
const DEPENDENCY_KEYS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "bundleDependencies", "overrides"];
// npm install や npm ci のときに動くスクリプト。
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall", "prepare", "preprepare", "postprepare"];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const changedDependencyKeys = (base, head) => DEPENDENCY_KEYS.filter((key) => !same(base?.[key], head?.[key]));

// package.json の変更のうち、人間が見るべきものの説明を返す。なければ空。
export function packageJsonConcerns(base, head) {
  const concerns = changedDependencyKeys(base, head).map((key) => `package.json の ${key} が変わる`);
  for (const key of INSTALL_SCRIPTS) {
    if (!same(base?.scripts?.[key], head?.scripts?.[key])) concerns.push(`package.json の scripts.${key} が変わる（install のときに動く）`);
  }
  return concerns;
}

const dirOf = (path) => path.split("/").slice(0, -1);

// 新しく追加されたファイルが、新しいトップレベルのディレクトリか、e2e/ の下の新しいディレクトリを作るなら、そのディレクトリを返す。
function newDirectory(path, baseDirs) {
  const dirs = dirOf(path);
  if (dirs.length === 0) return null;
  if (!baseDirs.has(dirs[0])) return `${dirs[0]}/`;
  if (dirs[0] === "e2e" && dirs.length >= 2 && !baseDirs.has(`e2e/${dirs[1]}`)) return `e2e/${dirs[1]}/`;
  return null;
}

// files: GitHub の PR のファイル一覧（filename, previous_filename, status, additions, deletions）
// basePackage / headPackage: base と head の package.json（なければ null）
// baseDirs: base にあるディレクトリのパスの集合（"e2e", "e2e/graph" のように末尾の / なし）
// 返り値の tier は "human"（人間が見る）、"docs"（そのまま通す）、"code"（LLM が判定する）
export function classifyPaths({ files, basePackage, headPackage, baseDirs }) {
  const reasons = [];
  const perFile = [];
  let docsOnly = files.length > 0;
  const changed = new Set(files.map((f) => f.filename));

  for (const file of files) {
    const paths = [file.filename, file.previous_filename].filter(Boolean);
    let tier = "code";
    if (paths.some((p) => HUMAN_PATHS.some((r) => r.test(p)))) {
      tier = "human";
      reasons.push(`${file.filename} は要レビューのファイル`);
    } else if (paths.every((p) => DOCS_PATHS.some((r) => r.test(p)))) {
      tier = "docs";
    }
    if (file.status === "added" || file.status === "renamed" || file.status === "copied") {
      const dir = newDirectory(file.filename, baseDirs);
      if (dir) {
        tier = "human";
        reasons.push(`新しいディレクトリ ${dir} ができる`);
      }
    }
    if (tier !== "docs") docsOnly = false;
    perFile.push({ path: file.filename, tier });
  }

  if (changed.has("package.json")) {
    const concerns = packageJsonConcerns(basePackage, headPackage);
    reasons.push(...concerns);
    if (concerns.length) mark(perFile, "package.json");
  }
  if (changed.has("package-lock.json") && changedDependencyKeys(basePackage, headPackage).length === 0) {
    reasons.push("package-lock.json だけが変わる（依存パッケージは package.json と一緒に変える）");
    mark(perFile, "package-lock.json");
  }

  const lines = files.reduce((sum, f) => sum + (f.additions ?? 0) + (f.deletions ?? 0), 0);
  if (lines > MAX_LINES) reasons.push(`変更が ${lines} 行あり、${MAX_LINES} 行を超える`);
  if (files.length === 0) reasons.push("変わったファイルがない");

  const unique = [...new Set(reasons)];
  const tier = unique.length ? "human" : docsOnly ? "docs" : "code";
  return { tier, reasons: unique, files: perFile, lines };
}

function mark(perFile, path) {
  const file = perFile.find((f) => f.path === path);
  if (file) file.tier = "human";
}

// LLM の答えを確かめる。形がおかしければ null を返す（人間が見ることになる）。
export function parseVerdict(output) {
  const verdict = output?.structured_output;
  if (output?.is_error || !verdict || typeof verdict !== "object") return null;
  if (!KINDS.includes(verdict.kind) || typeof verdict.reason !== "string") return null;
  return { kind: verdict.kind, reason: verdict.reason.trim() };
}

// パスの分類と LLM の判定を合わせて、commit status を決める。
// LLM はリスクを上げる方向にしか効かない。パスで human になったら、LLM の答えは見ない。
export function decide({ paths, verdict, llmSkipped }) {
  if (paths.tier === "human") return pending(paths.reasons);
  if (paths.tier === "docs") return { state: "success", description: "ドキュメントだけの変更", reasons: [] };
  if (!verdict) return pending([llmSkipped ?? "LLM の判定が得られなかった"]);
  // 詳しい理由はコメントの「LLM の判定」の行に書くので、ここでは種類だけにする。
  if (!AUTO_KINDS.has(verdict.kind)) return pending([`LLM の判定が ${verdict.kind}（${KIND_LABELS[verdict.kind]}）`]);
  return { state: "success", description: `LLM の判定が ${verdict.kind}`, reasons: [] };
}

const KIND_LABELS = {
  docs: "文章だけの変更",
  test: "テストの追加や修正",
  refactor: "振る舞いを変えない整理",
  fix: "小さなバグの修正",
  feature: "機能の追加や振る舞いの変更",
  infra: "新しい仕組みやツールの導入",
  risky: "影響が読めない変更",
};

function pending(reasons) {
  return { state: "pending", description: truncate(`レビューをお願いします: ${reasons[0]}`, 140), reasons };
}

export const truncate = (text, max) => ([...text].length <= max ? text : [...text].slice(0, max - 1).join("") + "…");

// "/approve <sha>" の SHA を返す。1 行目だけを見る。
// .claude/settings.json の deny ルールは大文字と小文字を区別するので、こちらも小文字の /approve だけを受け付ける。
export function parseApprove(body) {
  const match = body?.split("\n")[0].trim().match(/^\/approve\s+([0-9a-fA-F]{12,40})$/);
  return match ? match[1].toLowerCase() : null;
}

export const shaMatches = (approved, head) => approved.length >= 12 && head.toLowerCase().startsWith(approved);

// 判定のコメント。末尾に、同じ SHA の判定を使い回すためのデータを隠して置く。
export function commentBody({ sha, paths, verdict, result, approvedBy }) {
  const icon = result.state === "success" ? "✅" : "👀";
  const lines = [MARKER, `## ${icon} merge-gate`, ""];
  if (approvedBy) {
    lines.push(`@${approvedBy} が \`${sha.slice(0, 12)}\` を承認した。自動でマージしてよい。`);
  } else if (result.state === "success") {
    lines.push(`自動でマージしてよい（${result.description}）。`);
  } else {
    lines.push("レビューをお願いします。理由:", "", ...result.reasons.map((r) => `- ${r}`));
    lines.push("", `確認したら \`/approve ${sha.slice(0, 12)}\` とコメントする。push すると承認はやり直しになる。`);
  }
  if (verdict) lines.push("", `**LLM の判定**: \`${verdict.kind}\` — ${verdict.reason}`);
  lines.push("", "<details><summary>ファイルごとの分類</summary>", "", "| ファイル | 分類 |", "|---|---|");
  const label = { human: "要レビュー", docs: "ドキュメント", code: "コード" };
  for (const f of paths.files) lines.push(`| \`${f.path}\` | ${label[f.tier]} |`);
  lines.push("", "</details>", "", `<!-- merge-gate-data ${JSON.stringify({ sha, verdict })} -->`);
  return lines.join("\n");
}

// コメントに隠したデータから、同じ SHA の LLM の判定を取り出す。
export function cachedVerdict(body, sha) {
  const json = body?.match(/<!-- merge-gate-data (.*) -->/)?.[1];
  if (!json) return null;
  try {
    const data = JSON.parse(json);
    if (data.sha !== sha || !data.verdict) return null;
    return parseVerdict({ structured_output: data.verdict });
  } catch {
    return null;
  }
}
