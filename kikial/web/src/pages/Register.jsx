import { useState } from "react";
import { api } from "../services/api";

export default function Register({ onSuccess, onLogin }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    if (form.password.length < 8) {
      setMessage("Mật khẩu cần ít nhất 8 ký tự.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setMessage("Mật khẩu nhập lại không khớp.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const result = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), password: form.password }),
      });
      if (!result.token || !result.user?.email) throw new Error("Máy chủ chưa tạo phiên đăng nhập hợp lệ.");
      localStorage.setItem("kikial-token", result.token);
      onSuccess?.(result.user);
    } catch (error) {
      setMessage(error.message || "Đăng ký thất bại.");
    } finally {
      setLoading(false);
    }
  }

  const strongEnough = form.password.length >= 8;

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" aria-hidden="true" />
      <div className="auth-glow auth-glow-two" aria-hidden="true" />
      <div className="auth-shell auth-shell--login auth-shell--register">
        <div className="auth-topbar">
          <div className="auth-brand-wrap">
            <span className="auth-brand-mark">✦</span>
            <span className="auth-brand">kikial.</span>
          </div>
          <span className="auth-language">AI local · Riêng tư</span>
        </div>

        <div className="auth-surface">
          <div className="auth-tab-row">
            <button type="button" className="auth-tab" onClick={onLogin}>Đăng nhập</button>
            <button type="button" className="auth-tab auth-tab--active">Đăng ký</button>
          </div>

          <div className="auth-heading-block">
            <div className="auth-subtitle">Tạo không gian riêng</div>
            <h1>Bắt đầu với Kikial</h1>
            <p>Tạo tài khoản để lưu hội thoại, memory và tài liệu theo từng người dùng.</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="register-name">Tên hiển thị</label>
            <div className="auth-field">
              <span className="auth-icon">◍</span>
              <input id="register-name" autoComplete="name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Tên của bạn" maxLength="80" required />
            </div>

            <label htmlFor="register-email">Email</label>
            <div className="auth-field">
              <span className="auth-icon">✉</span>
              <input id="register-email" type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="name@example.com" required />
            </div>

            <label htmlFor="register-password">Mật khẩu</label>
            <div className="auth-field">
              <span className="auth-icon">◌</span>
              <input id="register-password" type={showPassword ? "text" : "password"} minLength="8" autoComplete="new-password" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="Tối thiểu 8 ký tự" required />
              <button type="button" className="auth-eye" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{showPassword ? "◌" : "◉"}</button>
            </div>
            <div className={`auth-password-meter ${strongEnough ? "ok" : ""}`}><span /> <small>{strongEnough ? "Đủ độ dài" : `${form.password.length}/8 ký tự`}</small></div>

            <label htmlFor="register-confirm-password">Nhập lại mật khẩu</label>
            <div className="auth-field">
              <span className="auth-icon">◌</span>
              <input id="register-confirm-password" type={showPassword ? "text" : "password"} minLength="8" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} placeholder="Nhập lại mật khẩu" required />
            </div>

            <button type="submit" className="auth-submit" disabled={loading || !form.name.trim() || !form.email.trim() || !strongEnough}>
              {loading ? "Đang tạo tài khoản…" : "Tạo tài khoản →"}
            </button>

            {message && <p className="auth-message" role="alert">{message}</p>}
          </form>

          <p className="auth-switch">Đã có tài khoản? <button type="button" onClick={onLogin}>Đăng nhập</button></p>
        </div>
      </div>
    </main>
  );
}
