import { useState } from "react";

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
      const result = await response.json();

      if (!response.ok) throw new Error(result.message || "Đăng nhập thất bại.");
      localStorage.setItem("kikial-token", result.token);
      onSuccess?.(result.user);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-brand" href="/login.html">✳ kikial<span>.</span></a>
        <p className="eyebrow">KHÔNG GIAN AI CÁ NHÂN</p>
        <h1>Chào mừng<br /><em>trở lại.</em></h1>
        <p className="auth-description">Đăng nhập để tiếp tục những ý tưởng đang còn dang dở.</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          <label htmlFor="login-password">Mật khẩu</label>
          <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tối thiểu 6 ký tự" required />
          <button type="submit" disabled={loading}>{loading ? "Đang kiểm tra..." : "Đăng nhập ↗"}</button>
          <p className="auth-message" role="alert">{message}</p>
        </form>
        <p className="auth-switch">Chưa có tài khoản? <button type="button" onClick={onRegister}>Đăng ký ngay</button></p>
      </section>
    </main>
  );
}
