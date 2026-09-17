import test from "node:test";
import assert from "node:assert/strict";
import { rewriteQuery } from "../src/ai/query/queryRewriter.js";
import { compressEvidence } from "../src/ai/context/contextCompression.js";
import { executeToolRequest } from "../src/ai/tools/toolExecution.js";
import { createPlan, executePlan } from "../src/ai/planner.js";
import { indexSource, retrieveCodeContext } from "../src/ai/code/codeContextRetriever.js";
import { rerank } from "../src/ai/retrieval/reranker.js";

test("query rewriting resolves contextual language follow-up", () => {
  const result = rewriteQuery("Nó dùng ngôn ngữ nào?", [{ role: "user", content: "Flutter là gì?" }]);
  assert.equal(result.rewritten, true);
  assert.match(result.standalone, /Flutter/);
});

test("context compression keeps provenance and budget", () => {
  const result = compressEvidence([{ id: "k1", question: "Flutter?", answer: "Flutter dùng Dart. Chi tiết không liên quan rất dài." }], "Flutter dùng ngôn ngữ gì?", 100);
  assert.ok(result[0].provenance.sourceId === "k1");
  assert.ok(result[0].text.length <= 100);
});

test("structured tool execution reports failures without pretending success", async () => {
  const success = await executeToolRequest("calculator", {}, { question: "2 + 2" });
  const failure = await executeToolRequest("calculator", {}, { question: "not math" });
  assert.equal(success.ok, true);
  assert.equal(success.data.result, 4);
  assert.equal(failure.ok, false);
  assert.equal(failure.data, null);
});

test("planner executes independent retrieval steps with bounds", async () => {
  const plan = createPlan("Flutter dùng ngôn ngữ gì?", { needsKnowledge: true, intent: "FACTUAL" });
  const result = await executePlan(plan, { userId: "test" }, { maxSteps: 4 });
  assert.equal(result.bounded, true);
  assert.ok(Array.isArray(result.completed));
});

test("code context indexes symbols without executing code", () => {
  const index = indexSource("import x from 'x'; function authenticate(user) { return user; }", "auth.js");
  assert.equal(index.imports[0], "x");
  assert.equal(retrieveCodeContext(index, "authenticate")[0].symbol, "authenticate");
});

test("reranker rewards exact entities and verified source", () => {
  const result = rerank("async await JavaScript", [
    { id: "generic", question: "JavaScript là gì?", answer: "Ngôn ngữ lập trình.", similarity: 0.9, verified: true },
    { id: "specific", question: "async await trong JavaScript là gì?", answer: "Promise.", similarity: 0.5, verified: true },
  ]);
  assert.equal(result[0].id, "specific");
});
