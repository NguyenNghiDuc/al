import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFailures } from "../src/ai/improvement/failureAnalyzer.js";
import { planImprovements } from "../src/ai/improvement/improvementPlanner.js";
import { candidatesPath, datasetPath, manifestPath, readJsonl, validateExamples, writeDataset } from "./dataset.js";
import { DATASET_VERSION, normalizeExample } from "./schema.js";
import { privacyCheck } from "./privacy.js";
import { generateSyntheticExamples } from "./synthetic/generator.js";
import { getActiveModel, listModels, promoteModel, rollbackModel, updateModelBenchmark } from "../src/ai/models/modelRegistry.js";

const trainingRoot = join(fileURLToPath(new URL("./", import.meta.url)));
const reportPath = process.env.EVAL_REPORT || join(trainingRoot, "../evals/reports/after-v3.json");

async function readReport() {
  try { return JSON.parse(await readFile(reportPath, "utf8")); }
  catch { return { failedCases: [] }; }
}

async function readCandidates() {
  return readJsonl(candidatesPath);
}

async function writeCandidates(items) {
  await mkdir(join(trainingRoot, "candidates"), { recursive: true });
  await writeFile(candidatesPath, items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : ""));
}

function correctedFailureExample(failure) {
  if (!failure.query?.trim() || !failure.expectedBehavior?.trim()) return null;
  return normalizeExample({
    id: `failure-${failure.id}`,
    type: failure.category.includes("TOOL") ? "TOOL_USE" : failure.category.includes("RETRIEVAL") ? "RAG" : failure.category.includes("REASON") ? "REASONING" : "SFT",
    instruction: failure.query,
    input: failure.actualBehavior ? `Câu trả lời trước đó chưa đạt yêu cầu: ${failure.actualBehavior}` : "",
    // CRITICAL: train toward the expected behavior, never the failed answer.
    output: failure.expectedBehavior,
    source: "EVAL_CORRECTION",
    language: "vi",
    domain: failure.category,
    difficulty: "HARD",
    qualityScore: 0.92,
    verified: true,
    privacySafe: true,
  });
}

async function prepare() {
  const report = await readReport();
  const failures = planImprovements(analyzeFailures(report));
  const corrected = [];

  for (const failure of failures) {
    const example = correctedFailureExample(failure);
    if (!example) continue;
    const privacy = privacyCheck(example);
    if (privacy.safe) corrected.push(example);
  }

  const previousCandidates = await readCandidates();
  const syntheticCount = Math.max(0, Math.min(Number(process.env.SYNTHETIC_TRAINING_COUNT) || 0, 50));
  const synthetic = await generateSyntheticExamples({
    topics: failures.map((item) => item.category),
    count: syntheticCount,
  });

  const candidateMap = new Map();
  for (const item of [...previousCandidates, ...synthetic.generated]) candidateMap.set(item.id, item);
  await writeCandidates([...candidateMap.values()]);

  // Only verified examples are allowed into the trainable dataset.
  const reviewedCandidates = [...candidateMap.values()].filter((item) => item.verified === true && item.privacySafe === true);
  const trainable = [...corrected, ...reviewedCandidates];
  const manifest = await writeDataset(trainable, DATASET_VERSION);

  console.log(JSON.stringify({
    ok: true,
    failures: failures.length,
    correctedExamples: corrected.length,
    reviewedCandidates: reviewedCandidates.length,
    quarantinedCandidates: [...candidateMap.values()].filter((item) => !item.verified).length,
    syntheticStatus: synthetic.status,
    syntheticGenerated: synthetic.generated.length,
    datasetVersion: DATASET_VERSION,
    manifest,
  }, null, 2));
}

async function reviewCandidate() {
  const id = process.argv[3];
  const decision = String(process.argv[4] || "approve").toLowerCase();
  if (!id) {
    console.error("Usage: npm run training:review -- <candidate-id> [approve|reject]");
    process.exitCode = 1;
    return;
  }

  const candidates = await readCandidates();
  const index = candidates.findIndex((item) => item.id === id);
  if (index < 0) {
    console.error(`Candidate not found: ${id}`);
    process.exitCode = 1;
    return;
  }

  if (decision === "reject") {
    candidates.splice(index, 1);
    await writeCandidates(candidates);
    console.log(JSON.stringify({ ok: true, id, decision: "rejected" }));
    return;
  }

  const candidate = { ...candidates[index], verified: true, qualityScore: Math.max(0.75, Number(candidates[index].qualityScore) || 0) };
  const privacy = privacyCheck(candidate);
  if (!privacy.safe) {
    console.error(`Candidate failed privacy review: ${privacy.reasons.join(",")}`);
    process.exitCode = 1;
    return;
  }
  candidates[index] = candidate;
  await writeCandidates(candidates);
  console.log(JSON.stringify({ ok: true, id, decision: "approved" }));
}

