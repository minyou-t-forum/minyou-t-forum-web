// 進入點。做兩件事：
//
// 一、確認登入狀態，決定現在該看到什麼：
//
//     沒登入            登入頁
//     登入了、還沒註冊  註冊表單
//     審核中            等待審核
//     已停用            帳號無法使用
//     已審核            論壇本身（下面的第二件事）
//
// 二、已審核的成員，看網址 # 後面的部分決定顯示哪一個畫面：
//
//     #/announcements          社區公告的列表
//     #/announcements/new      新增公告
//     #/announcements/12       第 12 則公告
//     #/announcements/12/edit  編輯第 12 則公告
//     #/forum …                社區論壇，同樣四種
//     #/documents              社區文檔
//     #/reserved               預留的頁籤
//     #/admin                  後台（版主與管理員）
//
// 每個畫面都有自己的網址，所以重新整理會停在原本的畫面。

import { adminView, roleLabel } from "./admin.js";
import { api, setAuthHandlers } from "./api.js";
import { announcements, forum } from "./boards.js";
import { API_BASE_URL } from "./config.js";
import { documentsView } from "./documents.js";
import { detailView, editorView, listView } from "./entries.js";
import { forgetGoogleAccount, showGoogleButton } from "./google.js";
import {
  disabledScreen,
  loginScreen,
  pendingScreen,
  registerScreen,
  unreachableScreen,
} from "./screens.js";
import { clearSession, getAccount, getToken, isStaff, setAccount } from "./session.js";
import { el, fill, showLoading } from "./ui.js";

// 還不能使用論壇的人，頁首在名字旁邊標出他現在的狀態。
const STATE_LABELS = { unregistered: "未註冊", pending: "審核中", disabled: "已停用" };

const view = document.getElementById("view");
const tabs = document.getElementById("tabs");
const accountBox = document.getElementById("account");

/**
 * 每次換畫面都給一個新的容器。上一個畫面還沒回來的請求之後才回來時，
 * 只會寫進已經被換掉的舊容器，不會蓋掉現在的畫面。
 */
function freshBox() {
  const box = el("div");
  view.replaceChildren(box);
  return box;
}

// ── 一、登入狀態 ─────────────────────────────────────────

/**
 * 確認登入狀態。瀏覽器裡有存登入憑證就直接拿去問 backend，不經過 Google：
 * 這就是重新整理、關掉再打開都不用重新登入的原因。
 */
async function start() {
  if (!getToken()) {
    showLogin();
    return;
  }
  tabs.hidden = true;
  showLoading(freshBox());
  let account;
  try {
    account = await api.get("/auth/status", { reauth: false });
  } catch (error) {
    if (error.status === 401) {
      clearSession();
      showLogin("登入已經過期，請重新登入。");
    } else {
      // 連不上不代表登入失效：不登出，讓使用者再試一次。
      unreachableScreen(freshBox(), error, start);
    }
    return;
  }
  applyAccount(account);
}

/**
 * 把網址 # 後面的部分清掉。
 *
 * # 後面記的是「正在看論壇的哪個畫面」（例如 #/admin 是後台）。還不能使用論壇的人、
 * 剛登出的人都不在任何一個畫面上，網址卻還留著上一位使用者停的位置就不對了。
 * 用 replaceState，不會多一筆上一頁的紀錄，也不會觸發換畫面。
 */
function clearRoute() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

/** 拿到帳號狀態之後，顯示對應的畫面。 */
function applyAccount(account) {
  setAccount(account);
  renderAccountBox();
  tabs.hidden = account.state !== "approved";
  if (account.state === "approved") {
    render();
    return;
  }
  clearRoute();
  if (account.state === "unregistered") registerScreen(freshBox(), account, applyAccount);
  else if (account.state === "pending") pendingScreen(freshBox(), start);
  else disabledScreen(freshBox());
}

function showLogin(notice) {
  setAccount(null);
  renderAccountBox();
  tabs.hidden = true;
  loginScreen(freshBox(), applyAccount, notice);
}

function signOut() {
  // 請 backend 把這張憑證作廢。不等它回來：就算這一步失敗，也不該擋住使用者登出。
  api.post("/auth/logout", undefined, { reauth: false }).catch(() => {});
  forgetGoogleAccount();
  clearSession();
  // 下一位在這台裝置登入的人從頭開始，不接續這一位停的畫面。
  clearRoute();
  showLogin();
}

/** 頁首右邊：名稱與角色、後台入口、登出。 */
function renderAccountBox() {
  const account = getAccount();
  if (!account) {
    accountBox.hidden = true;
    accountBox.replaceChildren();
    return;
  }
  const approved = account.state === "approved";
  const name = approved
    ? `${account.user.display_name}（${roleLabel(account.user.role)}）`
    : account.email;
  accountBox.hidden = false;
  fill(
    accountBox,
    el("span", { class: "account-name", text: name }),
    !approved && el("span", { class: "account-state", text: STATE_LABELS[account.state] }),
    approved && isStaff() && el("a", { class: "account-link", href: "#/admin", text: "後台" }),
    el("button", { class: "account-link", type: "button", text: "登出", onClick: signOut }),
  );
}

// 用到一半登入憑證失效（太久沒用、或被登出）時，api.js 會呼叫這裡。
// 同時有好幾個請求撞到時只跳一次視窗，大家等同一個結果。
let reauthInFlight = null;

