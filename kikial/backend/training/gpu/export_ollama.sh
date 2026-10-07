#!/usr/bin/env bash
set -euo pipefail

MERGED_DIR="${1:-training/models/kikial-qwen25-7b/merged}"
MODEL_NAME="${2:-kikial:7b}"
LLAMA_CPP_DIR="${3:-../llama.cpp}"
OUT_DIR="${4:-training/models/ollama-export}"

if [[ ! -d "$MERGED_DIR" ]]; then
  echo "Merged Hugging Face model not found: $MERGED_DIR" >&2
  exit 2
fi
if [[ ! -f "$LLAMA_CPP_DIR/convert_hf_to_gguf.py" ]]; then
  echo "llama.cpp convert_hf_to_gguf.py not found under: $LLAMA_CPP_DIR" >&2
  exit 2
fi
if ! command -v ollama >/dev/null 2>&1; then
  echo "ollama command not found" >&2
  exit 2
fi

QUANTIZER="$LLAMA_CPP_DIR/build/bin/llama-quantize"
if [[ ! -x "$QUANTIZER" ]]; then
  QUANTIZER="$LLAMA_CPP_DIR/quantize"
fi
if [[ ! -x "$QUANTIZER" ]]; then
  echo "llama.cpp quantizer not found. Build llama.cpp first." >&2
  exit 2
fi

mkdir -p "$OUT_DIR"
F16="$OUT_DIR/kikial-f16.gguf"
Q4="$OUT_DIR/kikial-q4_k_m.gguf"
MODELFILE="$OUT_DIR/Modelfile"

python3 "$LLAMA_CPP_DIR/convert_hf_to_gguf.py" "$MERGED_DIR" --outfile "$F16" --outtype f16
"$QUANTIZER" "$F16" "$Q4" Q4_K_M

cat > "$MODELFILE" <<EOF
FROM ./kikial-q4_k_m.gguf
PARAMETER temperature 0.3
PARAMETER num_ctx 8192
PARAMETER repeat_penalty 1.08
SYSTEM Bạn là Kikial. Trả lời đúng yêu cầu hiện tại, ưu tiên tiếng Việt rõ ràng và thực dụng. Với code, viết đúng chức năng và không thay bằng ví dụ chung. Không bịa dữ liệu mới hoặc nguồn.
EOF

(
  cd "$OUT_DIR"
  ollama create "$MODEL_NAME" -f Modelfile
)

echo "Created Ollama model: $MODEL_NAME"
echo "Smoke test:"
ollama run "$MODEL_NAME" "Viết một hàm JavaScript kiểm tra số nguyên tố và cho 2 test ngắn."
