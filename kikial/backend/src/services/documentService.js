import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rankDocumentChunks, smartChunkDocument } from "./documentChunker.js";

const dataDirectory = join(fileURLToPath(new URL("../../data/", import.meta.url)));
const documentPath = process.env.KIKIAL_DOCUMENTS_PATH || join(dataDirectory, "documents.json");
let documents = [];
let loaded = false;
let writeQueue = Promise.resolve();

const load = async () => {
  if (loaded) return;
  try {
    const parsed = JSON.parse(await readFile(documentPath, "utf8"));
    documents = Array.isArray(parsed) ? parsed : [];
  } catch {
    documents = [];
  }
  loaded = true;
};

const save = async () => {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(documentPath), { recursive: true });
    const temp = `${documentPath}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(documents, null, 2));
    await rename(temp, documentPath);
  });
  return writeQueue;
};

export async function addDocument(userId, filename, text, metadata = {}) {
  await load();
  const cleanName = String(filename || "document.txt").replace(/[\\/]/g, "_").slice(0, 180);
  const maxUpload = Number(process.env.MAX_UPLOAD_SIZE) || 2_000_000;
  const cleanText = String(text || "").slice(0, maxUpload);
  if (!cleanText.trim()) throw new Error("Tài liệu rỗng.");

  const rawChunks = smartChunkDocument(cleanText, {
    maxChars: Number(process.env.DOCUMENT_CHUNK_CHARS) || 1400,
    overlapChars: Number(process.env.DOCUMENT_CHUNK_OVERLAP) || 180,
  });
  if (rawChunks.length > (Number(process.env.MAX_DOCUMENT_CHUNKS) || 400)) {
    throw new Error("Tài liệu có quá nhiều phần.");
  }

  const documentId = randomUUID();
  const createdAt = new Date().toISOString();
  const document = {
    documentId,
    userId,
    filename: cleanName,
    mimeType: String(metadata.mimeType || "text/plain").slice(0, 120),
    source: String(metadata.source || "manual").slice(0, 40),
    size: cleanText.length,
    createdAt,
    chunks: rawChunks.map((chunk, index) => ({
      documentId,
      userId,
      filename: cleanName,
      chunkIndex: index,
      chunkId: `${documentId}:${index}`,
      text: chunk,
      createdAt,
    })),
  };
  documents.push(document);
  await save();
  return document;
}

export async function listDocuments(userId) {
  await load();
  return documents
    .filter((document) => document.userId === userId)
    .map(({ chunks, ...document }) => ({ ...document, chunks: chunks.length }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function searchDocuments(userId, query, limit = 5) {
  await load();
  const chunks = documents
    .filter((document) => document.userId === userId)
    .flatMap((document) => document.chunks || []);
  return rankDocumentChunks(chunks, query, limit);
}

export async function removeDocument(userId, documentId) {
  await load();
  const before = documents.length;
  documents = documents.filter((document) => !(document.userId === userId && document.documentId === documentId));
  if (documents.length === before) return false;
  await save();
  return true;
}
