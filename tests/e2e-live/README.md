# Live E2E Tests

These tests run against REAL external systems, not mocks. Default behavior: all skipped.

## Master switch
- `E2E_LIVE=1` — required to run any live spec

## Per-suite env vars

### K8S live (tools/k8s-sandbox-live.spec.ts)
- `ENABLE_K3S=1`
- `KUBECONFIG=/path/to/kubeconfig` (or standard k8s env)
- Requires: a reachable k3s/k8s cluster

### LLM live (providers/china-llm-providers-live.spec.ts)
- `LLM_PROVIDER_KEYS_OK=1`
- `DEEPSEEK_API_KEY`, `QWEN_API_KEY`, ... per-provider API keys
- Requires: valid API keys for each of 8 china providers

### RAGFlow live (ragflow/knowledge-page-live.spec.ts)
- `RAGFLOW_URL=http://...`
- Requires: a reachable RAGFlow deployment with a seeded dataset

## Running
`bunx playwright test --project=chromium-live`
