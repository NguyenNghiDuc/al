import { handleChat } from '../controllers/chatController.js';

export async function handleChatRoute({ request, response, readJson, send, contentType, user, traceId }) {
  try {
    const result = await handleChat({
      body: await readJson(request),
      user,
      traceId,
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
