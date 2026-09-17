import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = join(fileURLToPath(new URL("../../../training/configs/", import.meta.url)));
const path = join(directory, "models.json");
const initial = { active: "ollama-default", previous: null, models: [{ id: "ollama-default", baseModel: process.env.AI_MODEL || "llama3.2:3b", version: "base", provider: "ollama", type: "LOCAL", path: null, contextWindow: 8192, capabilities: ["chat", "embed"], benchmark: null, createdAt: new Date().toISOString(), status: "ACTIVE" }] };
async function load() { try { return JSON.parse(await readFile(path, "utf8")); } catch { await mkdir(directory, { recursive: true }); await writeFile(path, JSON.stringify(initial, null, 2)); return initial; } }
async function save(value) { await mkdir(directory, { recursive: true }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(value, null, 2)); await rename(temp, path); }
export async function listModels() { return (await load()).models; }
export async function registerModel(model) { const registry = await load(); registry.models = [...registry.models.filter((item) => item.id !== model.id), { ...model, status: model.status || "CANDIDATE", createdAt: model.createdAt || new Date().toISOString() }]; await save(registry); return registry.models.at(-1); }
export async function getActiveModel() { const registry = await load(); return registry.models.find((model) => model.id === registry.active) || null; }
export async function promoteModel(id, gate = {}) { const registry = await load(); const model = registry.models.find((item) => item.id === id); if (!model) throw new Error(`Model not found: ${id}`); if (model.status !== "CANDIDATE" && model.status !== "VALIDATING") throw new Error("Only candidate/validating models can be promoted"); if (gate.passed !== true) throw new Error("Promotion gate failed"); registry.previous = registry.active; registry.active = id; model.status = "ACTIVE"; for (const item of registry.models) if (item.id !== id && item.status === "ACTIVE") item.status = "ARCHIVED"; await save(registry); return model; }
export async function rollbackModel() { const registry = await load(); if (!registry.previous) throw new Error("No previous active model"); const old = registry.models.find((item) => item.id === registry.previous); if (!old) throw new Error("Previous model not found"); const current = registry.models.find((item) => item.id === registry.active); if (current) current.status = "ARCHIVED"; old.status = "ACTIVE"; const active = registry.active; registry.active = registry.previous; registry.previous = active; await save(registry); return old; }