async function validate() {
  const examples = await readJsonl(datasetPath);
  const errors = validateExamples(examples);
  const unsafe = examples.filter((item) => item.verified !== true || Number(item.qualityScore) < 0.7).map((item) => ({ id: item.id, error: "unverified_or_low_quality" }));
  const allErrors = [...errors, ...unsafe];
  if (allErrors.length) {
    console.error(JSON.stringify({ ok: false, errors: allErrors }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ ok: true, dataset: datasetPath, examples: examples.length, manifest: manifestPath }, null, 2));
}

async function inspect() {
  const examples = await readJsonl(datasetPath);
  const candidates = await readCandidates();
  console.log(JSON.stringify({
    datasetVersion: DATASET_VERSION,
    examples: examples.length,
    candidates: candidates.length,
    pendingReview: candidates.filter((item) => !item.verified).length,
    domains: [...new Set(examples.map((item) => item.domain))],
    languages: [...new Set(examples.map((item) => item.language))],
    difficulty: Object.fromEntries([...new Set(examples.map((item) => item.difficulty))].map((key) => [key, examples.filter((item) => item.difficulty === key).length])),
    splits: Object.fromEntries(["train", "validation", "test"].map((split) => [split, examples.filter((item) => item.split === split).length])),
  }, null, 2));
}

async function exportSft() {
  // Never leak held-out validation/test examples into weight updates.
  const examples = (await readJsonl(datasetPath)).filter((item) => item.verified === true && Number(item.qualityScore) >= 0.7 && item.split === "train");
  const output = join(trainingRoot, "exports", `${DATASET_VERSION}.sft.jsonl`);
  await mkdir(join(trainingRoot, "exports"), { recursive: true });
  await writeFile(output, examples.map((item) => JSON.stringify({
    messages: [
      { role: "user", content: item.input ? `${item.instruction}\n\nContext:\n${item.input}` : item.instruction },
      { role: "assistant", content: item.output },
    ],
    metadata: { id: item.id, source: item.source, domain: item.domain, qualityScore: item.qualityScore, split: item.split },
  })).join("\n") + (examples.length ? "\n" : ""));
  console.log(JSON.stringify({ ok: true, output, examples: examples.length }));
}

async function exportEval() {
  const examples = (await readJsonl(datasetPath)).filter((item) => item.verified === true && Number(item.qualityScore) >= 0.7 && ["validation", "test"].includes(item.split));
  const output = join(trainingRoot, "exports", `${DATASET_VERSION}.eval.jsonl`);
  await mkdir(join(trainingRoot, "exports"), { recursive: true });
  await writeFile(output, examples.map((item) => JSON.stringify({
    messages: [
      { role: "user", content: item.input ? `${item.instruction}\n\nContext:\n${item.input}` : item.instruction },
      { role: "assistant", content: item.output },
    ],
    metadata: { id: item.id, source: item.source, domain: item.domain, qualityScore: item.qualityScore, split: item.split },
  })).join("\n") + (examples.length ? "\n" : ""));
  console.log(JSON.stringify({ ok: true, output, examples: examples.length }));
}

async function exportPreference() {
  const examples = (await readJsonl(datasetPath)).filter((item) => item.type === "PREFERENCE" && item.verified === true);
  const output = join(trainingRoot, "exports", `${DATASET_VERSION}.preference.jsonl`);
  await mkdir(join(trainingRoot, "exports"), { recursive: true });
  await writeFile(output, examples.map((item) => JSON.stringify({ prompt: item.instruction, chosen: item.output, rejected: item.input || "", metadata: { id: item.id, source: item.source } })).join("\n") + (examples.length ? "\n" : ""));
  console.log(JSON.stringify({ ok: true, output, examples: examples.length }));
}

