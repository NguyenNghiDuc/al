import test from "node:test";
import assert from "node:assert/strict";
import { analyzeQuery } from "../src/ai/query/queryAnalyzer.js";
import { verifyResponse } from "../src/ai/verification/verifier.js";

test("direct coding does not require generic retrieval", () => {
  const analysis = analyzeQuery("Viết hàm JavaScript kiểm tra số nguyên tố");
  assert.equal(analysis.intent, "CODING");
  assert.equal(analysis.needsRetrieval, false);
});

test("coding answer can pass verification without RAG evidence", () => {
  const analysis = analyzeQuery("Viết hàm JavaScript kiểm tra số nguyên tố");
  const result = verifyResponse({
    question: "Viết hàm JavaScript kiểm tra số nguyên tố",
    answer: "Một lời giải JavaScript hợp lệ.",
    analysis,
    retrieval: [],
  });
  assert.equal(result.passed, true);
});

test("fresh research still requires evidence or uncertainty", () => {
  const analysis = analyzeQuery("Tin AI mới nhất hôm nay là gì?");
  const result = verifyResponse({
    question: "Tin AI mới nhất hôm nay là gì?",
    answer: "Có một tin mới.",
    analysis,
    retrieval: [],
  });
  assert.equal(result.passed, false);
});
