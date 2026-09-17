export function verifyResponse({ question, answer, analysis, retrieval = [], toolResult = null }) {
  const issues = [];
  if (!answer?.trim()) issues.push("empty_answer");
  if (toolResult && !String(answer).includes(String(toolResult.result))) issues.push("tool_result_mismatch");
  if (["FACTUAL", "CODING", "DOCUMENT", "RESEARCH", "MULTI_STEP"].includes(analysis.intent) && retrieval.length === 0 && !toolResult && !answer.includes("chưa có đủ")) issues.push("missing_evidence");
  return { ok: issues.length === 0, passed: issues.length === 0, issues, unsupportedClaims: issues.includes("missing_evidence") ? ["answer lacks supporting evidence"] : [], suggestedFix: issues.length ? "Use a verified source or state uncertainty." : null, checked: true };
}
