import { ModelProvider } from "./modelProvider.js";

const timeoutSignal = (timeoutMs) => AbortSignal.timeout(Number(timeoutMs) || 30000);

export class OpenAICompatibleProvider extends ModelProvider {
  constructor({ baseUrl, model, embeddingModel, temperature, timeoutMs, apiKey }) {
    super();
    this.baseUrl = String(baseUrl || "http://127.0.0.1:1234/v1").replace(/\/$/, "");
    this.model = model || "local-model";
    this.embeddingModel = embeddingModel || this.model;
    this.temperature = Number.isFinite(Number(temperature)) ? Number(temperature) : 0.3;
    this.timeoutMs = Number(timeoutMs) || 30000;
    this.apiKey = String(apiKey || "").trim();
  }

  headers() {
    const headers = { "content-type": "application/json", accept: "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  async request(path, body, timeoutMs = this.timeoutMs) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: timeoutSignal(timeoutMs),
      });
    } catch (error) {
      const wrapped = new Error(`OpenAI-compatible provider không khả dụng: ${error.message}`);
      wrapped.code = "MODEL_OFFLINE";
      throw wrapped;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || data?.message || `Provider trả về ${response.status}`;
      const error = new Error(message);
      error.code = response.status >= 500 ? "MODEL_ERROR" : "MODEL_CONFIG_ERROR";
      throw error;
    }
    return data;
  }

  async generate({ messages, temperature = this.temperature, tools = undefined }) {
    const data = await this.request("/chat/completions", {
      model: this.model,
      messages,
      temperature,
      stream: false,
      ...(tools ? { tools } : {}),
    });
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Model trả về câu trả lời rỗng.");
    return { content, raw: data, model: data.model || this.model };
  }

  async embed(input) {
    const values = Array.isArray(input) ? input : [input];
    const data = await this.request("/embeddings", {
      model: this.embeddingModel,
      input: values,
    }, Math.max(this.timeoutMs, 15000));
    return Array.isArray(data.data) ? data.data.sort((a, b) => a.index - b.index).map((item) => item.embedding) : [];
  }

  async health() {
    try {
      const response = await fetch(`${this.baseUrl}/models`, { headers: this.headers(), signal: timeoutSignal(3000) });
      const data = await response.json().catch(() => ({}));
      const models = Array.isArray(data.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
      return { online: response.ok, model: this.model, embeddingModel: this.embeddingModel, models };
    } catch {
      return { online: false, model: this.model, embeddingModel: this.embeddingModel, models: [] };
    }
  }

  supportsTools() {
    return true;
  }
}
