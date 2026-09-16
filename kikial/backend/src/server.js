import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculate } from '../lib/calculator.js';
import { askAI } from './services/aiService.js';
import { getUser, requireAdmin, signToken } from './middleware/auth.js';
import {
	findRelevantKnowledge,
	findUserMemory,
	getKnowledge,
	getLearned,
	initializeMemory,
	knowledgeCount,
	learn,
	learnedCount,
	markHit,
	pendingCount,
	promoteToKnowledge,
	rememberUser,
	removeItem,
	verifyLearned
} from '../lib/learningMemory.js';

const port = Number(process.env.PORT) || 4000;
const webDirectory = join(fileURLToPath(new URL('../../web/', import.meta.url)));
const userDataDirectory = join(fileURLToPath(new URL('../data/', import.meta.url)));
const userDataPath = join(userDataDirectory, 'users.json');
const contentTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8'
};
const users = new Map();

const hashPassword = (password, salt = randomBytes(16).toString('hex')) => {
	const hash = scryptSync(password, salt, 64).toString('hex');
	return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
	const [salt, expectedHash] = String(storedHash || '').split(':');
	if (!salt || !expectedHash) return false;
	const actualHash = scryptSync(password, salt, 64);
	const expectedBuffer = Buffer.from(expectedHash, 'hex');
	return actualHash.length === expectedBuffer.length && timingSafeEqual(actualHash, expectedBuffer);
};

const saveUsers = async () => {
	await mkdir(userDataDirectory, { recursive: true });
	await writeFile(userDataPath, JSON.stringify(Object.fromEntries(users), null, 2));
};

const loadUsers = async () => {
	try {
		const storedUsers = JSON.parse(await readFile(userDataPath, 'utf8'));
		Object.entries(storedUsers).forEach(([email, user]) => users.set(email.toLowerCase(), user));
	} catch {
		users.set('demo@kikial.local', { name: 'Nguyễn Nghị Đức', password: hashPassword('123456'), role: 'user' });
	}

	const admin = users.get('admin@kikial.local');

	if (!admin) {
		users.set('admin@kikial.local', {
			name: 'Admin Kikial',
			password: hashPassword('admin123'),
			role: 'admin'
		});
	} else if (admin.role !== 'admin') {
		users.set('admin@kikial.local', { ...admin, role: 'admin' });
	}

	await saveUsers();
};

const send = (response, status, body, contentType = 'text/plain; charset=utf-8') => {
	response.writeHead(status, { 'Content-Type': contentType });
	response.end(body);
};

const sendJson = (response, status, payload) =>
	send(response, status, JSON.stringify(payload), contentTypes['.json']);

const readJson = async (request) => {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		// Chặn body quá lớn
		if (body.length > 1_000_000) throw new Error('payload-too-large');
	}
	return JSON.parse(body || '{}');
};

// ======================================================
// FALLBACK
// Trả về { answer, source } để biết câu nào KHÔNG được học.
// ======================================================

const answerQuestion = (question, relevantKnowledge = []) => {
	const best = relevantKnowledge[0];

	// Ngưỡng đã chuẩn hoá (0..1) trong learningMemory
	if (best && best.score >= 0.45) {
		markHit(best.id);
		return { answer: best.answer, source: 'knowledge' };
	}

	const normalizedQuestion = question.toLowerCase();
	const canned = (answer) => ({ answer, source: 'canned' });

	if (normalizedQuestion.includes('async') || normalizedQuestion.includes('await')) {
		return canned('async/await giúp viết code bất đồng bộ theo cách dễ đọc hơn. Hàm có async luôn trả về Promise, còn await tạm dừng trong hàm async cho đến khi Promise hoàn tất. Ví dụ: async function loadData() { const response = await fetch("/api/data"); return response.json(); }');
	}
	if (normalizedQuestion.includes('tiếng anh') || normalizedQuestion.includes('tieng anh')) {
		return canned('Bạn có thể bắt đầu với 30 phút mỗi ngày: 10 phút học từ mới, 10 phút nghe một đoạn ngắn và 10 phút viết hoặc nói lại bằng từ của mình. Hãy duy trì một chủ đề nhỏ mỗi tuần để thấy tiến bộ rõ hơn.');
	}
	if (normalizedQuestion.includes('ý tưởng') || normalizedQuestion.includes('ung dung') || normalizedQuestion.includes('ứng dụng')) {
		return canned('Một ý tưởng phù hợp để bắt đầu là trợ lý học tập cá nhân: người dùng tải tài liệu lên, đặt câu hỏi và nhận câu trả lời kèm trích dẫn. Hãy làm bản đầu tiên thật nhỏ với đăng nhập, tải tài liệu và chat.');
	}
	if (normalizedQuestion.includes('xin chào') || normalizedQuestion.includes('hello') || normalizedQuestion.includes('chào')) {
		return canned('Chào bạn. Mình là Kikial. Bạn muốn cùng học, viết code hay phát triển một ý tưởng hôm nay?');
	}
	if (normalizedQuestion.includes('tên gì') || normalizedQuestion.includes('tên là gì') || normalizedQuestion.includes('name')) {
		return canned('Mình là Kikial, trợ lý AI local của bạn.');
	}
	if (normalizedQuestion === 'helo' || normalizedQuestion === 'hi' || normalizedQuestion === 'hey') {
		return canned('Chào bạn. Mình là Kikial. Bạn muốn hỏi về code, học tập hay một ý tưởng mới?');
	}
	if (normalizedQuestion.includes('code') || normalizedQuestion.includes('lập trình') || normalizedQuestion.includes('javascript')) {
		return canned('Mình có thể giúp bạn viết, giải thích và sửa code. Hãy gửi đoạn code hoặc mô tả mục tiêu, lỗi đang gặp và kết quả bạn mong muốn để mình phân tích từng bước.');
	}

	return canned(`Mình chưa có đủ dữ liệu chắc chắn để trả lời câu hỏi “${question}”. Bạn có thể cung cấp thêm ngữ cảnh hoặc tài liệu để mình học câu trả lời chính xác hơn.`);
};

