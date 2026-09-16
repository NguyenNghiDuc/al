import { useState } from "react";

async function parseJsonResponse(response) {
  const raw = await response.text();

  if (!raw) {
    return { message: `Không nhận được phản hồi từ máy chủ (${response.status}).` };
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { message: `Máy chủ trả về dữ liệu không hợp lệ (${response.status}).` };
  }
}

export default function Register({ onSuccess, onLogin }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (form.password !== form.confirmPassword) {
      setMessage("Mật khẩu nhập lại không khớp.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });
      const result = await parseJsonResponse(response);

      if (!response.ok) throw new Error(result.message || "Đăng ký thất bại.");
      localStorage.setItem("kikial-token", result.token);
      onSuccess?.(result.user);
    } catch (error) {
      setMessage(error.message || "Đăng ký thất bại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-shell auth-shell--login auth-shell--register">
        <div className="auth-topbar">
          <div className="auth-brand-wrap">
            <span className="auth-brand-mark">✦</span>
            <span className="auth-brand">kikial.</span>
          </div>
          <button type="button" className="auth-language">Tiếng Việt ▾</button>
        </div>

        <div className="auth-surface">
          <div className="auth-tab-row">
            <button type="button" className="auth-tab" onClick={onLogin}>Đăng nhập</button>
            <button type="button" className="auth-tab auth-tab--active">Đăng ký</button>
          </div>

          <div className="auth-heading-block">
            <div className="auth-subtitle">Chào mừng bạn</div>
            <h1>Đăng ký</h1>
            <p>Khởi đầu hành trình của bạn với Kikial.</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="register-name">Tên hiển thị</label>
            <div className="auth-field">
              <span className="auth-icon">◍</span>
              <input id="register-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Nguyễn Văn A" required />
            </div>

            <label htmlFor="register-email">Email</label>
            <div className="auth-field">
              <span className="auth-icon">✉</span>
              <input id="register-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="name@example.com" required />
            </div>

            <label htmlFor="register-password">Mật khẩu</label>
            <div className="auth-field">
              <span className="auth-icon">◌</span>
              <input id="register-password" type="password" minLength="6" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="Tối thiểu 6 ký tự" required />
              <span className="auth-eye">◉</span>
            </div>

            <label htmlFor="register-confirm-password">Nhập lại mật khẩu</label>
            <div className="auth-field">
              <span className="auth-icon">◌</span>
              <input id="register-confirm-password" type="password" minLength="6" value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} placeholder="Nhập lại mật khẩu" required />
              <span className="auth-eye">◉</span>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Đang tạo tài khoản..." : "Đăng ký →"}
            </button>

            <p className="auth-message" role="alert">{message}</p>
          </form>

          <p className="auth-switch">Đã có tài khoản? <button type="button" onClick={onLogin}>Đăng nhập</button></p>
        </div>
      </div>
    </main>
  );
}
