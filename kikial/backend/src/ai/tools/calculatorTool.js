import { calculate } from "../../../lib/calculator.js";
import { registerTool } from "./toolRegistry.js";

export const calculatorTool = registerTool({
  name: "calculator",
  description: "Tính toán biểu thức và phép tính tiếng Việt một cách deterministic.",
  inputSchema: { validate: (input) => typeof input?.question === "string" && input.question.length <= 1000 },
  riskLevel: "low",
  async execute(context, input) {
    const result = calculate(input.question);
    if (!result) throw new Error("Không nhận diện được phép tính.");
    return { ...result, sourceType: "TOOL", sourceId: "calculator" };
  },
});
