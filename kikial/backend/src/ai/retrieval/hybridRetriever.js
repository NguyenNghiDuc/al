import { createHash } from "node:crypto";
import { embedMany, embedText } from "./embeddingService.js";
import { rerank } from "./reranker.js";
import { vectorStore } from "./vectorStore.js";
import { getKnowledge, getLearned } from "../../../lib/learningMemory.js";
import { searchDocuments } from "../../services/documentService.js";
import { listVerifiedLessons } from "../experience/experienceStore.js";

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
  const merged = new Map(lexicalPool.map((item) => [item.id, item]));
  semantic.forEach((item) => merged.set(item.id, { ...merged.get(item.id), ...item }));
  return rerank(question, [...merged.values()], limit);
}

export async function retrieveFromExperience(query, { userId, limit } = {}) {
  return [];
}

export async function retrieveVerifiedLessons(query, limit = 5) {
  const lessons = await listVerifiedLessons();
  return rerank(query, lessons.map((lesson) => ({
    id: lesson.lessonId,
    sourceId: lesson.lessonId,
    lessonId: lesson.lessonId,
    sourceType: "lesson",
    question: lesson.problemPattern,
    answer: lesson.correction,
    text: lesson.correction,
    score: lesson.confidence,
    similarity: lesson.confidence,
    confidence: lesson.confidence,
    provenance: lesson.evidenceRefs,
    verified: lesson.status === "verified",
  })), limit);
}

function deduplicateCandidates(candidates) {
  const ranked = [...candidates].sort((left, right) => Number(right.similarity || 0) - Number(left.similarity || 0));
  const selected = [];
  for (const candidate of ranked) {
    const text = String(candidate.text || candidate.answer || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!text) continue;
    const words = new Set(text.split(/\s+/).filter(Boolean));
    const duplicate = selected.some((existing) => {
      const other = String(existing.text || existing.answer || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (text === other || (Math.min(text.length, other.length) >= 80 && (text.includes(other) || other.includes(text)))) return true;
      const otherWords = new Set(other.split(/\s+/).filter(Boolean));
      const intersection = [...words].filter((word) => otherWords.has(word)).length;
      return intersection / Math.max(words.size + otherWords.size - intersection, 1) >= 0.9;
    });
    if (!duplicate) selected.push(candidate);
  }
  return selected;
}

export async function retrieveEvidence({ userId, query, queries = [], limit = 5, onMetrics, documentRetriever = searchDocuments, knowledgeRetriever = searchKnowledge, experienceRetriever = retrieveFromExperience, lessonRetriever = retrieveVerifiedLessons } = {}) {
  const searchQueries = [...new Set([query, ...queries].filter(Boolean))].slice(0, 3);
  const knowledgeItems = await Promise.all(searchQueries.map((term) => knowledgeRetriever(term, limit * 3)));
  const documentItems = await Promise.all(searchQueries.map((term) => documentRetriever(userId, term, limit * 3)));
  const lessonItems = await Promise.all(searchQueries.map((term) => lessonRetriever(term, limit * 3)));
  const experienceItems = await experienceRetriever(query, { userId, limit: limit * 3 });
  const candidates = [
    ...knowledgeItems.flat().map((item) => ({ ...item, sourceId: item.id, sourceType: item.store === "learned" && item.verified ? "verified_lesson" : "knowledge", text: item.answer, similarity: item.similarity || item.score || 0 })),
    ...documentItems.flat().map((item) => ({ ...item, id: item.chunkId || `${item.documentId}:${item.chunkIndex}`, sourceId: item.documentId, sourceType: "document", filename: item.filename, chunkId: item.chunkId || `${item.documentId}:${item.chunkIndex}`, question: item.filename, answer: item.text, similarity: item.score })),
    ...lessonItems.flat().map((item) => ({ ...item, sourceId: item.lessonId || item.sourceId || item.id, lessonId: item.lessonId || item.id, sourceType: "lesson", text: item.text || item.correction || item.answer, answer: item.correction || item.answer, similarity: item.similarity || item.score || 0 })),
    ...experienceItems.map((item) => ({ ...item, sourceId: item.sourceId || item.id, sourceType: "experience", similarity: item.similarity || item.score || 0 })),
  ];
  const deduplicated = deduplicateCandidates(candidates);
  const ranked = rerank(query, deduplicated, limit);
  onMetrics?.({ retrieved: candidates.length, deduplicated: deduplicated.length, reranked: ranked.length });
  return ranked;
}

export async function vectorCount() { await initializeRetriever(); return vectorStore.count(); }
