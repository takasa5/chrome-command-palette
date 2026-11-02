// 検索で優先して出す Google のサービス。
// tabPrefix は再利用できるタブの URL の先頭で、url と違うものだけ書く。
// ドキュメントなどは、個別のファイルを開いているタブをホームの代わりにしないよう、ホームの URL だけに絞る。

export const GOOGLE_SERVICES = [
  { id: "gmail", title: "Gmail", url: "https://mail.google.com/", keywords: ["Google Mail", "mail", "メール"] },
  { id: "calendar", title: "Google Calendar", url: "https://calendar.google.com/", keywords: ["calendar", "gcal", "カレンダー", "予定"] },
  { id: "maps", title: "Google Maps", url: "https://www.google.com/maps", keywords: ["map", "マップ", "地図", "ちず"] },
  { id: "drive", title: "Google Drive", url: "https://drive.google.com/", keywords: ["drive", "ドライブ"] },
  { id: "docs", title: "Google Docs", url: "https://docs.google.com/document/", tabPrefix: "https://docs.google.com/document/u/", keywords: ["docs", "ドキュメント"] },
  { id: "sheets", title: "Google Sheets", url: "https://docs.google.com/spreadsheets/", tabPrefix: "https://docs.google.com/spreadsheets/u/", keywords: ["sheets", "spreadsheet", "スプレッドシート", "表計算"] },
  { id: "slides", title: "Google Slides", url: "https://docs.google.com/presentation/", tabPrefix: "https://docs.google.com/presentation/u/", keywords: ["slides", "presentation", "スライド"] },
  { id: "meet", title: "Google Meet", url: "https://meet.google.com/", keywords: ["meet", "ミート", "会議"] },
  { id: "photos", title: "Google Photos", url: "https://photos.google.com/", keywords: ["photos", "フォト", "写真"] },
  { id: "translate", title: "Google Translate", url: "https://translate.google.com/", keywords: ["translate", "翻訳", "ほんやく"] },
];

// 今のウィンドウのタブを優先する。
export function findServiceTab(tabs, service, windowId) {
  const open = tabs.filter((tab) => tab.url?.startsWith(service.tabPrefix ?? service.url));
  return open.find((tab) => tab.windowId === windowId) ?? open[0] ?? null;
}
