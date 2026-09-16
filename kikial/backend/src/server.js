import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askAI } from './services/aiService.js';
import { findRelevantKnowledge, knowledgeCount, learn, loadKnowledge, saveKnowledge } from '../lib/learningMemory.js';

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
	const [salt, expectedHash] = storedHash.split(':');
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

const readJson = async (request) => {
	let body = '';
	for await (const chunk of request) body += chunk;
	return JSON.parse(body || '{}');
};

const answerQuestion = (question) => {
	const normalizedQuestion = question.toLowerCase();

	if (normalizedQuestion.includes('async') || normalizedQuestion.includes('await')) {
		return 'async/await giúp viết code bất đồng bộ theo cách dễ đọc hơn. Hàm có async luôn trả về Promise, còn await tạm dừng trong hàm async cho đến khi Promise hoàn tất. Ví dụ: async function loadData() { const response = await fetch("/api/data"); return response.json(); }';
	}
	if (normalizedQuestion.includes('tiếng anh') || normalizedQuestion.includes('tieng anh')) {
		return 'Bạn có thể bắt đầu với 30 phút mỗi ngày: 10 phút học từ mới, 10 phút nghe một đoạn ngắn và 10 phút viết hoặc nói lại bằng từ của mình. Hãy duy trì một chủ đề nhỏ mỗi tuần để thấy tiến bộ rõ hơn.';
	}
	if (normalizedQuestion.includes('ý tưởng') || normalizedQuestion.includes('ung dung') || normalizedQuestion.includes('ứng dụng')) {
		return 'Một ý tưởng phù hợp để bắt đầu là trợ lý học tập cá nhân: người dùng tải tài liệu lên, đặt câu hỏi và nhận câu trả lời kèm trích dẫn. Hãy làm bản đầu tiên thật nhỏ với đăng nhập, tải tài liệu và chat.';
	}
	if (normalizedQuestion.includes('xin chào') || normalizedQuestion.includes('hello') || normalizedQuestion.includes('chào')) {
		return 'Chào bạn. Mình là Kikial. Bạn muốn cùng học, viết code hay phát triển một ý tưởng hôm nay?';
	}
	if (normalizedQuestion.includes('tên gì') || normalizedQuestion.includes('tên là gì') || normalizedQuestion.includes('name')) {
		return 'Mình là Kikial, trợ lý AI local của bạn.';
	}
	if (normalizedQuestion === 'helo' || normalizedQuestion === 'hi' || normalizedQuestion === 'hey') {
		return 'Chào bạn. Mình là Kikial. Bạn muốn hỏi về code, học tập hay một ý tưởng mới?';
	}
	if (normalizedQuestion.includes('code') || normalizedQuestion.includes('lập trình') || normalizedQuestion.includes('javascript')) {
		return 'Mình có thể giúp bạn viết, giải thích và sửa code. Hãy gửi đoạn code hoặc mô tả mục tiêu, lỗi đang gặp và kết quả bạn mong muốn để mình phân tích từng bước.';
	}

	return `Mình đã nhận được câu hỏi: “${question}”. Đây là bản demo hỏi đáp của Kikial. Hãy hỏi cụ thể hơn về code, học tập hoặc một ý tưởng để mình trả lời sát hơn nhé.`;
};

await loadUsers();
await loadKnowledge();

