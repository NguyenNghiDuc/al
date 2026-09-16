const $ = selector => document.querySelector(selector);

/*
 * false: giao diện demo, không gọi AI.
 * true: gọi backend POST /api/chat.
 *
 * Backend cần nhận:
 * { messages: [{ role: "user", content: "..." }] }
 *
 * Và trả JSON:
 * { reply: "Nội dung trả lời" }
 *
 * Hoặc stream NDJSON theo định dạng Ollama:
 * {"message":{"content":"..."},"done":false}
 * {"done":true}
 */
const API_ENABLED = false;

const STORAGE_KEY = "kikial-interface-v1";

const sidebar = $("#sidebar");
const overlay = $("#overlay");
const historyElement = $("#history");
const messagesElement = $("#messages");
const conversation = $("#conversation");
const promptInput = $("#prompt");
const notice = $("#notice");

let chats = readChats();
let activeId = chats[0]?.id || null;
let busy = false;
let abortController = null;

function readChats() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    if (!Array.isArray(data)) return [];

    return data.filter(chat =>
      chat &&
      typeof chat.id === "string" &&
      typeof chat.title === "string" &&
      Array.isArray(chat.messages) &&
      chat.messages.every(message =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string"
      )
    );
  } catch {
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    notice.textContent =
      "Không lưu được lịch sử. Bộ nhớ trình duyệt có thể đã đầy.";
  }
}

function getChat() {
  return chats.find(chat => chat.id === activeId);
}

function setMenu(open) {
  sidebar.classList.toggle("open", open);
  overlay.hidden = !open;
}

function scrollToBottom() {
  conversation.scrollTop = conversation.scrollHeight;
}

function resizeInput() {
  promptInput.style.height = "auto";
  promptInput.style.height =
    Math.min(promptInput.scrollHeight, 160) + "px";

  $("#send").disabled = busy || !promptInput.value.trim();
}

function setBusy(value) {
  busy = value;

  $("#send").hidden = value;
  $("#stop").hidden = !value;

  $("#new-chat").disabled = value;
  $("#delete-chat").disabled = value || !getChat();

  promptInput.disabled = value;

  resizeInput();
  renderHistory();
}

function renderHistory() {
  const keyword = $("#search").value.toLocaleLowerCase("vi").trim();

  const filtered = chats.filter(chat =>
    chat.title.toLocaleLowerCase("vi").includes(keyword)
  );

  historyElement.replaceChildren();
  $("#chat-count").textContent = chats.length;

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";

    empty.textContent = keyword
      ? "Không tìm thấy cuộc trò chuyện."
      : "Những cuộc trò chuyện của bạn sẽ xuất hiện tại đây.";

    historyElement.append(empty);
    return;
  }

  for (const chat of filtered) {
    const button = document.createElement("button");
    button.className =
      `history-item ${chat.id === activeId ? "active" : ""}`;

    button.disabled = busy;

    const icon = document.createElement("span");
    icon.textContent = "◷";
    icon.setAttribute("aria-hidden", "true");

    const title = document.createElement("span");
    title.textContent = chat.title;

    button.append(icon, title);

    button.addEventListener("click", () => {
      if (busy) return;

      activeId = chat.id;
      notice.textContent = "";

      renderHistory();
      renderMessages();
      setMenu(false);
    });

    historyElement.append(button);
  }
}

function createMessage(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;

  const avatar = document.createElement("div");
  avatar.className =
    `message-avatar ${message.role === "user" ? "user-avatar" : ""}`;

  avatar.textContent = message.role === "user" ? "Đ" : "✳";

  const body = document.createElement("div");
  body.className = "message-body";

  const name = document.createElement("strong");
  name.className = "message-name";
  name.textContent = message.role === "user" ? "Bạn" : "Kikial";

  const text = document.createElement("div");
  text.className = "message-text";

  // Không dùng innerHTML với nội dung người dùng hoặc AI.
  text.textContent = message.content || "Đang suy nghĩ…";

  body.append(name, text);

  if (message.role === "assistant") {
    const copy = document.createElement("button");
    copy.className = "copy-button";
    copy.textContent = "⧉ Sao chép";

    copy.addEventListener("click", async () => {
      if (!message.content) return;

      try {
        await navigator.clipboard.writeText(message.content);
        copy.textContent = "✓ Đã sao chép";

        setTimeout(() => {
          copy.textContent = "⧉ Sao chép";
        }, 1800);
      } catch {
        notice.textContent =
          "Trình duyệt không cho sao chép. Bạn có thể bôi đen và nhấn Ctrl + C.";
      }
    });

    body.append(copy);
  }

  article.append(avatar, body);
  messagesElement.append(article);

  return text;
}

function renderMessages() {
  messagesElement.replaceChildren();

  const chat = getChat();
  const hasMessages = Boolean(chat?.messages.length);

  $("#welcome").hidden = hasMessages;
  $("#delete-chat").disabled = busy || !chat;

  if (hasMessages) {
    chat.messages.forEach(createMessage);
    scrollToBottom();
  }
}

