const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();

export function rewriteQuery(message, history = []) {
  const text = normalize(message).trim();
  const recent = history.slice(-4).map((item) => item.content || "").join(" ");
  if (!recent || !/(\bno\b|\bdo\b|\bvay\b|\bcon\b|hai cai|phan luc truoc|vi du cho no)/i.test(text)) return { original: message, standalone: message, representations: [message], rewritten: false };
  const context = recent.match(/(?:flutter|node(?:\.js)?|express|promise|javascript|dart|authentication|async\/?await)/i)?.[0];
  if (!context) return { original: message, standalone: message, representations: [message], rewritten: false };
  let standalone = message;
  if (/ngon ngu/.test(text)) standalone = `${context} sử dụng ngôn ngữ lập trình nào?`;
  else if (/khac nhau|hai cai/.test(text)) standalone = "So sánh Node.js và Express.";
  else standalone = `${message} trong ngữ cảnh ${context}`;
  return { original: message, standalone, representations: [message, standalone], rewritten: true };
}

export function expandQuery(message, analysis, history = []) {
  const rewritten = rewriteQuery(message, history);
  if (analysis.complexity === "HIGH" || rewritten.rewritten) {
    const representations = [...new Set([...rewritten.representations, `${rewritten.standalone} giải thích chi tiết`, `${rewritten.standalone} kiến thức liên quan`])];
    return { ...rewritten, representations: representations.slice(0, 3) };
  }
  return rewritten;
}
