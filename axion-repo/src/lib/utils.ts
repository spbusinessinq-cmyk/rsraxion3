import type { FeedEvent, SignalPipelineStats, ThreatMatrix } from "./types";

/* ── Date / Location Helpers ────────────────────────────────────────────── */

function getBrowserDateTimeParts(now: Date) {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tz = localTz || "America/Los_Angeles";
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "long", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find(p => p.type === type)?.value || "";
  return { date: `${pick("month")} ${pick("day")}, ${pick("year")}`, time: `${pick("hour")}:${pick("minute")}` };
}

function getLocation(): string {
  return "Los Angeles, California";
}

/* ═══════════════════════════════════════════════════════════
   SOURCE RELIABILITY TIERS
   Tier 1: Official government/regulatory/institutional primary sources
   Tier 2: Major wire services and established news organizations
   Tier 3: Specialist analysis and trade outlets
   Tier 4: Unknown / weak / inconsistent sources
═══════════════════════════════════════════════════════════ */

const SOURCE_TIER_1_RE = /cisa\.gov|eia\.gov|federalregister\.gov|sec\.gov|nasa\.gov|noaa\.gov|who\.int|nist\.gov|nvd\.nist|iswresearch\.org|understandingwar\.org|pentagon\.mil|whitehouse\.gov|congress\.gov|state\.gov|defense\.gov|energy\.gov|hhs\.gov|dhs\.gov|fbi\.gov|fda\.gov/i;

const SOURCE_TIER_2_RE = /reuters\.com|bbc\.co\.uk|bbc\.com|apnews\.com|nytimes\.com|theguardian\.com|wsj\.com|ft\.com|bloomberg\.com|cnbc\.com|aljazeera\.com|dw\.com|npr\.org|axios\.com|politico\.com|thehill\.com|foreignaffairs\.com|foreignpolicy\.com|cfr\.org|skynews\.com|economist\.com|washingtonpost\.com/i;

const SOURCE_TIER_3_RE = /krebsonsecurity\.com|bleepingcomputer\.com|darkreading\.com|securityweek\.com|threatpost\.com|theregister\.com|arstechnica\.com|techcrunch\.com|technologyreview\.com|venturebeat\.com|defensenews\.com|defenseone\.com|breakingdefense\.com|thedrive\.com|navalnews\.com|warontherocks\.com|taskandpurpose\.com|oilprice\.com|freightwaves\.com|supplychaindive\.com|rand\.org|brookings\.edu|statnews\.com|wired\.com|zdnet\.com|theintercept\.com|logisticsmgmt\.com|energymonitor\.ai|space\.com|theverge\.com|foreignbrief\.com|janes\.com|stratfor\.com/i;

export function getSourceTier(source: string): 1 | 2 | 3 | 4 {
  if (SOURCE_TIER_1_RE.test(source)) return 1;
  if (SOURCE_TIER_2_RE.test(source)) return 2;
  if (SOURCE_TIER_3_RE.test(source)) return 3;
  return 4;
}

/* ═══════════════════════════════════════════════════════════
   SCORING CONSTANTS
═══════════════════════════════════════════════════════════ */

const HIGH_THREAT_RE = /\b(attack|breach|strike|war|missile|explosion|conflict|crisis|emergency|critical|warning|alert|escalat|hack|threat|bomb|weapon|casualt|killed|dead|sanction|blockade|invasion|offensive|siege|ambush|detonation|assassination|coup|insurrection|cyberattack|ransomware|malware|zero.?day|exploit)\b/i;

const MED_THREAT_RE = /\b(tension|pressure|risk|concern|warn|disputed|contested|clash|standoff|diplomatic|hostile|destabiliz|provocat|incursion|confrontation|ultimatum|friction|strain|unrest|protest|disruption)\b/i;

const INSTITUTIONAL_RE = /\b(government|military|ministry|congress|senate|president|executive|agency|central bank|nato|pentagon|secretar|defense|cabinet|parliament|administration|white house|state department|treasury|federal reserve|supreme court|eu\b|un\b|iaea|imf|world bank|g7|g20)\b/i;

const SYSTEM_IMPACT_RE = /\b(infrastructure|supply chain|power grid|pipeline|network|critical system|financial system|banking system|global trade|shipping lane|data breach|vulnerability|semiconductor|energy grid|communications|satellite|cyber attack|malware|zero.?day|ransomware|critical infrastructure)\b/i;

const POLICY_RE = /\b(policy|legislation|regulation|executive order|tariff|sanction|treaty|agreement|accord|resolution|directive|mandate|ruling|decision|bill|law|act\b)\b/i;

const ENERGY_RE = /\b(oil|gas|energy|crude|lng|brent|wti|pipeline|refinery|opec|electricity|nuclear|coal|renewable|solar|wind|fuel|petroleum)\b/i;

const MILITARY_RE = /\b(military|troops|army|navy|air force|warship|fighter|missile|drone|artillery|combat|battalion|brigade|carrier|submarine|special forces|pentagon)\b/i;

const TRADE_RE = /\b(trade|shipping|logistics|freight|supply chain|port|customs|tariff|export|import|container|cargo|transit|corridor|route)\b/i;

const TECH_RE = /\b(technology|cyber|digital|ai\b|artificial intelligence|compute|semiconductor|chip|cloud|network|data|software|algorithm|automation|quantum|machine learning)\b/i;

const GEO_SPREAD_RE = /\b(global|worldwide|international|multinational|multiple countries|across regions|regional|cross.border|bilateral|multilateral|transatlantic|indo.pacific)\b/i;

const ESCALATION_RE = /\b(urgent|breaking|immediate|rapidly|unprecedented|sudden|emergency|alarming|critical|imminent|accelerat|spiral|surge|soar)\b/i;

const DOMAIN_WEIGHTS: Record<string, number> = {
  "Security / Defense": 25,
  "Infrastructure": 25,
  "Cyber / Signals": 24,
  "AI / Compute": 23,
  "Technology": 22,
  "Technology Systems": 22,
  "Energy": 22,
  "Supply Chains": 21,
  "Markets / Economy": 22,
  "Markets": 22,
  "Information Warfare": 21,
  "Global Affairs": 19,
  "Policy / Regulation": 20,
  "Domestic / Policy": 20,
  "Governance / Institutions": 19,
  "Legal / Courts": 17,
  "Social Stability": 17,
  "Public Health / Biosecurity": 18,
  "Space / Orbital Systems": 20,
};

/* ═══════════════════════════════════════════════════════════
   SIGNAL SCORING ENGINE — Multi-Factor Model
   A. Relevance Score (0–100)
   B. Confidence Score (0–100)  — tier-based, not keyword-inflated
   C. Threat Score (0–100)
   D. Corroboration boost (source count > 1)
═══════════════════════════════════════════════════════════ */

export function scoreSignal(event: FeedEvent): FeedEvent {
  const text = `${event.title} ${event.summary}`.toLowerCase();

  // Recency weight (0–15)
  const ageMins = Math.max(0, (Date.now() - new Date(event.timestamp || 0).getTime()) / 60000);
  const recencyWeight = ageMins < 60 ? 15 : ageMins < 360 ? 12 : ageMins < 1440 ? 9 : ageMins < 4320 ? 5 : 2;

  // Domain weight (0–25)
  const domainW = DOMAIN_WEIGHTS[event.domain] ?? 14;

  // Institutional impact (0–20)
  const instScore = INSTITUTIONAL_RE.test(text) ? 20 : POLICY_RE.test(text) ? 12 : 5;

  // System impact (0–20)
  const sysScore = SYSTEM_IMPACT_RE.test(text) ? 20
    : /\b(system|sector|market|industry|economic|strategic|global)\b/i.test(text) ? 11 : 5;

  // Cross-domain potential (0–20)
  const crossCount = [
    ENERGY_RE.test(text),
    MILITARY_RE.test(text),
    TRADE_RE.test(text),
    TECH_RE.test(text),
    POLICY_RE.test(text),
  ].filter(Boolean).length;
  const crossScore = Math.min(20, crossCount * 5);

  // A. Relevance Score (0–100)
  const relevanceScore = Math.min(100, domainW + instScore + sysScore + crossScore + recencyWeight);
  void relevanceScore;

  // B. Confidence Score — anchored to source tier, NOT keyword strength
  const tier = event.sourceTier ?? getSourceTier(event.source);
  const tierBase = tier === 1 ? 88 : tier === 2 ? 76 : tier === 3 ? 64 : 55;
  // Title specificity: longer, specific titles are more reliable
  const titleClarity = event.title.length > 60 ? 10 : event.title.length > 40 ? 7 : event.title.length > 25 ? 4 : 1;
  // Summary specificity
  const summaryBonus = (event.summary?.length ?? 0) > 100 ? 4 : (event.summary?.length ?? 0) > 40 ? 2 : 0;
  // Corroboration: multiple independent sources confirm this story
  const corrobBoost = Math.min(10, ((event.sourceCount ?? 1) - 1) * 4);
  // Domain consistency (source covers this domain normally)
  const domConsistency = 0; // reserved for future feed-level metadata

  const confidence = Math.min(97, Math.max(52, Math.round(
    tierBase + titleClarity + summaryBonus + corrobBoost + recencyWeight * 0.25 + domConsistency
  )));

  // C. Threat Score (0–100)
  const threatBase = HIGH_THREAT_RE.test(text) ? 65 : MED_THREAT_RE.test(text) ? 36 : 12;
  const geoSpread = GEO_SPREAD_RE.test(text) ? 12 : 4;
  const escVelocity = ESCALATION_RE.test(text) ? 8 : 2;
  const threatScore = Math.min(100, Math.round(
    threatBase * 0.50 + sysScore * 0.20 + geoSpread + escVelocity + crossScore * 0.10
  ));

  // Severity from threat score
  const severity = threatScore >= 70 ? 4 : threatScore >= 48 ? 3 : threatScore >= 26 ? 2 : 1;

  return {
    ...event,
    confidence,
    severity,
    sourceTier: tier,
    corroborated: (event.sourceCount ?? 1) > 1,
  };
}

