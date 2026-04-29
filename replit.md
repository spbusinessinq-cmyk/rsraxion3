# RSR AXION v3.0

## Overview
RSR AXION is an Intelligence Synthesis System — a React + TypeScript + Vite single-page application that ingests live RSS news feeds entirely in the browser, applies multi-factor scoring to signals, and generates executive intelligence briefs with threat matrix assessments. Runs as a fully static frontend with no backend dependency.

## Architecture
- **Frontend**: React 18 + TypeScript, bundled with Vite 5
- **Signal Ingestion**: Browser-native `collectSignals()` with 4-strategy fetch cascade (see below)
- **Dev Proxy**: Express server (port 3001) exposes `/api/proxy/rss?url=` — Node.js fetches RSS with proper headers bypassing domain blocks. Vite proxies `/api/*` to port 3001.
- **Styling**: Plain CSS (`src/index.css`) — Orbitron (display) + IBM Plex Mono (data/mono) via Google Fonts
- **Icons**: lucide-react
- **Dev**: `concurrently` runs Express API on port 3001 + Vite dev server on port 5000
- **Deployment**: Static — `npm run build` → `dist/assets-v3/` served by EdgeOne CDN
- **Persistence**: localStorage only, keys at `-v6` suffix

## Signal Fetch Strategy (4-tier cascade)
Each feed is attempted with 4 strategies in sequence, stopping at first success:
1. **rss2json** (`api.rss2json.com`, 4s timeout) — works in production on EdgeOne CDN; blocked with HTTP 422 from Replit preview domain
2. **Local Node proxy** (`/api/proxy/rss?url=`, 5.5s timeout) — works in dev; Node.js fetches with Googlebot User-Agent bypassing CDN blocks; fast 404 in production (no server on CDN)
3. **allorigins.win** (6s timeout) — external CORS proxy + DOMParser XML parsing; supplemental fallback
4. **corsproxy.io** (5s timeout) — last resort CORS proxy + DOMParser XML parsing

## Tiered Fallback Logic
- **≥ 50 live usable signals**: No fallback. UI shows "Live feed" badge.
- **20–49 live usable signals**: Supplement with labeled fallback signals up to 50. UI shows "Supplemented" badge.
- **< 20 live usable signals**: Full fallback mode. UI shows "Fallback mode" badge.

## RSS XML Parser (`parseRssXml`)
Browser DOMParser handles RSS 2.0 (`channel > item`) and Atom (`feed > entry`). Used by strategies 3 and 4 which proxy raw XML.

## Dev Performance (Replit Preview)
- Strategy 1 fails fast (~300ms/feed via 422)
- Strategy 2 succeeds for ~51/78 feeds (~1-3s each)
- Strategy 3 handles ~1-2 additional feeds
- Total pull time: ~27-34 seconds for all 78 feeds
- Consistent results: ok=51-53/78 · raw=997-1028 · scored=500

## v3.0 Intelligence Engine (Pass 2)

### Source Reliability Tiers
Four-tier model anchored to source identity, not keyword strength:
- **Tier 1** (Official/Institutional): cisa.gov, eia.gov, federalregister.gov, sec.gov, nasa.gov, who.int, understandingwar.org, iswresearch.org, defense.gov, hhs.gov
- **Tier 2** (Major Wire/Established): reuters.com, bbc.co.uk, apnews.com, nytimes.com, theguardian.com, ft.com, bloomberg.com, cnbc.com, aljazeera.com, npr.org, axios.com, politico.com, thehill.com, foreignaffairs.com, cfr.org
- **Tier 3** (Specialist/Trade): krebsonsecurity.com, bleepingcomputer.com, darkreading.com, defensenews.com, defenseone.com, breakingdefense.com, thedrive.com, navalnews.com, warontherocks.com, oilprice.com, freightwaves.com, rand.org, brookings.edu, statnews.com, wired.com, techcrunch.com, arstechnica.com, theregister.com, zdnet.com, spacenews.com
- **Tier 4**: Unknown / unverified sources

