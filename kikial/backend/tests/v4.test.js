import test from "node:test";
import assert from "node:assert/strict";
import { classifyFailure, analyzeFailures } from "../src/ai/improvement/failureAnalyzer.js";
import { planImprovements } from "../src/ai/improvement/improvementPlanner.js";
import { privacyCheck } from "../training/privacy.js";
import { normalizeExample, isTrainingExample } from "../training/schema.js";
import { stableSplit, validateExamples } from "../training/dataset.js";
import { makeTrainConfig } from "../training/train/trainConfig.js";

test("failure analyzer distinguishes retrieval and memory failures", () => {
  assert.equal(classifyFailure({ query: "Flutter dùng gì?", actual: "wrong knowledge retrieval" }), "RETRIEVAL_MISS");
  assert.equal(classifyFailure({ query: "Tên tôi là gì?", actual: "memory mismatch" }), "MEMORY_ERROR");
  assert.equal(planImprovements(analyzeFailures({ failedCases: [{ id: "x", message: "Flutter", answer: "wrong knowledge" }] }))[0].intervention, "RETRIEVAL_RERANKER");
});

test("privacy gate rejects secrets and PII", () => {
  assert.equal(privacyCheck({ instruction: "x", output: "token: abc123" }).safe, false);
  assert.equal(privacyCheck({ instruction: "x", output: "user@example.com" }).safe, false);
  assert.equal(privacyCheck({ instruction: "x", output: "safe public answer", source: "CURATED" }).safe, true);
});

test("training schema and deterministic split are reproducible", () => {
  const example = normalizeExample({ id: "a", type: "SFT", instruction: "Explain", output: "Answer", source: "CURATED", privacySafe: true, verified: true, qualityScore: 0.9 });
  assert.equal(isTrainingExample(example), true);
  assert.equal(stableSplit("a"), stableSplit("a"));
  assert.deepEqual(validateExamples([example, example]).map((item) => item.error), ["duplicate_id", "duplicate_content:a"]);
});

test("training config is explicit and local-first", () => {
  const config = makeTrainConfig({ method: "QLORA", epochs: 1 });
  assert.equal(config.method, "QLORA");
  assert.equal(config.epochs, 1);
  assert.ok(config.baseModel);
});
