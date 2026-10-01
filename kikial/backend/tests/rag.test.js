import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { orchestrate } from "../src/ai/orchestrator.js";
import { retrieveEvidence } from "../src/ai/retrieval/hybridRetriever.js";
import { rerank } from "../src/ai/retrieval/reranker.js";
import { analyzeQuery } from "../src/ai/query/queryAnalyzer.js";
import { selectEvidence } from "../src/ai/context/evidencePack.js";
import { handleChatRoute } from "../src/routes/chats.js";
import { resetModelProvider } from "../src/ai/models/modelRouter.js";
import { initializeMemory } from "../lib/learningMemory.js";
import { getExperience, listExperienceStore, markInteractionFailure, recordExperience, verifyStoredLesson } from "../src/ai/experience/experienceStore.js";
import { retrieveVerifiedLessons } from "../src/ai/retrieval/hybridRetriever.js";

async function withDocumentStore(callback) {
  const directory = await mkdtemp(join(tmpdir(), "kikial-rag-"));
  const previousPath = process.env.KIKIAL_DOCUMENTS_PATH;
  process.env.KIKIAL_DOCUMENTS_PATH = join(directory, "documents.json");
  try {
    const documents = await import(`../src/services/documentService.js?test=${randomUUID()}`);
    await callback(documents);
  } finally {
    if (previousPath === undefined) delete process.env.KIKIAL_DOCUMENTS_PATH;
    else process.env.KIKIAL_DOCUMENTS_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
}

async function withExperienceStore(callback) {
  const directory = await mkdtemp(join(tmpdir(), "kikial-experience-"));
  const previousPath = process.env.KIKIAL_EXPERIENCE_STORE_PATH;
  process.env.KIKIAL_EXPERIENCE_STORE_PATH = join(directory, "experience.json");
  try { await callback(); }
  finally {
    if (previousPath === undefined) delete process.env.KIKIAL_EXPERIENCE_STORE_PATH;
    else process.env.KIKIAL_EXPERIENCE_STORE_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
}

const localSources = (documentRetriever) => ({
  documentRetriever,
  knowledgeRetriever: async () => [],
  experienceRetriever: async () => [],
});

test("query analyzer skips retrieval for simple chat and enables it for factual questions", () => {
  assert.equal(analyzeQuery("Chào Kikial").needsRetrieval, false);
  assert.equal(analyzeQuery("Giải thích cách hoạt động của vector database").needsRetrieval, true);
});

test("uploaded documents are retrieved, merged across files, and carry source metadata", async () => {
  await withDocumentStore(async (documents) => {
    await documents.addDocument("user@example.test", "quartz-migration-requirements.txt", "The quartz migration requires draining the old queue before traffic is switched.");
    await documents.addDocument("user@example.test", "quartz-rollback-plan.txt", "The quartz rollback plan restores the previous queue and verifies traffic health.");
    const results = await retrieveEvidence({ userId: "user@example.test", query: "quartz migration queue", ...localSources(documents.searchDocuments) });
    assert.equal(results.length, 2);
    assert.equal(results[0].filename, "quartz-migration-requirements.txt");
    assert.equal(results[0].sourceType, "document");
    assert.equal(results[0].sourceId, results[0].documentId);
    assert.ok(results[0].chunkId);
    assert.ok(results[0].score > 0);
  });
});

test("reranking retains document metadata", () => {
  const [result] = rerank("quartz migration", [{
    sourceId: "doc-1",
    sourceType: "document",
    filename: "quartz.txt",
    chunkId: "doc-1:0",
    text: "The quartz migration drains the old queue.",
    similarity: 0.8,
  }]);
  assert.equal(result.sourceId, "doc-1");
  assert.equal(result.sourceType, "document");
  assert.equal(result.filename, "quartz.txt");
  assert.equal(result.chunkId, "doc-1:0");
});

test("evidence selection enforces score, chunk and character budgets and removes duplicates", () => {
  const primary = "Quartz migration drains the legacy queue before traffic switches. ".repeat(2);
  const next = "Solar array policy defines installation permit checks and review. ".repeat(2);
  const selected = selectEvidence([
    { sourceId: "best", text: primary, score: 0.9 },
    { sourceId: "duplicate", text: primary, score: 0.8 },
    { sourceId: "next", text: next, score: 0.7 },
    { sourceId: "weak", text: "irrelevant", score: 0.1 },
  ], { maxChunks: 3, maxChars: 320, minScore: 0.24 });
  assert.deepEqual(selected.map((item) => item.sourceId), ["best", "next"]);
  assert.ok(selected.reduce((sum, item) => sum + item.text.length, 0) <= 320);
});

test("composite retrieval returns no results cleanly", async () => {
  const results = await retrieveEvidence({ userId: "user", query: "unmatched query", ...localSources(async () => []) });
  assert.deepEqual(results, []);
});

test("verified lessons retain their source type through retrieval", async () => {
  const [lesson] = await retrieveEvidence({
    userId: "user",
    query: "quartz operational policy",
    documentRetriever: async () => [],
    knowledgeRetriever: async () => [{ id: "lesson-1", store: "learned", verified: true, question: "quartz operational policy", answer: "Drain the quartz queue before switching traffic." }],
    experienceRetriever: async () => [],
  });
  assert.equal(lesson.sourceId, "lesson-1");
  assert.equal(lesson.sourceType, "verified_lesson");
});

test("simple chat does not call retrieval and retrieval failure falls back to a model answer", async () => {
  let retrievalCalls = 0;
  const noRetrieval = await orchestrate({
    userId: "simple-user",
    message: "Chào Kikial",
    retrieve: async () => { retrievalCalls += 1; throw new Error("should not retrieve"); },
    generateAnswer: async () => "fallback",
    persistExperience: async () => ({}),
  });
  assert.equal(retrievalCalls, 0);
  assert.equal(noRetrieval.retrieval.used, false);

  const previousDisable = process.env.AI_DISABLE_MODEL;
  delete process.env.AI_DISABLE_MODEL;
  try {
    const fallback = await orchestrate({
      userId: "failure-user",
      message: "Explain vector database indexing strategies in detail",
      retrieve: async () => { throw Object.assign(new Error("private detail"), { code: "RETRIEVAL_OFFLINE" }); },
      generateAnswer: async () => "A general explanation still works.",
      persistExperience: async () => ({}),
    });
    assert.equal(fallback.answer, "A general explanation still works.");
    assert.deepEqual(fallback.retrieval, { used: false, count: 0, failed: true });
  } finally {
    if (previousDisable === undefined) delete process.env.AI_DISABLE_MODEL;
    else process.env.AI_DISABLE_MODEL = previousDisable;
  }
});

test("assistant core routes personal memory and conversation context before the current request", async () => {
  const messages = [];
  const modelServer = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/tags") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ models: [] }));
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    messages.push(JSON.parse(body).messages);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: { content: "Bạn đang học Dart." } }));
  });
  await new Promise((resolve) => modelServer.listen(0, "127.0.0.1", resolve));
  const previousBaseUrl = process.env.AI_BASE_URL;
  const previousDisable = process.env.AI_DISABLE_MODEL;
  process.env.AI_BASE_URL = `http://127.0.0.1:${modelServer.address().port}`;
  delete process.env.AI_DISABLE_MODEL;
  resetModelProvider();
  let retrievalCalls = 0;
  try {
    const result = await orchestrate({
      userId: "context-user",
      message: "Tôi đang học gì?",
      history: [{ role: "user", content: "Chào Kikial" }, { role: "assistant", content: "Chào bạn." }],
      retrieve: async () => { retrievalCalls += 1; return []; },
      retrievePersonalMemory: async () => [{ id: "memory-1", key: "learning", value: "Dart", score: 0.9 }],
      rememberMemory: async () => ({}),
      persistExperience: async () => ({}),
    });
    assert.equal(result.answer, "Bạn đang học Dart.");
    assert.equal(result.retrieval.used, false);
    assert.equal(retrievalCalls, 0);
    assert.deepEqual(messages[0].map((item) => item.role), ["system", "user", "assistant", "user"]);
    assert.equal(messages[0][1].content, "Chào Kikial");
    assert.match(messages[0][3].content, /PERSONAL MEMORY[\s\S]*Dart/);
    assert.match(messages[0][3].content, /CÂU HỎI HIỆN TẠI:[\s\S]*Tôi đang học gì/);
  } finally {
    await new Promise((resolve) => modelServer.close(resolve));
    if (previousBaseUrl === undefined) delete process.env.AI_BASE_URL;
    else process.env.AI_BASE_URL = previousBaseUrl;
    if (previousDisable === undefined) delete process.env.AI_DISABLE_MODEL;
    else process.env.AI_DISABLE_MODEL = previousDisable;
    resetModelProvider();
  }
});

