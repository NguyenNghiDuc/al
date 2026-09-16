import { useEffect, useState } from "react";
import { api } from "../services/api";

export default function AdminPage({
  user,
  onBack,
  onLogout,
  embedded = false,
}) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function loadKnowledge() {
    setLoading(true);
    setError("");

    try {
      const result = await api("/api/admin/knowledge");
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") {
      loadKnowledge();
    } else {
      setLoading(false);
    }
  }, [user?.role]);

  async function updateItem(item, action) {
    if (busyId) return;

    if (
      action === "delete" &&
      !window.confirm(`Xóa kiến thức: "${item.question}"?`)
    ) {
      return;
    }

    setBusyId(item.id);
    setError("");

    try {
      if (action === "delete") {
        await api(
          `/api/admin/knowledge/${encodeURIComponent(item.id)}`,
          { method: "DELETE" },
        );
      } else {
        await api("/api/admin/knowledge/verify", {
          method: "POST",
          body: JSON.stringify({
            id: item.id,
            verified: true,
          }),
        });
      }

      // Tải lại để số lượng và trạng thái khớp backend.
      await loadKnowledge();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("vi");

  const visibleItems = items.filter((item) => {
    const text = `${item.question || ""} ${item.answer || ""}`
      .toLocaleLowerCase("vi");

    const matchesFilter =
      filter === "all" ||
      (filter === "verified" && item.verified) ||
      (filter === "pending" && !item.verified);

    return matchesFilter && text.includes(normalizedQuery);
  });

  const pending = items.filter((item) => !item.verified).length;

  return (
    <section className={embedded ? "ki-library" : "ki-library ki-library-full"}>
      <div className="ki-toolbar">
        <div>
          <h2>Thư viện kiến thức</h2>
          <p className="ki-muted">
            {items.length} bản ghi · {pending} chờ duyệt
          </p>
        </div>

        <div className="ki-actions">
          {!embedded && onBack && (
            <button onClick={onBack}>Về chat</button>
          )}

          {user?.role === "admin" && (
            <button
              onClick={loadKnowledge}
              disabled={loading || Boolean(busyId)}
            >
              {loading ? "Đang tải…" : "↻ Làm mới"}
            </button>
          )}

          {!embedded && onLogout && (
            <button onClick={onLogout}>Đăng xuất</button>
          )}
        </div>
      </div>

      {user?.role !== "admin" ? (
        <div className="ki-card">
          Kho kiến thức hiện được backend giới hạn cho quản trị viên.
          Tài khoản của bạn vẫn có thể hỏi Kikial bằng trang Chat.
        </div>
      ) : (
        <>
          <div className="ki-toolbar">
            <input
              aria-label="Tìm kiến thức"
              placeholder="Tìm trong câu hỏi hoặc câu trả lời…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <select
              aria-label="Lọc trạng thái"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">Tất cả</option>
              <option value="pending">Chờ duyệt</option>
              <option value="verified">Đã duyệt</option>
            </select>
          </div>

          {error && <p className="ki-error" role="alert">{error}</p>}

          <p className="ki-muted">
            Hiển thị {visibleItems.length} / {items.length} bản ghi
          </p>

          {loading ? (
            <p>Đang tải kiến thức…</p>
          ) : visibleItems.length === 0 ? (
            <div className="ki-card">Không có kiến thức phù hợp.</div>
          ) : (
            <div className="ki-list">
              {visibleItems.map((item) => (
                <article className="ki-card" key={item.id}>
                  <div className="ki-actions">
                    <span className="ki-badge">
                      {item.verified ? "Đã duyệt" : "Chờ duyệt"}
                    </span>
                    <span className="ki-muted">
                      {item.hits || 0} lượt sử dụng
                    </span>
                  </div>

                  <h3>{item.question}</h3>

                  <details>
                    <summary>Xem / thu gọn câu trả lời</summary>
                    <div className="ki-answer">{item.answer}</div>
                  </details>

                  <div className="ki-actions ki-space">
                    {!item.verified && (
                      <button
                        disabled={Boolean(busyId)}
                        onClick={() => updateItem(item, "approve")}
                      >
                        Duyệt kiến thức
                      </button>
                    )}

                    <button
                      className="ki-danger"
                      disabled={Boolean(busyId)}
                      onClick={() => updateItem(item, "delete")}
                    >
                      {busyId === item.id ? "Đang xử lý…" : "Xóa"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}