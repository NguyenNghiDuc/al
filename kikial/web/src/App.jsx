import { useEffect, useRef, useState } from "react";
import "./styles/global.css";
import "./styles/login.css";
import "./styles/workspace.css";
import "./styles/sync.css";
import ChatPage from "./pages/Chat";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminPage from "./pages/Admin";

const API_ENABLED = true;
const STORAGE_KEY = "kikial-react-chats-v1";

const SUGGESTIONS = [
  {
    icon: "⌘",
    color: "purple",
    title: "Cùng viết code",
    description: "Biến ý tưởng thành ứng dụng",
    prompt: "Giải thích async/await trong JavaScript bằng ví dụ dễ hiểu.",
  },
  {
    icon: "◎",
    color: "orange",
    title: "Học điều mới",
    description: "Hiểu rõ hơn, từng chút một",
    prompt: "Giúp tôi lập kế hoạch học tiếng Anh trong 30 ngày.",
  },
  {
    icon: "✧",
    color: "green",
    title: "Khơi nguồn ý tưởng",
    description: "Tìm một góc nhìn khác biệt",
    prompt: "Gợi ý 5 ý tưởng ứng dụng AI cho đồ án sinh viên.",
  },
  {
    icon: "✎",
    color: "blue",
    title: "Viết thật hay",
    description: "Tìm đúng lời cho suy nghĩ",
    prompt: "Viết lời giới thiệu bản thân cho sinh viên CNTT.",
  },
];

function loadChats() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    if (!Array.isArray(data)) return [];

    return data.filter(
      (chat) =>
        chat &&
        typeof chat.id === "string" &&
        typeof chat.title === "string" &&
        Array.isArray(chat.messages) &&
        chat.messages.every(
          (message) =>
            message &&
            typeof message.id === "string" &&
            ["user", "assistant"].includes(message.role) &&
            typeof message.content === "string",
        ),
    );
  } catch {
    return [];
  }
}

