import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api";
import RichMessage from "../components/RichMessage";
import "../styles/workspace.css";

const PROMPTS = [
  { title: "Giải thích dễ hiểu", icon: "◌", tone: "green", prompt: "Giải thích async/await trong JavaScript bằng ví dụ ngắn và dễ hiểu." },
  { title: "Lập kế hoạch", icon: "◍", tone: "orange", prompt: "Lập cho tôi một kế hoạch học 30 ngày, chia theo từng ngày và có mục tiêu rõ ràng." },
  { title: "Nghiên cứu mới nhất", icon: "◐", tone: "purple", prompt: "Tìm thông tin mới nhất về chủ đề tôi sắp gửi, phân biệt dữ kiện từ web và kiến thức chung." },
  { title: "Hỗ trợ code", icon: "◈", tone: "blue", prompt: "Giúp tôi debug đoạn code sau. Hãy chỉ ra nguyên nhân, cách sửa và phiên bản code đã sửa:" },
];

const TOOLS = [
  ["summary", "Tóm tắt", "Tóm tắt nội dung sau thành các ý chính, giữ lại dữ kiện quan trọng:"],
  ["explain", "Giải thích", "Giải thích nội dung sau thật dễ hiểu, có ví dụ nếu phù hợp:"],
  ["rewrite", "Viết lại", "Viết lại nội dung sau rõ ràng, tự nhiên và chuyên nghiệp hơn:"],
  ["translate", "Dịch", "Dịch nội dung sau sang tiếng Anh tự nhiên, giữ nguyên ý nghĩa:"],
  ["quiz", "Tạo bài tập", "Tạo 5 câu trắc nghiệm từ nội dung sau, kèm đáp án và giải thích:"],
];

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function safeChats(value) {
  return Array.isArray(value)
    ? value.filter((chat) => chat && typeof chat.id === "string" && typeof chat.title === "string" && Array.isArray(chat.messages))
      .map((chat) => ({ ...chat, pinned: Boolean(chat.pinned) }))
    : [];
}

