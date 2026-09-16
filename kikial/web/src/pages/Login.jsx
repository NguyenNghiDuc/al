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

export default function Login({ onSuccess, onRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await parseJsonResponse(response);

      if (!response.ok) throw new Error(result.message || "Đăng nhập thất bại.");
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
      <div className="auth-shell auth-shell--login">
        <div className="auth-topbar">
          <div className="auth-brand-wrap">
            <span className="auth-brand-mark">✦</span>
            <span className="auth-brand">kikial.</span>
          </div>
          <button type="button" className="auth-language">Tiếng Việt ▾</button>
        </div>

        <div className="auth-surface">
          <div className="auth-tab-row">
            <button type="button" className="auth-tab auth-tab--active">Đăng nhập</button>
            <button type="button" className="auth-tab" onClick={onRegister}>Đăng ký</button>
          </div>

          <div className="auth-heading-block">
            <div className="auth-subtitle">Chào mừng trở lại</div>
            <h1>Đăng nhập</h1>
            <p>Tiếp tục hành trình trinh cứu...</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="login-email">Email</label>
            <div className="auth-field">
              <span className="auth-icon">✉</span>
              <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
            </div>

            <label htmlFor="login-password">Mật khẩu</label>
            <div className="auth-field">
              <span className="auth-icon">◌</span>
              <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" required />
              <span className="auth-eye">◉</span>
            </div>

            <div className="auth-row">
              <label className="auth-check">
                <input type="checkbox" defaultChecked />
                <span>Ghi nhớ đăng nhập</span>
              </label>

              <button type="button" className="auth-link">Quên mật khẩu?</button>
            </div>

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Đang kiểm tra..." : "Đăng nhập →"}
            </button>

            <p className="auth-message" role="alert">{message}</p>

            <div className="auth-divider">Hoặc đăng nhập bằng</div>

            <div className="auth-socials">
              <button type="button" className="auth-social">Google</button>
              <button type="button" className="auth-social">GitHub</button>
              <button type="button" className="auth-social">Microsoft</button>
            </div>
          </form>

          <p className="auth-switch">Chưa có tài khoản? <button type="button" onClick={onRegister}>Đăng ký ngay</button></p>
        </div>
      </div>
    </main>
  );
}
