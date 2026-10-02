import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import "../styles/admin.css";

const NAV = [
  ["overview", "Tổng quan"],
  ["knowledge", "Kiến thức"],
  ["users", "Người dùng"],
  ["system", "Hệ thống AI"],
];

function Status({ ok, label }) {
  return <span className={`admin-status ${ok ? "ok" : "off"}`}>{label}</span>;
}

function KnowledgeTable({ items, query, setQuery, filter, setFilter, busyId, updateItem }) {
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    return items.filter((item) => {
      const text = `${item.question || ""} ${item.answer || ""}`.toLocaleLowerCase("vi");
      const matchesFilter = filter === "all" || (filter === "verified" && item.verified) || (filter === "pending" && !item.verified);
      return matchesFilter && text.includes(needle);
    });
  }, [items, query, filter]);

  return (
    <>
      <div className="admin-toolbar">
        <input className="admin-input" placeholder="Tìm câu hỏi hoặc câu trả lời…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="admin-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Tất cả</option>
          <option value="pending">Chờ duyệt</option>
          <option value="verified">Đã duyệt</option>
        </select>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Trạng thái</th><th>Câu hỏi</th><th>Câu trả lời</th><th>Thao tác</th></tr></thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td><span className={`admin-status ${item.verified ? "ok" : "warn"}`}>{item.verified ? "Verified" : "Pending"}</span></td>
                <td><strong>{item.question}</strong><div style={{ color: "var(--admin-muted)", fontSize: 12, marginTop: 6 }}>{item.hits || 0} lượt dùng</div></td>
                <td className="admin-answer-cell">{item.answer}</td>
                <td><div style={{ display: "grid", gap: 7 }}>
                  {!item.verified && <button className="admin-primary" disabled={Boolean(busyId)} onClick={() => updateItem(item, "approve")}>Duyệt</button>}
                  {item.verified && item.store !== "knowledge" && <button className="admin-ghost" disabled={Boolean(busyId)} onClick={() => updateItem(item, "promote")}>Promote</button>}
                  <button className="admin-danger-btn" disabled={Boolean(busyId)} onClick={() => updateItem(item, "delete")}>Xóa</button>
                </div></td>
              </tr>
            ))}
            {!visibleItems.length && <tr><td colSpan="4" className="admin-empty">Không có dữ liệu phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function AdminPage({ user, onBack, onLogout, embedded = false }) {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function loadAll() {
    if (user?.role !== "admin") return;
    setLoading(true);
    setError("");
    try {
      const [summary, knowledge, accountList, runtimeResponse] = await Promise.all([
        api("/api/admin/overview"),
        api("/api/admin/knowledge"),
        api("/api/admin/users"),
        api("/api/admin/runtime").catch(() => ({ runtime: null })),
      ]);
      setOverview(summary);
      setRuntime(runtimeResponse.runtime || null);
      setItems(Array.isArray(knowledge.items) ? knowledge.items : []);
      setUsers(Array.isArray(accountList.items) ? accountList.items : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") loadAll();
    else setLoading(false);
  }, [user?.role]);

  async function updateItem(item, action) {
    if (busyId) return;
    if (action === "delete" && !window.confirm(`Xóa kiến thức: "${item.question}"?`)) return;
    setBusyId(item.id);
    setError("");
    try {
      if (action === "delete") {
        await api(`/api/admin/knowledge/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      } else {
        await api("/api/admin/knowledge/verify", {
          method: "POST",
          body: JSON.stringify({ id: item.id, verified: true, promote: action === "promote" }),
        });
      }
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (user?.role !== "admin") {
    return embedded ? (
      <section className="ki-card">
        <h3>Thư viện cá nhân</h3>
        <p>Kho kiến thức hệ thống chỉ dành cho admin. Bạn vẫn có thể thêm tài liệu của riêng mình trong mục Công cụ AI.</p>
      </section>
    ) : (
      <main className="admin-page" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <section className="admin-panel" style={{ maxWidth: 520 }}>
          <h2>Không có quyền quản trị</h2>
          <p>Tài khoản này không được phép mở bảng điều khiển admin.</p>
          <button className="admin-primary" onClick={onBack}>Về chat</button>
        </section>
      </main>
    );
  }

  if (embedded) {
    return (
      <section className="admin-panel" style={{ padding: 18 }}>
        <div className="admin-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Thư viện kiến thức</h2>
            <p>{items.length} bản ghi · {items.filter((item) => !item.verified).length} chờ duyệt</p>
          </div>
          <button className="admin-ghost" onClick={loadAll} disabled={loading}>{loading ? "Đang tải…" : "↻ Làm mới"}</button>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <KnowledgeTable items={items} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} busyId={busyId} updateItem={updateItem} />
      </section>
    );
  }

  const stats = overview?.stats || {};
  const system = overview?.system || {};
  const errorPercent = runtime?.requests ? `${(runtime.errorRate * 100).toFixed(1)}%` : "0%";
  const uptime = runtime?.uptimeSeconds == null ? "—" : runtime.uptimeSeconds < 3600 ? `${Math.floor(runtime.uptimeSeconds / 60)} phút` : `${(runtime.uptimeSeconds / 3600).toFixed(1)} giờ`;

  return (
    <div className="admin-page">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark">✦</span>
          <div>Kikial<small>Control Center</small></div>
        </div>

        <nav className="admin-nav" aria-label="Admin navigation">
          {NAV.map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-user-mini">
            <strong>{user.name || "Admin"}</strong>
            <span>{user.email}</span>
          </div>
          <button className="admin-ghost" onClick={onBack}>← Về chat</button>
          <button className="admin-danger-btn" onClick={onLogout}>Đăng xuất</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <h1>{NAV.find(([id]) => id === tab)?.[1]}</h1>
            <p>Quản lý kiến thức, tài khoản, hiệu năng và trạng thái hệ thống AI của Kikial.</p>
          </div>
          <div className="admin-header-actions">
            <button className="admin-ghost" onClick={onBack}>Về chat</button>
            <button className="admin-primary" onClick={loadAll} disabled={loading}>{loading ? "Đang tải…" : "↻ Làm mới"}</button>
          </div>
        </header>

        {error && <p className="admin-error" role="alert">{error}</p>}

        {tab === "overview" && (
          <>
            <section className="admin-grid">
              <div className="admin-stat"><div className="label">Người dùng</div><div className="value">{stats.users ?? "—"}</div><div className="sub">{stats.admins ?? 0} quản trị viên</div></div>
              <div className="admin-stat"><div className="label">Knowledge</div><div className="value">{stats.knowledge ?? "—"}</div><div className="sub">Kho tri thức đã quản lý</div></div>
              <div className="admin-stat"><div className="label">Requests</div><div className="value">{runtime?.requests ?? "—"}</div><div className="sub">Error rate {errorPercent}</div></div>
              <div className="admin-stat"><div className="label">Latency</div><div className="value">{runtime?.averageLatencyMs != null ? `${runtime.averageLatencyMs} ms` : "—"}</div><div className="sub">Peak {runtime?.peakLatencyMs ?? "—"} ms</div></div>
            </section>

            <section className="admin-panels">
              <article className="admin-panel">
                <h2>Trạng thái AI</h2>
                <div className="admin-kv">
                  <div className="admin-kv-row"><span>Model</span><strong>{system.model || "Chưa xác định"}</strong></div>
                  <div className="admin-kv-row"><span>Model runtime</span><Status ok={system.modelOnline} label={system.modelOnline ? "Online" : "Offline"} /></div>
                  <div className="admin-kv-row"><span>Embedding</span><Status ok={system.embeddingOnline} label={system.embeddingOnline ? "Online" : "Offline"} /></div>
                  <div className="admin-kv-row"><span>Vector store</span><Status ok={system.vectorOnline} label={system.vectorOnline ? "Online" : "Offline"} /></div>
                  <div className="admin-kv-row"><span>Web search</span><Status ok={system.webSearchOnline} label={system.webSearchOnline ? "Enabled" : "Disabled"} /></div>
                </div>
              </article>
              <article className="admin-panel">
                <h2>Độ sẵn sàng</h2>
                <p style={{ color: "var(--admin-muted)", lineHeight: 1.7 }}>
                  Kikial kết hợp model local, memory, hybrid RAG, graph, verified lessons và live web retrieval khi được cấu hình.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                  {(system.degraded || []).length ? system.degraded.map((item) => <span key={item} className="admin-status warn">{item}</span>) : <span className="admin-status ok">ALL_SYSTEMS_READY</span>}
                </div>
              </article>
            </section>
          </>
        )}

        {tab === "knowledge" && (
          <section className="admin-panel">
            <KnowledgeTable items={items} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} busyId={busyId} updateItem={updateItem} />
          </section>
        )}

        {tab === "users" && (
          <section className="admin-panel">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Ngày tạo</th></tr></thead>
                <tbody>{users.map((account) => <tr key={account.email}><td><strong>{account.name || "—"}</strong></td><td>{account.email}</td><td><span className={`admin-role ${account.role === "user" ? "user" : ""}`}>{account.role}</span></td><td>{account.createdAt ? new Date(account.createdAt).toLocaleString("vi-VN") : "—"}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "system" && (
          <section className="admin-panels" style={{ marginTop: 0 }}>
            <article className="admin-panel">
              <h2>Runtime</h2>
              <div className="admin-kv">
                <div className="admin-kv-row"><span>Provider</span><strong>{system.aiProvider || "ollama"}</strong></div>
                <div className="admin-kv-row"><span>Model</span><strong>{system.model || "—"}</strong></div>
                <div className="admin-kv-row"><span>Embedding model</span><strong>{system.embeddingModel || "—"}</strong></div>
                <div className="admin-kv-row"><span>Uptime</span><strong>{uptime}</strong></div>
                <div className="admin-kv-row"><span>Requests</span><strong>{runtime?.requests ?? "—"}</strong></div>
                <div className="admin-kv-row"><span>Error rate</span><strong>{errorPercent}</strong></div>
                <div className="admin-kv-row"><span>Avg latency</span><strong>{runtime?.averageLatencyMs != null ? `${runtime.averageLatencyMs} ms` : "—"}</strong></div>
              </div>
            </article>
            <article className="admin-panel">
              <h2>Năng lực</h2>
              <div className="admin-kv">
                <div className="admin-kv-row"><span>Hybrid retrieval</span><Status ok={system.vectorOnline} label="RAG" /></div>
                <div className="admin-kv-row"><span>Knowledge graph</span><strong>{stats.graph ?? 0} facts</strong></div>
                <div className="admin-kv-row"><span>Live web</span><Status ok={system.webSearchOnline} label={system.webSearchOnline ? "Enabled" : "Configure SearXNG"} /></div>
                <div className="admin-kv-row"><span>Pending training data</span><strong>{stats.pending ?? 0}</strong></div>
              </div>
            </article>
            {runtime?.routes?.length > 0 && (
              <article className="admin-panel" style={{ gridColumn: "1 / -1" }}>
                <h2>Endpoint gần đây</h2>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Route</th><th>Requests</th><th>Errors</th><th>Avg</th><th>Max</th></tr></thead>
                    <tbody>{runtime.routes.slice(0, 12).map((row) => <tr key={row.route}><td><strong>{row.route}</strong></td><td>{row.requests}</td><td>{row.errors}</td><td>{row.averageLatencyMs} ms</td><td>{row.maxLatencyMs} ms</td></tr>)}</tbody>
                  </table>
                </div>
              </article>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
