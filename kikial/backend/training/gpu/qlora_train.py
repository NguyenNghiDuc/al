#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig, PeftModel, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from trl import SFTTrainer


def parse_args():
    p = argparse.ArgumentParser(description="Kikial QLoRA GPU trainer")
    p.add_argument("--model", default=os.getenv("MODEL_NAME", "Qwen/Qwen2.5-7B-Instruct"))
    p.add_argument("--dataset", default="training/exports/kikial-sft-v1.sft.jsonl")
    p.add_argument("--output", default="training/models/kikial-qlora")
    p.add_argument("--epochs", type=float, default=3.0)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--max-seq-length", type=int, default=2048)
    p.add_argument("--warmup-ratio", type=float, default=0.05)
    p.add_argument("--save-steps", type=int, default=25)
    p.add_argument("--logging-steps", type=int, default=1)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--merge", action="store_true", help="Merge LoRA adapter into a standalone HF model after training")
    return p.parse_args()


def load_jsonl(path):
    rows = []
    with open(path, "r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as e:
                raise SystemExit(f"Invalid JSONL at line {line_no}: {e}")
            messages = item.get("messages")
            if not isinstance(messages, list) or not messages:
                raise SystemExit(f"Missing messages at line {line_no}")
            rows.append(item)
    if not rows:
        raise SystemExit("Dataset is empty")
    return rows


def main():
    args = parse_args()

    if not torch.cuda.is_available():
        raise SystemExit("CUDA GPU not detected. Run this trainer on an NVIDIA GPU machine.")
    if torch.cuda.get_device_capability()[0] < 7:
        raise SystemExit("GPU compute capability is too old for a practical 4-bit QLoRA run.")

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        raise SystemExit(
            f"Dataset not found: {dataset_path}. "
            "Run npm run training:prepare && npm run training:validate && npm run training:export:sft first."
        )

    rows = load_jsonl(dataset_path)
    tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    def to_text(item):
        return tokenizer.apply_chat_template(
            item["messages"],
            tokenize=False,
            add_generation_prompt=False,
        )

    texts = [to_text(item) for item in rows]
    ds = Dataset.from_dict({"text": texts})

    compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    quant_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=compute_dtype,
    )

    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=quant_config,
        device_map="auto",
        torch_dtype=compute_dtype,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
    )

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(out),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        warmup_ratio=args.warmup_ratio,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        save_total_limit=2,
        bf16=compute_dtype == torch.bfloat16,
        fp16=compute_dtype == torch.float16,
        optim="paged_adamw_8bit",
        lr_scheduler_type="cosine",
        weight_decay=0.01,
        gradient_checkpointing=True,
        report_to="none",
        seed=args.seed,
        data_seed=args.seed,
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=ds,
        peft_config=lora_config,
        args=training_args,
        processing_class=tokenizer,
        dataset_text_field="text",
        max_seq_length=args.max_seq_length,
        packing=False,
    )

    print(json.dumps({
        "status": "training",
        "model": args.model,
        "examples": len(ds),
        "gpu": torch.cuda.get_device_name(0),
        "compute_dtype": str(compute_dtype),
        "output": str(out),
    }, ensure_ascii=False, indent=2))

    train_result = trainer.train()
    trainer.save_model(str(out / "adapter"))
    tokenizer.save_pretrained(str(out / "adapter"))

    metrics = dict(train_result.metrics)
    metrics["train_examples"] = len(ds)
    (out / "train_metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if args.merge:
        base = AutoModelForCausalLM.from_pretrained(
            args.model,
            torch_dtype=compute_dtype,
            device_map="auto",
        )
        merged = PeftModel.from_pretrained(base, str(out / "adapter"))
        merged = merged.merge_and_unload()
        merged_dir = out / "merged"
        merged.save_pretrained(str(merged_dir), safe_serialization=True)
        tokenizer.save_pretrained(str(merged_dir))
        print(f"Merged model saved to: {merged_dir}")

    print(json.dumps({
        "status": "completed",
        "adapter": str(out / "adapter"),
        "metrics": metrics,
        "weights_changed": True,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
