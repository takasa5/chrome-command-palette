# Chrome Web Store への申請

デベロッパー ダッシュボードに入力する内容と、上げるファイルをまとめる。Microsoft Edge アドオンへの申請は [edge.md](edge.md) にまとめてある。

## 上げるファイル

| 項目 | ファイル | 作り方 |
|---|---|---|
| パッケージ | `command-palette-<version>.zip` | GitHub のリリース `v<version>` に添付されたものを落とす（下の「GitHub のリリース」） |
| アイコン（128×128） | `icons/icon-128.png` | `npm run icons`（`icon.svg` から作る） |
| スクリーンショット（1280×800） | `docs/store/<lang>/screenshot-1.png` 〜 `screenshot-4.png` | `npm run store-assets` |
| 小さいプロモーション タイル（440×280） | `docs/store/<lang>/promo-small.png` | `npm run store-assets` |

スクリーンショットとタイルは、日本語（`ja/`）と英語（`en/`）で文言が違う。ダッシュボードで言語ごとに上げられるなら、その言語のものを上げる。1 組しか上げられないときは英語のものを上げる。

手元で確かめるときは `npm run package` で `dist/` に同じ zip を作れる。ストアに上げるのはリリースの zip にする。

`npm run package` は git で管理しているファイルだけを zip に入れるので、新しいファイルを足したら先に `git add` する。manifest.json や HTML、JS が指すファイルが zip に入らないときは、zip を作らずに止まる。

### GitHub のリリース

ストアに上げる zip は GitHub のリリースで管理する。バージョンを上げるときは、`manifest.json` の `version` を変える PR を作る。

`manifest.json` の `version` を上げる PR をマージすると、`release` ワークフローが `v<version>` のタグでリリースを作り、`npm run package` で作った zip を添付する。タグもリリースも手で作らない。

`v<version>` のタグがもうあるときは何もしない。失敗したときや、まだリリースのないバージョンのリリースを作るときは、Actions から `release` を手で動かす（`gh workflow run release.yml`）。

## ストアの掲載情報

**カテゴリ**: 仕事効率化 > ツール

**言語**: 日本語、英語。ダッシュボードの「ストアの掲載情報」で言語を切り替え、それぞれに下の名前、概要、説明を入れる。名前と言語の一覧は `manifest.json` と `_locales/` から読まれる。

### 日本語

**名前**: Command Palette

**概要**（132 文字まで）:

> Cmd+T（Windows は Ctrl+T）で開くコマンドパレット。タブ切り替え、ブックマークと履歴の検索、ブラウザ操作をキーボードだけで行う。

**説明**:

> 新しいタブを開くと、コマンドパレットが表示されます。キーボードだけで、ブラウザのよく使う操作をすばやく実行できます。
>
> ・開いているタブ、ブックマーク、閲覧履歴をまとめて検索し、Enter で移動
> ・タブを閉じる、ピン留め、ミュート、別ウィンドウへ移動などのブラウザ操作を、英語でも日本語でも検索して実行
> ・ブックマークをフォルダ名で絞り込み、フォルダの中へ入ってたどる
> ・Gmail やカレンダーなどのお気に入りを別名でも呼び出し、開いているタブがあればそこへ移動
> ・キーワード + Tab で、登録したサイトの中を検索
> ・別ウィンドウのタブを、ページの状態を保ったまま今のウィンドウへ移動
> ・Cmd+Shift+S（Windows は Ctrl+Shift+S）で、見ているページの上にパレットを重ねて開く
>
> 読み取ったタブ、履歴、ブックマークはブラウザの中だけで使い、外部へは送りません。
>
> インストールすると、新しいタブページがコマンドパレットに置き換わります。Chrome から確認が出たら「変更を維持」を選んでください。

### 英語

**名前**: Command Palette

**概要**（132 文字まで）:

> A command palette that opens with Cmd+T (Ctrl+T on Windows). Switch tabs, search bookmarks and history, and control the browser.

**説明**:

> Open a new tab and the command palette appears. Run the browser actions you use most, right from the keyboard.
>
> • Search open tabs, bookmarks, and history in one place, and press Enter to jump there
> • Find and run browser actions like closing, pinning, muting, or moving a tab to a new window
> • Narrow bookmarks by folder name, and step into a folder to browse it
> • Open Favorites like Gmail or Calendar by name or alias, and switch to the tab if it's already open
> • Type a keyword and press Tab to search a site you've added
> • Move a tab from another window into the current one without losing its state
> • Press Cmd+Shift+S (Ctrl+Shift+S on Windows) to open the palette over the page you're viewing
>
> Tabs, history, and bookmarks are used only inside your browser and are never sent anywhere.
>
> After you install, the command palette replaces the New Tab page. If Chrome asks, choose "Keep it".

**プライバシー ポリシーの URL**: <https://github.com/takasa5/chrome-command-palette/blob/main/PRIVACY.md>

**ホームページの URL**: <https://github.com/takasa5/chrome-command-palette>

**サポートの URL**: <https://github.com/takasa5/chrome-command-palette/issues>

## プライバシーへの取り組み

### 単一用途の説明

> キーボードから開くコマンドパレットで、タブ、ブックマーク、履歴の検索とブラウザの操作を行う。

### 権限ごとの理由

| 権限 | 理由 |
|---|---|
| `tabs` | 開いているタブの URL とタイトルを検索の候補に出し、選んだタブへの移動、閉じる、ピン、ミュート、別ウィンドウへの移動などのコマンドを実行するため |
| `history` | 入力した語に合う閲覧履歴を候補に出すため。候補で選んだページを履歴から消すため。履歴から消したページを、パレットで選んだ記録からも消すため |
| `bookmarks` | ブックマークをタイトルやフォルダ名で検索し、今のページをブックマークに加えるため |
| `sessions` | 「Reopen Closed Tab」コマンドで、最近閉じたタブを開き直すため |
| `search` | 入力した語を、ユーザーがブラウザで設定した既定の検索エンジンで検索するため |
| `favicon` | 候補の横に、各ページの favicon を表示するため |
| `clipboardWrite` | 「Copy URL」コマンドで、今のページの URL をクリップボードにコピーするため |
| `storage` | 設定画面の内容、タブを最後に見た時刻、パレットで候補を選んだ回数と時刻を保存するため |
| `scripting` | ショートカットで、見ているページの上にパレットを重ねて表示するため |
| `activeTab` | ショートカットを押したタブにだけ、パレットを重ねるスクリプトを入れるため |
| `readingList` | リーディングリストの検索、ページの追加、既読にするため |

### リモートコード

> いいえ。すべてのスクリプトはパッケージに含まれています。

### データの使用

収集するデータの種類は、ダッシュボードで次をチェックする。どれも拡張機能の中で使うだけで、外部へは送らない。

* **ウェブ履歴**: 閲覧履歴を検索の候補に出す
* **ユーザーのアクティビティ**: タブを最後に見た時刻を、しばらく見ていないタブを閉じるコマンドに使う。パレットで候補を選んだ回数と時刻を、よく選ぶ候補を上に出すのに使う

次の 3 つの宣言にはすべてチェックを入れる。

* 承認されている用途以外で、ユーザーデータを第三者に販売、転送しない
* 単一用途と関係のない目的で、ユーザーデータを使用、転送しない
* 信用力の判断や融資の目的で、ユーザーデータを使用、転送しない
