import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModelProvider } from './ai/models/modelRouter.js';
import { initializeMemoryManager } from './ai/memory/memoryManager.js';
import { initializeRetriever, vectorCount } from './ai/retrieval/index.js';
import { graphCount, initializeGraph } from './ai/graph/index.js';
import { orchestrate } from './ai/orchestrator.js';
import { addDocument, listDocuments, searchDocuments } from './services/documentService.js';
import { handleChatRoute } from './routes/chats.js';
import { getUser, requireAdmin, signToken } from './middleware/auth.js';
import { getKnowledge, getLearned, initializeMemory, knowledgeCount, learnedCount, pendingCount, promoteToKnowledge, removeItem, verifyLearned } from '../lib/learningMemory.js';

const port = Number(process.env.PORT) || 4000;
const webDirectory = join(fileURLToPath(new URL('../../web/', import.meta.url)));
const dataDirectory = join(fileURLToPath(new URL('../data/', import.meta.url)));
const userDataPath = join(dataDirectory, 'users.json');
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const users = new Map();
let healthCache = { expires: 0, value: null };

const hashPassword = (password, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password, storedHash) => {
  const [salt, expectedHash] = String(storedHash || '').split(':');
  if (!salt || !expectedHash) return false;
  const actual = scryptSync(password, salt, 64); const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const saveUsers = async () => { await mkdir(dataDirectory, { recursive: true }); await writeFile(userDataPath, JSON.stringify(Object.fromEntries(users), null, 2)); };
async function loadUsers() {
  try { Object.entries(JSON.parse(await readFile(userDataPath, 'utf8'))).forEach(([email, user]) => users.set(email.toLowerCase(), user)); }
  catch { users.set('demo@kikial.local', { name: 'Nguyễn Nghị Đức', password: hashPassword('123456'), role: 'user' }); }
  const admin = users.get('admin@kikial.local');
  if (!admin) users.set('admin@kikial.local', { name: 'Admin Kikial', password: hashPassword('admin123'), role: 'admin' });
  else if (admin.role !== 'admin') users.set('admin@kikial.local', { ...admin, role: 'admin' });
  await saveUsers();
}
const send = (response, status, body, contentType = 'text/plain; charset=utf-8') => { response.writeHead(status, { 'Content-Type': contentType }); response.end(body); };
const sendJson = (response, status, payload) => send(response, status, JSON.stringify(payload), contentTypes['.json']);
async function readJson(request) {
  let body = '';
  for await (const chunk of request) { body += chunk; if (body.length > (Number(process.env.MAX_PAYLOAD_BYTES) || 1_000_000)) { const error = new Error('Payload quá lớn.'); error.statusCode = 413; error.code = 'VALIDATION_ERROR'; throw error; } }
  try { return JSON.parse(body || '{}'); } catch { const error = new Error('JSON không hợp lệ.'); error.statusCode = 400; error.code = 'VALIDATION_ERROR'; throw error; }
}
const newTraceId = () => randomBytes(12).toString('hex');
const requireAuth = (request, response) => { const user = getUser(request); if (!user) sendJson(response, 401, { ok: false, message: 'Bạn cần đăng nhập.', code: 'AUTH_ERROR' }); return user; };

async function health() {
  if (healthCache.expires > Date.now()) return healthCache.value;
  const model = getModelProvider(); const provider = await model.health();
  let vectorItems = 0; let vectorOnline = true;
  try { vectorItems = await vectorCount(); } catch { vectorOnline = false; }
  const degraded = [];
  if (!provider.online) degraded.push('MODEL_OFFLINE', 'EMBEDDING_OFFLINE');
  if (!vectorOnline) degraded.push('VECTOR_INDEX_UNAVAILABLE');
  const value = { ok: true, service: 'kikial-backend', aiProvider: 'ollama', model: provider.model || model.model, modelOnline: Boolean(provider.online), embeddingModel: provider.embeddingModel || model.embeddingModel, embeddingOnline: Boolean(provider.online), vectorOnline, degraded, knowledgeItems: knowledgeCount(), learnedItems: learnedCount(), pendingItems: pendingCount(), vectorItems, graphItems: graphCount() };
  healthCache = { expires: Date.now() + 10000, value }; return value;
}

async function handleRequest(request, response) {
  const requestPath = request.url?.split('?')[0] || '/'; const traceId = newTraceId(); const started = performance.now();
  try {
    if (requestPath === '/api/health') { sendJson(response, 200, await health()); return; }
    if (request.method === 'POST' && requestPath === '/api/auth/login') {
      const body = await readJson(request); const email = String(body.email || '').trim().toLowerCase(); const user = users.get(email);
      if (!user || !verifyPassword(String(body.password || ''), user.password)) { sendJson(response, 401, { ok: false, message: 'Email hoặc mật khẩu không đúng.', code: 'AUTH_ERROR' }); return; }
      const role = user.role || 'user'; sendJson(response, 200, { ok: true, token: signToken({ email, role, name: user.name }), user: { name: user.name, email, role } }); return;
    }
    if (request.method === 'POST' && requestPath === '/api/auth/register') {
      const body = await readJson(request); const email = String(body.email || '').trim().toLowerCase(); const name = String(body.name || '').trim(); const password = String(body.password || '');
      if (!name || !email.includes('@') || password.length < 6) { sendJson(response, 400, { ok: false, message: 'Vui lòng nhập đủ thông tin và mật khẩu từ 6 ký tự.', code: 'VALIDATION_ERROR' }); return; }
      if (users.has(email)) { sendJson(response, 409, { ok: false, message: 'Email này đã được đăng ký.' }); return; }
      users.set(email, { name, password: hashPassword(password), role: 'user' }); await saveUsers(); sendJson(response, 201, { ok: true, token: signToken({ email, role: 'user', name }), user: { name, email, role: 'user' } }); return;
    }
    if (request.method === 'GET' && requestPath === '/api/auth/me') { const user = requireAuth(request, response); if (user) sendJson(response, 200, { ok: true, user: { email: user.email, name: user.name, role: user.role } }); return; }
    if (requestPath === '/api/documents') {
      const user = requireAuth(request, response); if (!user) return;
      if (request.method === 'GET') { sendJson(response, 200, { ok: true, documents: await listDocuments(user.email) }); return; }
      if (request.method === 'POST') { const body = await readJson(request); const document = await addDocument(user.email, body.filename, body.text); sendJson(response, 201, { ok: true, document: { documentId: document.documentId, filename: document.filename, chunks: document.chunks.length } }); return; }
    }
    if (request.method === 'POST' && requestPath === '/api/documents/search') { const user = requireAuth(request, response); if (user) { const body = await readJson(request); sendJson(response, 200, { ok: true, chunks: await searchDocuments(user.email, body.query, 5) }); } return; }
    if (request.method === 'POST' && requestPath === '/api/chat/stream') {
      const user = requireAuth(request, response); if (!user) return;
      const body = await readJson(request); const result = await orchestrate({ userId: user.email, message: body.message, history: body.history, traceId });
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      response.write(`event: status\ndata: ${JSON.stringify({ status: 'complete', traceId })}\n\n`);
      response.write(`event: answer_delta\ndata: ${JSON.stringify({ text: result.answer })}\n\n`);
      response.write(`event: complete\ndata: ${JSON.stringify(result)}\n\n`); response.end(); return;
    }
    if (request.method === 'POST' && requestPath === '/api/chat') { const user = requireAuth(request, response); if (user) await handleChatRoute({ request, response, readJson, send, contentType: contentTypes['.json'], user, traceId }); return; }
    if (request.method === 'POST' && requestPath === '/api/chat/feedback') {
      const user = requireAuth(request, response); if (!user) return; const body = await readJson(request);
      if (!body.id) { sendJson(response, 400, { ok: false, message: 'Thiếu mã bản ghi.' }); return; }
      if (body.helpful === false) { const removed = await removeItem(body.id); sendJson(response, 200, { ok: true, removed: Boolean(removed) }); return; }
      const verified = await verifyLearned(body.id, true); sendJson(response, verified ? 200 : 404, { ok: verified, message: verified ? 'Đã duyệt kiến thức.' : 'Không tìm thấy bản ghi.' }); return;
    }
    if (requestPath.startsWith('/api/admin/')) {
      if (!requireAdmin(request)) { sendJson(response, 403, { ok: false, message: 'Bạn không có quyền truy cập.', code: 'AUTH_ERROR' }); return; }
      if (request.method === 'GET' && requestPath === '/api/admin/knowledge') { sendJson(response, 200, { ok: true, items: [...getLearned(), ...getKnowledge()], counts: { knowledge: knowledgeCount(), learned: learnedCount(), pending: pendingCount() } }); return; }
      if (request.method === 'POST' && requestPath === '/api/admin/knowledge/verify') { const body = await readJson(request); const ok = body.promote ? await promoteToKnowledge(body.id) : await verifyLearned(body.id, body.verified !== false); sendJson(response, ok ? 200 : 404, { ok, message: ok ? 'Đã cập nhật.' : 'Không tìm thấy bản ghi.' }); return; }
      if (request.method === 'DELETE' && requestPath.startsWith('/api/admin/knowledge/')) { const id = decodeURIComponent(requestPath.split('/').pop() || ''); const store = await removeItem(id); sendJson(response, store ? 200 : 404, { ok: Boolean(store), store }); return; }
      sendJson(response, 404, { ok: false, message: 'Không tìm thấy endpoint.' }); return;
    }
    if (requestPath === '/' || requestPath === '/index.html') { response.writeHead(302, { Location: 'http://localhost:5173/' }); response.end(); return; }
    const pageRoutes = { '/login.html': '/pages/login.html', '/register.html': '/pages/register.html' }; const relativePath = pageRoutes[requestPath] || requestPath; const filePath = normalize(join(webDirectory, relativePath));
    if (!filePath.startsWith(webDirectory)) { send(response, 403, 'Forbidden'); return; }
    try { send(response, 200, await readFile(filePath), contentTypes[extname(filePath)] || 'application/octet-stream'); } catch { send(response, 404, 'Not found'); }
  } catch (error) {
    console.error(JSON.stringify({ traceId, code: error.code || 'INTERNAL_ERROR', message: error.message, latencyMs: Math.round(performance.now() - started) }));
    sendJson(response, error.statusCode || 500, { ok: false, message: error.statusCode && error.statusCode < 500 ? error.message : 'Không thể xử lý yêu cầu.', code: error.code || 'INTERNAL_ERROR', traceId });
  }
}

await loadUsers();
await initializeMemory();
await initializeMemoryManager();
await initializeRetriever();
await initializeGraph([...getKnowledge(), ...getLearned().filter((item) => item.verified)]);
createServer(handleRequest).listen(port, () => console.log(`Kikial đang chạy tại http://localhost:${port}`));
