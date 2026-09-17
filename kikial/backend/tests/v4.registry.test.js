import test from "node:test";
import assert from "node:assert/strict";
import { registerModel, promoteModel, rollbackModel, getActiveModel } from "../src/ai/models/modelRegistry.js";

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
