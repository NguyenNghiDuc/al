# Kikial Improvement & Training

Kikial không cố "học mọi thứ" bằng cách nhét toàn bộ Internet vào trọng số model. Runtime nên kết hợp model mạnh, verified knowledge, personal memory, documents/RAG, tools và live web retrieval. Fine-tuning chỉ dùng để cải thiện hành vi/model ở những lỗi đã được xác minh.

## Quy trình an toàn

```bash
# 1. Phân tích eval failures và tạo dataset correction.
# Có thể tạo thêm synthetic candidates nếu SYNTHETIC_TRAINING_COUNT > 0.
npm run training:prepare

# 2. Xem dataset + các candidate đang chờ duyệt.
npm run training:inspect

# 3. Duyệt hoặc loại synthetic candidate trước khi dùng.
npm run training:review -- <candidate-id> approve
npm run training:review -- <candidate-id> reject

# 4. Chạy lại prepare để đưa candidate đã verified vào dataset.
npm run training:prepare

# 5. Dataset phải qua validation trước khi export.
npm run training:validate
npm run training:export:sft
npm run training:export:preference

# 6. Benchmark model candidate trước khi promote.
npm run benchmark:model
npm run model:list
npm run model:promote -- <model-id>
npm run model:rollback
npm run improvement:report
```

## Nguyên tắc

- Eval failure chỉ được biến thành training example khi có `expectedBehavior`; câu trả lời sai cũ không được dùng làm output mục tiêu.
- Synthetic data do model tạo luôn ở trạng thái **quarantine / chưa verified**.
- Chỉ example `verified=true`, privacy-safe và đủ quality mới được export SFT.
- Chat runtime không tự cập nhật gradient/model weights.
- `training:run` cố ý dừng nếu chưa có môi trường GPU/PyTorch/Transformers/PEFT được cấu hình và kiểm chứng.
- Model mới chỉ nên được promote sau held-out eval/benchmark; luôn giữ đường rollback.

Để tăng kiến thức mới/current, ưu tiên RAG + SearXNG/web retrieval. Fine-tuning phù hợp hơn cho reasoning style, instruction following, tool use, coding patterns và những lỗi lặp lại đã có ground truth.
