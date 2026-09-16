import { useEffect, useState } from "react";

export default function AdminPage({ user, onBack, onLogout }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("kikial-token") || ""}`,
  });

  async function loadKnowledge() {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/knowledge", { headers: authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Không tải được dữ liệu.");
      setItems(result.items || []);
      setError("");
    } catch (err) {
      setError(err.message || "Lỗi không xác định.");
    } finally {
      setLoading(false);
    }
  }

  async function removeKnowledge(id) {
    try {
      const response = await fetch(`/api/admin/knowledge/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Không xóa được dữ liệu.");
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message || "Không xóa được dữ liệu.");
    }
  }

  async function verifyKnowledge(id, promote = false) {
    try {
      const response = await fetch("/api/admin/knowledge/verify", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ id, verified: true, promote }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Không duyệt được dữ liệu.");
      await loadKnowledge();
    } catch (err) {
      setError(err.message || "Không duyệt được dữ liệu.");
    }
  }

  useEffect(() => {
    loadKnowledge();
  }, []);

  return (
    <main className="admin-page" style={{ padding: 24, color: "#e5e7eb" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <p style={{ margin: 0, color: "#8b5cf6", letterSpacing: 1.3, fontSize: 12, textTransform: "uppercase" }}>Admin dashboard</p>
            <h1 style={{ margin: "8px 0 0", fontSize: 32 }}>Kiến thức đã học</h1>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" onClick={onBack} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #374151", background: "#111827", color: "white", cursor: "pointer" }}>
              Về chat
            </button>
            <button type="button" onClick={onLogout} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #374151", background: "#7f1d1d", color: "white", cursor: "pointer" }}>
              Đăng xuất
            </button>
          </div>
        </header>

        <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <strong>{user?.name || "Admin"}</strong>
          <div style={{ color: "#9ca3af", marginTop: 4 }}>{user?.email || "admin@kikial.local"}</div>
        </div>

        {error && (
          <div style={{ background: "#4b1115", border: "1px solid #b91c1c", color: "#fecaca", borderRadius: 12, padding: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p>Đang tải dữ liệu...</p>
        ) : items.length === 0 ? (
          <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 16, padding: 20 }}>
            Chưa có dữ liệu học nào.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((item, index) => (
              <article key={item.id || `${item.question}-${index}`} style={{ background: "#111827", border: "1px solid #374151", borderRadius: 16, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 8px", color: "#a78bfa", fontWeight: 700 }}>
                      Câu hỏi #{index + 1} · {item.verified ? "Đã duyệt" : "Chờ duyệt"}
                    </p>
                    <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{item.question}</p>
                    <p style={{ margin: 0, color: "#d1d5db", whiteSpace: "pre-wrap" }}>{item.answer}</p>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {!item.verified && item.store === "learned" && (
                      <button type="button" onClick={() => verifyKnowledge(item.id)} style={{ background: "#166534", color: "white", border: "none", padding: "8px 10px", borderRadius: 10, cursor: "pointer" }}>
                        Duyệt
                      </button>
                    )}
                    <button type="button" onClick={() => removeKnowledge(item.id)} style={{ background: "#7f1d1d", color: "white", border: "none", padding: "8px 10px", borderRadius: 10, cursor: "pointer" }}>
                      Xóa
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
