import test from "node:test";
import assert from "node:assert/strict";
import { decideReasoning } from "../src/ai/reasoning/reasoningController.js";
import { resolveReference } from "../src/ai/context/referenceResolver.js";
import { createEvidencePack, flattenEvidence } from "../src/ai/context/evidencePack.js";
import { extractCandidateMemories } from "../src/ai/memory/memoryManager.js";
import { composeAnswer } from "../src/ai/response/answerComposer.js";

test("reasoning controller keeps deterministic requests at level zero", () => {
  const result = decideReasoning({ intent: "MATH", complexity: "LOW", needsTools: true, needsKnowledge: false });
  assert.equal(result.level, "LEVEL_0");
  assert.equal(result.budget.maxModelCalls, 0);
});

test("reasoning controller budgets complex tasks", () => {
  const result = decideReasoning({ intent: "PLANNING", complexity: "HIGH", needsTools: false, needsKnowledge: true });
  assert.equal(result.level, "LEVEL_4");
  assert.ok(result.budget.maxAgentSteps > 4);
});

test("reference resolver resolves pronouns from recent entities", () => {
  const result = resolveReference("Nó dùng ngôn ngữ nào?", [{ role: "user", content: "Flutter là gì?" }]);
  assert.equal(result.ambiguous, false);
  assert.match(result.query, /Flutter/);
});

test("memory extraction rejects hypothetical and third-party identity", () => {
  assert.deepEqual(extractCandidateMemories("Ví dụ nếu tôi tên Nam thì sao."), []);
  assert.deepEqual(extractCandidateMemories("Bạn tôi tên Huy."), []);
});

test("memory extraction represents negation", () => {
  const result = extractCandidateMemories("Tôi không còn học Dart nữa.");
  assert.equal(result[0].negated, true);
  assert.equal(result[0].key, "learning");
});

test("evidence pack standardizes provenance", () => {
  const pack = createEvidencePack({ query: "x", knowledge: [{ id: "k1", answer: "evidence", score: 0.8, verified: true }] });
  assert.equal(flattenEvidence(pack)[0].sourceId, "k1");
  assert.equal(flattenEvidence(pack)[0].trust, 1);
});

test("answer composer adds uncertainty without leaking trace metadata", () => {
  const result = composeAnswer("Một câu trả lời.", { analysis: { complexity: "LOW" }, confidence: { level: "LOW" }, evidence: [] });
  assert.match(result.content, /chưa đủ bằng chứng/);
  assert.equal(result.traceId, undefined);
});
