import { createHash } from "node:crypto";
import { embedMany, embedText } from "./embeddingService.js";
import { rerank } from "./reranker.js";
import { vectorStore } from "./vectorStore.js";
import { getKnowledge, getLearned } from "../../../lib/learningMemory.js";

let initialized = false;
const signature = (item) => createHash("sha1").update(`${item.id}:${item.updatedAt || item.learnedAt || ""}:${item.question}:${item.answer}`).digest("hex");

export async function reindexKnowledge() {
  const items = [...getKnowledge(), ...getLearned().filter((item) => item.verified)];
  const vectors = await embedMany(items.map((item) => `${item.question}\n${item.answer}`));
  await vectorStore.reindex(items.map((item, index) => ({
    id: item.id,
    store: item.store,
    source: item.store === "learned" ? "LEARNED_VERIFIED" : "CURATED",
    question: item.question,
    answer: item.answer,
    topic: item.topic || "",
    verified: item.verified,
    updatedAt: item.updatedAt,
    signature: signature(item),
    vector: vectors[index],
  })));
  initialized = true;
  return items.length;
}

export async function initializeRetriever() {
  if (initialized) return;
  const count = await vectorStore.count();
  const expected = getKnowledge().length + getLearned().filter((item) => item.verified).length;
  if (count !== expected) await reindexKnowledge(); else initialized = true;
}

export async function searchKnowledge(question, limit = 5, { queries = [] } = {}) {
  await initializeRetriever();
  const searchQueries = [...new Set([question, ...queries])].slice(0, 3);
  const semantic = [];
  for (const query of searchQueries) {
    const vector = await embedText(query);
    semantic.push(...await vectorStore.search(vector, Math.max(limit * 5, 20)));
  }
  const lexicalPool = [...getKnowledge(), ...getLearned().filter((item) => item.verified)].map((item) => ({ ...item, similarity: 0 }));
  const merged = new Map([...semantic, ...lexicalPool].map((item) => [item.id, item]));
  return rerank(question, [...merged.values()], limit);
}

export async function vectorCount() { await initializeRetriever(); return vectorStore.count(); }
