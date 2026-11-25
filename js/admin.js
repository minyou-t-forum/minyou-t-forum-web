// 後台。版主與管理員用它新增公告、上傳與刪除文檔、管理成員；管理員另外看得到操作紀錄。
//
// 這裡把不能改的欄位鎖起來只是為了好操作；能不能改，最後是 backend 決定的。

import { api } from "./api.js";
import { formatSize, formatTime } from "./format.js";
import { getUser } from "./session.js";
import { confirmDialog, el, fill, showError, showLoading } from "./ui.js";

const ROLE_LABELS = { member: "一般使用者", moderator: "版主", admin: "管理員" };
const STATUS_LABELS = { pending: "審核中", approved: "已審核", disabled: "已停用" };

export function adminView(container) {
  const documentsBox = el("div");
  const membersBox = el("div");
  const actionsBox = getUser().role === "admin" && el("div");
  fill(
    container,
    el("div", { class: "toolbar" }, el("h2", { class: "page-title", text: "後台" })),
    el(
      "section",
      { class: "card admin-section" },
      el("h3", { class: "section-title", text: "公告" }),
      el("p", { class: "card-text", text: "發布給所有住戶看的公告。要修改或刪除，到「社區公告」點進那一則。" }),
      el("a", { class: "button button-primary", href: "#/announcements/new", text: "新增公告" }),
    ),
    el(
      "section",
      { class: "card admin-section" },
      el("h3", { class: "section-title", text: "文檔" }),
      documentsBox,
    ),
    el(
      "section",
      { class: "admin-section" },
      el("h3", { class: "section-title", text: "成員管理" }),
      membersBox,
    ),
    actionsBox &&
      el(
        "section",
        { class: "card admin-section" },
        el("h3", { class: "section-title", text: "操作紀錄" }),
        el("p", {
          class: "card-text",
          text: "版主與管理員做過的事，以及被拒絕的操作，保留 180 天。只有管理員看得到。",
        }),
        actionsBox,
      ),
  );
  loadDocuments(documentsBox);
  loadMembers(membersBox);
  if (actionsBox) loadActions(actionsBox);
}

// ── 文檔 ─────────────────────────────────────────────────

/**
 * 文檔的管理：上傳、列出、刪除。上傳的檔案會出現在「社區文檔」頁籤，住戶都能下載。
 *
 * 操作的人不用知道檔案實際放在哪裡：選好檔案就會上傳，清單上每個檔案旁邊有「刪除」。
 */
