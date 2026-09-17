const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
const STOP_WORDS = new Set(["la", "gi", "cua", "cho", "toi", "minh", "ban", "mot", "nhung", "cac", "va", "voi", "nay", "kia", "do", "thi", "ma", "co", "duoc", "lam", "dung", "de", "nao", "thuong", "the", "nho", "hay", "ve"]);
const tokens = (value) => new Set(normalize(value).replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((item) => item.length > 2 && !STOP_WORDS.has(item)));

export function rerank(question, candidates, limit = 5) {
  const query = normalize(question);
  const queryTokens = tokens(question);
  return candidates.map((item) => {
    const title = normalize(item.question);
    const answer = normalize(item.answer);
    let titleOverlap = 0;
    let answerOverlap = 0;
    const titleTokens = tokens(title);
    const answerTokens = tokens(answer);
    for (const token of queryTokens) {
      if (titleTokens.has(token)) titleOverlap += 1;
      else if (answerTokens.has(token)) answerOverlap += 1;
    }
    const lexical = queryTokens.size ? (titleOverlap + answerOverlap * 0.2) / queryTokens.size : 0;
    const exact = query === title ? 1 : title.includes(query) || query.includes(title) ? 0.8 : 0;
    const topic = queryTokens.size && [...queryTokens].some((token) => title.includes(token)) ? 1 : 0;
    const entity = [...queryTokens].filter((token) => token.length >= 4 && titleTokens.has(token)).length ? 1 : 0;
    const verified = item.verified ? 1 : 0;
    const semantic = Number(item.similarity || 0);
    const sourceQuality = item.sourceType === "GRAPH" ? 0.9 : item.store === "knowledge" || item.verified ? 1 : 0.7;
    const score = exact * 0.4 + lexical * 0.3 + semantic * 0.12 + topic * 0.06 + entity * 0.07 + verified * 0.03 + sourceQuality * 0.02;
    return { ...item, score, lexicalScore: lexical, entityMatch: entity, sourceType: item.sourceType || (item.store === "learned" ? "LEARNED_VERIFIED" : "CURATED") };
  }).filter((item) => item.score >= Number(process.env.MIN_RELEVANCE_SCORE || 0.24))
    .sort((a, b) => b.score - a.score || (b.hits || 0) - (a.hits || 0)).slice(0, limit);
}