/* ── Threat Band (numeric cluster count → label) ────────────────────────── */

export function scoreBand(value: number): string {
  if (value >= 8) return "CRITICAL";
  if (value >= 6) return "HIGH";
  if (value >= 4) return "ELEVATED";
  if (value >= 2) return "GUARDED";
  return "LOW";
}

export function numericThreatBand(score: number): string {
  if (score >= 85) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 50) return "ELEVATED";
  if (score >= 31) return "GUARDED";
  return "LOW";
}

export function averageConfidence(events: FeedEvent[]): number {
  if (!events.length) return 0;
  return Math.round(events.reduce((s, e) => s + e.confidence, 0) / events.length);
}

export function formatThreatOrder(threat: string): number {
  const rank: Record<string, number> = { CRITICAL: 5, HIGH: 4, ELEVATED: 3, GUARDED: 2, LOW: 1 };
  return rank[threat] || 0;
}

export function clusterCounts(events: FeedEvent[]) {
  return {
    conflict: events.filter(e =>
      /missile|drone|military|war|strike|defense|navy|air.?force|ukraine|iran|israel|gaza|attack|kinetic|troops|combat|warship/i.test(`${e.title} ${e.summary}`)
    ).length,
    markets: events.filter(e =>
      /oil|shipping|logistics|tariff|dollar|treasury|inflation|equity|market|energy|trade|freight|commodity|brent|wti|opec|supply.chain|interest.rate/i.test(`${e.title} ${e.summary}`)
    ).length,
    infrastructure: events.filter(e =>
      /cyber|infrastructure|compute|ai\b|semiconductor|data|cloud|network|grid|ransomware|malware|exploit|vulnerability|critical.system|pipeline|hack/i.test(`${e.title} ${e.summary}`)
    ).length,
    information: events.filter(e =>
      /policy|executive|congress|agency|sanction|diplomacy|summit|foreign.ministry|white.house|senate|parliament|legislation|regulation|ruling/i.test(`${e.title} ${e.summary}`)
    ).length,
  };
}

/* ═══════════════════════════════════════════════════════════
   PRESSURE MODEL
═══════════════════════════════════════════════════════════ */

function assessPressureState(event: FeedEvent): string {
  const text = `${event.title} ${event.summary}`.toLowerCase();
  if (/escalat|intensif|rising|growing|increas|mounting|accelerat|surge|soar|outbreak|trigger|spiral|buildup|worsening/i.test(text)) return "BUILDING";
  if (/spread|transmit|cascade|contagion|ripple|spillover|cross.domain|secondary|downstream|adjacent|expanding/i.test(text)) return "TRANSFERRING";
  if (/ceasefire|resolution|agreement|settled|calm|stabiliz|de-escalat|retreat|withdraw|peace|negoti|accord|easing/i.test(text)) return "RELEASING";
  if (/fragmented|mixed|unclear|uncertain|ambiguous|contested|conflicting|divided|split/i.test(text)) return "FRAGMENTED";
  return "STABLE";
}

function inferPressureVector(event: FeedEvent): string {
  const text = `${event.title} ${event.summary}`.toLowerCase();
  const domain = event.domain;

  if (domain === "Energy" || ENERGY_RE.test(text)) {
    return TRADE_RE.test(text) ? "Energy → Markets / Economy" : "Energy → Infrastructure";
  }
  if (domain === "Security / Defense" || MILITARY_RE.test(text)) {
    return TRADE_RE.test(text) ? "Security → Markets" : ENERGY_RE.test(text) ? "Security → Energy" : "Security → Governance";
  }
  if (domain === "AI / Compute" || /ai\b|artificial intelligence|compute|semiconductor/i.test(text)) {
    return ENERGY_RE.test(text) ? "AI / Compute → Energy" : "AI / Compute → Policy";
  }
  if (domain === "Cyber / Signals" || /cyber|ransomware|malware|hack/i.test(text)) {
    return "Cyber → Governance / Infrastructure";
  }
  if (domain === "Supply Chains" || TRADE_RE.test(text)) {
    return MILITARY_RE.test(text) ? "Supply Chains → Security" : "Supply Chains → Markets";
  }
  if (domain === "Technology" || TECH_RE.test(text)) {
    return POLICY_RE.test(text) ? "Technology → Policy" : "Technology → Infrastructure";
  }
  if (domain === "Information Warfare") return "Information → Governance";
  if (domain === "Markets / Economy" || domain === "Markets") {
    return TRADE_RE.test(text) ? "Markets → Supply Chains" : "Markets → Policy";
  }
  return `${domain.split("/")[0].trim()} → Global Affairs`;
}

/* ═══════════════════════════════════════════════════════════
   DOMAIN PRESSURE CHART
═══════════════════════════════════════════════════════════ */

function buildDomainPressureChart(events: FeedEvent[]): string {
  const groups: Record<string, number> = {};
  events.forEach(e => { groups[e.domain] = (groups[e.domain] ?? 0) + 1; });

  const total = Math.max(1, events.length);
  const BAR = 20;
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return sorted.map(([domain, count]) => {
    const pct = count / total;
    const filled = Math.max(1, Math.round(pct * BAR * 3.5));
    const bars = "█".repeat(Math.min(BAR, filled)) + "░".repeat(Math.max(0, BAR - Math.min(BAR, filled)));
    const band = pct >= 0.22 ? "HIGH" : pct >= 0.13 ? "ELEVATED" : pct >= 0.06 ? "GUARDED" : "LOW";
    const pctStr = `${(pct * 100).toFixed(0)}%`.padStart(4);
    const label = domain.padEnd(30).slice(0, 30);
    return `${label}  ${bars}  ${band.padEnd(9)}  ${String(count).padStart(3)} signals  ${pctStr}`;
  }).join("\n");
}

/* ═══════════════════════════════════════════════════════════
   SIGNAL BLOCK BUILDERS
═══════════════════════════════════════════════════════════ */

function buildContext(e: FeedEvent): string {
  if (e.summary && e.summary.length > 20) {
    return e.summary.replace(/\s+/g, " ").trim().slice(0, 220);
  }
  if (/Security|Defense/.test(e.domain)) return "Military or security-related development from a monitored source.";
  if (/Markets|Economy/.test(e.domain)) return "Economic or financial signal from a monitored market source.";
  if (/Technology|Cyber|Infrastructure/.test(e.domain)) return "Technology or infrastructure signal from a monitored technical source.";
  if (/Policy|Domestic|Governance/.test(e.domain)) return "Policy or institutional signal from a monitored government source.";
  return "Open-source intelligence signal from a monitored global source.";
}

function buildMechanism(e: FeedEvent, matrix: ThreatMatrix): string {
  const text = `${e.title} ${e.summary}`.toLowerCase();

  if (/Security|Defense/.test(e.domain)) {
    if (MILITARY_RE.test(text)) {
      if (/deploy|reposition|redeploy|mov/i.test(text)) return "Military forces or assets are repositioning, altering the tactical balance and signaling posture to adversaries and allies simultaneously.";
      if (/drill|exercise|train/i.test(text)) return "Military readiness exercise or training event that elevates preparedness posture and serves as a deterrence signal to regional actors.";
      return "Military capability adjustment affecting strategic balance, deterrence calculations, and partner nation posturing.";
    }
    return matrix.conflict !== "LOW"
      ? "Security-domain pressure propagating through deterrence signals, force posture changes, and cascading partner nation responses — each step compressing decision time."
      : "Security-domain signal within normal monitoring parameters — watch for posture changes or third-party involvement.";
  }
  if (/Markets|Economy/.test(e.domain)) {
    if (ENERGY_RE.test(text)) return "Energy price or supply dynamics feeding directly into commodity markets, transportation costs, and downstream manufacturing and logistics chains.";
    if (/interest.rate|central.bank|federal.reserve|ecb/i.test(text)) return "Central bank action or signaling that reprices credit conditions, sovereign debt, and cross-border capital flows simultaneously.";
    return "Economic signal transmitting through credit availability, trade finance, or commodity pricing channels into adjacent sectors.";
  }
  if (/Technology|Cyber|Infrastructure/.test(e.domain)) {
    if (/ransomware|malware|exploit|breach|zero.?day/i.test(text)) return "Active adversarial exploitation of a digital or physical vulnerability with confirmed lateral spread potential across connected and dependent systems.";
    if (/chip|semiconductor|compute/i.test(text)) return "Semiconductor or compute infrastructure development that reshapes capability gaps between strategic competitors and creates downstream supply dependencies.";
    return "Technology or infrastructure change propagating through dependency networks — consequence profiles are nonlinear when interdependencies are activated.";
  }
  if (/Policy|Domestic|Governance/.test(e.domain)) {
    return POLICY_RE.test(text)
      ? "Regulatory or legislative action that restructures operating conditions — affecting compliance obligations, market access, and strategic positioning in the affected sectors."
      : "Institutional signaling that typically precedes formal executive, diplomatic, or legislative action within one to three cycle windows.";
  }
  if (/Energy/.test(e.domain)) return "Energy supply, pricing, or infrastructure dynamics transmitting into industrial output, transportation networks, and economic activity across all import-dependent sectors.";
  if (/Cyber/.test(e.domain)) return "Cyber-domain event propagating through network dependency chains — attribution, lateral reach, and critical system adjacency are the primary determinants of consequence severity.";
  return "Signal operating through a cross-domain transmission pathway. Identify the proximate actor, the affected system, and the transmission channel before assessing severity.";
}

