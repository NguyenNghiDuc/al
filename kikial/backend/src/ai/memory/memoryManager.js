import { randomUUID } from "node:crypto";
import { getAllUserMemory, saveUserMemory } from "../../../lib/learningMemory.js";

const secretPattern = /(?:password|mật khẩu|token|api[_ -]?key|secret|otp|bearer)\s*[:=]?\s*\S+/i;
const normalize = (text) => String(text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const now = () => new Date().toISOString();
let memoryStore = {};

const emptyProfile = () => ({ profile: [], preferences: [], education: [], projects: [], goals: [], episodic: [] });
const safeValue = (value) => String(value || "").trim().slice(0, 500);

function normalizeMemory(userMemory) {
  const result = {};
  for (const [userId, value] of Object.entries(userMemory || {})) {
    const target = emptyProfile();
    // Legacy arrays are copied into episodic memory; structured records keep their original buckets.
    const legacy = Array.isArray(value) ? value : [];
    for (const item of legacy) {
      const text = typeof item === "string" ? item : item?.value;
      if (!text || secretPattern.test(text)) continue;
      target.episodic.push(typeof item === "object" ? item : { id: randomUUID(), type: "episodic", key: "fact", value: text, confidence: 0.7, source: "legacy", createdAt: now(), updatedAt: now() });
    }
    if (!Array.isArray(value)) {
      for (const type of Object.keys(target)) if (Array.isArray(value?.[type])) target[type].push(...value[type]);
    }
    result[userId] = target;
  }
  return result;
}

export async function initializeMemoryManager() {
  const current = getAllUserMemory();
  memoryStore = normalizeMemory(current);
  if (JSON.stringify(current) !== JSON.stringify(memoryStore)) await saveUserMemory(memoryStore);
  return memoryStore;
}

function userRecord(userId) {
  const key = String(userId || "").trim().toLowerCase();
  if (!key) return null;
  if (!memoryStore[key]) memoryStore[key] = emptyProfile();
  return memoryStore[key];
}

export function extractCandidateMemories(message) {
  const text = String(message || "").trim();
  if (!text || text.length > 1000 || text.includes("?") || secretPattern.test(text)) return [];
  if (/(?:ví dụ|vi du|nếu|neu)\s+.*(?:tôi|toi|mình|minh|t)\s+tên/i.test(text) || /(?:bạn tôi|ban toi|bạn mình|ban minh)\s+tên/i.test(text)) return [];
  const negatedLearning = text.match(/(?:tôi|mình|t)\s+(?:không còn|khong con|không|khong)\s+(?:học|hoc)\s+([^,.!?\n]+)/i);
  if (negatedLearning) return [{ type: "education", key: "learning", value: safeValue(negatedLearning[1]), confidence: 0.95, source: "user_message", negated: true }];
  const candidates = [];
  const patterns = [
    [/(?:tôi|mình|t)\s+tên\s+là\s+([^,.!?\n]+)/i, "profile", "name"],
    [/(?:tên)\s+(?:tôi|t)\s+là\s+([^,.!?\n]+)/i, "profile", "name"],
    [/(?:nhớ rằng|ghi nhớ rằng)\s+(?:tôi|mình)?\s*tên\s+là\s+([^,.!?\n]+)/i, "profile", "name"],
    [/(?:nhớ rằng|ghi nhớ rằng)\s+tên\s+(?:tôi|mình)\s+là\s+([^,.!?\n]+)/i, "profile", "name"],
    [/(?:nhớ rằng|ghi nhớ rằng)\s+(?:tôi|mình)\s+(.+)/i, "episodic", "fact"],
    [/(?:tôi|mình|t)\s+(?:đang\s+)?học\s+(.+)/i, "education", "learning"],
    [/(?:hiện tại|hiện giờ|bây giờ|dạo này)\s+(?:tôi|mình|t)\s+đang\s+học\s+(.+)/i, "education", "learning"],
    [/(?:tôi|mình|t)\s+(?:đang\s+)?(?:chuyển sang|tập trung học)\s+(.+)/i, "education", "learning"],
    [/(?:dạo này|hiện tại)\s+(?:tôi|mình|t)\s+đang\s+(.+)/i, "projects", "current_focus"],
    [/(?:tôi|mình|t)\s+đang\s+làm\s+(?:project\s+)?(.+)/i, "projects", "current_project"],
    [/(?:tôi|mình|t)\s+thích\s+(?:được\s+)?(.+)/i, "preferences", "response_style"],
    [/(?:giải thích|giup|giúp)\s+(?:code|mã nguồn)\s+(?:cho\s+)?(?:tôi|mình|t)\s+(?:theo\s+)?từng bước/i, "preferences", "response_style"],
    [/(?:mục tiêu|goal)\s+của\s+(?:tôi|mình|t)\s+là\s+(.+)/i, "goals", "primary_goal"],
  ];
  for (const [pattern, type, key] of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) candidates.push({ type, key, value: safeValue(match[1]), confidence: 0.9, source: "user_message" });
    else if (pattern.source.includes("từng bước") && pattern.test(text)) candidates.push({ type, key, value: "giải thích code theo từng bước", confidence: 0.85, source: "user_message" });
  }
  return candidates;
}

