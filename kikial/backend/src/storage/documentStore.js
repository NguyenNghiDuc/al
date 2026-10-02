import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDirectory = join(fileURLToPath(new URL('../../data/', import.meta.url)));
const jsonPath = process.env.KIKIAL_DOCUMENTS_PATH || join(dataDirectory, 'documents.json');
const sqlitePath = process.env.KIKIAL_DATABASE_PATH || join(dataDirectory, 'kikial.sqlite');

class JsonDocumentStore {
  constructor(path = jsonPath) {
    this.path = path;
    this.items = [];
    this.loaded = false;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      this.items = Array.isArray(parsed) ? parsed : [];
    } catch { this.items = []; }
    this.loaded = true;
  }

  async persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(this.items, null, 2));
      await rename(temp, this.path);
    });
    return this.writeQueue;
  }

  async insert(document) { await this.init(); this.items.push(document); await this.persist(); }
  async list(userId) { await this.init(); return this.items.filter((item) => item.userId === userId); }
  async allChunks(userId) { return (await this.list(userId)).flatMap((item) => item.chunks || []); }
  async remove(userId, documentId) {
    await this.init();
    const before = this.items.length;
    this.items = this.items.filter((item) => !(item.userId === userId && item.documentId === documentId));
    if (before === this.items.length) return false;
    await this.persist();
    return true;
  }
}

class SqliteDocumentStore {
  constructor(DatabaseSync, path = sqlitePath) {
    this.DatabaseSync = DatabaseSync;
    this.path = path;
    this.db = null;
  }

  async init() {
    if (this.db) return;
    await mkdir(dirname(this.path), { recursive: true });
    this.db = new this.DatabaseSync(this.path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS documents (
        document_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT,
        source TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_documents_user_created ON documents(user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS document_chunks (
        chunk_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(document_id) REFERENCES documents(document_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_user_document ON document_chunks(user_id, document_id, chunk_index);
    `);
  }

  async insert(document) {
    await this.init();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO documents(document_id,user_id,filename,mime_type,source,size,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(document.documentId, document.userId, document.filename, document.mimeType || null, document.source || null, document.size || 0, document.createdAt);
      const insertChunk = this.db.prepare('INSERT INTO document_chunks(chunk_id,document_id,user_id,filename,chunk_index,text,created_at) VALUES(?,?,?,?,?,?,?)');
      for (const chunk of document.chunks || []) insertChunk.run(chunk.chunkId, document.documentId, document.userId, document.filename, chunk.chunkIndex, chunk.text, chunk.createdAt || document.createdAt);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async list(userId) {
    await this.init();
    const docs = this.db.prepare('SELECT document_id AS documentId,user_id AS userId,filename,mime_type AS mimeType,source,size,created_at AS createdAt FROM documents WHERE user_id=? ORDER BY created_at DESC').all(userId);
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM document_chunks WHERE document_id=?');
    return docs.map((doc) => ({ ...doc, chunks: Number(count.get(doc.documentId)?.count || 0) }));
  }

  async allChunks(userId) {
    await this.init();
    return this.db.prepare('SELECT chunk_id AS chunkId,document_id AS documentId,user_id AS userId,filename,chunk_index AS chunkIndex,text,created_at AS createdAt FROM document_chunks WHERE user_id=? ORDER BY document_id,chunk_index').all(userId);
  }

  async remove(userId, documentId) {
    await this.init();
    const result = this.db.prepare('DELETE FROM documents WHERE user_id=? AND document_id=?').run(userId, documentId);
    return Number(result.changes || 0) > 0;
  }

  async count() { await this.init(); return Number(this.db.prepare('SELECT COUNT(*) AS count FROM documents').get()?.count || 0); }
}

let storePromise;

async function createStore() {
  const requested = String(process.env.DOCUMENT_STORAGE_DRIVER || 'sqlite').toLowerCase();
  if (requested !== 'json') {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const sqlite = new SqliteDocumentStore(DatabaseSync);
      await sqlite.init();
      if ((await sqlite.count()) === 0) {
        const legacy = new JsonDocumentStore();
        await legacy.init();
        for (const document of legacy.items) {
          try { await sqlite.insert(document); } catch {}
        }
      }
      return sqlite;
    } catch (error) {
      if (requested === 'sqlite-strict') throw error;
      console.warn(`[Kikial Storage] SQLite unavailable, fallback JSON: ${error.message}`);
    }
  }
  const json = new JsonDocumentStore();
  await json.init();
  return json;
}

export async function getDocumentStore() {
  if (!storePromise) storePromise = createStore();
  return storePromise;
}

export { JsonDocumentStore, SqliteDocumentStore };
