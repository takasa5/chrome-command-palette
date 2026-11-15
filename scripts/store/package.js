// ストアに上げる zip を dist/ に作る。git で管理しているファイルだけを入れる。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { findMissingFiles, isPackageName, manifestReferences, selectPackageFiles, sourceReferences } from "./package-files.js";

const root = resolve(import.meta.dirname, "..", "..");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const files = selectPackageFiles(tracked);

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const references = [
  ...manifestReferences(manifest),
  ...files.filter((file) => /\.(js|html)$/.test(file)).flatMap((file) => sourceReferences(readFileSync(join(root, file), "utf8"))),
];
const missing = findMissingFiles(references, files);
const packages = missing.filter(isPackageName);
const missingFiles = missing.filter((reference) => !isPackageName(reference));
if (packages.length > 0) console.error(`拡張機能では npm のパッケージを名前で読み込めません: ${packages.join(", ")}`);
if (missingFiles.length > 0) console.error(`zip に入らないファイルを参照しています: ${missingFiles.join(", ")}`);
if (missing.length > 0) process.exit(1);

const dist = join(root, "dist");
const zip = join(dist, `command-palette-${manifest.version}.zip`);
mkdirSync(dist, { recursive: true });
rmSync(zip, { force: true });
execFileSync("zip", ["-X", "-q", zip, ...files], { cwd: root });
console.log(`${zip} (${files.length} ファイル)`);
for (const file of files) console.log(`  ${file}`);
