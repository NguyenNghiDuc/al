import { orchestrate } from '../ai/orchestrator.js';

const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH) || 12000;
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES) || 12;
const MAX_HISTORY_CHARS = Number(process.env.MAX_HISTORY_CHARS) || 48000;

export async function handleChat({ body, user, traceId }) {
  if (!user?.email) {
    const error = new Error('Bạn cần đăng nhập để trò chuyện.');
    error.statusCode = 401;
    error.code = 'AUTH_ERROR';
    throw error;
  }

  const question = String(body?.message || '').trim();
  if (!question || question.length > MAX_MESSAGE_LENGTH) {
    const error = new Error(question ? `Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự.` : 'Vui lòng nhập câu hỏi.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  const history = Array.isArray(body?.history) ? body.history
    .filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string')
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({ role: item.role, content: item.content.slice(0, Math.floor(MAX_HISTORY_CHARS / MAX_HISTORY_MESSAGES)) })) : [];

  return orchestrate({ userId: user.email, message: question, history, traceId });
}
