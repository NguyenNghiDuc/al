const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
const STOP_WORDS = new Set(["la", "gi", "cua", "cho", "toi", "minh", "ban", "mot", "nhung", "cac", "va", "voi", "nay", "kia", "do", "thi", "ma", "co", "duoc", "lam", "dung", "de", "nao", "thuong", "the", "nho", "hay", "ve"]);
const tokenArray = (value) => normalize(value).replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((item) => item.length > 2 && !STOP_WORDS.has(item));
const tokens = (value) => new Set(tokenArray(value));

function bm25Scores(question, candidates) {
  const queryTokens = [...tokens(question)];
  if (!queryTokens.length || !candidates.length) return candidates.map(() => 0);
  const docs = candidates.map((item) => tokenArray(`${item.question || item.title || item.filename || ""} ${item.answer || item.text || item.content || ""}`));
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(docs.length, 1);
  const documentFrequency = new Map();
  for (const term of queryTokens) {
    documentFrequency.set(term, docs.reduce((count, doc) => count + (doc.includes(term) ? 1 : 0), 0));
  }
  const k1 = 1.2;
  const b = 0.75;
  const raw = docs.map((doc) => {
    const frequencies = new Map();
    for (const token of doc) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    let score = 0;
    for (const term of queryTokens) {
      const tf = frequencies.get(term) || 0;
      if (!tf) continue;
      const df = documentFrequency.get(term) || 0;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      const denominator = tf + k1 * (1 - b + b * (doc.length / Math.max(avgLength, 1)));
      score += idf * ((tf * (k1 + 1)) / denominator);
    }
    return score;
  });
  const max = Math.max(...raw, 0);
  return raw.map((score) => max > 0 ? score / max : 0);
}

function sourceQuality(item) {
  if (item.verified) return 1;
  if (Number.isFinite(Number(item.trust))) return Math.max(0, Math.min(1, Number(item.trust)));
  const type = String(item.sourceType || "").toLowerCase();
  if (type === "graph" || type === "document") return 0.9;
  if (type === "web") return 0.65;
  if (item.store === "knowledge") return 1;
  return 0.7;
}

export function rerank(question, candidates, limit = 5) {
  const query = normalize(question);
  const queryTokens = tokens(question);
  const bm25 = bm25Scores(question, candidates);
  return candidates.map((item, index) => {
    const title = normalize(item.question || item.title || item.filename || "");
    const answer = normalize(item.answer || item.text || item.content || "");
    let titleOverlap = 0;
    let answerOverlap = 0;
    const titleTokens = tokens(title);
    const answerTokens = tokens(answer);
    for (const token of queryTokens) {
      if (titleTokens.has(token)) titleOverlap += 1;
      else if (answerTokens.has(token)) answerOverlap += 1;
    }
    const lexical = queryTokens.size ? (titleOverlap + answerOverlap * 0.25) / queryTokens.size : 0;
    const exact = query && query === title ? 1 : title && (title.includes(query) || query.includes(title)) ? 0.8 : 0;
    const topic = queryTokens.size && [...queryTokens].some((token) => title.includes(token)) ? 1 : 0;
    const entity = [...queryTokens].filter((token) => token.length >= 4 && titleTokens.has(token)).length ? 1 : 0;
    const verified = item.verified ? 1 : 0;
    const semantic = Math.max(0, Math.min(1, Number(item.similarity ?? item.score ?? 0)));
    const quality = sourceQuality(item);
    const score = exact * 0.24 + bm25[index] * 0.28 + lexical * 0.18 + semantic * 0.18 + topic * 0.04 + entity * 0.04 + verified * 0.02 + quality * 0.02;
    return { ...item, score, lexicalScore: lexical, bm25Score: bm25[index], entityMatch: entity, sourceQuality: quality, sourceType: item.sourceType || (item.store === "learned" ? "LEARNED_VERIFIED" : "CURATED") };
  }).filter((item) => item.score >= Number(process.env.MIN_RELEVANCE_SCORE || 0.24))
    .sort((a, b) => b.score - a.score || (b.hits || 0) - (a.hits || 0)).slice(0, limit);
}
