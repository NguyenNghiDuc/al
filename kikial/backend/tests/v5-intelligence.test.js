import test from "node:test";
import assert from "node:assert/strict";
import { chooseStrongestInstalledModel, selectModelHint } from "../src/ai/models/modelRouter.js";
import { normalizeWebResults } from "../src/ai/retrieval/webSearch.js";
import { rerank } from "../src/ai/retrieval/reranker.js";
import { createEvidencePack, flattenEvidence } from "../src/ai/context/evidencePack.js";
import { composeAnswer } from "../src/ai/response/answerComposer.js";

function withEnv(values, fn) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test("auto model selection prefers stronger chat models and ignores embeddings", () => {
  const selected = chooseStrongestInstalledModel([
    "nomic-embed-text:latest",
    "llama3.2:3b",
    "qwen3:8b",
    "qwen3:14b",
  ], "llama3.2:3b");
  assert.equal(selected, "qwen3:14b");
});

test("web result normalization removes trackers duplicates blocked domains and limits domain concentration", async () => {
  await withEnv({ WEB_SEARCH_BLOCK_DOMAINS: "spam.example", WEB_SEARCH_MAX_PER_DOMAIN: "1", WEB_SEARCH_ALLOW_DOMAINS: undefined }, () => {
    const results = normalizeWebResults([
      { title: "Official docs", url: "https://developer.mozilla.org/docs?a=1&utm_source=test", content: "Useful" },
      { title: "Duplicate", url: "https://developer.mozilla.org/docs?a=1&utm_source=other", content: "Duplicate" },
      { title: "Spam", url: "https://spam.example/post", content: "Bad" },
      { title: "Another", url: "https://example.org/post", content: "Good" },
    ], "javascript latest", 5);
    assert.equal(results.length, 2);
    assert.equal(results[0].domain, "developer.mozilla.org");
    assert.ok(!results[0].url.includes("utm_source"));
    assert.ok(results[0].trust > results[1].trust);
  });
});

test("BM25-style reranking rewards the candidate that actually contains the query terms", () => {
  const ranked = rerank("PostgreSQL index performance", [
    { id: "noise", question: "Database tips", answer: "General database notes", similarity: 0.8 },
    { id: "match", question: "PostgreSQL index performance", answer: "Indexes can improve PostgreSQL query performance", similarity: 0.35, verified: true },
  ], 2);
  assert.equal(ranked[0].id, "match");
  assert.ok(ranked[0].bm25Score > 0);
});

test("web provenance survives evidence packing and becomes a visible citation", () => {
  const pack = createEvidencePack({
    query: "latest docs",
    retrieved: [{ sourceId: "https://example.org/a", sourceType: "web", title: "Example source", url: "https://example.org/a", domain: "example.org", text: "Fresh evidence", score: 0.9, trust: 0.8 }],
  });
  const evidence = flattenEvidence(pack);
  const composed = composeAnswer("Câu trả lời có nguồn.", { analysis: { complexity: "LOW" }, confidence: { level: "HIGH" }, evidence });
  assert.match(composed.content, /Nguồn tham khảo:/);
  assert.match(composed.content, /https:\/\/example\.org\/a/);
});


test("model hint routing prefers specialized models by task", () => {
  const env = {
    AI_CODING_MODEL: "qwen2.5-coder:7b",
    AI_REASONING_MODEL: "qwen2.5:14b",
    AI_FAST_MODEL: "llama3.2:3b",
  };
  assert.equal(selectModelHint({ intent: "CODING", complexity: "MEDIUM" }, env), "qwen2.5-coder:7b");
  assert.equal(selectModelHint({ intent: "RESEARCH", complexity: "HIGH" }, env), "qwen2.5:14b");
  assert.equal(selectModelHint({ intent: "FACTUAL", complexity: "HIGH" }, env), "qwen2.5:14b");
  assert.equal(selectModelHint({ intent: "SIMPLE_CHAT", complexity: "LOW" }, env), "llama3.2:3b");
  assert.equal(selectModelHint({ intent: "FACTUAL", complexity: "LOW" }, env), "");
});
