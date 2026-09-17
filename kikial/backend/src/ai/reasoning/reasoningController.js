const BASE_BUDGET = { maxModelCalls: 1, maxToolCalls: 2, maxAgentSteps: 4, maxContextTokens: 1800, maxRetries: 1, timeoutMs: 30000 };

export function decideReasoning(analysis, { retrievalConfidence = 0, availableTools = [], risk = "low" } = {}) {
  let level = "LEVEL_0";
  if (analysis.intent === "MATH" || analysis.intent === "SIMPLE_CHAT") level = "LEVEL_0";
  else if (analysis.intent === "RESEARCH" || analysis.needsFreshInformation) level = "LEVEL_5";
  else if (analysis.complexity === "HIGH" || analysis.intent === "PLANNING" || analysis.intent === "MULTI_STEP") level = "LEVEL_4";
  else if (analysis.needsTools || availableTools.length) level = "LEVEL_3";
  else if (analysis.needsKnowledge || retrievalConfidence < 0.35) level = "LEVEL_2";
  else level = "LEVEL_1";
  const budget = { ...BASE_BUDGET };
  if (level === "LEVEL_0") Object.assign(budget, { maxModelCalls: 0, maxToolCalls: analysis.intent === "MATH" ? 1 : 0, maxAgentSteps: 0, maxRetries: 0, timeoutMs: 3000 });
  if (level === "LEVEL_4") Object.assign(budget, { maxModelCalls: 1, maxToolCalls: 4, maxAgentSteps: 6, maxContextTokens: 3000 });
  if (level === "LEVEL_5") Object.assign(budget, { maxModelCalls: 2, maxToolCalls: 6, maxAgentSteps: 8, maxContextTokens: 5000, timeoutMs: 60000 });
  if (risk === "high") budget.maxToolCalls = Math.min(budget.maxToolCalls, 1);
  return { level, budget, reason: { intent: analysis.intent, complexity: analysis.complexity, retrievalConfidence, risk } };
}
