import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModelProvider } from './ai/models/modelRouter.js';
import { initializeMemoryManager } from './ai/memory/memoryManager.js';
import { initializeRetriever, vectorCount } from './ai/retrieval/index.js';
import { webSearchEnabled } from './ai/retrieval/webSearch.js';
import { graphCount, initializeGraph } from './ai/graph/index.js';
import { addDocument, listDocuments, searchDocuments } from './services/documentService.js';
import { handleChat } from './controllers/chatController.js';
import { handleChatRoute } from './routes/chats.js';
import { getUser, requireAdmin, signToken } from './middleware/auth.js';
import { getKnowledge, getLearned, initializeMemory, knowledgeCount, learnedCount, pendingCount, promoteToKnowledge, removeItem, verifyLearned } from '../lib/learningMemory.js';

const port = Number(process.env.PORT) || 4000;
const webDirectory = join(fileURLToPath(new URL('../../web/', import.meta.url)));
const distDirectory = join(webDirectory, 'dist');
const dataDirectory = join(fileURLToPath(new URL('../data/', import.meta.url)));
const userDataPath = join(dataDirectory, 'users.json');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};
const users = new Map();
let healthCache = { expires: 0, value: null };

const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@kikial.local').trim().toLowerCase();
const adminName = String(process.env.ADMIN_NAME || 'Admin Kikial').trim() || 'Admin Kikial';
const adminPassword = String(process.env.ADMIN_PASSWORD || 'admin123');

