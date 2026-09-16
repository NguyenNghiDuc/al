import { calculate } from '../../lib/calculator.js';
import {
  findRelevantKnowledge,
  findUserMemory,
  learn,
  rememberUser,
} from '../../lib/learningMemory.js';
import { askAI } from '../services/aiService.js';

function rememberFromQuestion(email, question) {
  if (!email) return null;

  const patterns = [
    {
      pattern: /(?:tôi tên là|tên tôi là|mình tên là)\s+([^,.!?]+)/i,
      format: (value) => `Tên người dùng là ${value.trim()}.`,
    },
    {
      pattern: /(?:nhớ rằng|ghi nhớ rằng)\s+(?:tôi|mình)\s+(.+)/i,
      format: (value) => `Người dùng ${value.trim()}.`,
    },
    {
      pattern: /(?:tôi|mình)\s+(?:đang học|thích học|thích)\s+(.+)/i,
      format: (value) => `Người dùng ${value.trim()}.`,
    },
  ];

  for (const { pattern, format } of patterns) {
    const match = question.match(pattern);
    if (match?.[1]) return rememberUser(email, format(match[1]));
  }

  return null;
}

export async function handleChat({ body, answerQuestion }) {
  const { message, history = [], userEmail = '' } = body;
  const question = String(message || '').trim();
  const email = String(userEmail).trim().toLowerCase();

  if (!question) {
    const error = new Error('Vui lòng nhập câu hỏi.');
    error.statusCode = 400;
    throw error;
  }

  const calculation = calculate(question);
  const safeHistory = Array.isArray(history)
    ? history
        .filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item?.content === 'string')
        .slice(-12)
    : [];
  const relevantKnowledge = calculation ? [] : findRelevantKnowledge(question);
  const personalMemory = findUserMemory(email);
  const answer = calculation?.answer || await askAI(
    question,
    safeHistory,
    relevantKnowledge,
    (prompt) => answerQuestion(prompt, relevantKnowledge),
    personalMemory,
  );

  if (!calculation) await learn(question, answer);
  await rememberFromQuestion(email, question);

  return { answer, calculated: Boolean(calculation) };
}
