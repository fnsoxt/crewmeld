# Tool Input Requirements Collection Spec

## Overview

Before tool generation, requirements must be collected through conversation. The AI assistant should proactively guide users to clarify the following information.

## Required Information

### 1. Feature Description
- What should the tool do?
- What are the inputs? What are the outputs?
- Does it need to call external APIs?

### 2. Parameter Definition
- What input parameters are needed?
- Type of each parameter (string/number/boolean/object/array)
- Which parameters are required?
- Do parameters have default values?

### 3. API Dependencies
- If external API calls are needed:
  - **Prioritize completely free public APIs** (no registration, no API Key required)
  - The model should proactively search and recommend free available APIs
  - If no free alternative can be found, must pause and inform the user:
    - Explain why a paid API is needed
    - Ask the user to provide API Key or credentials
    - The user may reject the suggestion and propose their own approach

### 4. Output Format
- What structure should the return value have?
- Are specific fields required?

## Conversation Guidance Strategy

### Simple Requirements
When the user's description is sufficiently clear, the AI can generate the tool directly without additional questions.

### Complex Requirements
When requirements are unclear, the AI should ask key questions (at most 2-3) rather than making too many assumptions.

### User File Uploads
- Supported formats: txt, doc/docx, xls/xlsx, pdf, images (png/jpg/gif/webp), video (mp4/webm)
- Text files: read full content as context
- Images: convert to base64 as context
- Other: display filename and size information

## Parameter Auto-Fill

- When generating a tool, the model must simultaneously generate the `testParams` field
- Values in testParams should be real, usable test data
- The model should proactively search for suitable test parameters (e.g. real city names, URLs)
- If a parameter requires user input (e.g. personal API Key), leave it empty in testParams

## Pause Mechanism

The AI should pause and wait for user input in these situations:
1. No free API available; need user to provide API Key
2. Requirement description is ambiguous; need user clarification
3. Need to confirm understanding of user-uploaded file content

Pause message format:
```
Your input is needed:
- [What specifically is needed]
- [Why it is needed]

Please provide the above information, or share your alternative ideas.
```

## Multi-Option Selection Mechanism

When multiple viable implementation approaches exist (e.g. multiple APIs, different algorithm paths), the AI assistant **must pause**, list all options for the user to choose, and **must not decide on its own**.

### Option Listing Format
```
I found the following options:

**Option 1: [Option Name]**
- Features: ...
- Limitations: ...
- API Key required: Yes/No

**Option 2: [Option Name]**
- Features: ...
- Limitations: ...
- API Key required: Yes/No

Please select an option (enter the number), or share your alternative ideas.
```

### After User Selection
- Strictly generate code following the user's chosen option; do not deviate
- If the chosen option fails during testing, inform the user of the failure reason and re-list remaining options for re-selection
- Do not automatically switch to another option after failure
