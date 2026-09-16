import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ======================================================
// PATH
// ======================================================

const dataDirectory = join(
  fileURLToPath(new URL("../data/", import.meta.url)),
);

const knowledgePath = join(
  dataDirectory,
  "knowledge.json",
);

const learnedPath = join(
  dataDirectory,
  "learned.json",
);

const userMemoryPath = join(
  dataDirectory,
  "userMemory.json",
);

// ======================================================
// CONFIG
// ======================================================

const MAX_LEARNED = 500;
const MAX_USER_MEMORY = 50;

let knowledge = [];
let learned = [];
let userMemory = {};

// ======================================================
// NORMALIZE TEXT
// ======================================================

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("vi")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ======================================================
// TOKENIZE
// ======================================================

const STOP_WORDS = new Set([
  "la",
  "gi",
  "cua",
  "cho",
  "toi",
  "minh",
  "ban",
  "mot",
  "nhung",
  "cac",
  "va",
  "voi",
  "nay",
  "kia",
  "do",
  "thi",
  "ma",
  "co",
  "duoc",
  "lam",
  "nhu",
  "nao",
  "hay",
  "ve",
  "trong",
  "khi",
  "neu",
  "tai",
  "sao",
]);

function words(text) {
  const normalized = normalizeText(text);

  return new Set(
    normalized
      .split(" ")
      .filter(
        (word) =>
          word.length >= 2 &&
          !STOP_WORDS.has(word),
      ),
  );
}

// ======================================================
// READ JSON
// ======================================================

