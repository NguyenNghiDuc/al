import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATASET_VERSION, isTrainingExample, normalizeExample } from "./schema.js";
import { privacyCheck } from "./privacy.js";

export const trainingRoot = join(fileURLToPath(new URL("./", import.meta.url)));
export const candidatesPath = join(trainingRoot, "candidates", "candidates.jsonl");
export const datasetPath = join(trainingRoot, "datasets", `${DATASET_VERSION}.jsonl`);
export const manifestPath = join(trainingRoot, "datasets", `${DATASET_VERSION}.manifest.json`);

export async function readJsonl(path) { try { return (await readFile(path, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line)); } catch { return []; } }
export function stableSplit(id) { const value = Number.parseInt(createHash("sha256").update(String(id)).digest("hex").slice(0, 8), 16) % 100; return value < 80 ? "train" : value < 90 ? "validation" : "test"; }
export function validateExamples(examples) {
  const errors = []; const ids = new Set(); const hashes = new Map();
  for (const example of examples) {
    if (!isTrainingExample(example)) errors.push({ id: example?.id, error: "invalid_schema" });
    if (ids.has(example?.id)) errors.push({ id: example?.id, error: "duplicate_id" });
    ids.add(example?.id);
    const privacy = privacyCheck(example); if (!privacy.safe) errors.push({ id: example?.id, error: privacy.reasons.join(",") });
    const hash = createHash("sha256").update(`${example?.instruction}\n${example?.output}`).digest("hex");
    if (hashes.has(hash)) errors.push({ id: example?.id, error: `duplicate_content:${hashes.get(hash)}` }); else hashes.set(hash, example?.id);
  }
  return errors;
}
export async function writeDataset(examples, version = DATASET_VERSION) {
  await mkdir(join(trainingRoot, "datasets"), { recursive: true });
  const normalized = examples.map((example) => normalizeExample(example, version));
  const errors = validateExamples(normalized); if (errors.length) throw new Error(`Dataset validation failed: ${JSON.stringify(errors)}`);
  await writeFile(join(trainingRoot, "datasets", `${version}.jsonl`), normalized.map((example) => JSON.stringify({ ...example, split: stableSplit(example.id) })).join("\n") + (normalized.length ? "\n" : ""));
  const manifest = { version, createdAt: new Date().toISOString(), examples: normalized.length, domains: [...new Set(normalized.map((item) => item.domain))], sourceDistribution: Object.fromEntries([...new Set(normalized.map((item) => item.source))].map((source) => [source, normalized.filter((item) => item.source === source).length])), hashes: normalized.map((item) => createHash("sha256").update(JSON.stringify(item)).digest("hex")) };
  await writeFile(join(trainingRoot, "datasets", `${version}.manifest.json`), JSON.stringify(manifest, null, 2)); return manifest;
}