function reauthenticate() {
  if (!reauthInFlight) {
    reauthInFlight = askToSignInAgain().finally(() => {
      reauthInFlight = null;
    });
  }
  return reauthInFlight;
}

/**
 * 蓋一層重新登入的視窗在目前的畫面上。
 *
 * 用同一個帳號登入回來，回傳 true：剛才沒送成功的請求會用新的憑證再送一次。
 * 選擇登出，或登入的是另一個人，回傳 false：剛才的請求不再送出。
 * 換了一個人時，剛才畫面上的內容（例如還沒送出的回覆）是前一個人的，不能用新的身分送出去，
 * 所以把整個畫面照新的帳號重畫一次。
 */
function askToSignInAgain() {
  const previousEmail = getAccount()?.email;
  return new Promise((resolve) => {
    const buttonBox = el("div", { class: "google-button" });
    const error = el("p", { class: "form-error", role: "alert" });
    let newAccount = null;
    const dialog = el(
      "dialog",
      { class: "dialog" },
      el("p", { class: "dialog-message", text: "登入已經過期，請重新登入。畫面上還沒送出的內容不會不見。" }),
      buttonBox,
      error,
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "button", type: "button", text: "登出", onClick: () => dialog.close() }),
      ),
    );
    dialog.addEventListener("close", () => {
      dialog.remove();
      if (!newAccount) {
        signOut();
        resolve(false);
      } else if (newAccount.email !== previousEmail) {
        applyAccount(newAccount);
        // 說清楚發生了什麼：可能只是在 Google 的選單上點錯帳號，剛才打的字才不會不明不白地消失。
        view.prepend(
          el("p", {
            class: "save-message save-message-error",
            role: "alert",
            text: `你登入的是另一個帳號（${newAccount.email}）。前一個帳號還沒送出的內容沒有送出，畫面已經換成這個帳號。`,
          }),
        );
        resolve(false);
      } else {
        setAccount(newAccount);
        renderAccountBox();
        resolve(true);
      }
    });
    document.body.append(dialog);
    dialog.showModal();
    showGoogleButton(buttonBox, {
      onSuccess: (account) => {
        newAccount = account;
        dialog.close();
      },
      onError: (message) => {
        error.textContent = message;
      },
    });
  });
}

// 用到一半帳號狀態變了（例如被停用）時，api.js 會呼叫這裡：重新確認一次，換到對的畫面。
let rechecking = false;

function recheck() {
  if (rechecking) return;
  rechecking = true;
  start().finally(() => {
    rechecking = false;
  });
}

// ── 二、論壇的畫面 ───────────────────────────────────────

const DEFAULT_ROUTE = "#/announcements";
const ID = "([1-9][0-9]{0,18})"; // 資料編號的格式，跟 backend 一樣

const routes = [];
for (const board of [announcements, forum]) {
  const base = board.route.slice(1); // "#/forum" → "/forum"
  routes.push(
    { pattern: new RegExp(`^${base}$`), tab: board.key, show: (box) => listView(board, box) },
    { pattern: new RegExp(`^${base}/new$`), tab: board.key, show: (box) => editorView(board, box) },
    { pattern: new RegExp(`^${base}/${ID}$`), tab: board.key, show: (box, id) => detailView(board, box, id) },
    { pattern: new RegExp(`^${base}/${ID}/edit$`), tab: board.key, show: (box, id) => editorView(board, box, id) },
  );
}
routes.push(
  { pattern: /^\/documents$/, tab: "documents", show: documentsView },
  { pattern: /^\/reserved$/, tab: "reserved", show: reservedView },
  { pattern: /^\/admin$/, tab: "admin", show: adminView, staffOnly: true },
);

function reservedView(box) {
  box.replaceChildren(el("p", { class: "placeholder", text: "這個功能尚未開放" }));
}

function render() {
  // 還不能使用論壇的人（沒登入、審核中…）不管網址是什麼，都停在原本的畫面。
  const account = getAccount();
  if (!account || account.state !== "approved") return;

  const path = location.hash.slice(1);
  for (const route of routes) {
    const match = path.match(route.pattern);
    if (!match || (route.staffOnly && !isStaff())) continue;

    for (const tab of document.querySelectorAll(".tab")) {
      if (tab.dataset.tab === route.tab) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    }
    route.show(freshBox(), ...match.slice(1));
    window.scrollTo(0, 0);
    return;
  }
  // 不認得的網址（包含沒有 # 的首頁、沒有權限進的後台）一律回到社區公告。
  location.replace(DEFAULT_ROUTE);
}

setAuthHandlers({ reauthenticate, blocked: recheck });
window.addEventListener("hashchange", render);
start();

// ── 讓伺服器在有人使用的期間保持醒著 ─────────────────────
//
// 伺服器一陣子沒有請求就會休息，下一個請求要等它醒來（可能要一分鐘）。只要有人開著
// 這個頁面，就每 10 分鐘碰它一下。/health 不碰資料庫，失敗了也不用管。
// 這救不了「很久沒人來之後的第一位訪客」：那要靠伺服器那一邊的定時排程。
const KEEP_AWAKE_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  fetch(`${API_BASE_URL}/health`).catch(() => {});
}, KEEP_AWAKE_INTERVAL_MS);
