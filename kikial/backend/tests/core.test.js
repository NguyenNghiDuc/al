import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/calculator.js";
import { rerank } from "../src/ai/retrieval/reranker.js";
import { analyzeQuery } from "../src/ai/query/queryAnalyzer.js";
import { buildContext } from "../src/ai/context/contextBuilder.js";
import { extractCandidateMemories } from "../src/ai/memory/memoryManager.js";
import { executeTool } from "../src/ai/tools/index.js";
import { codingAgent } from "../src/ai/agents/codingAgent.js";

const answer = (question) => calculate(question)?.answer;

test("calculator preserves Vietnamese deterministic cases", () => {
  assert.match(answer("25 + 10 * 3"), /55/);
  assert.match(answer("(100 + 50) * 2"), /300/);
  assert.match(answer("20% của 5 triệu"), /1\.000\.000/);
  assert.match(answer("1250000 giảm 17%"), /1\.037\.500/);
  assert.match(answer("2 mũ 10"), /1\.024/);
  assert.match(answer("căn bậc hai của 144"), /12/);
});

test("query analyzer classifies math, memory, coding", () => {
  assert.equal(analyzeQuery("25 + 10 * 3").intent, "MATH");
  assert.equal(analyzeQuery("Nhớ rằng tôi đang học Dart").intent, "MEMORY");
  assert.equal(analyzeQuery("Viết code Dart tìm số lớn nhất").intent, "CODING");
});

test("memory extraction is structured and blocks secrets", () => {
  assert.equal(extractCandidateMemories("Nhớ rằng tên tôi là Đức.")[0].key, "name");
  assert.equal(extractCandidateMemories("Tôi đang học Dart.")[0].type, "education");
  assert.deepEqual(extractCandidateMemories("API key: abc-secret"), []);
});

test("reranker prefers a specific Flutter title over generic use-case titles", () => {
  const result = rerank("Flutter dùng để làm gì?", [
    { id: "generic", question: "GET dùng để làm gì?", answer: "GET lấy dữ liệu.", similarity: 0.8, verified: true },
    { id: "flutter", question: "Flutter là gì?", answer: "Flutter dùng để phát triển ứng dụng.", similarity: 0.4, verified: true },
  ]);
  assert.equal(result[0].id, "flutter");
});

test("context builder applies bounded sections", () => {
  const context = buildContext({ question: "x", analysis: { intent: "FACTUAL" }, memory: [{ value: "private" }], knowledge: [], history: [{ role: "user", content: "a".repeat(10000) }] });
  assert.ok(context.length < 5000);
  assert.match(context, /SYSTEM IDENTITY/);
});

test("calculator tool validates and executes", async () => {
  const result = await executeTool("calculator", { userId: "test" }, { question: "7 * 8" });
  assert.equal(result.result, 56);
});

test("coding agent never executes arbitrary shell", () => {
  const result = codingAgent({ code: "exec('rm -rf /')", language: "js" });
  assert.equal(result.execution, "disabled");
  assert.ok(result.issues.length);
});
