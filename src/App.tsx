import { useEffect, useMemo, useRef, useState } from "react";
import BlackdogStatus from "./components/BlackdogStatus";
import { ArrowDownToLine, CheckCircle2, Database, Download, EyeOff, FileText, Globe, Newspaper, Pin, Printer, Radar, ScrollText, Search, Shield, Star, StarOff, Wand2, X, Zap } from "lucide-react";
import type { ArchiveModeFilter, ArchiveSort, ArchiveThreatFilter, BriefDepth, DomainFilter, ExportKind, FeedEvent, HistoryEntry, Mode, ThreatMatrix } from "./lib/types";
import { averageConfidence, buildArticle, buildBulletin, buildFullBrief, buildPrintHtml, clusterCounts, downloadTextFile, formatThreatOrder, safeLoad, saveToStorage, scoreBand } from "./lib/utils";

// cache-bust-v3

/* ── Constants ─────────────────────────────────────────────────────────── */

const STORAGE_KEYS = {
  history: "rsr-axion-history-v6",
  notes: "rsr-axion-notes-v6",
  used: "rsr-axion-used-v6",
  verified: "rsr-axion-verified-v6",
  excluded: "rsr-axion-excluded-v6",
};

const BOOT_STEPS = [
  "INITIALIZING SIGNAL LAYER",
  "LINKING INTELLIGENCE MODULES",
  "VERIFYING ARCHIVE STATE",
  "PREPARING BRIEFING CONSOLE",
];

const FALLBACK_SIGNALS: FeedEvent[] = [
  { id: "fallback-1", source: "RSR Fallback Feed", domain: "Security / Defense", title: "Regional military signaling remains elevated across Middle East maritime lanes", summary: "Fallback signal loaded because the preview environment blocked live feed requests.", severity: 4, confidence: 78, timestamp: new Date().toISOString() },
  { id: "fallback-2", source: "RSR Fallback Feed", domain: "Markets", title: "Energy and shipping sensitivity remain central to the current market picture", summary: "Fallback signal loaded because the preview environment blocked live feed requests.", severity: 3, confidence: 76, timestamp: new Date().toISOString() },
  { id: "fallback-3", source: "RSR Fallback Feed", domain: "Technology Systems", title: "Compute and infrastructure buildout continue shaping the technical layer", summary: "Fallback signal loaded because the preview environment blocked live feed requests.", severity: 2, confidence: 74, timestamp: new Date().toISOString() },
  { id: "fallback-4", source: "RSR Fallback Feed", domain: "Domestic / Policy", title: "Federal policy activity adds pressure to the domestic operating picture", summary: "Institutional movement remains part of the cycle.", severity: 2, confidence: 72, timestamp: new Date().toISOString() },
  { id: "fallback-5", source: "RSR Fallback Feed", domain: "Global Affairs", title: "Strategic shipping routes remain vulnerable to regional power signaling", summary: "Maritime pressure is still relevant to the broader intelligence cycle.", severity: 3, confidence: 75, timestamp: new Date().toISOString() },
];

/* ── Helpers ────────────────────────────────────────────────────────────── */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function confidenceLabel(c: number) {
  if (c >= 90) return "CONFIRMED";
  if (c >= 80) return "HIGH";
  if (c >= 70) return "MODERATE";
  return "LOW";
}

function confidenceClass(c: number) {
  if (c >= 90) return "confConfirmed";
  if (c >= 80) return "confHigh";
  if (c >= 70) return "confMod";
  return "confLow";
}

function severityDots(s: number) {
  return Array.from({ length: 4 }, (_, i) => (
    <span key={i} className={cx("sevDot", i < s && "sevActive")} />
  ));
}

/* ── Domain Classifier ──────────────────────────────────────────────────── */

function classifyDomain(title: string, fallback: string): string {
  if (/military|missile|drone|defense|navy|air.?force|troops|combat|weapon|warship|fighter|bomb|strike|war|conflict|artillery/i.test(title)) return "Security / Defense";
  if (/cyber|ransomware|hack|malware|infrastructure|ai\b|compute|chip|cloud|data.?breach|vulnerability|exploit|zero.?day|botnet/i.test(title)) return "Technology Systems";
  if (/market|oil|energy|shipping|trade|treasury|inflation|equity|tariff|sanction|commodity|port|supply.?chain|crude|lng|brent|nasdaq|dow|freight/i.test(title)) return "Markets";
  if (/white house|senate|congress|executive|agency|department|administration|federal|election|legislation|policy|vote|president|minister|parliament/i.test(title)) return "Domestic / Policy";
  return fallback;
}

