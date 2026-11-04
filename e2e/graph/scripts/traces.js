// palette.qnt を Quint で動かし、操作列を取り出す。
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const spec = join(import.meta.dirname, "..", "palette.qnt");

// 1 本の操作列は [{ action, state }] で、先頭は action が init の初期状態。
// rust の実行環境は初回に GitHub から取ってくるので、typescript で動かす。
export function generateTraces({ seed, samples, steps }) {
  const dir = mkdtempSync(join(tmpdir(), "command-palette-model-"));
  try {
    execFileSync("npx", [
      "quint", "run", spec,
      "--backend", "typescript", "--mbt",
      "--seed", String(seed), "--max-samples", String(samples), "--n-traces", String(samples), "--max-steps", String(steps),
      "--invariants", "closedIsClean", "folderOrScope",
      "--out-itf", join(dir, "t{seq}.itf.json"),
    ], { stdio: ["ignore", "ignore", "inherit"] });
    return readdirSync(dir)
      .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
      .map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")).states.map(toStep));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function toStep({ mode, folders, scope, query, "mbt::actionTaken": action }) {
  return { action, state: { mode, folders, scope, query } };
}

export const stateKey = ({ mode, folders, scope, query }) => [mode, folders.join("/"), scope, query].join("|");

// replay.e2e.js が読む形。1 操作を { action, mode, folders, scope, query } にする。
export const toPathJson = (traces) => JSON.stringify(traces.map((steps) => steps.map(({ action, state }) => ({ action, ...state }))), null, 1) + "\n";
