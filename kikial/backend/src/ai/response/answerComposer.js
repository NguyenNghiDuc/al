const normalize = (value) => String(value || "").trim();

function citationSection(evidence = []) {
  const seen = new Set();
  const web = [];
  for (const item of evidence) {
    if (String(item?.sourceType || "").toLowerCase() !== "web" || !item?.url) continue;
    const url = String(item.url).trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    web.push({ title: String(item.title || item.domain || "Nguồn web").trim(), url });
    if (web.length >= 4) break;
  }
  if (!web.length) return "";
  return `\n\nNguồn tham khảo:\n${web.map((item, index) => `[${index + 1}] ${item.title} — ${item.url}`).join("\n")}`;
}

export function composeAnswer(answer, { analysis, confidence, evidence = [], consensus = null, language = "vi" } = {}) {
  let content = normalize(answer);
  if (!content) content = "Mình chưa có đủ thông tin để trả lời chính xác câu hỏi này.";
  if (confidence?.level === "LOW" && !/chưa|không chắc|không có đủ/i.test(content)) content += "\n\nMình chưa đủ bằng chứng để khẳng định điều này.";
  if (analysis?.intent === "RESEARCH" || analysis?.needsFreshInformation) {
    if (consensus?.conflicts?.length && !/mâu thuẫn|khác nhau|không thống nhất/i.test(content)) {
      content += "\n\nLưu ý: các nguồn hiện có tín hiệu không thống nhất ở một số chi tiết; nên ưu tiên nguồn chính thức và mới hơn.";
    } else if (consensus?.singleSource && !/một nguồn|1 nguồn|chưa đối chiếu/i.test(content)) {
      content += "\n\nLưu ý: thông tin này hiện chỉ được đối chiếu từ một nguồn độc lập.";
    }
  }
  content += citationSection(evidence);
  return { content, language, style: analysis?.complexity === "HIGH" ? "detailed" : "concise", evidenceCount: evidence.length, confidence: confidence?.level || "UNKNOWN" };
}
