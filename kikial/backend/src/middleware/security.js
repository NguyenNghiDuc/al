const buckets = new Map();

const numeric = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

function clientIp(request) {
  const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket?.remoteAddress || 'unknown';
}

function routeClass(pathname) {
  if (pathname === '/api/auth/login' || pathname === '/api/auth/register') return 'auth';
  if (pathname === '/api/chat' || pathname === '/api/chat/stream') return 'chat';
  if (pathname.startsWith('/api/admin/')) return 'admin';
  return 'api';
}

function policyFor(kind) {
  const windowMs = numeric(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
  const defaults = { auth: 12, chat: 40, admin: 120, api: 180 };
  const envKey = `RATE_LIMIT_${kind.toUpperCase()}_MAX`;
  return { windowMs, max: numeric(process.env[envKey], defaults[kind] || 120) };
}

export function checkRateLimit(request, pathname) {
  if (!pathname.startsWith('/api/') || process.env.RATE_LIMIT_DISABLED === 'true') return { allowed: true };
  const kind = routeClass(pathname);
  const { windowMs, max } = policyFor(kind);
  const key = `${clientIp(request)}:${kind}`;
  const timestamp = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= timestamp) bucket = { count: 0, resetAt: timestamp + windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > 5000) {
    for (const [entryKey, value] of buckets) if (value.resetAt <= timestamp) buckets.delete(entryKey);
  }

  return {
    allowed: bucket.count <= max,
    limit: max,
    remaining: Math.max(0, max - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)),
  };
}

function allowedOrigins() {
  return String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function applyCors(request, response) {
  const origin = String(request.headers?.origin || '').trim();
  if (!origin) return true;
  const allow = allowedOrigins();
  const development = process.env.NODE_ENV !== 'production';
  const permitted = allow.includes(origin) || (development && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));
  if (!permitted) return false;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('Access-Control-Max-Age', '600');
  return true;
}

export function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' http://localhost:* http://127.0.0.1:*; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:");
  if (process.env.NODE_ENV === 'production') response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export function resetRateLimits() {
  buckets.clear();
}
