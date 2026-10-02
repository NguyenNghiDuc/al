const startedAt = Date.now();
const routeStats = new Map();
let totalRequests = 0;
let totalErrors = 0;
let totalLatencyMs = 0;
let peakLatencyMs = 0;

function normalizeRoute(pathname = '') {
  if (/^\/api\/admin\/knowledge\//.test(pathname)) return '/api/admin/knowledge/:id';
  return pathname || '/';
}

export function observeRequest({ method, pathname, statusCode, latencyMs }) {
  const route = `${String(method || 'GET').toUpperCase()} ${normalizeRoute(pathname)}`;
  const latency = Math.max(0, Number(latencyMs) || 0);
  totalRequests += 1;
  totalLatencyMs += latency;
  peakLatencyMs = Math.max(peakLatencyMs, latency);
  if (Number(statusCode) >= 400) totalErrors += 1;
  const current = routeStats.get(route) || { requests: 0, errors: 0, latencyMs: 0, maxLatencyMs: 0 };
  current.requests += 1;
  current.latencyMs += latency;
  current.maxLatencyMs = Math.max(current.maxLatencyMs, latency);
  if (Number(statusCode) >= 400) current.errors += 1;
  routeStats.set(route, current);
}

export function runtimeMetrics() {
  const routes = [...routeStats.entries()].map(([route, value]) => ({
    route,
    requests: value.requests,
    errors: value.errors,
    errorRate: value.requests ? value.errors / value.requests : 0,
    averageLatencyMs: value.requests ? Math.round(value.latencyMs / value.requests) : 0,
    maxLatencyMs: Math.round(value.maxLatencyMs),
  })).sort((a, b) => b.requests - a.requests).slice(0, 30);

  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requests: totalRequests,
    errors: totalErrors,
    errorRate: totalRequests ? totalErrors / totalRequests : 0,
    averageLatencyMs: totalRequests ? Math.round(totalLatencyMs / totalRequests) : 0,
    peakLatencyMs: Math.round(peakLatencyMs),
    routes,
  };
}

export function resetRuntimeMetrics() {
  totalRequests = 0;
  totalErrors = 0;
  totalLatencyMs = 0;
  peakLatencyMs = 0;
  routeStats.clear();
}
