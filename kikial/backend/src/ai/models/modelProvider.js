export class ModelProvider {
  async generate() { throw new Error("MODEL_PROVIDER_NOT_IMPLEMENTED"); }
  async stream() { throw new Error("MODEL_PROVIDER_NOT_IMPLEMENTED"); }
  async embed() { throw new Error("EMBEDDING_NOT_IMPLEMENTED"); }
  async health() { return { online: false }; }
  supportsTools() { return false; }
}
