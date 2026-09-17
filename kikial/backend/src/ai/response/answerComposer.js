const normalize = (value) => String(value || "").trim();

export function composeAnswer(answer, { analysis, confidence, evidence = [], language = "vi" } = {}) {
  let content = normalize(answer);
  if (!content) content = "Mình chưa có đủ thông tin để trả lời chính xác câu hỏi này.";
  if (confidence?.level === "LOW" && !/chưa|không chắc|không có đủ/i.test(content)) content += "\n\nMình chưa đủ bằng chứng để khẳng định điều này.";
  return { content, language, style: analysis?.complexity === "HIGH" ? "detailed" : "concise", evidenceCount: evidence.length, confidence: confidence?.level || "UNKNOWN" };
}
