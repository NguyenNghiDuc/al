import { retrieveRelevant } from "../memory/memoryManager.js";
import { registerTool } from "./toolRegistry.js";

export const memoryTool = registerTool({
  name: "memorySearch",
  description: "Tìm memory của đúng authenticated user.",
  inputSchema: { validate: (input) => typeof input?.query === "string" },
  riskLevel: "low",
  async execute(context, input) { return retrieveRelevant(context.userId, input.query, input.limit || 8); },
});
