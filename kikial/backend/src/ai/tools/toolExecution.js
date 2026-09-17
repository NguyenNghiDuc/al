import { executeTool } from "./toolRegistry.js";
import "./calculatorTool.js";
import "./knowledgeTool.js";
import "./memoryTool.js";
import "./documentTool.js";

export async function executeToolRequest(name, context, input = {}) {
  const started = performance.now();
  try {
    const data = await executeTool(name, context, input);
    return { ok: true, tool: name, data, error: null, metadata: { latencyMs: Math.round(performance.now() - started) } };
  } catch (error) {
    return { ok: false, tool: name, data: null, error: { code: error.code || "TOOL_ERROR", message: error.message }, metadata: { latencyMs: Math.round(performance.now() - started) } };
  }
}

export async function executeToolsParallel(requests, context, concurrency = 2) {
  const results = []; let cursor = 0;
  async function worker() { while (cursor < requests.length) { const index = cursor++; results[index] = await executeToolRequest(requests[index].name, context, requests[index].input); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, requests.length) }, worker));
  return results;
}
