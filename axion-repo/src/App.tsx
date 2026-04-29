import { useEffect, useMemo, useRef, useState } from "react";
import BlackdogStatus from "./components/BlackdogStatus";
import { ArrowDownToLine, CheckCircle2, Database, Download, EyeOff, FileText, Globe, Newspaper, Pin, Printer, Radar, ScrollText, Search, Shield, Star, StarOff, Wand2, X, Zap } from "lucide-react";
import type { ArchiveModeFilter, ArchiveSort, ArchiveThreatFilter, BriefDepth, DomainFilter, ExportKind, FeedEvent, FeedHealth, HistoryEntry, Mode, RejectionReason, SignalPipelineStats, ThreatMatrix } from "./lib/types";
import { averageConfidence, buildArticle, buildBulletin, buildFullBrief, buildPrintHtml, clusterCounts, downloadTextFile, formatThreatOrder, getSourceTier, safeLoad, saveToStorage, scoreBand, scoreSignal } from "./lib/utils";

// cache-bust-v5

/* ── Build identity ─────────────────────────────────────────────────────── */

const BUILD_VERSION = "AXION-v3-signal-500-live";
const BUILD_VER_KEY = "rsr-axion-bv";

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
  { id: "fallback-1", source: "rsr-fallback", domain: "Security / Defense", title: "Regional military signaling remains elevated across Middle East maritime lanes", summary: "Fallback signal loaded because the preview environment blocked live feed requests.", severity: 4, confidence: 72, timestamp: new Date().toISOString(), sourceTier: 4 },
  { id: "fallback-2", source: "rsr-fallback", domain: "Markets / Economy", title: "Energy and shipping sensitivity remain central to the current market picture", summary: "Fallback signal loaded because the preview environment blocked live feed requests.", severity: 3, confidence: 70, timestamp: new Date().toISOString(), sourceTier: 4 },
  { id: "fallback-3", source: "rsr-fallback", domain: "AI / Compute", title: "AI compute infrastructure buildout continues reshaping the technical layer", summary: "Fallback signal loaded because the preview environment blocked live feed requests.", severity: 2, confidence: 68, timestamp: new Date().toISOString(), sourceTier: 4 },
  { id: "fallback-4", source: "rsr-fallback", domain: "Policy / Regulation", title: "Federal policy activity adds pressure to the domestic operating picture", summary: "Institutional movement remains part of the cycle.", severity: 2, confidence: 66, timestamp: new Date().toISOString(), sourceTier: 4 },
  { id: "fallback-5", source: "rsr-fallback", domain: "Global Affairs", title: "Strategic shipping routes remain vulnerable to regional power signaling", summary: "Maritime pressure is still relevant to the broader intelligence cycle.", severity: 3, confidence: 69, timestamp: new Date().toISOString(), sourceTier: 4 },
];

const DEFAULT_PIPELINE_STATS: SignalPipelineStats = {
  rawCount: 0, parsedCount: 0, rejectedCount: 0, rejectionBreakdown: {},
  dedupCount: 0, usableCount: 0, successFeeds: 0, failFeeds: 0,
  feedHealth: [], topDomains: [], weakDomains: [], elapsed: 0,
};

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

