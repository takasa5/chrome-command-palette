// パレットから実行できるブラウザ操作。
// needsTarget のコマンドは、パレットを開く直前に見ていたタブ（ctx.target）を操作する。

import { addToReadingList, markAsRead, readingListScope } from "./reading-list.js";
import { findStaleTabs, getStaleHours } from "./stale-tabs.js";
import { restoreTab, translateTab } from "./translate.js";

const chromePage = (id, title, ja, keywords, url, featured = false) => ({
  id,
  title,
  ja,
  keywords,
  featured,
  run: (ctx) => ctx.navigate(url),
});

export async function getNewWindowPins() {
  const { newWindowPins = true } = await chrome.storage.sync.get("newWindowPins");
  return newWindowPins;
}

async function zoomBy(ctx, factor) {
  const zoom = await chrome.tabs.getZoom(ctx.target.id);
  await chrome.tabs.setZoom(ctx.target.id, zoom * factor);
  await ctx.leave();
}

export const COMMANDS = [
  {
    id: "new-window",
    title: "New Window",
    ja: "新しいウィンドウ",
    keywords: ["window", "新規ウィンドウ"],
    featured: true,
    run: async (ctx) => {
      const pins = (await getNewWindowPins()) ? ctx.windowTabs.filter((t) => t.pinned) : [];
      const { id: windowId } = await chrome.windows.create();
      // 並び順を保つため、1 つずつ開く。file: などオリジンを持たないページはそのまま開く。
      for (const pin of pins) {
        const { origin } = new URL(pin.url);
        await chrome.tabs.create({ windowId, url: origin === "null" ? pin.url : origin, pinned: true, active: false });
      }
      await ctx.leave();
    },
  },
  {
    id: "incognito",
    title: "New Incognito Window",
    ja: "シークレットウィンドウ",
    keywords: ["incognito", "private", "secret", "シークレット"],
    featured: true,
    run: async (ctx) => {
      await chrome.windows.create({ incognito: true });
      await ctx.leave();
    },
  },
  {
    id: "new-tab",
    title: "New Tab",
    ja: "標準の新しいタブページ",
    keywords: ["blank", "新規タブ"],
    run: (ctx) => ctx.navigate("chrome://new-tab-page"),
  },
  {
    id: "reopen-tab",
    title: "Reopen Closed Tab",
    ja: "閉じたタブを開き直す",
    keywords: ["restore", "undo", "復元", "元に戻す"],
    featured: true,
    run: async (ctx) => {
      // パレット自身も「閉じたタブ」に記録されるので読み飛ばす。
      const closed = await chrome.sessions.getRecentlyClosed();
      const entry = closed.find((c) => !c.tab || !ctx.isPalette(c.tab));
      if (!entry) throw new Error("閉じたタブはありません");
      await chrome.sessions.restore((entry.tab ?? entry.window).sessionId);
      await ctx.leave(null);
    },
  },
  {
    id: "close-tab",
    title: "Close Tab",
    ja: "タブを閉じる",
    keywords: ["閉じる"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.remove(ctx.target.id);
      await ctx.leave(ctx.nextTarget?.id);
    },
  },
  {
    id: "close-other-tabs",
    title: "Close Other Tabs",
    ja: "他のタブを閉じる",
    keywords: ["others"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.remove(ctx.windowTabs.filter((t) => t.id !== ctx.target.id && !t.pinned).map((t) => t.id));
      await ctx.leave();
    },
  },
  {
    id: "close-right-tabs",
    title: "Close Tabs to the Right",
    ja: "右側のタブを閉じる",
    keywords: ["right"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.remove(ctx.windowTabs.filter((t) => t.index > ctx.target.index && !t.pinned).map((t) => t.id));
      await ctx.leave();
    },
  },
  {
    id: "archive-stale-tabs",
    title: "Archive Stale Tabs",
    ja: "しばらく見ていないタブを閉じる",
    keywords: ["cleanup", "close", "old", "アーカイブ", "掃除", "整理", "古いタブ", "放置"],
    run: async (ctx) => {
      const [tabs, hours, leftAt] = await Promise.all([chrome.tabs.query({}), getStaleHours(), chrome.storage.session.get(null)]);
      const stale = findStaleTabs(tabs, { now: Date.now(), hours, leftAt, keepTabId: ctx.target?.id });
      if (stale.length === 0) throw new Error(`${hours} 時間以上見ていないタブはありません`);
      await chrome.tabs.remove(stale.map((tab) => tab.id));
      await ctx.leave();
    },
  },
  {
    id: "palette-settings",
    title: "Command Palette Settings",
    ja: "コマンドパレットの設定",
    keywords: ["options", "preferences", "stale", "cleanup", "account", "掃除", "アカウント", "オプション"],
    run: (ctx) => ctx.navigate(chrome.runtime.getURL("options.html")),
  },
  {
    id: "close-window",
    title: "Close Window",
    ja: "ウィンドウを閉じる",
    keywords: ["quit"],
    run: (ctx) => chrome.windows.remove(ctx.self.windowId),
  },
  {
    id: "reload",
    title: "Reload",
    ja: "再読み込み",
    keywords: ["refresh", "更新", "リロード"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.reload(ctx.target.id);
      await ctx.leave();
    },
  },
  {
    id: "hard-reload",
    title: "Hard Reload",
    ja: "キャッシュを無視して再読み込み",
    keywords: ["refresh", "cache", "スーパーリロード"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.reload(ctx.target.id, { bypassCache: true });
      await ctx.leave();
    },
  },
  {
    id: "back",
    title: "Go Back",
    ja: "前のページへ戻る",
    keywords: ["戻る"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.goBack(ctx.target.id);
      await ctx.leave();
    },
  },
  {
    id: "forward",
    title: "Go Forward",
    ja: "次のページへ進む",
    keywords: ["進む"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.goForward(ctx.target.id);
      await ctx.leave();
    },
  },
  {
    id: "duplicate",
    title: "Duplicate Tab",
    ja: "タブを複製",
    keywords: ["copy tab", "複製"],
    needsTarget: true,
    run: async (ctx) => {
      const tab = await chrome.tabs.duplicate(ctx.target.id);
      await ctx.leave(tab.id);
    },
  },
  {
    id: "pin",
    title: "Pin / Unpin Tab",
    ja: "タブの固定を切り替え",
    keywords: ["固定", "ピン留め"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.update(ctx.target.id, { pinned: !ctx.target.pinned });
      await ctx.leave();
    },
  },
  {
    id: "mute",
    title: "Mute / Unmute Tab",
    ja: "タブのミュートを切り替え",
    keywords: ["sound", "音", "消音"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.update(ctx.target.id, { muted: !ctx.target.mutedInfo?.muted });
      await ctx.leave();
    },
  },
  {
    id: "move-to-window",
    title: "Move Tab to New Window",
    ja: "タブを新しいウィンドウへ移動",
    keywords: ["detach", "移動"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.windows.create({ tabId: ctx.target.id });
      await ctx.leave(ctx.nextTarget?.id);
    },
  },
  {
    id: "copy-url",
    title: "Copy URL",
    ja: "URL をコピー",
    keywords: ["link", "コピー"],
    needsTarget: true,
    run: async (ctx) => {
      await navigator.clipboard.writeText(ctx.target.url);
      await ctx.leave();
    },
  },
  {
    id: "bookmark",
    title: "Bookmark This Page",
    ja: "このページをブックマーク",
    keywords: ["add bookmark", "保存", "追加"],
    needsTarget: true,
    run: async (ctx) => {
      const existing = await chrome.bookmarks.search({ url: ctx.target.url });
      if (existing.length === 0) {
        await chrome.bookmarks.create({ title: ctx.target.title, url: ctx.target.url });
      }
      await ctx.leave();
    },
  },
  {
    id: "add-to-reading-list",
    title: "Add to Reading List",
    ja: "リーディングリストに追加",
    keywords: ["read later", "あとで読む", "保存", "追加"],
    needsTarget: true,
    run: async (ctx) => {
      await addToReadingList(ctx.target);
      await ctx.leave();
    },
  },
  {
    id: "mark-as-read",
    title: "Mark as Read",
    ja: "リーディングリストで既読にする",
    keywords: ["reading list", "read later", "あとで読む"],
    needsTarget: true,
    run: async (ctx) => {
      await markAsRead(ctx.target);
      await ctx.leave();
    },
  },
  {
    id: "reading-list",
    title: "Reading List",
    ja: "リーディングリスト",
    keywords: ["read later", "あとで読む"],
    run: (ctx) => ctx.enterScope(readingListScope),
  },
  {
    id: "translate",
    title: "Translate Page",
    ja: "ページを翻訳",
    keywords: ["translate", "翻訳", "ほんやく"],
    needsTarget: true,
    run: translateTab,
  },
  {
    id: "show-original",
    title: "Show Original",
    ja: "翻訳を元に戻す",
    keywords: ["translate", "原文", "翻訳"],
    needsTarget: true,
    run: restoreTab,
  },
  {
    id: "zoom-in",
    title: "Zoom In",
    ja: "拡大",
    keywords: ["ズーム"],
    needsTarget: true,
    run: (ctx) => zoomBy(ctx, 1.1),
  },
  {
    id: "zoom-out",
    title: "Zoom Out",
    ja: "縮小",
    keywords: ["ズーム"],
    needsTarget: true,
    run: (ctx) => zoomBy(ctx, 1 / 1.1),
  },
  {
    id: "zoom-reset",
    title: "Reset Zoom",
    ja: "ズームをリセット",
    keywords: ["100%"],
    needsTarget: true,
    run: async (ctx) => {
      await chrome.tabs.setZoom(ctx.target.id, 0);
      await ctx.leave();
    },
  },
  {
    id: "fullscreen",
    title: "Toggle Fullscreen",
    ja: "フルスクリーンを切り替え",
    keywords: ["全画面"],
    needsTarget: true,
    run: async (ctx) => {
      const win = await chrome.windows.get(ctx.self.windowId);
      await chrome.windows.update(win.id, { state: win.state === "fullscreen" ? "normal" : "fullscreen" });
      await ctx.leave();
    },
  },
  {
    id: "maximize",
    title: "Toggle Maximize Window",
    ja: "ウィンドウの最大化を切り替え",
    keywords: ["最大化", "zoom"],
    needsTarget: true,
    run: async (ctx) => {
      const win = await chrome.windows.get(ctx.self.windowId);
      await chrome.windows.update(win.id, { state: win.state === "maximized" ? "normal" : "maximized" });
      await ctx.leave();
    },
  },
  {
    id: "minimize",
    title: "Minimize Window",
    ja: "ウィンドウを最小化",
    keywords: ["最小化", "hide"],
    needsTarget: true,
    // パレットのタブを閉じるとこのスクリプトも止まるので、先に最小化する。
    run: async (ctx) => {
      await chrome.windows.update(ctx.self.windowId, { state: "minimized" });
      await ctx.leave();
    },
  },
  chromePage("history", "History", "履歴", ["りれき"], "chrome://history", true),
  chromePage("bookmarks", "Bookmarks", "ブックマークマネージャ", ["favorites", "お気に入り"], "chrome://bookmarks", true),
  chromePage("downloads", "Downloads", "ダウンロード", ["dl"], "chrome://downloads", true),
  chromePage("settings", "Settings", "設定", ["preferences", "options"], "chrome://settings", true),
  chromePage("extensions", "Extensions", "拡張機能", ["addons"], "chrome://extensions"),
  chromePage("shortcuts", "Extension Shortcuts", "拡張機能のショートカット", ["keyboard", "keybinding"], "chrome://extensions/shortcuts"),
  chromePage("clear-data", "Clear Browsing Data", "閲覧履歴データの削除", ["cache", "cookie", "delete history"], "chrome://settings/clearBrowserData"),
  chromePage("passwords", "Passwords", "パスワードマネージャ", ["password"], "chrome://password-manager"),
  chromePage("flags", "Chrome Flags", "試験運用機能", ["experiments"], "chrome://flags"),
];
