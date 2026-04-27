# RSR AXION v3.0

## Overview
RSR AXION is an Intelligence Synthesis System — a React + TypeScript + Vite single-page application that ingests live RSS news feeds entirely in the browser, scores signals by severity and confidence, and generates executive intelligence briefs with threat matrix assessments. Runs as a fully static frontend with no backend dependency.

## Architecture
- **Frontend**: React 18 + TypeScript, bundled with Vite 5
- **Signal Ingestion**: Browser-native `collectSignals()` using rss2json CORS proxy (`api.rss2json.com`) — no backend required
- **Styling**: Plain CSS (`src/index.css`) — Orbitron (display) + IBM Plex Mono (data/mono) via Google Fonts
- **Icons**: lucide-react
- **Dev**: `concurrently` runs Express API on port 3001 + Vite dev server on port 5000
- **Deployment**: Static — `npm run build` → `dist/assets-v3/` served by EdgeOne CDN
- **Persistence**: localStorage only, keys at `-v6` suffix

## v3.0 Visual System
- **Palette**: Steel/black — `#050608` base, no purple, steel-cyan `rgba(56,189,248,*)` as primary accent
- **Fonts**: Orbitron 400/700/900 for brand/display/metric values; IBM Plex Mono 400/500/600 for all data/mono/UI text
- **Metric classes**: `.steel` (sky-300 #7dd3fc), `.white`, `.amber`, `.green`
- **Buttons**: `.accent` uses steel-cyan border/glow; `.modeBtn` for Daily/Weekly/Full mode toggle
- **Elevated threat level**: steel-cyan (replaced purple)
- **Print/document mode**: `@media print` section hides UI chrome, renders brief as clean document

## Signal Ingestion — collectSignals()
- 32 public RSS feeds across: Global Affairs, Security/Defense, Technology/Cyber, Markets/Energy, Domestic/Policy
- Fetched in parallel via `Promise.allSettled()` using `https://api.rss2json.com/v1/api.json?rss_url=ENCODED_URL`
- Per-feed 8s AbortController timeout; failed feeds are silently skipped
- Domain classifier (`classifyDomain`) infers domain from title keywords: Security / Defense, Technology Systems, Markets, Domestic / Policy, Global Affairs
- Deduplication by normalized title prefix — caps at 300 signals

## Brief Modes
- **Daily** — standard synthesis brief
- **Weekly** — extended weekly cycle brief
- **Full** — comprehensive 13-section operator brief (depth="full" via `buildFullBrief`)
- **Quick** — 5-signal rapid assessment

## Project Layout
```
/
├── index.html          # HTML entry point
├── server.mjs          # Express server (dev API + static fallback)
├── vite.config.ts      # Vite config (port 5000, assets at assets-v3/)
├── tsconfig.json
├── package.json
├── public/
│   └── rsr-seal.png    # RSR seal image
├── dist/               # Built static site (deploy this)
├── functions/api/      # CloudFlare/EdgeOne function: axion-status.js
├── src/
│   ├── main.tsx        # React root
│   ├── App.tsx         # Main app — collectSignals(), brief generation, archive, domain filter
│   ├── index.css       # All styles (v3: Orbitron + IBM Plex Mono, steel palette)
│   └── lib/
│       ├── types.ts    # TypeScript types: Mode, BriefDepth, DomainFilter, HistoryEntry, etc.
│       └── utils.ts    # Utility functions: pressure model, 13-section full brief, scoring, export
│   └── components/
│       └── BlackdogStatus.tsx  # BLACKDOG system status badge
```

## Key Features
- **Browser-native** RSS signal ingestion via rss2json — 32 feeds, 300 signals max
- Threat matrix scoring (GUARDED / ELEVATED / HIGH / CRITICAL) across 4 domains
- Pressure model integrated into `buildFullBrief` for threat calibration
- Signal queue: pin, dismiss, verify, exclude, analyst notes per signal
- Domain filter chips: ALL / Global Affairs / Security / Defense / Technology Systems / Markets / Domestic / Policy
- Brief generation: Quick Brief, Daily Brief, Weekly Brief, Full Brief (13-section)
- Signal archive with search, filter (threat/mode/sort), star, rename, analyst notes
- Archive mode filter includes: daily / weekly / full / quick
- Export: TXT download, Article draft, Bulletin, Print (document mode)
- RSR seal: boot screen, header, archive watermark
- Boot screen: cinematic sequenced startup with fade
- localStorage persistence with -v6 storage keys
- Fallback signals activate if all feeds fail

## Development
```bash
npm install
npm run dev   # Vite on :5000
npm run build # Output: dist/assets-v3/
```

## Deployment
Configured as a **static** site:
- Build: `npm run build`
- Public dir: `dist`
- Deploy to EdgeOne CDN — no Node server required
- `public/_routes.json` configures CloudFlare Pages routing for `/api/*`
