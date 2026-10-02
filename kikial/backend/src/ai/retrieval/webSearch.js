const DEFAULT_TIMEOUT_MS = 8000;

function normalizeUrl(base) {
  return String(base || "").trim().replace(/\/$/, "");
}

function parseList(value) {
  return String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    return url;
  } catch {
    return null;
  }
}

function hostnameMatches(hostname, rule) {
  const host = String(hostname || "").toLowerCase();
  const domain = String(rule || "").replace(/^\*\./, "").toLowerCase();
  return Boolean(domain) && (host === domain || host.endsWith(`.${domain}`));
}

function domainTrust(hostname) {
  const host = String(hostname || "").toLowerCase();
  const highTrust = [".gov", ".gov.vn", ".edu", ".edu.vn", "who.int", "worldbank.org", "oecd.org", "developer.mozilla.org", "docs.python.org", "nodejs.org", "react.dev", "flutter.dev", "dart.dev", "github.com"];
  if (highTrust.some((domain) => host.endsWith(domain) || host === domain.replace(/^\./, ""))) return 0.9;
  return 0.65;
}

export function webSearchEnabled() {
  return Boolean(normalizeUrl(process.env.SEARXNG_URL || process.env.WEB_SEARCH_URL));
}

export function shouldSearchWeb(query = "") {
  if (!webSearchEnabled()) return false;
  if (process.env.WEB_SEARCH_ALWAYS === "true") return true;
  const text = String(query).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /\b(moi nhat|hom nay|hien tai|bay gio|cap nhat|internet|tren web|tim kiem|tra web|gia bao nhieu|phien ban moi|lich thi dau|thoi tiet|ty gia|latest|today|current|recent|news|web|internet|search|price|weather|version|release)\b/.test(text);
}

export function normalizeWebResults(results = [], query = "", limit = 5) {
  const allow = parseList(process.env.WEB_SEARCH_ALLOW_DOMAINS);
  const block = new Set([...parseList(process.env.WEB_SEARCH_BLOCK_DOMAINS), "pinterest.com", "quora.com"]);
  const maxPerDomain = Math.max(1, Number(process.env.WEB_SEARCH_MAX_PER_DOMAIN) || 2);
  const seenUrls = new Set();
  const domainCounts = new Map();
  const selected = [];

  for (const item of Array.isArray(results) ? results : []) {
    if (selected.length >= Math.max(1, limit)) break;
    const parsed = safeHttpUrl(item?.url);
    if (!parsed) continue;
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (allow.length && !allow.some((rule) => hostnameMatches(hostname, rule))) continue;
    if ([...block].some((rule) => hostnameMatches(hostname, rule))) continue;
    const canonical = parsed.toString().replace(/\/$/, "");
    if (seenUrls.has(canonical)) continue;
    const count = domainCounts.get(hostname) || 0;
    if (count >= maxPerDomain) continue;

    const title = String(item?.title || "").trim();
    const content = String(item?.content || item?.snippet || title || "").trim();
    if (!title && !content) continue;
    const trust = domainTrust(hostname);
    const score = Math.max(0.35, Math.min(0.95, trust - selected.length * 0.04));
    const publishedAt = item?.publishedDate || item?.published_at || item?.date || null;

    seenUrls.add(canonical);
    domainCounts.set(hostname, count + 1);
    selected.push({
      id: `web:${selected.length}:${canonical}`,
      sourceId: canonical,
      sourceType: "web",
      question: title || query,
      answer: content,
      text: content,
      url: canonical,
      title: title || null,
      domain: hostname,
      publishedAt,
      timestamp: publishedAt,
      trust,
      score,
      similarity: score,
      verified: false,
    });
  }
  return selected;
}

export async function searchWeb(query, limit = 5) {
  if (!webSearchEnabled() || !String(query || "").trim()) return [];
  const base = normalizeUrl(process.env.SEARXNG_URL || process.env.WEB_SEARCH_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.WEB_SEARCH_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  try {
    const url = new URL(`${base}/search`);
    url.searchParams.set("q", String(query).slice(0, 500));
    url.searchParams.set("format", "json");
    url.searchParams.set("language", process.env.WEB_SEARCH_LANGUAGE || "vi-VN");
    if (process.env.WEB_SEARCH_CATEGORIES) url.searchParams.set("categories", process.env.WEB_SEARCH_CATEGORIES);
    if (process.env.WEB_SEARCH_TIME_RANGE) url.searchParams.set("time_range", process.env.WEB_SEARCH_TIME_RANGE);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Kikial/2.0" },
    });
    if (!response.ok) throw new Error(`WEB_SEARCH_HTTP_${response.status}`);
    const data = await response.json();
    return normalizeWebResults(data.results, query, limit);
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.warn(`[WEB] ${error.name || "ERROR"}: ${error.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