async function requestReply(messages, signal, onText) {
  const question = messages.at(-1)?.content || "";
  const history = messages.slice(0, -1);
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: question, history }),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Lỗi kết nối: ${response.status}`);
  }

  const type = response.headers.get("content-type") || "";

  if (type.includes("application/json")) {
    const data = await response.json();

    if (typeof data.answer !== "string" || !data.answer.trim()) {
      throw new Error("Backend chưa trả về trường answer hợp lệ.");
    }

    onText(data.answer);
    return;
  }

  if (!type.includes("application/x-ndjson") || !response.body) {
    throw new Error("Backend cần trả JSON hoặc luồng NDJSON.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let answer = "";
  let completed = false;

  function processLine(line) {
    if (!line.trim()) return;

    const data = JSON.parse(line);

    if (data.error) throw new Error(data.error);

    if (typeof data.message?.content === "string") {
      answer += data.message.content;
      onText(answer);
    }

    if (data.done) completed = true;
  }

  try {
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

    if (!answer.trim()) {
      throw new Error("AI chưa trả về nội dung.");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function LegacyChatWorkspace() {
  const [chats, setChats] = useState(loadChats);
  const [activeId, setActiveId] = useState(() => chats[0]?.id || null);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const inputRef = useRef(null);
  const conversationRef = useRef(null);
  const controllerRef = useRef(null);
  const busyRef = useRef(false);
  const copyTimerRef = useRef(null);

  const activeChat = chats.find((chat) => chat.id === activeId);
  const messages = activeChat?.messages || [];

  const filteredChats = chats.filter((chat) =>
    chat.title
      .toLocaleLowerCase("vi")
      .includes(search.trim().toLocaleLowerCase("vi")),
  );

  useEffect(() => {
    // Không ghi localStorage theo từng token khi đang stream.
    if (busy) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch {
      setNotice("Không lưu được lịch sử. Bộ nhớ trình duyệt có thể đã đầy.");
    }
  }, [chats, busy]);

  useEffect(() => {
    const element = conversationRef.current;

    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [activeId, chats]);

  useEffect(() => {
    const element = inputRef.current;

    if (element) {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
    }
  }, [input]);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
      controllerRef.current?.abort();
      clearTimeout(copyTimerRef.current);
    };
  }, []);

  function newChat() {
    if (busyRef.current) return;

    setActiveId(null);
    setInput("");
    setNotice("");
    setMenuOpen(false);
    inputRef.current?.focus();
  }

  function openChat(id) {
    if (busyRef.current) return;

    setActiveId(id);
    setNotice("");
    setMenuOpen(false);
  }

  function deleteChat() {
    if (busyRef.current || !activeChat) return;

    if (!window.confirm("Xóa cuộc trò chuyện này? Không thể hoàn tác.")) {
      return;
    }

    const remaining = chats.filter((chat) => chat.id !== activeId);

    setChats(remaining);
    setActiveId(remaining[0]?.id || null);
    setNotice("");
  }

  function updateReply(chatId, messageId, patch) {
    setChats((current) =>
      current.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId
                  ? { ...message, ...patch }
                  : message,
              ),
            }
          : chat,
      ),
    );
  }

  async function copyMessage(message) {
    try {
      await navigator.clipboard.writeText(message.content);

      setCopiedId(message.id);
      clearTimeout(copyTimerRef.current);

      copyTimerRef.current = setTimeout(() => {
        setCopiedId(null);
      }, 1800);
    } catch {
      setNotice("Không sao chép được. Hãy bôi đen nội dung và nhấn Ctrl + C.");
    }
  }

  async function sendMessage(event) {
    event?.preventDefault();

    const text = input.trim();

    if (!text || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setNotice("");
    setInput("");
    setMenuOpen(false);

    const chatId = activeChat?.id || crypto.randomUUID();
    const replyId = crypto.randomUUID();

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const assistantMessage = {
      id: replyId,
      role: "assistant",
      content: "",
    };

    const previousMessages = activeChat?.messages || [];

    const context = [...previousMessages, userMessage]
      .filter(
        (message) =>
          !message.failed &&
          !message.demo &&
          message.content.trim(),
      )
      .slice(-24)
      .map(({ role, content }) => ({
        role,
        content: content.slice(0, 12000),
      }));

    if (activeChat) {
      setChats((current) =>
        current.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  userMessage,
                  assistantMessage,
                ],
              }
            : chat,
        ),
      );
    } else {
      setChats((current) => [
        {
          id: chatId,
          title: text.slice(0, 48),
          messages: [userMessage, assistantMessage],
        },
        ...current,
      ]);

      setActiveId(chatId);
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    let answer = "";

    try {
      if (!API_ENABLED) {
        answer =
          "Kikial đã nhận được tin nhắn của bạn.\n\n" +
          "Đây là chế độ demo giao diện, chưa kết nối AI thật. " +
          "Bạn có thể thử tạo hội thoại, tìm lịch sử, sao chép và xóa chat.\n\n" +
          "Để chat với AI, cần backend POST /api/chat và chuyển " +
          "API_ENABLED thành true trong App.jsx.";

        updateReply(chatId, replyId, {
          content: answer,
          demo: true,
        });
      } else {
        await requestReply(
          context,
          controller.signal,
          (fullText) => {
            answer = fullText;

            updateReply(chatId, replyId, {
              content: fullText,
            });
          },
        );
      }
    } catch (error) {
      controller.abort();

      const message =
        error.name === "AbortError"
          ? "Đã dừng phản hồi."
          : error.message || "Không thể gửi tin nhắn.";

      setNotice(message);

      updateReply(chatId, replyId, {
        content: answer
          ? `${answer}\n\n[${message}]`
          : message,
        failed: true,
      });
    } finally {
      busyRef.current = false;
      controllerRef.current = null;
      setBusy(false);

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }

  return (
    <div style={{ display: "flex", width: "100%", height: "100dvh" }}>
      {menuOpen && (
        <div
          className="overlay"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand-row">
          <a
            href="#"
            className="brand"
            onClick={(event) => {
              event.preventDefault();
              newChat();
            }}
          >
            <span className="brand-icon">✳</span>
            kikial<span className="brand-dot">.</span>
          </a>

          <button
            type="button"
            className="icon-button mobile-only"
            onClick={() => setMenuOpen(false)}
            aria-label="Đóng menu"
          >
            ×
          </button>
        </div>

        <button
          type="button"
          className="new-chat"
          onClick={newChat}
          disabled={busy}
        >
          <span>＋</span>
          Cuộc trò chuyện mới
        </button>

        <div className="search-box">
          <span aria-hidden="true">⌕</span>

          <input
            type="search"
            placeholder="Tìm cuộc trò chuyện"
            aria-label="Tìm cuộc trò chuyện"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="section-heading">
          <span>GẦN ĐÂY</span>
          <span>{chats.length}</span>
        </div>

        <nav className="history" aria-label="Lịch sử chat">
          {filteredChats.length === 0 ? (
            <p className="history-empty">
              {search.trim()
                ? "Không tìm thấy cuộc trò chuyện."
                : "Những cuộc trò chuyện của bạn sẽ xuất hiện tại đây."}
            </p>
          ) : (
            filteredChats.map((chat) => (
              <button
                type="button"
                key={chat.id}
                className={`history-item ${
                  chat.id === activeId ? "active" : ""
                }`}
                onClick={() => openChat(chat.id)}
                disabled={busy}
                title={chat.title}
              >
                <span aria-hidden="true">◷</span>
                <span>{chat.title}</span>
              </button>
            ))
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="private-card">
            <span className="private-icon">◇</span>

            <div>
              <strong>Không gian của bạn</strong>
              <p>Lịch sử lưu trên trình duyệt</p>
            </div>
          </div>

          <div className="profile">
            <div className="profile-avatar">Đ</div>

            <div className="profile-info">
              <strong>Nguyễn Nghị Đức</strong>
              <span>Không gian cá nhân</span>
            </div>

            <span className="profile-badge">LOCAL</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button mobile-only"
              onClick={() => setMenuOpen(true)}
              aria-label="Mở menu"
              aria-expanded={menuOpen}
            >
              ☰
            </button>

            <div className="model-label">
              <span>Kikial</span>
              <span className="model-badge">AI ASSISTANT</span>
            </div>
          </div>

          <div className="topbar-right">
            <span className="connection">
              <span className="status-dot" />
              {API_ENABLED ? "Chế độ kết nối API" : "Giao diện demo"}
            </span>

            <button
              type="button"
              className="icon-button"
              onClick={deleteChat}
              disabled={busy || !activeChat}
              title="Xóa cuộc trò chuyện"
              aria-label="Xóa cuộc trò chuyện"
            >
              ⌫
            </button>
          </div>
        </header>

        <section className="conversation" ref={conversationRef}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-tag">
                <span>✦</span>
                MỘT CHÚT TÒ MÒ, VÔ VÀN KHẢ NĂNG
              </div>

              <div className="hero-icon">✳</div>

              <h1>
                Ý tưởng của bạn.
                <br />
                <span>Khởi đầu cùng Kikial.</span>
              </h1>

              <p className="welcome-description">
                Từ một câu hỏi nhỏ đến ý tưởng lớn.
                <br />
                Cùng học, cùng viết, cùng làm điều thú vị.
              </p>

              <div className="suggestions">
                {SUGGESTIONS.map((item) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={item.title}
                    onClick={() => {
                      setInput(item.prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    <span className={`suggestion-icon ${item.color}`}>
                      {item.icon}
                    </span>

                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                    <span className="suggestion-arrow">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`message ${message.role}`}
                >
                  <div
                    className={`message-avatar ${
                      message.role === "user" ? "user-avatar" : ""
                    }`}
                  >
                    {message.role === "user" ? "Đ" : "✳"}
                  </div>

                  <div className="message-body">
                    <strong className="message-name">
                      {message.role === "user" ? "Bạn" : "Kikial"}
                    </strong>

                    <div className="message-text">
                      {message.content || "Đang suy nghĩ…"}
                    </div>

                    {message.role === "assistant" &&
                      Boolean(message.content) && (
                        <button
                          type="button"
                          className="copy-button"
                          onClick={() => copyMessage(message)}
                        >
                          {copiedId === message.id
                            ? "✓ Đã sao chép"
                            : "⧉ Sao chép"}
                        </button>
                      )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="composer-area">
          <div className="notice" role="status">
            {notice}
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <label className="sr-only" htmlFor="prompt">
              Tin nhắn cho Kikial
            </label>

            <textarea
              id="prompt"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Hỏi Kikial bất cứ điều gì..."
              rows={1}
              maxLength={12000}
              disabled={busy}
              required
            />

            <div className="composer-bottom">
              <span className="composer-hint">
                <span>✦</span>
                Không gian cho mọi ý tưởng
              </span>

              <div className="composer-actions">
                <span className="keyboard-hint">Enter ↵</span>

                {busy ? (
                  <button
                    type="button"
                    className="send-button stop-button"
                    onClick={() => controllerRef.current?.abort()}
                    aria-label="Dừng phản hồi"
                  >
                    ■
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send-button"
                    disabled={!input.trim()}
                    aria-label="Gửi tin nhắn"
                  >
                    ↑
                  </button>
                )}
              </div>
            </div>
          </form>

          <p className="disclaimer">
            Kikial có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.
          </p>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(() =>
    localStorage.getItem("kikial-token") ? "chat" : "login",
  );
  const [user, setUser] = useState(null);

  function handleSuccess(nextUser) {
    setUser(nextUser);
    setPage(nextUser?.role === "admin" ? "admin" : "chat");
  }

  function handleLogout() {
    localStorage.removeItem("kikial-token");
    setUser(null);
    setPage("login");
  }

  if (page === "register") {
    return <Register onSuccess={handleSuccess} onLogin={() => setPage("login")} />;
  }

  if (page === "login") {
    return <Login onSuccess={handleSuccess} onRegister={() => setPage("register")} />;
  }

  if (page === "admin") {
    return <AdminPage user={user} onBack={() => setPage("chat")} onLogout={handleLogout} />;
  }

  return <ChatPage user={user} onLogout={handleLogout} onOpenAdmin={() => setPage("admin")} />;
}