// 設定画面で保存できたことを知らせる「保存しました」の出し入れ。Chrome API と DOM に依存しない。

// 「保存しました」を出しておく時間（ミリ秒）。
export const SAVED_NOTICE_MS = 2500;

// 保存のたびに notify() を呼ぶと、show() で出し、最後の保存から duration たったら hide() で消す。
// 出ている間に続けて保存したら、出し直さずに消すまでの時間だけ延ばす。
// テキストエリアは入力のたびに保存するので、打っている間に表示がちらついたり、
// スクリーンリーダーが何度も読み上げたりしないようにするため。
export function createSavedNotice({ show, hide, duration = SAVED_NOTICE_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  return {
    notify() {
      if (timer === null) show();
      else clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        hide();
      }, duration);
    },
    get shown() {
      return timer !== null;
    },
  };
}
