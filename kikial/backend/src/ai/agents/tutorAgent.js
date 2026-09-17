export function tutorAgent(topic, level = "beginner") {
  return { agent: "tutor", topic: String(topic).slice(0, 500), level, style: "đi từ cơ bản, có ví dụ ngắn, chỉ mở rộng khi cần" };
}
