#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama is not installed." >&2
  exit 2
fi

if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "Starting Ollama..."
  nohup ollama serve >/tmp/kikial-ollama.log 2>&1 &
  sleep 2
fi

pull_if_missing() {
  local model="$1"
  [[ -z "$model" ]] && return 0
  if ! ollama list | awk 'NR>1 {print $1}' | grep -Fxq "$model" &&      ! ollama list | awk 'NR>1 {print $1}' | grep -Fxq "$model:latest"; then
    echo "Pulling $model ..."
    ollama pull "$model"
  else
    echo "$model already installed."
  fi
}

pull_if_missing "${AI_MODEL:-llama3.2:3b}"
pull_if_missing "${AI_EMBEDDING_MODEL:-nomic-embed-text}"

if [[ "${KIKIAL_PULL_SPECIALISTS:-false}" == "true" ]]; then
  pull_if_missing "${AI_CODING_MODEL:-qwen2.5-coder:7b}"
  pull_if_missing "${AI_REASONING_MODEL:-qwen2.5:7b}"
  pull_if_missing "${AI_FAST_MODEL:-llama3.2:3b}"
fi

echo "Model bootstrap complete."
