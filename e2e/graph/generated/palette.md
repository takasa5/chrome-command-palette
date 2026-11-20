# パレットの状態遷移

このファイルは `npm run model` が [palette.qnt](../palette.qnt) から作る。手で書き換えない。

新しいタブで開いたときと、ページに重ねたときの遷移は同じ形なので、開き方を除いてまとめている。
片方にしかない遷移は、表の「開き方」の列に書く。
状態の中の「操作 / 何もしない」は、押しても状態が変わらない操作（内部遷移）を表す。

```mermaid
stateDiagram-v2
  closed : 閉じている
  [*] --> closed
  state 開いている {
    s0 : 入力なし<br/>Backspace / 何もしない
    s1 : 入力「gh」
    s2 : 入力「work」<br/>Tab / 何もしない
    s3 : コマンドに絞り込み・入力なし<br/>Tab / 何もしない
    s4 : サイト内検索 gh・入力なし<br/>Tab / 何もしない
    s5 : グループ名の入力・入力なし<br/>Tab / 何もしない
    s6 : フォルダ Docs・入力なし<br/>Tab / 何もしない
    s7 : フォルダ Docs・入力「specs」<br/>Tab / 何もしない
    s8 : フォルダ Docs / Specs・入力なし<br/>Tab / 何もしない
    s0 --> s3 : Tab
    s3 --> s5 : グループに入れるコマンド + Enter
    s0 --> s6 : フォルダ名 + Enter
    s0 --> s5 : グループに入れるコマンド + Enter
    s6 --> s2 : Backspace
    s2 --> s6 : フォルダ名 + Enter
    s6 --> s8 : フォルダ名 + Enter
    s8 --> s7 : Backspace
    s7 --> s6 : 入力を消す
    s7 --> s8 : フォルダ名 + Enter
    s5 --> s0 : Backspace
    s3 --> s0 : Backspace
    s0 --> s4 : gh + Tab
    s2 --> s0 : 入力を消す
    s4 --> s1 : Backspace
    s1 --> s4 : gh + Tab
    s1 --> s0 : 入力を消す
    s1 --> s5 : グループに入れるコマンド + Enter
    s2 --> s4 : gh + Tab
    s2 --> s5 : グループに入れるコマンド + Enter
    s1 --> s6 : フォルダ名 + Enter
  }
  s5 --> closed : グループ名 + Enter
  s0 --> closed : 履歴を選んで Enter
  s0 --> closed : タブを選んで Enter
  s8 --> closed : ブックマークを選んで Enter
  s4 --> closed : 検索語 + Enter
  s1 --> closed : タブを選んで Enter
  s2 --> closed : タブを選んで Enter
  s1 --> closed : 履歴を選んで Enter
  s2 --> closed : 履歴を選んで Enter
  closed --> s0 : Cmd+T / Cmd+Shift+S
  開いている --> closed : Esc
```

| 状態 | 操作 | 次の状態 | 開き方 |
| --- | --- | --- | --- |
| 閉じている | Cmd+T | 入力なし |  |
| 閉じている | Cmd+Shift+S | 入力なし |  |
| 入力なし | フォルダ名 + Enter | フォルダ Docs・入力なし |  |
| 入力なし | Tab | コマンドに絞り込み・入力なし |  |
| 入力なし | gh + Tab | サイト内検索 gh・入力なし |  |
| 入力なし | グループに入れるコマンド + Enter | グループ名の入力・入力なし |  |
| 入力なし | Backspace | 入力なし |  |
| 入力なし | Esc | 閉じている |  |
| 入力なし | タブを選んで Enter | 閉じている |  |
| 入力なし | 履歴を選んで Enter | 閉じている |  |
| 入力「gh」 | 入力を消す | 入力なし |  |
| 入力「gh」 | フォルダ名 + Enter | フォルダ Docs・入力なし |  |
| 入力「gh」 | gh + Tab | サイト内検索 gh・入力なし |  |
| 入力「gh」 | グループに入れるコマンド + Enter | グループ名の入力・入力なし |  |
| 入力「gh」 | Esc | 閉じている |  |
| 入力「gh」 | タブを選んで Enter | 閉じている |  |
| 入力「gh」 | 履歴を選んで Enter | 閉じている |  |
| 入力「work」 | 入力を消す | 入力なし |  |
| 入力「work」 | フォルダ名 + Enter | フォルダ Docs・入力なし |  |
| 入力「work」 | gh + Tab | サイト内検索 gh・入力なし |  |
| 入力「work」 | グループに入れるコマンド + Enter | グループ名の入力・入力なし |  |
| 入力「work」 | Tab | 入力「work」 |  |
| 入力「work」 | Esc | 閉じている |  |
| 入力「work」 | タブを選んで Enter | 閉じている |  |
| 入力「work」 | 履歴を選んで Enter | 閉じている |  |
| コマンドに絞り込み・入力なし | グループに入れるコマンド + Enter | グループ名の入力・入力なし |  |
| コマンドに絞り込み・入力なし | Backspace | 入力なし |  |
| コマンドに絞り込み・入力なし | Tab | コマンドに絞り込み・入力なし |  |
| コマンドに絞り込み・入力なし | Esc | 閉じている |  |
| サイト内検索 gh・入力なし | Backspace | 入力「gh」 |  |
| サイト内検索 gh・入力なし | Tab | サイト内検索 gh・入力なし |  |
| サイト内検索 gh・入力なし | Esc | 閉じている |  |
| サイト内検索 gh・入力なし | 検索語 + Enter | 閉じている |  |
| グループ名の入力・入力なし | Backspace | 入力なし |  |
| グループ名の入力・入力なし | Tab | グループ名の入力・入力なし |  |
| グループ名の入力・入力なし | Esc | 閉じている |  |
| グループ名の入力・入力なし | グループ名 + Enter | 閉じている |  |
| フォルダ Docs・入力なし | フォルダ名 + Enter | フォルダ Docs / Specs・入力なし |  |
| フォルダ Docs・入力なし | Backspace | 入力「work」 |  |
| フォルダ Docs・入力なし | Tab | フォルダ Docs・入力なし |  |
| フォルダ Docs・入力なし | Esc | 閉じている |  |
| フォルダ Docs・入力「specs」 | 入力を消す | フォルダ Docs・入力なし |  |
| フォルダ Docs・入力「specs」 | フォルダ名 + Enter | フォルダ Docs / Specs・入力なし |  |
| フォルダ Docs・入力「specs」 | Tab | フォルダ Docs・入力「specs」 |  |
| フォルダ Docs・入力「specs」 | Esc | 閉じている |  |
| フォルダ Docs / Specs・入力なし | Backspace | フォルダ Docs・入力「specs」 |  |
| フォルダ Docs / Specs・入力なし | Tab | フォルダ Docs / Specs・入力なし |  |
| フォルダ Docs / Specs・入力なし | Esc | 閉じている |  |
| フォルダ Docs / Specs・入力なし | ブックマークを選んで Enter | 閉じている |  |

E2E では、上の遷移を開き方ごとにすべて通す 8 本の操作列（[paths.json](paths.json)、計 204 操作）を実物で再生する。