function classifyDomain(title: string, summary: string, fallback: string): string {
  const text = `${title} ${summary}`.toLowerCase();
  if (/\b(military|missile|drone|defense|navy|air.?force|troops|combat|weapon|warship|fighter|bomb|strike|war|conflict|artillery|kinetic|battalion|brigade|invasion|offensive|siege|special.?forces|carrier.?group|tank|armored)\b/i.test(text)) return "Security / Defense";
  if (/\b(ransomware|hack|malware|data.?breach|vulnerability|exploit|zero.?day|botnet|phishing|apt\b|threat.?actor|intrusion|cyber.?attack|incident.?response|patch|cve\b|firewall|signals.?intelligence|wiretap|surveillance|espionage)\b/i.test(text)) return "Cyber / Signals";
  if (/\b(artificial.?intelligence|machine.?learning|ai.?model|generative|llm\b|gpu\b|semiconductor|chip.?shortage|compute|data.?center|nvidia|quantum.?computing|automation|algorithm|foundation.?model)\b/i.test(text)) return "AI / Compute";
  if (/\b(oil|crude|brent|wti|opec|lng|natural.?gas|refinery|petroleum|fuel|energy.?price|power.?grid|nuclear.?plant|renewable.?energy|solar.?farm|wind.?farm|electricity.?grid|coal|hydropower)\b/i.test(text)) return "Energy";
  if (/\b(supply.?chain|shipping.?lane|freight|logistics|container.?ship|port.?blockage|cargo|transit.?route|trade.?corridor|truck|rail.?freight|warehouse|just.?in.?time|inventory.?shortage)\b/i.test(text)) return "Supply Chains";
  if (/\b(infrastructure|power.?outage|water.?system|dam|bridge|grid.?failure|critical.?infrastructure|blackout|sewer|pipeline|telecommunications|broadband|fiber.?optic|satellite.?system)\b/i.test(text)) return "Infrastructure";
  if (/\b(market|stock|equity|bond|treasury|inflation|interest.?rate|central.?bank|federal.?reserve|ecb\b|tariff|trade.?war|gdp|recession|currency|forex|hedge.?fund|ipo\b|dow|nasdaq|s&p|financial.?crisis|bank.?run|debt.?ceiling)\b/i.test(text)) return "Markets / Economy";
  if (/\b(white.?house|senate|congress|executive.?order|agency|federal.?agency|administration|federal|election|legislation|policy|vote|president|minister|parliament|cabinet|bill.?passed|regulatory|rulemaking|government.?shutdown)\b/i.test(text)) return "Policy / Regulation";
  if (/\b(supreme.?court|federal.?court|indictment|prosecution|ruling|verdict|lawsuit|class.?action|antitrust|doj\b|legal.?challenge|injunction|appeals.?court|judicial|constitutional)\b/i.test(text)) return "Legal / Courts";
  if (/\b(protest|unrest|riot|civil.?disorder|strike|labor.?dispute|demonstration|social.?movement|coup|political.?crisis|mass.?casualty|refugee|displacement|humanitarian)\b/i.test(text)) return "Social Stability";
  if (/\b(pandemic|outbreak|pathogen|biosecurity|bioweapon|vaccine|public.?health.?emergency|who\b|disease|epidemic|quarantine|cdc\b|mutation|variant)\b/i.test(text)) return "Public Health / Biosecurity";
  if (/\b(satellite|space.?station|orbit|nasa\b|spacex|rocket.?launch|space.?debris|gps.?interference|space.?weapon|anti.?satellite|lunar|mars|orbital)\b/i.test(text)) return "Space / Orbital Systems";
  if (/\b(disinformation|propaganda|information.?warfare|influence.?operation|psyop|fake.?news|election.?interference|narrative|bot.?network|deepfake|social.?media.?campaign)\b/i.test(text)) return "Information Warfare";
  if (/\b(diplomacy|summit|bilateral|multilateral|treaty|un.?security.?council|nato|sanctions|embassy|foreign.?minister|state.?department|geopolit|international.?relations|alliance|foreign.?policy)\b/i.test(text)) return "Global Affairs";
  if (/\b(central.?bank|imf\b|world.?bank|monetary.?policy|governance|institution|regulatory.?body|government.?reform|anticorruption|transparency|accountability)\b/i.test(text)) return "Governance / Institutions";
  return fallback;
}

/* ── Browser Feed Sources (~70 curated feeds across all core domains) ─── */

