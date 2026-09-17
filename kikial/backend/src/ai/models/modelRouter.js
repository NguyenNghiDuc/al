import { OllamaProvider } from "./ollamaProvider.js";

let provider;

export function getModelProvider() {
  if (!provider) {
    provider = new OllamaProvider({
      baseUrl: process.env.AI_BASE_URL || (process.env.AI_PROVIDER === "ollama" ? "http://127.0.0.1:11434" : process.env.AI_API_URL),
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