function sourceLabel(message) {
  const labels = {
    ai: "AI model",
    knowledge: "Knowledge",
    document: "Tài liệu",
    experience: "Kinh nghiệm đã xác minh",
    calc: "Calculator",
    canned: "Fallback",
  };
  return labels[message.source] || (message.modelUsed ? "AI model" : "");
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Chat({ user, onLogout, onOpenAdmin }) {
  const email = user?.email || "guest";
  const displayName = user?.name?.trim() || email;
  const chatKey = `kikial-chats:${email}`;
  const settingsKey = `kikial-settings:${email}`;

  const [page, setPage] = useState("chat");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chats, setChats] = useState(() => safeChats(readJson(chatKey, [])));
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [health, setHealth] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [docName, setDocName] = useState("");
  const [docText, setDocText] = useState("");
  const [toolText, setToolText] = useState("");
  const [selectedTool, setSelectedTool] = useState("summary");
  const [settings, setSettings] = useState(() => {
    const saved = readJson(settingsKey, {});
    return { fontSize: [14, 16, 18].includes(saved.fontSize) ? saved.fontSize : 16, autoScroll: saved.autoScroll !== false };
  });

  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const controllerRef = useRef(null);
  const importRef = useRef(null);

  const activeChat = chats.find((chat) => chat.id === activeId) || null;
  const messages = activeChat?.messages || [];

  const menu = useMemo(() => {
    const items = [
      ["chat", "▣", "Chat"],
      ["explore", "◉", "Khám phá"],
      ["documents", "◇", "Tài liệu"],
      ["history", "◷", "Lịch sử"],
      ["tools", "⚯", "Công cụ AI"],
      ["settings", "⚙", "Cài đặt"],
    ];
    if (user?.role === "admin") items.splice(5, 0, ["admin", "◆", "Admin"]);
    return items;
  }, [user?.role]);

  const filteredChats = useMemo(() => {
    const needle = historyQuery.trim().toLocaleLowerCase("vi");
    return chats
      .filter((chat) => {
        if (!needle) return true;
        const haystack = `${chat.title} ${chat.messages.map((message) => message.content || "").join(" ")}`.toLocaleLowerCase("vi");
        return haystack.includes(needle);
      })
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [chats, historyQuery]);

  useEffect(() => {
    if (!busy) {
      try { localStorage.setItem(chatKey, JSON.stringify(chats.slice(0, 100))); }
      catch { setNotice("Không thể lưu thêm lịch sử vào trình duyệt."); }
    }
  }, [chats, busy, chatKey]);

  useEffect(() => {
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)); }
    catch {}
  }, [settings, settingsKey]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api("/api/health", { signal: controller.signal })
      .then((result) => active && setHealth(result))
      .catch(() => active && setHealth({ ok: false }));
    return () => { active = false; controller.abort(); controllerRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (page === "documents" && !documentsLoading) loadDocuments();
  }, [page]);

  useEffect(() => {
    const element = scrollRef.current;
    if (page === "chat" && element && settings.autoScroll) element.scrollTop = element.scrollHeight;
  }, [page, messages.length, busy, settings.autoScroll]);

  function navigate(next) {
    if (next === "admin") { onOpenAdmin?.(); return; }
    setPage(next);
    setMenuOpen(false);
    setNotice("");
  }

  function newChat() {
    if (busy) return;
    setActiveId(null);
    setInput("");
    navigate("chat");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function openChat(id) { setActiveId(id); navigate("chat"); }

  function deleteChat(id) {
    if (!window.confirm("Xóa cuộc trò chuyện này?")) return;
    setChats((current) => current.filter((chat) => chat.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function renameChat(chat) {
    const next = window.prompt("Tên cuộc trò chuyện:", chat.title)?.trim();
    if (!next) return;
    setChats((current) => current.map((item) => item.id === chat.id ? { ...item, title: next.slice(0, 100) } : item));
  }

  function togglePin(id) {
    setChats((current) => current.map((chat) => chat.id === id ? { ...chat, pinned: !chat.pinned } : chat));
  }

  function exportChats() {
    downloadJson(`kikial-chats-${new Date().toISOString().slice(0, 10)}.json`, {
      version: 1,
      exportedAt: new Date().toISOString(),
      account: email,
      chats,
    });
    setNotice("Đã xuất lịch sử chat.");
  }

  async function importChats(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = safeChats(Array.isArray(parsed) ? parsed : parsed?.chats);
      if (!incoming.length) throw new Error("File không có lịch sử Kikial hợp lệ.");
      setChats((current) => {
        const map = new Map(current.map((chat) => [chat.id, chat]));
        incoming.forEach((chat) => map.set(chat.id, chat));
        return [...map.values()].slice(0, 100);
      });
      setNotice(`Đã nhập ${incoming.length} cuộc trò chuyện.`);
    } catch (error) {
      setNotice(error.message || "Không đọc được file import.");
    }
  }

  function preparePrompt(prompt) {
    setInput(prompt);
    navigate("chat");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function requestAnswer({ chatId, question, history, replaceAssistantId = null }) {
    const controller = new AbortController();
    controllerRef.current = controller;
    const result = await api("/api/chat", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ message: question, history }),
    });
    const assistant = {
      id: replaceAssistantId || crypto.randomUUID(),
      role: "assistant",
      content: String(result.answer || "Kikial chưa trả về nội dung."),
      source: result.source,
      modelUsed: result.modelUsed,
      confidence: result.confidence,
      intent: result.intent,
      traceId: result.traceId,
      sources: result.sources || [],
      createdAt: new Date().toISOString(),
    };
    setChats((current) => current.map((chat) => chat.id === chatId ? {
      ...chat,
      messages: replaceAssistantId
        ? chat.messages.map((message) => message.id === replaceAssistantId ? assistant : message)
        : [...chat.messages, assistant],
    } : chat));
  }

  async function sendMessage(event) {
    event?.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    if (question.length > 12000) { setNotice("Tin nhắn tối đa 12.000 ký tự."); return; }

    const chatId = activeChat?.id || crypto.randomUUID();
    const userMessage = { id: crypto.randomUUID(), role: "user", content: question, createdAt: new Date().toISOString() };
    const previous = activeChat?.messages || [];
    const history = previous.filter((message) => !message.failed).slice(-20).map(({ role, content }) => ({ role, content: String(content).slice(0, 12000) }));

    if (activeChat) {
      setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, messages: [...chat.messages, userMessage] } : chat));
    } else {
      setChats((current) => [{ id: chatId, title: question.slice(0, 64), createdAt: new Date().toISOString(), pinned: false, messages: [userMessage] }, ...current]);
      setActiveId(chatId);
    }

    setInput("");
    setBusy(true);
    setNotice("");
    try {
      await requestAnswer({ chatId, question, history });
    } catch (error) {
      const failed = { id: crypto.randomUUID(), role: "assistant", content: error.name === "AbortError" ? "Đã dừng phản hồi." : error.message, failed: true };
      setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, messages: [...chat.messages, failed] } : chat));
      setNotice(failed.content);
    } finally {
      setBusy(false);
      controllerRef.current = null;
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function regenerate(messageId) {
    if (busy || !activeChat) return;
    const index = activeChat.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const userIndex = [...activeChat.messages.slice(0, index)].map((message) => message.role).lastIndexOf("user");
    if (userIndex < 0) return;
    const userMessage = activeChat.messages[userIndex];
    const history = activeChat.messages.slice(0, userIndex).filter((message) => !message.failed).slice(-20).map(({ role, content }) => ({ role, content }));
    setBusy(true);
    setNotice("");
    try {
      await requestAnswer({ chatId: activeChat.id, question: userMessage.content, history, replaceAssistantId: messageId });
    } catch (error) {
      setNotice(error.name === "AbortError" ? "Đã dừng phản hồi." : error.message);
    } finally {
      setBusy(false);
      controllerRef.current = null;
    }
  }

  function editUserMessage(messageId) {
    if (busy || !activeChat) return;
    const index = activeChat.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const current = activeChat.messages[index];
    const next = window.prompt("Sửa tin nhắn:", current.content)?.trim();
    if (!next || next === current.content) return;
    const trimmedMessages = activeChat.messages.slice(0, index).concat({ ...current, content: next, editedAt: new Date().toISOString() });
    setChats((items) => items.map((chat) => chat.id === activeChat.id ? { ...chat, messages: trimmedMessages } : chat));
    setInput(next);
    setNotice("Đã sửa. Nhấn Gửi để tạo nhánh trả lời mới từ tin nhắn này.");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); setNotice("Đã sao chép."); }
    catch { setNotice("Không sao chép được."); }
  }

  async function loadDocuments() {
    setDocumentsLoading(true);
    try {
      const result = await api("/api/documents");
      setDocuments(Array.isArray(result.documents) ? result.documents : []);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function saveDocument(event) {
    event.preventDefault();
    if (!docText.trim()) return;
    try {
      await api("/api/documents", {
        method: "POST",
        body: JSON.stringify({ filename: docName.trim() || `note-${Date.now()}.txt`, text: docText }),
      });
      setDocName("");
      setDocText("");
      setNotice("Đã thêm tài liệu vào kho RAG của bạn.");
      await loadDocuments();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function loadTextFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const allowed = /\.(txt|md|csv|json|html?|xml|log)$/i.test(file.name);
    if (!allowed) { setNotice("Hiện upload trực tiếp hỗ trợ TXT/MD/CSV/JSON/HTML/XML/LOG. PDF/Word/Excel sẽ được thêm ở parser backend tiếp theo."); return; }
    try {
      const text = await file.text();
      setDocName(file.name);
      setDocText(text.slice(0, 2_000_000));
      setNotice(`Đã đọc ${file.name}. Kiểm tra nội dung rồi bấm Thêm vào RAG.`);
    } catch {
      setNotice("Không đọc được file này.");
    }
  }

  function runTextTool() {
    const instruction = TOOLS.find(([id]) => id === selectedTool)?.[2];
    if (!instruction || !toolText.trim()) return;
    preparePrompt(`${instruction}\n\n${toolText.trim()}`);
  }

  return (
    <div className="ki-workspace" style={{ fontSize: settings.fontSize }}>
      {menuOpen && <button className="ki-overlay" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}

      <aside className={`ki-sidebar ${menuOpen ? "ki-open" : ""}`}>
        <div className="ki-brand-row">
          <button className="ki-brand" onClick={newChat}><span>✦</span><strong>kikial.</strong></button>
          <span className="ki-role-badge">{user?.role === "admin" ? "ADMIN" : "LOCAL AI"}</span>
        </div>
        <button type="button" className="ki-new-chat" onClick={newChat} disabled={busy}><span>＋</span> Cuộc trò chuyện mới</button>
        <nav className="ki-nav" aria-label="Menu chính">
          {menu.map(([id, icon, label]) => <button key={id} className={page === id ? "ki-selected" : ""} onClick={() => navigate(id)}><span className="nav-icon">{icon}</span>{label}</button>)}
        </nav>
        <div className="ki-profile">
          <div className="ki-profile-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
          <div className="ki-profile-copy"><strong>{displayName}</strong><small>{email}</small></div>
          <button type="button" onClick={onLogout}>Đăng xuất</button>
        </div>
      </aside>

      <main className="ki-main">
        <header className="ki-header">
          <div className="ki-actions">
            <button className="ki-mobile" onClick={() => setMenuOpen(true)} aria-label="Mở menu">☰</button>
            <div><h1>{menu.find(([id]) => id === page)?.[2] || "Kikial"}</h1><small>Chào {displayName} 👋</small></div>
          </div>
          <div className="ki-header-actions"><button className="ki-status" onClick={() => navigate("settings")}>{health?.modelOnline ? "● AI online" : health === null ? "Đang kiểm tra…" : "○ AI offline"}</button></div>
        </header>

        {notice && <div className="ki-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Đóng">×</button></div>}

        <div className="ki-scroll" ref={scrollRef}>
          <div className="ki-content">
            {page === "chat" && (
              <>
                {!messages.length ? (
                  <section className="ki-welcome">
                    <span>✦</span><h2>Hỏi bất cứ điều gì.</h2>
                    <p>Kikial kết hợp model, memory, RAG, tài liệu và web retrieval khi được cấu hình.</p>
                    <div className="ki-grid">{PROMPTS.map((item) => <button key={item.title} onClick={() => preparePrompt(item.prompt)}><span className={`mini-icon ${item.tone}`}>{item.icon}</span><strong>{item.title}</strong><small>{item.prompt}</small></button>)}</div>
                  </section>
                ) : (
                  <section className="ki-list">
                    {messages.map((message) => (
                      <article key={message.id} className={`ki-bubble ki-${message.role}`}>
                        <strong>{message.role === "user" ? "Bạn" : "✦ Kikial"}</strong>
                        <div className="ki-answer"><RichMessage content={message.content} sources={message.role === "assistant" ? message.sources : []} /></div>
                        <div className="ki-actions ki-message-actions">
                          <button onClick={() => copy(message.content)}>Sao chép</button>
                          {message.role === "user" && <button onClick={() => editUserMessage(message.id)} disabled={busy}>Sửa</button>}
                          {message.role === "assistant" && !message.failed && <button onClick={() => regenerate(message.id)} disabled={busy}>Tạo lại</button>}
                          {message.editedAt && <small>Đã chỉnh sửa</small>}
                          {message.role === "assistant" && sourceLabel(message) && <small>{sourceLabel(message)}</small>}
                          {message.role === "assistant" && typeof message.confidence?.score === "number" && <small>Độ tin cậy {Math.round(message.confidence.score * 100)}%</small>}
                        </div>
                      </article>
                    ))}
                    {busy && <p className="ki-muted">Kikial đang suy luận…</p>}
                  </section>
                )}
              </>
            )}

            {page === "explore" && <section><h2>Khám phá cùng Kikial</h2><p className="ki-muted">Các điểm bắt đầu nhanh cho học tập, nghiên cứu và lập trình.</p><div className="ki-grid ki-space">{PROMPTS.map((item) => <button className="ki-card" key={item.title} onClick={() => preparePrompt(item.prompt)}><span className={`mini-icon ${item.tone}`}>{item.icon}</span><h3>{item.title}</h3><p>{item.prompt}</p><span>Mở trong Chat ↗</span></button>)}</div></section>}

            {page === "documents" && (
              <section>
                <h2>Tài liệu của bạn</h2>
                <p className="ki-muted">RAG mới chunk theo cấu trúc và xếp hạng BM25. Có thể dán nội dung hoặc nạp file text phổ biến.</p>
                <form className="ki-card ki-list ki-space" onSubmit={saveDocument}>
                  <input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Tên tài liệu, ví dụ: notes-flutter.txt" />
                  <label className="ki-file-button">＋ Chọn file TXT/MD/CSV/JSON/HTML/XML/LOG<input type="file" accept=".txt,.md,.csv,.json,.html,.htm,.xml,.log,text/*" onChange={loadTextFile} hidden /></label>
                  <textarea value={docText} onChange={(e) => setDocText(e.target.value)} placeholder="Dán nội dung tài liệu vào đây…" rows="8" required />
                  <div className="ki-actions"><button type="submit">Thêm vào RAG</button><button type="button" onClick={loadDocuments}>Làm mới</button></div>
                </form>
                <div className="ki-list ki-space">
                  {documentsLoading ? <p className="ki-muted">Đang tải…</p> : documents.map((doc) => <article className="ki-card" key={doc.documentId || doc.id}><h3>{doc.filename || "Tài liệu"}</h3><p className="ki-muted">{doc.chunks?.length ?? doc.chunks ?? "—"} chunks · {doc.size ? `${Math.round(doc.size / 1024)} KB` : ""}</p></article>)}
                  {!documentsLoading && !documents.length && <p className="ki-muted">Chưa có tài liệu.</p>}
                </div>
              </section>
            )}

            {page === "history" && (
              <section>
                <h2>Lịch sử trò chuyện</h2>
                <p className="ki-muted">Tìm cả tiêu đề lẫn nội dung, ghim chat quan trọng và sao lưu bằng JSON.</p>
                <div className="ki-history-toolbar"><input value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="Tìm trong toàn bộ lịch sử…" /><button onClick={exportChats} disabled={!chats.length}>Xuất</button><button onClick={() => importRef.current?.click()}>Nhập</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={importChats} /></div>
                <div className="ki-list ki-space">
                  {filteredChats.map((chat) => <article className={`ki-card ${chat.pinned ? "ki-pinned" : ""}`} key={chat.id}><h3>{chat.pinned ? "📌 " : ""}{chat.title}</h3><p className="ki-muted">{chat.messages.length} tin nhắn</p><div className="ki-actions"><button onClick={() => openChat(chat.id)}>Mở</button><button onClick={() => togglePin(chat.id)}>{chat.pinned ? "Bỏ ghim" : "Ghim"}</button><button onClick={() => renameChat(chat)}>Đổi tên</button><button className="ki-danger" onClick={() => deleteChat(chat.id)}>Xóa</button></div></article>)}
                  {!filteredChats.length && <p className="ki-muted">Không có cuộc trò chuyện phù hợp.</p>}
                </div>
              </section>
            )}

            {page === "tools" && <section><h2>Công cụ AI</h2><p className="ki-muted">Tạo prompt chuẩn rồi chuyển sang Chat để model xử lý.</p><div className="ki-card ki-list ki-space"><select value={selectedTool} onChange={(e) => setSelectedTool(e.target.value)}>{TOOLS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><textarea rows="10" value={toolText} onChange={(e) => setToolText(e.target.value)} placeholder="Nội dung cần xử lý…" /><button onClick={runTextTool} disabled={!toolText.trim()}>Dùng công cụ trong Chat →</button></div></section>}

            {page === "settings" && (
              <section><h2>Cài đặt</h2><div className="ki-list ki-space">
                <article className="ki-card"><h3>Giao diện</h3><label>Cỡ chữ <select value={settings.fontSize} onChange={(e) => setSettings((s) => ({ ...s, fontSize: Number(e.target.value) }))}><option value="14">Nhỏ</option><option value="16">Vừa</option><option value="18">Lớn</option></select></label><label className="ki-space"><input type="checkbox" checked={settings.autoScroll} onChange={(e) => setSettings((s) => ({ ...s, autoScroll: e.target.checked }))} /> Tự cuộn tới câu trả lời mới</label></article>
                <article className="ki-card"><h3>Hệ thống AI</h3><p>Model: <strong>{health?.model || "—"}</strong></p><p>Embedding: <strong>{health?.embeddingModel || "—"}</strong></p><p>Web search: <strong>{health?.webSearchOnline ? "Bật" : "Chưa cấu hình"}</strong></p><p>Knowledge: <strong>{health?.knowledgeItems ?? "—"}</strong> · Vectors: <strong>{health?.vectorItems ?? "—"}</strong></p><button onClick={async () => { try { setHealth(await api("/api/health")); setNotice("Đã cập nhật trạng thái."); } catch (error) { setNotice(error.message); } }}>Kiểm tra lại</button></article>
                {user?.role === "admin" && <article className="ki-card"><h3>Quản trị</h3><p className="ki-muted">Mở Control Center để quản lý model, knowledge và người dùng.</p><button onClick={onOpenAdmin}>Mở Admin →</button></article>}
              </div></section>
            )}
          </div>
        </div>

        {page === "chat" && (
          <footer className="ki-composer-area">
            <form className="ki-composer" onSubmit={sendMessage}>
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendMessage(); } }} placeholder="Hỏi Kikial bất cứ điều gì…" rows="1" maxLength="12000" disabled={busy} />
              <div className="ki-actions"><span className="ki-muted">Enter để gửi · Shift+Enter xuống dòng</span>{busy ? <button type="button" onClick={() => controllerRef.current?.abort()}>■ Dừng</button> : <button type="submit" disabled={!input.trim()}>Gửi ↑</button>}</div>
            </form>
            <p className="ki-disclaimer">Kikial có thể sai. Với thông tin quan trọng hoặc mới nhất, hãy kiểm tra nguồn.</p>
          </footer>
        )}
      </main>
    </div>
  );
}