function buildWhyItMatters(e: FeedEvent, matrix: ThreatMatrix): string {
  if (/Security|Defense/.test(e.domain))
    return "Directly affects strategic stability, deterrence posture, and partner nation positioning. Security domain signals frequently precede broader geopolitical shifts with material economic and institutional consequences.";
  if (/Markets|Economy/.test(e.domain))
    return "Affects commodity pricing, credit conditions, and trade corridor resilience. Economic stress in this domain generates downstream pressure on logistics, finance, and policy across interconnected systems.";
  if (/Technology|Cyber|Infrastructure/.test(e.domain))
    return matrix.infrastructure !== "LOW"
      ? "Active pressure on technology or infrastructure systems that underpin economic activity, defense capability, and communications. Disruption in this domain amplifies nonlinearly when multiple systems are under simultaneous pressure."
      : "Technology or infrastructure signal with latent systemic risk. Consequence profiles are disproportionate to preceding indicator volume — monitoring gaps here create the largest analytic blind spots.";
  if (/Policy|Domestic|Governance/.test(e.domain))
    return "Shapes the regulatory, diplomatic, and institutional operating environment. Institutional shifts frequently precede material changes to legal, financial, or strategic conditions within one to three cycles.";
  if (/Energy/.test(e.domain))
    return "Energy market dynamics carry direct downstream effects across manufacturing, transportation, and economic output. Supply constraint or price volatility in this domain propagates to all interconnected sectors within 24–72 hours.";
  if (/Cyber/.test(e.domain))
    return "Cyber-domain events carry disproportionate consequence relative to signal volume. Attribution accuracy, lateral spread velocity, and critical system adjacency are the primary risk determinants.";
  return "Cross-domain signal with secondary transmission potential into security, economic, and institutional systems — the full consequence profile is not visible from the originating domain alone.";
}

function buildSystemImpact(e: FeedEvent, matrix: ThreatMatrix): string {
  if (/Security|Defense/.test(e.domain))
    return matrix.markets !== "LOW"
      ? "Security, Markets (energy/logistics exposure), and partner nation positioning — compounding coupling active across at least two domains."
      : "Security domain and adjacent diplomatic, institutional, and intelligence channels.";
  if (/Markets|Economy/.test(e.domain))
    return matrix.conflict !== "LOW"
      ? "Markets, Energy pricing, and conflict-adjacent supply chains — multi-domain compounding active."
      : "Markets, Trade logistics, Financial system conditions, and sovereign debt exposure.";
  if (/Technology|Cyber|Infrastructure/.test(e.domain))
    return "Infrastructure, Technology dependencies, and all sectors reliant on affected systems. Cascade failure potential is the primary risk variable when interdependent systems are simultaneously exposed.";
  if (/Policy|Domestic|Governance/.test(e.domain))
    return "Regulatory environment, Institutional credibility, Diplomatic conditions, and market-sensitive policy channels.";
  if (/Energy/.test(e.domain))
    return "Energy production, Industrial supply chains, Transportation networks, and economic activity across all import-dependent sectors.";
  return "Cross-domain impact — monitor for secondary transmission into security, economic, and infrastructure systems within the next 24–48 hours.";
}

function buildForwardOutlook(e: FeedEvent, matrix: ThreatMatrix): string {
  if (/Security|Defense/.test(e.domain))
    return matrix.conflict !== "LOW"
      ? "Track escalation velocity, geographic spread of affected forces, partner nation force movements, and kinetic follow-on activity. Secondary transmission into energy and logistics represents the leading risk pathway."
      : "Monitor for confirming force movements, deployment orders, or third-party involvement that would indicate directional change from the current posture.";
  if (/Markets|Economy/.test(e.domain))
    return matrix.markets !== "LOW"
      ? "Track commodity price trajectory over 48–72 hours, trade finance stress indicators, and logistics network disruption. Secondary market contagion into credit and sovereign debt is the key risk indicator."
      : "Monitor credit conditions and commodity pricing for asymmetric shock potential. Current parameters are within manageable range but sensitive to external triggers.";
  if (/Technology|Cyber|Infrastructure/.test(e.domain))
    return matrix.infrastructure !== "LOW"
      ? "Track attribution timeline, active patch cycle response rates, CISA and partner agency advisories, and lateral spread confirmation. Infrastructure resilience metrics are the leading indicator of consequence severity."
      : "Monitor vulnerability advisories on standard cadence. No acute threat trajectory confirmed at current posture.";
  if (/Policy|Domestic|Governance/.test(e.domain))
    return matrix.information !== "LOW"
      ? "Track near-term executive, legislative, and regulatory actions that confirm or reverse the current institutional trajectory. Signals of this type typically precede material action within one to three cycle windows."
      : "Monitor for directional confirmation through executive action, legislative movement, or diplomatic communication. No confirmed action pathway at current posture.";
  return "Monitor for a second independent confirming signal from a different source before adjusting posture assessment. Single-source signals remain unverified.";
}

function buildWatchpoint(e: FeedEvent, matrix: ThreatMatrix): string {
  if (/Security|Defense/.test(e.domain))
    return matrix.conflict !== "LOW"
      ? "Confirming kinetic activity, force repositioning beyond declared exercises, or involvement of a third-party actor not previously in the picture."
      : "Any shift in force deployment orders, deterrence signaling, or partner nation posture outside established pattern.";
  if (/Markets|Economy/.test(e.domain))
    return "Sustained commodity price deviation exceeding 5% in 24 hours, credit spread widening, trade corridor disruption, or emergency central bank communication.";
  if (/Technology|Cyber|Infrastructure/.test(e.domain))
    return "Attribution announcement, additional victim confirmation, or advisory upgrade from CISA, NSA, or partner agencies — any of which would confirm active threat trajectory.";
  if (/Policy|Domestic|Governance/.test(e.domain))
    return "Executive order, legislative vote result, diplomatic communiqué, or official public statement that confirms or reverses the institutional direction.";
  if (/Energy/.test(e.domain))
    return "OPEC production decision change, pipeline or terminal disruption report, or energy corridor security incident that would constrain supply.";
  return "Second independent confirming signal from a different source within this or the next intelligence cycle.";
}

function buildSignalBlock(e: FeedEvent, matrix: ThreatMatrix, counts: ReturnType<typeof clusterCounts>): string {
  const state = assessPressureState(e);
  const vector = inferPressureVector(e);
  const tierLabel = e.sourceTier === 1 ? "TIER 1 — OFFICIAL" : e.sourceTier === 2 ? "TIER 2 — WIRE SERVICE" : e.sourceTier === 3 ? "TIER 3 — SPECIALIST" : "TIER 4 — UNVERIFIED";
  const corrobNote = e.corroborated ? `  |  CORROBORATED (${e.sourceCount ?? "2"}+ sources)` : "";

  return [
    `SIGNAL:          ${e.domain.toUpperCase()}  |  ${tierLabel}${corrobNote}`,
    `CONFIDENCE:      ${e.confidence}/100  |  SEVERITY: ${"■".repeat(e.severity)}${"□".repeat(4 - e.severity)}  |  SOURCE: ${e.source}`,
    `EVENT:           ${e.title}`,
    `CONTEXT:         ${buildContext(e)}`,
    `MECHANISM:       ${buildMechanism(e, matrix)}`,
    `WHY IT MATTERS:  ${buildWhyItMatters(e, matrix)}`,
    `SYSTEM IMPACT:   ${buildSystemImpact(e, matrix)}`,
    `PRESSURE STATE:  ${state}  |  VECTOR: ${vector}`,
    `FORWARD OUTLOOK: ${buildForwardOutlook(e, matrix)}`,
    `WATCHPOINT:      ${buildWatchpoint(e, matrix)}`,
  ].join("\n");
}

/* ═══════════════════════════════════════════════════════════
   PATTERN ANALYSIS
═══════════════════════════════════════════════════════════ */

