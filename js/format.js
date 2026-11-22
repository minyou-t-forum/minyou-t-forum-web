// 顯示用的格式：時間、檔案大小、字數、作者的名字、把內文裡的網址變成連結。

import { el } from "./ui.js";

// 時間一律顯示台灣時間，不管使用者的裝置設在哪個時區。
const timeFormat = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** backend 給的時間（UTC，例如 2026-11-18T06:30:00Z）→ 2026/11/18 14:30 */
export function formatTime(iso) {
  return timeFormat.format(new Date(iso));
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const STAFF_ROLE_LABELS = { moderator: "版主", admin: "管理員" };

/**
 * 作者的名字。版主與管理員的名字後面多一個角色的標籤。
 * 標籤是另外畫出來的元素，不是名字的一部分：住戶把名字取成「某某（管理員）」也做不出這個標籤。
 */
export function authorName(name, role) {
  const label = STAFF_ROLE_LABELS[role];
  return el("span", { class: "author" }, name, label && el("span", { class: "role-badge", text: label }));
}

/**
 * 字數。一個中文字、一個表情符號都算 1，跟 backend 的算法一樣。
 * 不能用 text.length：它把一個表情符號算成 2，會跟 backend 對不起來。
 */
export function countChars(text) {
  return [...text].length;
}

// 網址只認英數字與網址會用到的符號，所以後面直接接中文（沒有空白）時，網址會在中文前面結束。
const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;

/** 句尾的標點通常不是網址的一部分，例如「請看 https://example.com/a。」 */
function trimUrl(url) {
  for (;;) {
    const trimmed = url.replace(/[.,;:!?'"]+$/, "");
    const next = trimmed.endsWith(")") && !trimmed.includes("(") ? trimmed.slice(0, -1) : trimmed;
    if (next === url) return url;
    url = next;
  }
}

/**
 * 把純文字的內文變成可以放進畫面的內容：網址變成連結，其他都是文字。
 * 內文不會被當成 HTML，所以使用者打的 <script> 之類只會原樣顯示。
 */
export function textToNodes(text) {
  const fragment = document.createDocumentFragment();
  let position = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0]);
    if (!/^https?:\/\/[^/]/.test(url)) continue; // 只剩下 "http://" 就不算網址
    fragment.append(text.slice(position, match.index));
    const link = document.createElement("a");
    link.href = url;
    link.textContent = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    fragment.append(link);
    position = match.index + url.length;
  }
  fragment.append(text.slice(position));
  return fragment;
}
