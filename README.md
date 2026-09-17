# 🤖 Kikial AI

**Kikial** là dự án trợ lý AI cá nhân được xây dựng theo hướng **local-first, open-source và có khả năng mở rộng**.

Mục tiêu của Kikial không chỉ là tạo một chatbot hỏi đáp đơn giản, mà xây dựng một hệ thống AI có thể trò chuyện, ghi nhớ người dùng, truy xuất kiến thức, hỗ trợ lập trình và sử dụng các công cụ để giải quyết những yêu cầu phức tạp hơn.

---

## ✨ Tính năng

Kikial đang được phát triển với các khả năng:

- 💬 Trò chuyện với AI
- 🧠 Knowledge Base
- 📚 RAG (Retrieval-Augmented Generation)
- 🧩 Local / Open-source LLM
- 👤 Ghi nhớ thông tin người dùng
- 💾 Lưu lịch sử trò chuyện
- 🎓 Trợ lý học tập
- 💻 Hỗ trợ lập trình
- 🧮 Tính toán chính xác bằng Calculator
- 👍👎 Feedback cho câu trả lời
- 📖 Learned Knowledge
- ✅ Kiểm duyệt kiến thức đã học
- 🔐 Đăng ký / đăng nhập
- 🛡️ Phân quyền người dùng và Admin
- 📊 Theo dõi Knowledge / Learned Knowledge
- 🛠️ Kiến trúc có thể mở rộng thêm AI Tools và Agents

---

## 🧠 Kiến trúc AI

Luồng xử lý chính của Kikial được thiết kế theo hướng:

```text
Người dùng
    ↓
Kikial Web
    ↓
Backend API
    ↓
AI Orchestrator
    ↓
┌─────────────────────────────┐
│ Query / Intent Analysis     │
│ User Memory                 │
│ Knowledge Retrieval         │
│ RAG                         │
│ Calculator / AI Tools       │
│ Conversation Context        │
└─────────────────────────────┘
    ↓
Local / Open-source LLM
    ↓
Response
    ↓
Verification / Learning
    ↓
Người dùng
```

Kikial ưu tiên sử dụng mô hình AI chạy local để giảm sự phụ thuộc vào API AI trả phí.

---

## 🧠 Hệ thống kiến thức

Kikial tách dữ liệu thành nhiều loại khác nhau.

```text
knowledge.json
```

Chứa kiến thức nền / kiến thức đã được kiểm soát.

```text
learned.json
```

Chứa kiến thức Kikial thu được trong quá trình sử dụng.

```text
userMemory.json
```

Chứa memory liên quan đến từng người dùng.

```text
users.json
```

Chứa dữ liệu tài khoản của hệ thống.

> Learned Knowledge và việc lưu Memory/RAG không đồng nghĩa với việc tự huấn luyện lại trọng số của mô hình LLM.

---

## 🧩 Công nghệ

### Frontend

- React
- JavaScript
- HTML
- CSS

### Backend

- Node.js
- Node.js HTTP server
- REST API

### AI

- Local / Open-source LLM
- RAG
- Knowledge Retrieval
- Persistent Memory
- AI Context
- Learning Memory

---

## 📁 Cấu trúc project

```text
al/
└── kikial/
    ├── backend/
    │   ├── data/
    │   │   ├── knowledge.json
    │   │   ├── learned.json
    │   │   ├── userMemory.json
    │   │   └── users.json
    │   │
    │   ├── lib/
    │   │   ├── calculator.js
    │   │   └── learningMemory.js
    │   │
    │   └── src/
    │       ├── config/
    │       ├── controllers/
    │       ├── middleware/
    │       ├── routes/
    │       ├── services/
    │       └── server.js
    │
    └── web/
        ├── src/
        │   ├── pages/
        │   ├── components/
        │   ├── styles/
        │   └── ...
        │
        └── package.json
```

> Cấu trúc có thể thay đổi trong quá trình phát triển Kikial.

---

# 🚀 Chạy Kikial

## 1. Clone repository

```bash
git clone https://github.com/NguyenNghiDuc/al.git
cd al
```

---

## 2. Chạy Backend

```bash
cd kikial/backend
npm install
node src/server.js
```

Backend sẽ khởi động API của Kikial.

---

## 3. Chạy Frontend

Mở terminal khác:

```bash
cd kikial/web
npm install
npm run dev
```

Sau đó mở địa chỉ mà terminal của frontend hiển thị.

---

# ⚙️ Environment

Các cấu hình riêng của máy nên được đặt trong `.env`.

Ví dụ:

```env
PORT=4000
AUTH_SECRET=your-secret

AI_API_URL=http://127.0.0.1:11434
AI_MODEL=your-local-model
```

Không commit `.env`, token, password hoặc secret lên GitHub.

---

# 🔌 API

Một số API chính của Kikial:

```text
POST /api/chat
GET  /api/health
```

Ngoài ra project có thể có thêm API cho:

```text
Authentication
Knowledge
Learned Knowledge
User Memory
Admin
Feedback
```

Danh sách endpoint có thể thay đổi trong quá trình phát triển.

---

# 🧮 Calculator

Kikial có bộ xử lý riêng cho các phép tính để hạn chế việc LLM tự tính sai.

Ví dụ:

```text
25 + 10 * 3
→ 55

20% của 5 triệu
→ 1.000.000

1250000 giảm 17%
→ 1.037.500
```

