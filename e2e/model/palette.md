# パレットの状態遷移

このファイルは `npm run model` が [palette.qnt](palette.qnt) から作る。手で書き換えない。

新しいタブで開いたときと、ページに重ねたときの遷移は同じ形なので、開き方を除いてまとめている。
片方にしかない遷移は、表の「開き方」の列に書く。

```mermaid
stateDiagram-v2
  closed : 閉じている
  [*] --> closed
  state 開いている {
    s0 : 入力なし
    s1 : 入力「gh」
    s2 : 入力「work」
    s3 : コマンドに絞り込み・入力なし
    s4 : サイト内検索 gh・入力なし
    s5 : フォルダ Docs・入力なし
    s6 : フォルダ Docs・入力「specs」
    s7 : フォルダ Docs / Specs・入力なし
    s0 --> s5 : フォルダ名 + Enter
    s0 --> s3 : Tab
    s0 --> s4 : gh + Tab
    s4 --> closed : 検索語 + Enter
    s3 --> s0 : Backspace
    s5 --> s7 : フォルダ名 + Enter
    s7 --> s6 : Backspace
    s0 --> closed : 履歴を選んで Enter
    s5 --> s2 : Backspace
    s2 --> closed : 履歴を選んで Enter
    s0 --> closed : タブを選んで Enter
    s2 --> s0 : 入力を消す
    s7 --> closed : ブックマークを選んで Enter
    s4 --> s1 : Backspace
    s1 --> s4 : gh + Tab
    s6 --> s5 : 入力を消す
    s2 --> s5 : フォルダ名 + Enter
    s1 --> closed : タブを選んで Enter
    s1 --> closed : 履歴を選んで Enter
    s1 --> s5 : フォルダ名 + Enter
    s6 --> s7 : フォルダ名 + Enter
    s1 --> s0 : 入力を消す
    s2 --> closed : タブを選んで Enter
    s2 --> s4 : gh + Tab
  }
  closed --> s0 : Cmd+Shift+S / Cmd+T
  開いている --> closed : Esc
```

| 状態 | 操作 | 次の状態 | 開き方 |
| --- | --- | --- | --- |
| 閉じている | Cmd+T | 入力なし |  |
| 閉じている | Cmd+Shift+S | 入力なし |  |
| 入力なし | フォルダ名 + Enter | フォルダ Docs・入力なし |  |
| 入力なし | Tab | コマンドに絞り込み・入力なし |  |
| 入力なし | gh + Tab | サイト内検索 gh・入力なし |  |
| 入力なし | Esc | 閉じている |  |
| 入力なし | タブを選んで Enter | 閉じている |  |
| 入力なし | 履歴を選んで Enter | 閉じている |  |
| 入力「gh」 | 入力を消す | 入力なし |  |
| 入力「gh」 | フォルダ名 + Enter | フォルダ Docs・入力なし |  |
| 入力「gh」 | gh + Tab | サイト内検索 gh・入力なし |  |
| 入力「gh」 | Esc | 閉じている |  |
| 入力「gh」 | タブを選んで Enter | 閉じている |  |
| 入力「gh」 | 履歴を選んで Enter | 閉じている |  |
| 入力「work」 | 入力を消す | 入力なし |  |
| 入力「work」 | フォルダ名 + Enter | フォルダ Docs・入力なし |  |
| 入力「work」 | gh + Tab | サイト内検索 gh・入力なし |  |
| 入力「work」 | Esc | 閉じている |  |
| 入力「work」 | タブを選んで Enter | 閉じている |  |
| 入力「work」 | 履歴を選んで Enter | 閉じている |  |
| コマンドに絞り込み・入力なし | Backspace | 入力なし |  |
| コマンドに絞り込み・入力なし | Esc | 閉じている |  |
| サイト内検索 gh・入力なし | Backspace | 入力「gh」 |  |
| サイト内検索 gh・入力なし | Esc | 閉じている |  |
| サイト内検索 gh・入力なし | 検索語 + Enter | 閉じている |  |
| フォルダ Docs・入力なし | フォルダ名 + Enter | フォルダ Docs / Specs・入力なし |  |
| フォルダ Docs・入力なし | Backspace | 入力「work」 |  |
| フォルダ Docs・入力なし | Esc | 閉じている |  |
| フォルダ Docs・入力「specs」 | 入力を消す | フォルダ Docs・入力なし |  |
| フォルダ Docs・入力「specs」 | フォルダ名 + Enter | フォルダ Docs / Specs・入力なし |  |
| フォルダ Docs・入力「specs」 | Esc | 閉じている |  |
| フォルダ Docs / Specs・入力なし | Backspace | フォルダ Docs・入力「specs」 |  |
| フォルダ Docs / Specs・入力なし | Esc | 閉じている |  |
| フォルダ Docs / Specs・入力なし | ブックマークを選んで Enter | 閉じている |  |

E2E では、上の遷移を開き方ごとにすべて通す 7 本の操作列（[paths.json](paths.json)、計 157 操作）を実物で再生する。
