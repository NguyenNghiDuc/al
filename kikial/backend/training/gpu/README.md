# Kikial GPU QLoRA Training

This path performs real weight adaptation through LoRA/QLoRA. It is different from `training:prepare`, which only prepares datasets.

## Recommended GPU

- 16 GB VRAM: workable for a 3B model with 4-bit QLoRA and batch size 1.
- 24 GB+ VRAM: more comfortable and allows larger sequence lengths/batches.
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
training/exports/kikial-sft-v1.sft.jsonl
```

## 2. Install GPU dependencies

Use a fresh CUDA-compatible Python environment:

```bash
python -m pip install -U pip
pip install -r training/gpu/requirements-gpu.txt
```

For gated Meta Llama weights, log in to Hugging Face and make sure the account has accepted the model license:

```bash
huggingface-cli login
```

## 3. Run QLoRA training

```bash
python training/gpu/qlora_train.py \
  --model meta-llama/Llama-3.2-3B-Instruct \
  --dataset training/exports/kikial-sft-v1.sft.jsonl \
  --output training/models/kikial-llama32-3b \
  --epochs 3 \
  --batch-size 1 \
  --grad-accum 8 \
  --max-seq-length 2048
```

To also save a merged Hugging Face model:

```bash
python training/gpu/qlora_train.py \
  --model meta-llama/Llama-3.2-3B-Instruct \
  --dataset training/exports/kikial-sft-v1.sft.jsonl \
  --output training/models/kikial-llama32-3b \
  --epochs 3 \
  --merge
```

The adapter is saved under:

```text
training/models/kikial-llama32-3b/adapter
```

The merged model, when `--merge` is used, is saved under:

```text
training/models/kikial-llama32-3b/merged
```

## 4. Important evaluation rule

Do not call the model improved only because training completed. Compare it on held-out eval cases, especially:
- short-topic prompts
- exact code-generation prompts
- follow-up/context prompts
- weak-RAG cases
- debugging tasks

Only promote the fine-tuned model if it beats the current model without regressions.

## 5. Ollama deployment

Ollama normally consumes GGUF models. After training, convert the merged Hugging Face model to GGUF with a current llama.cpp conversion workflow, quantize it, create an Ollama Modelfile, and benchmark it before replacing the current `llama3.2:3b` runtime model.

Do not claim the Ollama model has been fine-tuned until that conversion/deployment step is complete.
