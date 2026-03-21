# SignalFrame

SignalFrame is a Chrome extension plus FastAPI backend that analyzes social video posts and labels them as either AI-generated or not AI-generated.

The extension supports:
- YouTube
- Facebook
- X/Twitter
- TikTok
- Instagram

## Current behavior

- Floating SF icon appears during checks and updates with result state.
- Expanded panel shows:
  - Decision (`ai_generated` or `not_ai_generated`)
  - Confidence (`low`/`medium`/`high`) only for `ai_generated`
  - Plain-language reason
  - Retry button (in expanded panel)
- Retry triggers a fresh backend request (cache bypass) and re-queries Groq when configured.
- Frame capture is passive and non-intrusive: it samples frames while users naturally watch, then sends up to 4 distributed samples from watch history.

## Architecture overview

- Extension layer
  - Content script detects supported pages, collects metadata, and gathers passive visual samples.
  - Background service worker handles API calls, retries/timeouts, per-tab request cancellation, and response caching.
  - Popup UI controls global enable and per-site toggles.
  - Widget UI renders loading, decision tone, confidence, reason, and manual Retry.

- Backend layer
  - FastAPI validates request schema and serves:
    - `POST /api/v1/analyze`
    - `GET /api/v1/health`
  - Groq is used as the final decision maker when configured.
  - Local detector acts as fallback when provider is unavailable.

## Repository layout

- extension: Chrome extension source and build output
- backend: FastAPI app, detector logic, and tests

## Prerequisites

- Node.js 20+
- Python 3.11+
- Google Chrome

## Setup

### 1) Create and activate .venv

From workspace root:

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2) Backend setup

From workspace root:

```bash
python -m pip install -r backend/requirements.txt
```

Run backend:

```bash
python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Optional provider config:
- Copy [backend/.env.example](backend/.env.example) to [backend/.env](backend/.env)
- Set `GROQ_API_KEY`
- Optionally set:
  - `EXPLANATION_PROVIDER` (`auto`, `groq`, `local`)
  - `GROQ_MODEL`

### 3) Extension setup

From workspace root:

```bash
cd extension
npm install
npm run build
```

### 4) Load extension in Chrome (Developer Mode)

- Open `chrome://extensions`
- Enable Developer mode
- Click Load unpacked
- Select `extension/dist`

## API contract

`POST /api/v1/analyze`

Request fields:
- `site`: `youtube|facebook|x|tiktok|instagram`
- `pageType`: `video|short`
- `videoId`: 3-32 chars
- `title`: max 220 chars
- `channelName`: max 100 chars
- `urlHash`: 32-128 chars
- `visualSignals` (optional)
  - `frameSamples`: max 4
  - `videoWidth`, `videoHeight`, `durationSec`, `playbackRate`
  - optional `videoSrcUrl`, `videoStreamProbeBase64`, `videoStreamMimeType`, `videoStreamNote`

Response fields:
- `decision`: `ai_generated|not_ai_generated`
- `confidence`: `low|medium|high|null`
- `reason`: user-facing explanation
- `ttlSeconds`: cache TTL for client

## Testing

Run backend tests:

```bash
python -m pytest backend/tests -q
```

Run Groq prompt benchmark cases:

```bash
python backend/tests/run_groq_prompt_cases.py
```

## Debugging tips

- Confirm backend is reachable at `http://localhost:8000`.
- Check popup toggles for global and per-site enablement.
- Open extension service worker logs from Chrome extension developer tools.
- If analysis appears stale, use Retry from the expanded widget panel.

## Known limitations

- Accuracy depends on available visual evidence and provider behavior.
- Some sites/videos restrict frame reads due to CORS/DRM policies.
- Passive sampling improves user experience but may need watch time before broad timeline coverage is available.
