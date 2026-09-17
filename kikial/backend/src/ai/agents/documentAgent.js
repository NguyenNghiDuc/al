export function documentAgent(chunks, question) {
  if (!chunks?.length) return { agent: "document", answer: "Tài liệu của bạn không chứa evidence phù hợp để trả lời câu hỏi này." };
  return { agent: "document", question, chunks: chunks.map((chunk) => ({ documentId: chunk.documentId, filename: chunk.filename, chunkIndex: chunk.chunkIndex, score: chunk.score })), answer: chunks.map((chunk) => chunk.text).join("\n\n") };
}
