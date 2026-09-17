const MAX_AGENT_STEPS = Number(process.env.MAX_AGENT_STEPS) || 6;
import { executeToolsParallel } from "./tools/toolExecution.js";

export function createPlan(goal, analysis) {
  const steps = [];
  if (analysis.needsKnowledge) steps.push({ id: "retrieve", action: "Tìm evidence liên quan", tool: "knowledgeSearch", dependencies: [] });
  if (analysis.intent === "DOCUMENT") steps.push({ id: "document", action: "Tìm chunk tài liệu của người dùng", tool: "documentSearch", dependencies: [] });
  if (analysis.intent === "CODING") steps.push({ id: "inspect", action: "Phân tích source text an toàn", tool: "codeAnalysis", dependencies: [] });
  steps.push({ id: "answer", action: "Tổng hợp câu trả lời có provenance", tool: "model", dependencies: steps.map((step) => step.id) });
  return { goal: String(goal).slice(0, 1000), steps: steps.slice(0, MAX_AGENT_STEPS), bounded: true };
}

export async function executePlan(plan, context, { maxSteps = MAX_AGENT_STEPS } = {}) {
  const completed = []; const boundedSteps = plan.steps.slice(0, maxSteps);
  for (const step of boundedSteps) {
    const independent = boundedSteps.filter((candidate) => candidate.id !== "answer" && candidate.dependencies.length === 0 && !completed.some((item) => item.step === candidate.id));
    if (independent.length && step.id === independent[0].id) {
      const results = await executeToolsParallel(independent.filter((item) => ["knowledgeSearch", "documentSearch"].includes(item.tool)).map((item) => ({ name: item.tool, input: { query: plan.goal, limit: 5 } })), context, 2);
      completed.push(...results.map((result, index) => ({ step: independent[index].id, result })));
    }
    if (step.tool === "model") completed.push({ step: step.id, result: { ok: true, status: "ready_for_synthesis" } });
  }
  return { ...plan, completed, status: completed.length ? "completed" : "blocked" };
}
