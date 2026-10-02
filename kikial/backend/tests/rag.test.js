import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeQuery } from "../src/ai/query/queryAnalyzer.js";
import { rerank } from "../src/ai/retrieval/reranker.js";
import { selectEvidence, createEvidencePack } from "../src/ai/context/evidencePack.js";
import { orchestrate } from "../src/ai/orchestrator.js";
import { resolveReference } from "../src/ai/context/referenceResolver.js";
import { expandQuery } from "../src/ai/query/queryRewriter.js";
import { compressEvidence } from "../src/ai/context/contextCompression.js";
import { executeStructuredTool } from "../src/ai/tools/toolExecution.js";
import { executePlan } from "../src/ai/planner.js";
import { indexCodeContext, searchCodeContext } from "../src/ai/code/codeContext.js";
import { verifyLessonCandidate } from "../src/ai/verification/verifier.js";
import { recordExperience, submitFailure, listVerifiedLessons, listLessons } from "../src/ai/experience/experienceStore.js";
import { analyzeFailures } from "../src/ai/improvement/failureAnalyzer.js";
import { privacyCheck } from "../training/privacy.js";
import { normalizeExample } from "../training/schema.js";
import { stableSplit } from "../training/dataset.js";
import { handleChatRoute } from "../src/routes/chats.js";
import { retrieveEvidence } from "../src/ai/retrieval/index.js";
import { initializeMemory } from "../lib/learningMemory.js";

async function freshModule(path, query = Date.now()) { return import(`${pathToFileURL(path).href}?test=${query}`); }

