import { OllamaProvider } from "./ollamaProvider.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { getActiveModel } from "./modelRegistry.js";

let provider;
let providerKey;

function normalizeProvider(value) {
  const name = String(value || "ollama").trim().toLowerCase();
  if (["openai", "openai-compatible", "openai_compatible", "lmstudio", "vllm", "llamacpp"].includes(name)) return "openai-compatible";
  return name;
}

export async function getModelProvider() {
  const active = await getActiveModel();
  const providerName = normalizeProvider(active?.provider || process.env.AI_PROVIDER || "ollama");
  const defaultBase = providerName === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234/v1";
  const defaultModel = providerName === "ollama" ? "llama3.2:3b" : "local-model";
  const model = active?.baseModel || process.env.AI_MODEL || defaultModel;
  const baseUrl = active?.baseUrl || process.env.AI_BASE_URL || defaultBase;
  const embeddingModel = active?.embeddingModel || process.env.AI_EMBEDDING_MODEL || (providerName === "ollama" ? "nomic-embed-text" : model);
  const apiKey = process.env.AI_API_KEY || "";
  const nextKey = `${active?.id || "environment"}:${providerName}:${model}:${baseUrl}:${embeddingModel}:${Boolean(apiKey)}`;

  if (provider && providerKey === nextKey) return provider;

  const common = {
    baseUrl,
    model,
    embeddingModel,
    temperature: process.env.AI_TEMPERATURE,
    timeoutMs: process.env.AI_TIMEOUT_MS,
  };

  if (providerName === "ollama") {
    provider = new OllamaProvider(common);
  } else if (providerName === "openai-compatible") {
    provider = new OpenAICompatibleProvider({ ...common, apiKey });
  } else {
    const error = new Error(`Unsupported model provider: ${providerName}`);
    error.code = "UNSUPPORTED_MODEL_PROVIDER";
    throw error;
  }

  providerKey = nextKey;
  return provider;
}

export function resetModelProvider() {
  provider = null;
  providerKey = null;
}
