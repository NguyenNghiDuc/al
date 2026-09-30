import { OllamaProvider } from "./ollamaProvider.js";

let provider;

export function getModelProvider() {
  if (!provider) {
    provider = new OllamaProvider({
      // Chỉ có OllamaProvider — không cần nhánh theo AI_PROVIDER. AI_API_URL là biến
      // cũ (kiểu OpenAI, có sẵn "/v1/chat/completions") — dùng nhầm ở đây sẽ ra URL
      // hỏng dạng ".../v1/chat/completions/api/chat" và khiến model luôn báo offline.
      baseUrl: process.env.AI_BASE_URL || "http://127.0.0.1:11434",
      model: process.env.AI_MODEL || "llama3.2:3b",
      embeddingModel: process.env.AI_EMBEDDING_MODEL || "nomic-embed-text",
      temperature: process.env.AI_TEMPERATURE,
      timeoutMs: process.env.AI_TIMEOUT_MS,
    });
  }
  return provider;
}

export function resetModelProvider() {
  provider = null;
}