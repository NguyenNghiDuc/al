const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();

export function compressEvidence(items, query, budget = 5000) {
  const words = new Set(normalize(query).split(/\s+/).filter((word) => word.length > 2));
  const compressed = [];
  let used = 0;
  for (const item of items) {
    const text = String(item.text || item.answer || "");
    const sentences = text.split(/(?<=[.!?])\s+/);
    const selected = sentences.filter((sentence) => [...words].some((word) => normalize(sentence).includes(word)));
    const passage = (selected.length ? selected : sentences.slice(0, 2)).join(" ").slice(0, 1200);
    if (!passage || used + passage.length > budget) continue;
    compressed.push({ ...item, text: passage, compressed: true, provenance: { sourceType: item.sourceType || item.source || "UNKNOWN", sourceId: item.id || item.documentId || null, score: item.score || item.similarity || 0 } });
    used += passage.length;
  }
  return compressed;
}
