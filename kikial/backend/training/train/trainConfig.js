export function makeTrainConfig(overrides = {}) {
  return { baseModel: process.env.AI_MODEL || "llama3.2:3b", dataset: "kikial-sft-v1", outputDir: "training/models", method: "LORA", epochs: 3, learningRate: 0.0002, batchSize: 2, maxSequenceLength: 2048, seed: 42, ...overrides };
}
