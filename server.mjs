import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Always default to 5000. Dev overrides via PORT=3001 in npm script.
const PORT = parseInt(process.env.PORT || "5000", 10);

// Serve static files only when a production build is present alongside this server.
const DIST = join(__dirname, "dist");
const SERVE_STATIC = existsSync(join(DIST, "index.html"));

console.log(`[RSR AXION] Starting — port=${PORT} static=${SERVE_STATIC}`);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

/* ── Feed Sources ─────────────────────────────────────────── */
const FEED_SOURCES = [
  // GEOPOLITICS / GLOBAL AFFAIRS
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",            domain: "Global Affairs" },
  { url: "https://www.theguardian.com/world/rss",                              domain: "Global Affairs" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml",                        domain: "Global Affairs" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml",                          domain: "Global Affairs" },
  { url: "https://foreignpolicy.com/feed/",                                    domain: "Global Affairs" },
  { url: "https://feeds.npr.org/1001/rss.xml",                                 domain: "Global Affairs" },
  { url: "https://www.foreignaffairs.com/rss.xml",                             domain: "Global Affairs" },
  { url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml",                        domain: "Global Affairs" },
  { url: "https://feeds.skynews.com/feeds/rss/world.xml",                      domain: "Global Affairs" },
  { url: "https://rss.dw.com/rdf/rss-en-all",                                  domain: "Global Affairs" },
  { url: "https://theintercept.com/feed/?rss",                                 domain: "Global Affairs" },

  // MILITARY / SECURITY / DEFENSE
  { url: "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml",  domain: "Security / Defense" },
  { url: "https://breakingdefense.com/feed/",                                  domain: "Security / Defense" },
  { url: "https://www.thedrive.com/the-war-zone/rss",                          domain: "Security / Defense" },
  { url: "https://warontherocks.com/feed/",                                    domain: "Security / Defense" },
  { url: "https://www.navalnews.com/feed/",                                    domain: "Security / Defense" },
  { url: "https://www.defenseone.com/rss/all/",                                domain: "Security / Defense" },

  // CYBERSECURITY / TECHNOLOGY SYSTEMS
  { url: "https://www.cisa.gov/news.xml",                                      domain: "Technology Systems" },
  { url: "https://krebsonsecurity.com/feed/",                                  domain: "Technology Systems" },
  { url: "https://www.darkreading.com/rss.xml",                                domain: "Technology Systems" },
  { url: "https://www.bleepingcomputer.com/feed/",                             domain: "Technology Systems" },
  { url: "https://threatpost.com/feed/",                                       domain: "Technology Systems" },
  { url: "https://www.securityweek.com/feed/",                                 domain: "Technology Systems" },

  // MARKETS / ENERGY / ECONOMICS
  { url: "https://www.theguardian.com/business/rss",                           domain: "Markets" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19836768", domain: "Markets" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",              domain: "Markets" },
  { url: "https://oilprice.com/rss/main",                                      domain: "Markets" },
  { url: "https://www.freightwaves.com/news/feed",                             domain: "Markets" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",        domain: "Markets" },

  // DOMESTIC / POLICY
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",         domain: "Domestic / Policy" },
  { url: "https://thehill.com/feed/",                                          domain: "Domestic / Policy" },
  { url: "https://rss.politico.com/politics-news.xml",                         domain: "Domestic / Policy" },
];

/* ── Domain Classifier ────────────────────────────────────── */
function classifyDomain(title, fallback) {
  if (/military|missile|drone|defense|navy|air.?force|troops|combat|weapon|warship|fighter|bomb|strike|war|conflict|artillery/i.test(title)) return "Security / Defense";
  if (/cyber|ransomware|hack|malware|infrastructure|ai\b|compute|chip|cloud|data.?breach|vulnerability|exploit|zero.?day|botnet/i.test(title)) return "Technology Systems";
  if (/market|oil|energy|shipping|trade|treasury|inflation|equity|tariff|sanction|commodity|port|supply.?chain|crude|lng|brent|nasdaq|dow|freight/i.test(title)) return "Markets";
  if (/white house|senate|congress|executive|agency|department|administration|federal|election|legislation|policy|vote|president|minister|parliament/i.test(title)) return "Domestic / Policy";
  return fallback;
}

/* ── Utilities ────────────────────────────────────────────── */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, "");
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? decodeEntities(m[1].trim()) : "";
}

function extractLink(block) {
  // Prefer <link> text content; fall back to href attr on <link> or <guid>
  const linkTag = block.match(/<link>([^<]+)<\/link>/i);
  if (linkTag) return decodeEntities(linkTag[1].trim());
  const hrefAttr = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (hrefAttr) return hrefAttr[1].trim();
  const guid = extractTag(block, "guid");
  if (guid && guid.startsWith("http")) return guid;
  return "";
}

