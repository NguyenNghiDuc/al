import { useEffect, useState } from "react";
import "./styles/global.css";
import "./styles/login.css";
import "./styles/workspace.css";
import "./styles/sync.css";
import "./styles/polish.css";
import ChatPage from "./pages/Chat";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminPage from "./pages/Admin";
import { api } from "./services/api";

export default function App() {
  const [page, setPage] = useState("loading");
  const [user, setUser] = useState(null);
  const [bootError, setBootError] = useState("");

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("kikial-token");

    if (!token) {
      setPage("login");
      return () => {};
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    api("/api/auth/me", { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        if (!result.user?.email) throw new Error("Phiên đăng nhập không hợp lệ.");
        setUser(result.user);
        setPage(result.user.role === "admin" ? "admin" : "chat");
      })
      .catch((error) => {
        if (!active) return;
        localStorage.removeItem("kikial-token");
        setBootError(error.name === "AbortError" ? "Backend phản hồi quá lâu." : error.message);
        setPage("login");
      })
      .finally(() => clearTimeout(timer));

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  function handleSuccess(nextUser) {
    setUser(nextUser);
    setBootError("");
    setPage(nextUser?.role === "admin" ? "admin" : "chat");
  }

  async function handleLogout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Logout remains successful locally even when backend is unreachable.
    } finally {
      localStorage.removeItem("kikial-token");
      setUser(null);
      setPage("login");
    }
  }

  if (page === "loading") {
    return (
      <main className="ki-loading">
        <div className="ki-loading-logo">✦</div>
        <h2>Kikial</h2>
        <p>Đang khôi phục phiên đăng nhập…</p>
      </main>
    );
  }

  if (page === "register") {
    return <Register onSuccess={handleSuccess} onLogin={() => setPage("login")} />;
  }

  if (page === "login") {
    return (
      <>
        {bootError && <div className="app-boot-error" role="status">{bootError}</div>}
        <Login onSuccess={handleSuccess} onRegister={() => setPage("register")} />
      </>
    );
  }

  if (page === "admin") {
    return <AdminPage user={user} onBack={() => setPage("chat")} onLogout={handleLogout} />;
  }

  return (
    <ChatPage
      user={user}
      onLogout={handleLogout}
      onOpenAdmin={() => setPage("admin")}
    />
  );
}
