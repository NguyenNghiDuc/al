import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const secret = process.env.AUTH_SECRET || randomBytes(32).toString("hex");

if (!process.env.AUTH_SECRET) {
	console.warn(
		"[Kikial Auth] Chưa có AUTH_SECRET — token sẽ mất hiệu lực khi restart server.",
	);
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const base64url = (input) => Buffer.from(input).toString("base64url");
const sign = (payload) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signToken({ email, role = "user", name = "" }) {
	const payload = base64url(JSON.stringify({
		email: String(email).trim().toLowerCase(),
		role,
		name,
		exp: Date.now() + TOKEN_TTL_MS,
	}));

	return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
	const raw = String(token || "").replace(/^Bearer\s+/i, "").trim();
	const [payload, signature] = raw.split(".");

	if (!payload || !signature) return null;

	const expected = Buffer.from(sign(payload));
	const actual = Buffer.from(signature);

	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

	try {
		const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
		if (!data?.email || !data?.exp || Date.now() > data.exp) return null;
		return data;
	} catch {
		return null;
	}
}

export function getUser(request) {
	return verifyToken(request.headers?.authorization);
}

export function requireAdmin(request) {
	const user = getUser(request);
	return user?.role === "admin" ? user : null;
}