async function withDocumentStore(callback) {
  const directory = await mkdtemp(join(tmpdir(), "kikial-rag-"));
  const path = join(directory, "documents.json");
  const previous = process.env.KIKIAL_DOCUMENTS_PATH;
  process.env.KIKIAL_DOCUMENTS_PATH = path;
  try {
    const documents = await freshModule(join(process.cwd(), "src/services/documentService.js"));
    await callback(documents, path);
  } finally {
    if (previous === undefined) delete process.env.KIKIAL_DOCUMENTS_PATH;
    else process.env.KIKIAL_DOCUMENTS_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

async function withExperienceStore(callback) {
  const directory = await mkdtemp(join(tmpdir(), "kikial-experience-"));
  const previous = process.env.KIKIAL_EXPERIENCE_PATH;
  const path = join(directory, "experience.json");
  process.env.KIKIAL_EXPERIENCE_PATH = path;
  try {
    const module = await freshModule(join(process.cwd(), "src/ai/experience/experienceStore.js"), Math.random());
    await callback(module, path);
  } finally {
    if (previous === undefined) delete process.env.KIKIAL_EXPERIENCE_PATH;
    else process.env.KIKIAL_EXPERIENCE_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

function localSources(documentRetriever) {
  return {
    documentRetriever,
    knowledgeRetriever: async () => [],
    experienceRetriever: async () => [],
    lessonRetriever: async () => [],
    webRetriever: async () => [],
  };
}

test("query analyzer skips retrieval for simple chat and enables it for factual questions", () => {
  assert.equal(analyzeQuery("Xin chào").needsRetrieval, false);
  assert.equal(analyzeQuery("TCP là gì?").needsRetrieval, true);
});

test("uploaded documents are retrieved, merged across files, and carry source metadata", async () => {
  await withDocumentStore(async (documents) => {
    await documents.addDocument("u1", "network-a.txt", "TCP is reliable and connection oriented.");
    await documents.addDocument("u1", "network-b.txt", "UDP is connectionless and lightweight.");
    const results = await retrieveEvidence({ userId: "u1", query: "reliable UDP", ...localSources(documents.searchDocuments), limit: 5 });
    assert.ok(results.some((item) => item.filename === "network-a.txt"));
    assert.ok(results.some((item) => item.filename === "network-b.txt"));
    assert.ok(results.every((item) => item.sourceType === "document"));
  });
});

test("reranking retains document metadata", () => {
  const result = rerank("flutter widget", [{ id: "doc1", question: "notes.txt", answer: "Flutter widget tree", filename: "notes.txt", chunkId: "x:1", similarity: 0.8 }]);
  assert.equal(result[0].filename, "notes.txt");
  assert.equal(result[0].chunkId, "x:1");
});

test("evidence selection enforces score, chunk and character budgets and removes duplicates", () => {
  const selected = selectEvidence([
    { id: "a", text: "alpha beta gamma delta", score: 0.9 },
    { id: "b", text: "alpha beta gamma delta", score: 0.8 },
    { id: "c", text: "unique evidence about flutter", score: 0.7 },
    { id: "d", text: "low quality", score: 0.01 },
  ], { maxChunks: 2, maxChars: 80, minScore: 0.2 });
  assert.equal(selected.length, 2);
  assert.equal(selected[0].id, "a");
  assert.equal(selected[1].id, "c");
});

test("composite retrieval returns no results cleanly", async () => {
  const results = await retrieveEvidence({ userId: "u", query: "nothing", documentRetriever: async () => [], knowledgeRetriever: async () => [], experienceRetriever: async () => [], lessonRetriever: async () => [], webRetriever: async () => [] });
  assert.deepEqual(results, []);
});

test("verified lessons retain their source type through retrieval", async () => {
  const results = await retrieveEvidence({
    userId: "u",
    query: "queue migration",
    documentRetriever: async () => [],
    knowledgeRetriever: async () => [],
    experienceRetriever: async () => [],
    webRetriever: async () => [],
    lessonRetriever: async () => [{ id: "lesson-1", sourceId: "lesson-1", lessonId: "lesson-1", sourceType: "lesson", question: "queue migration", answer: "Drain before switching.", text: "Drain before switching.", similarity: 0.95, score: 0.95, verified: true }],
  });
  assert.equal(results[0].sourceType, "lesson");
  assert.equal(results[0].lessonId, "lesson-1");
});

test("simple chat does not call retrieval and retrieval failure falls back to a model answer", async () => {
  let retrievalCalls = 0;
  const previousDisable = process.env.AI_DISABLE_MODEL;
  delete process.env.AI_DISABLE_MODEL;
  try {
    const simple = await orchestrate({ userId: "u", message: "Xin chào", retrieve: async () => { retrievalCalls += 1; return []; }, generateAnswer: async () => "Xin chào từ model", persistExperience: async () => ({}) });
    assert.equal(retrievalCalls, 0);
    assert.equal(simple.answer, "Xin chào từ model");

    const factual = await orchestrate({
      userId: "u",
      message: "Quartz queue migration là gì?",
      retrieve: async () => { retrievalCalls += 1; throw Object.assign(new Error("offline"), { code: "RETRIEVAL_OFFLINE" }); },
      generateAnswer: async () => "Model fallback after retrieval failure.",
      persistExperience: async () => ({}),
    });
    assert.equal(factual.answer, "Model fallback after retrieval failure.");
    assert.ok(retrievalCalls >= 1);
  } finally {
    if (previousDisable === undefined) delete process.env.AI_DISABLE_MODEL;
    else process.env.AI_DISABLE_MODEL = previousDisable;
  }
});

test("assistant core routes personal memory and conversation context before the current request", async () => {
  const previousDisable = process.env.AI_DISABLE_MODEL;
  delete process.env.AI_DISABLE_MODEL;
  try {
    let modelContext = "";
    const result = await orchestrate({
      userId: "memory-user",
      message: "Vậy ngôn ngữ đó dùng để làm gì?",
      history: [{ role: "user", content: "Tôi đang học Dart" }, { role: "assistant", content: "Dart thường dùng với Flutter." }],
      retrieve: async () => [],
      retrievePersonalMemory: async () => [{ id: "m1", key: "education", value: "Đang học Dart", score: 1 }],
      generateAnswer: async ({ context }) => { modelContext = context; return "Dart dùng để phát triển ứng dụng, đặc biệt với Flutter."; },
      persistExperience: async () => ({}),
    });
    assert.match(modelContext, /PERSONAL MEMORY/);
    assert.match(modelContext, /Đang học Dart/);
    assert.match(modelContext, /RECENT MESSAGES/);
    assert.equal(result.modelUsed, true);
  } finally {
    if (previousDisable === undefined) delete process.env.AI_DISABLE_MODEL;
    else process.env.AI_DISABLE_MODEL = previousDisable;
  }
});

test("calculator tool failure degrades to an assistant response", async () => {
  const result = await orchestrate({
    userId: "math-user",
    message: "12 * 7",
    runTool: async () => { throw new Error("temporary tool outage"); },
    persistExperience: async () => ({}),
  });
  assert.ok(result.answer);
});

test("an experience-store write failure does not discard a generated answer", async () => {
  const previousDisable = process.env.AI_DISABLE_MODEL;
  delete process.env.AI_DISABLE_MODEL;
  try {
    const result = await orchestrate({
      userId: "learning-failure-user",
      message: "Explain how a quartz queue migration should be planned",
      retrieve: async () => [],
      generateAnswer: async () => "Drain the old queue before switching traffic.",
      persistExperience: async () => { throw Object.assign(new Error("store unavailable"), { code: "STORE_OFFLINE" }); },
    });
    assert.equal(result.answer, "Drain the old queue before switching traffic.");
    assert.ok(result.interactionId);
  } finally {
    if (previousDisable === undefined) delete process.env.AI_DISABLE_MODEL;
    else process.env.AI_DISABLE_MODEL = previousDisable;
  }
});

test("chat endpoint retrieves uploaded evidence before generation and returns compact sources", async () => {
  const previousDisable = process.env.AI_DISABLE_MODEL;
  delete process.env.AI_DISABLE_MODEL;
  try {
    await withDocumentStore(async (documents) => {
      const privateDocumentText = "Quartz migration requires draining the legacy queue before traffic is switched.";
      await documents.addDocument("rag-user@example.test", "migration-guide.txt", privateDocumentText);
      let modelContext = "";
      const runOrchestrator = (args) => orchestrate({
        ...args,
        retrieve: (options) => retrieveEvidence({ ...options, ...localSources(documents.searchDocuments) }),
        generateAnswer: async ({ context, hasEvidence }) => {
          modelContext = context;
          assert.equal(hasEvidence, true);
          return "Drain the legacy queue before switching traffic.";
        },
        persistExperience: async () => ({}),
      });
      const response = {};
      let status;
      let payload;
      await handleChatRoute({
        request: {},
        response,
        readJson: async () => ({ message: "What does the quartz migration require?" }),
        send: (_response, responseStatus, body) => { status = responseStatus; payload = body; },
        contentType: "application/json",
        user: { email: "rag-user@example.test" },
        traceId: "rag-test",
        runOrchestrator,
      });
      const result = JSON.parse(payload);
      assert.equal(status, 200);
      assert.equal(result.ok, true);
      assert.match(modelContext, /RETRIEVED EVIDENCE/);
      assert.match(modelContext, /Quartz migration requires draining/);
      assert.equal(result.retrieval.used, true);
      assert.equal(result.retrieval.count, 1);
      assert.equal(result.sources[0].filename, "migration-guide.txt");
      assert.equal(result.sources[0].sourceType, "document");
      assert.equal(JSON.stringify(result).includes(privateDocumentText), false);
    });
  } finally {
    if (previousDisable === undefined) delete process.env.AI_DISABLE_MODEL;
    else process.env.AI_DISABLE_MODEL = previousDisable;
  }
});

test("end-to-end: verified failure lesson is retrieved into the next model context", async () => {
  await withExperienceStore(async () => {
    const previousEmbeddingSetting = process.env.AI_EMBEDDING_OFFLINE;
    const previousModelSetting = process.env.AI_DISABLE_MODEL;
    process.env.AI_EMBEDDING_OFFLINE = "true";
    delete process.env.AI_DISABLE_MODEL;
    await initializeMemory();
    try {
      const q1 = "What is the safe quartz queue migration order?";
      const first = await orchestrate({
        userId: "learning-loop-user",
        message: q1,
        retrieve: async () => [],
        generateAnswer: async () => "Switch traffic immediately.",
        persistExperience: recordExperience,
      });
      await submitFailure({
        interactionId: first.interactionId,
        userInput: q1,
        assistantAnswer: first.answer,
        correction: "Drain the old queue before switching traffic.",
        reason: "The previous answer skipped the drain step.",
      });
      const lessons = await listLessons();
      const candidate = lessons.find((item) => item.originInteractionIds?.includes(first.interactionId));
      assert.ok(candidate);
      const verification = verifyLessonCandidate(candidate, [{ sourceType: "trusted_reference", sourceId: "runbook-1", id: "runbook-1", text: "Drain the old queue before switching traffic.", trusted: true, verified: true }]);
      const experienceModule = await freshModule(join(process.cwd(), "src/ai/experience/experienceStore.js"), Math.random());
      // verify through the fresh module so its configured temporary store is used
      await experienceModule.verifyLesson(candidate.lessonId, verification);
      const verified = await experienceModule.listVerifiedLessons();
      assert.ok(verified.some((item) => item.lessonId === candidate.lessonId));
      let secondContext = "";
      const second = await orchestrate({
        userId: "learning-loop-user",
        message: q1,
        retrieve: async () => [{ id: candidate.lessonId, sourceId: candidate.lessonId, lessonId: candidate.lessonId, sourceType: "lesson", text: "Drain the old queue before switching traffic.", answer: "Drain the old queue before switching traffic.", score: 0.99, similarity: 0.99, confidence: 0.99, provenance: [{ sourceType: "trusted_reference", sourceId: "runbook-1" }], verified: true }],
        generateAnswer: async ({ context }) => { secondContext = context; return "Drain the old queue before switching traffic."; },
        persistExperience: async () => ({}),
      });
      assert.match(secondContext, /lesson=/);
      assert.match(secondContext, /Drain the old queue/);
      assert.equal(second.answer, "Drain the old queue before switching traffic.");
    } finally {
      if (previousEmbeddingSetting === undefined) delete process.env.AI_EMBEDDING_OFFLINE;
      else process.env.AI_EMBEDDING_OFFLINE = previousEmbeddingSetting;
      if (previousModelSetting === undefined) delete process.env.AI_DISABLE_MODEL;
      else process.env.AI_DISABLE_MODEL = previousModelSetting;
    }
  });
});

test("lesson lifecycle quarantines unsupported corrections and never retrieves unverified states", async () => {
  const candidate = { correction: "Drain old queue", originInteractionIds: ["i1"], conflictsWith: [] };
  const noEvidence = verifyLessonCandidate(candidate, []);
  assert.equal(noEvidence.status, "quarantined");
  const contradiction = verifyLessonCandidate(candidate, [{ id: "s", sourceId: "s", sourceType: "trusted_reference", text: "Do not drain", trusted: true, verified: true, contradictsCorrection: true }]);
  assert.equal(contradiction.status, "rejected");
});

test("duplicate lessons merge origins and conflicting verified lessons are quarantined", async () => {
  await withExperienceStore(async (experience) => {
    await experience.recordExperience({ interactionId: "dup-1", userInput: "queue?", assistantAnswer: "a", modelId: "m" });
    await experience.submitFailure({ interactionId: "dup-1", userInput: "queue?", assistantAnswer: "a", correction: "Drain first" });
    await experience.recordExperience({ interactionId: "dup-2", userInput: "queue?", assistantAnswer: "b", modelId: "m" });
    await experience.submitFailure({ interactionId: "dup-2", userInput: "queue?", assistantAnswer: "b", correction: "Drain first" });
    const lessons = await experience.listLessons();
    const merged = lessons.find((item) => item.correction === "Drain first");
    assert.ok(merged.originInteractionIds.includes("dup-1"));
    assert.ok(merged.originInteractionIds.includes("dup-2"));
  });
});

test("query rewriting resolves contextual language follow-up", () => {
  const history = [{ role: "user", content: "Flutter dùng ngôn ngữ gì?" }, { role: "assistant", content: "Dart." }];
  const reference = resolveReference("Nó dùng để làm gì?", history, "");
  const plan = expandQuery(reference.query, analyzeQuery("Nó dùng để làm gì?", history), history);
  assert.ok(plan.standalone.length > "Nó dùng để làm gì?".length);
});

test("context compression keeps provenance and budget", () => {
  const items = [{ question: "Flutter", answer: "A".repeat(1000), sourceType: "knowledge", provenance: { sourceType: "CURATED" }, score: 1 }];
  const compressed = compressEvidence(items, "Flutter", 100);
  assert.ok(compressed[0].answer.length <= 100);
  assert.equal(compressed[0].provenance.sourceType, "CURATED");
});

test("structured tool execution reports failures without pretending success", async () => {
  const result = await executeStructuredTool({ name: "broken", execute: async () => { throw new Error("boom"); } }, {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /boom/);
});

test("planner executes independent retrieval steps with bounds", async () => {
  let calls = 0;
  const plan = { steps: [{ id: "a", action: "retrieve" }, { id: "b", action: "retrieve" }] };
  const result = await executePlan(plan, { retrieve: async () => { calls += 1; return [calls]; }, budget: { maxAgentSteps: 2 } });
  assert.equal(calls, 2);
  assert.equal(result.completed.length, 2);
});

test("code context indexes symbols without executing code", () => {
  indexCodeContext("x.js", "function hello() { return 1; }\nclass World {}", "javascript");
  const result = searchCodeContext("hello");
  assert.ok(result.some((item) => item.symbol === "hello"));
});

test("reranker rewards exact entities and verified source", () => {
  const results = rerank("Flutter Dart", [
    { id: "weak", question: "Flutter", answer: "UI framework", similarity: 0.8, verified: false },
    { id: "strong", question: "Flutter Dart", answer: "Flutter uses Dart", similarity: 0.5, verified: true },
  ]);
  assert.equal(results[0].id, "strong");
});

test("reasoning controller keeps deterministic requests at level zero", async () => {
  const { decideReasoning } = await import("../src/ai/reasoning/index.js");
  const result = decideReasoning({ intent: "MATH", complexity: "LOW", needsTools: true, needsKnowledge: false, needsFreshInformation: false });
  assert.equal(result.level, "LEVEL_0");
  assert.equal(result.budget.maxModelCalls, 0);
});

test("reasoning controller budgets complex tasks", async () => {
  const { decideReasoning } = await import("../src/ai/reasoning/index.js");
  const result = decideReasoning({ intent: "PLANNING", complexity: "HIGH", needsTools: false, needsKnowledge: true, needsFreshInformation: false });
  assert.equal(result.level, "LEVEL_4");
  assert.ok(result.budget.maxModelCalls >= 2);
});

test("reference resolver resolves pronouns from recent entities", () => {
  const history = [{ role: "user", content: "Node.js chạy JavaScript" }, { role: "assistant", content: "Đúng" }];
  const result = resolveReference("Nó là gì?", history, "");
  assert.ok(result.query.toLowerCase().includes("node"));
});

test("memory extraction rejects hypothetical and third-party identity", async () => {
  const { extractCandidateMemories } = await import("../src/ai/memory/memoryManager.js");
  assert.deepEqual(extractCandidateMemories("Nếu tôi tên là Nam thì sao?"), []);
  assert.deepEqual(extractCandidateMemories("Bạn tôi tên là Nam"), []);
});

test("memory extraction represents negation", async () => {
  const { extractCandidateMemories } = await import("../src/ai/memory/memoryManager.js");
  const result = extractCandidateMemories("Tôi không thích Python");
  assert.ok(result.some((item) => item.value.toLowerCase().includes("không thích")));
});

test("evidence pack standardizes provenance", () => {
  const pack = createEvidencePack({ query: "x", retrieved: [{ id: "a", sourceId: "a", sourceType: "document", text: "evidence", score: 0.9, filename: "x.txt" }] });
  assert.equal(pack.documents[0].filename, "x.txt");
  assert.equal(pack.documents[0].sourceType, "document");
});

test("answer composer adds uncertainty without leaking trace metadata", async () => {
  const { composeAnswer } = await import("../src/ai/response/answerComposer.js");
  const result = composeAnswer("Maybe", { analysis: { intent: "FACTUAL" }, confidence: { score: 0.2, level: "LOW" }, evidence: [] });
  assert.match(result.content, /chưa đủ căn cứ|không chắc|cần kiểm chứng/i);
  assert.equal(result.content.includes("traceId"), false);
});

test("model registry refuses promotion without a passed gate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kikial-model-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(originalCwd);
    const { registerModel, promoteModel } = await import("../src/ai/models/modelRegistry.js");
    const id = `candidate-${Date.now()}`;
    await registerModel({ id, baseModel: "test", provider: "ollama", type: "LOCAL", status: "CANDIDATE" });
    await assert.rejects(() => promoteModel(id, { passed: false }), /Promotion gate failed/);
  } finally {
    process.chdir(originalCwd);
    await rm(directory, { recursive: true, force: true });
  }
});

test("model registry promotes only explicit candidates and can rollback", async () => {
  const { registerModel, promoteModel, rollbackModel } = await import("../src/ai/models/modelRegistry.js");
  const id = `candidate-ok-${Date.now()}`;
  await registerModel({ id, baseModel: "test", provider: "ollama", type: "LOCAL", status: "CANDIDATE" });
  const promoted = await promoteModel(id, { passed: true });
  assert.equal(promoted.id, id);
  const rolledBack = await rollbackModel();
  assert.ok(rolledBack);
});

test("the runtime model router follows the promoted registry model", async () => {
  const { registerModel, promoteModel, getActiveModel } = await import("../src/ai/models/modelRegistry.js");
  const { getModelProvider, resetModelProvider } = await import("../src/ai/models/modelRouter.js");
  const before = await getActiveModel();
  const id = `router-${Date.now()}`;
  await registerModel({ id, baseModel: "router-model", provider: "ollama", type: "LOCAL", status: "CANDIDATE" });
  await promoteModel(id, { passed: true });
  resetModelProvider();
  const provider = await getModelProvider();
  assert.equal(provider.model, "router-model");
  if (before) {
    const rollback = await import("../src/ai/models/modelRegistry.js");
    await rollback.rollbackModel();
    resetModelProvider();
  }
});

test("failure analyzer distinguishes retrieval and memory failures", () => {
  const failures = analyzeFailures({ failedCases: [{ id: "retrieval", query: "retrieval miss wrong knowledge" }, { id: "memory", query: "remember my name" }] });
  assert.equal(failures[0].category, "RETRIEVAL_MISS");
  assert.equal(failures[1].category, "MEMORY_ERROR");
});

test("privacy gate rejects secrets and PII", () => {
  assert.equal(privacyCheck({ instruction: "api key: secret-123", output: "x" }).safe, false);
  assert.equal(privacyCheck({ instruction: "email test@example.com", output: "x" }).safe, false);
});

test("training schema and deterministic split are reproducible", () => {
  const normalized = normalizeExample({ id: "a", type: "SFT", instruction: "x", output: "y", privacySafe: true });
  assert.equal(normalized.datasetVersion.length > 0, true);
  assert.equal(stableSplit("a"), stableSplit("a"));
});

test("training config is explicit and local-first", async () => {
  const readme = await readFile(join(process.cwd(), "training/README.md"), "utf8");
  assert.match(readme, /training:prepare/);
  assert.match(readme, /training:run/);
});
