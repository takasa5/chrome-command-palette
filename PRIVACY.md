# プライバシーポリシー

Command Palette（以下「本拡張機能」）が扱うデータについて説明します。

## 要点

本拡張機能は、データを開発者や第三者のサーバーへ送りません。データの収集、販売、広告への利用もしません。読み取ったデータはすべてお使いのブラウザの中だけで使います。

## 読み取るデータと使い道

| データ | 使い道 |
|---|---|
| 開いているタブの URL とタイトル | 候補に出し、選んだタブへ移動する。タブの操作（閉じる、ピン、移動など）をする |
| 閲覧履歴 | 入力した語に合うページを候補に出す |
| ブックマーク | 入力した語やフォルダ名に合うブックマークを候補に出す。今のページをブックマークに加える |
| リーディングリスト | 候補に出し、ページを加えたり既読にしたりする |
| 最近閉じたタブ | 閉じたタブを開き直す |

## 保存するデータ

設定画面で入力した内容（タブを閉じるまでの時間、サイト内検索の登録など）は `chrome.storage.sync` に保存します。Chrome の同期をオンにしている場合は、Google アカウントを通じてお使いの他の端末にも同期されます。開発者がこのデータを見ることはありません。

タブを最後に見た時刻は `chrome.storage.session` に保存し、Chrome を終了すると消えます。

## Web 検索

パレットで Web 検索を実行すると、入力した語を Chrome で設定している既定の検索エンジンへ渡します。これはアドレスバーから検索するのと同じ動作です。

## お問い合わせ

<https://github.com/takasa5/chrome-command-palette/issues> へお寄せください。

## 変更

このポリシーを変えるときは、このページを更新します。

---

# Privacy Policy

Command Palette ("the extension") does not send any data to the developer or to third parties. It does not collect, sell, or use data for advertising. Everything it reads stays in your browser.

- **Tabs, history, bookmarks, reading list, recently closed tabs**: read to show search results in the palette and to run the command you choose.
- **Settings** you enter are stored in `chrome.storage.sync` and may be synced to your other devices through your Google account if Chrome sync is on. The developer cannot see them.
- **Web search** sends your query to the default search engine you set in Chrome, the same as searching from the address bar.

Questions: <https://github.com/takasa5/chrome-command-palette/issues>
