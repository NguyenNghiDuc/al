import { ModelProvider } from "./modelProvider.js";

const timeoutSignal = (timeoutMs) => AbortSignal.timeout(Number(timeoutMs) || 30000);

export class OllamaProvider extends ModelProvider {
  constructor({ baseUrl, model, embeddingModel, temperature, timeoutMs }) {
    super();
    this.baseUrl = String(baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
    this.model = model || "llama3.2:3b";
    this.embeddingModel = embeddingModel || "nomic-embed-text";
    this.temperature = Number.isFinite(Number(temperature)) ? Number(temperature) : 0.3;
    this.timeoutMs = Number(timeoutMs) || 30000;
  }

  async request(path, body, timeoutMs = this.timeoutMs) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: timeoutSignal(timeoutMs),
      });
    } catch (error) {
      const wrapped = new Error(`Local Ollama không khả dụng: ${error.message}`);
      wrapped.code = "MODEL_OFFLINE";
      throw wrapped;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Ollama trả về ${response.status}`);
      error.code = response.status >= 500 ? "MODEL_ERROR" : "MODEL_CONFIG_ERROR";
      throw error;
    }
    return data;
  }

  async generate({ messages, temperature = this.temperature, tools = undefined }) {
    const data = await this.request("/api/chat", {
      model: this.model,
      messages,
      stream: false,
      options: { temperature },
      ...(tools ? { tools } : {}),
    });
    const content = data.message?.content?.trim();
    if (!content) throw new Error("Local model trả về câu trả lời rỗng.");
    return { content, raw: data, model: this.model };
  }

  async embed(input) {
    const values = Array.isArray(input) ? input : [input];
    const data = await this.request("/api/embed", {
      model: this.embeddingModel,
      input: values,
    }, Math.max(this.timeoutMs, 15000));
    return data.embeddings || (data.embedding ? [data.embedding] : []);
  }

  async health() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: timeoutSignal(2500) });
      const data = await response.json().catch(() => ({}));
      const models = Array.isArray(data.models) ? data.models.map((item) => item.name) : [];
      return {
        online: response.ok,
        model: this.model,
        embeddingModel: this.embeddingModel,
        models,
      };
    } catch {
      return { online: false, model: this.model, embeddingModel: this.embeddingModel, models: [] };
    }
  }
}
