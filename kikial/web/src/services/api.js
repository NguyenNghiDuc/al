export async function api(path, options = {}) {
  const token = localStorage.getItem("kikial-token");
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch (error) {
    const wrapped = new Error(error.name === "AbortError" ? "Yêu cầu đã bị hủy." : "Không kết nối được máy chủ.");
    wrapped.name = error.name === "AbortError" ? "AbortError" : "NetworkError";
    wrapped.status = 0;
    throw wrapped;
  }

  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : { message: await response.text().catch(() => "") };

  if (!response.ok) {
    const error = new Error(result.message || result.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = result.code || "API_ERROR";
    error.traceId = result.traceId || null;
    throw error;
  }

  return result;
}
