const clamp = (value, limit) => String(value || "").slice(0, limit);

export function buildConversationSummary(history = []) {
  const safe = Array.isArray(history)
    ? history.filter((item) => ["user", "assistant"].includes(item?.role) && typeof item.content === "string")
    : [];

  if (!safe.length) return "";

  // Keep both older context and the most recent exchanges. The previous version
  // removed the last four turns entirely, while modelAnswer only forwarded four
  // heavily truncated messages. That made short follow-ups lose crucial context.
  const older = safe.slice(0, -6)
    .map((item) => `${item.role}: ${clamp(item.content, 500)}`)
    .join("\n");
  const recent = safe.slice(-6)
    .map((item) => `${item.role}: ${clamp(item.content, 1000)}`)
    .join("\n");

  const sections = [];
  if (older) sections.push(`OLDER CONTEXT:\n${older}`);
  if (recent) sections.push(`RECENT CONTEXT:\n${recent}`);
  return sections.join("\n\n").slice(-6000);
}

export function normalizeHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((item) => ["user", "assistant"].includes(item?.role) && typeof item.content === "string")
    .slice(-20)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 8000) }));
}
