import { indexSource, retrieveCodeContext } from "./codeContextRetriever.js";

const indexes = new Map();

export function indexCodeContext(filename, text, language = "") {
  const index = indexSource(text, filename);
  const enriched = { ...index, language };
  indexes.set(filename, enriched);
  return enriched;
}

export function searchCodeContext(query, limit = 5) {
  return [...indexes.values()]
    .flatMap((index) => retrieveCodeContext(index, query, limit))
    .slice(0, limit);
}

export function clearCodeContext() {
  indexes.clear();
}
