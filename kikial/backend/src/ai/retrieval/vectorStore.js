import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = join(fileURLToPath(new URL("../../../data/", import.meta.url)));
const indexPath = join(dataDirectory, "vectorIndex.json");
let entries = [];
let loaded = false;
let writeQueue = Promise.resolve();

const persist = () => {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dataDirectory, { recursive: true });
    const temporary = `${indexPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(entries), "utf8");
    await rename(temporary, indexPath);
  });
  return writeQueue;
};

async function ensureLoaded() {
  if (loaded) return;
  try {
    const data = JSON.parse(await readFile(indexPath, "utf8"));
    entries = Array.isArray(data) ? data : [];
  } catch {
    entries = [];
  }
  loaded = true;
}

const cosine = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0; let left = 0; let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]; left += a[index] ** 2; right += b[index] ** 2;
  }
  return left && right ? dot / Math.sqrt(left * right) : 0;
};

export const vectorStore = {
  async upsert(item) {
    await ensureLoaded();
    const index = entries.findIndex((entry) => entry.id === item.id);
    if (index === -1) entries.push(item); else entries[index] = item;
    await persist();
    return item;
  },
  async upsertMany(items) {
    await ensureLoaded();
    const incoming = new Map(items.map((item) => [item.id, item]));
    entries = entries.filter((entry) => !incoming.has(entry.id));
    entries.push(...items);
    await persist();
    return items;
  },
  async search(vector, limit = 20) {
    await ensureLoaded();
    return entries.map((entry) => ({ ...entry, similarity: cosine(vector, entry.vector) }))
      .sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  },
  async remove(id) {
    await ensureLoaded();
    entries = entries.filter((entry) => entry.id !== id);
    await persist();
  },
  async update(id, patch) {
    await ensureLoaded();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    entries[index] = { ...entries[index], ...patch };
    await persist();
    return true;
  },
  async reindex(items) {
    entries = items;
    loaded = true;
    await persist();
    return entries.length;
  },
  async count() { await ensureLoaded(); return entries.length; },
  async all() { await ensureLoaded(); return [...entries]; },
};
