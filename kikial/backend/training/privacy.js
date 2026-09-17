const secret = /(?:password|mật khẩu|token|api[_ -]?key|auth_secret|bearer\s+[a-z0-9._-]+|otp)\s*[:=]?\s*\S+/i;
const pii = /(?:\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\+\d[\d\s-]{7,}\d|\b\d{9,}\b)/i;

export function privacyCheck(example) {
  const text = JSON.stringify(example || {});
  const reasons = [];
  if (secret.test(text)) reasons.push("secret_pattern");
  if (pii.test(text)) reasons.push("pii_pattern");
  if (text.length > 50000) reasons.push("oversized");
  if (example?.source === "USER_MEMORY" || example?.source === "PRIVATE_DOCUMENT") reasons.push("private_source");
  return { safe: reasons.length === 0, reasons };
}
