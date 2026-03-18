# RSR AXION

## Overview
RSR AXION is an Intelligence Synthesis System — a React + TypeScript + Vite single-page application that ingests live RSS news feeds entirely in the browser, scores signals by severity and confidence, and generates executive intelligence briefs with threat matrix assessments. Runs as a fully static frontend with no backend dependency.

## Architecture
- **Frontend**: React 18 + TypeScript, bundled with Vite 5
- **Signal Ingestion**: Browser-native `collectSignals()` using rss2json CORS proxy (`api.rss2json.com`) — no backend required
- **Styling**: Plain CSS (`src/index.css`)
- **Icons**: lucide-react
- **Dev**: `concurrently` runs Express API on port 3001 (unused by frontend in dev) + Vite dev server on port 5000
- **Deployment**: Static — `npm run build` → `dist/` served by EdgeOne CDN
- **Persistence**: localStorage only (no database)

## Signal Ingestion — collectSignals()
- 32 public RSS feeds across: Global Affairs, Security/Defense, Technology/Cyber, Markets/Energy, Domestic/Policy
- Fetched in parallel via `Promise.allSettled()` using `https://api.rss2json.com/v1/api.json?rss_url=ENCODED_URL`
- Per-feed 8s AbortController timeout; failed feeds are silently skipped
- Free tier: no API key required (no `count` param allowed; default 10 items/feed returned)
- Deduplication by normalized title prefix (48 chars) — sorts by timestamp descending — caps at 300 signals
- Domain classifier (`classifyDomain`) infers domain from title keywords: Security/Defense, Technology Systems, Markets, Domestic/Policy, Global Affairs

## Project Layout
```
/
├── index.html          # HTML entry point
├── server.mjs          # Express server (dev API + static fallback — not used by static frontend)
├── vite.config.ts      # Vite config (port 5000, /api proxy → 3001)
├── tsconfig.json
├── package.json
├── public/
│   └── rsr-seal.png    # RSR seal image
├── dist/               # Built static site (deploy this)
├── src/
│   ├── main.tsx        # React root
│   ├── App.tsx         # Main app — collectSignals(), brief generation, archive
│   ├── index.css       # All styles
│   └── lib/
│       ├── types.ts    # TypeScript type definitions
│       └── utils.ts    # Utility functions (scoring, export, storage helpers)
```

## Key Features
- **Browser-native** RSS signal ingestion via rss2json — 32 feeds, 300 signals, ~500ms cold pull
- Threat matrix scoring (GUARDED / ELEVATED / HIGH / CRITICAL) across 4 domains
- Signal queue: pin, dismiss, verify, exclude, analyst notes per signal
- Brief generation: Quick Brief, Daily AXION Report, Weekly AXION Report
- Signal archive with search, filter (threat/mode), sort, star, rename, analyst notes
- Export: TXT download, Article draft, Bulletin, Print
- RSR seal integrated: boot screen, header, archive watermark
- Boot screen: cinematic sequenced startup with scanlines and fade
- localStorage persistence with -v6 storage keys
- Fallback signals activate only if all 32 feeds fail

## Development
```bash
npm install
npm run dev   # Vite on :5000, API server on :3001 (optional)
```

## Deployment
Configured as a **static** site:
- Build: `npm run build`
- Public dir: `dist`
- Deploy to EdgeOne (or any CDN) — no Node server required
