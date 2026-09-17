const clamp = (value, limit) => String(value || "").slice(0, limit);
import { compressEvidence } from "./contextCompression.js";

export function buildContext({ question, analysis, memory = [], knowledge = [], toolResults = [], summary = "", history = [] }) {
  const compressedKnowledge = compressEvidence(knowledge, question, Number(process.env.MAX_CONTEXT_CHARS) || 5000);
  const sections = [
    ["SYSTEM IDENTITY", "Tên: Kikial. Loại: trợ lý AI local/open-source. Ngôn ngữ mặc định: tiếng Việt. Không tự nhận là ChatGPT, OpenAI, Claude hoặc Gemini."],
    ["CURRENT TASK", `Intent: ${analysis.intent}. Câu hỏi: ${clamp(question, 4000)}`],
    ["RELEVANT USER MEMORY", memory.slice(0, 8).map((item) => `- ${typeof item === "string" ? item : item.value}`).join("\n")],
    ["VERIFIED KNOWLEDGE", compressedKnowledge.slice(0, 5).map((item) => `- [${item.provenance?.sourceType || item.sourceType || item.store || "KNOWLEDGE"}] ${clamp(item.question, 240)} => ${clamp(item.text || item.answer, 700)}`).join("\n")],
    ["TOOL RESULTS", toolResults.map((item) => `- ${clamp(item, 1200)}`).join("\n")],
    ["CONVERSATION SUMMARY", clamp(summary, 1800)],
    ["RECENT MESSAGES", history.slice(-8).map((item) => `${item.role}: ${clamp(item.content, 900)}`).join("\n")],
  ];
  return sections.filter(([, value]) => value).map(([name, value]) => `## ${name}\n${value}`).join("\n\n");
}