/* ── Feed Fetcher ─────────────────────────────────────────── */
async function fetchFeed(url, fallbackDomain, perFeed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "RSR-AXION/1.0 (intelligence-synthesis)" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`[feed] FAIL ${res.status} — ${url}`);
      return { ok: false, items: [] };
    }
    const text = await res.text();
    const results = [];
    const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let m;
    let count = 0;
    while ((m = itemRe.exec(text)) !== null && count < perFeed) {
      const block = m[1];
      const title = extractTag(block, "title");
      if (!title || title.length < 6) { count++; continue; }
      const desc = extractTag(block, "description")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
      const link = extractLink(block);
      const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date") || "";
      const domain = classifyDomain(title, fallbackDomain);
      results.push({
        id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: "RSR Signal Feed",
        domain,
        category: domain,
        title,
        summary: desc,
        link,
        published: pubDate,
        severity: Math.floor(Math.random() * 4) + 1,
        confidence: 68 + Math.floor(Math.random() * 27),
        timestamp: new Date().toISOString(),
      });
      count++;
    }
    console.log(`[feed] OK ${results.length} items (${Date.now() - start}ms) — ${url}`);
    return { ok: true, items: results };
  } catch (err) {
    clearTimeout(timer);
    const reason = err?.name === "AbortError" ? "timeout" : String(err?.message || "error");
    console.log(`[feed] ERR ${reason} — ${url}`);
    return { ok: false, items: [] };
  }
}

/* ── /api/proxy/rss — per-feed Node.js RSS proxy ─────────── */
// Browser calls this in dev; Node.js fetches without domain restrictions.
// Falls back to allorigins in production (static CDN, no server).
app.get("/api/proxy/rss", async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "application/rss+xml, application/atom+xml, text/xml, application/xml, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    clearTimeout(timer);
    if (!upstream.ok) return res.status(upstream.status).json({ error: `upstream ${upstream.status}` });
    const body = await upstream.text();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(body);
  } catch (err) {
    clearTimeout(timer);
    const reason = err?.name === "AbortError" ? "timeout" : String(err?.message ?? "error");
    console.log(`[proxy/rss] ERR ${reason} — ${url}`);
    res.status(502).json({ error: reason });
  }
});

/* ── /health ──────────────────────────────────────────────── */
app.get("/health", (req, res) => {
  res.json({ status: "AXION ONLINE", timestamp: new Date().toISOString(), feeds: FEED_SOURCES.length });
});

/* ── /api/health ──────────────────────────────────────────── */
app.get("/api/health", (req, res) => {
  res.json({ status: "AXION ONLINE", timestamp: new Date().toISOString(), static: SERVE_STATIC, port: PORT, feeds: FEED_SOURCES.length });
});

/* ── /api/signals ─────────────────────────────────────────── */
app.get("/api/signals", async (req, res) => {
  const PER_FEED = 15;
  const started = Date.now();

  const settled = await Promise.race([
    Promise.allSettled(FEED_SOURCES.map(({ url, domain }) => fetchFeed(url, domain, PER_FEED))),
    new Promise(resolve => setTimeout(() => resolve([]), 11000)),
  ]);

  const buckets = Array.isArray(settled) ? settled : [];
  let successCount = 0, failCount = 0;
  const raw = buckets.flatMap(r => {
    if (r.status !== "fulfilled") { failCount++; return []; }
    if (r.value.ok) successCount++;
    else failCount++;
    return r.value.items;
  });

  // Deduplicate by URL (exact) then by normalized title prefix
  const seenUrls = new Set();
  const seenTitles = new Set();
  const signals = raw.filter(e => {
    if (e.link) {
      if (seenUrls.has(e.link)) return false;
      seenUrls.add(e.link);
    }
    const key = e.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 48);
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  const elapsed = Date.now() - started;
  console.log(`[/api/signals] feeds=${FEED_SOURCES.length} ok=${successCount} fail=${failCount} raw=${raw.length} deduped=${signals.length} time=${elapsed}ms`);

  res.json({
    signals,
    count: signals.length,
    debug: { successFeeds: successCount, failFeeds: failCount, rawCount: raw.length, elapsed },
  });
});

/* ── Static (when production build is present) ────────────── */
if (SERVE_STATIC) {
  app.use(express.static(DIST));
  app.use((_, res) => res.sendFile(join(DIST, "index.html")));
  console.log(`[RSR AXION] Serving static build from ${DIST}`);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[RSR AXION] Listening on 0.0.0.0:${PORT}`);
});
