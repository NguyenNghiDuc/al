import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { applyCors, applySecurityHeaders, checkRateLimit } from '../middleware/security.js';
import { observeRequest, runtimeMetrics } from '../observability/runtimeMetrics.js';
import { requireAdmin } from '../middleware/auth.js';

const originalCreateServer = http.createServer.bind(http);

http.createServer = function createSecureServer(listener) {
  return originalCreateServer(async (request, response) => {
    const pathname = request.url?.split('?')[0] || '/';
    const started = performance.now();
    applySecurityHeaders(response);
    response.once('finish', () => observeRequest({
      method: request.method,
      pathname,
      statusCode: response.statusCode,
      latencyMs: performance.now() - started,
    }));

    if (!applyCors(request, response)) {
      response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, code: 'CORS_DENIED', message: 'Origin không được phép.' }));
      return;
    }

    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.end();
      return;
    }

    const rate = checkRateLimit(request, pathname);
    if (!rate.allowed) {
      response.setHeader('Retry-After', String(rate.retryAfterSeconds));
      response.setHeader('X-RateLimit-Limit', String(rate.limit));
      response.setHeader('X-RateLimit-Remaining', '0');
      response.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, code: 'RATE_LIMITED', message: 'Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau.' }));
      return;
    }
    if (rate.limit) {
      response.setHeader('X-RateLimit-Limit', String(rate.limit));
      response.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    }

    if (request.method === 'GET' && pathname === '/api/admin/runtime') {
      if (!requireAdmin(request)) {
        response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ ok: false, code: 'AUTH_ERROR', message: 'Bạn không có quyền truy cập.' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, runtime: runtimeMetrics() }));
      return;
    }

    return listener(request, response);
  });
};

syncBuiltinESMExports();
