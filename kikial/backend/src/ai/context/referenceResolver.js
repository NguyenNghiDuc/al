const normalize = (value) => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
const knownEntities = ["Flutter", "React Native", "Node.js", "Express", "JavaScript", "Dart", "Promise", "Kikial", "authentication"];

export function resolveReference(message, history = [], summary = "") {
  const text = normalize(message);
  const context = [...history.slice(-8).map((item) => item.content || ""), summary].join(" ");
  const mentioned = knownEntities.filter((entity) => normalize(context).includes(normalize(entity)));
  const reference = /\b(no|do|vay|cai nay|cai do|doan kia|phan con lai|file luc nay|tiep|lam tiep)\b/i.test(text);
  if (!reference) return { query: message, references: [], ambiguous: false };
  const entities = [...new Set(mentioned)];
  if (!entities.length) return { query: message, references: [], ambiguous: true };
  return { query: `${message} trong ngữ cảnh ${entities.join(" và ")}`, references: entities.map((entity) => ({ text: message, entity, confidence: 0.85 })), ambiguous: false };
}

export function extractEntities(message, history = []) {
  const context = normalize([...history.map((item) => item.content || ""), message].join(" "));
  return knownEntities.filter((entity) => context.includes(normalize(entity))).map((canonicalName) => ({ id: normalize(canonicalName).replace(/\s+/g, "-"), canonicalName, aliases: [], type: "technology", lastMentionedAt: new Date().toISOString() }));
}