async function loadDocuments(box) {
  showLoading(box);
  let info;
  let files;
  try {
    // 兩件事互不相干，一起問比較快：能不能上傳，以及現在有哪些文檔。
    [info, files] = await Promise.all([api.get("/admin/documents"), api.get("/documents")]);
  } catch (error) {
    showError(box, error, () => loadDocuments(box));
    return;
  }

  if (!info.can_upload) {
    // 伺服器還沒設定好代為存檔的服務。在那之前，只能請人直接到存放的資料夾放檔案。
    fill(
      box,
      el("p", {
        class: "card-text",
        text: "還沒有開啟從這裡上傳的功能。在開啟之前，要新增或刪除文檔，請按下面的按鈕打開存放文檔的資料夾，直接在裡面操作。",
      }),
      info.manage_url &&
        el("a", {
          class: "button button-primary",
          href: info.manage_url,
          target: "_blank",
          rel: "noopener noreferrer",
          text: "開啟文檔的資料夾",
        }),
    );
    return;
  }

  // 給人看的上限，例如「10 MB」。
  const limit = `${Math.round(info.max_bytes / 1024 / 1024)} MB`;
  // 收哪些副檔名由伺服器決定。選檔案的視窗只列出這些，選了別的也會先擋下來。
  const extensions = info.extensions || [];
  // 伺服器沒給清單（例如還是舊版）就不在這裡擋，交給伺服器判斷。
  const accepted = (name) =>
    extensions.length === 0 || extensions.some((extension) => name.toLowerCase().endsWith(extension));
  const input = el("input", { type: "file", multiple: true, hidden: true, accept: extensions.join(",") });
  const uploadButton = el("button", {
    class: "button button-primary",
    type: "button",
    text: "上傳文檔",
    // 真正的檔案選擇框藏起來，用這顆按鈕打開它：樣子才會跟其他按鈕一致。
    onClick: () => input.click(),
  });
  const message = el("p", { class: "save-message", role: "status" });
  const list = el("ul", { class: "document-list" });
  const empty = el("p", { class: "entry-meta", text: "目前沒有文檔。" });

  /** 在按鈕下面顯示幾行話：notes 是一般的訊息，problems 是出了問題的，用警示的顏色。 */
  function report(notes, problems = []) {
    message.replaceChildren(
      ...notes.map((line) => el("span", { class: "message-line", text: line })),
      ...problems.map((line) => el("span", { class: "message-line save-message-error", text: line })),
    );
  }

  function showFiles(items) {
    empty.hidden = items.length > 0;
    list.replaceChildren(...items.map((file) => documentRow(file, removeFile)));
  }

  // 清單第幾次重新載入。連著刪兩個檔案時會同時有兩次載入，比較晚回來的舊結果不能蓋掉新的。
  let filesLoad = 0;

  /** 重新向伺服器要一次清單。上傳或刪除之後，以伺服器說的為準。 */
  async function reloadFiles() {
    const thisLoad = ++filesLoad;
    try {
      const data = await api.get("/documents");
      if (thisLoad === filesLoad) showFiles(data.items);
    } catch {
      // 清單暫時拿不到就維持原樣，不要蓋掉剛剛顯示的上傳結果。重新整理頁面就會更新。
    }
  }

  async function removeFile(file) {
    const sure = await confirmDialog(`確定要刪除「${file.name}」嗎？刪除後住戶就下載不到了。`, "刪除");
    if (!sure) return;
    report([`刪除中：${file.name}`]);
    try {
      await api.delete(`/admin/documents/${file.id}`);
      report([`已刪除「${file.name}」`]);
    } catch (error) {
      report([], [`「${file.name}」沒有刪掉：${error.message}`]);
    }
    await reloadFiles();
  }

  input.addEventListener("change", async () => {
    const chosen = [...input.files];
    input.value = ""; // 清掉，下次才能再選到同一個檔案
    if (chosen.length === 0) return;

    // 上傳期間把按鈕鎖住，才不會同時送出兩批。
    uploadButton.disabled = true;
    const problems = [];
    let uploaded = 0;
    for (const [index, file] of chosen.entries()) {
      report([`上傳中（${index + 1}/${chosen.length}）：${file.name}`]);
      if (!accepted(file.name)) {
        problems.push(`「${file.name}」這種檔案不能上傳，只收 ${extensions.map((e) => e.slice(1)).join("、")}`);
        continue;
      }
      // 太大的先擋下來，不用等整個檔案傳完才被伺服器拒絕。
      if (file.size > info.max_bytes) {
        problems.push(`「${file.name}」太大了，一個檔案最多 ${limit}`);
        continue;
      }
      try {
        await api.upload("/admin/documents", file);
        uploaded += 1;
      } catch (error) {
        problems.push(`「${file.name}」沒有傳上去：${error.message}`);
      }
    }
    uploadButton.disabled = false;

    report(uploaded > 0 ? [`已上傳 ${uploaded} 個檔案`] : [], problems);
    await reloadFiles();
  });

  fill(
    box,
    el("p", {
      class: "card-text",
      text: `上傳的檔案會出現在「社區文檔」，住戶都能下載。可以一次選好幾個，一個檔案最多 ${limit}。上傳同名的檔案，會取代原本那一個。`,
    }),
    uploadButton,
    input,
    message,
    el("h4", { class: "list-title", text: "目前的文檔" }),
    empty,
    list,
  );
  showFiles(files.items);
}

/** 文檔清單的一列：檔名、時間與大小、刪除按鈕。 */
function documentRow(file, onDelete) {
  const deleteButton = el("button", {
    class: "button button-danger button-small",
    type: "button",
    text: "刪除",
    "aria-label": `刪除 ${file.name}`,
  });
  deleteButton.addEventListener("click", async () => {
    // 處理期間把這顆按鈕鎖住，連按兩下才不會刪兩次。
    deleteButton.disabled = true;
    await onDelete(file);
    deleteButton.disabled = false;
  });
  return el(
    "li",
    { class: "document-row" },
    el(
      "div",
      { class: "document-info" },
      el("span", { class: "entry-title", text: file.name }),
      el("span", { class: "entry-meta", text: `${formatTime(file.modified_time)}・${formatSize(file.size)}` }),
    ),
    deleteButton,
  );
}

// ── 成員管理 ─────────────────────────────────────────────

// 成員清單第幾次載入。清單可能在上一次還沒載完時又重新載入（例如連著兩列都發現資料被改過），
// 比較晚回來的舊結果不能蓋掉比較新的那一次。
let membersLoad = 0;

