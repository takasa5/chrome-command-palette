# Microsoft Edge アドオンへの申請

Partner Center に入力する内容と、上げるファイルをまとめる。Chrome ウェブストアと同じものは [listing.md](listing.md) を見る。

デベロッパー登録は無料で、Microsoft アカウントで [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd) から行う。登録した開発者名は、ストアに表示される。

## 上げるファイル

| 項目 | ファイル | 作り方 |
|---|---|---|
| パッケージ | `command-palette-<version>.zip` | GitHub のリリース `v<version>` に添付されたもの（Chrome と同じ zip。[listing.md](listing.md#github-のリリース)） |
| ロゴ（300×300） | `docs/store/edge-logo.png` | `npm run icons`（`icon.svg` から作る） |
| スクリーンショット（1280×800、6 枚まで） | `docs/store/<lang>/screenshot-1.png` 〜 `screenshot-4.png` | `npm run store-assets` |
| 小さいプロモーション タイル（440×280） | `docs/store/<lang>/promo-small.png` | `npm run store-assets` |
| 大きいプロモーション タイル（1400×560） | `docs/store/<lang>/promo-large.png` | `npm run store-assets` |

ロゴ、タイル、スクリーンショットは言語ごとに上げる。ロゴは 1 つの言語に上げたあと「Duplicate」で他の言語に写せる。タイルとスクリーンショットは文言が言語ごとに違うので、Japanese には `ja/`、English には `en/` のものを上げる。

## Availability

* **Visibility**: Public
* **Markets**: すべて（既定のまま）

## Properties

* **Category**: Productivity
* **Website**: <https://github.com/takasa5/chrome-command-palette>
* **Support contact detail**: <https://github.com/takasa5/chrome-command-palette/issues>
* **Mature content**: チェックしない

## Privacy

単一用途、権限ごとの理由、リモートコード、データの使用は [listing.md の「プライバシーへの取り組み」](listing.md#プライバシーへの取り組み) と同じものを入れる。データの使用の宣言の文言は Chrome と少し違うが、チェックする種類と、宣言にすべてチェックを入れるのは同じ。

**Privacy Policy URL**: <https://github.com/takasa5/chrome-command-palette/blob/main/PRIVACY.md>

## Store listings

`_locales/` に日本語と英語があるので、両方の言語が並ぶ。名前と短い説明（Short description）は `_locales/*/messages.json` の `extName` と `extDescription` から読まれ、Partner Center では変えられない。変えるときは `messages.json` を直し、`version` を上げてできたリリースの zip を上げ直す。

説明は 250 文字以上、10,000 文字まで。検索語は 7 個まで、1 個 30 文字まで、合わせて 21 語まで。

### 日本語

**スクリーンショットのキャプション**:

1. 開いているタブ、ブックマーク、履歴をまとめて検索
2. タブを閉じる、ピン留め、ミュートなどの操作を探して実行
3. ブックマークをフォルダ階層でたどる
4. キーワード + Tab でサイト内検索

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
> インストールすると、新しいタブページがコマンドパレットに置き換わります。Edge から確認が出たら、変更を保持するほうを選んでください。

**検索語**: コマンドパレット, タブ切り替え, タブ検索, ブックマーク検索, 履歴検索, キーボード操作, 新しいタブ

### 英語

**スクリーンショットのキャプション**:

1. Search open tabs, bookmarks, and history at once
2. Find and run browser actions like closing, pinning, or muting tabs
3. Browse bookmarks by folder from the keyboard
4. Type a keyword and press Tab to search a site

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
> After you install, the command palette replaces the New Tab page. If Edge asks, choose to keep the changes.

**Search terms**: tab manager, tab switcher, tab search, bookmark search, history search, keyboard shortcuts, new tab page

## Notes for certification

審査する人が動かし方を分かるように、提出の画面の「Notes for certification」に入れる。

> No account or sign-in is needed. The extension does not send any data over the network.
>
> How to test:
> 1. After installing, open a new tab (Ctrl+T / Cmd+T). The command palette replaces the New Tab page. If Edge asks whether to keep the change, choose to keep it.
> 2. Type to search open tabs, bookmarks, history, and commands. Use the arrow keys to move and Enter to run. Esc closes the palette.
> 3. Type a command name such as "Pin / Unpin Tab", "Mute / Unmute Tab", or "Reading List" and press Enter to run it.
> 4. On any normal web page, press Ctrl+Shift+S (Cmd+Shift+S on macOS) to open the palette on top of the page.
> 5. Settings are on the extension's options page (run "Command Palette Settings" in the palette).
