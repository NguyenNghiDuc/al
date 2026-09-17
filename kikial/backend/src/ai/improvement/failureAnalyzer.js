import { createHash, randomUUID } from "node:crypto";

const categories = ["MODEL_KNOWLEDGE", "MODEL_REASONING", "RETRIEVAL_MISS", "RERANKING_ERROR", "CONTEXT_ERROR", "MEMORY_ERROR", "REFERENCE_ERROR", "TOOL_SELECTION_ERROR", "TOOL_EXECUTION_ERROR", "PLANNER_ERROR", "VERIFICATION_ERROR", "PROMPT_ERROR", "DATA_ERROR", "UNKNOWN"];

export function classifyFailure(failure = {}) {
  const text = `${failure.id || ""} ${failure.query || ""} ${failure.actual || failure.answer || ""}`.toLowerCase();
  if (/retriev|relevance|wrong knowledge|flutter|semantic/.test(text) && /wrong|fail|miss|không|chưa/.test(text)) return "RETRIEVAL_MISS";
  if (/memory|remember|học|tên|supersed/.test(text)) return "MEMORY_ERROR";
  if (/reference|follow|nó|cái đó|context/.test(text)) return "REFERENCE_ERROR";
  if (/calculator|tool|timeout/.test(text)) return /execution|timeout/.test(text) ? "TOOL_EXECUTION_ERROR" : "TOOL_SELECTION_ERROR";
  if (/plan|agent|step/.test(text)) return "PLANNER_ERROR";
  if (/verify|evidence|unsupported|halluc/.test(text)) return "VERIFICATION_ERROR";
  if (/prompt|instruction/.test(text)) return "PROMPT_ERROR";
  if (/data|schema|json/.test(text)) return "DATA_ERROR";
  if (/reason|logic|multi-step/.test(text)) return "MODEL_REASONING";
  if (/knowledge|fact/.test(text)) return "MODEL_KNOWLEDGE";
  return "UNKNOWN";
}

export function analyzeFailures(report = {}) {
  return (report.failedCases || []).map((failure) => ({
    id: failure.id || randomUUID(),
    testId: failure.id || null,
    query: String(failure.message || failure.query || "").slice(0, 1000),
    expectedBehavior: String(failure.expected || "").slice(0, 1000),
    actualBehavior: String(failure.answer || failure.actual || "").slice(0, 1000),
    category: categories.includes(failure.category) ? failure.category : classifyFailure(failure),
    traceId: failure.traceId || null,
    model: report.model || process.env.AI_MODEL || "local-default",
    promptVersion: failure.promptVersion || "v1",
    retrievalTrace: Array.isArray(failure.retrieval) ? failure.retrieval : [],
    createdAt: new Date().toISOString(),
  }));
}

export function failureFingerprint(failure) { return createHash("sha256").update(`${failure.category}:${failure.query}:${failure.actualBehavior}`).digest("hex"); }
