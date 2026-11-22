// 「社區公告」與「社區論壇」用同一套列表、內容頁、編輯頁（entries.js），兩者的差別都寫在這裡。
//
// canCreate、canModify 只決定畫面上要不要顯示按鈕。真正的把關在 backend：
// 就算有人把按鈕弄出來按下去，backend 一樣會拒絕。

import { authorName, formatTime } from "./format.js";
import { getUser, isStaff } from "./session.js";

export const announcements = {
  key: "announcements", // 對應 index.html 裡頁籤的 data-tab
  route: "#/announcements", // 這個頁籤的網址
  api: "/announcements", // backend 的路徑
  title: "社區公告",
  noun: "公告",
  hasReplies: false,
  deleteConfirm: "確定要刪除這則公告嗎？附圖會一起刪除，刪除後無法復原。",
  listMeta: (item) => [formatTime(item.created_at)],
  // 公告只有版主與管理員能發、改、刪。
  canCreate: () => isStaff(),
  canModify: () => isStaff(),
  // 「新增公告」的入口在後台，列表上不放按鈕；在新增的畫面按取消也是回後台。
  createOnList: false,
  createCancelRoute: "#/admin",
};

export const forum = {
  key: "forum",
  route: "#/forum",
  api: "/posts",
  title: "社區論壇",
  noun: "文章",
  hasReplies: true,
  deleteConfirm: "確定要刪除這篇文章嗎？底下的回覆與附圖會一起刪除，刪除後無法復原。",
  listMeta: (item) => [
    authorName(item.author_name, item.author_role),
    `・${formatTime(item.created_at)}・${item.reply_count} 則回覆`,
  ],
  // 文章每位成員都能發；改與刪要是作者本人、版主或管理員。
  canCreate: () => true,
  canModify: (entry) => isStaff() || entry.author_id === getUser().id,
  createOnList: true,
  createCancelRoute: "#/forum",
};
