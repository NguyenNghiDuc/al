import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteDocumentStore } from '../src/storage/documentStore.js';

test('SQLite document store persists documents and cascades chunk deletion', async (t) => {
  const { DatabaseSync } = await import('node:sqlite');
  const directory = await mkdtemp(join(tmpdir(), 'kikial-sqlite-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const store = new SqliteDocumentStore(DatabaseSync, join(directory, 'test.sqlite'));
  const document = {
    documentId: 'doc-1',
    userId: 'user@example.com',
    filename: 'network.md',
    mimeType: 'text/markdown',
    source: 'test',
    size: 100,
    createdAt: '2026-10-03T00:00:00.000Z',
    chunks: [
      { chunkId: 'doc-1:0', documentId: 'doc-1', userId: 'user@example.com', filename: 'network.md', chunkIndex: 0, text: 'CIDR /27 có 32 địa chỉ.', createdAt: '2026-10-03T00:00:00.000Z' },
      { chunkId: 'doc-1:1', documentId: 'doc-1', userId: 'user@example.com', filename: 'network.md', chunkIndex: 1, text: 'Subnet mask là 255.255.255.224.', createdAt: '2026-10-03T00:00:00.000Z' },
    ],
  };

  await store.insert(document);
  const listed = await store.list('user@example.com');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].chunks, 2);
  assert.equal((await store.allChunks('user@example.com')).length, 2);
  assert.equal(await store.remove('user@example.com', 'doc-1'), true);
  assert.equal((await store.allChunks('user@example.com')).length, 0);
});