async function readJson(path, fallback) {
  try {
    const raw = await readFile(path, "utf8");

    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// ======================================================
// WRITE JSON
// ======================================================

async function writeJson(path, data) {
  await mkdir(dataDirectory, {
    recursive: true,
  });

  await writeFile(
    path,
    JSON.stringify(data, null, 2),
    "utf8",
  );
}

// ======================================================
// LOAD KNOWLEDGE
// ======================================================

export async function loadKnowledge() {
  const stored = await readJson(
    knowledgePath,
    [],
  );

  knowledge = Array.isArray(stored)
    ? stored
    : [];

  return knowledge;
}

// ======================================================
// SAVE KNOWLEDGE
// ======================================================

export async function saveKnowledge(
  nextKnowledge = knowledge,
) {
  knowledge = Array.isArray(nextKnowledge)
    ? nextKnowledge
    : [];

  await writeJson(
    knowledgePath,
    knowledge,
  );

  return knowledge;
}

// ======================================================
// LOAD LEARNED
// ======================================================

export async function loadLearned() {
  const stored = await readJson(
    learnedPath,
    [],
  );

  learned = Array.isArray(stored)
    ? stored.slice(-MAX_LEARNED)
    : [];

  return learned;
}

// ======================================================
// SAVE LEARNED
// ======================================================

export async function saveLearned(
  nextLearned = learned,
) {
  const items = Array.isArray(nextLearned)
    ? nextLearned
    : [];

  learned = items.slice(-MAX_LEARNED);

  await writeJson(
    learnedPath,
    learned,
  );

  return learned;
}

// ======================================================
// LOAD USER MEMORY
// ======================================================

export async function loadUserMemory() {
  const stored = await readJson(
    userMemoryPath,
    {},
  );

  userMemory =
    stored &&
    typeof stored === "object" &&
    !Array.isArray(stored)
      ? stored
      : {};

  return userMemory;
}

// ======================================================
// SAVE USER MEMORY
// ======================================================

export async function saveUserMemory(
  nextMemory = userMemory,
) {
  userMemory =
    nextMemory &&
    typeof nextMemory === "object" &&
    !Array.isArray(nextMemory)
      ? nextMemory
      : {};

  await writeJson(
    userMemoryPath,
    userMemory,
  );

  return userMemory;
}

// ======================================================
// INITIALIZE
// Gọi khi server khởi động
// ======================================================

export async function initializeMemory() {
  await Promise.all([
    loadKnowledge(),
    loadLearned(),
    loadUserMemory(),
  ]);

  console.log(
    `[Kikial Memory] Knowledge: ${knowledge.length}`,
  );

  console.log(
    `[Kikial Memory] Learned: ${learned.length}/${MAX_LEARNED}`,
  );

  console.log(
    `[Kikial Memory] Users: ${Object.keys(userMemory).length}`,
  );
}

// ======================================================
// USER MEMORY
// ======================================================

export function findUserMemory(email) {
  const emailKey = String(email || "")
    .trim()
    .toLowerCase();

  if (!emailKey) {
    return [];
  }

  const memory = userMemory[emailKey];

  return Array.isArray(memory)
    ? memory
    : [];
}

// ======================================================
// REMEMBER USER
// ======================================================

export async function rememberUser(
  email,
  fact,
) {
  const emailKey = String(email || "")
    .trim()
    .toLowerCase();

  const normalizedFact = String(
    fact || "",
  ).trim();

  if (!emailKey || !normalizedFact) {
    return false;
  }

  const current =
    findUserMemory(emailKey);

  // Chống trùng memory
  const exists = current.some(
    (item) =>
      normalizeText(item) ===
      normalizeText(normalizedFact),
  );

  if (exists) {
    return false;
  }

  userMemory[emailKey] = [
    ...current,
    normalizedFact,
  ].slice(-MAX_USER_MEMORY);

  await saveUserMemory();

  return true;
}

// ======================================================
// FORGET USER FACT
// ======================================================

export async function forgetUser(
  email,
  fact,
) {
  const emailKey = String(email || "")
    .trim()
    .toLowerCase();

  if (!emailKey) {
    return false;
  }

  const target = normalizeText(fact);

  const current =
    findUserMemory(emailKey);

  const filtered = current.filter(
    (item) =>
      normalizeText(item) !== target,
  );

  if (
    filtered.length === current.length
  ) {
    return false;
  }

  userMemory[emailKey] = filtered;

  await saveUserMemory();

  return true;
}

// ======================================================
// CLEAR USER MEMORY
// ======================================================

export async function clearUserMemory(
  email,
) {
  const emailKey = String(email || "")
    .trim()
    .toLowerCase();

  if (!emailKey) {
    return false;
  }

  if (!userMemory[emailKey]) {
    return false;
  }

  delete userMemory[emailKey];

  await saveUserMemory();

  return true;
}

// ======================================================
// CALCULATE RELEVANCE SCORE
// ======================================================

function relevanceScore(
  question,
  item,
) {
  const questionText =
    normalizeText(question);

  const storedQuestion =
    normalizeText(item?.question);

  const storedAnswer =
    normalizeText(item?.answer);

  if (
    !questionText ||
    !storedQuestion
  ) {
    return 0;
  }

  // Câu giống hệt
  if (
    questionText === storedQuestion
  ) {
    return 100;
  }

  // Một câu chứa câu kia
  if (
    storedQuestion.includes(
      questionText,
    ) ||
    questionText.includes(
      storedQuestion,
    )
  ) {
    return 50;
  }

  const questionWords =
    words(questionText);

  const titleWords =
    words(storedQuestion);

  const answerWords =
    words(storedAnswer);

  let score = 0;

  for (const word of questionWords) {
    // Từ xuất hiện trong question
    // quan trọng hơn answer.
    if (titleWords.has(word)) {
      score += 3;
    }

    if (answerWords.has(word)) {
      score += 1;
    }
  }

  return score;
}

// ======================================================
// FIND RELEVANT KNOWLEDGE
// Tìm cả knowledge.json + learned.json
// ======================================================

export function findRelevantKnowledge(
  question,
  limit = 5,
) {
  const allKnowledge = [
    ...knowledge.map((item) => ({
      ...item,
      source: "knowledge",
    })),

    ...learned.map((item) => ({
      ...item,
      source: "learned",
    })),
  ];

  return allKnowledge
    .map((item) => ({
      ...item,

      score: relevanceScore(
        question,
        item,
      ),
    }))
    .filter(
      (item) => item.score > 0,
    )
    .sort(
      (a, b) => b.score - a.score,
    )
    .slice(0, limit);
}

// ======================================================
// KIỂM TRA CÂU TRẢ LỜI CÓ ĐƯỢC HỌC KHÔNG
// ======================================================

function canLearn(question, answer) {
  const q = String(question || "").trim();
  const a = String(answer || "").trim();

  if (!q || !a) {
    return false;
  }

  // Quá ngắn
  if (q.length < 3 || a.length < 10) {
    return false;
  }

  const normalizedAnswer =
    normalizeText(a);

  // Không học câu demo
  const blocked = [
    "day la ban demo",
    "ban demo hoi dap",
    "minh da nhan duoc cau hoi",
    "hay hoi cu the hon",
    "khong the tra loi",
    "khong the ket noi",
    "loi ket noi",
    "dang suy nghi",
    "ai chua tra ve noi dung",
  ];

  if (
    blocked.some((text) =>
      normalizedAnswer.includes(text),
    )
  ) {
    return false;
  }

  return true;
}

// ======================================================
// LEARN
// ======================================================

export async function learn(
  question,
  answer,
) {
  if (!canLearn(question, answer)) {
    return {
      learned: false,
      reason: "invalid",
    };
  }

  const normalizedQuestion =
    normalizeText(question);

  const existingIndex =
    learned.findIndex(
      (item) =>
        normalizeText(
          item.question,
        ) === normalizedQuestion,
    );

  // ==============================================
  // Nếu câu đã tồn tại -> cập nhật answer
  // ==============================================

  if (existingIndex !== -1) {
    const existing =
      learned[existingIndex];

    // Answer giống rồi
    if (
      normalizeText(
        existing.answer,
      ) === normalizeText(answer)
    ) {
      return {
        learned: false,
        reason: "duplicate",
      };
    }

    learned[existingIndex] = {
      ...existing,

      answer: String(answer).trim(),

      updatedAt:
        new Date().toISOString(),
    };

    await saveLearned();

    return {
      learned: true,
      updated: true,
    };
  }

  // ==============================================
  // Thêm kiến thức mới
  // ==============================================

  learned.push({
    question: String(
      question,
    ).trim(),

    answer: String(
      answer,
    ).trim(),

    learnedAt:
      new Date().toISOString(),
  });

  // Chỉ giữ 500 mẫu gần nhất
  learned =
    learned.slice(-MAX_LEARNED);

  await saveLearned();

  return {
    learned: true,
    updated: false,
  };
}

// ======================================================
// COUNTS
// ======================================================

export function knowledgeCount() {
  return knowledge.length;
}

export function learnedCount() {
  return learned.length;
}

export function totalKnowledgeCount() {
  return (
    knowledge.length +
    learned.length
  );
}

export function userMemoryCount(email) {
  return findUserMemory(email).length;
}

// ======================================================
// GET DATA
// Có thể dùng cho admin
// ======================================================

export function getKnowledge() {
  return [...knowledge];
}

export function getLearned() {
  return [...learned];
}

export function getAllUserMemory() {
  return { ...userMemory };
}