function startNewChat() {
  if (busy) return;

  activeId = null;
  promptInput.value = "";
  notice.textContent = "";

  renderHistory();
  renderMessages();
  resizeInput();
  setMenu(false);

  promptInput.focus();
}

async function receiveReply(context, reply, element, signal) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify({
      messages: context
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));

    throw new Error(
      data.error || `Không gọi được AI. Mã lỗi: ${response.status}`
    );
  }

  const type = response.headers.get("content-type") || "";

  if (type.includes("application/json")) {
    const data = await response.json();

    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("Backend chưa trả về trường reply hợp lệ.");
    }

    reply.content = data.reply;
    element.textContent = reply.content;
    return;
  }

  if (!type.includes("application/x-ndjson")) {
    throw new Error(
      "Backend cần trả JSON hoặc application/x-ndjson."
    );
  }

  if (!response.body) {
    throw new Error("Không nhận được luồng phản hồi.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let completed = false;

  function processLine(line) {
    if (!line.trim()) return;

    const data = JSON.parse(line);

    if (data.error) throw new Error(data.error);

    if (data.message?.content) {
      reply.content += data.message.content;
      element.textContent = reply.content;
      scrollToBottom();
    }

    if (data.done) completed = true;
  }

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newline;

    while ((newline = buffer.indexOf("\n")) !== -1) {
      processLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) processLine(buffer);

  if (!completed) {
    throw new Error("Kết nối bị ngắt trước khi AI trả lời xong.");
  }

  if (!reply.content.trim()) {
    throw new Error("AI chưa trả về nội dung.");
  }
}

async function sendMessage(event) {
  event.preventDefault();

  const content = promptInput.value.trim();

  if (!content || busy) return;

  notice.textContent = "";

  let chat = getChat();

  if (!chat) {
    chat = {
      id: crypto.randomUUID(),
      title: content.slice(0, 48),
      messages: []
    };

    chats.unshift(chat);
    activeId = chat.id;
  }

  chat.messages.push({
    role: "user",
    content
  });

  const context = chat.messages
    .filter(message =>
      !message.failed &&
      !message.demo &&
      message.content.trim()
    )
    .slice(-24)
    .map(({ role, content }) => ({
      role,
      content: content.slice(0, 12000)
    }));

  const reply = {
    role: "assistant",
    content: ""
  };

  chat.messages.push(reply);
  promptInput.value = "";

  setBusy(true);
  renderMessages();

  const replyElement =
    messagesElement.lastElementChild.querySelector(".message-text");

  abortController = new AbortController();

  try {
    if (!API_ENABLED) {
      reply.demo = true;

      reply.content =
        "Giao diện Kikial đã nhận được tin nhắn của bạn.\n\n" +
        "Đây là chế độ demo giao diện, chưa kết nối mô hình AI. " +
        "Bạn có thể thử tạo hội thoại, tìm lịch sử, sao chép và xóa chat.\n\n" +
        "Để nhận câu trả lời thật, cần backend /api/chat và bật API_ENABLED trong app.js.";

      replyElement.textContent = reply.content;
    } else {
      await receiveReply(
        context,
        reply,
        replyElement,
        abortController.signal
      );
    }
  } catch (error) {
    abortController.abort();
    reply.failed = true;

    const message = error.name === "AbortError"
      ? "Đã dừng phản hồi."
      : error.message;

    notice.textContent = message;

    reply.content = reply.content
      ? `${reply.content}\n\n[${message}]`
      : message;

    replyElement.textContent = reply.content;
  } finally {
    abortController = null;

    setBusy(false);
    saveChats();
    scrollToBottom();

    promptInput.focus();
  }
}

$("#chat-form").addEventListener("submit", sendMessage);
$("#new-chat").addEventListener("click", startNewChat);

$("#search").addEventListener("input", renderHistory);
$("#open-menu").addEventListener("click", () => setMenu(true));
$("#close-menu").addEventListener("click", () => setMenu(false));
overlay.addEventListener("click", () => setMenu(false));

$("#stop").addEventListener("click", () => {
  abortController?.abort();
});

$("#delete-chat").addEventListener("click", () => {
  if (busy || !getChat()) return;

  if (!confirm("Xóa cuộc trò chuyện này? Không thể hoàn tác.")) {
    return;
  }

  chats = chats.filter(chat => chat.id !== activeId);
  activeId = chats[0]?.id || null;

  saveChats();
  renderHistory();
  renderMessages();
});

promptInput.addEventListener("input", resizeInput);

promptInput.addEventListener("keydown", event => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();

    if (promptInput.value.trim() && !busy) {
      $("#chat-form").requestSubmit();
    }
  }
});

document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.prompt;
    resizeInput();
    promptInput.focus();
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") setMenu(false);
});

if (API_ENABLED) {
  const connection = $(".connection");
  connection.lastChild.textContent = " Chế độ kết nối API";
}

renderHistory();
renderMessages();
resizeInput();