test("calculator tool failure degrades to an assistant response", async () => {
  let toolCalls = 0;
  const result = await orchestrate({
    userId: "tool-failure-user",
    message: "25 + 10 * 3",
    runTool: async () => { toolCalls += 1; throw Object.assign(new Error("temporary tool outage"), { code: "TOOL_OFFLINE" }); },
    rememberMemory: async () => ({}),
    retrievePersonalMemory: async () => [],
    persistExperience: async () => ({}),
  });
  assert.equal(toolCalls, 1);
  assert.equal(typeof result.answer, "string");
  assert.ok(result.answer.length > 0);
  assert.equal(result.source, "canned");
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
        interactionId: "learning-loop-interaction-1",
        generateAnswer: async () => ({ content: "Switch traffic first, then drain the old queue.", modelId: "fixture-model-v1" }),
      });
      const experience = await getExperience(first.interactionId);
      assert.equal(experience.userInput, q1);
      assert.equal(experience.assistantAnswer, "Switch traffic first, then drain the old queue.");
      assert.equal(experience.modelId, "fixture-model-v1");

      const failure = await markInteractionFailure({
        interactionId: first.interactionId,
        reason: "retrieval failure: wrong queue order",
        correction: "Drain the legacy quartz queue before switching production traffic.",
      });
      assert.equal(failure.failure.category, "RETRIEVAL_MISS");
      assert.equal(failure.lesson.status, "candidate");
      assert.equal((await retrieveVerifiedLessons(q1)).some((item) => item.lessonId === failure.lesson.lessonId), false);

      const verified = await verifyStoredLesson({
        lessonId: failure.lesson.lessonId,
        evidence: [{ sourceType: "reference", sourceId: "runbook-quartz-17", provenance: "operations://runbooks/quartz-migration", trusted: true, text: "Quartz migration runbook: Drain the legacy quartz queue before switching production traffic." }],
      });
      assert.equal(verified.status, "verified");
      assert.equal(verified.confidence, 0.99);
      assert.deepEqual(verified.evidenceRefs, [{ sourceType: "reference", sourceId: "runbook-quartz-17", provenance: "operations://runbooks/quartz-migration" }]);

      let finalContext = "";
      const second = await orchestrate({
        userId: "learning-loop-user",
        message: "How should the quartz queue migration be performed safely?",
        interactionId: "learning-loop-interaction-2",
        generateAnswer: async ({ context, hasEvidence }) => {
          finalContext = context;
          assert.equal(hasEvidence, true);
          return { content: "Drain the legacy quartz queue before switching production traffic.", modelId: "fixture-model-v1" };
        },
      });
      const source = second.sources.find((item) => item.lessonId === verified.lessonId);
      const promptLesson = second.evidence.knowledge.find((item) => item.lessonId === verified.lessonId);
      assert.ok(source, "runtime retriever returns the lesson");
      assert.equal(source.sourceType, "lesson");
      assert.equal(source.sourceId, verified.lessonId);
      assert.equal(source.confidence, 0.99);
      assert.equal(source.provenance[0].sourceId, "runbook-quartz-17");
      assert.ok(promptLesson, "lesson is included in evidence pack");
      assert.equal(promptLesson.sourceType, "lesson");
      assert.match(finalContext, new RegExp(`lesson=${verified.lessonId}`));
      assert.match(finalContext, /provenance=reference:runbook-quartz-17/);
      assert.match(finalContext, /Drain the legacy quartz queue before switching production traffic/);
      assert.equal(second.interactionId, "learning-loop-interaction-2");
    } finally {
      if (previousEmbeddingSetting === undefined) delete process.env.AI_EMBEDDING_OFFLINE;
      else process.env.AI_EMBEDDING_OFFLINE = previousEmbeddingSetting;
      if (previousModelSetting === undefined) delete process.env.AI_DISABLE_MODEL;
      else process.env.AI_DISABLE_MODEL = previousModelSetting;
    }
  });
});

