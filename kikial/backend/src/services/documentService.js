import { randomUUID } from "node:crypto";
import { rankDocumentChunks, smartChunkDocument } from "./documentChunker.js";
import { getDocumentStore } from "../storage/documentStore.js";

export async function addDocument(userId, filename, text, metadata = {}) {
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
  await (await getDocumentStore()).insert(document);
  return document;
}

export async function listDocuments(userId) {
  const documents = await (await getDocumentStore()).list(userId);
  return documents.map((document) => Array.isArray(document.chunks)
    ? { ...document, chunks: document.chunks.length }
    : document);
}

export async function searchDocuments(userId, query, limit = 5) {
  const chunks = await (await getDocumentStore()).allChunks(userId);
  return rankDocumentChunks(chunks, query, limit);
}

export async function removeDocument(userId, documentId) {
  return (await getDocumentStore()).remove(userId, documentId);
}