const hashPassword = (password, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password, storedHash) => {
  const [salt, expectedHash] = String(storedHash || '').split(':');
  if (!salt || !expectedHash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const saveUsers = async () => {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(userDataPath, JSON.stringify(Object.fromEntries(users), null, 2));
};
async function loadUsers() {
  try {
    Object.entries(JSON.parse(await readFile(userDataPath, 'utf8'))).forEach(([email, user]) => users.set(email.toLowerCase(), user));
  } catch {
    users.set('demo@kikial.local', { name: 'Nguyễn Nghị Đức', password: hashPassword('123456'), role: 'user', createdAt: new Date().toISOString() });
  }
  const admin = users.get(adminEmail);
  if (!admin) {
    users.set(adminEmail, { name: adminName, password: hashPassword(adminPassword), role: 'admin', createdAt: new Date().toISOString() });
  } else if (admin.role !== 'admin') {
    users.set(adminEmail, { ...admin, role: 'admin' });
  }
  await saveUsers();
  if (process.env.NODE_ENV === 'production' && (!process.env.AUTH_SECRET || adminPassword === 'admin123')) {
    console.warn('[SECURITY] Production should set AUTH_SECRET and a non-default ADMIN_PASSWORD.');
  }
}

const send = (response, status, body, contentType = 'text/plain; charset=utf-8') => {
  response.writeHead(status, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
};
const sendJson = (response, status, payload) => send(response, status, JSON.stringify(payload), contentTypes['.json']);
async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > (Number(process.env.MAX_PAYLOAD_BYTES) || 1_000_000)) {
      const error = new Error('Payload quá lớn.');
      error.statusCode = 413;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  }
  try { return JSON.parse(body || '{}'); }
  catch {
    const error = new Error('JSON không hợp lệ.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
}
const newTraceId = () => randomBytes(12).toString('hex');
const requireAuth = (request, response) => {
  const user = getUser(request);
  if (!user) sendJson(response, 401, { ok: false, message: 'Bạn cần đăng nhập.', code: 'AUTH_ERROR' });
  return user;
};
const publicUser = (email, user) => ({ email, name: user.name, role: user.role || 'user', createdAt: user.createdAt || null });

async function health() {
  if (healthCache.expires > Date.now()) return healthCache.value;
  const model = await getModelProvider();
  const provider = await model.health();
  let vectorItems = 0;
  let vectorOnline = true;
  try { vectorItems = await vectorCount(); } catch { vectorOnline = false; }
  const degraded = [];
  if (!provider.online) degraded.push('MODEL_OFFLINE', 'EMBEDDING_OFFLINE');
  if (!vectorOnline) degraded.push('VECTOR_INDEX_UNAVAILABLE');
  if (!webSearchEnabled()) degraded.push('WEB_SEARCH_DISABLED');
  const value = {
    ok: true,
    service: 'kikial-backend',
    aiProvider: process.env.AI_PROVIDER || 'ollama',
    model: provider.model || model.model,
    modelOnline: Boolean(provider.online),
    embeddingModel: provider.embeddingModel || model.embeddingModel,
    embeddingOnline: Boolean(provider.online),
    vectorOnline,
    webSearchOnline: webSearchEnabled(),
    degraded,
    knowledgeItems: knowledgeCount(),
    learnedItems: learnedCount(),
    pendingItems: pendingCount(),
    vectorItems,
    graphItems: graphCount(),
    users: users.size,
  };
  healthCache = { expires: Date.now() + 10000, value };
  return value;
}

async function serveWeb(requestPath, response) {
  const devUrl = String(process.env.WEB_DEV_URL || '').trim();
  if (devUrl && (requestPath === '/' || requestPath === '/index.html')) {
    response.writeHead(302, { Location: devUrl });
    response.end();
    return true;
  }

  const requested = requestPath === '/' ? '/index.html' : requestPath;
  const distPath = normalize(join(distDirectory, requested));
  if (distPath.startsWith(distDirectory)) {
    try {
      send(response, 200, await readFile(distPath), contentTypes[extname(distPath)] || 'application/octet-stream');
      return true;
    } catch {}
  }

  // SPA fallback for client-side navigation when a production build exists.
  if (!extname(requested)) {
    try {
      send(response, 200, await readFile(join(distDirectory, 'index.html')), contentTypes['.html']);
      return true;
    } catch {}
  }

  const pageRoutes = { '/login.html': '/pages/login.html', '/register.html': '/pages/register.html' };
  const relativePath = pageRoutes[requestPath] || requestPath;
  const filePath = normalize(join(webDirectory, relativePath));
  if (!filePath.startsWith(webDirectory)) {
    send(response, 403, 'Forbidden');
    return true;
  }
  try {
    send(response, 200, await readFile(filePath), contentTypes[extname(filePath)] || 'application/octet-stream');
    return true;
  } catch {
    return false;
  }
}

async function handleRequest(request, response) {
  const requestPath = request.url?.split('?')[0] || '/';
  const traceId = newTraceId();
  const started = performance.now();
  try {
    if (requestPath === '/api/health') { sendJson(response, 200, await health()); return; }

    if (request.method === 'POST' && requestPath === '/api/auth/login') {
      const body = await readJson(request);
      const email = String(body.email || '').trim().toLowerCase();
      const user = users.get(email);
      if (!user || !verifyPassword(String(body.password || ''), user.password)) {
        sendJson(response, 401, { ok: false, message: 'Email hoặc mật khẩu không đúng.', code: 'AUTH_ERROR' });
        return;
      }
      const role = user.role || 'user';
      sendJson(response, 200, { ok: true, token: signToken({ email, role, name: user.name }), user: publicUser(email, user) });
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/auth/register') {
      const body = await readJson(request);
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      const password = String(body.password || '');
      if (!name || !email.includes('@') || password.length < 8) {
        sendJson(response, 400, { ok: false, message: 'Vui lòng nhập đủ thông tin và mật khẩu từ 8 ký tự.', code: 'VALIDATION_ERROR' });
        return;
      }
      if (users.has(email)) { sendJson(response, 409, { ok: false, message: 'Email này đã được đăng ký.' }); return; }
      const user = { name: name.slice(0, 80), password: hashPassword(password), role: 'user', createdAt: new Date().toISOString() };
      users.set(email, user);
      await saveUsers();
      sendJson(response, 201, { ok: true, token: signToken({ email, role: 'user', name: user.name }), user: publicUser(email, user) });
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/auth/logout') {
      // Tokens are stateless; client deletion ends the local session. This endpoint keeps the API contract explicit.
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && requestPath === '/api/auth/me') {
      const user = requireAuth(request, response);
      if (user) sendJson(response, 200, { ok: true, user: { email: user.email, name: user.name, role: user.role } });
      return;
    }

    if (requestPath === '/api/documents') {
      const user = requireAuth(request, response);
      if (!user) return;
      if (request.method === 'GET') { sendJson(response, 200, { ok: true, documents: await listDocuments(user.email) }); return; }
      if (request.method === 'POST') {
        const body = await readJson(request);
        const document = await addDocument(user.email, body.filename, body.text);
        sendJson(response, 201, { ok: true, document: { documentId: document.documentId, filename: document.filename, chunks: document.chunks.length } });
        return;
      }
    }

    if (request.method === 'POST' && requestPath === '/api/documents/search') {
      const user = requireAuth(request, response);
      if (user) {
        const body = await readJson(request);
        sendJson(response, 200, { ok: true, chunks: await searchDocuments(user.email, body.query, 5) });
      }
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/chat/stream') {
      const user = requireAuth(request, response);
      if (!user) return;
      const body = await readJson(request);
      const result = await handleChat({ body, user, traceId });
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
      response.write(`event: status\ndata: ${JSON.stringify({ status: 'complete', traceId })}\n\n`);
      response.write(`event: answer_delta\ndata: ${JSON.stringify({ text: result.answer })}\n\n`);
      response.write(`event: complete\ndata: ${JSON.stringify(result)}\n\n`);
      response.end();
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/chat') {
      const user = requireAuth(request, response);
      if (user) await handleChatRoute({ request, response, readJson, send, contentType: contentTypes['.json'], user, traceId });
      return;
    }

    if (request.method === 'POST' && requestPath === '/api/chat/feedback') {
      const user = requireAuth(request, response);
      if (!user) return;
      const body = await readJson(request);
      if (!body.id) { sendJson(response, 400, { ok: false, message: 'Thiếu mã bản ghi.' }); return; }
      if (body.helpful === false) {
        const removed = await removeItem(body.id);
        sendJson(response, 200, { ok: true, removed: Boolean(removed) });
        return;
      }
      const verified = await verifyLearned(body.id, true);
      sendJson(response, verified ? 200 : 404, { ok: verified, message: verified ? 'Đã duyệt kiến thức.' : 'Không tìm thấy bản ghi.' });
      return;
    }

    if (requestPath.startsWith('/api/admin/')) {
      if (!requireAdmin(request)) { sendJson(response, 403, { ok: false, message: 'Bạn không có quyền truy cập.', code: 'AUTH_ERROR' }); return; }

      if (request.method === 'GET' && requestPath === '/api/admin/overview') {
        const system = await health();
        sendJson(response, 200, {
          ok: true,
          stats: {
            users: users.size,
            admins: [...users.values()].filter((item) => item.role === 'admin').length,
            knowledge: knowledgeCount(),
            learned: learnedCount(),
            pending: pendingCount(),
            vectors: system.vectorItems,
            graph: system.graphItems,
          },
          system,
        });
        return;
      }

      if (request.method === 'GET' && requestPath === '/api/admin/users') {
        const items = [...users.entries()].map(([email, user]) => publicUser(email, user)).sort((a, b) => String(a.email).localeCompare(String(b.email)));
        sendJson(response, 200, { ok: true, items });
        return;
      }

      if (request.method === 'GET' && requestPath === '/api/admin/knowledge') {
        sendJson(response, 200, { ok: true, items: [...getLearned(), ...getKnowledge()], counts: { knowledge: knowledgeCount(), learned: learnedCount(), pending: pendingCount() } });
        return;
      }

      if (request.method === 'POST' && requestPath === '/api/admin/knowledge/verify') {
        const body = await readJson(request);
        const ok = body.promote ? await promoteToKnowledge(body.id) : await verifyLearned(body.id, body.verified !== false);
        healthCache.expires = 0;
        sendJson(response, ok ? 200 : 404, { ok, message: ok ? 'Đã cập nhật.' : 'Không tìm thấy bản ghi.' });
        return;
      }

      if (request.method === 'DELETE' && requestPath.startsWith('/api/admin/knowledge/')) {
        const id = decodeURIComponent(requestPath.split('/').pop() || '');
        const store = await removeItem(id);
        healthCache.expires = 0;
        sendJson(response, store ? 200 : 404, { ok: Boolean(store), store });
        return;
      }

      sendJson(response, 404, { ok: false, message: 'Không tìm thấy endpoint.' });
      return;
    }

    if (await serveWeb(requestPath, response)) return;
    send(response, 404, 'Not found');
  } catch (error) {
    console.error(JSON.stringify({ traceId, code: error.code || 'INTERNAL_ERROR', message: error.message, latencyMs: Math.round(performance.now() - started) }));
    sendJson(response, error.statusCode || 500, {
      ok: false,
      message: error.statusCode && error.statusCode < 500 ? error.message : 'Không thể xử lý yêu cầu.',
      code: error.code || 'INTERNAL_ERROR',
      traceId,
    });
  }
}

await loadUsers();
await initializeMemory();
await initializeMemoryManager();
await initializeRetriever();
await initializeGraph([...getKnowledge(), ...getLearned().filter((item) => item.verified)]);
createServer(handleRequest).listen(port, () => console.log(`Kikial đang chạy tại http://localhost:${port}`));
