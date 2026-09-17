import { mkdir, writeFile } from "node:fs/promises";
import { evalCases } from "./evalCases.js";

const baseUrl = process.env.EVAL_BASE_URL || "http://127.0.0.1:4400";
const email = process.env.EVAL_EMAIL || `eval-${Date.now()}@kikial.local`;
const password = process.env.EVAL_PASSWORD || "123456";
const label = process.env.EVAL_LABEL || "baseline";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function login() {
  let result = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!result.body.token) {
    result = await request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Evaluation User", email, password }),
    });
  }
  if (!result.body.token) throw new Error(`Evaluation login failed: ${JSON.stringify(result.body)}`);
  return result.body.token;
}

function matches(value, pattern) {
  return pattern ? pattern.test(String(value || "")) : true;
}

const token = await login();
const results = [];
for (const testCase of evalCases) {
  const started = performance.now();
  let response;
  let error = null;
  try {
    response = await request("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message: testCase.message, history: testCase.history || [] }),
    });
  } catch (caught) {
    error = caught.message;
  }
  const answer = response?.body?.answer || response?.body?.message || "";
  const passed = !error && response?.status === 200 && matches(answer, testCase.expect) && (!testCase.reject || !testCase.reject.test(answer));
  results.push({ id: testCase.id, group: testCase.group, passed, latencyMs: Math.round(performance.now() - started), answer, error });
}

const groups = Object.fromEntries([...new Set(evalCases.map(({ group }) => group))].map((group) => {
  const groupResults = results.filter((result) => result.group === group);
  return [group, { total: groupResults.length, passed: groupResults.filter((result) => result.passed).length }];
}));
const metric = (group) => {
  const selected = results.filter((result) => result.group === group);
  return selected.length ? selected.filter((result) => result.passed).length / selected.length : null;
};
const summary = {
  label,
  baseUrl,
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  passRate: results.filter((result) => result.passed).length / results.length,
  retrievalHitRate: metric("rag-paraphrase"),
  memoryAccuracy: metric("memory"),
  mathAccuracy: metric("math"),
  toolSuccessRate: metric("tool-use"),
  averageLatency: results.reduce((total, result) => total + result.latencyMs, 0) / results.length,
  groups,
  failedCases: results.filter((result) => !result.passed),
  results,
};

await mkdir("evals/reports", { recursive: true });
await writeFile(`evals/reports/${label}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, results: undefined }, null, 2));