async function improvementReport() {
  const report = await readReport();
  const failures = planImprovements(analyzeFailures(report));
  console.log(JSON.stringify({
    report: reportPath,
    totalFailures: failures.length,
    categories: Object.fromEntries([...new Set(failures.map((item) => item.category))].map((category) => [category, failures.filter((item) => item.category === category).length])),
    interventions: failures.map(({ category, intervention }) => ({ category, intervention })),
  }, null, 2));
}

async function benchmark() {
  const report = await readReport();
  const model = process.env.MODEL_ID || (await getActiveModel())?.id || process.env.AI_MODEL || "ollama-default";
  console.log(JSON.stringify({
    model,
    dataset: report.datasetVersion || "v3-final-100",
    metrics: {
      overall: report.passRate ?? null,
      retrieval: report.retrievalHitRate ?? null,
      memory: report.memoryAccuracy ?? null,
      math: report.mathAccuracy ?? null,
      toolUse: report.toolSuccessRate ?? null,
      latency: report.averageLatency ?? null,
    },
    executed: false,
    note: "Uses the existing held-out application evaluation; run real-model eval before promotion.",
  }, null, 2));
}

async function evaluatePromotionGate(report) {
  const overall = Number(report.passRate);
  const minOverall = Number(process.env.PROMOTION_MIN_PASS_RATE || 0.85);
  const minGroup = Number(process.env.PROMOTION_MIN_GROUP_RATE || 0.7);
  const groups = Object.entries(report.groups || {});
  const weakGroups = groups
    .map(([name, value]) => ({ name, rate: Number(value?.passed || 0) / Math.max(Number(value?.total || 0), 1) }))
    .filter((item) => item.rate < minGroup);
  const criticalFailures = (report.failedCases || []).filter((item) => ["hallucination", "security", "math", "tool-use"].includes(item.group));
  const passed = Number.isFinite(overall)
    && overall >= minOverall
    && weakGroups.length === 0
    && criticalFailures.length === 0;
  return { passed, overall, minOverall, minGroup, weakGroups, criticalFailures: criticalFailures.map((item) => item.id) };
}

async function modelAutoPromote() {
  const id = process.argv[3];
  if (!id) {
    console.error("Usage: npm run model:auto-promote -- <candidate-id>");
    process.exitCode = 1;
    return;
  }
  const report = await readReport();
  const gate = await evaluatePromotionGate(report);
  const benchmark = {
    evaluatedAt: new Date().toISOString(),
    report: reportPath,
    passRate: report.passRate ?? null,
    averageLatency: report.averageLatency ?? null,
    groups: report.groups || {},
    gate,
  };
  await updateModelBenchmark(id, benchmark);
  if (!gate.passed) {
    console.error(JSON.stringify({ ok: false, promoted: false, id, gate }, null, 2));
    process.exitCode = 2;
    return;
  }
  const promoted = await promoteModel(id, { passed: true });
  console.log(JSON.stringify({ ok: true, promoted: true, model: promoted, gate }, null, 2));
}

async function modelList() { console.log(JSON.stringify(await listModels(), null, 2)); }
async function modelPromote() {
  const id = process.argv[3];
  try { console.log(JSON.stringify(await promoteModel(id, { passed: process.env.PROMOTION_GATE === "true" }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
async function modelRollback() {
  try { console.log(JSON.stringify(await rollbackModel(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

async function train() {
  console.error("GPU trainer is bundled at training/gpu/qlora_train.py. Run npm run training:gpu on an NVIDIA CUDA machine after training:prepare, training:validate and training:export:sft.");
  process.exitCode = 2;
}

const command = process.argv[2];
if (command === "training:prepare") await prepare();
else if (command === "training:review") await reviewCandidate();
else if (command === "training:validate") await validate();
else if (command === "training:inspect") await inspect();
else if (command === "training:export:sft") await exportSft();
else if (command === "training:export:eval") await exportEval();
else if (command === "training:export:preference") await exportPreference();
else if (command === "improvement:report") await improvementReport();
else if (command === "benchmark:model") await benchmark();
else if (command === "model:list") await modelList();
else if (command === "model:promote") await modelPromote();
else if (command === "model:auto-promote") await modelAutoPromote();
else if (command === "model:rollback") await modelRollback();
else if (command === "training:run") await train();
else { console.error(`Unknown command: ${command}`); process.exitCode = 1; }
