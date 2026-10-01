const normalizeText = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function selectEvidence(items, { maxChunks = Number(process.env.MAX_EVIDENCE_CHUNKS) || 5, maxChars = Number(process.env.MAX_EVIDENCE_CHARS) || 2800, minScore = Number(process.env.MIN_RELEVANCE_SCORE) || 0.24 } = {}) {
  const ranked = [...items].filter((entry) => Number(entry.score ?? entry.relevance ?? 0) >= minScore)
    .sort((left, right) => Number(right.score ?? right.relevance ?? 0) - Number(left.score ?? left.relevance ?? 0));
  const selected = [];
  let used = 0;
  for (const entry of ranked) {
    if (selected.length >= maxChunks || used >= maxChars) break;
    const content = String(entry.text || entry.answer || entry.content || "").trim();
    const normalized = normalizeText(content);
    if (!normalized) continue;
    const duplicate = selected.some((current) => {
      const existing = normalizeText(current.text);
      if (normalized === existing || (Math.min(normalized.length, existing.length) >= 80 && (normalized.includes(existing) || existing.includes(normalized)))) return true;
      const words = new Set(normalized.split(/\s+/));
      const existingWords = new Set(existing.split(/\s+/));
      const intersection = [...words].filter((word) => existingWords.has(word)).length;
      return intersection / Math.max(words.size + existingWords.size - intersection, 1) >= 0.9;
    });
    if (duplicate) continue;
    const remaining = maxChars - used;
    if (content.length > remaining && remaining < 200) continue;
    const text = content.slice(0, remaining);
    selected.push({ ...entry, text });
    used += text.length;
  }
  return selected;
}

export function createEvidencePack({ query, memory = [], knowledge = [], documents = [], experience = [], retrieved = [], toolResults = [], webResults = [], limits = {} }) {
  const item = (sourceType, sourceId, content, relevance = 0, trust = 0.5, timestamp = null, metadata = {}) => ({ sourceType, sourceId, content: String(content || ""), relevance: Number(relevance) || 0, score: Number(relevance) || 0, trust, timestamp, ...metadata });
  const selected = selectEvidence(retrieved, limits);
  const retrievedItems = selected.map((entry) => {
    const sourceType = String(entry.sourceType || "knowledge").toLowerCase();
    return item(sourceType, entry.sourceId || entry.id, entry.text, entry.score, sourceType === "document" ? 0.9 : entry.verified ? 1 : 0.8, entry.createdAt, {
      filename: entry.filename || null,
      chunkId: entry.chunkId || entry.id || null,
      ...(sourceType === "lesson" ? { lessonId: entry.lessonId || entry.id, confidence: entry.confidence || entry.score, provenance: entry.provenance || [] } : {}),
    });
  });
  const bySource = (sourceType) => retrievedItems.filter((entry) => entry.sourceType === sourceType);
  return {
    query,
    userMemories: memory.map((entry) => item("USER_MEMORY", entry.id || entry.key, entry.value, entry.score, 0.9, entry.updatedAt)),
    knowledge: [...knowledge.map((entry) => item(entry.sourceType || "CURATED", entry.id, entry.text || entry.answer, entry.score, entry.verified ? 1 : 0.8, entry.updatedAt)), ...retrievedItems.filter((entry) => ["knowledge", "verified_lesson", "lesson"].includes(entry.sourceType))],
    documents: [...documents.map((entry) => item("DOCUMENT", entry.documentId || entry.chunkId, entry.text, entry.score, 0.9, entry.createdAt)), ...bySource("document")],
    experience: [...experience.map((entry) => item("experience", entry.sourceId || entry.id, entry.text || entry.answer, entry.score, entry.trust || 0.7, entry.timestamp, { filename: entry.filename || null, chunkId: entry.chunkId || entry.id || null })), ...bySource("experience")],
    toolResults: toolResults.map((entry) => item("TOOL", entry.tool || entry.name, entry.data || entry.answer || entry, 1, 1)),
    webResults: webResults.map((entry) => item("WEB", entry.id, entry.content, entry.score, entry.trust || 0.4, entry.timestamp)),
  };
}

export function flattenEvidence(pack) { return Object.values(pack).filter(Array.isArray).flat(); }
