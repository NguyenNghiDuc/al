# Kikial

## Chạy local

```bash
cd backend
npm start
```

Mở `http://localhost:4000`.

- Frontend: `web/`
- Backend API: `backend/`
- Health check: `http://localhost:4000/api/health`

## Chạy AI local

Cài Ollama, tải một model local, ví dụ:

```bash
ollama pull qwen2.5:0.5b
ollama serve
```
## Bộ nhớ tự học

Sau mỗi câu hỏi có câu trả lời thành công, Kikial lưu cặp hỏi/đáp vào `backend/data/learned.json`. Những kiến thức có từ khóa liên quan sẽ được đưa lại vào ngữ cảnh cho các câu hỏi sau. Dữ liệu này là bộ nhớ local, không làm thay đổi trọng số model.

Sao chép `backend/.env.example` thành `backend/.env`, rồi chạy:

```bash
cd backend
node --env-file=.env src/server.js
```

Kikial sẽ gọi Ollama tại `http://127.0.0.1:11434` và không cần API key. Model mặc định là `qwen2.5:0.5b` để chạy nhẹ trong môi trường dev. Muốn dùng provider online, đổi `AI_API_URL`, `AI_MODEL` và thêm `AI_API_KEY` trong `.env`.
