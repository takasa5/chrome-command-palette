// palette.qnt から乱数で長い操作列を作り、replay.e2e.js で再生する。手元で時間をかけて探るときに使う。
// npm run e2e:walk -- [シード]。失敗したら表示されたシードを渡すと、同じ操作列を再生できる。
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateTraces, toPathJson } from "./traces.js";

const TRACES = 5;
const STEPS = 40;

const seed = process.argv[2] ?? String(Math.floor(Math.random() * 2 ** 31));
const output = join(import.meta.dirname, "..", "..", ".output", "walk");
const file = join(output, `${seed}.json`);
mkdirSync(output, { recursive: true });
writeFileSync(file, toPathJson(generateTraces({ seed, samples: TRACES, steps: STEPS })));

console.log(`シード ${seed} で ${TRACES} 本 × ${STEPS} 操作を再生する（${file}）`);
const { status } = spawnSync("node", ["--test", "--test-timeout=600000", join(import.meta.dirname, "..", "replay.e2e.js")], {
  stdio: "inherit",
  env: { ...process.env, E2E_PATHS: file },
});
if (status !== 0) console.log(`\n再現するには: npm run e2e:walk -- ${seed}`);
process.exit(status ?? 1);
