import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFailures } from "../src/ai/improvement/failureAnalyzer.js";
import { planImprovements } from "../src/ai/improvement/improvementPlanner.js";
import { candidatesPath, datasetPath, manifestPath, readJsonl, validateExamples, writeDataset } from "./dataset.js";
import { DATASET_VERSION } from "./schema.js";
import { privacyCheck } from "./privacy.js";
import { normalizeExample } from "./schema.js";
import { generateSyntheticExamples } from "./synthetic/generator.js";
import { getActiveModel, listModels, promoteModel, rollbackModel } from "../src/ai/models/modelRegistry.js";

const trainingRoot = join(fileURLToPath(new URL("./", import.meta.url)));
const reportPath = process.env.EVAL_REPORT || join(trainingRoot, "../evals/reports/after-v3.json");
async function readReport() { try { return JSON.parse(await readFile(reportPath, "utf8")); } catch { return { failedCases: [] }; } }
async function prepare() {
  const report = await readReport(); const failures = planImprovements(analyzeFailures(report)); const accepted = [];
  for (const failure of failures) {
    const example = normalizeExample({ id: `failure-${failure.id}`, type: failure.category.includes("TOOL") ? "TOOL_USE" : failure.category.includes("RETRIEVAL") ? "RAG" : "REASONING", instruction: failure.query, input: failure.expectedBehavior, output: failure.actualBehavior, source: "EVAL_FAILURE", language: "vi", domain: failure.category, difficulty: "HARD", qualityScore: 0.5, verified: false, privacySafe: true });
    const privacy = privacyCheck(example); if (privacy.safe) accepted.push(example);
  }
  await mkdir(join(trainingRoot, "candidates"), { recursive: true });
  await writeFile(candidatesPath, accepted.map((item) => JSON.stringify(item)).join("\n") + (accepted.length ? "\n" : ""));
  const manifest = await writeDataset(accepted, DATASET_VERSION);
  const synthetic = await generateSyntheticExamples({ topics: failures.map((item) => item.category), count: 0 });
  console.log(JSON.stringify({ ok: true, failures: failures.length, acceptedCandidates: accepted.length, syntheticStatus: synthetic.status, datasetVersion: DATASET_VERSION, manifest }, null, 2));
}
async function validate() { const examples = await readJsonl(datasetPath); const errors = validateExamples(examples); if (errors.length) { console.error(JSON.stringify({ ok: false, errors }, null, 2)); process.exitCode = 1; return; } console.log(JSON.stringify({ ok: true, dataset: datasetPath, examples: examples.length, manifest: manifestPath }, null, 2)); }
async function inspect() { const examples = await readJsonl(datasetPath); console.log(JSON.stringify({ datasetVersion: DATASET_VERSION, examples: examples.length, domains: [...new Set(examples.map((item) => item.domain))], languages: [...new Set(examples.map((item) => item.language))], difficulty: Object.fromEntries([...new Set(examples.map((item) => item.difficulty))].map((key) => [key, examples.filter((item) => item.difficulty === key).length])), splits: Object.fromEntries(["train", "validation", "test"].map((split) => [split, examples.filter((item) => item.split === split).length])) }, null, 2)); }
async function exportSft() { const examples = await readJsonl(datasetPath); const output = join(trainingRoot, "exports", `${DATASET_VERSION}.sft.jsonl`); await mkdir(join(trainingRoot, "exports"), { recursive: true }); await writeFile(output, examples.map((item) => JSON.stringify({ messages: [{ role: "user", content: item.instruction }, { role: "assistant", content: item.output }], metadata: { id: item.id, source: item.source, domain: item.domain } })).join("\n") + (examples.length ? "\n" : "")); console.log(JSON.stringify({ ok: true, output, examples: examples.length })); }
async function exportPreference() { const examples = (await readJsonl(datasetPath)).filter((item) => item.type === "PREFERENCE"); const output = join(trainingRoot, "exports", `${DATASET_VERSION}.preference.jsonl`); await mkdir(join(trainingRoot, "exports"), { recursive: true }); await writeFile(output, examples.map((item) => JSON.stringify({ prompt: item.instruction, chosen: item.output, rejected: item.input || "", metadata: { id: item.id, source: item.source } })).join("\n") + (examples.length ? "\n" : "")); console.log(JSON.stringify({ ok: true, output, examples: examples.length })); }
async function improvementReport() { const report = await readReport(); const failures = planImprovements(analyzeFailures(report)); console.log(JSON.stringify({ report: reportPath, totalFailures: failures.length, categories: Object.fromEntries([...new Set(failures.map((item) => item.category))].map((category) => [category, failures.filter((item) => item.category === category).length])), interventions: failures.map(({ category, intervention }) => ({ category, intervention })) }, null, 2)); }
async function benchmark() { const report = await readReport(); const model = process.env.MODEL_ID || (await getActiveModel())?.id || process.env.AI_MODEL || "ollama-default"; console.log(JSON.stringify({ model, dataset: report.datasetVersion || "v3-final-100", metrics: { overall: report.passRate ?? null, retrieval: report.retrievalHitRate ?? null, memory: report.memoryAccuracy ?? null, math: report.mathAccuracy ?? null, toolUse: report.toolSuccessRate ?? null, latency: report.averageLatency ?? null }, executed: false, note: "Uses the existing held-out application evaluation; no model inference was available in this environment." }, null, 2)); }
async function modelList() { console.log(JSON.stringify(await listModels(), null, 2)); }
async function modelPromote() { const id = process.argv[3]; try { console.log(JSON.stringify(await promoteModel(id, { passed: process.env.PROMOTION_GATE === "true" }), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
async function modelRollback() { try { console.log(JSON.stringify(await rollbackModel(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
async function train() { console.error("TRAINING EXECUTION: NOT RUN\nREASON: no verified training backend/GPU dependencies are configured; use the prepared JSONL with an external PyTorch/Transformers/PEFT environment."); process.exitCode = 2; }
const command = process.argv[2];
if (command === "training:prepare") await prepare();
else if (command === "training:validate") await validate();
else if (command === "training:inspect") await inspect();
else if (command === "training:export:sft") await exportSft();
else if (command === "training:export:preference") await exportPreference();
else if (command === "improvement:report") await improvementReport();
else if (command === "benchmark:model") await benchmark();
else if (command === "model:list") await modelList();
else if (command === "model:promote") await modelPromote();
else if (command === "model:rollback") await modelRollback();
else if (command === "training:run") await train();
else { console.error(`Unknown command: ${command}`); process.exitCode = 1; }