const BROWSER_FEEDS: ReadonlyArray<{ url: string; domain: string }> = [
  // ── Global Affairs (Tier 1 / 2 mix) ──
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml",                              domain: "Global Affairs" },
  { url: "https://feeds.apnews.com/rss/apf-topnews",                                 domain: "Global Affairs" },
  { url: "https://feeds.apnews.com/rss/apf-intlnews",                                domain: "Global Affairs" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml",                                domain: "Global Affairs" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",                   domain: "Global Affairs" },
  { url: "https://rss.dw.com/rdf/rss-en-all",                                        domain: "Global Affairs" },
  { url: "https://feeds.skynews.com/feeds/rss/world.xml",                            domain: "Global Affairs" },
  { url: "https://feeds.npr.org/1001/rss.xml",                                       domain: "Global Affairs" },
  { url: "https://foreignpolicy.com/feed/",                                          domain: "Global Affairs" },
  { url: "https://www.theguardian.com/world/rss",                                    domain: "Global Affairs" },
  { url: "https://www.cfr.org/rss.xml",                                              domain: "Global Affairs" },
  { url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",                  domain: "Global Affairs" },
  { url: "https://www.reuters.com/rssFeed/worldNews",                                domain: "Global Affairs" },
  { url: "https://rss.politico.com/congress.xml",                                   domain: "Global Affairs" },
  // ── Security / Defense ──
  { url: "https://warontherocks.com/feed/",                                          domain: "Security / Defense" },
  { url: "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml",        domain: "Security / Defense" },
  { url: "https://breakingdefense.com/feed/",                                        domain: "Security / Defense" },
  { url: "https://www.thedrive.com/the-war-zone/rss",                                domain: "Security / Defense" },
  { url: "https://www.defenseone.com/rss/all/",                                      domain: "Security / Defense" },
  { url: "https://www.navalnews.com/feed/",                                          domain: "Security / Defense" },
  { url: "https://www.understandingwar.org/feed",                                    domain: "Security / Defense" },
  { url: "https://taskandpurpose.com/feed/",                                         domain: "Security / Defense" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml",             domain: "Security / Defense" },
  { url: "https://feeds.apnews.com/rss/apf-usnews",                                 domain: "Security / Defense" },
  { url: "https://spaceflight.nasa.gov/cgi-bin/rss.cgi",                            domain: "Security / Defense" },
  { url: "https://www.janes.com/feeds/news",                                         domain: "Security / Defense" },
  // ── Cyber / Signals ──
  { url: "https://krebsonsecurity.com/feed/",                                        domain: "Cyber / Signals" },
  { url: "https://www.bleepingcomputer.com/feed/",                                   domain: "Cyber / Signals" },
  { url: "https://www.darkreading.com/rss.xml",                                      domain: "Cyber / Signals" },
  { url: "https://www.securityweek.com/feed/",                                       domain: "Cyber / Signals" },
  { url: "https://www.cisa.gov/news.xml",                                            domain: "Cyber / Signals" },
  { url: "https://www.theregister.com/security/headlines.atom",                      domain: "Cyber / Signals" },
  { url: "https://feeds.arstechnica.com/arstechnica/security",                       domain: "Cyber / Signals" },
  { url: "https://www.zdnet.com/topic/security/rss.xml",                             domain: "Cyber / Signals" },
  { url: "https://www.wired.com/feed/category/security/latest/rss",                  domain: "Cyber / Signals" },
  { url: "https://thehackernews.com/feeds/posts/default",                            domain: "Cyber / Signals" },
  { url: "https://isc.sans.edu/rssfeed.xml",                                         domain: "Cyber / Signals" },
  { url: "https://www.cisa.gov/uscert/ncas/alerts.xml",                              domain: "Cyber / Signals" },
  // ── AI / Compute ──
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/",            domain: "AI / Compute" },
  { url: "https://www.technologyreview.com/feed/",                                   domain: "AI / Compute" },
  { url: "https://venturebeat.com/category/ai/feed/",                                domain: "AI / Compute" },
  { url: "https://www.wired.com/feed/category/artificial-intelligence/latest/rss",  domain: "AI / Compute" },
  { url: "https://www.theverge.com/rss/index.xml",                                   domain: "AI / Compute" },
  // ── Markets / Economy ──
  { url: "https://www.theguardian.com/business/rss",                                 domain: "Markets / Economy" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",                    domain: "Markets / Economy" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19836768", domain: "Markets / Economy" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",              domain: "Markets / Economy" },
  { url: "https://feeds.apnews.com/rss/apf-business",                                domain: "Markets / Economy" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml",                domain: "Markets / Economy" },
  { url: "https://www.federalreserve.gov/feeds/press_all.xml",                       domain: "Markets / Economy" },
  { url: "https://feeds.bloomberg.com/markets/news.rss",                             domain: "Markets / Economy" },
  // ── Energy ──
  { url: "https://oilprice.com/rss/main",                                            domain: "Energy" },
  { url: "https://www.eia.gov/rss/press_rss.xml",                                    domain: "Energy" },
  { url: "https://energymonitor.ai/feed",                                            domain: "Energy" },
  { url: "https://www.offshore-energy.biz/feed/",                                    domain: "Energy" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml",                           domain: "Energy" },
  // ── Supply Chains ──
  { url: "https://www.freightwaves.com/news/feed",                                   domain: "Supply Chains" },
  { url: "https://www.supplychaindive.com/feeds/news/",                              domain: "Supply Chains" },
  { url: "https://www.logisticsmgmt.com/rss/",                                       domain: "Supply Chains" },
  { url: "https://www.thomasnet.com/insights/feed/",                                 domain: "Supply Chains" },
  // ── Policy / Regulation ──
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",               domain: "Policy / Regulation" },
  { url: "https://thehill.com/feed/",                                                domain: "Policy / Regulation" },
  { url: "https://rss.politico.com/politics-news.xml",                              domain: "Policy / Regulation" },
  { url: "https://www.brookings.edu/feed/",                                          domain: "Policy / Regulation" },
  { url: "https://www.axios.com/feeds/feed.rss",                                     domain: "Policy / Regulation" },
  { url: "https://feeds.apnews.com/rss/apf-politics",                                domain: "Policy / Regulation" },
  { url: "https://www.federalregister.gov/articles/search.rss",                      domain: "Policy / Regulation" },
  { url: "https://www.ftc.gov/feeds/press-releases.xml",                             domain: "Policy / Regulation" },
  { url: "https://www.justice.gov/feeds/news/press-releases.xml",                   domain: "Policy / Regulation" },
  // ── Public Health / Biosecurity ──
  { url: "https://www.who.int/rss-feeds/news-english.xml",                           domain: "Public Health / Biosecurity" },
  { url: "https://www.statnews.com/feed/",                                           domain: "Public Health / Biosecurity" },
  { url: "https://feeds.bbci.co.uk/news/health/rss.xml",                             domain: "Public Health / Biosecurity" },
  { url: "https://feeds.apnews.com/rss/apf-Health",                                  domain: "Public Health / Biosecurity" },
  // ── Space / Orbital Systems ──
  { url: "https://www.space.com/feeds/all",                                          domain: "Space / Orbital Systems" },
  { url: "https://spacenews.com/feed/",                                              domain: "Space / Orbital Systems" },
  // ── Infrastructure ──
  { url: "https://www.utilitydive.com/feeds/news/",                                  domain: "Infrastructure" },
  { url: "https://www.enr.com/rss/news",                                             domain: "Infrastructure" },
  // ── Information Warfare / Governance ──
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml",                         domain: "Information Warfare" },
];

/* ── Signal Relevance Filter — tier-aware with rejection reason codes ───── */

const HARD_EXCLUDE_RE = /\b(sports|baseball|soccer|basketball|football|tennis|golf|olympics|nfl|nba|mlb|nhl|fifa|world.?cup|super.?bowl|playoffs|championship.?game|box.?office|oscar|grammy|emmy|album.?release|concert.?tour|sitcom|reality.?show|streaming.?show|fashion.?week|runway|couture|beauty.?tips|makeup|skincare|hair.?care|food.?recipe|restaurant.?review|chef|cooking.?show|travel.?tips|vacation.?resort|cruise.?ship|hotel.?deal|lifestyle.?blog|wellness.?tips|yoga.?class|weight.?loss|diet.?plan|horoscope|astrology|celebrity.?gossip|red.?carpet|dating.?tips|entertainment.?news|movie.?review|film.?review|video.?game.?review|k-pop|pop.?star|influencer|nfl.?draft|march.?madness|fantasy.?football|awards.?show)\b/i;

const SPORTS_RE = /\b(nfl|nba|mlb|nhl|fifa|espn|sports scores|athlete|touchdown|home.?run|slam.?dunk|playoff.?standings|box.?score|super.?bowl)\b/i;

const ENTERTAINMENT_RE = /\b(celebrity gossip|oscar|grammy|emmy|album release|concert tour|sitcom|reality.?tv|fashion week|runway|skincare routine|yoga class|weight.?loss tip|horoscope|astrology|red.?carpet|dating tips|k.?pop|pop.?star|influencer)\b/i;

const LIFESTYLE_RE = /\b(food recipe|restaurant review|cooking show|travel tips|vacation resort|hotel deal|wellness tips|hair.?care tip|home.?decor|interior design|gardening tip)\b/i;

const STRATEGIC_SIGNALS_RE = /\b(military|defense|security|war|conflict|attack|missile|nato|nuclear|sanction|tariff|trade|market|oil|gas|energy|inflation|central.?bank|interest.?rate|geopolit|strategic|intelligence|infrastructure|cyber|ransomware|hack|malware|government|policy|legislation|regulation|congress|senate|parliament|president|minister|treasury|crisis|emergency|diplomatic|summit|treaty|alliance|espionage|surveillance|supply.?chain|shipping|logistics|freight|port|semiconductor|chip|artificial.?intelligence|\bai\b|compute|data.?center|satellite|space|drone|carrier|submarine|warship|troops|battalion|brigade|invasion|protest|unrest|coup|pandemic|outbreak|biosecurity|public.?health|federal.?reserve|executive.?order|agency|ruling|court|lawsuit|indictment|breach|exploit|vulnerability|advisory|budget|spending|debt|deficit|export|import|currency|federal|bureau|department|commission|authority|minister|ministry|election|referendum|accord|ceasefire|strike|shutdown|sanction|embargo|acquisition|merger|antitrust|regulation|climate|emissions|grid|pipeline|port|border|corridor|alliance|partnership|agreement|deal|contract|procurement|deployment|exercise|readiness)\b/i;

// Broad institutional signals — used for Tier 1/2 leniency
const INSTITUTIONAL_BROAD_RE = /\b(national|international|government|federal|state|agency|official|military|economic|financial|industrial|strategic|diplomatic|congressional|presidential|ministerial|parliamentary|regulatory|judicial|legislative|executive|institutional|infrastructure|security|defense|intelligence|policy|department|bureau|ministry|commission|authority|administration|operation|mission|program|initiative|report|review|assessment|warning|alert|advisory|announcement|statement|directive|order|law|act|bill|budget|spending|regulation|compliance)\b/i;

function checkRelevance(title: string, summary: string = "", sourceTier?: 1 | 2 | 3 | 4): { pass: boolean; reason?: RejectionReason } {
  const text = `${title} ${summary}`;

  if (!title.trim() || title.trim().length < 10) return { pass: false, reason: "EMPTY_SUMMARY" };

  // Hard noise exclusion — always applied regardless of tier
  if (SPORTS_RE.test(title) && !STRATEGIC_SIGNALS_RE.test(title)) return { pass: false, reason: "SPORTS_NOISE" };
  if (ENTERTAINMENT_RE.test(title) && !STRATEGIC_SIGNALS_RE.test(title)) return { pass: false, reason: "ENTERTAINMENT_NOISE" };
  if (LIFESTYLE_RE.test(title) && !STRATEGIC_SIGNALS_RE.test(title)) return { pass: false, reason: "LIFESTYLE_NOISE" };
  if (HARD_EXCLUDE_RE.test(text) && !STRATEGIC_SIGNALS_RE.test(title)) return { pass: false, reason: "ENTERTAINMENT_NOISE" };

  // Tier 1/2 sources: accept with broad institutional/systemic relevance
  if ((sourceTier === 1 || sourceTier === 2) && INSTITUTIONAL_BROAD_RE.test(text)) return { pass: true };

  // All sources: accept if strategic keyword present
  if (STRATEGIC_SIGNALS_RE.test(title)) return { pass: true };
  if (STRATEGIC_SIGNALS_RE.test(summary)) return { pass: true };

  // Tier 3 sources: accept if institutional broad match in title
  if (sourceTier === 3 && INSTITUTIONAL_BROAD_RE.test(title)) return { pass: true };

  return { pass: false, reason: "NO_SYSTEM_RELEVANCE" };
}

/* ── Client-side Signal Collection ─────────────────────────────────────── */

type Rss2JsonItem = { title?: string; link?: string; pubDate?: string; description?: string };
type Rss2JsonResponse = { status: string; items?: Rss2JsonItem[] };

/* Parse raw RSS/Atom XML using the browser's DOMParser */
function parseRssXml(xml: string): Rss2JsonItem[] {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) return [];

    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // RSS 2.0
    const rssItems = Array.from(doc.querySelectorAll("channel > item"));
    if (rssItems.length > 0) {
      return rssItems.slice(0, 30).map(el => ({
        title: el.querySelector("title")?.textContent?.trim() ?? "",
        link: el.querySelector("link")?.textContent?.trim() ?? "",
        pubDate: el.querySelector("pubDate")?.textContent?.trim()
          ?? el.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "date")[0]?.textContent?.trim()
          ?? "",
        description: stripHtml(el.querySelector("description")?.textContent ?? el.querySelector("summary")?.textContent ?? ""),
      }));
    }

    // Atom
    const atomEntries = Array.from(doc.querySelectorAll("feed > entry, entry"));
    if (atomEntries.length > 0) {
      return atomEntries.slice(0, 30).map(el => ({
        title: el.querySelector("title")?.textContent?.trim() ?? "",
        link: el.querySelector("link[rel='alternate']")?.getAttribute("href")
          ?? el.querySelector("link")?.getAttribute("href")
          ?? el.querySelector("link")?.textContent?.trim()
          ?? "",
        pubDate: el.querySelector("updated")?.textContent?.trim()
          ?? el.querySelector("published")?.textContent?.trim()
          ?? "",
        description: stripHtml(el.querySelector("content")?.textContent ?? el.querySelector("summary")?.textContent ?? ""),
      }));
    }

    return [];
  } catch {
    return [];
  }
}

/* Multi-strategy feed fetcher: rss2json (production) → allorigins proxy (dev/fallback) */
async function fetchFeedItems(url: string, perFeed: number): Promise<{ items: Rss2JsonItem[]; strategy: string }> {
  // Strategy 1: rss2json (fast, works in production on EdgeOne CDN)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=${perFeed}`;
    const res = await fetch(apiUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json() as Rss2JsonResponse;
      if (data.status === "ok" && Array.isArray(data.items) && data.items.length > 0) {
        return { items: data.items.slice(0, perFeed), strategy: "rss2json" };
      }
    }
    // 422/403/empty → fall through to proxy strategy
  } catch { /* timeout or network error — try next */ }

  // Strategy 2: Local Node.js RSS proxy (dev only — Vite proxies /api/* to localhost:3001)
  // Node.js fetches with proper headers, bypassing domain restrictions. Fast 404 in production.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const proxyUrl = `/api/proxy/rss?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const xml = await res.text();
      // Sanity check: should be XML, not a JSON error response
      if (xml.trim().startsWith("<")) {
        const items = parseRssXml(xml);
        if (items.length > 0) return { items: items.slice(0, perFeed), strategy: "local-proxy" };
      }
    }
  } catch { /* not available (production CDN) — try next */ }

  // Strategy 3: allorigins.win raw proxy + DOMParser
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const xml = await res.text();
      if (xml.trim().startsWith("<")) {
        const items = parseRssXml(xml);
        if (items.length > 0) return { items: items.slice(0, perFeed), strategy: "allorigins" };
      }
    }
  } catch { /* timeout or proxy error — try next */ }

  // Strategy 4: corsproxy.io + DOMParser (last resort for external access)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const xml = await res.text();
      const items = parseRssXml(xml);
      if (items.length > 0) return { items: items.slice(0, perFeed), strategy: "corsproxy" };
    }
  } catch { /* all strategies exhausted */ }

  throw new Error("ALL_STRATEGIES_EXHAUSTED");
}