export async function remember(userId, candidate) {
  if (!candidate?.value || secretPattern.test(candidate.value)) return false;
  const record = userRecord(userId);
  if (!record) return false;
  const type = Object.hasOwn(record, candidate.type) ? candidate.type : "episodic";
  if (candidate.negated) {
    for (const entry of record[type]) if (entry.key === candidate.key && entry.status !== "SUPERSEDED" && normalize(entry.value) === normalize(candidate.value)) entry.status = "SUPERSEDED";
    await saveUserMemory(memoryStore);
    return { ...candidate, status: "SUPERSEDED" };
  }
  const item = { id: candidate.id || randomUUID(), type, key: candidate.key || "fact", value: safeValue(candidate.value), confidence: Math.min(1, Number(candidate.confidence) || 0.7), source: candidate.source || "user_message", createdAt: candidate.createdAt || now(), updatedAt: now(), validFrom: candidate.validFrom || now(), lastUsedAt: null, status: "ACTIVE", supersedes: null };
  const index = record[type].findIndex((entry) => entry.key === item.key && entry.status !== "SUPERSEDED");
  if (index === -1) record[type].push(item);
  else if (normalize(record[type][index].value) !== normalize(item.value)) {
    record[type][index] = { ...record[type][index], status: "SUPERSEDED", updatedAt: item.updatedAt };
    item.supersedes = record[type][index].id;
    record[type].push(item);
  }
  record[type] = record[type].slice(-50);
  await saveUserMemory(memoryStore);
  return item;
}

export async function retrieveRelevant(userId, query, limit = 8) {
  const record = userRecord(userId);
  if (!record) return [];
  const normalizedQuery = normalize(query);
  const desiredKey = /ten/.test(normalizedQuery) ? "name" : /thich/.test(normalizedQuery) ? "response_style" : /hoc|ngon ngu/.test(normalizedQuery) ? "learning" : /muc tieu|goal/.test(normalizedQuery) ? "primary_goal" : null;
  const queryWords = new Set(normalizedQuery.split(" ").filter((word) => word.length > 2 && !["toi", "minh", "ban", "la", "gi", "dang", "nho"].includes(word)));
  const items = Object.values(record).flat().filter((item) => item?.value && item.status !== "SUPERSEDED" && (!desiredKey || item.key === desiredKey));
  return items.map((item) => {
    const aliases = { name: "ten", learning: "hoc ngon ngu", response_style: "thich cach hoc", primary_goal: "muc tieu" };
    const valueWords = new Set(normalize(`${item.key} ${aliases[item.key] || ""} ${item.value}`).split(" "));
    const overlap = [...queryWords].filter((word) => valueWords.has(word)).length;
    return { ...item, score: queryWords.size ? overlap / queryWords.size : 0 };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, limit);
}

export async function forget(userId, idOrKey) {
  const record = userRecord(userId);
  if (!record) return false;
  let removed = false;
  for (const type of Object.keys(record)) {
    const before = record[type].length;
    record[type] = record[type].filter((item) => item.id !== idOrKey && item.key !== idOrKey);
    removed ||= before !== record[type].length;
  }
  if (removed) await saveUserMemory(memoryStore);
  return removed;
}

export async function consolidate(userId) { return retrieveRelevant(userId, "", 50); }
export function getMemoryCounts() { return Object.values(memoryStore).reduce((total, user) => total + Object.values(user).flat().length, 0); }