const server = createServer(async (request, response) => {
	const requestPath = request.url?.split('?')[0] || '/';

	if (requestPath === '/api/health') {
		send(response, 200, JSON.stringify({ ok: true, service: 'kikial-backend', learnedItems: knowledgeCount() }), contentTypes['.json']);
		return;
	}

	if (request.method === 'POST' && requestPath === '/api/auth/login') {
		try {
			const { email, password } = await readJson(request);
			const emailKey = String(email || '').trim().toLowerCase();
			const user = users.get(emailKey);
			const validCredentials = user && verifyPassword(String(password || ''), user.password);

			if (!validCredentials) {
				send(response, 401, JSON.stringify({ ok: false, message: 'Email hoặc mật khẩu không đúng.' }), contentTypes['.json']);
				return;
			}

			send(response, 200, JSON.stringify({
				ok: true,
				token: `kikial-demo-session-${emailKey}`,
				user: { name: user.name, email: emailKey, role: user.role || 'user' }
			}), contentTypes['.json']);
		} catch {
			send(response, 400, JSON.stringify({ ok: false, message: 'Dữ liệu đăng nhập không hợp lệ.' }), contentTypes['.json']);
		}
		return;
	}

	if (request.method === 'POST' && requestPath === '/api/auth/register') {
		try {
			const { name, email, password } = await readJson(request);
			const normalizedEmail = String(email || '').trim().toLowerCase();
			const normalizedName = String(name || '').trim();

			if (!normalizedName || !normalizedEmail.includes('@') || String(password || '').length < 6) {
				send(response, 400, JSON.stringify({ ok: false, message: 'Vui lòng nhập đủ thông tin và mật khẩu từ 6 ký tự.' }), contentTypes['.json']);
				return;
			}
			if (users.has(normalizedEmail)) {
				send(response, 409, JSON.stringify({ ok: false, message: 'Email này đã được đăng ký.' }), contentTypes['.json']);
				return;
			}

			users.set(normalizedEmail, { name: normalizedName, password: hashPassword(password) });
			await saveUsers();
			send(response, 201, JSON.stringify({
				ok: true,
				token: `kikial-demo-session-${normalizedEmail}`,
				user: { name: normalizedName, email: normalizedEmail, role: 'user' }
			}), contentTypes['.json']);
		} catch {
			send(response, 400, JSON.stringify({ ok: false, message: 'Dữ liệu đăng ký không hợp lệ.' }), contentTypes['.json']);
		}
		return;
	}

	if (request.method === 'POST' && requestPath === '/api/chat') {
		try {
			const { message, history = [] } = await readJson(request);
			const question = String(message || '').trim();

			if (!question) {
				send(response, 400, JSON.stringify({ ok: false, message: 'Vui lòng nhập câu hỏi.' }), contentTypes['.json']);
				return;
			}

			const safeHistory = Array.isArray(history)
				? history.filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item?.content === 'string').slice(-12)
				: [];
			const relevantKnowledge = findRelevantKnowledge(question);
			const answer = await askAI(question, safeHistory, relevantKnowledge, answerQuestion);
			await learn(question, answer);
			send(response, 200, JSON.stringify({ ok: true, answer }), contentTypes['.json']);
		} catch {
			send(response, 400, JSON.stringify({ ok: false, message: 'Không thể xử lý câu hỏi.' }), contentTypes['.json']);
		}
		return;
	}

	if (request.method === 'GET' && requestPath === '/api/admin/knowledge') {
		try {
			const items = await loadKnowledge();
			send(response, 200, JSON.stringify({ ok: true, items: items || [] }), contentTypes['.json']);
		} catch {
			send(response, 500, JSON.stringify({ ok: false, message: 'Không tải được dữ liệu học tập.' }), contentTypes['.json']);
		}
		return;
	}

	if (request.method === 'DELETE' && requestPath.startsWith('/api/admin/knowledge/')) {
		try {
			const id = decodeURIComponent(requestPath.split('/').pop() || '');
			if (!id) {
				send(response, 400, JSON.stringify({ ok: false, message: 'Thiếu mã bản ghi cần xóa.' }), contentTypes['.json']);
				return;
			}

			const knowledge = await loadKnowledge();
			const index = knowledge.findIndex((item) => item.learnedAt === id);
			if (index === -1) {
				send(response, 404, JSON.stringify({ ok: false, message: 'Không tìm thấy bản ghi.' }), contentTypes['.json']);
				return;
			}

			knowledge.splice(index, 1);
			await saveKnowledge(knowledge);
			send(response, 200, JSON.stringify({ ok: true, message: 'Đã xoá ghi nhớ.' }), contentTypes['.json']);
		} catch {
			send(response, 500, JSON.stringify({ ok: false, message: 'Không xoá được bản ghi.' }), contentTypes['.json']);
		}
		return;
	}

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