/** 成員清單。notice 是重新載入時要放在最上面的說明（例如「剛剛被別人改過」）。 */
async function loadMembers(box, notice = "") {
  const thisLoad = ++membersLoad;
  showLoading(box);
  let data;
  try {
    data = await api.get("/admin/users");
  } catch (error) {
    if (thisLoad === membersLoad) showError(box, error, () => loadMembers(box));
    return;
  }
  if (thisLoad !== membersLoad) return;

  // 最上面那一行「還有幾位在等審核」。每次儲存之後重算一次。
  const statuses = new Map(data.items.map((item) => [item.id, item.status]));
  const summary = el("p", { class: "card-text" });
  function updateSummary(changed) {
    if (changed) statuses.set(changed.id, changed.status);
    const pendingCount = [...statuses.values()].filter((status) => status === "pending").length;
    summary.textContent =
      pendingCount > 0 ? `有 ${pendingCount} 位在等審核，排在最前面。` : "目前沒有等待審核的申請。";
  }
  updateSummary();

  // 存檔時發現資料已經被別人改過：整份清單重新載入，畫面上才不會留著舊的值。
  const reload = (message) => loadMembers(box, message);
  fill(
    box,
    notice && el("p", { class: "save-message save-message-error", role: "alert", text: notice }),
    summary,
    el("ul", { class: "member-list" }, ...data.items.map((item) => memberItem(item, updateSummary, reload))),
  );
}

function memberItem(member, onSaved, onStale) {
  const me = getUser();
  const isSelf = member.id === me.id;
  const isAdmin = me.role === "admin";
  // 版主只能管一般使用者：管理員與其他版主的帳號只有管理員能動。
  const locked = !isAdmin && !isSelf && member.role !== "member";

  const nameInput = el("input", { class: "input", type: "text", "aria-label": "顯示名稱" });
  const unitInput = el("input", { class: "input", type: "text", "aria-label": "戶號" });
  const roleSelect = el("select", { class: "input", "aria-label": "角色" });
  const statusSelect = el("select", { class: "input", "aria-label": "狀態" });
  const badge = el("span", { class: "badge" });
  const message = el("p", { class: "save-message", role: "status" });
  const saveButton = el("button", { class: "button button-primary", type: "button", text: "儲存" });
  const approveButton = el("button", { class: "button", type: "button", text: "通過審核" });
  // 例如他的手機掉了：讓他在每一台裝置上登出，帳號不會被停用。自己的帳號用頁首的「登出」就好。
  const signOutButton = el("button", { class: "button", type: "button", text: "登出他所有的裝置" });
  signOutButton.hidden = isSelf || locked;

  /** 把畫面上這一列更新成 member 現在的內容。 */
  function show() {
    nameInput.value = member.display_name;
    unitInput.value = member.unit_no;

    // 角色只有管理員能改，版主的選單裡只有這個人現在的角色。
    const roles = isAdmin ? Object.keys(ROLE_LABELS) : [member.role];
    roleSelect.replaceChildren(...roles.map((role) => el("option", { value: role, text: ROLE_LABELS[role] })));
    roleSelect.value = member.role;

    // 帳號不能改回審核中，所以只有本來就在審核中的人看得到這個選項。
    const statuses = Object.keys(STATUS_LABELS).filter(
      (status) => status !== "pending" || member.status === "pending",
    );
    statusSelect.replaceChildren(
      ...statuses.map((status) => el("option", { value: status, text: STATUS_LABELS[status] })),
    );
    statusSelect.value = member.status;

    badge.textContent = STATUS_LABELS[member.status];
    badge.className = `badge badge-${member.status}`;
    approveButton.hidden = member.status !== "pending" || locked;

    for (const control of [nameInput, unitInput, saveButton]) control.disabled = locked;
    // 不能改自己的角色與狀態：唯一的管理員把自己降級或停用，就沒有人能改回來了。
    for (const control of [roleSelect, statusSelect]) control.disabled = locked || isSelf;
    if (!isAdmin) roleSelect.disabled = true;
  }

  async function save() {
    saveButton.disabled = true;
    approveButton.disabled = true;
    message.textContent = "";
    message.classList.remove("save-message-error");
    try {
      const result = await api.put(`/admin/users/${member.id}`, {
        display_name: nameInput.value.trim(),
        unit_no: unitInput.value.trim(),
        role: roleSelect.value,
        status: statusSelect.value,
        // 這一列載入時的樣子。這段期間被別人改過（例如剛被停用）的話，backend 會回 409，
        // 不會用這個畫面上舊的值把別人的修改蓋回去。
        expected: {
          display_name: member.display_name,
          unit_no: member.unit_no,
          role: member.role,
          status: member.status,
        },
      });
      member = result.item;
      show();
      onSaved(member);
      message.textContent = result.changed ? "已儲存" : "沒有修改";
    } catch (error) {
      if (error.status === 409) {
        onStale(`${member.email} 的資料剛剛被別人改過，清單已經重新載入。請確認現在的內容之後再改一次。`);
        return;
      }
      message.textContent = error.message;
      message.classList.add("save-message-error");
    } finally {
      saveButton.disabled = locked;
      approveButton.disabled = false;
    }
  }

  async function signOutEverywhere() {
    const sure = await confirmDialog(
      `確定要讓「${member.display_name}」在所有裝置上登出嗎？他重新用 Google 登入就能再用。`,
      "登出",
    );
    if (!sure) return;
    signOutButton.disabled = true;
    message.textContent = "";
    message.classList.remove("save-message-error");
    try {
      const result = await api.delete(`/admin/users/${member.id}/sessions`);
      message.textContent =
        result.revoked > 0 ? `已經讓他在 ${result.revoked} 個裝置上登出` : "他目前沒有登入中的裝置";
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("save-message-error");
    } finally {
      signOutButton.disabled = false;
    }
  }

  saveButton.addEventListener("click", save);
  signOutButton.addEventListener("click", signOutEverywhere);
  approveButton.addEventListener("click", () => {
    statusSelect.value = "approved";
    save();
  });
  show();

  return el(
    "li",
    { class: "member" },
    el(
      "div",
      { class: "member-head" },
      el("span", { class: "member-email", text: member.email + (isSelf ? "（你自己）" : "") }),
      badge,
    ),
    el("p", { class: "entry-meta", text: `加入時間：${formatTime(member.created_at)}` }),
    el(
      "div",
      { class: "member-fields" },
      el("label", { class: "member-field" }, el("span", { class: "label", text: "顯示名稱" }), nameInput),
      el("label", { class: "member-field" }, el("span", { class: "label", text: "戶號" }), unitInput),
      el("label", { class: "member-field" }, el("span", { class: "label", text: "角色" }), roleSelect),
      el("label", { class: "member-field" }, el("span", { class: "label", text: "狀態" }), statusSelect),
    ),
    locked && el("p", { class: "entry-meta", text: "版主不能修改管理員與其他版主的帳號。" }),
    el("div", { class: "actions" }, approveButton, saveButton, signOutButton),
    message,
  );
}

