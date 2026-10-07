import { OllamaProvider } from "./ollamaProvider.js";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider.js";
import { getActiveModel } from "./modelRegistry.js";

let provider;
let providerKey;
let autoModelCache = { key: null, model: null, expiresAt: 0 };

function normalizeProvider(value) {
  const name = String(value || "ollama").trim().toLowerCase();
  if (["openai", "openai-compatible", "openai_compatible", "lmstudio", "vllm", "llamacpp"].includes(name)) return "openai-compatible";
  return name;
}

function modelStrength(name = "") {
  const text = String(name).toLowerCase();
  if (/embed|embedding|nomic|bge|e5-|minilm/.test(text)) return -1000;
  const size = Number(text.match(/(?:^|[-_:])(\d+(?:\.\d+)?)b(?:[-_:]|$)/)?.[1] || 0);
  let score = Math.min(size, 72) * 10;
  if (/coder|codeqwen|deepseek-coder/.test(text)) score += 10;
  if (/qwen3|qwen2\.5|llama3\.3|llama3\.2|gemma3|mistral|deepseek/.test(text)) score += 8;
  if (/instruct|chat/.test(text)) score += 4;
  if (/vision|vl/.test(text)) score -= 2;
  return score;
}

export function chooseStrongestInstalledModel(models = [], fallback = "llama3.2:3b") {
  const names = models.map((item) => typeof item === "string" ? item : item?.name).filter(Boolean);
  const ranked = names.map((name) => ({ name, score: modelStrength(name) })).filter((item) => item.score > -1000)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return ranked[0]?.name || fallback;
}

export function selectModelHint(analysis = {}, env = process.env) {
  if (analysis.intent === "CODING" && env.AI_CODING_MODEL) return env.AI_CODING_MODEL;
  if ((analysis.intent === "RESEARCH" || analysis.complexity === "HIGH") && env.AI_REASONING_MODEL) return env.AI_REASONING_MODEL;
  if (analysis.intent === "SIMPLE_CHAT" && env.AI_FAST_MODEL) return env.AI_FAST_MODEL;
  return "";
}

async function resolveOllamaModel(baseUrl, configuredModel, preferredModel = "") {
  const auto = String(process.env.AI_MODEL_AUTO || "true").toLowerCase() !== "false";
  if (!auto && !preferredModel) return configuredModel;
  const cacheKey = `${baseUrl}:${configuredModel}:${preferredModel}:${auto}`;
  if (autoModelCache.key === cacheKey && autoModelCache.expiresAt > Date.now()) return autoModelCache.model;
  try {
    const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(1800) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return configuredModel;
    const names = (data.models || []).map((item) => typeof item === "string" ? item : item?.name).filter(Boolean);
    const preferred = String(preferredModel || "").trim();
    const preferredInstalled = preferred && names.some((name) => name === preferred || name === `${preferred}:latest` || preferred === `${name}:latest`);
    const model = preferredInstalled ? preferred : (auto ? chooseStrongestInstalledModel(names, configuredModel) : configuredModel);
    autoModelCache = { key: cacheKey, model, expiresAt: Date.now() + 60_000 };
    return model;
  } catch {
    return configuredModel;
  }
}

export async function getModelProvider({ analysis = {} } = {}) {
  const active = await getActiveModel();
  const providerName = normalizeProvider(active?.provider || process.env.AI_PROVIDER || "ollama");
  const defaultBase = providerName === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234/v1";
  const defaultModel = providerName === "ollama" ? "llama3.2:3b" : "local-model";
  const registryPinned = Boolean(active && active.id !== "ollama-default" && active.status === "ACTIVE");
  const configuredModel = registryPinned
    ? active.baseModel
    : process.env.AI_MODEL || active?.baseModel || defaultModel;
  const baseUrl = active?.baseUrl || process.env.AI_BASE_URL || defaultBase;
  const preferredModel = registryPinned ? "" : selectModelHint(analysis);
  const model = providerName === "ollama"
    ? (registryPinned ? configuredModel : await resolveOllamaModel(baseUrl, configuredModel, preferredModel))
    : (preferredModel || configuredModel);
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
  autoModelCache = { key: null, model: null, expiresAt: 0 };
}
