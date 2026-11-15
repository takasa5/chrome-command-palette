import { test } from "node:test";
import assert from "node:assert/strict";
import { findMissingFiles, manifestReferences, selectPackageFiles, sourceReferences } from "../scripts/store/package-files.js";

test("selectPackageFiles はルートのページとスクリプト、manifest.json、icons の PNG だけを選ぶ", () => {
  const files = [
    "palette.js",
    "palette.html",
    "palette.css",
    "icon.svg",
    "manifest.json",
    "icons/icon-128.png",
    "package.json",
    "package-lock.json",
    "README.md",
    "CLAUDE.md",
    ".gitignore",
    "tests/search.test.js",
    "e2e/support/browser.js",
    "scripts/store/package.js",
    "docs/logo.svg",
    "docs/store/screenshot-1.png",
  ];
  assert.deepEqual(selectPackageFiles(files), [
    "icon.svg",
    "icons/icon-128.png",
    "manifest.json",
    "palette.css",
    "palette.html",
    "palette.js",
  ]);
});

test("manifestReferences は manifest.json が指すファイルを集める", () => {
  const manifest = {
    icons: { 16: "icons/icon-16.png", 128: "icons/icon-128.png" },
    background: { service_worker: "background.js", type: "module" },
    options_ui: { page: "options.html" },
    chrome_url_overrides: { newtab: "palette.html" },
    web_accessible_resources: [{ resources: ["palette.html"], matches: ["<all_urls>"] }],
  };
  assert.deepEqual(manifestReferences(manifest), ["icons/icon-16.png", "icons/icon-128.png", "background.js", "options.html", "palette.html", "palette.html"]);
});

test("manifestReferences は無い項目を飛ばす", () => {
  assert.deepEqual(manifestReferences({ manifest_version: 3 }), []);
});

test("sourceReferences は HTML の src と href を拾い、外部の URL は落とす", () => {
  const html = `<script src="redirect.js"></script><link rel="icon" href="icon.svg" /><a href="https://example.com/">x</a><a href="#top">top</a>`;
  assert.deepEqual(sourceReferences(html), ["redirect.js", "icon.svg"]);
});

test("sourceReferences は JS の import、files、url、getURL を拾い、クエリと先頭の ./ を落とす", () => {
  const js = [
    `import { a } from "./search.js";`,
    `const m = await import("./translate.js");`,
    `chrome.scripting.executeScript({ target, files: ["translate-page.js"] });`,
    `chrome.offscreen.createDocument({ url: "offscreen.html" });`,
    `chrome.runtime.getURL("palette.html") + "?focus";`,
    `chrome.runtime.getURL("/options.html?x=1");`,
    `chrome.runtime.getURL("/_favicon/");`,
    `chrome.tabs.create({ url: "https://mail.google.com/" });`,
    `const labels = { url: "URL" };`,
    `import { chromium } from "playwright-core";`,
  ].join("\n");
  assert.deepEqual(sourceReferences(js), ["search.js", "playwright-core", "translate.js", "palette.html", "options.html", "translate-page.js", "offscreen.html"]);
});

test("findMissingFiles は zip に入らない参照を重複なく返す", () => {
  assert.deepEqual(findMissingFiles(["a.js", "b.js", "a.js", "icons/icon-16.png"], ["a.js"]), ["b.js", "icons/icon-16.png"]);
  assert.deepEqual(findMissingFiles(["a.js"], ["a.js", "b.js"]), []);
});