await loadUsers();
await initializeMemory();

const server = createServer(async (request, response) => {
	const requestPath = request.url?.split('?')[0] || '/';

	if (requestPath === '/api/health') {
		sendJson(response, 200, {
			ok: true,
			service: 'kikial-backend',
			knowledgeItems: knowledgeCount(),
			learnedItems: learnedCount(),
			pendingItems: pendingCount()
		});
		return;
	}

	// ==================================================
	// AUTH
	// ==================================================

	if (request.method === 'POST' && requestPath === '/api/auth/login') {
		try {
			const { email, password } = await readJson(request);
			const emailKey = String(email || '').trim().toLowerCase();
			const user = users.get(emailKey);

			if (!user || !verifyPassword(String(password || ''), user.password)) {
				sendJson(response, 401, { ok: false, message: 'Email hoặc mật khẩu không đúng.' });
				return;
			}

			const role = user.role || 'user';

			sendJson(response, 200, {
				ok: true,
				token: signToken({ email: emailKey, role, name: user.name }),
				user: { name: user.name, email: emailKey, role }
			});
		} catch {
			sendJson(response, 400, { ok: false, message: 'Dữ liệu đăng nhập không hợp lệ.' });
		}
		return;
	}

	if (request.method === 'POST' && requestPath === '/api/auth/register') {
		try {
			const { name, email, password } = await readJson(request);
			const normalizedEmail = String(email || '').trim().toLowerCase();
			const normalizedName = String(name || '').trim();

			if (!normalizedName || !normalizedEmail.includes('@') || String(password || '').length < 6) {
				sendJson(response, 400, { ok: false, message: 'Vui lòng nhập đủ thông tin và mật khẩu từ 6 ký tự.' });
				return;
			}
			if (users.has(normalizedEmail)) {
				sendJson(response, 409, { ok: false, message: 'Email này đã được đăng ký.' });
				return;
			}

			// role bị thiếu ở bản cũ -> user.role là undefined
			users.set(normalizedEmail, { name: normalizedName, password: hashPassword(password), role: 'user' });
			await saveUsers();

			sendJson(response, 201, {
				ok: true,
				token: signToken({ email: normalizedEmail, role: 'user', name: normalizedName }),
				user: { name: normalizedName, email: normalizedEmail, role: 'user' }
			});
		} catch {
			sendJson(response, 400, { ok: false, message: 'Dữ liệu đăng ký không hợp lệ.' });
		}
		return;
	}

	// ==================================================
	// CHAT
	// ==================================================

	if (request.method === 'POST' && requestPath === '/api/chat') {
		try {
			const { message, history = [] } = await readJson(request);
			const question = String(message || '').trim();

			// Email lấy từ token, KHÔNG lấy từ body (tránh đọc memory người khác)
			const account = getUser(request);
			const emailKey = account?.email || '';

			if (!question) {
				sendJson(response, 400, { ok: false, message: 'Vui lòng nhập câu hỏi.' });
				return;
			}

			const calculation = calculate(question);
			const safeHistory = Array.isArray(history)
				? history.filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item?.content === 'string').slice(-12)
				: [];
			const relevantKnowledge = calculation ? [] : findRelevantKnowledge(question);
			const personalMemory = findUserMemory(emailKey);

			let answer;
			let source;
			let learnedId = null;

			if (calculation) {
				answer = calculation.answer;
				source = 'calc';
			} else {
				try {
					answer = await askAI(
						question,
						safeHistory,
						relevantKnowledge,
						() => {
							// Chưa cấu hình AI -> ném để rơi xuống fallback bên dưới
							throw new Error('ai-not-configured');
						},
						personalMemory
					);
					source = 'ai';
				} catch (error) {
					// Bản cũ: askAI lỗi -> cả request trả 400.
					console.warn('[Kikial] AI lỗi, dùng fallback:', error.message);
					const fallback = answerQuestion(question, relevantKnowledge);
					answer = fallback.answer;
					source = fallback.source;
				}
			}

			// CHỈ học câu do AI thật sinh ra, và phải chờ duyệt.
			if (source === 'ai') {
				const result = await learn(question, answer);
				learnedId = result.id || null;
			}

			const nameMatch = question.match(/(?:tôi tên là|tên tôi là|mình tên là|t tên là|tên mình là)\s+([^,.!?\n]+)/i);
			if (emailKey && nameMatch?.[1]) {
				await rememberUser(emailKey, `Tên người dùng là ${nameMatch[1].trim()}.`);
			}

			sendJson(response, 200, { ok: true, answer, source, learnedId });
		} catch (error) {
			console.error('[Kikial] /api/chat lỗi:', error.message);
			sendJson(response, 400, { ok: false, message: 'Không thể xử lý câu hỏi.' });
		}
		return;
	}

	// ==================================================
	// FEEDBACK — nút 👍 duyệt câu trả lời thành kiến thức
	// ==================================================

	if (request.method === 'POST' && requestPath === '/api/chat/feedback') {
		try {
			const { id, helpful } = await readJson(request);

			if (!id) {
				sendJson(response, 400, { ok: false, message: 'Thiếu mã bản ghi.' });
				return;
			}

			if (helpful === false) {
				const removed = await removeItem(id);
				sendJson(response, 200, { ok: true, removed: Boolean(removed) });
				return;
			}

			const verified = await verifyLearned(id, true);
			sendJson(response, verified ? 200 : 404, {
				ok: verified,
				message: verified ? 'Đã duyệt kiến thức.' : 'Không tìm thấy bản ghi.'
			});
		} catch {
			sendJson(response, 400, { ok: false, message: 'Dữ liệu phản hồi không hợp lệ.' });
		}
		return;
	}

	// ==================================================
	// ADMIN (yêu cầu role admin)
	// ==================================================

	if (requestPath.startsWith('/api/admin/')) {
		if (!requireAdmin(request)) {
			sendJson(response, 403, { ok: false, message: 'Bạn không có quyền truy cập.' });
			return;
		}

		if (request.method === 'GET' && requestPath === '/api/admin/knowledge') {
			// Trả cả 2 kho: seed + tự học (bản cũ chỉ trả knowledge.json)
			sendJson(response, 200, {
				ok: true,
				items: [...getLearned(), ...getKnowledge()],
				counts: {
					knowledge: knowledgeCount(),
					learned: learnedCount(),
					pending: pendingCount()
				}
			});
			return;
		}

		if (request.method === 'POST' && requestPath === '/api/admin/knowledge/verify') {
			try {
				const { id, verified = true, promote = false } = await readJson(request);
				const ok = promote ? await promoteToKnowledge(id) : await verifyLearned(id, verified);
				sendJson(response, ok ? 200 : 404, {
					ok,
					message: ok ? 'Đã cập nhật.' : 'Không tìm thấy bản ghi.'
				});
			} catch {
				sendJson(response, 400, { ok: false, message: 'Dữ liệu không hợp lệ.' });
			}
			return;
		}

		if (request.method === 'DELETE' && requestPath.startsWith('/api/admin/knowledge/')) {
			try {
				const id = decodeURIComponent(requestPath.split('/').pop() || '');

				if (!id) {
					sendJson(response, 400, { ok: false, message: 'Thiếu mã bản ghi cần xóa.' });
					return;
				}

				const store = await removeItem(id);

				if (!store) {
					sendJson(response, 404, { ok: false, message: 'Không tìm thấy bản ghi.' });
					return;
				}

				sendJson(response, 200, { ok: true, store, message: 'Đã xoá ghi nhớ.' });
			} catch {
				sendJson(response, 500, { ok: false, message: 'Không xoá được bản ghi.' });
			}
			return;
		}

		sendJson(response, 404, { ok: false, message: 'Không tìm thấy endpoint.' });
		return;
	}

	// ==================================================
	// STATIC
	// ==================================================

	if (requestPath === '/' || requestPath === '/index.html') {
		response.writeHead(302, { Location: 'http://localhost:5173/' });
		response.end();
		return;
	}

	const pageRoutes = {
		'/login.html': '/pages/login.html',
		'/register.html': '/pages/register.html'
	};
	const relativePath = pageRoutes[requestPath] || requestPath;
	const filePath = normalize(join(webDirectory, relativePath));

	if (!filePath.startsWith(webDirectory)) {
		send(response, 403, 'Forbidden');
		return;
	}

	try {
		const content = await readFile(filePath);
		send(response, 200, content, contentTypes[extname(filePath)] || 'application/octet-stream');
	} catch {
		send(response, 404, 'Not found');
	}
});

server.listen(port, () => {
	console.log(`Kikial đang chạy tại http://localhost:${port}`);
});
