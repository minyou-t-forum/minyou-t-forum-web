// 文章底下的回覆：列表（舊的在上面）與回覆輸入框。

import { api } from "./api.js";
import { checkText, showCount } from "./form.js";
import { authorName, formatTime, textToNodes } from "./format.js";
import { getUser, isStaff } from "./session.js";
import { confirmDialog, el } from "./ui.js";

// 跟 backend 的上限一致。
const REPLY_MAX = 2000;

export function replySection(postId, replies) {
  const heading = el("h3", { class: "section-title" });
  const list = el("ul", { class: "reply-list" });
  let count = 0;

  function setCount(value) {
    count = value;
    heading.textContent = `回覆（${count}）`;
  }

  function addReply(reply) {
    const itemError = el("p", { class: "form-error", role: "alert" });
    const deleteButton = el("button", {
      class: "button button-small button-danger",
      type: "button",
      text: "刪除",
    });
    const item = el(
      "li",
      { class: "reply" },
      el("p", { class: "entry-meta" }, authorName(reply.author_name, reply.author_role), `・${formatTime(reply.created_at)}`),
      el("div", { class: "body-text" }, textToNodes(reply.body)),
      // 回覆只有作者本人、版主、管理員能刪。這裡只決定要不要顯示按鈕，把關在 backend。
      (isStaff() || reply.author_id === getUser().id) && el("div", { class: "actions" }, deleteButton),
      itemError,
    );
    deleteButton.addEventListener("click", async () => {
      if (!(await confirmDialog("確定要刪除這則回覆嗎？刪除後無法復原。", "刪除"))) return;
      deleteButton.disabled = true;
      itemError.textContent = "";
      try {
        await api.delete(`/replies/${reply.id}`);
        item.remove();
        setCount(count - 1);
      } catch (error) {
        itemError.textContent = error.message;
        deleteButton.disabled = false;
      }
    });
    list.append(item);
    setCount(count + 1);
  }

  replies.forEach(addReply);
  setCount(replies.length);

  const input = el("textarea", { class: "input textarea", id: "reply-body", rows: "4" });
  const counter = el("span", { class: "counter" });
  const formError = el("p", { class: "form-error", role: "alert" });
  const submitButton = el("button", { class: "button button-primary", type: "submit", text: "送出回覆" });
  input.addEventListener("input", () => showCount(counter, input.value, REPLY_MAX));
  showCount(counter, "", REPLY_MAX);

  async function submit(event) {
    event.preventDefault();
    const body = input.value.trim();
    const problem = checkText(body, "回覆", REPLY_MAX);
    if (problem) {
      formError.textContent = problem;
      return;
    }
    // 送出期間把按鈕鎖住，連按兩下才不會送出兩則。
    submitButton.disabled = true;
    formError.textContent = "";
    try {
      addReply(await api.post(`/posts/${postId}/replies`, { body }));
      input.value = "";
      showCount(counter, "", REPLY_MAX);
    } catch (error) {
      formError.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  }

  return el(
    "section",
    { class: "replies" },
    heading,
    list,
    el(
      "form",
      { class: "form", novalidate: true, onSubmit: submit },
      el(
        "div",
        { class: "field" },
        el("label", { class: "label", for: "reply-body", text: "寫回覆" }),
        input,
        counter,
      ),
      formError,
      submitButton,
    ),
  );
}
