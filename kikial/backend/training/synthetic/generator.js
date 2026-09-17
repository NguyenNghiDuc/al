import { getModelProvider } from "../../src/ai/models/modelRouter.js";

export async function generateSyntheticExamples({ topics = [], count = 0 } = {}) {
  if (!count) return { generated: [], status: "NO_REQUEST" };
  const health = await getModelProvider().health();
  if (!health.online) return { generated: [], status: "MODEL_OFFLINE", reason: "Local model is not available; no synthetic data was fabricated." };
  return { generated: [], status: "NOT_IMPLEMENTED", reason: "Synthetic generation requires an explicit verified generation prompt and review workflow." };
}