/** 給頁首顯示用：角色的中文名稱。 */
export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

// ── 操作紀錄（只有管理員看得到）────────────────────────────

const ACTION_LABELS = {
  "announcement.create": "發布公告",
  "announcement.update": "修改公告",
  "announcement.delete": "刪除公告",
  "post.update": "修改別人的文章",
  "post.delete": "刪除別人的文章",
  "reply.delete": "刪除別人的回覆",
  "document.upload": "上傳文檔",
  "document.delete": "刪除文檔",
  "user.approve": "審核通過",
  "user.disable": "停用帳號",
  "user.enable": "恢復帳號",
  "user.role": "改角色",
  "user.profile": "改名稱或戶號",
  "user.update": "修改帳號",
  "user.sign_out": "讓他登出所有裝置",
  "action_log.view": "看操作紀錄",
};

// 對象的編號前面加上它是什麼，例如「成員 #3」。文檔的對象是檔名或檔案代號，直接顯示。
const TARGET_KINDS = { announcement: "公告", post: "文章", reply: "回覆", user: "成員" };

/** 一頁一頁列出紀錄，新的在前面。只能看，不能改。 */
function loadActions(box) {
  const list = el("ul", { class: "document-list" });
  const more = el("div");
  fill(box, list, more);
  let lastId = null;

  async function loadPage() {
    showLoading(more);
    let page;
    try {
      page = await api.get(lastId === null ? "/admin/actions" : `/admin/actions?before=${lastId}`);
    } catch (error) {
      showError(more, error, loadPage);
      return;
    }
    for (const item of page.items) {
      list.append(actionRow(item));
      lastId = item.id;
    }
    if (lastId === null) fill(more, el("p", { class: "status", text: "目前沒有紀錄" }));
    else if (page.has_more)
      fill(more, el("button", { class: "button", type: "button", text: "載入更多", onClick: loadPage }));
    else fill(more);
  }

  loadPage();
}

function actionRow(item) {
  const kind = TARGET_KINDS[item.action.split(".")[0]];
  const target = item.target_id === null ? "" : kind ? `${kind} #${item.target_id}` : item.target_id;
  return el(
    "li",
    { class: "document-row" },
    el(
      "div",
      { class: "document-info" },
      el("span", { class: "member-email", text: item.actor_name || item.actor_email }),
      el("span", { class: "entry-meta message-line", text: formatTime(item.created_at) }),
    ),
    el("span", { text: [ACTION_LABELS[item.action] || item.action, target].filter(Boolean).join("　") }),
    item.outcome === "denied" && el("span", { class: "badge", text: "被拒絕" }),
  );
}
