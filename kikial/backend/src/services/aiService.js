const defaultApiUrl = 'https://api.openai.com/v1/chat/completions';

const MAX_KNOWLEDGE_ITEMS = 3;
const MAX_MEMORY_ITEMS = 10;
const MAX_ANSWER_CHARS = 400;

const trim = (text, limit) => {
    const value = String(text || '').trim();
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
};

export const askAI = async (question, history = [], knowledge = [], fallback, userMemory = []) => {
    const apiKey = process.env.AI_API_KEY;
    const apiUrl = process.env.AI_API_URL;
    if (!apiKey && !apiUrl) return fallback(question);

    const usableKnowledge = knowledge.slice(0, MAX_KNOWLEDGE_ITEMS);
    const learnedContext = usableKnowledge.length > 0
        ? `\n\nKiến thức đã duyệt, chỉ dùng nếu thực sự liên quan:\n${usableKnowledge
            .map((item) => `- Hỏi: ${trim(item.question, 200)}\n  Đáp: ${trim(item.answer, MAX_ANSWER_CHARS)}`)
            .join('\n')}`
        : '';
    const personalContext = userMemory.length > 0
        ? `\n\nThông tin cần nhớ về người dùng hiện tại:\n${userMemory
            .slice(-MAX_MEMORY_ITEMS)
            .map((item) => `- ${trim(item, 200)}`)
            .join('\n')}`
        : '';

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    let response;
    try {
        response = await fetch(apiUrl || defaultApiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: process.env.AI_MODEL || 'gpt-4o-mini',
                temperature: Number(process.env.AI_TEMPERATURE) || 0.4,
                messages: [
                    {
                        role: 'system',
                        content: `Bạn là Kikial, một trợ lý AI hữu ích. Hãy nhớ ngữ cảnh cuộc trò chuyện và dùng kiến thức liên quan đã học, nhưng tuyệt đối không bịa. Nếu không chắc, hãy nói thẳng là chưa chắc. Trả lời bằng tiếng Việt rõ ràng, chính xác, có cấu trúc. Nếu câu hỏi cần code, hãy dùng ví dụ ngắn và dễ chạy.${learnedContext}${personalContext}`
                    },
                    ...history.slice(-12),
                    { role: 'user', content: question }
                ]
            }),
            signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS) || 30000)
        });
    } catch (error) {
        throw new Error(`Không gọi được AI provider: ${error.message}`);
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || `AI provider trả về ${response.status}`);

    const answer = result.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('AI provider trả về câu trả lời rỗng');
    return answer;
};
