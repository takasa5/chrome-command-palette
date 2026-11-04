// Claude があなたの GitHub アカウントで `/approve` をコメントし、merge-gate を自分で通すのを防ぐ。
// Bash で動かすコマンドに `/approve` が含まれていたら止める。PR の承認は人間が GitHub の画面でする。
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const command = input.tool_input?.command ?? "";
if (/\/approve\b/i.test(command)) {
  console.error("merge-gate の /approve は人間が書くもの。Claude はコメントしない。承認が必要なら、ユーザーに頼む。");
  process.exit(2);
}
