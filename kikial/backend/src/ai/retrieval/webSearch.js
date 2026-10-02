const DEFAULT_TIMEOUT_MS = 8000;

function normalizeUrl(base) {
  return String(base || "").trim().replace(/\/$/, "");
}

export function webSearchEnabled() {
  return Boolean(normalizeUrl(process.env.SEARXNG_URL || process.env.WEB_SEARCH_URL));
}

export function shouldSearchWeb(query = "") {
  if (!webSearchEnabled()) return false;
  if (process.env.WEB_SEARCH_ALWAYS === "true") return true;
  const text = String(query).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /\b(moi nhat|hom nay|hien tai|cap nhat|internet|tren web|tim kiem|gia bao nhieu|phien ban moi|latest|today|current|recent|news|web|internet|search)\b/.test(text);
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
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Kikial/1.0" },
    });
    if (!response.ok) throw new Error(`WEB_SEARCH_HTTP_${response.status}`);
    const data = await response.json();
    return (Array.isArray(data.results) ? data.results : []).slice(0, Math.max(1, limit)).map((item, index) => ({
      id: `web:${index}:${item.url || item.title || query}`,
      sourceId: item.url || `web:${index}`,
      sourceType: "web",
      question: item.title || query,
      answer: item.content || item.title || "",
      text: item.content || item.title || "",
      url: item.url || null,
      title: item.title || null,
      score: Math.max(0.35, 0.9 - index * 0.08),
      similarity: Math.max(0.35, 0.9 - index * 0.08),
      verified: false,
    }));
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.warn(`[WEB] ${error.name || "ERROR"}: ${error.message}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