type PatternType = "CONVERGENCE" | "ESCALATION" | "FRAGMENTATION" | "STABILIZATION";

function identifyPatternType(matrix: ThreatMatrix, counts: ReturnType<typeof clusterCounts>): { type: PatternType; explanation: string } {
  const active = [counts.conflict > 2, counts.markets > 2, counts.infrastructure > 1, counts.information > 2].filter(Boolean).length;

  if (active >= 3) return {
    type: "CONVERGENCE",
    explanation: "Three or more domain clusters are simultaneously elevated. Signals are converging across security, economic, and institutional lines — a high-stress configuration that limits single-domain response effectiveness and compresses decision lead time.",
  };
  if (active === 2 && (matrix.overall === "HIGH" || matrix.overall === "CRITICAL")) return {
    type: "ESCALATION",
    explanation: "Two active clusters are co-moving upward. The coupling between them is driving the overall posture higher. Escalation pattern requires active monitoring for cross-domain transmission and correlated risk scenarios.",
  };
  if (active >= 2 && matrix.overall === "ELEVATED") return {
    type: "CONVERGENCE",
    explanation: `Moderate convergence detected. Signals are clustering across ${[counts.conflict > 2 && "security", counts.markets > 2 && "markets", counts.infrastructure > 1 && "infrastructure", counts.information > 2 && "policy"].filter(Boolean).join(" and ")} but have not yet reached acute cross-domain coupling.`,
  };
  if (active === 0 && matrix.overall === "GUARDED") return {
    type: "STABILIZATION",
    explanation: "Signal distribution is broad without concentration. No dominant cluster has formed. The environment is holding within baseline parameters — a stabilization pattern that rewards monitoring continuity over reactive posture adjustment.",
  };
  if (active === 0 && matrix.overall === "LOW") return {
    type: "STABILIZATION",
    explanation: "Signal volume and severity are at baseline. No significant cluster pressure detected. This is a low-signal window — typical of interstitial periods between active cycles. Maintain disciplined monitoring to avoid missing emergent signals.",
  };
  return {
    type: "FRAGMENTATION",
    explanation: "Signals are active across multiple domains but without convergence. Developments are occurring independently rather than coupling. Fragmented patterns can obscure cumulative pressure that does not yet appear systemic — breadth analysis is more valuable than depth at this stage.",
  };
}

/* ═══════════════════════════════════════════════════════════
   EXECUTIVE SUMMARY BUILDER
═══════════════════════════════════════════════════════════ */

function buildExecutiveSummary(
  events: FeedEvent[],
  matrix: ThreatMatrix,
  counts: ReturnType<typeof clusterCounts>,
  conf: number
): string {
  const activeDomains = [
    counts.conflict > 2 && "security and conflict",
    counts.markets > 2 && "markets and energy",
    counts.infrastructure > 1 && "technology and infrastructure",
    counts.information > 2 && "policy and institutional",
  ].filter(Boolean) as string[];

  const topSignal = events[0];
  const topContext = topSignal
    ? `The leading signal this cycle — ${topSignal.title} — reflects ${/Security|Defense/.test(topSignal.domain) ? "active pressure in the security domain" : /Markets|Economy/.test(topSignal.domain) ? "economic and market stress" : /Tech|Cyber|Infrastructure/.test(topSignal.domain) ? "technology and infrastructure exposure" : "institutional and policy movement"}. Source reliability: Tier ${topSignal.sourceTier ?? 4}.`
    : "";

  const postureLines: Record<string, string> = {
    CRITICAL: `AXION assesses the operating environment at CRITICAL. Multiple high-severity signals across intersecting domains indicate compounding systemic risk. The convergence is structural, not coincidental — it requires active management, not routine monitoring. Correlated scenarios are the planning baseline.`,
    HIGH: `AXION assesses the operating environment at HIGH. Elevated pressure is active across two or more primary domains, generating secondary effects that reduce predictability and increase correlated risk. Decision-makers should adopt an elevated readiness posture and initiate contingency review.`,
    ELEVATED: `AXION assesses the operating environment at ELEVATED. Developing pressure in ${activeDomains[0] || "one or more primary domains"} is reshaping the intelligence picture. The cycle is fluid — direction of travel is the critical variable, not current position.`,
    GUARDED: `AXION assesses the operating environment at GUARDED. Background tension is present across monitored domains but within manageable range. No acute escalation pathway is confirmed. The primary analytical risk at this posture is complacency — signal discipline erodes during quiet periods.`,
    LOW: `AXION assesses the operating environment at LOW. Signal volume and severity are at or near baseline levels. No significant threat cluster has formed. Maintain standard monitoring cadence.`,
  };

  const posture = postureLines[matrix.overall] || postureLines["GUARDED"];

  const coupling = activeDomains.length >= 2
    ? ` Cross-domain coupling is active between ${activeDomains.slice(0, 2).join(" and ")} — a configuration that compresses response lead time and increases systemic stress probability.`
    : activeDomains.length === 1
    ? ` Primary pressure is concentrated in ${activeDomains[0]}. No significant cross-domain coupling detected at this time.`
    : ``;

  const corrobCount = events.filter(e => e.corroborated).length;
  const corrobNote = corrobCount > 0 ? ` ${corrobCount} signal(s) confirmed by multiple independent sources.` : "";
  const tail = ` ${topContext} This cycle processed ${events.length} signals at ${conf}/100 average confidence.${corrobNote}`;

  return `${posture}${coupling}${tail}`;
}

/* ═══════════════════════════════════════════════════════════
   ESCALATION MODEL
═══════════════════════════════════════════════════════════ */

export function buildEscalationModel(matrix: ThreatMatrix, confidence: number, signalCount: number = 10): string {
  const severe = [matrix.conflict, matrix.markets, matrix.infrastructure, matrix.information]
    .filter(x => x === "HIGH" || x === "CRITICAL").length;

  const caveat = signalCount < 6
    ? ` Note: Signal set is limited (${signalCount} items). Additional ingestion recommended before adjusting posture.`
    : confidence < 72
    ? ` Note: Cycle confidence is below threshold (${confidence}/100). Treat assessment as directional, not definitive.`
    : "";

  if (matrix.overall === "CRITICAL" || severe >= 3)
    return `Cross-domain stress confirmed. Compounding risk vectors are active with high probability of systemic coupling. Confidence: ${confidence}/100. Immediate executive notification warranted.${caveat}`;
  if (matrix.overall === "HIGH" || severe >= 2)
    return `Elevated pressure active across two or more domains. Secondary transmission is plausible within this cycle window. Confidence: ${confidence}/100. Sustained elevated watch posture recommended.${caveat}`;
  if (matrix.overall === "ELEVATED")
    return `Developing pressure in at least one domain. Cycle is fluid. Confidence: ${confidence}/100. Elevated reporting frequency appropriate.${caveat}`;
  return `Guarded posture holds. No immediate cross-domain escalation pathway indicated. Confidence: ${confidence}/100. Routine monitoring is sufficient.${caveat}`;
}

/* ═══════════════════════════════════════════════════════════
   DATA TABLE BUILDERS
═══════════════════════════════════════════════════════════ */

function buildSignalIntakeTable(workingSet: FeedEvent[], primaryLimit: number, stats?: SignalPipelineStats): string {
  const rows: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

  if (stats) {
    rows.push(`${pad("Raw collected (all feeds):", 40)}  ${String(stats.rawCount).padStart(6)}`);
    rows.push(`${pad("Parsed (title + summary extracted):", 40)}  ${String(stats.parsedCount).padStart(6)}`);
    rows.push(`${pad("Rejected (relevance / noise filter):", 40)}  ${String(stats.rejectedCount).padStart(6)}`);
    rows.push(`${pad("Deduplicated (unique stories):", 40)}  ${String(stats.dedupCount).padStart(6)}`);
    rows.push(`${pad("Usable (scored + ranked):", 40)}  ${String(stats.usableCount).padStart(6)}`);
    rows.push(`${pad("Used in this brief:", 40)}  ${String(Math.min(primaryLimit + 8, workingSet.length)).padStart(6)}`);
    rows.push(``);
    rows.push(`${pad("Feeds attempted:", 40)}  ${String(stats.successFeeds + stats.failFeeds).padStart(6)}`);
    rows.push(`${pad("Feeds successful:", 40)}  ${String(stats.successFeeds).padStart(6)}`);
    rows.push(`${pad("Feeds failed / rejected:", 40)}  ${String(stats.failFeeds).padStart(6)}`);
    rows.push(`${pad("Ingestion time:", 40)}  ${String((stats.elapsed / 1000).toFixed(1)).padStart(5)}s`);
    rows.push(``);
    if (Object.keys(stats.rejectionBreakdown).length > 0) {
      rows.push(`REJECTION BREAKDOWN:`);
      Object.entries(stats.rejectionBreakdown).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
        rows.push(`  ${pad(reason + ":", 38)}  ${String(count).padStart(6)}`);
      });
    }
  } else {
    rows.push(`${pad("Signals processed:", 40)}  ${String(workingSet.length).padStart(6)}`);
    rows.push(`${pad("Used in this brief:", 40)}  ${String(Math.min(primaryLimit + 8, workingSet.length)).padStart(6)}`);
    rows.push(`Note: Pull signals to generate full intake pipeline statistics.`);
  }

  return rows.join("\n");
}

