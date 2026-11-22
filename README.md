# 中文

## 老爺華廈論壇 — 前端

小社區住戶論壇的前端網站：登入、註冊、四個頁籤（社區公告、社區論壇、社區文檔，以及一個預留的），加上新增公告、上傳文檔、管理成員的後台。這份文件分成兩個獨立的部分，請依需求閱讀：

- **[專案報告](#專案報告)**：這個網站是什麼、怎麼串起來的、每個決定的理由 —— 給想了解「這是什麼」的人看。
- **[架設 SOP](#架設-sop)**：一步一步的操作說明 —— 給想「動手把它跑起來」的人看。

這兩部分刻意分開，不要交叉閱讀；報告是背景知識，SOP 是操作手冊。

---

## 專案報告

### 這是什麼

一個給社區住戶用的小論壇的網頁。住戶用 Google 帳號登入，註冊後要經過審核才能使用。

這支 repo 是前端，只有 HTML、CSS、JavaScript，沒有用任何框架，也沒有 build 流程。資料全部來自後端 [`minyou-t-forum-backend`](https://github.com/beethoreven/minyou-t-forum-backend) 的 API。

### 系統架構

```
minyou-t-forum/                 總覽用的 repo，把下面兩支掛在一起，本身不部署
├── minyou-t-forum-backend/     後端：Flask API，部署在 Render
└── minyou-t-forum-web/         ← 這支 repo：靜態網頁，部署在 GitHub Pages
```

打開網頁時，`js/main.js` 先確認登入狀態，再決定顯示哪個畫面：

| 狀態 | 看到的畫面 |
|---|---|
| 沒登入 | 登入頁 |
| 登入了、還沒註冊 | 註冊表單 |
| 審核中 | 等待審核 |
| 已停用 | 帳號無法使用 |
| 已審核 | 論壇本身：四個頁籤，版主與管理員多一個後台 |

已審核的成員，畫面由網址 `#` 後面的部分決定，例如 `#/forum/12` 是第 12 篇文章。每個畫面都有自己的網址，所以重新整理會停在原本的畫面。

還不能使用論壇的人（還沒註冊、審核中、已停用）與剛登出的人，網址 `#` 後面的部分會被清掉：他們不在任何一個論壇畫面上，網址不該還留著上一位使用者停的位置（例如後台）。頁首會在他們的名字旁邊標出現在的狀態。

### 為什麼不用框架，也沒有 build

整個網站是瀏覽器可以直接執行的檔案：`index.html` 用 `<script type="module">` 載入 `js/main.js`，其他檔案用 `import` 互相引用。不用安裝任何東西，改完存檔、重新整理就看得到。

這個網站的畫面不多，用一個建立元素的小函式（`js/ui.js` 的 `el`）就夠了，不需要框架。要讀懂它，只需要會 HTML、CSS、JavaScript。

### 登入狀態為什麼存在瀏覽器裡

登入之後，關掉分頁、重新整理、關掉瀏覽器再打開，都還是登入狀態。只有按登出、太久沒用，或帳號被停用才會登出。

做法是：Google 只負責證明「這個人是誰」。登入那一刻，把 Google 給的憑證交給後端，換成後端自己發的登入憑證，存在瀏覽器的 localStorage（`js/session.js`）。之後打開網頁，直接拿存著的憑證去問後端，不經過 Google。

不能反過來靠 Google 的自動登入來決定有沒有登入：它會因為我們控制不了的原因拒絕，使用者就會看到「明明登入過，怎麼又要登入」。

啟動時如果連不上後端，不會把人登出：連不上不代表憑證失效。畫面會顯示「暫時連不上伺服器」和一顆再試一次的按鈕。

### 用到一半憑證失效怎麼辦

所有對後端的請求都走 `js/api.js`。它處理兩種情況：

- **401：憑證失效了。** 在目前的畫面上蓋一層重新登入的視窗。登入成功後，用同樣的內容把剛才的請求再送一次。使用者正在寫的文章不會因為登入過期而不見。同時有好幾個請求撞到時只跳一次視窗。
  - 只有登入回來的是**同一個人**（email 一樣）才會重送（`js/main.js` 的 `askToSignInAgain`）。在共用的裝置上換了另一個人登入，剛才畫面上的內容是前一個人的，不能用新的身分送出去：那些請求直接放棄，整個畫面照新的帳號重畫，最上面說明「你登入的是另一個帳號」（可能只是在 Google 的選單上點錯帳號）。這是在本機用瀏覽器模擬兩種情況確認過的：換人時草稿沒有被發出去、畫面換成新的帳號；同一個人時剛才那篇照常發出。
- **403，而且代碼是 `unregistered`、`pending`、`disabled`：帳號狀態變了**（例如剛被停用）。重新確認一次狀態，換到對應的畫面。

### 畫面上的鎖只是顯示效果

一般使用者看不到「新增公告」的按鈕，也看不到別人文章上的「刪除」。這只是為了不顯示按了也沒用的按鈕（`js/boards.js` 的 `canCreate`、`canModify`）。

真正的把關在後端：就算有人用開發者工具把按鈕弄出來按下去，或直接呼叫 API，後端一樣會拒絕。前端的判斷永遠不能當成安全機制。

### 版主與管理員的名字旁邊為什麼有標籤

文章、回覆、公告的作者如果是版主或管理員，名字後面會多一個紅色的角色標籤（`js/format.js` 的 `authorName`）。標籤是另外畫出來的元素，不是名字的一部分：住戶把顯示名稱取成「管理員」或「某某（管理員）」，也做不出這個標籤。角色是後端回傳的作者**現在**的角色。

### 兩個人同時改同一筆資料時

- **編輯公告或文章**：送出時帶著打開編輯頁時看到的版本號（`version`）。這段期間被別人改過，後端回 409，畫面上顯示說明，剛才打的字留著，可以先複製起來再重新整理。
- **後台改成員**：送出時帶著這一列載入時的樣子（`expected`）。這段期間被別人改過（例如剛被停用），後端回 409，整份清單重新載入，最上面說明是哪一位剛被改過。不會用畫面上舊的值把別人的修改蓋回去。
- **後台的「登出他所有的裝置」**：例如他的手機掉了。他每一台裝置都要重新登入，帳號不會被停用。自己的那一列沒有這顆按鈕，自己用頁首的「登出」。

### 換畫面時為什麼換一個新的容器

每次換畫面，`js/main.js` 都建立一個新的容器交給那個畫面。畫面要顯示資料得先問後端，如果使用者在回應回來之前就切到別的頁籤，舊畫面晚到的回應只會寫進已經被換掉的舊容器，不會蓋掉現在的畫面。

### 內文為什麼不當成 HTML

公告、文章、回覆的內文是純文字。顯示時一律用文字的方式放進頁面，所以使用者打的 `<script>` 只會原樣顯示，不會被執行。內文裡的網址會變成連結（`js/format.js` 的 `textToNodes`），也是一個一個建立元素，不是拼 HTML 字串。

字數用 `[...text].length` 算，不用 `text.length`：後者把一個表情符號算成 2，會跟後端的算法對不起來，變成前端說可以、後端卻拒絕。

### 文件為什麼不直接用連結下載

下載文件要帶登入憑證，一般的連結帶不了。所以是用程式把檔案抓回來，再交給瀏覽器存檔（`js/documents.js`）。代價是檔案會先整個放在瀏覽器的記憶體裡，單一檔案建議不要超過 20 MB。

### 後台的文檔上傳為什麼只有一顆按鈕

後台的「上傳文檔」按下去就是選檔案，選好就開始上傳，可以一次選好幾個（`js/admin.js`）。沒有「先選、再按送出」兩個步驟，畫面上也看不到檔案實際放在哪裡：操作的人只需要知道「檔案丟上去，住戶就下載得到」。

- 太大的檔案在瀏覽器就先擋下來，不用等整個檔案傳完才被後端拒絕。上限是後端告訴前端的，不是兩邊各寫一個數字。
- 一次選好幾個時一個一個傳，哪一個沒傳上去會個別說明，不會因為一個失敗就整批都不算。
- 上傳或刪除之後，清單重新向後端要一次，以後端說的為準。
- 檔案用瀏覽器上傳檔案的標準格式送（`FormData`）。這時 `Content-Type` 要讓瀏覽器自己產生：裡面有一段分隔字串，自己設的話後端會讀不出檔案（`js/api.js`）。
- 後端還沒開啟上傳功能時，這一塊會改成一顆打開存放資料夾的按鈕，請人直接去那裡放檔案。

### 附圖為什麼先在瀏覽器裡縮小

公告與文章都可以附圖，最多五張。選好的圖片先在瀏覽器裡縮成 480P（短的那一邊最多 480 像素）的 JPEG 才上傳（`js/pictures.js`）。手機拍的照片一張好幾 MB，縮完只有幾十 KB，用手機網路也傳得快，後端也不用做影像處理。

看圖跟下載文件一樣要帶登入憑證，所以也是先用程式把圖抓回來，再交給 `<img>` 顯示。

### 字為什麼這麼大

住戶裡長輩多，整個網站的字級設成瀏覽器預設大小的 1.4 倍。設定只有一行：`css/style.css` 裡的 `html { font-size: 140%; }`。其他尺寸都用 rem 寫，改這一行就會一起縮放。

用百分比而不是固定的像素：使用者自己把瀏覽器的字調大時，這裡會跟著再放大。字一大，東西就可能一排放不下，所以排版都會自己調整：頁籤放得下就四個排一排，放不下（很窄的手機，或字級再調大）就變成二乘二；後台的欄位是一排放得下幾個就放幾個。Google 的登入按鈕大小是它自己決定的，不會跟著放大，所以另外用 CSS 放大。

### 有條件的內容一律用 fill

畫面上常寫 `條件 && 元素`：條件成立才放那個元素。條件不成立時，那一格的值是 `false`。直接把它交給 `replaceChildren`，瀏覽器會把它當成文字，畫面上就多出「false」五個字。

所以內容裡有條件的時候，一律用 `js/ui.js` 的 `fill` 或 `el`，它們會略過 `false`。

### 定時碰一下後端，以及它做不到的事

後端放在免費方案的主機時，一陣子沒有請求就會休息，下一個請求要等它醒來，可能要一分鐘。所以只要有人開著頁面，`js/main.js` 就每 10 分鐘向後端的 `/health` 送一個請求，讓它在使用期間保持醒著。

這救不了「很久沒人來之後的第一位訪客」：他打開網頁時，後端已經在休息了。那要靠後端那一邊的定時排程。等待期間，畫面會說明伺服器回應比較慢、還在連線中，不會看起來像壞掉。

### 檔案結構

| 位置 | 負責 |
|---|---|
| `index.html` | 頁面的骨架：頁首、四個頁籤、放畫面的區域 |
| `css/style.css` | 樣式。以手機為主來排版；主色定義在最上面 |
| `js/config.js` | 後端的網址與 Google 用戶端 ID |
| `js/main.js` | 進入點：確認登入狀態、看網址決定顯示哪個畫面 |
| `js/session.js` | 存在瀏覽器裡的登入憑證，以及現在登入的是誰 |
| `js/api.js` | 對後端的所有請求 |
| `js/google.js` | Google 登入按鈕 |
| `js/screens.js` | 登入、註冊、審核中、已停用、連不上伺服器 |
| `js/boards.js` | 公告與論壇的差別 |
| `js/entries.js` | 公告與文章共用的列表、內容頁、編輯頁 |
| `js/replies.js` | 文章底下的回覆 |
| `js/pictures.js` | 公告與文章的附圖：選圖、縮小、顯示 |
| `js/documents.js` | 社區文檔 |
| `js/admin.js` | 後台：新增公告、上傳與刪除文檔、成員管理 |
| `js/form.js`、`js/format.js`、`js/ui.js` | 表單檢查、顯示格式（包含作者名字旁的角色標籤）、畫面的小工具 |

### 已知限制

- 內文只有純文字，沒有粗體、清單這類格式。
- 公告與文章的附圖只能在新增時選，之後不能更換。
- 後台上傳的文檔一個最多 10 MB（上限由後端決定）。上傳時沒有進度條，只顯示現在傳到第幾個。
- 沒有即時更新：進入頁面或重新整理時才抓資料。
- 沒有搜尋、通知、個人資料頁。要改顯示名稱，請版主或管理員在後台改。
- 文件下載會先把整個檔案放進瀏覽器的記憶體，不適合很大的檔案。
- 第四個頁籤是預留的，目前沒有功能。

---

# 架設 SOP / Setup Guide

## Part A. 本機執行

### 1. 先把後端跑起來

照 [`minyou-t-forum-backend`](https://github.com/beethoreven/minyou-t-forum-backend) 的說明，讓後端在 `http://localhost:5180` 跑起來。

### 2. 填設定

打開 `js/config.js`，把 `GOOGLE_CLIENT_ID` 換成你自己的 Google OAuth 用戶端 ID，要跟後端的設定 `GOOGLE_CLIENT_ID` 一樣。

這個用戶端 ID 的「已授權的 JavaScript 來源」要包含 `http://localhost:8180`。來源只有網域與 port，不含路徑，結尾沒有斜線。

### 3. 啟動

網頁用到的 JavaScript 模組，瀏覽器要求一定要透過 HTTP 伺服器載入，不能直接用檔案總管點開 `index.html`。Python 內建的就可以：

```bash
python3 -m http.server 8180 --bind 127.0.0.1
```

用瀏覽器打開 `http://localhost:8180`。port 要固定是 8180：後端的 `ALLOWED_ORIGINS` 與 Google 的授權來源都是照這個網址設定的，換了 port 兩邊都會拒絕。

### 4. 登入

按「使用 Google 帳戶登入」。用後端設定 `FIRST_ADMIN_EMAIL` 的那個帳號登入，就是管理員。用別的帳號登入會看到註冊表單。

要換身分測試而不想準備好幾個 Google 帳號，見後端 README 的「換身分測試」。

## Part B. 部署到 GitHub Pages

1. 打開 `js/config.js`，把正式環境的後端網址換成你的後端實際的網址。
2. 把這支 repo 推上 GitHub。GitHub 免費方案的 Pages 要求 repo 是公開的。
3. repo 的 Settings → Pages → Source 選「Deploy from a branch」，Branch 選 `main`、資料夾選 `/ (root)`，按 Save。
4. 一兩分鐘後，網站會出現在 `https://<帳號>.github.io/<repo 名稱>/`。
5. 這個網站的來源是 `https://<帳號>.github.io`（不含後面的路徑）。把它填進兩個地方，少一個登入就會失敗：
   - 後端的環境變數 `ALLOWED_ORIGINS`
   - Google OAuth 用戶端 ID 的「已授權的 JavaScript 來源」

之後改了程式，推上 `main` 就會自動更新。

## Part C. 設定總覽

設定都在 `js/config.js`，兩個都不是秘密。

| 名稱 | 說明 |
|---|---|
| `API_BASE_URL` | 後端的網址。在 `localhost` 開網頁時連本機的後端，其他情況連正式環境的 |
| `GOOGLE_CLIENT_ID` | Google 登入用的 OAuth 用戶端 ID，要跟後端的設定一樣 |

## Part D. 畫面與網址一覽

| 網址 `#` 後面的部分 | 畫面 | 誰看得到 |
|---|---|---|
| `/announcements` | 社區公告的列表 | 已審核 |
| `/announcements/new`、`/announcements/<id>/edit` | 新增、編輯公告。新增的入口在後台 | 版主、管理員 |
| `/announcements/<id>` | 一則公告 | 已審核 |
| `/forum` | 社區論壇的列表 | 已審核 |
| `/forum/new` | 新增文章 | 已審核 |
| `/forum/<id>` | 一篇文章與它的回覆 | 已審核 |
| `/forum/<id>/edit` | 編輯文章 | 作者本人、版主、管理員 |
| `/documents` | 社區文檔 | 已審核 |
| `/reserved` | 預留的頁籤 | 已審核 |
| `/admin` | 後台：新增公告、上傳與刪除文檔、成員管理 | 版主、管理員 |

---

# English

## 老爺華廈論壇 — Frontend

The frontend of a small residents' forum: sign-in, registration, four tabs (announcements, forum, documents, and one reserved), plus an admin page for adding announcements, uploading documents and managing members. This document has two independent parts; read whichever you need:

- **[Project Report](#project-report)**: what this site is, how it fits together, and the reason behind each decision — for readers who want to understand it.
- **[Setup Guide](#setup-guide)**: step-by-step instructions — for readers who want to get it running.

The two parts are deliberately separate; don't cross-read them. The report is background, the guide is an operating manual.

---

## Project Report

### What This Is

The web pages of a small forum for the residents of one community. Residents sign in with a Google account and must be reviewed after registering before they can use it.

This repo is the frontend. It is only HTML, CSS and JavaScript, with no framework and no build step. All data comes from the API of the backend, [`minyou-t-forum-backend`](https://github.com/beethoreven/minyou-t-forum-backend).

### System Architecture

```
minyou-t-forum/                 Overview repo that mounts the two below; never deployed itself
├── minyou-t-forum-backend/     Backend: Flask API, deployed on Render
└── minyou-t-forum-web/         ← this repo: static pages, deployed on GitHub Pages
```

When the page opens, `js/main.js` first establishes the sign-in state and then decides which screen to show:

| State | Screen |
|---|---|
| Not signed in | Sign-in page |
| Signed in, not registered | Registration form |
| Under review | Waiting for review |
| Disabled | Account unavailable |
| Approved | The forum itself: four tabs, plus the admin page for moderators and administrators |

For an approved member, the screen is chosen by the part of the URL after `#`; for example `#/forum/12` is post 12. Every screen has its own URL, so a reload stays on the same screen.

For people who can't use the forum yet (not registered, under review, disabled) and for someone who just signed out, the part of the URL after `#` is cleared: they aren't on any forum screen, so the URL shouldn't keep the place the previous user stopped at (the admin page, say). The header shows their current state next to their name.

### Why No Framework and No Build

The whole site is files a browser can run directly: `index.html` loads `js/main.js` with `<script type="module">`, and the other files reference each other with `import`. Nothing needs installing; save a change, reload, and it is there.

The site has few screens, and one small element-building function (`el` in `js/ui.js`) is enough, so no framework is needed. Reading the code requires only HTML, CSS and JavaScript.

### Why the Sign-in State Is Kept in the Browser

After signing in, closing the tab, reloading, or closing and reopening the browser all leave you signed in. Only signing out, a long period of no use, or a disabled account signs you out.

Here is how: Google is only responsible for proving who the person is. At the moment of sign-in, Google's token is handed to the backend and exchanged for a session token issued by the backend itself, which is stored in the browser's localStorage (`js/session.js`). From then on, opening the page sends the stored token straight to the backend, without going through Google.

The opposite approach, relying on Google's automatic sign-in to decide whether someone is signed in, doesn't work: it can refuse for reasons outside our control, and the user sees "I signed in before, why am I asked again".

If the backend can't be reached at start-up, the user is not signed out: being unreachable doesn't mean the token is invalid. The page shows "temporarily unable to reach the server" with a retry button.

### What Happens When the Token Expires Mid-use

Every request to the backend goes through `js/api.js`, which handles two cases:

- **401: the token is no longer valid.** A sign-in dialog is laid over the current screen. After a successful sign-in, the same request is sent again with the same content. A post being written is not lost because the session expired. When several requests hit this at once, only one dialog appears.
  - The request is sent again only if the **same person** signed back in (the same email; `askToSignInAgain` in `js/main.js`). If a different person signs in on a shared device, what is on the screen belongs to the previous person and must not be sent under the new identity: those requests are dropped and the whole screen is redrawn for the new account, with a note at the top saying a different account signed in (it may just be a slip in Google's account chooser). Both cases were checked locally by simulating them in a browser: when the person changed, the draft was not posted and the screen switched to the new account; when it was the same person, the post went out as before.
- **403 with the code `unregistered`, `pending` or `disabled`: the account's state changed** (for example, it was just disabled). The state is checked again and the matching screen is shown.

### Locks in the Page Are Only Cosmetic

A regular user sees no "new announcement" button and no "delete" on other people's posts. That is only to avoid showing buttons that would do nothing (`canCreate` and `canModify` in `js/boards.js`).

The real gate is the backend: even if someone reveals a button with developer tools and clicks it, or calls the API directly, the backend still refuses. A check in the frontend must never be treated as a security mechanism.

### Why Moderators and Administrators Have a Tag Beside Their Names

When the author of a post, reply or announcement is a moderator or administrator, a red role tag follows the name (`authorName` in `js/format.js`). The tag is a separately drawn element, not part of the name: a resident who sets their display name to "管理員" or "Someone (管理員)" still can't produce it. The role is the author's **current** role as reported by the backend.

### When Two People Change the Same Thing

- **Editing an announcement or post**: the edit carries the version number (`version`) seen when the edit page opened. If someone else changed it meanwhile, the backend answers 409, the page shows an explanation, and the text just typed stays so it can be copied before reloading.
- **Changing a member on the admin page**: the save carries what that row looked like when it loaded (`expected`). If someone else changed it meanwhile (for example, just disabled them), the backend answers 409, the whole list reloads, and a note at the top says who was just changed. A stale page can't write old values back over someone else's change.
- **"Sign them out of every device" on the admin page**: for example when their phone is lost. Every device of theirs has to sign in again; the account is not disabled. Your own row has no such button; use "Sign out" in the header instead.

### Why Each Screen Gets a New Container

Every time the screen changes, `js/main.js` creates a new container and hands it to that screen. A screen has to ask the backend before it can show data; if the user switches tabs before the answer arrives, the old screen's late answer is written into its old, already-replaced container and never overwrites the current screen.

### Why Bodies Are Not Treated as HTML

The body of an announcement, post or reply is plain text. It is always inserted into the page as text, so a `<script>` typed by a user is simply displayed, not executed. URLs in the body become links (`textToNodes` in `js/format.js`), also by creating elements one by one rather than concatenating HTML strings.

Lengths are counted with `[...text].length`, not `text.length`: the latter counts one emoji as 2, which disagrees with the backend, so the frontend would accept what the backend rejects.

### Why Documents Aren't Downloaded with a Plain Link

Downloading a document requires the session token, which a plain link can't carry. So the file is fetched by code and then handed to the browser to save (`js/documents.js`). The cost is that the whole file sits in the browser's memory first; a single file should preferably stay under 20 MB.

### Why Uploading a Document Is a Single Button

"Upload documents" on the admin page opens the file chooser, and the upload starts as soon as files are chosen; several can be chosen at once (`js/admin.js`). There is no separate "choose, then submit" step, and nothing on screen says where the files actually live: the person using it only needs to know that a file put here becomes downloadable by residents.

- A file that is too large is stopped in the browser, rather than being refused by the backend after the whole file has been sent. The limit comes from the backend, so the number isn't written in two places.
- When several files are chosen they are sent one at a time, and each failure is reported on its own; one failure doesn't void the whole batch.
- After an upload or a delete, the list is requested from the backend again, and what the backend says is what is shown.
- The file is sent in the browser's standard format for file uploads (`FormData`). The `Content-Type` must then be left for the browser to generate: it contains a boundary string, and if it is set by hand the backend can't read the file (`js/api.js`).
- While the backend hasn't turned uploads on, this block becomes a single button that opens the folder the documents are kept in, asking people to put files there directly.

### Why Pictures Are Shrunk in the Browser First

Announcements and posts can each carry up to five pictures. Each chosen picture is first shrunk in the browser to a 480p JPEG (the shorter side at most 480 pixels) and only then uploaded (`js/pictures.js`). A phone photo is several MB; shrunk, it is a few dozen KB, quick to send even on mobile data, and the backend needs no image processing.

Viewing a picture requires the session token just like downloading a document, so the picture is likewise fetched by code and then handed to an `<img>`.

### Why the Text Is So Large

Many residents are elderly, so the whole site's text is set to 1.4 times the browser's default size. It is one line: `html { font-size: 140%; }` in `css/style.css`. Every other size is written in rem, so changing that line scales everything together.

A percentage is used rather than fixed pixels: when a user enlarges text in their own browser, this grows with it. Larger text means things may no longer fit on one row, so the layout adjusts itself: the tabs sit four in a row when they fit and become two by two when they don't (a very narrow phone, or an even larger text size); the admin page's fields are laid out as many per row as fit. Google's sign-in button picks its own size and doesn't grow with the text, so it is enlarged separately with CSS.

### Always Use `fill` for Conditional Content

Screens often say `condition && element`: put the element there only when the condition holds. When it doesn't, that slot's value is `false`. Hand it straight to `replaceChildren` and the browser treats it as text, so the word "false" shows up on the page.

So whenever content is conditional, use `fill` or `el` from `js/ui.js`; both skip `false`.

### The Periodic Request to the Backend, and What It Can't Do

On a free-tier host, the backend goes to sleep after a while without requests, and the next request waits for it to wake, possibly for a minute. So as long as someone has the page open, `js/main.js` sends a request to the backend's `/health` every 10 minutes to keep it awake during use.

This does nothing for "the first visitor after a long quiet period": the backend is already asleep when they open the page. That needs a scheduled request on the server side. While waiting, the page explains that the server is slow to respond and still connecting, so it doesn't look broken.

### File Structure

| Location | Responsibility |
|---|---|
| `index.html` | The page skeleton: header, four tabs, the area screens are drawn in |
| `css/style.css` | Styles. Laid out for phones first; the main colour is defined at the top |
| `js/config.js` | The backend's URL and the Google client ID |
| `js/main.js` | Entry point: establishes the sign-in state and picks a screen from the URL |
| `js/session.js` | The session token stored in the browser, and who is signed in |
| `js/api.js` | Every request to the backend |
| `js/google.js` | The Google sign-in button |
| `js/screens.js` | Sign-in, registration, under review, disabled, server unreachable |
| `js/boards.js` | What differs between announcements and the forum |
| `js/entries.js` | The list, detail and editor screens shared by announcements and posts |
| `js/replies.js` | Replies under a post |
| `js/pictures.js` | Pictures on announcements and posts: choosing, shrinking, displaying |
| `js/documents.js` | Community documents |
| `js/admin.js` | Admin page: new announcement, uploading and deleting documents, member management |
| `js/form.js`, `js/format.js`, `js/ui.js` | Form checks, display formats (including the role tag beside an author's name), small screen helpers |

### Known Limitations

- Bodies are plain text only: no formatting such as bold or lists.
- The pictures of an announcement or post can only be chosen when it is created and can't be replaced afterwards.
- A document uploaded from the admin page may be at most 10 MB (the backend sets the limit). There is no progress bar during an upload, only which file is being sent.
- Nothing updates live: data is fetched when a screen is entered or reloaded.
- There is no search, no notifications, and no profile page. To change a display name, ask a moderator or administrator to change it on the admin page.
- A document download holds the whole file in the browser's memory first, so it doesn't suit very large files.
- The fourth tab is reserved and has no function yet.

---

# Setup Guide

## Part A. Running Locally

### 1. Get the Backend Running First

Follow [`minyou-t-forum-backend`](https://github.com/beethoreven/minyou-t-forum-backend) to get the backend running at `http://localhost:5180`.

### 2. Fill In the Settings

Open `js/config.js` and replace `GOOGLE_CLIENT_ID` with your own Google OAuth client ID; it must match the backend's `GOOGLE_CLIENT_ID` setting.

That client ID's "Authorized JavaScript origins" must include `http://localhost:8180`. An origin is the domain and port only, with no path and no trailing slash.

### 3. Start It

Browsers require the JavaScript modules this page uses to be loaded through an HTTP server; opening `index.html` straight from a file manager won't work. Python's built-in server is enough:

```bash
python3 -m http.server 8180 --bind 127.0.0.1
```

Open `http://localhost:8180` in a browser. The port must stay 8180: the backend's `ALLOWED_ORIGINS` and Google's authorized origins are both set for this address, and a different port is refused by both.

### 4. Sign In

Click the Google sign-in button. Signing in with the account in the backend's `FIRST_ADMIN_EMAIL` setting makes you the administrator. Any other account sees the registration form.

To test as different people without several Google accounts, see "Test as Different People" in the backend README.

## Part B. Deploying to GitHub Pages

1. Open `js/config.js` and replace the production backend URL with your backend's actual URL.
2. Push this repo to GitHub. Pages on GitHub's free plan requires the repo to be public.
3. In the repo's Settings → Pages, set Source to "Deploy from a branch", Branch to `main` and the folder to `/ (root)`, then Save.
4. A minute or two later the site appears at `https://<account>.github.io/<repo name>/`.
5. The site's origin is `https://<account>.github.io` (without the path after it). Put it in two places; miss either one and sign-in fails:
   - the backend's `ALLOWED_ORIGINS` environment variable
   - the Google OAuth client ID's "Authorized JavaScript origins"

After that, pushing a change to `main` updates the site automatically.

## Part C. Settings Overview

All settings are in `js/config.js`; neither is a secret.

| Name | Description |
|---|---|
| `API_BASE_URL` | The backend's URL. When the page is opened on `localhost` it uses the local backend; otherwise the production one |
| `GOOGLE_CLIENT_ID` | The OAuth client ID used for Google sign-in; must match the backend's setting |

## Part D. Screens and URLs

| Part of the URL after `#` | Screen | Who can see it |
|---|---|---|
| `/announcements` | The announcement list | Approved |
| `/announcements/new`, `/announcements/<id>/edit` | Create or edit an announcement. The way in to "create" is on the admin page | Moderator, administrator |
| `/announcements/<id>` | One announcement | Approved |
| `/forum` | The forum list | Approved |
| `/forum/new` | Create a post | Approved |
| `/forum/<id>` | One post and its replies | Approved |
| `/forum/<id>/edit` | Edit a post | The author, moderator, administrator |
| `/documents` | Community documents | Approved |
| `/reserved` | The reserved tab | Approved |
| `/admin` | Admin page: new announcement, uploading and deleting documents, member management | Moderator, administrator |
