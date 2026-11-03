// .work/raw の画面を stage.html に載せて 1 コマずつ書き出し、ffmpeg で GIF にする。
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = import.meta.dirname;
const work = join(here, ".work");
const repo = resolve(here, "../..");
const out = process.argv[2] ?? join(repo, "docs/demo.gif");
const framesDir = join(work, "frames");
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const { favicons, frames } = JSON.parse(readFileSync(join(work, "timeline.json"), "utf8"));
const logo = `data:image/svg+xml;base64,${readFileSync(join(repo, "icon.svg")).toString("base64")}`;

// 押した瞬間と、パレットが開く瞬間だけ数コマ足して動きを付ける。
const steps = [];
for (const frame of frames) {
  const base = { shot: `.work/raw/${frame.shot}`, caption: frame.caption, keys: frame.keys, tabs: frame.tabs };
  if (frame.event === "open") {
    steps.push({ ...base, dur: 0.05, keyScale: 1.18, pageOpacity: 0.25, pageScale: 0.985 });
    steps.push({ ...base, dur: 0.05, keyScale: 1.1, pageOpacity: 0.65, pageScale: 0.993 });
    steps.push({ ...base, dur: frame.dur });
  } else if (frame.event) {
    steps.push({ ...base, dur: 0.05, keyScale: 1.18 });
    steps.push({ ...base, dur: 0.05, keyScale: 1.1 });
    steps.push({ ...base, dur: frame.dur });
  } else {
    steps.push({ ...base, dur: frame.dur });
  }
}

const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1120, height: 800 }, deviceScaleFactor: 2 });
await page.goto(`file://${join(here, "stage.html")}`);

let list = "ffconcat version 1.0\n";
for (const [index, step] of steps.entries()) {
  const file = join(framesDir, `${String(index).padStart(4, "0")}.png`);
  await page.evaluate((args) => window.draw(args), { ...step, favicons, logo });
  await page.screenshot({ path: file });
  list += `file '${file}'\nduration ${step.dur}\n`;
}
await browser.close();
// concat は最後のコマの長さを読まないので、もう一度並べる。
list += `file '${join(framesDir, `${String(steps.length - 1).padStart(4, "0")}.png`)}'\n`;
writeFileSync(join(work, "frames.txt"), list);

execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(work, "frames.txt"),
  "-filter_complex", "scale=1120:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle",
  "-fps_mode", "vfr", "-loop", "0", out,
], { stdio: "inherit" });
console.log("steps", steps.length, "seconds", steps.reduce((sum, s) => sum + s.dur, 0).toFixed(1));
