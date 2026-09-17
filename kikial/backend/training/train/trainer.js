import { makeTrainConfig } from "./trainConfig.js";

export async function prepareTraining({ config = makeTrainConfig(), dryRun = true } = {}) {
  return { status: dryRun ? "DRY_RUN" : "NOT_EXECUTED", config, requirements: ["Python", "PyTorch", "Transformers", "PEFT", "optional CUDA GPU"], reason: "Training is intentionally separated from the Node runtime and was not executed automatically." };
}
