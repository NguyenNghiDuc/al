const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const TRUSTED_SOURCES = new Set(["knowledge", "lesson", "reference", "deterministic", "trusted_reference"]);

export function verifyResponse({ question, answer, analysis, retrieval = [], toolResult = null }) {
  const issues = [];
  if (!answer?.trim()) issues.push("empty_answer");
  if (toolResult && !String(answer).includes(String(toolResult.result))) issues.push("tool_result_mismatch");
  if (["FACTUAL", "CODING", "DOCUMENT", "RESEARCH", "MULTI_STEP"].includes(analysis.intent) && retrieval.length === 0 && !toolResult && !answer.includes("chưa có đủ")) issues.push("missing_evidence");
  return { ok: issues.length === 0, passed: issues.length === 0, issues, unsupportedClaims: issues.includes("missing_evidence") ? ["answer lacks supporting evidence"] : [], suggestedFix: issues.length ? "Use a verified source or state uncertainty." : null, checked: true };
}

export function verifyLessonCandidate(candidate, evidence = []) {
  const correction = normalize(candidate?.correction);
  const origins = new Set(candidate?.originInteractionIds || []);
  const independentEvidence = (Array.isArray(evidence) ? evidence : []).filter((item) => {
    const sourceType = String(item?.sourceType || "").toLowerCase();
    const hasProvenance = Boolean(item?.sourceId || item?.id);
    const independent = sourceType !== "model" && !origins.has(item?.originInteractionId) && !origins.has(item?.generatedByInteractionId);
    const trusted = item?.trusted === true || (item?.verified === true && TRUSTED_SOURCES.has(sourceType));
    return hasProvenance && independent && trusted;
  });
  const evidenceRefs = independentEvidence.map((item) => ({
    sourceType: String(item.sourceType).toLowerCase(),
    sourceId: item.sourceId || item.id,
    ...(item.filename ? { filename: item.filename } : {}),
    ...(item.chunkId ? { chunkId: item.chunkId } : {}),
    ...(item.provenance ? { provenance: item.provenance } : {}),
  }));
  const rejected = independentEvidence.some((item) => item.contradictsCorrection === true);
  if (rejected) return { status: "rejected", confidence: 0, reasons: ["trusted_evidence_contradicts_correction"], evidenceRefs };
  if (!correction) return { status: "quarantined", confidence: 0, reasons: ["correction_missing"], evidenceRefs };
  if (candidate?.conflictsWith?.length) return { status: "quarantined", confidence: 0, reasons: ["conflicts_with_verified_source"], evidenceRefs };
  if (!independentEvidence.length) return { status: "quarantined", confidence: 0, reasons: ["independent_trusted_evidence_missing"], evidenceRefs: [] };
  const supported = independentEvidence.some((item) => normalize(item.text || item.content || item.answer).includes(correction));
  if (!supported) return { status: "quarantined", confidence: 0.2, reasons: ["correction_not_supported_by_evidence"], evidenceRefs };
  return { status: "verified", confidence: 0.99, reasons: ["correction_exactly_supported_by_independent_evidence"], evidenceRefs };
}
