// コマンドパレットの画面の状態遷移。
// build.js がここから操作列を作り、graph.e2e.js が実物のパレットで再生して、画面がこの状態と一致するかを確かめる。
// 状態や操作を変えたら npm run model で palette.md と paths.json を作り直す。
module palette {
  // closed: 閉じている / newTab: 新しいタブで開いている / overlay: ページに重ねて開いている
  var mode: str
  // 入っているブックマークのフォルダ。外側から順に並ぶ
  var folders: List[str]
  // Tab で入った絞り込み。none: なし / commands: コマンド / gh: サイト内検索
  var scope: str
  // 入力欄の文字
  var query: str

  // 入れるフォルダの順。テストでは Work / Docs / Specs の階層を用意する。
  // フォルダの名前を打つと直下のフォルダが出るので、最初は work と打って Docs に入り、Docs の中では specs と打って Specs に入る
  pure val FOLDERS = ["Docs", "Specs"]
  pure val FOLDER_QUERIES = ["work", "specs"]
  // テストで登録するサイト内検索のキーワード
  pure val SITE_KEYWORD = "gh"

  val isOpen = mode != "closed"
  val atTop = isOpen and folders == [] and scope == "none"

  // 開いた直後の状態にする。m が closed なら閉じた状態
  action start(m) = all { mode' = m, folders' = [], scope' = "none", query' = "" }
  action reset = start("closed")

  action init = reset

  // ---- 開く ----

  // Cmd+T で新しいタブを開く
  action openNewTab = all { mode == "closed", start("newTab") }
  // Cmd+Shift+S で見ているページに重ねる
  action openOverlay = all { mode == "closed", start("overlay") }

  // ---- 画面の中の操作 ----

  // 入力欄を空にする
  action clearQuery = all { isOpen, query != "", query' = "", mode' = mode, folders' = folders, scope' = scope }

  // FOLDER_QUERIES の文字を打ち、Enter で次のフォルダに入る
  action enterFolder = all {
    isOpen, scope == "none", folders.length() < FOLDERS.length(),
    folders' = folders.append(FOLDERS[folders.length()]),
    query' = "", mode' = mode, scope' = scope,
  }

  // 入力が空のとき Backspace で一つ外のフォルダへ戻る。入る前に打っていた文字が戻る
  action exitFolder = all {
    isOpen, scope == "none", folders.length() > 0, query == "",
    folders' = folders.slice(0, folders.length() - 1),
    query' = FOLDER_QUERIES[folders.length() - 1], mode' = mode, scope' = scope,
  }

  // 入力が空のとき Tab でコマンドに絞り込む
  action enterCommandScope = all { atTop, query == "", scope' = "commands", query' = "", mode' = mode, folders' = folders }

  // キーワードを打ち、Tab でサイト内検索に入る
  action enterSiteScope = all { atTop, scope' = SITE_KEYWORD, query' = "", mode' = mode, folders' = folders }

  // 入力が空のとき Backspace で絞り込みから出る。キーワードが入力欄に戻る
  action exitScope = all {
    isOpen, scope != "none", query == "",
    scope' = "none", query' = if (scope == SITE_KEYWORD) SITE_KEYWORD else "", mode' = mode, folders' = folders,
  }

  // ---- 閉じる ----

  // Esc で閉じる
  action escape = all { isOpen, reset }
  // 開いているタブを検索して Enter で移る
  action switchTab = all { atTop, reset }
  // 履歴を検索して Enter でページを開く
  action openHistory = all { atTop, reset }
  // いちばん奥のフォルダでブックマークを選んで開く
  action openBookmark = all { isOpen, scope == "none", folders.length() == FOLDERS.length(), reset }
  // サイト内検索で検索語を打ち、Enter で検索結果を開く
  action runSiteSearch = all { isOpen, scope == SITE_KEYWORD, reset }

  action step = any {
    openNewTab, openOverlay,
    clearQuery, enterFolder, exitFolder, enterCommandScope, enterSiteScope, exitScope,
    escape, switchTab, openHistory, openBookmark, runSiteSearch,
  }

  // ---- 不変条件 ----

  // 閉じたら、フォルダも絞り込みも入力も残らない
  val closedIsClean = mode == "closed" implies (folders == [] and scope == "none" and query == "")
  // フォルダの中と絞り込みには同時に入らない
  val folderOrScope = not(folders.length() > 0 and scope != "none")
}