Confidence base by tier:
- T1: 88 base → 85–97 range
- T2: 76 base → 73–90 range
- T3: 64 base → 61–82 range
- T4: 55 base → 52–72 range

Confidence is NOT keyword-inflated — it is anchored to source tier + title specificity + summary length + recency + corroboration.

### Multi-Factor Scoring (scoreSignal)
Four-component scoring model:
- **A. Relevance Score** (0–100): domainWeight + institutionalImpact + systemImpact + crossDomainPotential + recencyWeight
- **B. Confidence Score** (0–100): tierBase + titleClarity + summaryBonus + corroborationBoost + recency
- **C. Threat Score** (0–100): threatBase + systemicImpact + geographicSpread + escalationVelocity
- **D. Priority Score**: confidence × 0.55 + severity × 10 + recency × 8 + corrobBonus

### Corroboration Logic
- After collecting from all feeds, signals grouped by normalized title prefix (50 chars)
- Best signal in each group selected: lowest tier number first, then longest summary
- `sourceCount` set to group size; `corroborated = true` if sourceCount > 1
- Corroborated signals receive up to +10 confidence boost (sourceCount - 1) × 4
- Displayed in UI with ◆ indicator and source count
- Included in brief Signal Matrix with ◆ marker

### Signal Quality Gate — Rejection Reason Codes
Every signal is checked before scoring:
- `NO_SYSTEM_RELEVANCE` — no strategic keyword in title or summary
- `ENTERTAINMENT_NOISE` — celebrity, awards, film, k-pop, etc.
- `SPORTS_NOISE` — sports unless tied to institutional/security relevance
- `LIFESTYLE_NOISE` — recipes, travel, wellness, fashion
- `EMPTY_SUMMARY` — title too short or blank
- `DUPLICATE_LOW_VALUE` — handled by corroboration deduplification
- `WEAK_SOURCE` — reserved for future feed-level scoring

Rejection breakdown is tracked per-pull and reported in §3 Data Summary of the brief.

### Feed Health Tracking
Per-feed `FeedHealth` object: `{ source, domain, success, itemCount, errorType, lastChecked }`
- Failed feeds are quietly logged (not shown in UI)
- Do not reduce confidence of successfully collected signals
- Feed health stats aggregated into `SignalPipelineStats`

### Signal Intake Pipeline Stats (`SignalPipelineStats`)
Tracked per-pull: rawCount, parsedCount, rejectedCount, rejectionBreakdown, dedupCount, usableCount, successFeeds, failFeeds, feedHealth[], topDomains[], weakDomains[], elapsed

### Signal Intake Scale
- **68 curated RSS feeds** across 12 domain categories (was 49)
- New sources: AP News (world/intl/politics/business/health), Federal Register, Space.com, SpaceNews, Wired Security, Wired AI, The Verge, BBC Health/Business, NYT Economy, NPR, CNBC dual feed, Thomas Net, Utility Dive, ENR
- **PER_FEED = 25** items per feed
- Batched in groups of 20 to keep UI responsive
- Post-dedup cap: 500 signals sorted by priority score

### Domain Classification (16 internal domains)
Security / Defense | Cyber / Signals | AI / Compute | Energy | Supply Chains | Infrastructure | Markets / Economy | Policy / Regulation | Legal / Courts | Social Stability | Public Health / Biosecurity | Space / Orbital Systems | Information Warfare | Global Affairs | Governance / Institutions | (feed default fallback)

### Threat Posture Bands
`scoreBand(clusterCount)`: 0–1=LOW | 2–3=GUARDED | 4–5=ELEVATED | 6–7=HIGH | 8+=CRITICAL
`numericThreatBand(score)`: 0–30=LOW | 31–49=GUARDED | 50–69=ELEVATED | 70–84=HIGH | 85–100=CRITICAL

### Pressure Model
- `assessPressureState(event)`: BUILDING | TRANSFERRING | RELEASING | STABLE | FRAGMENTED
- `inferPressureVector(event)`: infers source→target domain transmission
- `buildPressureVectorTable`: groups all vectors by source→target, shows intensity and signal count

