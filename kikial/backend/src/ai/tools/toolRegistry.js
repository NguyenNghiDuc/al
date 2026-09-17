const tools = new Map();

export function registerTool(tool) {
  if (!tool?.name || typeof tool.execute !== "function") throw new Error("Invalid tool contract");
  tools.set(tool.name, tool);
  return tool;
}

export function getTool(name) { return tools.get(name); }
export function listTools() { return [...tools.values()].map(({ execute, ...metadata }) => metadata); }

export async function executeTool(name, context, input = {}) {
  const tool = getTool(name);
  if (!tool) { const error = new Error(`Unknown tool: ${name}`); error.code = "TOOL_ERROR"; throw error; }
  if (tool.inputSchema && typeof tool.inputSchema.validate === "function" && !tool.inputSchema.validate(input)) { const error = new Error(`Invalid input for tool: ${name}`); error.code = "VALIDATION_ERROR"; throw error; }
  return tool.execute(context, input);
}
