import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFailure } from "../improvement/failureAnalyzer.js";
import { verifyLessonCandidate } from "../verification/verifier.js";
import { getKnowledge } from "../../../lib/learningMemory.js";

const dataDirectory = join(fileURLToPath(new URL("../../../data/", import.meta.url)));
const storePath = () => process.env.KIKIAL_EXPERIENCE_STORE_PATH || join(dataDirectory, "experienceStore.json");
const emptyStore = () => ({ experiences: [], failures: [], lessons: [] });
const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
let transactionQueue = Promise.resolve();

async function readStore() {
  let contents;
  try {
    contents = await readFile(storePath(), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return emptyStore();
    throw error;
  }
  const stored = JSON.parse(contents);
  return { experiences: Array.isArray(stored.experiences) ? stored.experiences : [], failures: Array.isArray(stored.failures) ? stored.failures : [], lessons: Array.isArray(stored.lessons) ? stored.lessons : [] };
}

async function persistStore(store) {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2), "utf8");
  await rename(temporary, path);
}

function transact(operation) {
  const pending = transactionQueue.then(async () => {
    const store = await readStore();
    const result = await operation(store);
    await persistStore(store);
    return result;
  });
  transactionQueue = pending.catch(() => {});
  return pending;
}

export async function recordExperience(experience) {
  if (!experience?.interactionId) throw new Error("Experience requires interactionId.");
  return transact((store) => {
    const existing = store.experiences.find((item) => item.interactionId === experience.interactionId);
    if (existing) return existing;
    const item = {
      interactionId: String(experience.interactionId),
      userInput: String(experience.userInput || "").slice(0, 12000),
      assistantAnswer: String(experience.assistantAnswer || "").slice(0, 20000),
      modelId: experience.modelId || "unknown",
      sources: Array.isArray(experience.sources) ? experience.sources.map(({ sourceId, sourceType, filename, chunkId, score, lessonId, confidence, provenance }) => ({ sourceId, sourceType, filename, chunkId, score, lessonId, confidence, provenance })) : [],
      createdAt: experience.createdAt || new Date().toISOString(),
    };
    store.experiences.push(item);
    store.experiences = store.experiences.slice(-5000);
    return item;
  });
}

export async function getExperience(interactionId) {
  await transactionQueue;
  return (await readStore()).experiences.find((item) => item.interactionId === interactionId) || null;
}

export async function markInteractionFailure({ interactionId, reason, correction } = {}) {
  return transact((store) => {
    const experience = store.experiences.find((item) => item.interactionId === interactionId);
    if (!experience) {
      const error = new Error("Interaction not found.");
      error.code = "INTERACTION_NOT_FOUND";
      throw error;
    }
    const failureAnalysis = analyzeFailure({ query: experience.userInput, actual: `${reason || ""} ${experience.assistantAnswer}` });
    const correctionText = String(correction || "").trim().slice(0, 4000);
    const failure = {
      failureId: randomUUID(),
      interactionId,
      reason: String(reason || "Unspecified interaction failure.").slice(0, 1000),
      category: failureAnalysis.category,
      correctionCandidate: correctionText || null,
      createdAt: new Date().toISOString(),
    };
    const pattern = normalize(experience.userInput);
    const duplicate = store.lessons.find((item) => normalize(item.problemPattern) === pattern && normalize(item.correction) === normalize(correctionText));
    if (duplicate) {
      duplicate.originInteractionIds = [...new Set([...duplicate.originInteractionIds, interactionId])];
      duplicate.updatedAt = new Date().toISOString();
      failure.lessonId = duplicate.lessonId;
      store.failures.push(failure);
      store.failures = store.failures.slice(-5000);
      return { failure, lesson: duplicate, duplicate: true };
    }

    const conflictsWith = store.lessons.filter((item) => item.status === "verified" && normalize(item.problemPattern) === pattern && normalize(item.correction) !== normalize(correctionText)).map((item) => item.lessonId);
    const knowledgeConflicts = getKnowledge().filter((item) => normalize(item.question) === pattern && normalize(item.answer) !== normalize(correctionText)).map((item) => item.id);
    const candidate = {
      lessonId: randomUUID(),
      originInteractionIds: [interactionId],
      problemPattern: experience.userInput,
      correction: correctionText,
      evidenceRefs: [],
      confidence: 0,
      status: "candidate",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(conflictsWith.length || knowledgeConflicts.length ? { conflictsWith: [...conflictsWith, ...knowledgeConflicts] } : {}),
    };
    failure.lessonId = candidate.lessonId;
    store.failures.push(failure);
    store.failures = store.failures.slice(-5000);
    store.lessons.push(candidate);
    store.lessons = store.lessons.slice(-5000);
    return { failure, lesson: candidate, duplicate: false };
  });
}

export async function verifyStoredLesson({ lessonId, evidence = [], verifyCandidate = verifyLessonCandidate } = {}) {
  return transact((store) => {
    const lesson = store.lessons.find((item) => item.lessonId === lessonId);
    if (!lesson) {
      const error = new Error("Lesson not found.");
      error.code = "LESSON_NOT_FOUND";
      throw error;
    }
    if (lesson.status !== "candidate") return lesson;
    try {
      const decision = verifyCandidate(lesson, Array.isArray(evidence) ? evidence : [evidence]);
      lesson.status = decision.status;
      lesson.confidence = decision.confidence;
      lesson.evidenceRefs = decision.evidenceRefs;
      lesson.verificationReasons = decision.reasons;
    } catch {
      lesson.status = "quarantined";
      lesson.confidence = 0;
      lesson.evidenceRefs = [];
      lesson.verificationReasons = ["lesson_verifier_failed"];
    }
    lesson.updatedAt = new Date().toISOString();
    return lesson;
  });
}

export async function listVerifiedLessons() {
  await transactionQueue;
  return (await readStore()).lessons.filter((item) => item.status === "verified").map((item) => ({ ...item }));
}

export async function listExperienceStore() {
  await transactionQueue;
  return readStore();
}