// 公告與文章共用的三個畫面：列表、內容頁、編輯頁。board 是 boards.js 裡的設定。

import { api } from "./api.js";
import { checkText, showCount } from "./form.js";
import { authorName, formatTime, textToNodes } from "./format.js";
import { pictureGallery, picturePicker } from "./pictures.js";
import { replySection } from "./replies.js";
import { confirmDialog, el, fill, showError, showLoading } from "./ui.js";

// 跟 backend 的上限一致。
const TITLE_MAX = 100;
const BODY_MAX = 10000;

/** 列表：新的在上面，一次 20 筆，底下有「載入更多」。 */
export function listView(board, container) {
  const list = el("ul", { class: "entry-list" });
  const more = el("div", { class: "list-more" });
  fill(
    container,
    el(
      "div",
      { class: "toolbar" },
      el("h2", { class: "page-title", text: board.title }),
      board.createOnList &&
        board.canCreate() &&
        el("a", { class: "button button-primary", href: `${board.route}/new`, text: `新增${board.noun}` }),
    ),
    list,
    more,
  );

  let lastId = null; // 目前列出來的最後一筆，下一頁從它之後開始拿

  async function loadPage() {
    showLoading(more);
    let page;
    try {
      page = await api.get(lastId === null ? board.api : `${board.api}?before=${lastId}`);
    } catch (error) {
      showError(more, error, loadPage);
      return;
    }
    for (const item of page.items) {
      list.append(
        el(
          "li",
          {},
          el(
            "a",
            { class: "entry", href: `${board.route}/${item.id}` },
            el("span", { class: "entry-title", text: item.title }),
            el("span", { class: "entry-meta" }, ...board.listMeta(item)),
          ),
        ),
      );
      lastId = item.id;
    }
    if (lastId === null) {
      fill(more, el("p", { class: "status", text: `目前沒有${board.noun}` }));
    } else if (page.has_more) {
      fill(more, el("button", { class: "button", type: "button", text: "載入更多", onClick: loadPage }));
    } else {
      fill(more);
    }
  }

  loadPage();
}

/** 內容頁：標題、作者、時間、內文、附圖，以及編輯與刪除。文章還多了回覆。 */
export async function detailView(board, container, id) {
  const content = el("div");
  fill(
    container,
    el("a", { class: "back-link", href: board.route, text: `← 回${board.noun}列表` }),
    content,
  );

  showLoading(content);
  let entry;
  try {
    entry = await api.get(`${board.api}/${id}`);
  } catch (error) {
    // 找不到（已經被刪除）再試也沒用，其他錯誤才給「再試一次」。
    showError(content, error, error.status === 404 ? null : () => detailView(board, container, id));
    return;
  }

  const actionError = el("p", { class: "form-error", role: "alert" });
  const deleteButton = el("button", { class: "button button-danger", type: "button", text: "刪除" });
  deleteButton.addEventListener("click", async () => {
    if (!(await confirmDialog(board.deleteConfirm, "刪除"))) return;
    deleteButton.disabled = true;
    actionError.textContent = "";
    try {
      await api.delete(`${board.api}/${id}`);
      location.hash = board.route;
    } catch (error) {
      actionError.textContent = error.message;
      deleteButton.disabled = false;
    }
  });

  const images = entry.images || [];
  fill(
    content,
    el(
      "article",
      { class: "entry-detail" },
      el("h2", { class: "detail-title", text: entry.title }),
      el(
        "p",
        { class: "entry-meta" },
        authorName(entry.author_name, entry.author_role),
        `・${formatTime(entry.created_at)}`,
      ),
      el("div", { class: "body-text" }, textToNodes(entry.body)),
      images.length > 0 && pictureGallery(`${board.api}/${id}`, images),
      board.canModify(entry) &&
        el(
          "div",
          { class: "actions" },
          el("a", { class: "button", href: `${board.route}/${id}/edit`, text: "編輯" }),
          deleteButton,
        ),
      actionError,
    ),
    board.hasReplies && replySection(id, entry.replies),
  );
}

