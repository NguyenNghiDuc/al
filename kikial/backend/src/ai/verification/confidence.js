export function calculateConfidence({ retrieval = [], memory = [], toolSuccess = false, verified = false, answer = "" }) {
  const relevance = retrieval.length ? Math.max(...retrieval.map((item) => Number(item.score || 0))) : 0;
  const evidence = retrieval.length ? Math.min(1, relevance + (verified ? 0.15 : 0)) : 0;
  const signals = [toolSuccess ? 1 : 0, evidence, memory.length ? 0.85 : 0, answer.length > 20 ? 0.5 : 0];
  const score = Math.max(...signals);
  return { score, level: score >= 0.75 ? "HIGH" : score >= 0.45 ? "MEDIUM" : "LOW" };
}
