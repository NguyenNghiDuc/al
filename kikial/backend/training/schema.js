export const DATASET_VERSION = "kikial-sft-v1";
export const CANDIDATE_TYPES = new Set(["SFT", "PREFERENCE", "REASONING", "CODING", "TOOL_USE", "RAG", "VIETNAMESE", "INSTRUCTION_FOLLOWING"]);

export function isTrainingExample(example) {
  return Boolean(example?.id && CANDIDATE_TYPES.has(example.type) && typeof example.instruction === "string" && typeof example.output === "string" && example.privacySafe === true && typeof example.datasetVersion === "string");
}

export function normalizeExample(example, version = DATASET_VERSION) {
  return { id: String(example.id), type: example.type, instruction: String(example.instruction || "").slice(0, 12000), input: String(example.input || "").slice(0, 12000), output: String(example.output || "").slice(0, 16000), source: example.source || "UNKNOWN", language: example.language || "vi", domain: example.domain || "general", difficulty: example.difficulty || "MEDIUM", qualityScore: Math.max(0, Math.min(1, Number(example.qualityScore) || 0)), verified: example.verified === true, privacySafe: example.privacySafe === true, createdAt: example.createdAt || new Date().toISOString(), datasetVersion: version };
}