function buildSourceHealthTable(workingSet: FeedEvent[], stats?: SignalPipelineStats): string {
  const rows: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

  if (stats) {
    const tier1 = workingSet.filter(e => e.sourceTier === 1).length;
    const tier2 = workingSet.filter(e => e.sourceTier === 2).length;
    const tier3 = workingSet.filter(e => e.sourceTier === 3).length;
    const tier4 = workingSet.filter(e => e.sourceTier === 4).length;
    const corrobCount = workingSet.filter(e => e.corroborated).length;

    rows.push(`SOURCE TIER DISTRIBUTION (this brief):`);
    rows.push(`  ${pad("Tier 1 — Official / Institutional:", 40)}  ${String(tier1).padStart(4)}`);
    rows.push(`  ${pad("Tier 2 — Wire Service / Major News:", 40)}  ${String(tier2).padStart(4)}`);
    rows.push(`  ${pad("Tier 3 — Specialist / Trade:", 40)}  ${String(tier3).padStart(4)}`);
    rows.push(`  ${pad("Tier 4 — Unknown / Unverified:", 40)}  ${String(tier4).padStart(4)}`);
    rows.push(`  ${pad("Corroborated (2+ independent sources):", 40)}  ${String(corrobCount).padStart(4)}`);
    rows.push(``);

    if (stats.topDomains.length > 0) {
      rows.push(`TOP SIGNAL DOMAINS:`);
      stats.topDomains.slice(0, 6).forEach(d => {
        rows.push(`  ${pad(d.domain + ":", 40)}  ${String(d.count).padStart(4)} signals`);
      });
    }
    if (stats.weakDomains.length > 0) {
      rows.push(``);
      rows.push(`WEAK COVERAGE DOMAINS (< 3 signals):`);
      rows.push(`  ${stats.weakDomains.join(", ")}`);
    }
  } else {
    rows.push(`Source health data available after live signal pull.`);
    const tier1 = workingSet.filter(e => (e.sourceTier ?? 4) === 1).length;
    const tier2 = workingSet.filter(e => (e.sourceTier ?? 4) === 2).length;
    const tier3 = workingSet.filter(e => (e.sourceTier ?? 4) === 3).length;
    const tier4 = workingSet.filter(e => (e.sourceTier ?? 4) === 4).length;
    rows.push(`Tier 1: ${tier1}  |  Tier 2: ${tier2}  |  Tier 3: ${tier3}  |  Tier 4: ${tier4}`);
  }

  return rows.join("\n");
}

function buildConfidenceDistribution(workingSet: FeedEvent[]): string {
  const confirmed = workingSet.filter(e => e.confidence >= 88);
  const likely = workingSet.filter(e => e.confidence >= 78 && e.confidence < 88);
  const contested = workingSet.filter(e => e.confidence >= 68 && e.confidence < 78);
  const unknown = workingSet.filter(e => e.confidence < 68);

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  return [
    `${pad("CONFIRMED  (≥88%):", 30)}  ${String(confirmed.length).padStart(4)}  (${((confirmed.length / Math.max(1, workingSet.length)) * 100).toFixed(0)}%)`,
    `${pad("LIKELY     (78–87%):", 30)}  ${String(likely.length).padStart(4)}  (${((likely.length / Math.max(1, workingSet.length)) * 100).toFixed(0)}%)`,
    `${pad("CONTESTED  (68–77%):", 30)}  ${String(contested.length).padStart(4)}  (${((contested.length / Math.max(1, workingSet.length)) * 100).toFixed(0)}%)`,
    `${pad("UNKNOWN    (<68%):", 30)}  ${String(unknown.length).padStart(4)}  (${((unknown.length / Math.max(1, workingSet.length)) * 100).toFixed(0)}%)`,
  ].join("\n");
}

function buildPressureVectorTable(events: FeedEvent[]): string {
  const vectors: Record<string, { count: number; intensity: string }> = {};
  events.forEach(e => {
    const v = inferPressureVector(e);
    const state = assessPressureState(e);
    const intensity = state === "BUILDING" ? "HIGH" : state === "TRANSFERRING" ? "ELEVATED" : state === "FRAGMENTED" ? "FRAGMENTED" : "MODERATE";
    if (!vectors[v]) vectors[v] = { count: 0, intensity };
    vectors[v].count++;
    if (intensity === "HIGH" && vectors[v].intensity !== "HIGH") vectors[v].intensity = "HIGH";
  });

  const sorted = Object.entries(vectors).sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

  if (sorted.length === 0) return "No pressure vectors identified in current signal set.";

  return sorted.map(([vector, data]) => {
    const [src, tgt] = vector.split("→").map(s => s.trim());
    return `${pad(src ?? vector, 30)}  →  ${pad(tgt ?? "N/A", 30)}  ${pad(data.intensity, 12)}  ${data.count} signals`;
  }).join("\n");
}

/* ═══════════════════════════════════════════════════════════
   FULL BRIEF — 14-SECTION STRUCTURE
═══════════════════════════════════════════════════════════ */

