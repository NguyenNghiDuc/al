const fold = (value) => String(value || "")
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase();

const tokens = (value) => fold(value)
  .match(/[\p{L}\p{N}_-]{2,}/gu) || [];

function cleanText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(block) {
  const matches = String(block).match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/gu);
  return (matches || [block]).map((item) => item.trim()).filter(Boolean);
}

function splitLongSentence(sentence, maxChars) {
  if (sentence.length <= maxChars) return [sentence];
  const parts = [];
  let rest = sentence;
  while (rest.length > maxChars) {
    let cut = Math.max(rest.lastIndexOf(";", maxChars), rest.lastIndexOf(",", maxChars), rest.lastIndexOf(" ", maxChars));
    if (cut < Math.floor(maxChars * 0.55)) cut = maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function smartChunkDocument(text, { maxChars = 1400, overlapChars = 180 } = {}) {
  const source = cleanText(text);
  if (!source) return [];
  const units = source
    .split(/\n{2,}/)
    .flatMap((block) => splitSentences(block))
    .flatMap((sentence) => splitLongSentence(sentence, maxChars));

  const chunks = [];
  let current = "";
  for (const unit of units) {
    const candidate = current ? `${current}\n${unit}` : unit;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current.trim());
    const overlap = current.slice(-overlapChars).replace(/^\S*\s*/, "").trim();
    current = overlap ? `${overlap}\n${unit}`.trim() : unit;
    if (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars).trim());
      current = current.slice(Math.max(0, maxChars - overlapChars)).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

export function rankDocumentChunks(chunks, query, limit = 5) {
  const queryTokens = [...new Set(tokens(query))];
  if (!queryTokens.length || !Array.isArray(chunks) || !chunks.length) return [];

  const docs = chunks.map((chunk) => {
    const list = tokens(chunk.text);
    const frequencies = new Map();
    for (const token of list) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    return { chunk, list, frequencies };
  });
  const avgLength = docs.reduce((sum, doc) => sum + doc.list.length, 0) / Math.max(docs.length, 1);
  const k1 = 1.35;
  const b = 0.72;

  return docs.map(({ chunk, list, frequencies }) => {
    let bm25 = 0;
    let matched = 0;
    for (const term of queryTokens) {
      const tf = frequencies.get(term) || 0;
      if (!tf) continue;
      matched += 1;
      const containing = docs.reduce((count, doc) => count + (doc.frequencies.has(term) ? 1 : 0), 0);
      const idf = Math.log(1 + (docs.length - containing + 0.5) / (containing + 0.5));
      const denominator = tf + k1 * (1 - b + b * (list.length / Math.max(avgLength, 1)));
      bm25 += idf * ((tf * (k1 + 1)) / Math.max(denominator, 0.001));
    }
    const coverage = matched / queryTokens.length;
    const phrase = fold(chunk.text).includes(fold(query).trim()) ? 1 : 0;
    const score = bm25 + coverage * 0.8 + phrase * 1.2;
    return { ...chunk, score, bm25Score: bm25, queryCoverage: coverage };
  })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex)
    .slice(0, Math.max(1, limit));
}
