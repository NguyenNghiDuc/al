import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = join(fileURLToPath(new URL("../../data/", import.meta.url)));
const documentPath = join(dataDirectory, "documents.json");
let documents = [];
let loaded = false;
let writeQueue = Promise.resolve();
const normalize = (text) => String(text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const load = async () => { if (loaded) return; try { documents = JSON.parse(await readFile(documentPath, "utf8")); } catch { documents = []; } loaded = true; };
const save = async () => { writeQueue = writeQueue.then(async () => { await mkdir(dataDirectory, { recursive: true }); const temp = `${documentPath}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(documents, null, 2)); await rename(temp, documentPath); }); return writeQueue; };

export async function addDocument(userId, filename, text) {
  await load();
  const cleanName = String(filename || "document.txt").replace(/[\\/]/g, "_").slice(0, 180);
  const cleanText = String(text || "").slice(0, Number(process.env.MAX_UPLOAD_SIZE) || 2_000_000);
  if (!cleanText.trim()) throw new Error("Tài liệu rỗng.");
  const chunks = cleanText.match(/[\s\S]{1,1600}/g) || [];
  if (chunks.length > (Number(process.env.MAX_DOCUMENT_CHUNKS) || 200)) throw new Error("Tài liệu có quá nhiều phần.");
  const documentId = randomUUID();
  const document = { documentId, userId, filename: cleanName, createdAt: new Date().toISOString(), chunks: chunks.map((chunk, index) => ({ documentId, userId, filename: cleanName, chunkIndex: index, text: chunk })) };
  document.chunks = document.chunks.map((chunk) => ({ ...chunk, documentId: document.documentId }));
  documents.push(document); await save(); return document;
}

export async function listDocuments(userId) { await load(); return documents.filter((document) => document.userId === userId).map(({ chunks, ...document }) => ({ ...document, chunks: chunks.length })); }
export async function searchDocuments(userId, query, limit = 5) { await load(); const words = new Set(normalize(query).split(/\s+/).filter((word) => word.length > 2)); return documents.filter((document) => document.userId === userId).flatMap((document) => document.chunks).map((chunk) => ({ ...chunk, score: [...words].filter((word) => normalize(chunk.text).includes(word)).length / Math.max(words.size, 1) })).filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, limit); }
