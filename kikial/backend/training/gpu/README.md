# Kikial GPU QLoRA Training

This path performs real weight adaptation through LoRA/QLoRA. It is different from `training:prepare`, which only prepares datasets.

## Recommended GPU

- 16 GB VRAM: use the 3B fallback if the 7B model does not fit comfortably.
- 24 GB+ VRAM: recommended for Qwen2.5-7B-Instruct with 4-bit QLoRA.
- NVIDIA CUDA GPU is required by this script.

## 1. Prepare the reviewed dataset

From `kikial/backend`:

```bash
npm run training:prepare
npm run training:validate
npm run training:inspect
npm run training:export:sft
```

Expected dataset:

```text
training/exports/kikial-sft-v1.sft.jsonl (train split only)
```

## 2. Install GPU dependencies

Use a fresh CUDA-compatible Python environment:

```bash
python -m pip install -U pip
pip install -r training/gpu/requirements-gpu.txt
```

Qwen2.5-7B-Instruct is the recommended default. If you switch to a gated model such as Meta Llama, authenticate with Hugging Face first:

```bash
huggingface-cli login
```

## 3. Run QLoRA training

```bash
python training/gpu/qlora_train.py \
  --model Qwen/Qwen2.5-7B-Instruct \
  --dataset training/exports/kikial-sft-v1.sft.jsonl \
  --output training/models/kikial-qwen25-7b \
  --epochs 3 \
  --batch-size 1 \
  --grad-accum 8 \
  --max-seq-length 2048
```

To also save a merged Hugging Face model:

```bash
python training/gpu/qlora_train.py \
  --model Qwen/Qwen2.5-7B-Instruct \
  --dataset training/exports/kikial-sft-v1.sft.jsonl \
  --output training/models/kikial-qwen25-7b \
  --epochs 3 \
  --merge
```

The adapter is saved under:

```text
training/models/kikial-qwen25-7b/adapter
```

The merged model, when `--merge` is used, is saved under:

```text
training/models/kikial-qwen25-7b/merged
```

## 4. Important evaluation rule

Do not call the model improved only because training completed. Compare it on held-out eval cases, especially:
- short-topic prompts
- exact code-generation prompts
- follow-up/context prompts
- weak-RAG cases
- debugging tasks

Run `npm run training:export:eval` and keep validation/test examples out of training. Only promote the fine-tuned model if it beats the current model without regressions.

## 5. Ollama deployment

After training with `--merge`, use the bundled deployment script:

```bash
chmod +x training/gpu/export_ollama.sh
training/gpu/export_ollama.sh \
  training/models/kikial-qwen25-7b/merged \
  kikial:7b \
  ../llama.cpp
```

The script converts the merged Hugging Face model to GGUF, quantizes to Q4_K_M, creates an Ollama model, and runs a smoke test.

Then point runtime at the new model:

```env
AI_PROVIDER=ollama
AI_MODEL=kikial:7b
AI_MODEL_AUTO=false
AI_TIMEOUT_MS=120000
```

Restart the backend and run the existing application eval:

```bash
npm test
npm run eval
```

Do not promote the new model only because training completed. Keep it only if held-out and application-level evaluation improve without important regressions.
