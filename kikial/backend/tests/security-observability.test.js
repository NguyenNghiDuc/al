import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCors, checkRateLimit, resetRateLimits } from '../src/middleware/security.js';
import { observeRequest, resetRuntimeMetrics, runtimeMetrics } from '../src/observability/runtimeMetrics.js';

function fakeResponse() {
  const headers = new Map();
  return {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
  };
}

test('auth rate limiting blocks bursts after configured maximum', () => {
  const previous = process.env.RATE_LIMIT_AUTH_MAX;
  process.env.RATE_LIMIT_AUTH_MAX = '2';
  resetRateLimits();
  const request = { headers: {}, socket: { remoteAddress: '127.0.0.77' } };
  try {
    assert.equal(checkRateLimit(request, '/api/auth/login').allowed, true);
    assert.equal(checkRateLimit(request, '/api/auth/login').allowed, true);
    const blocked = checkRateLimit(request, '/api/auth/login');
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds >= 1);
  } finally {
    resetRateLimits();
    if (previous === undefined) delete process.env.RATE_LIMIT_AUTH_MAX; else process.env.RATE_LIMIT_AUTH_MAX = previous;
  }
});

test('CORS production allow-list accepts configured origin and rejects another', () => {
  const beforeNodeEnv = process.env.NODE_ENV;
  const beforeOrigins = process.env.CORS_ORIGINS;
  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGINS = 'https://ai.example.com';
  try {
    const allowedResponse = fakeResponse();
    assert.equal(applyCors({ headers: { origin: 'https://ai.example.com' } }, allowedResponse), true);
    assert.equal(allowedResponse.getHeader('access-control-allow-origin'), 'https://ai.example.com');
    assert.equal(applyCors({ headers: { origin: 'https://evil.example' } }, fakeResponse()), false);
  } finally {
    if (beforeNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = beforeNodeEnv;
    if (beforeOrigins === undefined) delete process.env.CORS_ORIGINS; else process.env.CORS_ORIGINS = beforeOrigins;
  }
});

test('runtime observability reports request error and latency summaries', () => {
  resetRuntimeMetrics();
  observeRequest({ method: 'GET', pathname: '/api/health', statusCode: 200, latencyMs: 10 });
  observeRequest({ method: 'POST', pathname: '/api/chat', statusCode: 500, latencyMs: 30 });
  const metrics = runtimeMetrics();
  assert.equal(metrics.requests, 2);
  assert.equal(metrics.errors, 1);
  assert.equal(metrics.averageLatencyMs, 20);
  assert.ok(metrics.routes.some((item) => item.route === 'POST /api/chat' && item.errors === 1));
});
