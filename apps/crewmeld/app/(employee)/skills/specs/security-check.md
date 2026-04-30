# Tool Security Check Spec

## When to Check

Security checks must be performed after code generation and before test execution. Code that fails the check is forbidden from execution and deployment.

## Static Detection Rules

### JavaScript Rules

#### Blocking Rules (errors) — Completely Forbidden

| Rule | Regex Pattern | Description |
|------|--------------|-------------|
| Forbid process (except env) | `\bprocess\.(?!env\b)` | Forbid access to process object (process.env is allowed) |

#### User Confirmation Required (confirmations) — Prompt User to Decide

| Rule | Description |
|------|-------------|
| Dependencies from import/require | Auto-extract specific package names and display for user confirmation; confirmed packages in the same session are not re-prompted |
| `fs.` | File system operations |
| `child_process` | Child process invocation |
| `eval()` | Dynamic code execution |
| `new Function()` | Dynamic function construction |
| `__proto__` | Prototype pollution risk |
| `.constructor()` | Constructor escape risk |

> **Important**: `import` and `require` are **allowed**. The system auto-extracts dependency package names, installs them automatically to a temp directory during local testing, and writes them to package.json/requirements.txt for K8s deployment. The model **should not abandon third-party libraries due to import/require** when fixing code.

### Python Rules

#### Blocking Rules (errors)

| Rule | Description |
|------|-------------|
| `exec()` | Forbidden dynamic code execution |
| `eval()` | Forbidden dynamic code execution |

#### User Confirmation Required (confirmations)

| Rule | Description |
|------|-------------|
| `subprocess` | Child process invocation (**auto-allowed only for `pip install`, `playwright install`, `playwright install-deps`**; other uses still require confirmation) |
| `os.system()` | System command execution |
| `os.popen()` | Pipe command execution |
| `__import__()` | Dynamic import |

> Regular Python `import` statements are normal syntax and do not require confirmation.

### Universal Rules

#### Hardcoded Secret Detection (warnings)

The following patterns trigger a warning when matched (non-blocking, but prompts user to convert to parameters):

| Rule | Regex Pattern | Description |
|------|--------------|-------------|
| Suspected API Key | `['"]sk-[a-zA-Z0-9]{20,}['"]` | OpenAI-style key |
| Suspected Bearer Token | `['"]Bearer\s+[a-zA-Z0-9._-]{20,}['"]` | Hardcoded Bearer Token |
| Suspected Password | `password\s*[:=]\s*['"][^'"]{6,}['"]` | Hardcoded password |
| Suspected Private Key | `-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY` | Embedded private key |

#### Parameter Name Validation

Parameter names must match regex `/^[\p{L}_$][\p{L}\p{N}_$]*$/u`:
- Allowed: Unicode letters, digits, underscores, dollar signs
- Forbidden: starting with a digit, containing spaces or special characters

#### Return Value Detection

- JavaScript: code must contain a `return` statement
- Python: code must contain a `result = ` assignment

#### Code Size Detection

- Maximum allowed code length: 100KB (100 * 1024 characters)

## Check Results

```typescript
interface SecurityCheckResult {
  passed: boolean
  errors: string[]         // Blocking issues, must be fixed
  warnings: string[]       // Non-blocking issues, recommended to fix
  confirmations: string[]  // Items requiring user confirmation; can proceed after confirmation
}
```

## Handling Strategy

- **errors is non-empty**: Forbid execution and deployment; prompt user to modify or have AI regenerate
- **confirmations is non-empty**: Pause the flow; display to user for confirmation; items confirmed in the same session are auto-skipped
- **warnings is non-empty**: Allow execution, but display warning in UI
- **All passed**: Allow execution and deployment

## process.env / os.environ Exemption

- JavaScript `process.env.XXX` is **allowed** for reading environment variables injected into Pods (e.g. API Keys)
- Python `os.environ.get('XXX')` is **allowed**
- Other than `process.env`, all other `process.xxx` access is still **forbidden**