test("lesson lifecycle quarantines unsupported corrections and never retrieves unverified states", async () => {
  await withExperienceStore(async () => {
    const createCandidate = async (interactionId, problemPattern, correction, reason = "wrong answer") => {
      await recordExperience({ interactionId, userInput: problemPattern, assistantAnswer: "incorrect prior answer", modelId: "fixture" });
      const { lesson } = await markInteractionFailure({ interactionId, reason: `retrieval miss: ${reason}`, correction });
      return lesson;
    };
    const noCorrection = await createCandidate("no-correction", "How does the cobalt scheduler choose a queue?", "");
    assert.equal(noCorrection.status, "candidate");
    const noEvidenceDecision = await verifyStoredLesson({ lessonId: noCorrection.lessonId });
    assert.equal(noEvidenceDecision.status, "quarantined");

    const unsupported = await createCandidate("unsupported", "How is the cobalt scheduler configured?", "The scheduler always uses queue 17.");
    const unsupportedDecision = await verifyStoredLesson({
      lessonId: unsupported.lessonId,
      evidence: [{ sourceType: "model", sourceId: "model-output-1", trusted: true, text: "The scheduler always uses queue 17." }],
    });
    assert.equal(unsupportedDecision.status, "quarantined");

    const rejected = await createCandidate("rejected", "What is the cobalt scheduler's queue?", "The scheduler uses queue 17.");
    const rejectedDecision = await verifyStoredLesson({
      lessonId: rejected.lessonId,
      evidence: [{ sourceType: "reference", sourceId: "scheduler-spec", trusted: true, contradictsCorrection: true, text: "The scheduler uses queue 17." }],
    });
    assert.equal(rejectedDecision.status, "rejected");

    const verifierFailure = await createCandidate("verifier-failure", "How does the cobalt scheduler retry?", "Retry three times.");
    const verifierFailureResult = await verifyStoredLesson({ lessonId: verifierFailure.lessonId, verifyCandidate: () => { throw new Error("verifier unavailable"); } });
    assert.equal(verifierFailureResult.status, "quarantined");

    const trusted = await createCandidate("trusted", "How does the cobalt scheduler recover?", "Restart the worker after its backoff expires.");
    const trustedLesson = await verifyStoredLesson({
      lessonId: trusted.lessonId,
      evidence: [{ sourceType: "reference", sourceId: "scheduler-runbook", trusted: true, text: "Restart the worker after its backoff expires." }],
    });
    assert.equal(trustedLesson.status, "verified");
    const retrieved = await retrieveVerifiedLessons("How does the cobalt scheduler recover?", 10);
    assert.deepEqual(retrieved.map((item) => item.lessonId), [trustedLesson.lessonId]);

    const data = await listExperienceStore();
    assert.ok(data.failures.length >= 5);
    assert.ok(data.failures.every((item) => item.lessonId));
  });
});

