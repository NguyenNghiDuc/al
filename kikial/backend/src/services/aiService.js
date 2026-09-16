const defaultApiUrl = 'https://api.openai.com/v1/chat/completions';

export const askAI = async (question, history = [], knowledge = [], fallback) => {
    const apiKey = process.env.AI_API_KEY;
    const apiUrl = process.env.AI_API_URL;
    if (!apiKey && !apiUrl) return fallback(question);

    const learnedContext = knowledge.length > 0
        ? `\n\nKinh nghiệm đã học từ các cuộc trò chuyện trước:\n${knowledge.map((item) => `- Hỏi: ${item.question}\n  Đáp: ${item.answer}`).join("\n")}`
        : "";

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(apiUrl || defaultApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: process.env.AI_MODEL || 'gpt-4o-mini',
            temperature: 0.4,
            messages: [
                {
                    role: 'system',
                    content: `Bạn là Kikial, một trợ lý AI hữu ích. Hãy nhớ ngữ cảnh cuộc trò chuyện và sử dụng kinh nghiệm liên quan đã học, nhưng không bịa thông tin. Trả lời bằng tiếng Việt rõ ràng, chính xác, có cấu trúc. Nếu câu hỏi cần code, hãy dùng ví dụ ngắn và dễ chạy.${learnedContext}`
                },
                ...history.slice(-12),
                { role: 'user', content: question }
            ]
        }),
        signal: AbortSignal.timeout(30000)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'AI provider request failed');

    const answer = result.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('AI provider returned an empty answer');
    return answer;
};
