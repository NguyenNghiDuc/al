import test from 'node:test';
import assert from 'node:assert/strict';
import { smartChunkDocument, rankDocumentChunks } from '../src/services/documentChunker.js';

test('smartChunkDocument keeps coherent text and overlap without tiny fragments', () => {
  const text = [
    '# Mạng máy tính',
    'DNS ánh xạ tên miền sang địa chỉ IP. ARP ánh xạ địa chỉ IP sang địa chỉ MAC trong mạng cục bộ.',
    'NAT cho phép nhiều thiết bị dùng chung một địa chỉ IP công cộng. CIDR biểu diễn prefix mạng linh hoạt.',
    'Ví dụ mạng /27 có 32 địa chỉ, trong đó số host sử dụng được phụ thuộc địa chỉ network và broadcast.',
  ].join('\n\n').repeat(8);
  const chunks = smartChunkDocument(text, { maxChars: 420, overlapChars: 70 });
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 420));
  assert.ok(chunks.every((chunk) => chunk.trim().length > 40));
  assert.match(chunks.join(' '), /DNS/);
});

test('rankDocumentChunks prefers specific BM25 match', () => {
  const chunks = [
    { chunkIndex: 0, text: 'Cà phê, đồ uống và chương trình khuyến mãi tại cửa hàng.' },
    { chunkIndex: 1, text: 'CIDR /27 tạo khối 32 địa chỉ IPv4 và subnet mask tương ứng là 255.255.255.224.' },
    { chunkIndex: 2, text: 'Mạng máy tính gồm DNS ARP NAT và nhiều giao thức khác.' },
  ];
  const ranked = rankDocumentChunks(chunks, 'CIDR /27 subnet mask IPv4', 3);
  assert.ok(ranked.length >= 1);
  assert.equal(ranked[0].chunkIndex, 1);
  assert.ok(ranked[0].bm25Score > 0);
  assert.ok(ranked[0].queryCoverage >= 0.6);
});
