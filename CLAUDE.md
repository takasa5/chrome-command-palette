# CLAUDE.md

## 開発

* 外部サービスにデータを送らない
* Chrome API に依存しない処理は純粋関数にして、`tests/` にテストを書く
* 新しい Web API を使うときは、`manifest.json` の `minimum_chrome_version` で動くか確認する

## 動作確認

`npm test` では画面の動作を確認できないので、UI を変えたら実際に拡張機能を読み込んで確認する。

* Playwright の Chrome for Testing を、`--load-extension` と `--disable-extensions-except` を付けて起動する
* パレットは `chrome-extension://<id>/palette.html?focus` を開く
* x.com は自動ブラウザからの接続が拒否されるので、`chrome.history.addUrl` で履歴を用意して確認する

## E2E

画面の主な流れは `npm run e2e` で確かめる（`e2e/`、CI でも動く）。E2E を書く、直す、足すか判断する、パレットの状態遷移モデルを変えるときは、`e2e` スキル（[.claude/skills/e2e/SKILL.md](.claude/skills/e2e/SKILL.md)）に従う。

## デモ GIF

`docs/demo.gif` は `scripts/demo` で `npm install` のあと `npm run record` で作り直せる。Playwright の Chromium と ffmpeg が必要。

## Git

* コミットメッセージは件名も本文も日本語で書く
* `main` へ直接 push しない。ブランチを切って PR を作り、CI が通ったのを確かめてからマージする

## README

README は機能の概要だけを短く書く。機能を足すときも、次の方針で全体が長くならないようにする。

* コマンドを 1 つ足しただけなら書かない。コマンド一覧は `commands.js` で分かる
* 特徴は 1 項目 1〜2 文で、何ができるかだけを書く
* 例外、条件、上限、内部の仕組みは書かない。設定画面やコードで分かることも書かない
* キー操作は「使い方」の表に書き、特徴で繰り返さない
* 同じ話題の機能は、項目を増やさず既存の項目にまとめる
* 文末は「〜することができる」ではなく「〜できる」「〜する」にする
