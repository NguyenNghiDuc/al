import { OllamaProvider } from "./ollamaProvider.js";
import { getActiveModel } from "./modelRegistry.js";

let provider;
let providerKey;

export async function getModelProvider() {
  const active = await getActiveModel();
  const model = active?.baseModel || process.env.AI_MODEL || "llama3.2:3b";
  const providerName = active?.provider || process.env.AI_PROVIDER || "ollama";
  if (providerName !== "ollama") {
    const error = new Error(`Unsupported model provider: ${providerName}`);
    error.code = "UNSUPPORTED_MODEL_PROVIDER";
    throw error;
  }
  const baseUrl = active?.baseUrl || process.env.AI_BASE_URL || "http://127.0.0.1:11434";
  const embeddingModel = active?.embeddingModel || process.env.AI_EMBEDDING_MODEL || "nomic-embed-text";
  const nextKey = `${active?.id || "environment"}:${providerName}:${model}:${baseUrl}:${embeddingModel}`;
  if (!provider || providerKey !== nextKey) {
    provider = new OllamaProvider({ baseUrl, model, embeddingModel, temperature: process.env.AI_TEMPERATURE, timeoutMs: process.env.AI_TIMEOUT_MS });
    providerKey = nextKey;
  }
  return provider;
}

export function resetModelProvider() {
  provider = null;
  providerKey = null;
}
