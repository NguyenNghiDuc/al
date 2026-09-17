import { searchKnowledge } from "../retrieval/index.js";
import { registerTool } from "./toolRegistry.js";

export const knowledgeTool = registerTool({
  name: "knowledgeSearch",
  description: "Tìm kiến thức curated và learned đã verified.",
  inputSchema: { validate: (input) => typeof input?.query === "string" && input.query.length <= 4000 },
  riskLevel: "low",
  async execute(context, input) { return searchKnowledge(input.query, input.limit || 5); },
});
