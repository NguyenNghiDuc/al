import { randomUUID } from "node:crypto";
import { getModelProvider } from "../../src/ai/models/modelRouter.js";
import { normalizeExample } from "../schema.js";
import { privacyCheck } from "../privacy.js";

function extractJsonArray(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const value = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function generateSyntheticExamples({ topics = [], count = 0 } = {}) {
  const requested = Math.max(0, Math.min(Number(count) || 0, 50));
  if (!requested) return { generated: [], status: "NO_REQUEST" };

  const provider = await getModelProvider();
  const health = await provider.health();
  if (!health.online) {
    return { generated: [], status: "MODEL_OFFLINE", reason: "Local model is not available; no synthetic data was fabricated." };
  }

  const safeTopics = [...new Set((topics || []).map((item) => String(item || "").slice(0, 80)).filter(Boolean))].slice(0, 12);
  const result = await provider.generate({
    messages: [
      {
        role: "system",
        content: "Bạn tạo dữ liệu HUẤN LUYỆN ỨNG VIÊN cho trợ lý AI tiếng Việt. Chỉ tạo kiến thức phổ quát, kỹ năng lập luận, coding, RAG và tool-use. Không tạo dữ liệu cá nhân, bí mật, API key, mật khẩu hoặc thông tin nhạy cảm. Không khẳng định thông tin thời sự. Trả về JSON array hợp lệ, không markdown.",
      },
      {
        role: "user",
        content: `Tạo ${requested} ví dụ đa dạng. Chủ đề ưu tiên: ${safeTopics.join(", ") || "reasoning, coding, retrieval, instruction following"}. Mỗi object phải có: instruction, output, domain, difficulty. output phải là câu trả lời đúng, rõ ràng, hữu ích; không chép nguyên instruction.`,
      },
    ],
    temperature: 0.7,
  });

  const parsed = extractJsonArray(result?.content);
  const generated = [];
  for (const item of parsed.slice(0, requested)) {
    if (!item || typeof item.instruction !== "string" || typeof item.output !== "string") continue;
    const example = normalizeExample({
      id: `synthetic-${randomUUID()}`,
      type: /code|javascript|python|dart|flutter/i.test(`${item.domain} ${item.instruction}`) ? "CODING" : "SFT",
      instruction: item.instruction,
      input: "",
      output: item.output,
      source: "SYNTHETIC_MODEL",
      language: "vi",
      domain: String(item.domain || "general").slice(0, 80),
      difficulty: ["EASY", "MEDIUM", "HARD"].includes(String(item.difficulty).toUpperCase()) ? String(item.difficulty).toUpperCase() : "MEDIUM",
      qualityScore: 0.45,
      verified: false,
      privacySafe: true,
    });
    const privacy = privacyCheck(example);
    if (privacy.safe) generated.push(example);
  }

  return {
    generated,
    status: generated.length ? "QUARANTINED_FOR_REVIEW" : "NO_VALID_OUTPUT",
    requested,
    model: result?.model || health.model || provider.model,
  };
}
