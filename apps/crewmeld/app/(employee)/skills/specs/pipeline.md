# Tool Generation Pipeline Spec

## Complete Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Input    │ →  │ Generate  │ →  │ Security  │ →  │   Test   │ →  │  Package  │
│  Require  │    │   Code    │    │   Check   │    │          │    │  /Deploy  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                     ↑               ↓ Fail          ↓ Fail
                     └───── AI Auto Fix ←────────────┘
```

## Phase 1: Input Requirements

**Interaction**: Conversational (user describes requirements in chat interface)

**User Actions**:
- Select a model (from the list of configured active models)
- Describe tool requirements via natural language conversation
- Optionally upload files (txt, word, excel, images, video, etc.) as supplementary information
- Adjust requirements at any time during the conversation

**System Behavior**:
- Read `specs/input-requirements.md` for requirement collection guidelines
- AI assistant analyzes whether the requirement is clear; asks follow-up questions if needed
- Prioritize searching for completely free APIs to avoid user cost
- If a paid API is necessary, pause and inform the user that credentials are needed

**Spec File**: `specs/input-requirements.md`

## Phase 2: Code Generation

**System Behavior**:
- Call LLM (temperature 0.3, maxTokens 8192)
- System prompt includes coding standards and parameterization principles from `code-generation.md`
- Model shows thinking process (`<think>` tags) during output; auto-collapsed when complete
- Parse JSON code block from LLM output
- Validate JSON contains `title`, `code`, and `testParams` fields
- Model independently searches for and fills in test parameters

**Failure Handling**:
- JSON parse failure → attempt to strip markdown code fences and retry
- Missing required fields → inform user in conversation and retry

**Spec File**: `specs/code-generation.md`

## Phase 3: Security Check

**System Behavior**:
- Runs automatically, no user intervention needed
- Checks generated code against rules in `specs/security-check.md` item by item
- Returns `SecurityCheckResult`

**Check Items**:
1. Forbidden keyword scan (import/require/process/fs/eval, etc.)
2. Hardcoded secret scan (API Key/Token/Password pattern matching)
3. Parameter name legality validation
4. Return statement presence check
5. Code size check (≤ 100KB)

**Failure Handling**:
- errors is non-empty → AI auto-fixes, no user intervention needed
- warnings is non-empty → display warnings in conversation, do not block the flow
- Fix attempt limit: 10 per round; exceeded → full regeneration

**Spec File**: `specs/security-check.md`

## Phase 4: Testing

**System Behavior**:
- Runs automatically using model-generated `testParams`
- Calls `/api/employee/tools/execute` to execute
- Validates execution results

**Auto Testing Strategy**:
- Model self-testing has no limit; continues fixing until it passes
- Maximum 10 fix attempts per round
- After 10 attempts, full regeneration (up to 3 complete regenerations)
- After 3 regenerations still failing → inform user in conversation, suggest simplifying requirements or switching models

**User Input Pause**:
- If testing requires user-provided parameters (e.g. API Key), pause and prompt the user
- User can:
  - Provide the required parameters
  - Reject the suggestion and input their own modifications
  - Request regeneration

**After Test Passes**:
- Display test results in conversation
- Show "Test Run" button for user self-testing
- Show "Adopt Tool" button

**Spec File**: `specs/testing.md`

## Phase 5: Package / Deploy

**Packaging** (supports download):
- Read `specs/packaging.md` spec
- Generate manifest.json (includes security check results and test results)
- Package as .zip and trigger browser download

**Deployment** (publish to K8S):
- Create ConfigMap (server wrapper + tool code)
- Create Deployment (containerized runtime)
- Create Service (NodePort to expose port)
- Return access endpoint URL

**Spec File**: `specs/packaging.md`

## Conversational Iteration

All phases are completed within the chat interface. The user can at any time via conversation:
1. Modify requirements → regenerate
2. Specify changes to a particular parameter or logic → AI modifies code
3. After modification, **security check and testing must be re-executed**
4. User can also reject AI suggestions and input their own modifications

## Context Isolation

- Each new tool creation conversation is an independent session
- The model can only see messages from the current conversation; it cannot access other conversations or system data
- The model can access the network (via fetch) to search for free APIs and parameters

## Spec File Index

| File | Purpose | When Read |
|------|---------|-----------|
| `specs/input-requirements.md` | Input requirement collection guidelines | Injected into LLM system prompt at conversation start |
| `specs/code-generation.md` | Code generation constraints | Injected into LLM system prompt during generation / fix / refinement |
| `specs/security-check.md` | Security check rules | Checked after code generation, before execution |
| `specs/testing.md` | Test execution spec | Referenced during testing phase |
| `specs/packaging.md` | Packaging and deployment spec | Referenced during packaging / K8S deployment |
| `specs/pipeline.md` | Pipeline overview | Overall process reference (this file) |
