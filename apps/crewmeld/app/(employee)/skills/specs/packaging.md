# Tool Packaging Spec

## Packaging Flow

```
Security check passed → Build manifest → Package tool code → Generate HTTP Server wrapper → Generate .zip
```

## Package Structure

```
skill-{id}.zip
├── manifest.json        # Metadata manifest
├── tool.js              # Tool code (JavaScript) or tool.py (Python)
├── server.mjs           # HTTP Server wrapper (JavaScript) or server.py (Python)
└── README.md            # Tool documentation
```

## manifest.json Spec

```json
{
  "id": "ai-tool-1773730937698",
  "name": "Weather Lookup",
  "description": "Query weather information by city name",
  "version": "1.0.0",
  "language": "javascript",
  "author": "AI Generated",
  "category": "AI Generated",
  "createdAt": "2026-03-17",
  "parameters": {
    "type": "object",
    "properties": {
      "city": { "type": "string", "description": "City name" },
      "apiKey": { "type": "string", "description": "Weather API key" }
    },
    "required": ["city", "apiKey"]
  },
  "securityCheck": {
    "passed": true,
    "checkedAt": "2026-03-17T07:00:00Z",
    "warnings": []
  },
  "testResult": {
    "passed": true,
    "testedAt": "2026-03-17T07:01:00Z",
    "executionTime": 320
  }
}
```

## HTTP Server Wrapper

### JavaScript (server.mjs)

Start command: `node /app/server.mjs`

Features:
- Listens on port 3000
- `GET /health` → Health check
- `POST /` → Execute tool code; request body is JSON parameters
- Parameter name validation (regex `/^[\p{L}_$][\p{L}\p{N}_$]*$/u`)
- CORS support (`Access-Control-Allow-Origin: *`)
- Error capture with JSON-formatted error responses

### Python (server.py)

Start command: `python /app/server.py`

Features: Same as the JavaScript version, port 3000

## K8S Deployment Spec

| Resource | Configuration |
|----------|--------------|
| ConfigMap | Contains server code + tool code |
| Deployment | 1 replica, CPU 50m–200m, memory 64Mi–256Mi |
| Service | NodePort type, port 3000, auto-assigned NodePort |
| Health Check | liveness: `/health` every 10s, readiness: `/health` every 5s |
| Image | JS: `node:latest`, Python: `python:3.12-alpine` |
| Pull Policy | `IfNotPresent` (prefer local images) |

## Download Package Generation

When the user clicks "Download", the frontend generates a .zip file in the browser:

1. Build manifest.json from SkillPackage data
2. Write tool code to tool.js / tool.py
3. Write the corresponding language's server wrapper to server.mjs / server.py
4. Generate README.md (including usage instructions, parameter descriptions, call examples)
5. Package as .zip using JSZip and trigger a browser download

## Version Management

- First generation: `1.0.0`
- Each code update via "Continue Editing": patch version +1 (e.g. `1.0.1`)
- Manual upload override: keep the user-specified version number
