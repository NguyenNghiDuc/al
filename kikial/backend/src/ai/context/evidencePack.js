export function createEvidencePack({ query, memory = [], knowledge = [], documents = [], toolResults = [], webResults = [] }) {
  const item = (sourceType, sourceId, content, relevance = 0, trust = 0.5, timestamp = null) => ({ sourceType, sourceId, content: String(content || ""), relevance: Number(relevance) || 0, trust, timestamp });
  return {
    query,
    userMemories: memory.map((entry) => item("USER_MEMORY", entry.id || entry.key, entry.value, entry.score, 0.9, entry.updatedAt)),
    knowledge: knowledge.map((entry) => item(entry.sourceType || "CURATED", entry.id, entry.text || entry.answer, entry.score, entry.verified ? 1 : 0.8, entry.updatedAt)),
    documents: documents.map((entry) => item("DOCUMENT", entry.documentId || entry.chunkId, entry.text, entry.score, 0.9, entry.createdAt)),
    toolResults: toolResults.map((entry) => item("TOOL", entry.tool || entry.name, entry.data || entry.answer || entry, 1, 1)),
    webResults: webResults.map((entry) => item("WEB", entry.id, entry.content, entry.score, entry.trust || 0.4, entry.timestamp)),
  };
}

export function flattenEvidence(pack) { return Object.values(pack).filter(Array.isArray).flat(); }