async function collectSignals(): Promise<{ signals: FeedEvent[]; stats: SignalPipelineStats }> {
  const PER_FEED = 25;
  const BATCH_SIZE = 20;
  const started = Date.now();

  const feedHealth: FeedHealth[] = [];
  let rawCount = 0;
  let parsedCount = 0;
  const rejectionBreakdown: Record<string, number> = {};
  const strategyCounts: Record<string, number> = {};

  const allBatches: Array<{ url: string; domain: string }[]> = [];
  for (let i = 0; i < BROWSER_FEEDS.length; i += BATCH_SIZE) {
    allBatches.push(BROWSER_FEEDS.slice(i, i + BATCH_SIZE) as { url: string; domain: string }[]);
  }

  const allRawEvents: FeedEvent[] = [];

  for (const batch of allBatches) {
    const settled = await Promise.allSettled(
      batch.map(async ({ url, domain }) => {
        const hostName = new URL(url).hostname.replace(/^(www\.|feeds\.|rss\.|feed\.)/i, "");
        const tier = getSourceTier(hostName);
        const feedStart = Date.now();

        try {
          const { items, strategy } = await fetchFeedItems(url, PER_FEED);
          strategyCounts[strategy] = (strategyCounts[strategy] ?? 0) + 1;

          const feedItems: FeedEvent[] = [];
          for (const item of items) {
            rawCount++;
            const title = (item.title ?? "").trim();
            const summary = (item.description ?? "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 320);

            const check = checkRelevance(title, summary, tier);
            if (!check.pass) {
              const reason = check.reason ?? "NO_SYSTEM_RELEVANCE";
              rejectionBreakdown[reason] = (rejectionBreakdown[reason] ?? 0) + 1;
              continue;
            }

            parsedCount++;
            let ts = new Date().toISOString();
            try { if (item.pubDate) ts = new Date(item.pubDate).toISOString(); } catch { /* keep default */ }

            feedItems.push({
              id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              source: hostName,
              domain: classifyDomain(title, summary, domain),
              title,
              summary,
              severity: 1,
              confidence: 70,
              timestamp: ts,
              sourceTier: tier,
              sourceCount: 1,
            });
          }

          feedHealth.push({ source: hostName, domain, success: true, itemCount: feedItems.length, lastChecked: new Date().toISOString() });
          return feedItems;
        } catch (err) {
          const errorType = err instanceof Error ? err.message : "UNKNOWN";
          feedHealth.push({ source: hostName, domain, success: false, itemCount: 0, errorType, lastChecked: new Date().toISOString() });
          return [] as FeedEvent[];
        }
      })
    );
    settled.forEach(r => { if (r.status === "fulfilled") allRawEvents.push(...r.value); });
  }

  const successFeeds = feedHealth.filter(f => f.success).length;
  const failFeeds = feedHealth.filter(f => !f.success).length;

  /* ── Corroboration: group by normalized title prefix, merge duplicates ── */
  const groups = new Map<string, FeedEvent[]>();
  for (const ev of allRawEvents) {
    const key = ev.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }

  const dedupedRaw: FeedEvent[] = [];
  for (const group of groups.values()) {
    // Keep the signal with the best tier (lowest number), then longest summary
    const best = group.sort((a, b) => {
      const tierA = a.sourceTier ?? 4;
      const tierB = b.sourceTier ?? 4;
      if (tierA !== tierB) return tierA - tierB;
      return (b.summary?.length ?? 0) - (a.summary?.length ?? 0);
    })[0];

    const corroborated = group.length > 1;
    dedupedRaw.push({
      ...best,
      sourceCount: group.length,
      corroborated,
    });
  }

  // Apply multi-factor scoring to all deduped signals
  const scored = dedupedRaw.map(e => scoreSignal(e));

  // Sort by priority: confidence × 0.6 + severity × 10 + recency bonus
  const now = Date.now();
  const signals = scored
    .sort((a, b) => {
      const recA = Math.max(0, 1 - (now - new Date(a.timestamp).getTime()) / (72 * 3600000));
      const recB = Math.max(0, 1 - (now - new Date(b.timestamp).getTime()) / (72 * 3600000));
      const scoreA = a.confidence * 0.55 + a.severity * 10 + recA * 8 + ((a.sourceCount ?? 1) > 1 ? 6 : 0);
      const scoreB = b.confidence * 0.55 + b.severity * 10 + recB * 8 + ((b.sourceCount ?? 1) > 1 ? 6 : 0);
      return scoreB - scoreA;
    })
    .slice(0, 500);

  // Domain distribution stats
  const domainCounts: Record<string, number> = {};
  signals.forEach(e => { domainCounts[e.domain] = (domainCounts[e.domain] ?? 0) + 1; });
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count }));
  const weakDomains = topDomains.filter(d => d.count < 3).map(d => d.domain);

  const rejectedCount = rawCount - parsedCount;
  const elapsed = Date.now() - started;

  const strategyStr = Object.entries(strategyCounts).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`[AXION] feeds=${BROWSER_FEEDS.length} ok=${successFeeds} fail=${failFeeds} raw=${rawCount} parsed=${parsedCount} rejected=${rejectedCount} deduped=${dedupedRaw.length} scored=${signals.length} strategies={${strategyStr}} time=${elapsed}ms`);

  return {
    signals,
    stats: {
      rawCount, parsedCount, rejectedCount, rejectionBreakdown,
      dedupCount: dedupedRaw.length, usableCount: signals.length,
      successFeeds, failFeeds, feedHealth, topDomains, weakDomains, elapsed,
    },
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
  const [usingFallback, setUsingFallback] = useState<"none" | "supplemented" | "full">("none");
  const [statusMessage, setStatusMessage] = useState("");
  const [pipelineStats, setPipelineStats] = useState<SignalPipelineStats>(DEFAULT_PIPELINE_STATS);
  const [rawSignalCount, setRawSignalCount] = useState(0);
  const [threatMatrix, setThreatMatrix] = useState<ThreatMatrix>({ overall: "GUARDED", conflict: "LOW", markets: "LOW", infrastructure: "LOW", information: "LOW" });

  useEffect(() => saveToStorage(STORAGE_KEYS.history, history), [history]);
  useEffect(() => saveToStorage(STORAGE_KEYS.notes, analystNotes), [analystNotes]);
  useEffect(() => saveToStorage(STORAGE_KEYS.used, usedInBrief), [usedInBrief]);
  useEffect(() => saveToStorage(STORAGE_KEYS.verified, manualVerified), [manualVerified]);
  useEffect(() => saveToStorage(STORAGE_KEYS.excluded, excludedIds), [excludedIds]);

  // Build-version guard: log version transitions; clear signal-adjacent keys on upgrade
  useEffect(() => {
    const prev = localStorage.getItem(BUILD_VER_KEY);
    if (prev !== BUILD_VERSION) {
      localStorage.setItem(BUILD_VER_KEY, BUILD_VERSION);
      if (prev) {
        // Clear per-session state so stale signal IDs from old builds don't linger
        localStorage.removeItem(STORAGE_KEYS.used);
        localStorage.removeItem(STORAGE_KEYS.verified);
        localStorage.removeItem(STORAGE_KEYS.excluded);
        console.log(`[AXION] Build upgraded ${prev} → ${BUILD_VERSION}. Cleared session state.`);
      } else {
        console.log(`[AXION] Build version set: ${BUILD_VERSION}`);
      }
    }
  }, []);

  useEffect(() => { void ingestSignals(); }, []);

  async function ingestSignals() {
    setLoading(true);
    setStatusMessage("");
    try {
      const { signals, stats } = await collectSignals();
      const liveCount = signals.length;
      const totalFeeds = stats.successFeeds + stats.failFeeds;

      // Tiered fallback: ≥50 live = no fallback, 20-49 = supplement, <20 = full fallback
      let fallbackMode: "none" | "supplemented" | "full" = "none";
      let fallbackCount = 0;
      let queueSize = liveCount;

      if (liveCount >= 50) {
        fallbackMode = "none";
        fallbackCount = 0;
        queueSize = Math.min(liveCount, 500);
        setUsingFallback("none");
        setEvents(signals.slice(0, 500));
        setStatusMessage(`${liveCount} live signals · ${stats.successFeeds}/${totalFeeds} feeds · ${stats.rawCount} raw`);
      } else if (liveCount >= 20) {
        const needed = Math.min(50 - liveCount, FALLBACK_SIGNALS.length);
        fallbackMode = "supplemented";
        fallbackCount = needed;
        queueSize = liveCount + needed;
        const supplemented = [...signals, ...FALLBACK_SIGNALS.slice(0, needed)];
        setUsingFallback("supplemented");
        setEvents(supplemented);
        setStatusMessage(`${liveCount} live + ${needed} supplemented · ${stats.successFeeds}/${totalFeeds} feeds · ${stats.rawCount} raw`);
        console.warn(`[AXION] partial fallback — ${liveCount} live signals, supplemented with ${needed} fallback.`);
      } else {
        fallbackMode = "full";
        fallbackCount = FALLBACK_SIGNALS.length;
        queueSize = liveCount + FALLBACK_SIGNALS.length;
        setUsingFallback("full");
        setEvents(liveCount > 0 ? [...signals, ...FALLBACK_SIGNALS] : FALLBACK_SIGNALS);
        const failSources = stats.feedHealth.filter(f => !f.success).slice(0, 8).map(f => `${f.source}:${f.errorType}`).join(", ");
        setStatusMessage(`Fallback mode — ${stats.successFeeds}/${totalFeeds} feeds responded. ${liveCount > 0 ? `${liveCount} live recovered.` : ""}`);
        console.warn(`[AXION] full fallback. liveCount=${liveCount} failFeeds=${stats.failFeeds}. Health: ${failSources}`);
      }

      setPipelineStats(stats);
      setRawSignalCount(stats.rawCount);
      setPinned([]);
      setDismissed([]);

      // ── Full debug dump ──────────────────────────────────────────────────
      console.log(
        `[AXION SIGNAL REPORT]\n` +
        `  BUILD_VERSION : ${BUILD_VERSION}\n` +
        `  FEED_COUNT    : ${BROWSER_FEEDS.length}\n` +
        `  PER_FEED      : 25\n` +
        `  RAW_COLLECTED : ${stats.rawCount}\n` +
        `  PARSED        : ${stats.parsedCount}\n` +
        `  REJECTED      : ${stats.rejectedCount}\n` +
        `  DEDUPED       : ${stats.dedupCount}\n` +
        `  USABLE        : ${stats.usableCount}\n` +
        `  QUEUE_SIZE    : ${queueSize}\n` +
        `  FALLBACK_COUNT: ${fallbackCount}\n` +
        `  FALLBACK_MODE : ${fallbackMode}\n` +
        `  FEEDS_OK      : ${stats.successFeeds}/${totalFeeds}\n` +
        `  ELAPSED_MS    : ${stats.elapsed}`
      );
    } catch (err) {
      setUsingFallback("full");
      setEvents(FALLBACK_SIGNALS);
      setPipelineStats(DEFAULT_PIPELINE_STATS);
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
      .filter(e => {
        if (domainFilter === "ALL") return true;
        if (e.domain === domainFilter) return true;
        if (domainFilter === "Technology") return /Technology|AI.*Compute|Cyber|Space/.test(e.domain);
        return false;
      })
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

  // Pipeline-aware metric strip: RAW / USABLE / QUEUE / USED
  const metricStrip = useMemo(() => [
    {
      label: "Raw Collected",
      value: rawSignalCount > 0 ? String(rawSignalCount) : "—",
      accent: "steel",
    },
    {
      label: "Usable Signals",
      value: pipelineStats.usableCount > 0 ? String(pipelineStats.usableCount) : String(visibleEvents.length),
      accent: "white",
    },
    {
      label: "Used In Brief",
      value: String(Object.values(usedInBrief).filter(Boolean).length),
      accent: "amber",
    },
    {
      label: "Confidence",
      value: visibleEvents.length ? String(averageConfidence(visibleEvents)) : "—",
      accent: "green",
    },
  ], [rawSignalCount, pipelineStats, visibleEvents, usedInBrief]);

  function generateBrief(depth: BriefDepth) {
    const signalLimit = depth === "quick" ? 6 : mode === "full" ? 40 : mode === "weekly" ? 25 : 15;
    const sourceSet = (pinned.length ? pinned : visibleEvents).slice(0, signalLimit);
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
    // Pass pipeline stats as optional 7th argument for data tables in brief
    const statsForBrief = pipelineStats.rawCount > 0 ? pipelineStats : undefined;
    const brief = buildFullBrief(sourceSet, nextMatrix, patterns, mode, depth, now, statsForBrief);
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
                {usingFallback === "full"
                  ? <div className="pill warn">Fallback mode</div>
                  : usingFallback === "supplemented"
                  ? <div className="pill warn">Supplemented</div>
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
            {(["ALL", "Global Affairs", "Security / Defense", "Cyber / Signals", "Technology", "Markets / Economy", "Energy", "Policy / Regulation", "Infrastructure"] as DomainFilter[]).map(d => (
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
                          {event.sourceTier && <span className="metaSep">·</span>}
                          {event.sourceTier && <span className="metaSource" style={{ opacity: 0.55 }}>T{event.sourceTier}</span>}
                          {event.corroborated && <span className="metaSep">·</span>}
                          {event.corroborated && <span className="metaSource" style={{ color: "#7dd3fc", opacity: 0.8 }}>◆{event.sourceCount}</span>}
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
                          {event.corroborated && <span className="eTag eTagVerified">◆ Corroborated</span>}
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
                        <button className="btn" style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                          onClick={() => setHistory(prev => prev.map(e => e.id === selectedArchive.id ? { ...e, title: renameValue } : e))}>
                          Save
                        </button>
                        <button
                          className={cx("btn", selectedArchive.starred && "accent")}
                          style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                          onClick={() => setHistory(prev => prev.map(e => e.id === selectedArchive.id ? { ...e, starred: !e.starred } : e))}
                        >
                          {selectedArchive.starred ? <StarOff size={12} /> : <Star size={12} />}
                        </button>
                        <button className="btn" style={{ fontSize: "0.72rem", padding: "4px 10px", color: "#fca5a5" }}
                          onClick={() => {
                            setHistory(prev => prev.filter(e => e.id !== selectedArchive.id));
                            setSelectedArchiveId(null);
                          }}>
                          Delete
                        </button>
                      </div>
                      <textarea
                        className="archiveText"
                        readOnly
                        value={selectedArchive.brief}
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
