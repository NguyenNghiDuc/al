export function buildConversationSummary(history = []) {
  const safe = Array.isArray(history) ? history.filter((item) => ["user", "assistant"].includes(item?.role) && typeof item.content === "string") : [];
  if (safe.length <= 4) return "";
  return safe.slice(0, -4).map((item) => `${item.role}: ${item.content.slice(0, 300)}`).join("\n").slice(0, 1800);
}

export function normalizeHistory(history = []) {
  return (Array.isArray(history) ? history : []).filter((item) => ["user", "assistant"].includes(item?.role) && typeof item.content === "string").slice(-12).map((item) => ({ role: item.role, content: item.content.slice(0, 6000) }));
}
