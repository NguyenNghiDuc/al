import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeQuery } from "../src/ai/query/queryAnalyzer.js";
import { isTrainingExample } from "../training/schema.js";
import { validateExamples } from "../training/dataset.js";

const candidatesPath = fileURLToPath(new URL("../training/candidates/candidates.jsonl", import.meta.url));

test("short technical topics do not fall back to simple chat", () => {
  const code = analyzeQuery("code");
  assert.equal(code.intent, "CODING");
  assert.equal(code.topicOnly, true);
  assert.equal(code.ambiguity, "MEDIUM");

  const accounting = analyzeQuery("kế toán");
  assert.equal(accounting.intent, "FACTUAL");
  assert.equal(accounting.topicOnly, true);
  assert.equal(accounting.needsRetrieval, true);

  const aws = analyzeQuery("AWS");
  assert.equal(aws.intent, "FACTUAL");
  assert.equal(aws.topicOnly, true);
});

test("greetings remain simple chat", () => {
  assert.equal(analyzeQuery("chào").intent, "SIMPLE_CHAT");
  assert.equal(analyzeQuery("hello").intent, "SIMPLE_CHAT");
});

test("curated training candidates are schema-valid verified examples", async () => {
  const examples = (await readFile(candidatesPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.ok(examples.length >= 20);
  assert.ok(examples.every((item) => isTrainingExample(item)));
  assert.ok(examples.every((item) => item.verified === true && item.privacySafe === true));
  assert.deepEqual(validateExamples(examples), []);
});
