# Kikial Offline Improvement

The training subsystem is deliberately separate from runtime chat. Use:

```bash
npm run training:prepare
npm run training:validate
npm run training:inspect
npm run training:export:sft
npm run benchmark:model
npm run model:list
npm run improvement:report
```

`training:run` fails clearly unless an external Python/PyTorch/PEFT environment is configured. Runtime chats never perform gradient updates. Generated JSONL, private candidates, exports, reports, and model artifacts are ignored by `training/.gitignore`.
