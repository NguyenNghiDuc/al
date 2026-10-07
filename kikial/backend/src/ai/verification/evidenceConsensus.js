const norm = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function domainOf(item) {
  if (item?.domain) return String(item.domain).toLowerCase();
  try { return new URL(String(item?.url || item?.sourceId || "")).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

function extractVersionSignals(text) {
  const source = String(text || "");
  const values = new Set();
  for (const match of source.matchAll(/\b(?:v(?:ersion)?\s*)?(\d{1,3}\.\d{1,3}(?:\.\d{1,3})?)\b/gi)) values.add(match[1]);
  return [...values];
}

function extractYearSignals(text) {
  const values = new Set();
  for (const match of String(text || "").matchAll(/\b(20\d{2})\b/g)) values.add(match[1]);
  return [...values];
}

function claimSignals(item, query) {
  const text = `${item?.title || ""} ${item?.text || item?.content || item?.answer || ""}`;
  const q = norm(query);
  const signals = {};
  if (/version|phien ban|release/.test(q)) signals.version = extractVersionSignals(text);
  if (/nam nao|year|ngay|date|khi nao|moi nhat|latest|current|hien tai/.test(q)) signals.year = extractYearSignals(text);
  return signals;
}

export function assessEvidenceConsensus(evidence = [], query = "") {
  const web = (Array.isArray(evidence) ? evidence : []).filter((item) => String(item?.sourceType || "").toLowerCase() === "web");
  const domains = [...new Set(web.map(domainOf).filter(Boolean))];
  const trustedDomains = [...new Set(web.filter((item) => Number(item?.trust || 0) >= 0.8).map(domainOf).filter(Boolean))];
  const signalGroups = new Map();

  for (const item of web) {
    const signals = claimSignals(item, query);
    for (const [kind, values] of Object.entries(signals)) {
      for (const value of values) {
        const key = `${kind}:${value}`;
        if (!signalGroups.has(key)) signalGroups.set(key, new Set());
        const domain = domainOf(item) || String(item?.sourceId || "unknown");
        signalGroups.get(key).add(domain);
      }
    }
  }

  const byKind = {};
  for (const [key, sources] of signalGroups) {
    const [kind, value] = key.split(":");
    byKind[kind] ||= [];
    byKind[kind].push({ value, sources: [...sources] });
  }

  const conflicts = Object.entries(byKind)
    .filter(([, values]) => values.length > 1)
    .map(([kind, values]) => ({ kind, values }));

  const independentSources = domains.length;
  const corroborated = independentSources >= 2 && conflicts.length === 0;
  const singleSource = web.length > 0 && independentSources < 2;

  return {
    webSources: web.length,
    independentSources,
    trustedSources: trustedDomains.length,
    corroborated,
    singleSource,
    conflicts,
  };
}

export function consensusPrompt(consensus) {
  if (!consensus || consensus.webSources === 0) return "";
  if (consensus.conflicts?.length) {
    return "Các nguồn web đang có tín hiệu mâu thuẫn. Không được chọn một con số/phiên bản một cách tùy tiện; hãy nêu rõ điểm mâu thuẫn và ưu tiên nguồn chính thức, mới hơn.";
  }
  if (consensus.singleSource) {
    return "Thông tin web hiện chỉ có một nguồn độc lập. Tránh khẳng định quá chắc; nói rõ đây là thông tin từ một nguồn nếu chi tiết quan trọng.";
  }
  return "Có nhiều nguồn web độc lập và không phát hiện mâu thuẫn rõ ràng trong các tín hiệu chính.";
}
