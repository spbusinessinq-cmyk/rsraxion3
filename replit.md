# RSR AXION v3.0

## Overview
RSR AXION is an Intelligence Synthesis System — a React + TypeScript + Vite single-page application that ingests live RSS news feeds entirely in the browser, applies multi-factor scoring to signals, and generates executive intelligence briefs with threat matrix assessments. Runs as a fully static frontend with no backend dependency.

## Architecture
- **Frontend**: React 18 + TypeScript, bundled with Vite 5
- **Signal Ingestion**: Browser-native `collectSignals()` using rss2json CORS proxy (`api.rss2json.com`) — no backend required
- **Styling**: Plain CSS (`src/index.css`) — Orbitron (display) + IBM Plex Mono (data/mono) via Google Fonts
- **Icons**: lucide-react
- **Dev**: `concurrently` runs Express API on port 3001 + Vite dev server on port 5000
- **Deployment**: Static — `npm run build` → `dist/assets-v3/` served by EdgeOne CDN
- **Persistence**: localStorage only, keys at `-v6` suffix

## v3.0 Intelligence Engine (June 2025)

### Multi-Factor Scoring (scoreSignal)
Four-component scoring model — no random values:
- **A. Relevance Score** (0–100): domainWeight + institutionalImpact + systemImpact + crossDomainPotential + recencyWeight
- **B. Confidence Score** (0–100): sourceReliability + titleClarity + recencyIntegrity
- **C. Threat Score** (0–100): threatBase + systemicImpact + geographicSpread + escalationVelocity + crossDomainPotential
- **D. Priority Score**: used for sort order (confidence × 0.6 + severity × 10 + recency)

### Signal Intake
- **~62 RSS feeds** across 9 domain categories, batched in groups of 20
- **PER_FEED = 25** items per feed (pipeline target toward 2,000 signals)
- Post-dedup cap: 450 signals sorted by priority score
- Hard relevance filter (`isStrategicallyRelevant`) excludes entertainment, sports, lifestyle, gossip
- Positive strategic keywords required for signal to pass
- Failed feeds silently skipped; 8.5s AbortController timeout per feed

### Domain Classification (16 internal domains)
Security / Defense | Cyber / Signals | AI / Compute | Energy | Supply Chains | Infrastructure | Markets / Economy | Policy / Regulation | Legal / Courts | Social Stability | Public Health / Biosecurity | Space / Orbital Systems | Information Warfare | Global Affairs | Governance / Institutions | (feed default fallback)

### Threat Posture Bands
`scoreBand(clusterCount)`: 0–1=LOW | 2–3=GUARDED | 4–5=ELEVATED | 6–7=HIGH | 8+=CRITICAL
`numericThreatBand(score)`: 0–30=LOW | 31–49=GUARDED | 50–69=ELEVATED | 70–84=HIGH | 85–100=CRITICAL

### Pressure Model
- `assessPressureState(event)`: BUILDING | TRANSFERRING | RELEASING | STABLE | FRAGMENTED
- `inferPressureVector(event)`: infers source→target domain transmission (e.g., Energy→Markets)

## 14-Section Full Intelligence Brief Structure
§1 Executive Overview | §2 Threat Posture Summary | §3 Data Summary | §4 Domain Pressure Chart (text bar) | §5 Primary Signals (9-field: EVENT/CONTEXT/MECHANISM/WHY IT MATTERS/SYSTEM IMPACT/PRESSURE STATE/VECTOR/FORWARD OUTLOOK/WATCHPOINT) | §6 Signal Matrix by confidence tier | §7 System Mechanics | §8 System Intersection | §9 Pressure Map | §10 Constraints | §11 Forward Projection (4 paths) | §12 Operator Takeaway | §13 Watchpoints | §14 Appendix

### Brief Signal Limits
- Quick: 6 signals (1 page equiv)
- Daily: 15 signals (2–3 pages)
- Weekly: 25 signals (4–6 pages)
- Full: 40 signals (5–7 pages, states insufficient density if < 8 signals)

## v3.0 Visual System
- **Palette**: Operator-grade steel/black — `#050608` base, zero purple/violet/indigo anywhere
- **Accent**: Steel-cyan `rgba(56,189,248,*)` only as rare data highlight
- **Fonts**: Orbitron 400/700/900 for brand/display; IBM Plex Mono 400/500/600 for all data/UI text
- **Global scrollbars**: 6px width, `#050608` track, `#2a2f36` thumb, `#3a424d` hover — standardized everywhere
- **Queue cards**: Compact operator-grade rows — 2-line summary clamp, small controls, minimal padding
- **Domain chips in UI**: ALL / Global Affairs / Security / Defense / Cyber / Signals / Technology / Markets / Economy / Energy / Policy / Regulation / Infrastructure

## Print/PDF Output
- `buildPrintHtml(text)` generates a full HTML document with Orbitron headings, metadata table, section blocks
- Auto-print script on load; professional @media print CSS with page-break handling
- Clean white document — not the dark console view

## Exports
- **TXT**: Full brief text with header + all sections
- **Article**: 7-section publishable analysis (Opening / Background / Current Developments / Mechanism / System Implications / Outlook / Closing)
- **Bulletin**: Compact 5-section situational bulletin (Posture / Key Developments / Strategic Implication / Watch Indicators)
- **Print**: Opens professional print HTML in new window

## Signal Lifecycle States
- verified / used in brief / dismissed / excluded / pinned — all persisted to localStorage
- Analyst notes per signal persisted to localStorage

## Key Files
- `src/App.tsx` — shell, feed ingestion, state machine, UI
- `src/lib/utils.ts` — intelligence engine: scoring, brief builders, pressure model
- `src/lib/types.ts` — TypeScript interfaces
- `src/index.css` — complete styling, scrollbars, print CSS
- `src/components/BlackdogStatus.tsx` — status badge
- `vite.config.ts` — build config (outDir: dist/assets-v3)
- `public/_routes.json` — EdgeOne CDN routing
