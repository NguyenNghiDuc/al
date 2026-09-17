const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().trim();

export function analyzeQuery(message, history = []) {
  const text = normalize(message);
  const words = text.split(/\s+/).filter(Boolean);
  const hasHistory = Array.isArray(history) && history.length > 0;
  const math = /(?:\d\s*[+*/%^×÷]|\b(?:mu|can|sqrt|%\s*(?:cua)|giam|tang)\b)/i.test(text);
    const memory = /(?:nho|ghi nho|ten toi|toi dang|minh dang|toi thich|(?:muc tieu.*(?:toi|minh)|(?:toi|minh).*muc tieu)|dao nay)/i.test(text);
  const coding = /(?:code|lap trinh|javascript|typescript|python|dart|flutter|bug|debug|ham|chuong trinh|api)/i.test(text);
  const document = /(?:tai lieu|file|van ban|document|pdf|csv|md|txt)/i.test(text);
  const planning = /(?:ke hoach|lap ke hoach|tung buoc|roadmap|du an|xay dung)/i.test(text);
  const research = /(?:tim kiem|nghien cuu|nguon|moi nhat|internet|web)/i.test(text);
  let intent = "SIMPLE_CHAT";
  if (math) intent = "MATH";
  else if (memory) intent = "MEMORY";
  else if (document) intent = "DOCUMENT";
  else if (planning) intent = "PLANNING";
  else if (coding) intent = "CODING";
  else if (research) intent = "RESEARCH";
  else if (hasHistory && /(?:no|do|vay|tiep|vi du cho)/i.test(text)) intent = "MULTI_STEP";
  else if (words.length > 5) intent = "FACTUAL";
  return {
    intent,
    topic: words.slice(0, 8).join(" "),
    entities: words.filter((word) => word.length > 3).slice(0, 12),
    references: /\b(no|do|vay|cai nay|cai do|tiep|lam tiep)\b/i.test(text) ? ["contextual"] : [],
    constraints: [],
    complexity: words.length > 25 || planning || research ? "HIGH" : words.length > 8 ? "MEDIUM" : "LOW",
    ambiguity: /\b(no|do|cai nay|cai do|phan kia)\b/i.test(text) ? "HIGH" : "LOW",
    needsKnowledge: !["MATH", "SIMPLE_CHAT", "MEMORY"].includes(intent),
    needsMemory: memory || (hasHistory && /(?:no|do|vay|tiep|vi du cho)/i.test(text)),
    needsTools: math,
    needsFreshInformation: research,
  };
}
