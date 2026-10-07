import { existsSync } from "node:fs";
import { resolve } from "node:path";

const base = String(process.env.AI_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const requiredModels = [
  process.env.AI_MODEL || "llama3.2:3b",
  process.env.AI_EMBEDDING_MODEL || "nomic-embed-text",
  process.env.AI_CODING_MODEL,
  process.env.AI_REASONING_MODEL,
  process.env.AI_FAST_MODEL,
  ...String(process.env.AI_FALLBACK_MODELS || "").split(","),
].map((item) => String(item || "").trim()).filter(Boolean);

function unique(values) {
  return [...new Set(values)];
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(3500) });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, error: error.message, body: {} };
  }
}

function sameModel(installed, wanted) {
  return installed === wanted || installed === `${wanted}:latest` || wanted === `${installed}:latest`;
}

async function main() {
  const checks = [];
  const add = (name, ok, detail, fix = null) => checks.push({ name, ok, detail, ...(fix ? { fix } : {}) });

  add(
    "node",
    Number(process.versions.node.split(".")[0]) >= 22,
    `Node ${process.versions.node}`,
    "Use Node 22+ so the SQLite document store and runtime APIs are available.",
  );

  const authSecret = String(process.env.AUTH_SECRET || "");
  add(
    "auth-secret",
    authSecret.length >= 32,
    authSecret.length >= 32 ? "AUTH_SECRET is configured." : "AUTH_SECRET is missing or too short.",
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );

  const ollama = await fetchJson(`${base}/api/tags`);
  const installed = Array.isArray(ollama.body?.models) ? ollama.body.models.map((item) => item.name).filter(Boolean) : [];
  add(
    "ollama",
    ollama.ok,
    ollama.ok ? `Ollama online; ${installed.length} model(s) installed.` : `Ollama unavailable at ${base}.`,
    "Start Ollama with: ollama serve",
  );

  for (const model of unique(requiredModels)) {
    const present = installed.some((name) => sameModel(name, model));
    add(
      `model:${model}`,
      present,
      present ? "installed" : "missing",
      `Install with: ollama pull ${model}`,
    );
  }

  const searx = String(process.env.SEARXNG_URL || "").replace(/\/$/, "");
  if (searx) {
    const search = await fetchJson(`${searx}/search?q=kikial+health&format=json`);
    add(
      "web-search",
      search.ok,
      search.ok ? "SearXNG search is reachable." : `SearXNG configured but unavailable at ${searx}.`,
      "Start the bundled service from kikial/: docker compose up -d searxng",
    );
  } else {
    add(
      "web-search",
      false,
      "No live web search endpoint configured.",
      "Set SEARXNG_URL=http://127.0.0.1:8080 and start docker compose service searxng for fresh/current questions.",
    );
  }

  const storagePath = resolve(process.env.KIKIAL_DATABASE_PATH || "./data/kikial.sqlite");
  add(
    "storage-path",
    existsSync(resolve("./data")) || existsSync(storagePath),
    `Document store path: ${storagePath}`,
    "Create the backend data directory before first run.",
  );

  const failed = checks.filter((item) => !item.ok);
  console.log(JSON.stringify({
    ok: failed.length === 0,
    summary: {
      passed: checks.length - failed.length,
      failed: failed.length,
      total: checks.length,
    },
    checks,
  }, null, 2));

  if (failed.length) process.exitCode = 2;
}

await main();
