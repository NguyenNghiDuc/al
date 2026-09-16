import { useEffect, useRef, useState } from "react";
import AdminPage from "./Admin";
import { api } from "../services/api";
import "../styles/workspace.css";

const MENU = [
  ["chat", "▣", "Chat"],
  ["explore", "◉", "Khám phá"],
  ["knowledge", "◇", "Thư viện kiến thức"],
  ["history", "◷", "Lịch sử trò chuyện"],
  ["practice", "♧", "Bài tập & Luyện tập"],
  ["tools", "⚯", "Công cụ AI"],
  ["settings", "⚙", "Cài đặt"],
];

const PROMPTS = [
  ["Viết code", "Giải thích async/await trong JavaScript kèm ví dụ."],
  ["Học tiếng Anh", "Lập kế hoạch học tiếng Anh 30 phút mỗi ngày."],
  ["Ý tưởng AI", "Gợi ý 5 đồ án AI phù hợp sinh viên CNTT."],
  ["Sửa lỗi Flutter", "Hướng dẫn kiểm tra lỗi Dio không kết nối backend."],
];

const QUESTIONS = [
  {
    question: "Trong Dart, từ khóa nào chờ một Future hoàn thành?",
    options: ["await", "class", "import", "return"],
    answer: 0,
    explanation: "await chờ kết quả của Future bên trong hàm async.",
  },
  {
    question: "HTTP 401 thường cho biết điều gì?",
    options: [
      "Thành công",
      "Chưa xác thực hoặc thông tin xác thực không hợp lệ",
      "Không tìm thấy tài nguyên",
      "Lỗi máy chủ",
    ],
    answer: 1,
    explanation:
      "401 liên quan đến xác thực; 403 là bị từ chối quyền truy cập.",
  },
  {
    question: "Trong React, hook nào quản lý state của component?",
    options: ["useRef", "useEffect", "useState", "useContextOnly"],
    answer: 2,
    explanation:
      "useState trả về giá trị state và hàm cập nhật state.",
  },
];

const SOURCES = {
  ai: "Mô hình AI",
  knowledge: "Kho kiến thức",
  calc: "Bộ tính toán",
  canned: "Câu trả lời dự phòng",
};

const TOOL_INSTRUCTIONS = {
  summary: "Tóm tắt văn bản sau thành các ý chính:",
  explain: "Giải thích văn bản sau một cách dễ hiểu:",
  translate: "Dịch văn bản sau sang tiếng Anh:",
  quiz: "Tạo 5 câu trắc nghiệm từ văn bản sau, kèm đáp án và giải thích:",
};

