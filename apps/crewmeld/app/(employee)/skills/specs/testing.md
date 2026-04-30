# Tool Testing Spec

## Testing Flow

```
Generate Code → Security Check → Auto Test → Validate Result
                    ↓ Fail            ↓ Fail
               AI Auto Fix      AI Auto Fix (no limit)
                                     ↓ Still failing after 10 fixes
                                Full Regeneration (max 3 times)
                                     ↓ Still failing
                                Inform user, suggest simplifying requirements
```

## Auto Testing Strategy

### Test Parameter Source
- The model **must** generate a `testParams` field alongside the tool code
- Values in testParams should be real, usable test data
- The model should proactively search for suitable test parameters (e.g. real city names, URLs)

### Unlimited Auto Testing
- After code generation, automatically enter the test flow
- On test failure, AI automatically analyzes the error and fixes the code
- **No limit on fix attempts per round**, but 10 attempts form one cycle
- After 10 fix attempts still failing → completely regenerate code
- Maximum 3 full regenerations
- After 3 regenerations still failing → stop and inform the user in conversation

### Pause for User Input
When the model determines user-provided parameters are needed (e.g. no free API available), pause and prompt:
- Explain what parameter is needed
- Why it is needed (no free alternative found)
- User can provide the parameter or reject and propose their own approach

## Test Execution Environment

### Server-Side Execution (Testing Phase)
- Endpoint: `POST /api/employee/tools/execute`
- Timeout: 30 seconds
- Context: inside an async function
- Available globals: `fetch`, `JSON`, `Math`, `Date`, `RegExp`, standard built-in objects
- Parameter injection: `const paramName = __params__["paramName"]`

### K8S Execution (Production Phase)
- Endpoint: `POST http://{K8S_NODE_IP}:{NodePort}`
- Container image: `node:latest` (JavaScript) / `python:3.12-alpine` (Python)
- Mount method: ConfigMap → `/app/server.mjs` + `/app/tool.js`
- Health check: `GET /health` → `{"status":"ok"}`

## Parameter Type Conversion

During testing, all parameters are input as strings; they must be converted by JSON Schema type before execution:

| Schema Type | Conversion Rule | Example |
|------------|----------------|---------|
| `string` | Pass as-is | `"hello"` → `"hello"` |
| `number` | `Number(value) \|\| 0` | `"42"` → `42` |
| `boolean` | `value === 'true'` | `"true"` → `true` |
| `object` | `JSON.parse(value)` | `'{"a":1}'` → `{a:1}` |
| `array` | `JSON.parse(value)` | `'[1,2]'` → `[1,2]` |

## Test Result Validation

### Two-Level Validation

#### Level 1: Basic Validation (Automatic)
1. Code execution did not throw an exception
2. Execution time ≤ 30 seconds
3. Return value is serializable by `JSON.stringify`
4. Return value is not `null` / `undefined` / empty object `{}` / empty array `[]`
5. Return value is not a pure error object (e.g. `{ error: "..." }`)

#### Level 2: Semantic Validation (AI Judgment)
After basic validation passes, the system sends the execution result to you for judgment:
- Does the result contain the **core information** the tool should return (e.g. a weather tool must have real temperature, weather conditions)?
- Is the data **real and reasonable** (not placeholders, sample data, HTML error pages, etc.)?
- Is the data format **user-friendly** (clear structure, key fields have values)?

Judgment rules:
- Check whether the return value contains meaningful data (non-empty, non-placeholder)
- If the result is correct and meaningful, reply `RESULT_VALID`
- If the result is incorrect, reply `RESULT_INVALID: specific reason` and provide the fixed complete JSON code block

### After Test Passes
- Display test result in conversation (JSON format)
- Show a "Test Run" button for users to adjust parameters and test themselves
- Show an "Adopt Tool" button
- Only save finally after user confirms

### Failure Handling
- AI automatically analyzes error cause and fixes code
- After fix, re-run security check and test
- The entire process is transparent to the user (fix process visible in conversation)
