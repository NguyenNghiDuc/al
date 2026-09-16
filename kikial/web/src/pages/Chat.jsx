import { useEffect, useState } from "react";

const MAX_LEARNED = 500;

const shortcuts = [
  [
    "⌘",
    "Cùng viết code",
    "Giải thích async/await trong JavaScript bằng ví dụ dễ hiểu.",
  ],
  [
    "◎",
    "Học điều mới",
    "Giúp tôi lập kế hoạch học tiếng Anh trong 30 ngày.",
  ],
  [
    "✧",
    "Khơi nguồn ý tưởng",
    "Gợi ý 5 ý tưởng ứng dụng AI cho đồ án sinh viên.",
  ],
  [
    "✎",
    "Viết thật hay",
    "Viết lời giới thiệu bản thân cho sinh viên CNTT.",
  ],
];

export default function Chat({ user, onLogout, onOpenAdmin }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const [learnedCount, setLearnedCount] = useState(0);
  const [healthLoading, setHealthLoading] = useState(true);

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("kikial-token") || ""}`,
  });

  // =========================
  // LẤY SỐ KIẾN THỨC ĐÃ HỌC
  // =========================
  async function loadHealth() {
    try {
      const response = await fetch("/api/health");

      if (!response.ok) {
        throw new Error("Không lấy được trạng thái AI.");
      }

      const data = await response.json();

      // Hỗ trợ một số tên field backend có thể trả về.
      const count =
        data.learnedItems ??
        data.learned ??
        data.learnedCount ??
        data.memoryCount ??
        data.knowledgeCount ??
        0;

      setLearnedCount(
        Math.min(
          Math.max(Number(count) || 0, 0),
          MAX_LEARNED,
        ),
      );
    } catch (error) {
      console.error("Lỗi lấy health:", error);
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    loadHealth();
  }, []);

  // =========================
  // GỬI TIN NHẮN
  // =========================
  async function sendMessage(event) {
    event?.preventDefault();

    const question = input.trim();

    if (!question || loading) {
      return;
    }

    const history = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const userMessage = {
      role: "user",
      content: question,
    };

    setMessages((current) => [
      ...current,
      userMessage,
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          message: question,
          history,
          userEmail: user?.email || "",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            result.error ||
            "Không thể trả lời.",
        );
      }

      const answer =
        result.answer ||
        result.message ||
        "Kikial chưa có câu trả lời.";

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: answer,
          learnedId: result.learnedId || null,
          source: result.source || "canned",
        },
      ]);

      // Backend đã lưu kiến thức xong thì lấy lại số thật.
      await loadHealth();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            error.message ||
            "Không thể kết nối với Kikial.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function sendFeedback(message, helpful) {
    if (!message.learnedId) return;

    await fetch("/api/chat/feedback", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ id: message.learnedId, helpful }),
    });

    setMessages((current) => current.map((item) =>
      item === message ? { ...item, feedback: helpful } : item,
    ));
  }

  // =========================
  // % KIẾN THỨC
  // =========================
  const knowledgePercent = Math.min(
    (learnedCount / MAX_LEARNED) * 100,
    100,
  );

  return (
    <div className="dashboard-shell">
      {/* ================= SIDEBAR ================= */}

      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <span>✦</span>

          <strong>Kikial.</strong>

          <small>AI luôn bên bạn</small>
        </div>

        <nav className="dashboard-nav">
          <button
            className="selected"
            type="button"
          >
            ▣ <span>Chat</span>
          </button>

          <button type="button">
            ◉ <span>Khám phá</span>
          </button>

          <button
            type="button"
            onClick={
              user?.role === "admin"
                ? onOpenAdmin
                : undefined
            }
          >
            ◇ <span>Thư viện kiến thức</span>
          </button>

          <button type="button">
            ◷ <span>Lịch sử trò chuyện</span>
          </button>

          <button type="button">
            ♧ <span>Bài tập & Luyện tập</span>
          </button>

          <button type="button">
            ⚯ <span>Công cụ AI</span>
          </button>

          <button type="button">
            ⚙ <span>Cài đặt</span>
          </button>
        </nav>

        <div className="dashboard-profile">
          <div className="profile-avatar">
            {user?.name?.[0] || "N"}
          </div>

          <div>
            <strong>
              {user?.name || "Nguyễn Nghị Đức"}
            </strong>

            <small>
              {user?.email ||
                "Không gian cá nhân"}
            </small>
          </div>

          <button
            type="button"
            className="profile-menu"
            onClick={onLogout}
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            ⋮
          </button>
        </div>
      </aside>

      {/* ================= MAIN ================= */}

      <main className="dashboard-main">
        {/* HEADER */}

        <header className="dashboard-header">
          <div>
            <h1>
              Chào{" "}
              {user?.name || "Nguyễn Nghị Đức"}! 👋
            </h1>

            <p>
              Hỏi bất cứ điều gì, mình luôn sẵn
              sàng giúp bạn.
            </p>
          </div>

          <div className="dashboard-actions">
            <span>
              <i /> Kikial Online
            </span>

            <button
              type="button"
              aria-label="Thông báo"
            >
              ♢
            </button>

            <button
              type="button"
              className="header-avatar"
            >
              {user?.name?.[0] || "N"}
            </button>
          </div>
        </header>

        {/* ================= CHAT ================= */}

        <section className="dashboard-conversation">
          {messages.length === 0 ? (
            <div className="dashboard-welcome">
              <span className="welcome-star">
                ✦
              </span>

              <h2>
                Bắt đầu một
                <br />

                <em>điều thú vị.</em>
              </h2>

              <p>
                Hôm nay bạn muốn học, viết hay
                khám phá điều gì?
              </p>
            </div>
          ) : (
            <div className="dashboard-messages">
              {messages.map(
                (message, index) => (
                  <article
                    className={`dashboard-message ${message.role}`}
                    key={`${message.role}-${index}`}
                  >
                    <div className="message-icon">
                      {message.role ===
                      "assistant"
                        ? "✦"
                        : user?.name?.[0] ||
                          "N"}
                    </div>

                    <div>
                      <strong>
                        {message.role ===
                        "assistant"
                          ? "Kikial"
                          : "Bạn"}
                      </strong>

                      <p>{message.content}</p>
                      {message.role === "assistant" && message.learnedId && (
                        <div className="message-feedback">
                          <button type="button" onClick={() => sendFeedback(message, true)} aria-label="Câu trả lời hữu ích">👍</button>
                          <button type="button" onClick={() => sendFeedback(message, false)} aria-label="Câu trả lời chưa hữu ích">👎</button>
                          {message.feedback && <small>Đã ghi nhận</small>}
                        </div>
                      )}
                    </div>
                  </article>
                ),
              )}

              {/* AI đang suy nghĩ */}

              {loading && (
                <article className="dashboard-message assistant">
                  <div className="message-icon">
                    ✦
                  </div>

                  <div>
                    <strong>Kikial</strong>
                    <p>Đang suy nghĩ...</p>
                  </div>
                </article>
              )}
            </div>
          )}
        </section>

        {/* ================= INPUT ================= */}

        <footer className="dashboard-composer-wrap">
          <form
            className="dashboard-composer"
            onSubmit={sendMessage}
          >
            <textarea
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
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
              placeholder="Nhắn cho Kikial..."
              rows={1}
              disabled={loading}
            />

            <div className="composer-tools">
              <button
                type="button"
                title="Thêm"
              >
                ＋
              </button>

              <button type="button">
                ▧ Tải ảnh
              </button>

              <button type="button">
                ◎ Tìm kiếm web
              </button>

              <button type="button">
                □ Phân tích file
              </button>

              <button type="button">
                ◇ Chế độ học
              </button>

              <button
                className="send-dashboard"
                type="submit"
                disabled={
                  loading || !input.trim()
                }
              >
                {loading ? "…" : "➤"}
              </button>
            </div>
          </form>

          <small>
            Kikial có thể mắc lỗi. Hãy kiểm tra
            thông tin quan trọng.
          </small>
        </footer>
      </main>

      {/* ================= RIGHT PANEL ================= */}

      <aside className="dashboard-insights">
        {/* ROBOT */}

        <div className="robot-card">
          <div className="robot">
            ◉
            <span>⌒</span>
          </div>

          <p>
            Tri thức hôm nay,
            <br />

            <em>
              một tương lai tốt đẹp hơn.
            </em>
          </p>
        </div>

        {/* SHORTCUT */}

        <div className="shortcut-grid">
          {shortcuts.map(
            ([icon, title, prompt]) => (
              <button
                type="button"
                key={title}
                onClick={() => {
                  setInput(prompt);
                }}
              >
                <b>{icon}</b>

                <span>{title}</span>
              </button>
            ),
          )}
        </div>

        {/* ================= KNOWLEDGE ================= */}

        <section className="knowledge-card">
          <div className="knowledge-title">
            <span>◉</span>

            <div>
              <strong>
                Kiến thức đã học
              </strong>

              <small>
                {healthLoading
                  ? "Đang tải..."
                  : `${learnedCount} / ${MAX_LEARNED} mẫu kiến thức`}
              </small>
            </div>

            <b>›</b>
          </div>

          <div className="progress">
            <i
              style={{
                width: `${knowledgePercent}%`,
              }}
            />
          </div>
        </section>

        {/* ================= ACTIVITY ================= */}

        <section className="activity-card">
          <strong>
            ✦ Hoạt động gần đây
          </strong>

          {[
            "Chương trình Dart tính tổng số chẵn",
            "Cách cài Flutter",
            "So sánh MySQL và SQLite",
            "Dấu hiệu 12 thì tiếng Anh",
          ].map((item, index) => (
            <p key={item}>
              <i />

              {item}

              <small>
                {index + 1} giờ
              </small>
            </p>
          ))}

          <button type="button">
            Xem tất cả ›
          </button>
        </section>
      </aside>
    </div>
  );
}