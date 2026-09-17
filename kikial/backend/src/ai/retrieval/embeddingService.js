import { createHash } from "node:crypto";
import { getModelProvider } from "../models/modelRouter.js";

const cache = new Map();
const DIMENSIONS = 256;
const normalize = (text) => String(text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function localEmbedding(text) {
  const vector = new Array(DIMENSIONS).fill(0);
  const normalized = normalize(text);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    for (let index = 0; index < 4; index += 1) vector[digest[index] % DIMENSIONS] += 1 / (1 + token.length);
  }
  for (let index = 0; index < normalized.length - 2; index += 1) {
    const digest = createHash("sha1").update(normalized.slice(index, index + 3)).digest();
    vector[digest[0] % DIMENSIONS] += 0.15;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export async function embedText(text, { allowRemote = true } = {}) {
  const key = normalize(text);
  if (cache.has(key)) return cache.get(key);
  let vector = null;
  if (allowRemote && process.env.AI_EMBEDDING_OFFLINE !== "true") {
    try { vector = (await getModelProvider().embed(key))[0] || null; } catch { /* lexical/local fallback remains available */ }
  }
  vector ||= localEmbedding(key);
  cache.set(key, vector);
  return vector;
}

export async function embedMany(texts) {
  const missing = texts.filter((text) => !cache.has(normalize(text)));
  if (missing.length && process.env.AI_EMBEDDING_OFFLINE !== "true") {
    try {
      const vectors = await getModelProvider().embed(missing);
      missing.forEach((text, index) => cache.set(normalize(text), vectors[index] || localEmbedding(text)));
    } catch { /* use local deterministic vectors */ }
  }
  return Promise.all(texts.map((text) => embedText(text, { allowRemote: false })));
}

export function clearEmbeddingCache() { cache.clear(); }
