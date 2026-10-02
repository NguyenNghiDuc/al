const BASE_BUDGET = {
  maxModelCalls: 1,
  maxToolCalls: 2,
  maxAgentSteps: 4,
  maxContextTokens: 3200,
  maxRetries: 1,
  timeoutMs: 30000,
};

export function decideReasoning(analysis, { retrievalConfidence = 0, availableTools = [], risk = "low" } = {}) {
  let level = "LEVEL_1";

  if (analysis.intent === "MATH") level = "LEVEL_0";
  else if (analysis.intent === "SIMPLE_CHAT") level = "LEVEL_1";
  else if (analysis.intent === "RESEARCH" || analysis.needsFreshInformation) level = "LEVEL_5";
  else if (analysis.complexity === "HIGH" || analysis.intent === "PLANNING") level = "LEVEL_4";
  else if (analysis.intent === "MULTI_STEP" || analysis.needsTools || availableTools.length) level = "LEVEL_3";
  else if (analysis.needsKnowledge || retrievalConfidence < 0.35) level = "LEVEL_2";

  const budget = { ...BASE_BUDGET };

  if (level === "LEVEL_0") {
    Object.assign(budget, {
      maxModelCalls: 0,
      maxToolCalls: 1,
      maxAgentSteps: 1,
      maxRetries: 0,
      maxContextTokens: 1200,
      timeoutMs: 5000,
    });
  }

  if (level === "LEVEL_1") {
    Object.assign(budget, {
      maxModelCalls: 1,
      maxToolCalls: 0,
      maxAgentSteps: 2,
      maxRetries: 0,
      maxContextTokens: 2400,
      timeoutMs: 20000,
    });
  }

  if (level === "LEVEL_2") {
    Object.assign(budget, {
      maxModelCalls: 1,
      maxToolCalls: 2,
      maxAgentSteps: 4,
      maxRetries: 1,
      maxContextTokens: 4200,
    });
  }

  if (level === "LEVEL_3") {
    Object.assign(budget, {
      maxModelCalls: 2,
      maxToolCalls: 4,
      maxAgentSteps: 6,
      maxRetries: 1,
      maxContextTokens: 5200,
      timeoutMs: 45000,
    });
  }

  if (level === "LEVEL_4") {
    Object.assign(budget, {
      maxModelCalls: 2,
      maxToolCalls: 5,
      maxAgentSteps: 8,
      maxRetries: 2,
      maxContextTokens: 7000,
      timeoutMs: 60000,
    });
  }

  if (level === "LEVEL_5") {
    Object.assign(budget, {
      maxModelCalls: 3,
      maxToolCalls: 8,
      maxAgentSteps: 10,
      maxRetries: 2,
      maxContextTokens: 9000,
      timeoutMs: 90000,
    });
  }

  // High-risk operations should use fewer side-effecting tools, not less reasoning.
  if (risk === "high") budget.maxToolCalls = Math.min(budget.maxToolCalls, 2);

  return {
    level,
    budget,
    reason: {
      intent: analysis.intent,
      complexity: analysis.complexity,
      retrievalConfidence,
      risk,
      fresh: Boolean(analysis.needsFreshInformation),
    },
  };
}
