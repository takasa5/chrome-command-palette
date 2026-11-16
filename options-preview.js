// 設定画面の各項目の右に置く、設定の効果を表す小さな図の中身。Chrome API に依存しない。
// 図には翻訳の要る文字を入れず、アイコン、数字、ユーザーが登録した名前だけで表す。

// Archive Stale Tabs の図に並べる、見本のタブの経過時間（時間）。
export const SAMPLE_TAB_AGES = [1, 9, 20, 32];
const MIN_AXIS_HOURS = 36;

// 点線を置ける右端。軸の矢印と重ならないよう、少し手前で止める。
const MAX_THRESHOLD_POSITION = 0.94;

// 見本のタブを経過時間の軸に並べ、しきい値以上のタブを閉じる対象にする。
// 軸の長さは見本のタブに合わせて固定し、しきい値が軸より大きいときは点線を右端に止める。
// 軸をしきい値に合わせてのばすと、大きな値でタブが左に重なって読めなくなるため。
// 位置は軸の左端を 0、右端を 1 とした割合で返す。
export function staleTabsPreview(staleHours, ages = SAMPLE_TAB_AGES) {
  const axis = Math.max(MIN_AXIS_HOURS, ...ages);
  const at = (hours) => Math.min(Math.max(hours / axis, 0), 1);
  return {
    threshold: Math.min(at(staleHours), MAX_THRESHOLD_POSITION),
    tabs: ages.map((age) => ({ age, position: at(age), stale: age >= staleHours })),
  };
}

// お気に入りの図に出す、最初のお気に入りと、それを引く入力。別名があれば別名、なければ名前で引く。
export function favoritePreview(favorites) {
  const [favorite] = favorites;
  if (!favorite) return null;
  return { title: favorite.title, query: favorite.keywords[0] ?? favorite.title.toLowerCase() };
}

// サイト内検索の図に出す、最初に登録したキーワードと名前。
export function siteSearchPreview(engines) {
  const [engine] = engines;
  return engine ? { keyword: engine.keyword, name: engine.name } : null;
}

// 経過時間の表示。設定では小数も入れられるので、小数第 1 位まで出す。
export function formatHours(hours) {
  return `${Math.round(hours * 10) / 10}h`;
}