test("duplicate lessons merge origins and conflicting verified lessons are quarantined", async () => {
  await withExperienceStore(async () => {
    const pattern = "What order should the copper queue migration follow?";
    const createAndVerify = async (interactionId, correction) => {
      await recordExperience({ interactionId, userInput: pattern, assistantAnswer: "wrong order", modelId: "fixture" });
      const result = await markInteractionFailure({ interactionId, reason: "retrieval miss: wrong order", correction });
      const lesson = result.lesson.status === "candidate"
        ? await verifyStoredLesson({ lessonId: result.lesson.lessonId, evidence: [{ sourceType: "reference", sourceId: `ref-${interactionId}`, trusted: true, text: correction }] })
        : result.lesson;
      return { result, lesson };
    };
    const first = await createAndVerify("duplicate-1", "Drain copper queue before traffic switch.");
    assert.equal(first.lesson.status, "verified");
    const duplicate = await createAndVerify("duplicate-2", "Drain copper queue before traffic switch.");
    assert.equal(duplicate.result.duplicate, true);
    assert.equal(duplicate.lesson.lessonId, first.lesson.lessonId);
    assert.deepEqual(duplicate.lesson.originInteractionIds, ["duplicate-1", "duplicate-2"]);

    const conflict = await createAndVerify("conflict-1", "Switch traffic before draining copper queue.");
    assert.equal(conflict.result.lesson.status, "candidate");
    assert.ok(conflict.result.lesson.conflictsWith.includes(first.lesson.lessonId));
    assert.equal(conflict.lesson.status, "quarantined");
    const lessons = await retrieveVerifiedLessons(pattern, 10);
    assert.equal(lessons.filter((item) => item.lessonId === first.lesson.lessonId).length, 1);
    assert.equal(lessons.some((item) => item.lessonId === conflict.lesson.lessonId), false);
  });
});