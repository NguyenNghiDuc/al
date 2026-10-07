import test from "node:test";
import assert from "node:assert/strict";
import { registerModel, promoteModel, rollbackModel, getActiveModel, updateModelBenchmark, listModels } from "../src/ai/models/modelRegistry.js";
import { getModelProvider, resetModelProvider } from "../src/ai/models/modelRouter.js";

test("model registry refuses promotion without a passed gate", async () => {
  const id = `candidate-${Date.now()}`;
  await registerModel({ id, baseModel: "test", version: "v1", provider: "local", type: "TEST", capabilities: [] });
  await assert.rejects(() => promoteModel(id, { passed: false }), /Promotion gate failed/);
});

test("model registry promotes only explicit candidates and can rollback", async () => {
  const previous = (await getActiveModel()).id;
  const id = `candidate-pass-${Date.now()}`;
  await registerModel({ id, baseModel: "test", version: "v1", provider: "local", type: "TEST", capabilities: [] });
  const promoted = await promoteModel(id, { passed: true });
  assert.equal(promoted.id, id);
  const rolledBack = await rollbackModel();
  assert.equal(rolledBack.id, previous);
});

test("the runtime model router follows the promoted registry model", async () => {
  const previous = await getActiveModel();
  const id = `runtime-candidate-${Date.now()}`;
  await registerModel({ id, baseModel: "runtime-test-model", version: "v1", provider: "ollama", type: "TEST", capabilities: ["chat"] });
  try {
    await promoteModel(id, { passed: true });
    const provider = await getModelProvider();
    assert.equal(provider.model, "runtime-test-model");
  } finally {
    await rollbackModel();
    resetModelProvider();
  }
  const provider = await getModelProvider();
  assert.equal(provider.model, previous.baseModel);
});


test("candidate benchmark is persisted and moves candidate to validating", async () => {
  const id = `benchmark-candidate-${Date.now()}`;
  await registerModel({ id, baseModel: "benchmark-test", version: "v1", provider: "ollama", type: "TEST", capabilities: ["chat"] });
  const updated = await updateModelBenchmark(id, { passRate: 0.91, gate: { passed: true } });
  assert.equal(updated.status, "VALIDATING");
  assert.equal(updated.benchmark.passRate, 0.91);
  const stored = (await listModels()).find((item) => item.id === id);
  assert.equal(stored.benchmark.gate.passed, true);
});