/** 編輯頁：新增與編輯共用。有給 id 就是編輯，會先把原本的內容載進來。 */
export async function editorView(board, container, id = null) {
  const isEdit = id !== null;
  const content = el("div");
  fill(
    container,
    el("a", {
      class: "back-link",
      href: isEdit ? `${board.route}/${id}` : board.createCancelRoute,
      text: "← 取消",
    }),
    content,
  );

  let entry = { title: "", body: "" };
  if (isEdit) {
    showLoading(content);
    try {
      entry = await api.get(`${board.api}/${id}`);
    } catch (error) {
      showError(content, error, error.status === 404 ? null : () => editorView(board, container, id));
      return;
    }
  }
  // 直接打網址進到這一頁、卻沒有權限的人，先講清楚，不要讓他填完才被 backend 拒絕。
  if (isEdit ? !board.canModify(entry) : !board.canCreate()) {
    fill(content, el("p", { class: "status", text: `你沒有${isEdit ? "編輯這則" : "新增"}${board.noun}的權限` }));
    return;
  }

  const titleInput = el("input", { class: "input", id: "entry-title", type: "text", autocomplete: "off" });
  const bodyInput = el("textarea", { class: "input textarea", id: "entry-body", rows: "8" });
  titleInput.value = entry.title;
  bodyInput.value = entry.body;
  const titleCounter = el("span", { class: "counter" });
  const bodyCounter = el("span", { class: "counter" });
  const formError = el("p", { class: "form-error", role: "alert" });
  const submitButton = el("button", { class: "button button-primary", type: "submit", text: isEdit ? "儲存" : "發布" });

  // 附圖只在新增的時候可以選，發出去之後就不能換。
  const picker = isEdit ? null : picturePicker();

  function updateCounters() {
    showCount(titleCounter, titleInput.value, TITLE_MAX);
    showCount(bodyCounter, bodyInput.value, BODY_MAX);
  }
  titleInput.addEventListener("input", updateCounters);
  bodyInput.addEventListener("input", updateCounters);
  updateCounters();

  async function submit(event) {
    event.preventDefault();
    // 送出前先檢查一次，使用者不用等伺服器回來才知道哪裡不對。backend 還是會再檢查一次。
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();
    const problem = checkText(title, "標題", TITLE_MAX) || checkText(body, "內文", BODY_MAX);
    if (problem) {
      formError.textContent = problem;
      return;
    }
    // 送出期間把按鈕鎖住，連按兩下才不會發出兩篇。
    submitButton.disabled = true;
    formError.textContent = picker ? "上傳中，請稍候…" : "";
    try {
      const payload = { title, body };
      // 編輯時帶著打開時看到的版本號：這段期間被別人改過的話，backend 會回 409，
      // 不會直接蓋掉別人改的內容。畫面上打的字會留著，使用者可以先複製起來。
      if (isEdit) payload.version = entry.version;
      if (picker) payload.images = await picker.encode();
      const saved = isEdit
        ? await api.put(`${board.api}/${id}`, payload)
        : await api.post(board.api, payload);
      location.hash = `${board.route}/${saved.id}`;
    } catch (error) {
      formError.textContent = error.message;
      submitButton.disabled = false;
    }
  }

  fill(
    content,
    el(
      "form",
      { class: "form", novalidate: true, onSubmit: submit },
      el("h2", { class: "page-title", text: isEdit ? `編輯${board.noun}` : `新增${board.noun}` }),
      el(
        "div",
        { class: "field" },
        el("label", { class: "label", for: "entry-title", text: "標題" }),
        titleInput,
        titleCounter,
      ),
      el(
        "div",
        { class: "field" },
        el("label", { class: "label", for: "entry-body", text: "內文" }),
        bodyInput,
        bodyCounter,
      ),
      picker && picker.element,
      isEdit &&
        (entry.images || []).length > 0 &&
        el("p", { class: "entry-meta", text: "附圖不能在這裡更換。要換圖的話，請刪除後重新發一次。" }),
      formError,
      submitButton,
    ),
  );
  if (!isEdit) titleInput.focus();
}