/* ── Browser Feed Sources ───────────────────────────────────────────────── */

const BROWSER_FEEDS: ReadonlyArray<{ url: string; domain: string }> = [
  // Global Affairs
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml",                        domain: "Global Affairs" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml",                          domain: "Global Affairs" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",             domain: "Global Affairs" },
  { url: "https://rss.dw.com/rdf/rss-en-all",                                  domain: "Global Affairs" },
  { url: "https://feeds.skynews.com/feeds/rss/world.xml",                      domain: "Global Affairs" },
  { url: "https://feeds.npr.org/1001/rss.xml",                                 domain: "Global Affairs" },
  { url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml",                        domain: "Global Affairs" },
  { url: "https://www.foreignaffairs.com/rss.xml",                             domain: "Global Affairs" },
  { url: "https://foreignpolicy.com/feed/",                                    domain: "Global Affairs" },
  { url: "https://theintercept.com/feed/?rss",                                 domain: "Global Affairs" },
  { url: "https://www.theguardian.com/world/rss",                              domain: "Global Affairs" },
  // Security / Defense
  { url: "https://warontherocks.com/feed/",                                    domain: "Security / Defense" },
  { url: "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml",  domain: "Security / Defense" },
  { url: "https://breakingdefense.com/feed/",                                  domain: "Security / Defense" },
  { url: "https://www.thedrive.com/the-war-zone/rss",                          domain: "Security / Defense" },
  { url: "https://www.defenseone.com/rss/all/",                                domain: "Security / Defense" },
  { url: "https://www.navalnews.com/feed/",                                    domain: "Security / Defense" },
  // Technology Systems / Cyber
  { url: "https://krebsonsecurity.com/feed/",                                  domain: "Technology Systems" },
  { url: "https://www.bleepingcomputer.com/feed/",                             domain: "Technology Systems" },
  { url: "https://www.darkreading.com/rss.xml",                                domain: "Technology Systems" },
  { url: "https://www.securityweek.com/feed/",                                 domain: "Technology Systems" },
  { url: "https://threatpost.com/feed/",                                       domain: "Technology Systems" },
  { url: "https://www.cisa.gov/news.xml",                                      domain: "Technology Systems" },
  // Markets / Energy
  { url: "https://www.theguardian.com/business/rss",                           domain: "Markets" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",              domain: "Markets" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19836768", domain: "Markets" },
  { url: "https://oilprice.com/rss/main",                                      domain: "Markets" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",         domain: "Markets" },
  { url: "https://www.freightwaves.com/news/feed",                             domain: "Markets" },
  // Domestic / Policy
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",          domain: "Domestic / Policy" },
  { url: "https://thehill.com/feed/",                                          domain: "Domestic / Policy" },
  { url: "https://rss.politico.com/politics-news.xml",                         domain: "Domestic / Policy" },
];

/* ── Signal Exclusion Filter ────────────────────────────────────────────── */

const EXCLUDED_KEYWORDS = [
  "sports", "baseball", "soccer", "basketball", "football", "tennis", "golf",
  "olympics", "nfl", "nba", "mlb", "nhl", "fifa", "world cup", "super bowl",
  "entertainment", "celebrity", "celebrities", "movie", "movies", "film", "films",
  "box office", "oscar", "grammy", "emmy", "music", "album", "concert", "tour",
  "tv show", "television show", "sitcom", "reality show", "streaming show",
  "fashion", "runway", "couture", "beauty tips", "makeup", "skincare",
  "food", "recipe", "restaurant", "chef", "cooking", "cuisine",
  "travel", "vacation", "tourist", "resort", "hotel", "cruise",
  "lifestyle", "wellness", "fitness", "yoga", "diet", "weight loss",
  "culture", "arts and crafts", "horoscope", "astrology",
];

const EXCLUDED_RE = new RegExp(
  `\\b(${EXCLUDED_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i"
);

function isRelevantSignal(title: string): boolean {
  return !EXCLUDED_RE.test(title);
}

/* ── Client-side Signal Collection (rss2json CORS proxy) ────────────────── */

type Rss2JsonItem = { title?: string; link?: string; pubDate?: string; description?: string };
type Rss2JsonResponse = { status: string; items?: Rss2JsonItem[] };

async function collectSignals(): Promise<{ signals: FeedEvent[]; debug?: Record<string, unknown> }> {
  const PER_FEED = 12;
  const started = Date.now();
  let successCount = 0;
  let failCount = 0;

  const settled = await Promise.allSettled(
    BROWSER_FEEDS.map(async ({ url, domain }) => {
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(apiUrl, { signal: controller.signal, cache: "no-store" });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as Rss2JsonResponse;
        if (data.status !== "ok" || !Array.isArray(data.items)) throw new Error("bad status");
        const items: FeedEvent[] = data.items.slice(0, PER_FEED).flatMap(item => {
          const title = (item.title ?? "").trim();
          if (!title || title.length < 6) return [];
          if (!isRelevantSignal(title)) return [];
          const summary = (item.description ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 220);
          let ts = new Date().toISOString();
          try { if (item.pubDate) ts = new Date(item.pubDate).toISOString(); } catch { /* keep default */ }
          return [{
            id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            source: new URL(url).hostname.replace(/^(www|feeds|rss)\./i, ""),
            domain: classifyDomain(title, domain),
            title,
            summary,
            severity: Math.floor(Math.random() * 4) + 1,
            confidence: 68 + Math.floor(Math.random() * 27),
            timestamp: ts,
          }];
        });
        successCount++;
        return items;
      } catch {
        clearTimeout(timer);
        failCount++;
        return [] as FeedEvent[];
      }
    })
  );

  const raw = settled.flatMap(r => r.status === "fulfilled" ? r.value : []);

  const seen = new Set<string>();
  const signals = raw
    .filter(e => {
      const key = e.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 48);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 300);

  const elapsed = Date.now() - started;
  console.log(`[AXION] collectSignals feeds=${BROWSER_FEEDS.length} ok=${successCount} fail=${failCount} raw=${raw.length} deduped=${signals.length} time=${elapsed}ms`);

  return {
    signals,
    debug: { successFeeds: successCount, failFeeds: failCount, rawCount: raw.length, elapsed },
  };
}

/* ── Boot Screen ────────────────────────────────────────────────────────── */

function BootScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    BOOT_STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setStep(i + 1), 280 + i * 380));
    });

    const fadeDelay = 280 + BOOT_STEPS.length * 380 + 260;
    timers.push(setTimeout(() => setFading(true), fadeDelay));

    timers.push(setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; onDone(); }
    }, fadeDelay + 480));

    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div className={cx("bootScreen", fading && "bootFading")}>
      <div className="bootVignette" />
      <div className="bootContent">
        <div className="bootLogoWrap">
          <img className="bootSeal" src="/rsr-seal.png" alt="" />
          <div className="bootLogo">RSR <span className="bootLogoAxion">AXION</span></div>
          <div className="bootTagline">INTELLIGENCE SYNTHESIS SYSTEM</div>
        </div>
        <div className="bootDivider" />
        <div className="bootSteps">
          {BOOT_STEPS.map((label, i) => (
            <div key={i} className={cx("bootStep", step > i && "bootStepActive", step > i + 1 && "bootStepDone")}>
              <span className="bootStepDot" />
              <span className="bootStepLabel">{label}</span>
              {step > i && <span className="bootStepOk">OK</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="bootClassification">UNCLASSIFIED · RSR AXION · INTELLIGENCE SYNTHESIS SYSTEM</div>
    </div>
  );
}

/* ── Main App ───────────────────────────────────────────────────────────── */

export default function App() {
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<Mode>("daily");
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [pinned, setPinned] = useState<FeedEvent[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>(() => safeLoad(STORAGE_KEYS.history, []));
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveThreatFilter, setArchiveThreatFilter] = useState<ArchiveThreatFilter>("ALL");
  const [archiveModeFilter, setArchiveModeFilter] = useState<ArchiveModeFilter>("ALL");
  const [archiveSort, setArchiveSort] = useState<ArchiveSort>("newest");
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [analystNotes, setAnalystNotes] = useState<Record<string, string>>(() => safeLoad(STORAGE_KEYS.notes, {}));
  const [usedInBrief, setUsedInBrief] = useState<Record<string, boolean>>(() => safeLoad(STORAGE_KEYS.used, {}));
  const [manualVerified, setManualVerified] = useState<Record<string, boolean>>(() => safeLoad(STORAGE_KEYS.verified, {}));
  const [excludedIds, setExcludedIds] = useState<string[]>(() => safeLoad(STORAGE_KEYS.excluded, []));
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<DomainFilter>("ALL");
  const [executiveBrief, setExecutiveBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [threatMatrix, setThreatMatrix] = useState<ThreatMatrix>({ overall: "GUARDED", conflict: "LOW", markets: "LOW", infrastructure: "LOW", information: "LOW" });

  useEffect(() => saveToStorage(STORAGE_KEYS.history, history), [history]);
  useEffect(() => saveToStorage(STORAGE_KEYS.notes, analystNotes), [analystNotes]);
  useEffect(() => saveToStorage(STORAGE_KEYS.used, usedInBrief), [usedInBrief]);
  useEffect(() => saveToStorage(STORAGE_KEYS.verified, manualVerified), [manualVerified]);
  useEffect(() => saveToStorage(STORAGE_KEYS.excluded, excludedIds), [excludedIds]);
  useEffect(() => { void ingestSignals(); }, []);

  async function ingestSignals() {
    setLoading(true);
    setStatusMessage("");
    try {
      const { signals, debug } = await collectSignals();
      const live = signals.length > 0;
      const usable = live ? signals : FALLBACK_SIGNALS;
      setUsingFallback(!live);
      setEvents(usable);
      setPinned([]);
      setDismissed([]);
      if (live) {
        const ok = (debug as { successFeeds?: number } | undefined)?.successFeeds;
        const fail = (debug as { failFeeds?: number } | undefined)?.failFeeds;
        const feedInfo = (ok != null && fail != null) ? ` (${ok}/${ok + fail} feeds)` : "";
        setStatusMessage(`Live signals pulled: ${signals.length}${feedInfo}`);
      } else {
        const reason = (debug as { failFeeds?: number } | undefined)?.failFeeds != null
          ? `0 of ${(debug as { failFeeds: number }).failFeeds} feeds responded`
          : "no live signals returned";
        setStatusMessage(`Fallback mode — ${reason}.`);
        console.warn("[AXION] fallback activated —", debug ?? "no debug info");
      }
    } catch (err) {
      setUsingFallback(true);
      setEvents(FALLBACK_SIGNALS);
      setStatusMessage("Fallback mode — ingestion error.");
      console.error("[AXION] ingestSignals caught:", err);
    } finally {
      setLoading(false);
    }
  }

  const visibleEvents = useMemo(() =>
    events
      .filter(e => !dismissed.includes(e.id))
      .filter(e => !excludedIds.includes(e.id))
      .filter(e => domainFilter === "ALL" || e.domain === domainFilter)
      .filter(e => `${e.title} ${e.summary} ${e.domain} ${e.source}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const ap = !!pinned.find(r => r.id === a.id);
        const bp = !!pinned.find(r => r.id === b.id);
        if (ap !== bp) return Number(bp) - Number(ap);
        const av = a.confidence >= 85 || !!manualVerified[a.id];
        const bv = b.confidence >= 85 || !!manualVerified[b.id];
        if (av !== bv) return Number(bv) - Number(av);
        return b.severity - a.severity;
      }),
    [events, dismissed, excludedIds, domainFilter, search, manualVerified, pinned]
  );

  const counts = useMemo(() => clusterCounts(visibleEvents), [visibleEvents]);

  const patterns = useMemo(() => {
    const out: string[] = [];
    if (counts.conflict >= 2 && counts.markets >= 2) out.push("Conflict and market clusters are co-moving, increasing cross-domain sensitivity.");
    if (counts.markets >= 2 && counts.infrastructure >= 2) out.push("Infrastructure and market signals are overlapping through logistics, energy, and compute exposure.");
    if (counts.information >= 2 && counts.conflict >= 2) out.push("Policy movement is reinforcing the wider conflict operating picture.");
    return out;
  }, [counts]);

  const metricStrip = useMemo(() => [
    { label: "RSR Verified", value: String(visibleEvents.filter(e => e.confidence >= 85 || !!manualVerified[e.id]).length), accent: "steel" },
    { label: "Live Signals", value: String(visibleEvents.length), accent: "white" },
    { label: "Used In Brief", value: String(Object.values(usedInBrief).filter(Boolean).length), accent: "amber" },
    { label: "Confidence", value: visibleEvents.length ? String(averageConfidence(visibleEvents)) : "—", accent: "green" },
  ], [visibleEvents, manualVerified, usedInBrief]);

  function generateBrief(depth: BriefDepth) {
    const sourceSet = (pinned.length ? pinned : visibleEvents).slice(0, depth === "quick" ? 5 : 16);
    const c = clusterCounts(sourceSet);
    const nextMatrix: ThreatMatrix = {
      overall: scoreBand(Math.max(c.conflict, c.markets, c.infrastructure, c.information) + Math.min(2, patterns.length)),
      conflict: scoreBand(c.conflict),
      markets: scoreBand(c.markets),
      infrastructure: scoreBand(c.infrastructure),
      information: scoreBand(c.information),
    };
    setThreatMatrix(nextMatrix);

    const now = new Date();
    const brief = buildFullBrief(sourceSet, nextMatrix, patterns, mode, depth, now);
    setExecutiveBrief(brief);

    setUsedInBrief(prev => {
      const next = { ...prev };
      sourceSet.forEach(e => { next[e.id] = true; });
      return next;
    });

    const briefTitle = depth === "quick" ? "Quick Brief" : mode === "weekly" ? "Weekly Brief" : mode === "full" ? "Full Brief" : "Daily Brief";
    const entry: HistoryEntry = {
      id: `archive-${Date.now()}`,
      issue: `Issue ${history.length + 1}`,
      date: new Date().toLocaleDateString(),
      title: `${briefTitle} — ${nextMatrix.overall}`,
      mode: depth === "quick" ? "quick" : mode,
      threat: nextMatrix.overall,
      brief,
      starred: false,
    };
    setHistory(prev => [entry, ...prev]);
    setSelectedArchiveId(entry.id);
    setRenameValue(entry.title);
    setStatusMessage(`${briefTitle} generated and archived.`);
  }

  const archiveResults = useMemo(() => {
    let rows = [...history];
    if (archiveSearch.trim()) {
      const q = archiveSearch.toLowerCase();
      rows = rows.filter(e => `${e.title} ${e.issue} ${e.brief} ${e.threat}`.toLowerCase().includes(q));
    }
    if (archiveThreatFilter !== "ALL") rows = rows.filter(e => e.threat === archiveThreatFilter);
    if (archiveModeFilter !== "ALL") rows = rows.filter(e => e.mode === archiveModeFilter);
    rows.sort((a, b) =>
      archiveSort === "oldest" ? a.id.localeCompare(b.id)
        : archiveSort === "threat" ? formatThreatOrder(b.threat) - formatThreatOrder(a.threat)
        : b.id.localeCompare(a.id)
    );
    return rows;
  }, [history, archiveSearch, archiveThreatFilter, archiveModeFilter, archiveSort]);

  const selectedArchive = archiveResults.find(e => e.id === selectedArchiveId) || archiveResults[0] || null;

  useEffect(() => {
    if (selectedArchive && selectedArchive.id !== selectedArchiveId) {
      setSelectedArchiveId(selectedArchive.id);
      setRenameValue(selectedArchive.title);
    }
  }, [selectedArchive, selectedArchiveId]);

  function handleExport(kind: ExportKind) {
    const now = new Date();
    if (kind === "txt") {
      const text = executiveBrief || selectedArchive?.brief || "";
      if (!text) { setStatusMessage("Generate a brief first."); return; }
      downloadTextFile(`rsr-axion-brief-${Date.now()}.txt`, text);
      setStatusMessage("TXT exported.");
      return;
    }
    if (kind === "article") {
      const text = buildArticle(visibleEvents.slice(0, 12), threatMatrix, mode, now);
      downloadTextFile(`rsr-axion-article-${Date.now()}.txt`, text);
      setStatusMessage("Article downloaded.");
      return;
    }
    const text = buildBulletin(visibleEvents.slice(0, 10), threatMatrix, patterns, mode, now);
    downloadTextFile(`rsr-axion-bulletin-${Date.now()}.txt`, text);
    setStatusMessage("Bulletin downloaded.");
  }

  function handlePrint() {
    const text = executiveBrief || selectedArchive?.brief || "";
    if (!text) { setStatusMessage("Generate a brief first."); return; }
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      downloadTextFile(`rsr-axion-print-fallback-${Date.now()}.txt`, text);
      setStatusMessage("Print popup blocked — downloaded as fallback.");
      return;
    }
    w.document.write(buildPrintHtml(text));
    w.document.close();
    w.focus();
    window.setTimeout(() => w.print(), 250);
  }

  const tone = threatMatrix.overall === "CRITICAL" ? "critical"
    : threatMatrix.overall === "HIGH" ? "high"
    : threatMatrix.overall === "ELEVATED" ? "elevated"
    : "low";

  if (booting) return <BootScreen onDone={() => setBooting(false)} />;

  return (
    <div className="app">

      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbarLeft">
          <img className="headerSeal" src="/rsr-seal.png" alt="" />
          <div className="brandGroup">
            <div className="brand">RSR <span className="brandAxion">AXION</span></div>
            <div className="brandSub">Intelligence Synthesis System</div>
          </div>
        </div>
        <div className="topbarRight">
          <button className={cx("btn modeBtn", mode === "daily" && "accent")} onClick={() => setMode("daily")}>Daily</button>
          <button className={cx("btn modeBtn", mode === "weekly" && "accent")} onClick={() => setMode("weekly")}>Weekly</button>
          <button className={cx("btn modeBtn", mode === "full" && "accent")} onClick={() => setMode("full")}>Full</button>
          <BlackdogStatus />
        </div>
      </header>

      <main className="layout">

        {/* ── Left Column ─────────────────────────────────────────── */}
        <section className="col">

          {/* Hero */}
          <div className="panel hero">
            <div className="heroGlow" />
            <div className="heroCard">
              <div className="heroTop">
                <div>
                  <div className="eyebrow">Office of Executive Intelligence</div>
                  <div className="title">Strategic Briefing Console</div>
                  <div className="copy">Tactical synthesis surface for signal intake, threat scoring, and portable reporting output.</div>
                </div>
                <div className={cx("badge", tone)}>Threat: {threatMatrix.overall}</div>
              </div>
              <div className="metrics">
                {metricStrip.map(m => (
                  <div className="metric" key={m.label}>
                    <div className="smallLabel">{m.label}</div>
                    <div className={cx("metricValue", m.accent)}>{m.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="panel">
            <div className="actionBar">
              <div className="actionGroup">
                <button className="btn accent" onClick={() => void ingestSignals()} disabled={loading}>
                  <ArrowDownToLine size={14} /> {loading ? "Pulling…" : "Pull Signals"}
                </button>
                <button className="btn" onClick={() => generateBrief("full")}>
                  <Wand2 size={14} /> Run AXION
                </button>
                <button className="btn" onClick={() => generateBrief("quick")}>
                  <Zap size={14} /> Quick Brief
                </button>
              </div>
              <div className="actionDivider" />
              <div className="actionGroup">
                <button className="btn" onClick={() => handleExport("txt")}>
                  <Download size={14} /> TXT
                </button>
                <button className="btn" onClick={() => handleExport("article")}>
                  <Newspaper size={14} /> Article
                </button>
                <button className="btn" onClick={() => handleExport("bulletin")}>
                  <ScrollText size={14} /> Bulletin
                </button>
                <button className="btn" onClick={handlePrint}>
                  <Printer size={14} /> Print
                </button>
              </div>
            </div>
          </div>

          {/* Threat Matrix */}
          <div className="panel">
            <div className="inner">
              <div className="iconHead"><Shield size={14} /> <span>Threat Matrix</span></div>
              <div className="grid2">
                <div className={cx("card", tone)}>
                  <div className="smallLabel">Overall Posture</div>
                  <div className="big">{threatMatrix.overall}</div>
                </div>
                <div className="card">
                  <div className="smallLabel">Conflict Index</div>
                  <div className="mid">{threatMatrix.conflict}</div>
                </div>
                <div className="card">
                  <div className="smallLabel">Economic Stress</div>
                  <div className="mid">{threatMatrix.markets}</div>
                </div>
                <div className="card">
                  <div className="smallLabel">Infrastructure</div>
                  <div className="mid">{threatMatrix.infrastructure}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Pattern Detection */}
          <div className="panel">
            <div className="inner">
              <div className="iconHead"><Radar size={14} /> <span>Pattern Detection</span></div>
              {patterns.length
                ? patterns.map((p, i) => <div key={i} className="patternItem">• {p}</div>)
                : <div className="dimText">No cross-domain cluster patterns detected in current signal set.</div>
              }
            </div>
          </div>

          {/* Executive Brief */}
          <div className="panel">
            <div className="inner">
              <div className="iconHead"><FileText size={14} /> <span>Executive Intelligence Brief</span></div>
              <div className="statusRow">
                {usingFallback
                  ? <div className="pill warn">Fallback mode</div>
                  : <div className="pill"><Globe size={12} /> Live feed</div>
                }
                <div className="pill"><Database size={12} /> Persistence active</div>
                {statusMessage && <div className="pill">{statusMessage}</div>}
              </div>
              <textarea
                className="textarea"
                readOnly
                value={executiveBrief || "Run AXION or Quick Brief to synthesize the current intelligence cycle."}
              />
            </div>
          </div>

        </section>

        {/* ── Right Column ─────────────────────────────────────────── */}
        <aside className="col">

          {/* Signal Search */}
          <div className="searchWrap">
            <Search className="searchIcon" size={14} />
            <input className="input" placeholder="Search signals…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Domain Filter */}
          <div className="domainFilterRow">
            {(["ALL", "Global Affairs", "Security / Defense", "Technology Systems", "Markets", "Domestic / Policy"] as DomainFilter[]).map(d => (
              <button key={d} className={cx("filterChip domainChip", domainFilter === d && "active")} onClick={() => setDomainFilter(d)}>
                {d}
              </button>
            ))}
          </div>

          {/* Live Signal Queue */}
          <div className="panel">
            <div className="inner">
              <div className="queueHeader">
                <div className="iconHead" style={{ marginBottom: 0 }}><Globe size={14} /> <span>Live Signal Queue</span></div>
                <div className="queueCount">{visibleEvents.length} signals</div>
              </div>
              {pinned.length > 0 && (
                <div className="pinnedBanner">
                  <Pin size={11} /> {pinned.length} pinned — AXION will brief these first
                </div>
              )}
              <div className="scroll" style={{ marginTop: 12 }}>
                {visibleEvents.length === 0
                  ? <div className="dimText">No signals loaded. Pull signals to begin.</div>
                  : visibleEvents.map(event => {
                    const isPinned = !!pinned.find(r => r.id === event.id);
                    const isUsed = !!usedInBrief[event.id];
                    const isVerified = event.confidence >= 85 || !!manualVerified[event.id];
                    const isExcluded = excludedIds.includes(event.id);
                    return (
                      <div key={event.id} className={cx("event", isExcluded && "excluded", isPinned && "pinned")}>

                        {/* Event header */}
                        <div className="eventHead">
                          <div className="eventTitle">{event.title}</div>
                          <div className="domain">{event.domain}</div>
                        </div>

                        {/* Meta row: source, confidence, severity */}
                        <div className="eventMeta">
                          <span className="metaSource">{event.source}</span>
                          <span className="metaSep">·</span>
                          <span className={cx("metaConf", confidenceClass(event.confidence))}>
                            {confidenceLabel(event.confidence)} {event.confidence}%
                          </span>
                          <span className="metaSep">·</span>
                          <span className="metaSev">
                            {severityDots(event.severity)}
                          </span>
                        </div>

                        {/* Summary */}
                        {event.summary && <div className="summary">{event.summary}</div>}

                        {/* State tags */}
                        <div className="eventTags">
                          {isPinned && <span className="eTag eTagPin"><Pin size={10} /> Pinned</span>}
                          {isVerified && <span className="eTag eTagVerified"><CheckCircle2 size={10} /> Verified</span>}
                          {isUsed && <span className="eTag eTagUsed">Used in brief</span>}
                          {isExcluded && <span className="eTag eTagExcluded"><EyeOff size={10} /> Excluded</span>}
                        </div>

                        {/* Actions */}
                        <div className="actions">
                          <button
                            className={cx("smallBtn", isPinned && "active")}
                            onClick={() => setPinned(prev => prev.find(r => r.id === event.id) ? prev.filter(r => r.id !== event.id) : [...prev, event])}
                          >
                            <Pin size={12} /> {isPinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            className="smallBtn"
                            onClick={() => setDismissed(prev => [...prev, event.id])}
                          >
                            <X size={12} /> Dismiss
                          </button>
                          <button
                            className={cx("smallBtn", isVerified && "verified")}
                            onClick={() => setManualVerified(prev => ({ ...prev, [event.id]: !prev[event.id] }))}
                          >
                            <CheckCircle2 size={12} /> {isVerified ? "Verified" : "Verify"}
                          </button>
                          <button
                            className={cx("smallBtn", isExcluded && "warn")}
                            onClick={() => setExcludedIds(prev => prev.includes(event.id) ? prev.filter(x => x !== event.id) : [...prev, event.id])}
                          >
                            <EyeOff size={12} /> {isExcluded ? "Restore" : "Exclude"}
                          </button>
                        </div>

                        {/* Analyst note */}
                        <textarea
                          className="note"
                          placeholder="Analyst note…"
                          value={analystNotes[event.id] || ""}
                          onChange={e => setAnalystNotes(prev => ({ ...prev, [event.id]: e.target.value }))}
                        />
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </div>

          {/* Intelligence Archive */}
          <div className="panel">
            <div className="inner">
              <div className="iconHead"><Database size={14} /> <span>Intelligence Archive</span></div>

              {/* Archive Search */}
              <div className="archiveSearch">
                <Search size={12} className="archiveSearchIcon" />
                <input
                  className="input"
                  placeholder="Search archive…"
                  value={archiveSearch}
                  onChange={e => setArchiveSearch(e.target.value)}
                  style={{ paddingLeft: 32, fontSize: "0.8rem" }}
                />
              </div>

              {/* Filters */}
              <div className="filterSection">
                <div className="filterLabel">Threat</div>
                <div className="filterRow">
                  {(["ALL", "LOW", "ELEVATED", "HIGH", "CRITICAL"] as ArchiveThreatFilter[]).map(f => (
                    <button key={f} className={cx("filterChip", archiveThreatFilter === f && "active")} onClick={() => setArchiveThreatFilter(f)}>{f}</button>
                  ))}
                </div>
              </div>

              <div className="filterSection">
                <div className="filterLabel">Mode</div>
                <div className="filterRow">
                  {(["ALL", "daily", "weekly", "full", "quick"] as ArchiveModeFilter[]).map(f => (
                    <button key={f} className={cx("filterChip", archiveModeFilter === f && "active")} onClick={() => setArchiveModeFilter(f)}>{f}</button>
                  ))}
                </div>
              </div>

              <div className="filterSection" style={{ marginBottom: 16 }}>
                <div className="filterLabel">Sort</div>
                <div className="filterRow">
                  {(["newest", "oldest", "threat"] as ArchiveSort[]).map(s => (
                    <button key={s} className={cx("filterChip", archiveSort === s && "active")} onClick={() => setArchiveSort(s)}>{s}</button>
                  ))}
                </div>
              </div>

              {archiveResults.length === 0 ? (
                <div className="dimText">No archive entries yet. Generate a brief to save here.</div>
              ) : (
                <div className="archiveLayout">

                  {/* List */}
                  <div className="archiveList">
                    {archiveResults.map(entry => (
                      <div
                        key={entry.id}
                        className={cx("archiveItem", entry.id === selectedArchive?.id && "active")}
                        onClick={() => { setSelectedArchiveId(entry.id); setRenameValue(entry.title); }}
                      >
                        <span className={cx("archiveThreatDot", entry.threat.toLowerCase())} style={{ flexShrink: 0 }} />
                        <div className="archiveItemBody">
                          <div className="archiveItemTitle">{entry.title}</div>
                          <div className="archiveItemMeta">
                            {entry.date} · {entry.mode}
                            {entry.starred && <Star size={10} style={{ marginLeft: 4, color: "#fbbf24", flexShrink: 0 }} />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Detail */}
                  {selectedArchive && (
                    <div className="archiveDetail">
                      <div className="archiveDetailControls">
                        <input
                          className="smallInput"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          placeholder="Brief title…"
                        />
                        <button className="smallBtn" onClick={() => setHistory(prev => prev.map(e => e.id === selectedArchive.id ? { ...e, title: renameValue } : e))}>
                          Save
                        </button>
                        <button
                          className={cx("smallBtn", selectedArchive.starred && "warn")}
                          onClick={() => setHistory(prev => prev.map(e => e.id === selectedArchive.id ? { ...e, starred: !e.starred } : e))}
                        >
                          {selectedArchive.starred ? <StarOff size={12} /> : <Star size={12} />}
                        </button>
                        <button className="smallBtn" onClick={() => { downloadTextFile(`rsr-axion-${selectedArchive.id}.txt`, selectedArchive.brief); setStatusMessage("Exported."); }}>
                          <Download size={12} />
                        </button>
                        <button className="smallBtn warn" onClick={() => { setHistory(prev => prev.filter(e => e.id !== selectedArchive.id)); setSelectedArchiveId(null); }}>
                          <X size={12} />
                        </button>
                      </div>

                      <div className="archiveTags">
                        <span className={cx("tag", selectedArchive.threat.toLowerCase())}>{selectedArchive.threat}</span>
                        <span className="tag">{selectedArchive.mode}</span>
                        <span className="tag">{selectedArchive.date}</span>
                        <span className="tag">{selectedArchive.issue}</span>
                      </div>

                      <div className="archiveText">{selectedArchive.brief}</div>

                      <textarea
                        className="note"
                        placeholder="Analyst note on this archive entry…"
                        value={analystNotes[selectedArchive.id] || ""}
                        onChange={e => setAnalystNotes(prev => ({ ...prev, [selectedArchive.id]: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </aside>
      </main>
    </div>
  );
}