export function buildFullBrief(
  sourceSet: FeedEvent[],
  matrix: ThreatMatrix,
  patterns: string[],
  mode: string,
  depth: "full" | "quick",
  now: Date = new Date(),
  stats?: SignalPipelineStats
): string {
  const { date, time } = getBrowserDateTimeParts(now);
  const location = getLocation();
  const cycleLabel = depth === "quick" ? "QUICK" : mode === "weekly" ? "WEEKLY" : mode === "full" ? "FULL" : "DAILY";
  const briefTitle = depth === "quick" ? "QUICK BRIEF"
    : mode === "weekly" ? "WEEKLY INTELLIGENCE BRIEF"
    : mode === "full" ? "FULL INTELLIGENCE BRIEF"
    : "DAILY INTELLIGENCE BRIEF";
  const conf = averageConfidence(sourceSet);
  const counts = clusterCounts(sourceSet);
  const pattern = identifyPatternType(matrix, counts);

  const signalLimit = depth === "quick" ? 6 : mode === "weekly" ? 25 : mode === "full" ? 40 : 15;
  const primaryLimit = depth === "quick" ? 3 : mode === "full" ? 7 : 5;
  const workingSet = sourceSet.slice(0, signalLimit);
  const corrobCount = workingSet.filter(e => e.corroborated).length;

  const header = [
    "FROM THE OFFICE OF EXECUTIVE INTELLIGENCE",
    "RSR AXION — INTELLIGENCE SYNTHESIS SYSTEM v3.0",
    `Location: ${location}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `INTELLIGENCE CYCLE: ${cycleLabel}`,
    `SIGNALS PROCESSED: ${workingSet.length}`,
    `CYCLE CONFIDENCE: ${conf}/100`,
    corrobCount > 0 ? `CORROBORATED SIGNALS: ${corrobCount}` : "",
    stats ? `PIPELINE: ${stats.rawCount} raw → ${stats.parsedCount} parsed → ${stats.rejectedCount} rejected → ${stats.usableCount} usable` : "",
  ].filter(Boolean).join("\n");

  const div = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

  /* §1 Executive Overview */
  const s1 = buildExecutiveSummary(workingSet, matrix, counts, conf);

  /* §2 Threat Posture Summary */
  const s2 = [
    `Overall Threat Posture:         ${matrix.overall}`,
    `Conflict Index:                 ${matrix.conflict}`,
    `Economic Stress Index:          ${matrix.markets}`,
    `Infrastructure Exposure Index:  ${matrix.infrastructure}`,
    `Information / Policy Index:     ${matrix.information}`,
    `Technology / AI Index:          ${counts.infrastructure > 3 ? "ELEVATED" : counts.infrastructure > 1 ? "GUARDED" : "LOW"}`,
    `Energy Index:                   ${ENERGY_RE.test(workingSet.map(e => e.title).join(" ")) ? "GUARDED" : "LOW"}`,
    `Cycle Confidence:               ${conf}/100`,
  ].join("\n");

  /* §3 Data Summary — full intake pipeline + source health + confidence distribution */
  const avgThreat = workingSet.length
    ? Math.round(workingSet.reduce((s, e) => s + (e.severity * 22.5), 0) / workingSet.length)
    : 0;
  const domainSet = [...new Set(workingSet.map(e => e.domain))].join(", ");

  const s3 = [
    `── SIGNAL INTAKE PIPELINE ──────────────────────────────────────────────────`,
    buildSignalIntakeTable(workingSet, primaryLimit, stats),
    ``,
    `── SOURCE RELIABILITY ──────────────────────────────────────────────────────`,
    buildSourceHealthTable(workingSet, stats),
    ``,
    `── CONFIDENCE DISTRIBUTION ─────────────────────────────────────────────────`,
    buildConfidenceDistribution(workingSet),
    ``,
    `── DOMAIN + METRIC SUMMARY ──────────────────────────────────────────────────`,
    `Domain Coverage:      ${domainSet || "N/A"}`,
    `Average Confidence:   ${conf}/100`,
    `Average Threat Score: ${avgThreat}/100`,
    `Top Pressure Domain:  ${workingSet[0]?.domain || "N/A"}`,
  ].join("\n");

  /* §4 Domain Pressure Chart */
  const hasSufficient = workingSet.length >= 5;
  const s4 = hasSufficient
    ? buildDomainPressureChart(workingSet)
    : "Insufficient signal density for domain pressure chart generation.";

  /* §5 Primary Signals */
  const primarySignals = workingSet.slice(0, primaryLimit);
  const s5 = primarySignals.length > 0
    ? primarySignals.map(e => buildSignalBlock(e, matrix, counts)).join(`\n\n${"─".repeat(80)}\n\n`)
    : "No primary signals identified with sufficient confidence in this cycle.";

  /* §6 Signal Matrix — grouped by confidence tier */
  const matrixConfirmed = workingSet.filter(e => e.confidence >= 88).slice(0, 10);
  const matrixLikely = workingSet.filter(e => e.confidence >= 78 && e.confidence < 88).slice(0, 10);
  const matrixContested = workingSet.filter(e => e.confidence < 78).slice(0, 10);

  const renderMatrixGroup = (label: string, items: FeedEvent[]) => {
    if (!items.length) return `${label}\n  None at this confidence tier.`;
    const rows = items.map(e => {
      const tierLabel = e.sourceTier ? `T${e.sourceTier}` : "T?";
      const corrobLabel = e.corroborated ? " ◆" : "";
      return `  [${e.domain}] [${tierLabel}${corrobLabel}] ${e.title} — ${e.confidence}/100`;
    });
    return `${label}\n${rows.join("\n")}`;
  };

  const s6 = [
    renderMatrixGroup("CONFIRMED (≥88%)", matrixConfirmed),
    "",
    renderMatrixGroup("LIKELY (78–87%)", matrixLikely),
    "",
    renderMatrixGroup("CONTESTED / UNKNOWN (<78%)", matrixContested),
    "",
    `◆ = Corroborated by 2+ independent sources   T1=Official T2=Wire T3=Specialist T4=Unverified`,
  ].join("\n");

  /* §7 System Mechanics */
  const activeClusters = [
    counts.conflict > 2 && "Conflict / Security",
    counts.markets > 2 && "Markets / Energy",
    counts.infrastructure > 1 && "Infrastructure / Technology",
    counts.information > 2 && "Policy / Information",
  ].filter(Boolean) as string[];

  const s7Lines: string[] = [];
  if (matrix.conflict !== "LOW")
    s7Lines.push(`CONFLICT MECHANICS: Security-domain signals are driving deterrence calculations and partner nation posturing. Escalation probability is non-trivial — force positioning and capability deployments are the key leading indicators. Decision makers in this posture should not wait for kinetic confirmation before positioning.`);
  if (matrix.markets !== "LOW")
    s7Lines.push(`MARKET MECHANICS: Economic and energy signals are reshaping trade corridor conditions, commodity pricing, and credit availability. Downstream effects on manufacturing, logistics, and sovereign debt are the primary transmission channels — typically lagging the initial signal by 24–72 hours.`);
  if (matrix.infrastructure !== "LOW")
    s7Lines.push(`INFRASTRUCTURE MECHANICS: Technology and infrastructure signals are active. Adversarial actors may be probing for exploitable vulnerability. Cascade failure potential is elevated when interdependent systems face simultaneous pressure — the interconnection creates the consequence, not the individual event.`);
  if (matrix.information !== "LOW")
    s7Lines.push(`POLICY MECHANICS: Institutional signals indicate the regulatory and diplomatic environment is being actively reshaped. Organizations in policy-sensitive sectors should anticipate near-term changes to operating conditions within one to three cycle windows.`);
  if (s7Lines.length === 0)
    s7Lines.push(`No primary system mechanics are elevated this cycle. Background processes are operating within normal range. Maintain standard monitoring cadence and prepare scenario templates for rapid activation if conditions change.`);
  const s7 = s7Lines.join("\n\n");

  /* §8 System Intersection */
  const s8Lines: string[] = [];
  if (matrix.conflict !== "LOW" && matrix.markets !== "LOW")
    s8Lines.push(`SECURITY × ECONOMIC COUPLING: When security and market signals co-move, the risk is not additive — it introduces a volatility multiplier that reduces the effectiveness of single-domain response strategies. Energy and logistics corridors are the primary transmission channels; disruption in one amplifies the other.`);
  if (matrix.markets !== "LOW" && matrix.infrastructure !== "LOW")
    s8Lines.push(`ECONOMIC × INFRASTRUCTURE COUPLING: Market and infrastructure signals are intersecting through logistics networks, energy systems, and technology dependency chains. Disruption originating in either domain propagates into the other with reduced friction and compressed warning time.`);
  if (matrix.information !== "LOW" && matrix.conflict !== "LOW")
    s8Lines.push(`POLICY × SECURITY COUPLING: Diplomatic and institutional signals are reinforcing the security picture. Policy decisions in this configuration frequently precede or accompany kinetic or economic escalation within one to three cycles — the institutional signal is the leading edge, not a lagging indicator.`);
  if (matrix.infrastructure !== "LOW" && matrix.information !== "LOW")
    s8Lines.push(`TECHNOLOGY × POLICY COUPLING: AI, semiconductor, and cyber signals are generating regulatory pressure as governments respond to technology risk simultaneously with adversarial exploitation. This coupling compresses both the threat and the response within the same cycle window.`);
  if (s8Lines.length === 0)
    s8Lines.push(`No significant cross-domain coupling confirmed this cycle. Signals are operating within their respective domain boundaries. Monitor for coupling triggers — they typically appear as correlated signals from two domains within the same 24-hour window.`);
  const s8 = s8Lines.join("\n\n");

  /* §9 Pressure Map + Vector Table */
  const building = workingSet.filter(e => assessPressureState(e) === "BUILDING").slice(0, 5);
  const transferring = workingSet.filter(e => assessPressureState(e) === "TRANSFERRING").slice(0, 5);
  const releasing = workingSet.filter(e => assessPressureState(e) === "RELEASING").slice(0, 3);

  const s9 = [
    `PRESSURE BUILDING:`,
    building.length ? building.map(e => `  • [${e.domain}] ${e.title}`).join("\n") : "  None confirmed.",
    ``,
    `PRESSURE TRANSFERRING:`,
    transferring.length ? transferring.map(e => `  • ${inferPressureVector(e)} — ${e.title.slice(0, 80)}`).join("\n") : "  None confirmed.",
    ``,
    `PRESSURE RELEASING:`,
    releasing.length ? releasing.map(e => `  • [${e.domain}] ${e.title}`).join("\n") : "  None confirmed.",
    ``,
    `PRESSURE VECTOR TABLE (Source Domain → Target Domain → Intensity):`,
    buildPressureVectorTable(workingSet),
  ].join("\n");

  /* §10 Constraints */
  const s10Lines: string[] = [];
  if (matrix.conflict !== "LOW") s10Lines.push(`• Diplomatic constraints: Active back-channel negotiations or third-party mediation could reduce escalation velocity if mutual incentives for de-escalation materialize. Economic costs of continued escalation serve as the primary natural brake.`);
  if (matrix.markets !== "LOW") s10Lines.push(`• Market constraints: Central bank intervention, emergency reserve releases, or coordinated sovereign action could stabilize commodity and credit conditions within 48–72 hours — assuming institutional credibility remains intact.`);
  if (matrix.infrastructure !== "LOW") s10Lines.push(`• Technical constraints: Patch cycles, system redundancy, and incident response protocols can limit the blast radius of infrastructure events — but only if activated before cascade conditions develop.`);
  if (matrix.information !== "LOW") s10Lines.push(`• Institutional constraints: Legislative timelines, judicial review processes, and inter-agency coordination create natural lag before policy signals materialize into operational changes — typically 30–90 days in normal conditions.`);
  if (s10Lines.length === 0) s10Lines.push(`• No significant constraints on current trajectories identified. Monitor for catalysts that could rapidly shift the operating picture without warning.`);
  const s10 = s10Lines.join("\n");

  /* §11 Forward Projection */
  const continuationPath = `Direction of travel is ${matrix.overall.toLowerCase()}. If current signal volumes and domain pressures persist without escalation, the operating environment remains within manageable parameters over the next 24–72 hours.`;
  const escalationPath = matrix.overall === "HIGH" || matrix.overall === "CRITICAL"
    ? `A confirming signal in the ${activeClusters[0] || "primary domain"} — particularly one involving a second independent actor or a third-party response — would trigger a posture upgrade. This path compresses decision lead time significantly.`
    : `Escalation requires a high-severity confirming event in the leading domain plus evidence of cross-domain coupling. Probability: ${counts.conflict > 3 || counts.markets > 3 ? "MODERATE" : "LOW"} at current signal set.`;
  const stabilizationPath = `De-escalation requires confirming signals from at least two independent domains simultaneously — diplomatic resolution, market stabilization, or institutional accommodation. Probability: ${matrix.overall === "GUARDED" || matrix.overall === "LOW" ? "HIGH" : "MODERATE"}.`;
  const failurePath = `Failure scenario: Multiple concurrent high-severity events overwhelm analytical resources and response capacity. Indicators would include three or more simultaneous domain escalations within a single cycle window — watch for this configuration specifically.`;

  const s11 = [
    `CONTINUATION PATH: ${continuationPath}`,
    ``,
    `ESCALATION PATH: ${escalationPath}`,
    ``,
    `STABILIZATION PATH: ${stabilizationPath}`,
    ``,
    `FAILURE PATH: ${failurePath}`,
  ].join("\n");

  /* §12 Operator Takeaway */
  const s12 = (() => {
    if (matrix.overall === "CRITICAL") return `The environment is at CRITICAL. Compounding systemic risk across multiple domains warrants immediate executive-level attention and active contingency management. Passive monitoring is insufficient — this is an active management environment.`;
    if (matrix.overall === "HIGH") return `The environment is at HIGH. Multi-domain pressure is active and secondary transmission is plausible within the current cycle window. Elevate readiness posture, initiate contingency review, and do not wait for confirmation before repositioning.`;
    if (matrix.overall === "ELEVATED") return `The environment is ELEVATED. Pressure in ${activeClusters[0] || "at least one domain"} warrants increased monitoring cadence and scenario review. Direction of travel matters more than current position — anticipate, do not react.`;
    if (matrix.overall === "GUARDED") return `The environment is GUARDED. Background tension is present but within manageable range. Maintain monitoring continuity and signal discipline. Complacency during guarded periods is the primary analytical failure mode — this is when emergent threats develop their first legs.`;
    return `The environment is LOW. No acute threat cluster has formed. Maintain standard monitoring cadence. Quiet periods are the optimal window for signal infrastructure maintenance and scenario preparation.`;
  })();

  /* §13 Watchpoints */
  const watchItems = [
    matrix.conflict !== "LOW" && `• CONFLICT: Escalation velocity, geographic spread, partner nation force movements, and kinetic activity outside established patterns.`,
    matrix.markets !== "LOW" && `• MARKETS: Commodity price deviation >5% in 24h, credit spread widening, trade corridor disruption, or emergency central bank communication.`,
    matrix.infrastructure !== "LOW" && `• INFRASTRUCTURE: Critical system advisories from CISA/partner agencies, lateral spread confirmation, or attribution announcement for active incidents.`,
    matrix.information !== "LOW" && `• POLICY: Executive orders, legislative votes, diplomatic communiqués, or public statements confirming or reversing institutional signaling.`,
    `• POSTURE REVISION requires confirming signals from at least two independent domains. Single-source signals are insufficient for posture upgrade.`,
    `• NEXT CYCLE: Prioritize signals from ${workingSet[0]?.source || "primary sources"} and monitor ${activeClusters[0] || "all domains"} for trajectory confirmation.`,
  ].filter(Boolean).join("\n");

  /* §14 Appendix — Supporting Signals by Domain */
  const appendixSignals = workingSet.slice(primaryLimit);
  const appendixByDomain: Record<string, FeedEvent[]> = {};
  appendixSignals.forEach(e => {
    if (!appendixByDomain[e.domain]) appendixByDomain[e.domain] = [];
    appendixByDomain[e.domain].push(e);
  });
  const s14 = Object.entries(appendixByDomain).length > 0
    ? Object.entries(appendixByDomain).sort((a, b) => b[1].length - a[1].length).map(([domain, items]) => {
        const rows = items.map(e => {
          const tierLabel = e.sourceTier ? `T${e.sourceTier}` : "T?";
          const corrobLabel = e.corroborated ? " ◆" : "";
          return `  [${e.confidence}%][${tierLabel}${corrobLabel}] ${e.title}`;
        });
        return `${domain.toUpperCase()}\n${rows.join("\n")}`;
      }).join("\n\n")
    : "No additional signals beyond primary set.";

  /* ── QUICK BRIEF ── */
  if (depth === "quick") {
    const compact = workingSet.slice(0, 5).map((e, i) =>
      `${i + 1}. [${e.domain}] ${e.title}\n   Source: ${e.source} (Tier ${e.sourceTier ?? "?"})\n   Confidence: ${e.confidence}/100  |  Severity: ${"■".repeat(e.severity)}${"□".repeat(4 - e.severity)}  |  Pressure: ${assessPressureState(e)}`
    ).join("\n\n");

    return [
      header,
      `RSR AXION — ${briefTitle}`,
      ``,
      div, `§1  EXECUTIVE OVERVIEW`, div, s1,
      ``, div, `§2  THREAT POSTURE SUMMARY`, div, s2,
      ``, div, `§3  PRIORITY SIGNALS`, div, compact || "No primary signals identified.",
      ``, div, `§4  PATTERN ANALYSIS`, div,
      `Pattern Type: ${pattern.type}\n\n${pattern.explanation}`,
      ``, div, `§5  OPERATOR TAKEAWAY`, div, s12,
      ``, div, `§6  WATCHPOINTS`, div, watchItems,
      ``, `END OF QUICK BRIEF`,
    ].join("\n");
  }

  /* ── FULL / DAILY / WEEKLY BRIEF ── */
  const insufficientSignal = workingSet.length < 8
    ? `\nNote: Signal density was insufficient for full-length expansion without degrading analytic quality. Assessment reflects ${workingSet.length} available signals — additional ingestion recommended.`
    : "";

  const patternSection = [
    `Pattern Type: ${pattern.type}`,
    ``,
    pattern.explanation,
    ``,
    patterns.length > 0 ? patterns.map(p => `• ${p}`).join("\n") : `• No dominant cross-domain cluster pattern confirmed this cycle.`,
    ``,
    activeClusters.length >= 2
      ? `Active co-elevation across ${activeClusters.slice(0, 2).join(" and ")} — cross-cluster transmission is where consequential risk is most likely to develop.`
      : activeClusters.length === 1
      ? `Pressure concentrated in ${activeClusters[0]}. No cross-cluster coupling detected at this time.`
      : `Signals distributed across domains without dominant concentration. Breadth-over-focus conditions can mask cumulative pressure that does not yet appear systemic.`,
  ].join("\n");

  return [
    header,
    `RSR AXION — ${briefTitle}`,
    insufficientSignal,
    ``, div, `§1  EXECUTIVE OVERVIEW`, div, s1,
    ``, div, `§2  THREAT POSTURE SUMMARY`, div, s2,
    ``, div, `§3  DATA SUMMARY`, div, s3,
    ``, div, `§4  DOMAIN PRESSURE CHART`, div, s4,
    ``, div, `§5  PRIMARY SIGNALS`, div, s5,
    ``, div, `§6  SIGNAL MATRIX BY CONFIDENCE`, div, s6,
    ``, div, `§7  SYSTEM MECHANICS`, div, s7,
    ``, div, `§8  SYSTEM INTERSECTION`, div, s8,
    ``, div, `§9  PRESSURE MAP + VECTOR TABLE`, div, s9,
    ``, div, `§10 CONSTRAINTS`, div, s10,
    ``, div, `§11 FORWARD PROJECTION`, div, s11,
    ``, div, `§12 OPERATOR TAKEAWAY`, div, s12,
    ``, div, `§13 WATCHPOINTS`, div, watchItems,
    ``, div, `§14 APPENDIX — SUPPORTING SIGNALS BY DOMAIN`, div, s14,
    ``, `END OF ${briefTitle}`,
  ].join("\n");
}

/* ═══════════════════════════════════════════════════════════
   ARTICLE BUILDER
═══════════════════════════════════════════════════════════ */

export function buildArticle(
  events: FeedEvent[],
  matrix: ThreatMatrix,
  mode: string,
  now: Date = new Date()
): string {
  const { date } = getBrowserDateTimeParts(now);
  const conf = averageConfidence(events);
  const counts = clusterCounts(events);
  const cycleLabel = mode === "weekly" ? "WEEKLY INTELLIGENCE CYCLE" : "DAILY INTELLIGENCE CYCLE";
  const lead = events[0];
  const headline = lead?.title || "Intelligence Cycle Report";

  const activeDomains = [
    counts.conflict > 2 && "security",
    counts.markets > 2 && "market",
    counts.infrastructure > 1 && "infrastructure",
    counts.information > 2 && "policy",
  ].filter(Boolean) as string[];

  const tier2Plus = events.filter(e => (e.sourceTier ?? 4) <= 2);
  const sourceNote = tier2Plus.length > 0
    ? `${tier2Plus.length} of ${events.length} signals sourced from Tier 1 or Tier 2 outlets.`
    : `${events.length} signals processed. Additional Tier 1/2 sources would strengthen analytic confidence.`;

  const openPara = `${cycleLabel}: RSR AXION synthesized ${events.length} signals across ${activeDomains.length || "multiple"} domain clusters at ${conf}/100 average confidence. ${lead ? `The cycle is led by a ${lead.domain} signal: ${lead.title}.` : "No single dominant signal is leading the cycle."} ${sourceNote}`;

  const bgPara = (() => {
    if (matrix.conflict !== "LOW") return `The security domain enters this cycle with elevated cluster pressure. Conflict-adjacent signals are tracking force positioning, diplomatic communication, and economic measures that often precede or accompany kinetic events.`;
    if (matrix.markets !== "LOW") return `Market and energy signals are leading this cycle. Commodity pricing, trade corridor conditions, and credit availability are the primary channels through which current developments will transmit into operational impact.`;
    if (matrix.infrastructure !== "LOW") return `Technology and infrastructure signals are elevated. The current cycle reflects active adversarial probing and dependency exposure that represents a disproportionate risk relative to visible indicator volume.`;
    return `Background conditions are within manageable parameters. The cycle reflects a monitoring environment without acute cluster pressure — the primary task is to identify emergent signals before they develop cluster characteristics.`;
  })();

  const devPara = events.slice(0, 4).map((e, i) =>
    `${i + 1}. [${e.domain}] ${e.title} (${e.source}, Tier ${e.sourceTier ?? "?"}, ${e.confidence}/100)`
  ).join("\n");

  const mechPara = (() => {
    if (matrix.conflict !== "LOW" && matrix.markets !== "LOW") return "Security and economic signals are co-moving — a configuration that introduces a volatility multiplier. Energy and logistics corridors are the primary transmission channel between these domains. Disruption in one propagates into the other faster than single-domain models predict.";
    if (activeDomains[0]) return `The leading mechanism in this cycle operates through the ${activeDomains[0]} domain. Pressure originating here transmits into adjacent systems through dependency chains, pricing effects, and institutional responses — typically within 24 to 72 hours of the originating event.`;
    return "The current cycle shows distributed signal activity without dominant cross-domain transmission. Individual domain mechanisms are operating independently — assess each on its own terms before looking for compounding effects.";
  })();

  const implPara = (() => {
    if (matrix.overall === "CRITICAL") return "Cross-domain compounding is active. The implication set extends beyond any single domain — organizations should review contingency plans, validate supply chain resilience, and assess exposure to the specific geographies and sectors showing the highest signal concentration.";
    if (matrix.overall === "HIGH") return "Multi-domain pressure is active. Organizations with exposure to security-sensitive markets, energy corridors, or technology infrastructure should assess current exposure and available response options before conditions deteriorate further.";
    if (matrix.overall === "ELEVATED") return "Developing pressure in at least one domain creates real but manageable implication exposure. The strategic question is whether current positioning will hold if pressure continues to build over the next one to three cycles.";
    return "Implications remain within manageable bounds. The current environment rewards monitoring continuity over reactive adjustment — the value of this cycle is in the early warning posture, not the immediate implication profile.";
  })();

  const outlookPara = (() => {
    const next = matrix.overall === "CRITICAL" ? "confirm containment or identify compounding vectors"
      : matrix.overall === "HIGH" ? "track secondary transmission and prepare contingency triggers"
      : matrix.overall === "ELEVATED" ? "confirm or deny escalation trajectory within the next two to three cycles"
      : "maintain monitoring cadence and scenario readiness";
    return `The forward task is to ${next}. The next intelligence cycle should prioritize confirming signals from ${activeDomains[0] || "primary domains"} and any second independent source that validates or contradicts the current picture.`;
  })();

  const closePara = `RSR AXION — ${date} — ${cycleLabel}. Confidence: ${conf}/100. Posture: ${matrix.overall}. Signals processed: ${events.length}.`;

  return [
    `RSR AXION — INTELLIGENCE ANALYSIS`,
    `${headline}`,
    `${date} | ${cycleLabel} | Confidence: ${conf}/100`,
    ``,
    `I. OPENING ASSESSMENT`,
    openPara,
    ``,
    `II. BACKGROUND`,
    bgPara,
    ``,
    `III. CURRENT DEVELOPMENTS`,
    devPara,
    ``,
    `IV. MECHANISM`,
    mechPara,
    ``,
    `V. SYSTEM IMPLICATIONS`,
    implPara,
    ``,
    `VI. OUTLOOK`,
    outlookPara,
    ``,
    `VII. CLOSING`,
    closePara,
  ].join("\n");
}

/* ═══════════════════════════════════════════════════════════
   BULLETIN BUILDER
═══════════════════════════════════════════════════════════ */

export function buildBulletin(
  events: FeedEvent[],
  matrix: ThreatMatrix,
  patterns: string[],
  mode: string,
  now: Date = new Date()
): string {
  const { date, time } = getBrowserDateTimeParts(now);
  const conf = averageConfidence(events);
  const counts = clusterCounts(events);

  const postureLine = `POSTURE: ${matrix.overall} | CONFIDENCE: ${conf}/100 | SIGNALS: ${events.length} | DATE: ${date} ${time}`;

  const devLines = events.slice(0, 6).map((e, i) => {
    const tierLabel = e.sourceTier ? `T${e.sourceTier}` : "T?";
    const corrobLabel = e.corroborated ? " [CORROBORATED]" : "";
    return `${i + 1}. [${e.domain}] [${tierLabel}${corrobLabel}] ${e.title} — ${e.confidence}/100`;
  }).join("\n");

  const implLine = (() => {
    if (matrix.overall === "CRITICAL") return "Cross-domain compounding is active. Immediate management required.";
    if (matrix.overall === "HIGH") return "Multi-domain pressure is elevated. Contingency review recommended.";
    if (matrix.overall === "ELEVATED") return `Developing pressure in ${[counts.conflict > 2 && "security", counts.markets > 2 && "markets", counts.infrastructure > 1 && "infrastructure"].filter(Boolean).join(" and ") || "primary domains"}.`;
    return "Environment is within manageable parameters. Standard monitoring sufficient.";
  })();

  const watchLine = [
    matrix.conflict !== "LOW" && "• CONFLICT: Escalation indicators and force movements.",
    matrix.markets !== "LOW" && "• MARKETS: Commodity deviation and credit stress.",
    matrix.infrastructure !== "LOW" && "• INFRASTRUCTURE: CISA advisories and lateral spread.",
    matrix.information !== "LOW" && "• POLICY: Executive and legislative confirming actions.",
    `• NEXT: Two independent confirming signals required for posture upgrade.`,
  ].filter(Boolean).join("\n");

  const patternLine = patterns.length > 0 ? patterns.join("; ") : "No cross-domain patterns confirmed.";

  return [
    `RSR AXION — SITUATIONAL BULLETIN`,
    postureLine,
    ``,
    `§A  POSTURE`,
    postureLine,
    ``,
    `§B  KEY DEVELOPMENTS`,
    devLines || "No signals loaded.",
    ``,
    `§C  STRATEGIC IMPLICATION`,
    implLine,
    ``,
    `§D  PATTERN ANALYSIS`,
    patternLine,
    ``,
    `§E  WATCH INDICATORS`,
    watchLine,
    ``,
    `END BULLETIN`,
  ].join("\n");
}

/* ═══════════════════════════════════════════════════════════
   PRINT HTML BUILDER
═══════════════════════════════════════════════════════════ */

export function buildPrintHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const div = "━".repeat(85);

  const formatted = escaped
    .split("\n")
    .map(line => {
      if (line.startsWith("RSR AXION —") || line.startsWith("FROM THE OFFICE")) {
        return `<div class="doc-title">${line}</div>`;
      }
      if (/^§\d+/.test(line) || /^END OF/.test(line)) {
        return `<div class="section-head">${line}</div>`;
      }
      if (line === div || line.startsWith("━━━")) {
        return `<hr class="divider">`;
      }
      if (line.startsWith("──")) {
        return `<div class="sub-head">${line}</div>`;
      }
      if (line.startsWith("─────")) {
        return `<hr class="sub-divider">`;
      }
      if (line.trim() === "") {
        return `<div class="spacer"></div>`;
      }
      return `<div class="line">${line}</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RSR AXION Intelligence Brief</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; color: #111; font-family: 'IBM Plex Mono', monospace; font-size: 9.5pt; line-height: 1.55; }
  body { padding: 28mm 22mm 24mm 22mm; }
  .doc-title { font-family: 'Orbitron', sans-serif; font-size: 11pt; font-weight: 700; letter-spacing: .12em; margin-bottom: 4px; color: #0a0a0a; }
  .section-head { font-family: 'Orbitron', sans-serif; font-size: 9pt; font-weight: 700; letter-spacing: .10em; color: #1a1a2a; margin: 12px 0 4px; page-break-after: avoid; }
  .sub-head { font-weight: 600; color: #222; margin: 8px 0 2px; font-size: 8.5pt; }
  hr.divider { border: none; border-top: 1.5px solid #111; margin: 6px 0; }
  hr.sub-divider { border: none; border-top: 0.5px solid #888; margin: 4px 0; }
  .line { white-space: pre-wrap; word-break: break-word; }
  .spacer { height: 6px; }
  @media print {
    body { padding: 18mm 16mm 16mm 16mm; font-size: 8.5pt; }
    .section-head { page-break-before: auto; }
    a { text-decoration: none; color: inherit; }
  }
</style>
<script>window.addEventListener('load', () => { setTimeout(() => window.print(), 350); });<\/script>
</head>
<body>
${formatted}
</body>
</html>`;
}

/* ── Misc utilities ─────────────────────────────────────────────────────── */

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeLoad<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveToStorage(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota exceeded */ }
}
