import { useState } from "react";
import { api } from "../services/api";

export default function Login({ onSuccess, onRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");

    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!result.token || !result.user?.email) throw new Error("Máy chủ chưa trả về phiên đăng nhập hợp lệ.");
      localStorage.setItem("kikial-token", result.token);
      onSuccess?.(result.user);
    } catch (error) {
      setMessage(error.message || "Đăng nhập thất bại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" aria-hidden="true" />
      <div className="auth-glow auth-glow-two" aria-hidden="true" />
      <div className="auth-shell auth-shell--login">
        <div className="auth-topbar">
          <div className="auth-brand-wrap">
            <span className="auth-brand-mark">✦</span>
            <span className="auth-brand">kikial.</span>
          </div>
          <span className="auth-language">AI local · Riêng tư</span>
        </div>

        <div className="auth-surface">
          <div className="auth-tab-row">
            <button type="button" className="auth-tab auth-tab--active">Đăng nhập</button>
            <button type="button" className="auth-tab" onClick={onRegister}>Đăng ký</button>
          </div>

          <div className="auth-heading-block">
            <div className="auth-subtitle">Chào mừng trở lại</div>
            <h1>Đăng nhập vào Kikial</h1>
            <p>Tiếp tục hội thoại, tài liệu và không gian AI của bạn.</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="login-email">Email</label>
            <div className="auth-field">
              <span className="auth-icon">✉</span>
              <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
            </div>

            <label htmlFor="login-password">Mật khẩu</label>
            <div className="auth-field">
              <span className="auth-icon">◌</span>
              <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" required />
              <button type="button" className="auth-eye" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{showPassword ? "◌" : "◉"}</button>
            </div>

            <button type="submit" className="auth-submit" disabled={loading || !email.trim() || !password}>
              {loading ? "Đang đăng nhập…" : "Đăng nhập →"}
            </button>

            {message && <p className="auth-message" role="alert">{message}</p>}
          </form>

          <div className="auth-security-note">
            <span>◆</span>
            <div><strong>Thiết kế local-first</strong><small>Dữ liệu hội thoại và model có thể chạy trong máy của bạn.</small></div>
          </div>

          <p className="auth-switch">Chưa có tài khoản? <button type="button" onClick={onRegister}>Đăng ký ngay</button></p>
        </div>
      </div>
    </main>
  );
}
