import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ======================================================
// PATH
// ======================================================

const dataDirectory = join(fileURLToPath(new URL("../data/", import.meta.url)));
const knowledgePath = join(dataDirectory, "knowledge.json");
const learnedPath = join(dataDirectory, "learned.json");
const userMemoryPath = join(dataDirectory, "userMemory.json");

// ======================================================
// CONFIG
// ======================================================

const MAX_LEARNED = 500;
const MAX_USER_MEMORY = 50;

// Ngưỡng điểm (sau chuẩn hoá 0..1) để coi là "khớp"
export const MATCH_THRESHOLD = 0.45;

let knowledge = [];
let learned = [];
let userMemory = {};

// ======================================================
// GHI FILE TUẦN TỰ (chống race condition)
// Mọi lệnh ghi xếp vào một hàng đợi, ghi file tạm rồi rename.
// ======================================================

let writeQueue = Promise.resolve();

function queueWrite(path, data) {
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(dataDirectory, { recursive: true });
      const temporaryPath = `${path}.${process.pid}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf8");
      await rename(temporaryPath, path);
    })
    .catch((error) => {
      console.error(`[Kikial Memory] Ghi ${path} thất bại:`, error.message);
    });

  return writeQueue;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

// ======================================================
// NORMALIZE / TOKENIZE
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

const STOP_WORDS = new Set([
  "la", "gi", "cua", "cho", "toi", "minh", "ban", "mot", "nhung", "cac",
  "va", "voi", "nay", "kia", "do", "thi", "ma", "co", "duoc", "lam",
  "nhu", "nao", "hay", "ve", "trong", "khi", "neu", "tai", "sao", "the",
  "khong", "ra", "den", "tu", "hon", "rat", "cung", "se", "da", "dang",
]);

function words(text) {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((word) => word.length >= 2 && !STOP_WORDS.has(word)),
  );
}

// ======================================================
// CHUẨN HOÁ BẢN GHI
// Nâng cấp dữ liệu cũ (không có id/hits) lên định dạng mới.
// ======================================================

function normalizeItem(item, { store, defaultVerified }) {
  const createdAt = item?.createdAt || item?.learnedAt || new Date().toISOString();

  return {
    id: item?.id || randomUUID(),
    question: String(item?.question || "").trim(),
    answer: String(item?.answer || "").trim(),
    store,
    verified: typeof item?.verified === "boolean" ? item.verified : defaultVerified,
    hits: Number.isFinite(item?.hits) ? item.hits : 0,
    createdAt,
    updatedAt: item?.updatedAt || createdAt,
    // Giữ lại để tương thích dữ liệu cũ
    learnedAt: createdAt,
  };
}

// ======================================================
// LOAD / SAVE
// ======================================================

export async function loadKnowledge() {
  const stored = await readJson(knowledgePath, []);

  knowledge = (Array.isArray(stored) ? stored : [])
    .map((item) => normalizeItem(item, { store: "knowledge", defaultVerified: true }))
    .filter((item) => item.question && item.answer);

  return knowledge;
}

export async function saveKnowledge(nextKnowledge = knowledge) {
  knowledge = (Array.isArray(nextKnowledge) ? nextKnowledge : []).map((item) =>
    normalizeItem(item, { store: "knowledge", defaultVerified: true }),
  );

  await queueWrite(knowledgePath, knowledge);

  return knowledge;
}

export async function loadLearned() {
  const stored = await readJson(learnedPath, []);

  learned = prune(
    (Array.isArray(stored) ? stored : [])
      .map((item) => normalizeItem(item, { store: "learned", defaultVerified: false }))
      .filter((item) => item.question && item.answer),
  );

  return learned;
}

export async function saveLearned(nextLearned = learned) {
  learned = prune(
    (Array.isArray(nextLearned) ? nextLearned : []).map((item) =>
      normalizeItem(item, { store: "learned", defaultVerified: false }),
    ),
  );

  await queueWrite(learnedPath, learned);

  return learned;
}

// Cắt bớt theo chất lượng, không phải theo thời gian:
// đã duyệt > nhiều lượt dùng > mới hơn.
function prune(items) {
  if (items.length <= MAX_LEARNED) return items;

  return [...items]
    .sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      if (a.hits !== b.hits) return b.hits - a.hits;
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    })
    .slice(0, MAX_LEARNED);
}

export async function loadUserMemory() {
  const stored = await readJson(userMemoryPath, {});

  userMemory =
    stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};

  return userMemory;
}

export async function saveUserMemory(nextMemory = userMemory) {
  userMemory =
    nextMemory && typeof nextMemory === "object" && !Array.isArray(nextMemory)
      ? nextMemory
      : {};

  await queueWrite(userMemoryPath, userMemory);

  return userMemory;
}

export async function initializeMemory() {
  await Promise.all([loadKnowledge(), loadLearned(), loadUserMemory()]);

  const pending = learned.filter((item) => !item.verified).length;

  console.log(`[Kikial Memory] Knowledge: ${knowledge.length}`);
  console.log(
    `[Kikial Memory] Learned: ${learned.length}/${MAX_LEARNED} (chờ duyệt: ${pending})`,
  );
  console.log(`[Kikial Memory] Users: ${Object.keys(userMemory).length}`);
}

// ======================================================
// USER MEMORY
// ======================================================

const emailKeyOf = (email) => String(email || "").trim().toLowerCase();

export function findUserMemory(email) {
  const key = emailKeyOf(email);
  if (!key) return [];

  return Array.isArray(userMemory[key]) ? userMemory[key] : [];
}

export async function rememberUser(email, fact) {
  const key = emailKeyOf(email);
  const normalizedFact = String(fact || "").trim();

  if (!key || !normalizedFact) return false;

  const current = findUserMemory(key);
  const target = normalizeText(normalizedFact);

  if (current.some((item) => normalizeText(item) === target)) return false;

  userMemory[key] = [...current, normalizedFact].slice(-MAX_USER_MEMORY);
  await saveUserMemory();

  return true;
}

export async function forgetUser(email, fact) {
  const key = emailKeyOf(email);
  if (!key) return false;

  const target = normalizeText(fact);
  const current = findUserMemory(key);
  const filtered = current.filter((item) => normalizeText(item) !== target);

  if (filtered.length === current.length) return false;

  userMemory[key] = filtered;
  await saveUserMemory();

  return true;
}

export async function clearUserMemory(email) {
  const key = emailKeyOf(email);
  if (!key || !userMemory[key]) return false;

  delete userMemory[key];
  await saveUserMemory();

  return true;
}

// ======================================================
// CHẤM ĐIỂM (chuẩn hoá về 0..1)
// ======================================================

function relevanceScore(question, item) {
  const questionText = normalizeText(question);
  const storedQuestion = normalizeText(item?.question);

  if (!questionText || !storedQuestion) return 0;

  // Trùng khít
  if (questionText === storedQuestion) return 1;

  // Chứa nhau — chỉ tính khi câu đủ dài, tránh "ai" khớp mọi thứ
  const shorter = Math.min(questionText.length, storedQuestion.length);
  if (
    shorter >= 8 &&
    (storedQuestion.includes(questionText) || questionText.includes(storedQuestion))
  ) {
    return 0.75;
  }

  const questionWords = words(questionText);
  if (questionWords.size === 0) return 0;

  const titleWords = words(storedQuestion);
  const answerWords = words(item?.answer);

  let raw = 0;
  for (const word of questionWords) {
    if (titleWords.has(word)) raw += 3;
    else if (answerWords.has(word)) raw += 1;
  }

  // Chia cho điểm tối đa có thể -> không thiên vị câu trả lời dài
  return Math.min(raw / (questionWords.size * 3), 1);
}

export function findRelevantKnowledge(question, limit = 5) {
  // Chỉ dùng kiến thức đã duyệt làm ngữ cảnh cho AI.
  const pool = [...knowledge, ...learned.filter((item) => item.verified)];

  return pool
    .map((item) => ({ ...item, score: relevanceScore(question, item) }))
    .filter((item) => item.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || b.hits - a.hits)
    .slice(0, limit);
}

// Đánh dấu bản ghi đã được dùng (để xếp hạng khi cắt bớt)
export async function markHit(id) {
  const item = learned.find((entry) => entry.id === id);
  if (!item) return false;

  item.hits += 1;
  await saveLearned();

  return true;
}

// ======================================================
// ĐIỀU KIỆN ĐƯỢC HỌC
// ======================================================

function canLearn(question, answer) {
  const q = String(question || "").trim();
  const a = String(answer || "").trim();

  if (!q || !a) return false;
  if (q.length < 3 || a.length < 10) return false;
  if (a.length > 4000) return false;

  // Đã có trong kho seed thì không học lại
  const normalizedQuestion = normalizeText(q);
  if (knowledge.some((item) => normalizeText(item.question) === normalizedQuestion)) {
    return false;
  }

  return true;
}

// ======================================================
// LEARN
// Mặc định verified = false: câu mới phải được duyệt
// (bằng 👍 của người dùng hoặc admin) mới được dùng lại.
// ======================================================

export async function learn(question, answer, { verified = false } = {}) {
  if (!canLearn(question, answer)) {
    return { learned: false, reason: "invalid" };
  }

  const normalizedQuestion = normalizeText(question);
  const index = learned.findIndex(
    (item) => normalizeText(item.question) === normalizedQuestion,
  );

  if (index !== -1) {
    const existing = learned[index];

    if (normalizeText(existing.answer) === normalizeText(answer)) {
      return { learned: false, reason: "duplicate", id: existing.id };
    }

    learned[index] = {
      ...existing,
      answer: String(answer).trim(),
      // Câu trả lời đổi -> phải duyệt lại
      verified: Boolean(verified),
      updatedAt: new Date().toISOString(),
    };

    await saveLearned();

    return { learned: true, updated: true, id: existing.id };
  }

  const item = normalizeItem(
    { question, answer, verified, createdAt: new Date().toISOString() },
    { store: "learned", defaultVerified: false },
  );

  learned.push(item);
  await saveLearned();

  return { learned: true, updated: false, id: item.id };
}

// ======================================================
// DUYỆT / XOÁ (dùng cho admin + nút 👍)
// ======================================================

export async function verifyLearned(id, verified = true) {
  const item = learned.find((entry) => entry.id === id);
  if (!item) return false;

  item.verified = Boolean(verified);
  item.updatedAt = new Date().toISOString();

  await saveLearned();

  return true;
}

// Xoá đúng kho chứa nó — trước đây admin chỉ xoá được knowledge.json
export async function removeItem(id) {
  const learnedIndex = learned.findIndex((item) => item.id === id);

  if (learnedIndex !== -1) {
    learned.splice(learnedIndex, 1);
    await saveLearned();
    return "learned";
  }

  const knowledgeIndex = knowledge.findIndex((item) => item.id === id);

  if (knowledgeIndex !== -1) {
    knowledge.splice(knowledgeIndex, 1);
    await saveKnowledge();
    return "knowledge";
  }

  return null;
}

// Đưa một bản ghi đã duyệt từ learned sang kho seed
export async function promoteToKnowledge(id) {
  const index = learned.findIndex((item) => item.id === id);
  if (index === -1) return false;

  const [item] = learned.splice(index, 1);

  knowledge.push({ ...item, store: "knowledge", verified: true });

  await saveLearned();
  await saveKnowledge();

  return true;
}

// ======================================================
// TRUY VẤN
// ======================================================

export const knowledgeCount = () => knowledge.length;
export const learnedCount = () => learned.length;
export const pendingCount = () => learned.filter((item) => !item.verified).length;
export const totalKnowledgeCount = () => knowledge.length + learned.length;
export const userMemoryCount = (email) => findUserMemory(email).length;

export const getKnowledge = () => [...knowledge];
export const getLearned = () => [...learned];
export const getAllItems = () => [...knowledge, ...learned];
export const getAllUserMemory = () => ({ ...userMemory });
