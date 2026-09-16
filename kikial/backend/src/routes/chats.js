import { handleChat } from '../controllers/chatController.js';

export async function handleChatRoute({ request, response, readJson, send, contentType, answerQuestion }) {
  try {
    const result = await handleChat({
      body: await readJson(request),
      answerQuestion,
    });
    send(response, 200, JSON.stringify({ ok: true, ...result }), contentType);
  } catch (error) {
    console.error('[CHAT ERROR]', error);
    send(
      response,
      error.statusCode || 500,
      JSON.stringify({
        ok: false,
        message: error.message || 'Không thể xử lý câu hỏi.',
      }),
      contentType,
    );
  }
}
