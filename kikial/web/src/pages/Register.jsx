import { useState } from "react";

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
      const result = await response.json();

      if (!response.ok) throw new Error(result.message || "Đăng ký thất bại.");
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
        <p className="eyebrow">BẮT ĐẦU KHÔNG GIAN RIÊNG</p>
        <h1>Tạo tài khoản<br /><em>của bạn.</em></h1>
        <p className="auth-description">Đăng ký để lưu lại những cuộc trò chuyện và ý tưởng của bạn.</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="register-name">Tên hiển thị</label>
          <input id="register-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Nguyễn Văn A" required />
          <label htmlFor="register-email">Email</label>
          <input id="register-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="you@example.com" required />
          <label htmlFor="register-password">Mật khẩu</label>
          <input id="register-password" type="password" minLength="6" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="Tối thiểu 6 ký tự" required />
          <label htmlFor="register-confirm-password">Nhập lại mật khẩu</label>
          <input id="register-confirm-password" type="password" minLength="6" value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} placeholder="Nhập lại mật khẩu" required />
          <button type="submit" disabled={loading}>{loading ? "Đang tạo tài khoản..." : "Tạo tài khoản ↗"}</button>
          <p className="auth-message" role="alert">{message}</p>
        </form>
        <p className="auth-switch">Đã có tài khoản? <button type="button" onClick={onLogin}>Đăng nhập</button></p>
      </section>
    </main>
  );
}
