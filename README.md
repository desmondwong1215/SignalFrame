# SignalFrame

SignalFrame is a Chrome extension prototype that watches YouTube videos and Shorts and shows a small assistive warning only when content appears likely AI-generated at high confidence.

## MVP scope

- Chrome only
- YouTube watch pages and Shorts only
- Explicit user opt-in (extension disabled by default)
- Local-first signals with minimal backend payload
- Warning icon appears only for high-confidence likely AI-generated outcomes
- No visible UI for no-warning or unable-to-verify outcomes

## Architecture overview

- Extension layer
  - Content script observes supported YouTube pages and collects metadata plus optional lightweight visual signals.
  - When feasible and allowed by browser/video policies, it samples a small number of video frames.
  - Background service worker calls backend analysis API with debounce and caching.
  - React UI renders a compact warning icon and expandable panel with confidence and reason.
  - Popup provides settings for global enable and per-site enable.

- Backend layer
  - FastAPI API validates input and applies a hybrid detector that combines metadata and visual-frame heuristics.
  - Tri-state output: no_warning, likely_ai_generated, unable_to_verify.
  - Reason text is assistive, not authoritative.

## Repository layout

- extension: Chrome extension source and build output
- backend: FastAPI service and tests

## Prerequisites

- Node.js 20+
- Python 3.11+
- Google Chrome

## Setup

### 1) Create and activate .venv

From workspace root:

Windows PowerShell:

python -m venv .venv
.\.venv\Scripts\Activate.ps1

macOS/Linux:

python3 -m venv .venv
source .venv/bin/activate

### 2) Backend setup

From workspace root:

Windows PowerShell/macOS/Linux:

python -m pip install -r backend/requirements.txt

Run backend:

Windows PowerShell/macOS/Linux:

python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000

Optional provider-based explanation generation:

- Copy [backend/.env.example](backend/.env.example) to [backend/.env](backend/.env)
- Configure key:
  - GROQ_API_KEY
- Choose provider mode with EXPLANATION_PROVIDER:
  - auto: prefers Groq, then local fallback
  - groq: use Groq only, fallback local if key missing/failure
  - local: always local explanation text

### 3) Extension setup

From workspace root:

cd extension
npm install
npm run build

Build output appears in extension/dist.

### 4) Load extension in Chrome (Developer Mode)

- Open chrome://extensions
- Enable Developer mode
- Click Load unpacked
- Select extension/dist
- Open extension details and enable Allow in Incognito if you want incognito support

## Usage

- Open extension popup and enable SignalFrame.
- Open a YouTube video or Shorts page.
- If high-confidence AI signals are detected, a small SF icon appears.
- Click the icon to view confidence level and concise reason.

## API

- POST /api/v1/analyze
- GET /api/v1/health

Analyze request payload:

- site: youtube
- pageType: video or short
- videoId: YouTube id
- title: page title snippet
- channelName: channel snippet
- urlHash: hashed canonical URL
- visualSignals (optional): frame samples and lightweight video metadata

Analyze response payload:

- decision: no_warning, likely_ai_generated, unable_to_verify
- confidence: low, medium, high
- reason: assistive explanation
- ttlSeconds: client-side cache TTL

## Security and privacy notes

- Minimal payload by design: no raw frames and no full browsing history.
- URL is sent as a hash instead of raw URL.
- No account identifiers are required.
- Backend input is validated with schema constraints.
- Provider API keys are read from environment variables and should never be hard-coded.
- Frame sampling is best-effort only and respects browser restrictions such as cross-origin/DRM protections.

## Performance notes

- Debounced analysis in content script
- Signature dedupe in content script
- TTL-based response caching in service worker
- Backend timeout target tuned for sub-1.5 second UX

## Testing

Run backend tests:

Windows PowerShell/macOS/Linux:

python -m pytest backend/tests -q

## Debugging tips

- If no warning appears, verify popup setting is enabled.
- Check backend is reachable at http://localhost:8000.
- Inspect service worker logs in Chrome extension developer tools.
- Confirm page is on supported YouTube watch or Shorts URL.

## Known limitations

- Detector currently uses metadata heuristics and can produce false negatives/positives.
- No advanced frame forensics in MVP.
- Only YouTube supported in this version.

## Contribution

- Keep modules focused and small.
- Maintain strict schema contracts between extension and backend.
- Add tests for detector rule updates before changing thresholds.