---

# 🧠 Memory

Kikial có thể lưu một số thông tin hữu ích của người dùng để sử dụng trong các cuộc trò chuyện sau.

Ví dụ:

```text
Người dùng:
Nhớ rằng tên tôi là Đức.

Kikial:
Đã ghi nhớ.

Người dùng:
Tên tôi là gì?

Kikial:
Tên của bạn là Đức.
```

Memory được thiết kế tách biệt giữa các tài khoản.

---

# 📚 RAG

Kikial sử dụng kiến thức đã lưu để bổ sung context cho mô hình AI.

```text
User Question
      ↓
Knowledge Search
      ↓
Relevant Knowledge
      ↓
Context
      ↓
Local LLM
      ↓
Answer
```

Điều này giúp Kikial tận dụng kiến thức riêng của hệ thống thay vì chỉ phụ thuộc vào kiến thức có sẵn trong mô hình.

---

# 🔮 Định hướng phát triển

Các hướng phát triển tiếp theo của Kikial:

- Semantic Search
- Embeddings
- Vector Database
- Hybrid RAG
- Reranking
- Advanced User Memory
- Conversation Memory
- Tool Calling
- AI Orchestrator
- Coding Agent
- Document Agent
- Research Agent
- Tutor Agent
- Document Analysis
- AI Verification
- Hallucination Reduction
- Streaming Response
- AI Evaluation System
- Web Search
- Mobile App

---

# 🎯 Mục tiêu

Mục tiêu dài hạn của Kikial là xây dựng một trợ lý AI có thể:

```text
Hiểu
  ↓
Suy luận
  ↓
Tìm kiến thức
  ↓
Ghi nhớ
  ↓
Sử dụng công cụ
  ↓
Kiểm tra kết quả
  ↓
Học từ dữ liệu đã được xác minh
  ↓
Trả lời
```

Kikial hướng tới khả năng hoạt động với các mô hình AI nguồn mở và có thể mở rộng mà không phụ thuộc hoàn toàn vào một nhà cung cấp AI duy nhất.

---

# 👨‍💻 Author

**Nguyễn Nghị Đức**

Information Technology

GitHub: NguyenNghiDuc

---

## 🔧 Backend Commands

The backend is Node.js ES Modules and uses no paid AI API for core behavior.

```bash
cd kikial/backend
npm test
npm run eval
npm run reindex
```

For local generation, run Ollama and configure:

```env
PORT=4000
AUTH_SECRET=replace-with-a-long-random-secret
AI_PROVIDER=ollama
AI_BASE_URL=http://127.0.0.1:11434
AI_MODEL=llama3.2:3b
AI_EMBEDDING_MODEL=nomic-embed-text
AI_TIMEOUT_MS=30000
```

Kikial degrades to deterministic calculator, lexical retrieval, local hashed embeddings, and safe fallbacks when Ollama is offline. It never claims to have performed web search or arbitrary code execution without a real provider.

The V1 regression suite has 50 cases. Reports are written to `kikial/backend/evals/reports/` and include the baseline and after metrics.

## 🧠 Intelligence V2

The active backend pipeline now includes:

- Query rewriting for context-dependent follow-ups and bounded multi-query retrieval.
- Hybrid lexical/Ollama embedding retrieval with local fallback, reranking, compression, provenance, and a lightweight knowledge graph.
- Temporal structured memory with `ACTIVE`/`SUPERSEDED` records and user isolation.
- Structured tools, bounded parallel planner execution, safe code-context indexing, document-scoped search, verification, confidence, and SSE events.
- The V2 evaluation contains 100 real cases. The final report is `kikial/backend/evals/reports/after-v2.json`.

Runtime vector, graph, and document indexes are generated locally by `npm run reindex` or by backend startup; they are not model-weight training.

## 🧪 Training & Improvement V4

```text
EVAL / CHAT
  ↓
Failure Analyzer
  ↓
Privacy + Quality Gate
  ↓
Versioned Dataset
  ↓
Offline SFT / LoRA / QLoRA Environment
  ↓
Held-out Benchmark
  ↓
Promotion Gate or Rollback
```

Useful commands:

```bash
cd kikial/backend
npm run training:prepare
npm run training:validate
npm run training:inspect
npm run training:export:sft
npm run training:export:preference
npm run improvement:report
npm run benchmark:model
npm run model:list
```

Runtime chat never performs gradient updates. Personal memory, private documents, secrets, and user conversations are not automatically exported into global training data. `npm run training:run` currently exits with `TRAINING EXECUTION: NOT RUN` because no verified Python/PyTorch/PEFT/GPU backend is configured.

RAG, embeddings, learned knowledge, and memory are not fine-tuning.

## 🧭 Intelligence V3

V3 adds adaptive reasoning levels and per-request budgets, reference/entity resolution, evidence packs, answer composition, task resume state, temporal memory correction/negation handling, opt-in observability, and V3 regression coverage. The measured V3 report is `kikial/backend/evals/reports/after-v3.json`.

When Ollama is unavailable, `/api/health` reports `MODEL_OFFLINE`, `EMBEDDING_OFFLINE`, and the deterministic/local degraded path remains active.

## 📌 Project Status

```text
Kikial AI — In Development 🚧
```

Dự án đang được tiếp tục phát triển và hoàn thiện.