function readStored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function loadChats(key) {
  const saved = readStored(key, []);

  if (!Array.isArray(saved)) return [];

  return saved.filter(
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
}

/* Kiểm tra tài khoản trước khi mở workspace. */
export default function Chat({ user, onLogout }) {
  const [restoredUser, setRestoredUser] = useState(null);
  const [checking, setChecking] = useState(!user?.email);
  const [authError, setAuthError] = useState("");
  const [retry, setRetry] = useState(0);

  const account = user?.email ? user : restoredUser;

  useEffect(() => {
    if (user?.email) {
      setChecking(false);
      setAuthError("");
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    async function restoreAccount() {
      setChecking(true);
      setAuthError("");
      setRestoredUser(null);

      try {
        const token = localStorage.getItem("kikial-token");

        if (!token) {
          throw new Error("Bạn chưa đăng nhập hoặc phiên đăng nhập đã kết thúc.");
        }

        const result = await api("/api/auth/me", {
          signal: controller.signal,
        });

        if (!result.user?.email) {
          throw new Error("Backend chưa trả về thông tin tài khoản hợp lệ.");
        }

        if (active) setRestoredUser(result.user);
      } catch (error) {
        if (!active) return;

        if (error.status === 401) {
          localStorage.removeItem("kikial-token");
        }

        setAuthError(
          error.name === "AbortError"
            ? "Máy chủ phản hồi quá lâu. Hãy kiểm tra backend."
            : error.status === 404
              ? "Backend chưa có GET /api/auth/me. Thêm API rồi khởi động lại backend."
              : error.message,
        );
      } finally {
        clearTimeout(timer);
        if (active) setChecking(false);
      }
    }

    restoreAccount();

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [user?.email, retry]);

  function logout() {
    localStorage.removeItem("kikial-token");
    setRestoredUser(null);

    if (typeof onLogout === "function") {
      onLogout();
    } else {
      window.location.reload();
    }
  }

  if (!account?.email) {
    return (
      <div className="ki-loading">
        <h2>Kikial</h2>

        {checking ? (
          <p>Đang tải tài khoản…</p>
        ) : (
          <>
            <p role="alert">{authError || "Chưa tải được tài khoản."}</p>

            <button onClick={() => setRetry((value) => value + 1)}>
              Thử lại
            </button>

            <button onClick={logout}>Về đăng nhập</button>
          </>
        )}
      </div>
    );
  }

  return (
    <ChatWorkspace
      key={account.email}
      user={account}
      onLogout={logout}
    />
  );
}

/* Các hooks của workspace chỉ chạy khi đã có tài khoản. */
function ChatWorkspace({ user, onLogout }) {
  const chatKey = `kikial-chats:${user.email}`;
  const settingsKey = `kikial-settings:${user.email}`;
  const displayName = user.name?.trim() || user.email;

  const [page, setPage] = useState("chat");
  const [menuOpen, setMenuOpen] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState(null);
  const [healthChecking, setHealthChecking] = useState(false);

  const [chats, setChats] = useState(() => loadChats(chatKey));
  const [activeId, setActiveId] = useState(null);

  const [settings, setSettings] = useState(() => {
    const saved = readStored(settingsKey, {});

    return {
      fontSize: [14, 16, 18].includes(saved?.fontSize)
        ? saved.fontSize
        : 16,
      autoScroll: saved?.autoScroll !== false,
    };
  });

  const [answers, setAnswers] = useState({});
  const [graded, setGraded] = useState(false);

  const [tool, setTool] = useState("summary");
  const [toolText, setToolText] = useState("");
  const [fileName, setFileName] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [webQuery, setWebQuery] = useState("");

  const controllerRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const forceBottomRef = useRef(false);

  const activeChat = chats.find((chat) => chat.id === activeId);
  const messages = activeChat?.messages || [];

  const filteredChats = chats.filter((chat) =>
    chat.title
      .toLocaleLowerCase("vi")
      .includes(query.trim().toLocaleLowerCase("vi")),
  );

  useEffect(() => {
    mountedRef.current = true;

    function handleEscape(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (busy) return;

    try {
      localStorage.setItem(chatKey, JSON.stringify(chats));
    } catch {
      setNotice("Không lưu được lịch sử. Bộ nhớ trình duyệt có thể đã đầy.");
    }
  }, [chats, busy, chatKey]);

  useEffect(() => {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
    } catch {
      setNotice("Không lưu được cài đặt.");
    }
  }, [settings, settingsKey]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let active = true;

    api("/api/health", { signal: controller.signal })
      .then((result) => {
        if (active) setHealth(result);
      })
      .catch(() => {
        if (active) setHealth({ ok: false });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || page !== "chat") return;

    const shouldScroll =
      forceBottomRef.current ||
      (settings.autoScroll && nearBottomRef.current);

    if (shouldScroll) {
      element.scrollTop = element.scrollHeight;
      nearBottomRef.current = true;
    }

    forceBottomRef.current = false;
  }, [page, activeId, messages.length, busy, settings.autoScroll]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 170)}px`;
  }, [input, page]);

  useEffect(() => {
    if (!imageFile) {
      setImageUrl("");
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function navigate(nextPage) {
    setPage(nextPage);
    setMenuOpen(false);
    setNotice("");

    if (nextPage === "chat") {
      forceBottomRef.current = true;
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }

  function newChat() {
    if (busyRef.current) return;

    setActiveId(null);
    setInput("");
    forceBottomRef.current = true;
    navigate("chat");

    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function preparePrompt(text) {
    if (busyRef.current) {
      setNotice("Hãy chờ phản hồi hiện tại hoặc bấm Dừng trước.");
      return;
    }

    setInput(text);
    navigate("chat");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function openChat(id) {
    if (busyRef.current) return;

    setActiveId(id);
    setInput("");
    forceBottomRef.current = true;
    navigate("chat");
  }

  function removeChat(id) {
    if (busyRef.current) return;
    if (!window.confirm("Xóa cuộc trò chuyện này khỏi trình duyệt?")) return;

    setChats((current) => current.filter((chat) => chat.id !== id));

    if (activeId === id) setActiveId(null);
  }

  function renameChat(chat) {
    const title = window.prompt("Tên cuộc trò chuyện:", chat.title);
    if (!title?.trim()) return;

    setChats((current) =>
      current.map((item) =>
        item.id === chat.id
          ? { ...item, title: title.trim().slice(0, 100) }
          : item,
      ),
    );
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      if (mountedRef.current) setNotice("Đã sao chép.");
    } catch {
      if (mountedRef.current) {
        setNotice("Không sao chép được. Hãy bôi đen rồi nhấn Ctrl + C.");
      }
    }
  }

  async function refreshHealth() {
    if (healthChecking) return;
    setHealthChecking(true);

    try {
      const result = await api("/api/health");

      if (mountedRef.current) {
        setHealth(result);
        setNotice("Đã kiểm tra backend.");
      }
    } catch (error) {
      if (mountedRef.current) {
        setHealth({ ok: false });
        setNotice(error.message);
      }
    } finally {
      if (mountedRef.current) setHealthChecking(false);
    }
  }

  function addAnswer(chatId, content, extra = {}) {
    setChats((current) =>
      current.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content,
                  ...extra,
                },
              ],
            }
          : chat,
      ),
    );
  }

  async function sendMessage(event) {
    event?.preventDefault();

    const question = input.trim();
    if (!question || busyRef.current) return;

    if (question.length > 12000) {
      setNotice("Tin nhắn tối đa 12.000 ký tự.");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setNotice("");
    setInput("");

    const id = activeChat?.id || crypto.randomUUID();

    const history = messages
      .filter((message) => !message.failed)
      .slice(-12)
      .map(({ role, content }) => ({ role, content }));

    const questionMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };

    if (activeChat) {
      setChats((current) =>
        current.map((chat) =>
          chat.id === id
            ? { ...chat, messages: [...chat.messages, questionMessage] }
            : chat,
        ),
      );
    } else {
      setChats((current) => [
        {
          id,
          title: question.slice(0, 60),
          createdAt: new Date().toISOString(),
          messages: [questionMessage],
        },
        ...current,
      ]);

      setActiveId(id);
    }

    forceBottomRef.current = true;
    nearBottomRef.current = true;

    const controller = new AbortController();
    controllerRef.current = controller;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 180000);

    try {
      const result = await api("/api/chat", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          message: question,
          history,
        }),
      });

      if (!mountedRef.current) return;

      if (typeof result.answer !== "string" || !result.answer.trim()) {
        throw new Error("Backend chưa trả câu trả lời hợp lệ.");
      }

      addAnswer(id, result.answer, {
        source: result.source,
        learnedId: result.learnedId,
      });
    } catch (error) {
      if (!mountedRef.current) return;

      const message = controller.signal.aborted
        ? timedOut
          ? "Hết thời gian chờ phản hồi."
          : "Đã dừng chờ phản hồi."
        : error.message || "Không kết nối được backend.";

      addAnswer(id, message, { failed: true });
      setNotice(message);
    } finally {
      clearTimeout(timer);
      controllerRef.current = null;
      busyRef.current = false;

      if (mountedRef.current) {
        setBusy(false);

        api("/api/health")
          .then((result) => {
            if (mountedRef.current) setHealth(result);
          })
          .catch(() => {});

        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  }

  async function readTextFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!/\.(txt|md|csv|json)$/i.test(file.name)) {
      setNotice("Chỉ hỗ trợ TXT, MD, CSV và JSON.");
      return;
    }

    if (file.size > 300000) {
      setNotice("Chọn file nhỏ hơn 300 KB.");
      return;
    }

    try {
      const text = await file.text();
      if (!mountedRef.current) return;

      if (text.length > 10000) {
        setNotice("File dài quá 10.000 ký tự. Hãy chia thành phần nhỏ.");
        return;
      }

      setToolText(text);
      setFileName(file.name);
      setNotice(`Đã đọc ${file.name}. Chọn tác vụ rồi đưa sang chat.`);
    } catch {
      if (mountedRef.current) setNotice("Không đọc được file.");
    }
  }

  function chooseImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5000000
    ) {
      setNotice("Chọn ảnh PNG, JPG hoặc WebP nhỏ hơn 5 MB.");
      return;
    }

    setImageFile(file);
    setNotice("Ảnh chỉ được xem trước trên máy, chưa gửi cho AI.");
  }

  function runTool(event) {
    event.preventDefault();
    if (!toolText.trim()) return;

    preparePrompt(`${TOOL_INSTRUCTIONS[tool]}\n\n${toolText.trim()}`);
  }

  function logout() {
    if (busyRef.current) controllerRef.current?.abort();
    onLogout();
  }

  const score = QUESTIONS.reduce(
    (total, question, index) =>
      total + (answers[index] === question.answer ? 1 : 0),
    0,
  );

  return (
    <div
      className="ki-shell"
      style={{ "--ki-font": `${settings.fontSize}px` }}
    >
      {menuOpen && (
        <div
          className="ki-overlay"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`ki-sidebar ${menuOpen ? "ki-open" : ""}`}>
        <div className="ki-brand">
          <strong>✦ Kikial.</strong>

          <button
            type="button"
            className="ki-mobile"
            onClick={() => setMenuOpen(false)}
            aria-label="Đóng menu"
          >
            ×
          </button>
        </div>

        <button
          type="button"
          className="ki-primary"
          onClick={newChat}
          disabled={busy}
        >
          ＋ Cuộc trò chuyện mới
        </button>

        <nav className="ki-nav" aria-label="Menu chính">
          {MENU.map(([id, icon, label]) => (
            <button
              type="button"
              key={id}
              className={page === id ? "ki-selected" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="ki-profile">
          <strong>{displayName}</strong>
          <small>{user.email}</small>
          <button type="button" onClick={logout}>
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="ki-main">
        <header className="ki-header">
          <div className="ki-actions">
            <button
              type="button"
              className="ki-mobile"
              onClick={() => setMenuOpen(true)}
              aria-label="Mở menu"
              aria-expanded={menuOpen}
            >
              ☰
            </button>

            <div>
              <h1>{MENU.find(([id]) => id === page)?.[2]}</h1>
              <small>Chào {displayName} 👋</small>
            </div>
          </div>

          <button type="button" onClick={() => navigate("settings")}>
            {health === null
              ? "Đang kết nối…"
              : health.ok
                ? "● Backend hoạt động"
                : "○ Mất kết nối"}
          </button>
        </header>

        {notice && (
          <div className="ki-notice" role="status">
            <span>{notice}</span>

            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Đóng thông báo"
            >
              ×
            </button>
          </div>
        )}

        <div
          className="ki-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            if (page !== "chat") return;

            const element = event.currentTarget;

            nearBottomRef.current =
              element.scrollHeight -
                element.scrollTop -
                element.clientHeight <
              100;
          }}
        >
          <div className="ki-content">
            {/* CHAT */}
            {page === "chat" && (
              <>
                {messages.length === 0 ? (
                  <div className="ki-welcome">
                    <span>✦</span>
                    <h2>Bắt đầu một điều thú vị.</h2>
                    <p>Hôm nay bạn muốn học, viết hay khám phá điều gì?</p>

                    <div className="ki-grid">
                      {PROMPTS.map(([title, prompt]) => (
                        <button
                          type="button"
                          key={title}
                          disabled={busy}
                          onClick={() => preparePrompt(prompt)}
                        >
                          {title} ↗
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="ki-list">
                    {messages.map((message) => (
                      <article
                        key={message.id}
                        className={`ki-bubble ki-${message.role}`}
                      >
                        <strong>
                          {message.role === "user" ? "Bạn" : "✦ Kikial"}
                        </strong>

                        <div className="ki-answer">
                          {message.content}
                        </div>

                        {message.role === "assistant" && (
                          <div className="ki-actions">
                            <button
                              type="button"
                              onClick={() => copy(message.content)}
                            >
                              Sao chép
                            </button>

                            <small>
                              {message.failed
                                ? "Yêu cầu chưa hoàn thành"
                                : SOURCES[message.source] || ""}
                            </small>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}

                {busy && (
                  <p className="ki-muted" role="status">
                    Kikial đang xử lý…
                  </p>
                )}
              </>
            )}

            {/* KHÁM PHÁ */}
            {page === "explore" && (
              <>
                <h2>Khám phá cùng Kikial</h2>
                <p className="ki-muted">
                  Chọn chủ đề để điền câu hỏi vào chat.
                </p>

                <div className="ki-grid">
                  {PROMPTS.map(([title, prompt]) => (
                    <button
                      type="button"
                      className="ki-card"
                      key={title}
                      disabled={busy}
                      onClick={() => preparePrompt(prompt)}
                    >
                      <h3>{title}</h3>
                      <p>{prompt}</p>
                      <span>Mở trong chat ↗</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* THƯ VIỆN */}
            {page === "knowledge" && (
              <AdminPage
                user={user}
                embedded
                onBack={() => navigate("chat")}
                onLogout={logout}
              />
            )}

            {/* LỊCH SỬ */}
            {page === "history" && (
              <>
                <h2>Lịch sử trò chuyện</h2>

                <p className="ki-muted">
                  Lưu trên trình duyệt này, riêng theo email tài khoản.
                </p>

                <input
                  aria-label="Tìm hội thoại"
                  placeholder="Tìm theo tiêu đề…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />

                <div className="ki-list ki-space">
                  {filteredChats.length === 0 ? (
                    <p>Không có cuộc trò chuyện phù hợp.</p>
                  ) : (
                    filteredChats.map((chat) => (
                      <article className="ki-card" key={chat.id}>
                        <h3>{chat.title}</h3>

                        <p className="ki-muted">
                          {chat.messages.length} tin nhắn
                        </p>

                        <div className="ki-actions">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openChat(chat.id)}
                          >
                            Mở lại
                          </button>

                          <button
                            type="button"
                            onClick={() => renameChat(chat)}
                          >
                            Đổi tên
                          </button>

                          <button
                            type="button"
                            className="ki-danger"
                            disabled={busy}
                            onClick={() => removeChat(chat.id)}
                          >
                            Xóa
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </>
            )}

            {/* BÀI TẬP */}
            {page === "practice" && (
              <>
                <h2>Luyện tập CNTT</h2>

                <form
                  className="ki-list"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setGraded(true);
                  }}
                >
                  {QUESTIONS.map((question, index) => (
                    <fieldset className="ki-card" key={question.question}>
                      <legend>
                        {index + 1}. {question.question}
                      </legend>

                      {question.options.map((option, optionIndex) => (
                        <label className="ki-option" key={option}>
                          <input
                            type="radio"
                            name={`question-${index}`}
                            checked={answers[index] === optionIndex}
                            disabled={graded}
                            required
                            onChange={() =>
                              setAnswers((current) => ({
                                ...current,
                                [index]: optionIndex,
                              }))
                            }
                          />

                          {option}
                        </label>
                      ))}

                      {graded && (
                        <p>
                          {answers[index] === question.answer
                            ? "✓ Đúng."
                            : "✗ Sai."}
                          {" "}Đáp án: {question.options[question.answer]}.
                          {" "}{question.explanation}
                        </p>
                      )}
                    </fieldset>
                  ))}

                  <div className="ki-actions">
                    <button
                      type="submit"
                      className="ki-primary"
                      disabled={graded}
                    >
                      Chấm điểm
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAnswers({});
                        setGraded(false);
                      }}
                    >
                      Làm lại
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        preparePrompt(
                          "Tạo 5 câu hỏi trắc nghiệm Dart mới, " +
                          "để đáp án và giải thích ở cuối.",
                        )
                      }
                    >
                      Nhờ AI tạo bài khác
                    </button>
                  </div>

                  {graded && (
                    <h3>Kết quả: {score}/{QUESTIONS.length}</h3>
                  )}
                </form>
              </>
            )}

            {/* CÔNG CỤ */}
            {page === "tools" && (
              <div className="ki-list">
                <h2>Công cụ AI</h2>

                <form
                  className="ki-card ki-list"
                  onSubmit={runTool}
                >
                  <h3>Làm việc với văn bản</h3>

                  <label>
                    Tác vụ

                    <select
                      value={tool}
                      onChange={(event) => setTool(event.target.value)}
                    >
                      <option value="summary">Tóm tắt</option>
                      <option value="explain">Giải thích</option>
                      <option value="translate">Dịch sang tiếng Anh</option>
                      <option value="quiz">Tạo bài tập</option>
                    </select>
                  </label>

                  <label>
                    Đọc file TXT, MD, CSV hoặc JSON

                    <input
                      type="file"
                      accept=".txt,.md,.csv,.json"
                      onChange={readTextFile}
                    />
                  </label>

                  {fileName && (
                    <small>Đã chọn: {fileName}</small>
                  )}

                  <textarea
                    aria-label="Nội dung cần xử lý"
                    rows={9}
                    maxLength={10000}
                    placeholder="Dán nội dung ở đây…"
                    value={toolText}
                    onChange={(event) => setToolText(event.target.value)}
                    required
                  />

                  <div className="ki-actions">
                    <button
                      type="submit"
                      className="ki-primary"
                      disabled={busy || !toolText.trim()}
                    >
                      Đưa sang chat để gửi
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setToolText("");
                        setFileName("");
                      }}
                    >
                      Xóa nội dung
                    </button>
                  </div>
                </form>

                <div className="ki-card">
                  <h3>Tìm kiếm web</h3>

                  <p className="ki-muted">
                    Mở kết quả ở tab mới. Kikial chưa tự đọc kết quả web.
                  </p>

                  <input
                    aria-label="Từ khóa tìm kiếm web"
                    value={webQuery}
                    onChange={(event) => setWebQuery(event.target.value)}
                    placeholder="Nhập từ khóa…"
                  />

                  {webQuery.trim() && (
                    <a
                      className="ki-link"
                      href={
                        "https://www.google.com/search?q=" +
                        encodeURIComponent(webQuery.trim())
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Tìm kiếm ↗
                    </a>
                  )}
                </div>

                <div className="ki-card">
                  <h3>Xem trước ảnh</h3>

                  <p className="ki-muted">
                    Backend hiện nhận văn bản, chưa phân tích nội dung ảnh.
                  </p>

                  <input
                    aria-label="Chọn ảnh xem trước"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={chooseImage}
                  />

                  {imageUrl && (
                    <>
                      <img
                        className="ki-preview"
                        src={imageUrl}
                        alt={imageFile?.name || "Ảnh vừa chọn"}
                      />

                      <button
                        type="button"
                        onClick={() => setImageFile(null)}
                      >
                        Bỏ ảnh
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* CÀI ĐẶT */}
            {page === "settings" && (
              <div className="ki-list">
                <h2>Cài đặt</h2>

                <div className="ki-card">
                  <h3>Tài khoản</h3>
                  <p>{displayName}</p>
                  <p>{user.email}</p>

                  <p>
                    Vai trò:{" "}
                    {user.role === "admin"
                      ? "Quản trị viên"
                      : "Người dùng"}
                  </p>

                  <button type="button" onClick={logout}>
                    Đăng xuất
                  </button>
                </div>

                <div className="ki-card ki-list">
                  <label>
                    Cỡ chữ hội thoại

                    <select
                      value={settings.fontSize}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          fontSize: Number(event.target.value),
                        }))
                      }
                    >
                      <option value={14}>Nhỏ — 14px</option>
                      <option value={16}>Vừa — 16px</option>
                      <option value={18}>Lớn — 18px</option>
                    </select>
                  </label>

                  <label className="ki-option">
                    <input
                      type="checkbox"
                      checked={settings.autoScroll}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          autoScroll: event.target.checked,
                        }))
                      }
                    />

                    Tự cuộn khi có phản hồi nếu đang ở gần cuối chat
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        fontSize: 16,
                        autoScroll: true,
                      })
                    }
                  >
                    Khôi phục cài đặt mặc định
                  </button>
                </div>

                <div className="ki-card">
                  <h3>Trạng thái backend</h3>

                  <p>
                    {health?.ok
                      ? "Kết nối thành công"
                      : "Chưa kết nối"}
                  </p>

                  <p>
                    Kho gốc: {health?.knowledgeItems ?? "—"}
                    {" · "}
                    Tự học: {health?.learnedItems ?? "—"}
                    {" · "}
                    Chờ duyệt: {health?.pendingItems ?? "—"}
                  </p>

                  <p className="ki-muted">
                    Backend hoạt động không đồng nghĩa mô hình AI đã kết nối.
                    Nguồn phản hồi được ghi dưới từng câu trả lời.
                  </p>

                  <button
                    type="button"
                    disabled={healthChecking}
                    onClick={refreshHealth}
                  >
                    {healthChecking ? "Đang kiểm tra…" : "Kiểm tra lại"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ô nhập chỉ hiển thị ở trang chat */}
        {page === "chat" && (
          <footer className="ki-composer">
            <form onSubmit={sendMessage}>
              <textarea
                ref={inputRef}
                aria-label="Tin nhắn"
                placeholder="Nhắn cho Kikial…"
                rows={2}
                maxLength={12000}
                value={input}
                disabled={busy}
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
              />

              <div className="ki-toolbar">
                <div className="ki-actions">
                  <button
                    type="button"
                    onClick={() => navigate("tools")}
                  >
                    ＋ File & công cụ
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("practice")}
                  >
                    Luyện tập
                  </button>
                </div>

                {busy ? (
                  <button
                    type="button"
                    onClick={() => controllerRef.current?.abort()}
                  >
                    ■ Dừng
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="ki-primary"
                    disabled={!input.trim()}
                  >
                    Gửi ➤
                  </button>
                )}
              </div>
            </form>

            <small>
              Enter để gửi · Shift + Enter xuống dòng
            </small>
          </footer>
        )}
      </main>
    </div>
  );
}