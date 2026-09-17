import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const directory = join(fileURLToPath(new URL("../../../data/", import.meta.url)));
const path = join(directory, "taskState.json");
let tasks = {};
let loaded = false;
let queue = Promise.resolve();
async function load() { if (loaded) return; try { tasks = JSON.parse(await readFile(path, "utf8")); } catch { tasks = {}; } loaded = true; }
async function save() { queue = queue.then(async () => { await mkdir(directory, { recursive: true }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(tasks, null, 2)); await rename(temp, path); }); return queue; }
export async function getActiveTask(userId) { await load(); return Object.values(tasks).find((task) => task.userId === userId && task.status === "ACTIVE") || null; }
export async function upsertTask(userId, patch = {}) { await load(); const current = await getActiveTask(userId); const task = { taskId: current?.taskId || randomUUID(), userId, status: "ACTIVE", completedSteps: [], pendingSteps: [], artifacts: [], errors: [], ...current, ...patch, lastUpdated: new Date().toISOString() }; tasks[task.taskId] = task; await save(); return task; }
export async function completeTask(userId, status = "COMPLETED") { const task = await getActiveTask(userId); if (!task) return null; task.status = status; task.lastUpdated = new Date().toISOString(); await save(); return task; }
