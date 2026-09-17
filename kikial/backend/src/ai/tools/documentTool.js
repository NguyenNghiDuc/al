import { searchDocuments } from "../../services/documentService.js";
import { registerTool } from "./toolRegistry.js";

export const documentTool = registerTool({
  name: "documentSearch",
  description: "Tìm các chunk trong tài liệu của authenticated user.",
  inputSchema: { validate: (input) => typeof input?.query === "string" && input.query.length <= 4000 },
  riskLevel: "low",
  async execute(context, input) { return searchDocuments(context.userId, input.query, input.limit || 5); },
});