## 14-Section Full Intelligence Brief Structure
§1 Executive Overview (includes corroborated signal count, pipeline summary line) | §2 Threat Posture Summary | §3 Data Summary (Signal Intake Table + Source Health Table + Confidence Distribution + Domain/Metric Summary) | §4 Domain Pressure Chart (text bar with %, count, band) | §5 Primary Signals (10-field blocks: domain/tier/corroboration, confidence, event, context, mechanism, why it matters, system impact, pressure state/vector, forward outlook, watchpoint) | §6 Signal Matrix by confidence tier (with tier label, corroboration indicator) | §7 System Mechanics | §8 System Intersection | §9 Pressure Map + Vector Table | §10 Constraints | §11 Forward Projection (4 paths) | §12 Operator Takeaway | §13 Watchpoints | §14 Appendix (grouped by domain, sorted by signal count)

### Brief Signal Limits
- Quick: 6 signals (1 page equiv)
- Daily: 15 signals (2–3 pages)
- Weekly: 25 signals (4–6 pages)
- Full: 40 signals (5–7 pages, states insufficient density if < 8 signals)

### Optional 7th Parameter
`buildFullBrief(sourceSet, matrix, patterns, mode, depth, now, stats?)` — pass `SignalPipelineStats` for full intake table; omit for fallback/archive mode

## UI Signal Count Transparency
Metric strip labels changed from RSR Verified/Live Signals to:
- **Raw Collected**: total feed items before relevance filter (— if fallback)
- **Usable Signals**: after corroboration + scoring + dedup cap
- **Used In Brief**: signals used in current brief generation
- **Confidence**: average confidence of visible signals

Queue card now shows: source · T1/T2/T3/T4 tier · ◆N (if corroborated) · CONFIDENCE% · severity dots

## v3.0 Visual System
- **Palette**: Operator-grade steel/black — `#050608` base, zero purple/violet/indigo anywhere
- **Accent**: Steel-cyan `rgba(56,189,248,*)` only as rare data highlight
- **Fonts**: Orbitron 400/700/900 for brand/display; IBM Plex Mono 400/500/600 for all data/UI text
- **Global scrollbars**: 6px width, `#050608` track, `#2a2f36` thumb, `#3a424d` hover
- **Queue cards**: Compact operator-grade rows — 2-line summary clamp, small controls, corroboration ◆ indicator
- **Domain chips in UI**: ALL / Global Affairs / Security / Defense / Cyber / Signals / Technology / Markets / Economy / Energy / Policy / Regulation / Infrastructure

## Print/PDF Output
- `buildPrintHtml(text)` generates full HTML document with Orbitron headings, metadata table, structured section blocks
- Auto-print script on load; professional @media print CSS with page-break handling
- Sub-section headers (`──`) rendered as sub-heads; dividers rendered as hr elements

## Exports
- **TXT**: Full brief text with header + all sections
- **Article**: 7-section publishable analysis (Opening / Background / Current Developments / Mechanism / System Implications / Outlook / Closing) — includes tier note on source mix
- **Bulletin**: Compact 5-section situational bulletin (Posture / Key Developments / Strategic Implication / Pattern / Watch Indicators) — includes tier and corroboration labels
- **Print**: Opens professional print HTML in new window

## Signal Lifecycle States
- verified / used in brief / dismissed / excluded / pinned — all persisted to localStorage
- Analyst notes per signal persisted to localStorage

## Key Files
- `src/App.tsx` — shell, feed ingestion (68 feeds), signal pipeline, UI
- `src/lib/utils.ts` — intelligence engine: source tiers, scoring, brief builders, data tables, pressure model
- `src/lib/types.ts` — TypeScript interfaces (FeedHealth, SignalPipelineStats, RejectionReason added)
- `src/index.css` — complete styling, scrollbars, print CSS
- `src/components/BlackdogStatus.tsx` — status badge
- `vite.config.ts` — build config (outDir: dist/assets-v3)
- `public/_routes.json` — EdgeOne CDN routing
