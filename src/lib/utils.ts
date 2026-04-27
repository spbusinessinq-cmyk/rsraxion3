import type { FeedEvent, ThreatMatrix } from "./types";

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

const RELIABLE_SOURCES_RE = /reuters|bbc|associated.?press|financial.?times|washington.?post|nytimes|guardian|bloomberg|wsj|wall.?street|foreign.?affairs|foreignpolicy|defenseone|defensenews|war.?on.?the.?rocks|breaking.?defense|krebsonsecurity|bleeping|cisa|darkreading|securityweek|threatpost|oilprice|cnbc|the.?hill|politico|al.?jazeera|dw\.com|npr\.org|navalnews|thedrive|rand\.org|brookings|cfr\.org|theintercept|arstechnica|wired\.com|theregister|zdnet|techcrunch|technologyreview|ft\.com|eia\.gov|iswresearch|understandingwar/i;

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
   SIGNAL SCORING ENGINE
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

  // B. Confidence Score (0–100)
  const srcRel = RELIABLE_SOURCES_RE.test(event.source) ? 88 : 68;
  const titleClarity = event.title.length > 35 ? 12 : 6;
  const confidence = Math.min(97, Math.max(58, Math.round(
    srcRel * 0.35 + 22 + titleClarity + recencyWeight * 0.5
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

  // D. Priority Score (0–100) — used for sorting externally
  // Stored on event for downstream use
  void relevanceScore; // used in sorting in App.tsx via scoreSignal

  return { ...event, confidence, severity };
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
  const BAR = 18;
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return sorted.map(([domain, count]) => {
    const pct = count / total;
    const filled = Math.max(1, Math.round(pct * BAR * 3.5));
    const bars = "█".repeat(Math.min(BAR, filled)) + "░".repeat(Math.max(0, BAR - Math.min(BAR, filled)));
    const band = pct >= 0.22 ? "HIGH" : pct >= 0.13 ? "ELEVATED" : pct >= 0.06 ? "GUARDED" : "LOW";
    const label = domain.padEnd(28).slice(0, 28);
    return `${label}  ${bars}  ${band.padEnd(9)}  ${count} signals`;
  }).join("\n");
}

/* ═══════════════════════════════════════════════════════════
   SIGNAL BLOCK BUILDERS
═══════════════════════════════════════════════════════════ */

function buildContext(e: FeedEvent): string {
  if (e.summary && e.summary.length > 20) {
    return e.summary.replace(/\s+/g, " ").trim().slice(0, 190);
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
    if (MILITARY_RE.test(text)) return "Military capability deployment or posture adjustment affecting strategic balance.";
    return matrix.conflict !== "LOW"
      ? "Security-domain pressure propagating through deterrence signals, force posture, and partner nation responses."
      : "Routine security signaling — watch for escalation indicators.";
  }
  if (/Markets|Economy/.test(e.domain)) {
    if (ENERGY_RE.test(text)) return "Energy price or supply dynamics feeding into commodity markets and logistics chains.";
    return "Economic signal transmitting through credit, trade finance, or commodity pricing channels.";
  }
  if (/Technology|Cyber|Infrastructure/.test(e.domain)) {
    if (/ransomware|malware|exploit|breach/i.test(text)) return "Adversarial exploitation of a digital or physical vulnerability with potential cascade across connected systems.";
    return "Technology or infrastructure change propagating through dependency networks — consequence profiles are nonlinear.";
  }
  if (/Policy|Domestic|Governance/.test(e.domain)) {
    return POLICY_RE.test(text)
      ? "Regulatory or legislative action reshaping operating conditions for affected industries or geographies."
      : "Institutional signaling preceding potential executive, diplomatic, or legislative action.";
  }
  if (/Energy/.test(e.domain)) return "Energy supply, pricing, or infrastructure dynamics transmitting into industrial and economic activity.";
  return "Signal operating through a cross-domain transmission mechanism — monitor secondary domain effects.";
}

function buildWhyItMatters(e: FeedEvent, matrix: ThreatMatrix): string {
  if (/Security|Defense/.test(e.domain))
    return "Directly affects strategic stability, deterrence posture, and partner nation positioning. Security domain signals frequently precede broader geopolitical shifts with material economic and institutional consequences.";
  if (/Markets|Economy/.test(e.domain))
    return "Affects commodity pricing, credit conditions, and trade corridor resilience. Economic stress in this domain generates downstream pressure on logistics, finance, and policy across interconnected systems.";
  if (/Technology|Cyber|Infrastructure/.test(e.domain))
    return matrix.infrastructure !== "LOW"
      ? "Active pressure on technology or infrastructure systems that underpin economic activity, defense capability, and communications. Disruption in this domain amplifies nonlinearly."
      : "Technology or infrastructure exposure with latent systemic risk. Consequence profiles are disproportionate to volume of preceding indicators.";
  if (/Policy|Domestic|Governance/.test(e.domain))
    return "Shapes the regulatory, diplomatic, and institutional operating environment. Institutional shifts frequently precede material changes to legal, financial, or strategic conditions within one to three cycles.";
  if (/Energy/.test(e.domain))
    return "Energy market dynamics carry direct downstream effects across manufacturing, transportation, and economic output. Supply constraint or price volatility in this domain reaches all interconnected sectors.";
  if (/Cyber/.test(e.domain))
    return "Cyber-domain events carry disproportionate consequence relative to their signal volume. Attribution, lateral spread, and critical system adjacency are the primary risk determinants.";
  return "Cross-domain significance with secondary transmission potential into security, economic, and institutional systems.";
}

function buildSystemImpact(e: FeedEvent, matrix: ThreatMatrix): string {
  if (/Security|Defense/.test(e.domain))
    return matrix.markets !== "LOW"
      ? "Security, Markets (energy/logistics exposure), and partner nation positioning — coupling active."
      : "Security domain and adjacent diplomatic, institutional, and intelligence channels.";
  if (/Markets|Economy/.test(e.domain))
    return matrix.conflict !== "LOW"
      ? "Markets, Energy pricing, and conflict-adjacent supply chains — compounding active."
      : "Markets, Trade logistics, Financial system conditions, and sovereign debt exposure.";
  if (/Technology|Cyber|Infrastructure/.test(e.domain))
    return "Infrastructure, Technology dependencies, and all sectors reliant on affected systems. Cascade potential is the primary risk variable.";
  if (/Policy|Domestic|Governance/.test(e.domain))
    return "Regulatory environment, Institutional credibility, Diplomatic conditions, and market-sensitive policy channels.";
  if (/Energy/.test(e.domain))
    return "Energy production, Industrial supply chains, Transportation networks, and economic activity across all import-dependent sectors.";
  return "Cross-domain impact — monitor for secondary transmission into security, economic, and infrastructure systems.";
}

function buildForwardOutlook(e: FeedEvent, matrix: ThreatMatrix): string {
  if (/Security|Defense/.test(e.domain))
    return matrix.conflict !== "LOW"
      ? "Track escalation velocity, geographic spread, partner nation responses, and kinetic follow-on activity. Secondary transmission into energy and logistics is the leading risk."
      : "Monitor conflict-adjacent indicators for directional change. No confirmed escalation pathway at current posture.";
  if (/Markets|Economy/.test(e.domain))
    return matrix.markets !== "LOW"
      ? "Track commodity price trajectory, trade finance conditions, and logistics network stress. Secondary market contagion is the key indicator."
      : "Monitor credit and commodity conditions for asymmetric shock potential. Conditions are within manageable parameters.";
  if (/Technology|Cyber|Infrastructure/.test(e.domain))
    return matrix.infrastructure !== "LOW"
      ? "Track attribution, patch cycle response, critical advisories, and lateral spread. Infrastructure resilience metrics are the leading indicator of consequence severity."
      : "Monitor vulnerability advisories on standard cadence. No acute threat confirmed at current posture.";
  if (/Policy|Domestic|Governance/.test(e.domain))
    return matrix.information !== "LOW"
      ? "Track near-term regulatory, legislative, and executive action confirming or reversing current trajectory. Institutional signals of this type typically precede material action within one to three cycles."
      : "Monitor institutional stance for directional shifts. No confirmed action pathway at current posture.";
  return "Monitor for trajectory confirmation and cross-domain transmission in the next cycle window.";
}

function buildWatchpoint(e: FeedEvent, matrix: ThreatMatrix): string {
  if (/Security|Defense/.test(e.domain))
    return matrix.conflict !== "LOW"
      ? "Confirming kinetic action, force repositioning, or partner nation response outside normal posture."
      : "Any shift in deterrence posture, force deployment orders, or third-party involvement.";
  if (/Markets|Economy/.test(e.domain))
    return "Sustained commodity price deviation, credit market stress, or trade corridor disruption exceeding 72-hour threshold.";
  if (/Technology|Cyber|Infrastructure/.test(e.domain))
    return "Attribution announcement, additional victim confirmation, or advisory upgrade from CISA/partner agencies.";
  if (/Policy|Domestic|Governance/.test(e.domain))
    return "Executive order, legislative vote, diplomatic communiqué, or public statement confirming direction.";
  if (/Energy/.test(e.domain))
    return "OPEC production decision, pipeline or terminal disruption, or energy corridor security incident.";
  return "Any confirming signal from a second independent source within this or the next intelligence cycle.";
}

function buildSignalBlock(e: FeedEvent, matrix: ThreatMatrix, counts: ReturnType<typeof clusterCounts>): string {
  const state = assessPressureState(e);
  const vector = inferPressureVector(e);

  return [
    `SIGNAL:          ${e.domain.toUpperCase()}  |  CONFIDENCE: ${e.confidence}/100  |  SEVERITY: ${"■".repeat(e.severity)}${"□".repeat(4 - e.severity)}`,
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
    explanation: "Two active clusters are co-moving in an upward direction. The coupling between them is driving the overall posture higher. Escalation pattern requires active monitoring for cross-domain transmission and correlated risk scenarios.",
  };
  if (active >= 2 && matrix.overall === "ELEVATED") return {
    type: "CONVERGENCE",
    explanation: `Moderate convergence detected. Signals are clustering across ${[counts.conflict > 2 && "security", counts.markets > 2 && "markets", counts.infrastructure > 1 && "infrastructure", counts.information > 2 && "policy"].filter(Boolean).join(" and ")} but have not yet reached acute cross-domain coupling.`,
  };
  if (active === 0 && matrix.overall === "GUARDED") return {
    type: "STABILIZATION",
    explanation: "Signal distribution is broad without concentration. No dominant cluster has formed. The environment is holding within baseline parameters — a stabilization pattern that rewards monitoring continuity over reactive adjustment.",
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
    ? `The leading signal this cycle — ${topSignal.title} — reflects ${/Security|Defense/.test(topSignal.domain) ? "active pressure in the security domain" : /Markets|Economy/.test(topSignal.domain) ? "economic and market stress" : /Tech|Cyber|Infrastructure/.test(topSignal.domain) ? "technology and infrastructure exposure" : "institutional and policy movement"}.`
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
    ? ` Primary pressure is concentrated in ${activeDomains[0]}. No significant cross-domain coupling is detected at this time.`
    : ``;

  const tail = ` ${topContext} This cycle processed ${events.length} signals at ${conf}/100 average confidence.`;

  return `${posture}${coupling}${tail}`;
}

/* ═══════════════════════════════════════════════════════════
   ESCALATION MODEL
═══════════════════════════════════════════════════════════ */

export function buildEscalationModel(matrix: ThreatMatrix, confidence: number, signalCount: number = 10): string {
  const severe = [matrix.conflict, matrix.markets, matrix.infrastructure, matrix.information]
    .filter(x => x === "HIGH" || x === "CRITICAL").length;

  const caveat = signalCount < 6
    ? ` Note: Signal set is limited (${signalCount} items). Additional ingestion recommended before escalation decisions.`
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
   FULL BRIEF — 14-SECTION STRUCTURE
═══════════════════════════════════════════════════════════ */

export function buildFullBrief(
  sourceSet: FeedEvent[],
  matrix: ThreatMatrix,
  patterns: string[],
  mode: string,
  depth: "full" | "quick",
  now: Date = new Date()
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

  const header = [
    "FROM THE OFFICE OF EXECUTIVE INTELLIGENCE",
    "RSR AXION — INTELLIGENCE SYNTHESIS SYSTEM v3.0",
    `Location: ${location}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `INTELLIGENCE CYCLE: ${cycleLabel}`,
    `SIGNALS PROCESSED: ${workingSet.length}`,
    `CYCLE CONFIDENCE: ${conf}/100`,
    "",
  ].join("\n");

  const div = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

  /* ── Sections shared across modes ── */

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

  /* §3 Data Summary */
  const confirmed = workingSet.filter(e => e.confidence >= 88).length;
  const likely = workingSet.filter(e => e.confidence >= 78 && e.confidence < 88).length;
  const contested = workingSet.filter(e => e.confidence >= 68 && e.confidence < 78).length;
  const unknown = workingSet.filter(e => e.confidence < 68).length;
  const avgThreat = workingSet.length
    ? Math.round(workingSet.reduce((s, e) => s + (e.severity * 22.5), 0) / workingSet.length)
    : 0;
  const domainSet = [...new Set(workingSet.map(e => e.domain))].join(", ");
  const s3 = [
    `Signals Processed:    ${workingSet.length}`,
    `Signals Used:         ${Math.min(primaryLimit + 5, workingSet.length)}`,
    `Confirmed (≥88%):     ${confirmed}`,
    `Likely (78–87%):      ${likely}`,
    `Contested (68–77%):   ${contested}`,
    `Unknown (<68%):       ${unknown}`,
    `Domain Distribution:  ${domainSet || "N/A"}`,
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
  const matrixConfirmed = workingSet.filter(e => e.confidence >= 88).slice(0, 8);
  const matrixLikely = workingSet.filter(e => e.confidence >= 78 && e.confidence < 88).slice(0, 8);
  const matrixContested = workingSet.filter(e => e.confidence < 78).slice(0, 8);

  const renderMatrixGroup = (label: string, items: FeedEvent[]) => {
    if (!items.length) return `${label}\n  None at this confidence tier.`;
    const rows = items.map(e => `  [${e.domain}] ${e.title} — ${e.confidence}/100`);
    return `${label}\n${rows.join("\n")}`;
  };

  const s6 = [
    renderMatrixGroup("CONFIRMED (≥88%)", matrixConfirmed),
    "",
    renderMatrixGroup("LIKELY (78–87%)", matrixLikely),
    "",
    renderMatrixGroup("CONTESTED / UNKNOWN (<78%)", matrixContested),
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
    s7Lines.push(`CONFLICT MECHANICS: Security-domain signals are driving deterrence calculations and partner nation posturing. Escalation probability is non-trivial — force positioning and capability deployments are the key leading indicators.`);
  if (matrix.markets !== "LOW")
    s7Lines.push(`MARKET MECHANICS: Economic and energy signals are reshaping trade corridor conditions, commodity pricing, and credit availability. Downstream effects on manufacturing, logistics, and sovereign debt are the transmission channels.`);
  if (matrix.infrastructure !== "LOW")
    s7Lines.push(`INFRASTRUCTURE MECHANICS: Technology and infrastructure signals are active. Adversarial actors may be probing for vulnerability. Cascade failure potential is elevated when interdependent systems are under simultaneous pressure.`);
  if (matrix.information !== "LOW")
    s7Lines.push(`POLICY MECHANICS: Institutional signals indicate the regulatory and diplomatic environment is being actively reshaped. Organizations in policy-sensitive sectors should anticipate near-term changes to operating conditions.`);
  if (s7Lines.length === 0)
    s7Lines.push(`No primary system mechanics are elevated this cycle. Background processes are operating within normal range. Maintain standard monitoring for emergent triggers.`);
  const s7 = s7Lines.join("\n\n");

  /* §8 System Intersection */
  const s8Lines: string[] = [];
  if (matrix.conflict !== "LOW" && matrix.markets !== "LOW")
    s8Lines.push(`SECURITY × ECONOMIC COUPLING: When security and market signals co-move, the risk is not additive — it introduces a volatility multiplier that reduces the effectiveness of single-domain response strategies. Energy and logistics corridors are the primary transmission channels.`);
  if (matrix.markets !== "LOW" && matrix.infrastructure !== "LOW")
    s8Lines.push(`ECONOMIC × INFRASTRUCTURE COUPLING: Market and infrastructure signals are intersecting through logistics networks, energy systems, and technology dependency chains. Disruption originating in either domain propagates into the other with reduced friction.`);
  if (matrix.information !== "LOW" && matrix.conflict !== "LOW")
    s8Lines.push(`POLICY × SECURITY COUPLING: Diplomatic and institutional signals are reinforcing the security picture. Policy decisions in this configuration frequently precede kinetic or economic escalation within one to three cycles.`);
  if (matrix.infrastructure !== "LOW" && matrix.information !== "LOW")
    s8Lines.push(`TECHNOLOGY × POLICY COUPLING: AI, semiconductor, and cyber signals are generating regulatory pressure as governments respond to technology risk. This coupling compresses both the threat and the response within the same cycle window.`);
  if (s8Lines.length === 0)
    s8Lines.push(`No significant cross-domain coupling is confirmed this cycle. Signals are operating within their respective domain boundaries. Monitor for coupling triggers in the next cycle window.`);
  const s8 = s8Lines.join("\n\n");

  /* §9 Pressure Map */
  const building = workingSet.filter(e => assessPressureState(e) === "BUILDING").slice(0, 4);
  const transferring = workingSet.filter(e => assessPressureState(e) === "TRANSFERRING").slice(0, 4);
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
  ].join("\n");

  /* §10 Constraints */
  const s10Lines: string[] = [];
  if (matrix.conflict !== "LOW") s10Lines.push(`• Diplomatic constraints: Active back-channel negotiations or third-party mediation could slow escalation velocity if mutual incentives for de-escalation materialize.`);
  if (matrix.markets !== "LOW") s10Lines.push(`• Market constraints: Central bank intervention, emergency reserve releases, or coordinated sovereign action could stabilize commodity and credit conditions within 48–72 hours.`);
  if (matrix.infrastructure !== "LOW") s10Lines.push(`• Technical constraints: Patch cycles, system redundancy, and incident response protocols can limit the blast radius of infrastructure events — if activated before cascade.`);
  if (matrix.information !== "LOW") s10Lines.push(`• Institutional constraints: Legislative timelines, judicial review, and inter-agency coordination create natural lag before policy signals materialize into operational changes.`);
  if (s10Lines.length === 0) s10Lines.push(`• No significant constraints on current trajectories identified. Monitor for catalysts that could rapidly shift the operating picture.`);
  const s10 = s10Lines.join("\n");

  /* §11 Forward Projection */
  const continuationPath = `Direction of travel is ${matrix.overall.toLowerCase()}. If current signal volumes and domain pressures persist without escalation, the operating environment remains within manageable parameters over the next 24–72 hours.`;
  const escalationPath = matrix.overall === "HIGH" || matrix.overall === "CRITICAL"
    ? `A confirming signal in the ${activeClusters[0] || "primary domain"} — particularly one involving a second independent actor — would trigger a posture upgrade. This path compresses decision lead time significantly.`
    : `Escalation would require a high-severity confirming event in the leading domain plus evidence of cross-domain coupling. Probability: ${counts.conflict > 3 || counts.markets > 3 ? "MODERATE" : "LOW"} at current signal set.`;
  const stabilizationPath = `De-escalation requires confirming signals from at least two independent domains simultaneously — diplomatic resolution, market stabilization, or institutional accommodation. Probability: ${matrix.overall === "GUARDED" || matrix.overall === "LOW" ? "HIGH" : "MODERATE"}.`;
  const failurePath = `Failure scenario: Multiple concurrent high-severity events overwhelm analytical resources and response capacity. Indicators would include three or more simultaneous domain escalations within a single cycle window.`;

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
    if (matrix.overall === "HIGH") return `The environment is at HIGH. Multi-domain pressure is active and secondary transmission is plausible. Elevate readiness posture, initiate contingency review, and do not wait for confirmation before positioning.`;
    if (matrix.overall === "ELEVATED") return `The environment is ELEVATED. Pressure in ${activeClusters[0] || "at least one domain"} warrants increased monitoring cadence. Direction of travel matters more than current position. Anticipate rather than react.`;
    if (matrix.overall === "GUARDED") return `The environment is GUARDED. Background tension is present but within manageable range. Maintain monitoring continuity and signal discipline. Complacency during guarded periods is the primary analytical failure mode.`;
    return `The environment is LOW. No acute threat cluster has formed. Maintain standard monitoring. Quiet periods are the optimal window for signal infrastructure maintenance and scenario preparation.`;
  })();

  /* §13 Watchpoints */
  const watchItems = [
    matrix.conflict !== "LOW" && `• CONFLICT: Escalation velocity, geographic spread, partner nation force movements, and any kinetic activity outside established patterns.`,
    matrix.markets !== "LOW" && `• MARKETS: Commodity price deviation >5% in 24h, credit spread widening, trade corridor disruption, or emergency central bank communication.`,
    matrix.infrastructure !== "LOW" && `• INFRASTRUCTURE: Critical system advisories from CISA/partner agencies, lateral spread confirmation, or attribution announcement for active incidents.`,
    matrix.information !== "LOW" && `• POLICY: Executive orders, legislative votes, diplomatic communiqués, or public statements confirming or reversing institutional signaling.`,
    `• POSTURE REVISION requires confirming signals from at least two independent domains. Single-source signals are insufficient for posture upgrade.`,
    `• NEXT CYCLE: Prioritize signals from ${workingSet[0]?.source || "primary sources"} and monitor ${activeClusters[0] || "all domains"} for trajectory confirmation.`,
  ].filter(Boolean).join("\n");

  /* §14 Appendix */
  const appendixSignals = workingSet.slice(primaryLimit);
  const appendixByDomain: Record<string, FeedEvent[]> = {};
  appendixSignals.forEach(e => {
    if (!appendixByDomain[e.domain]) appendixByDomain[e.domain] = [];
    appendixByDomain[e.domain].push(e);
  });
  const s14 = Object.entries(appendixByDomain).length > 0
    ? Object.entries(appendixByDomain).map(([domain, items]) => {
        const rows = items.map(e => `  [${e.confidence}%] ${e.title}`);
        return `${domain.toUpperCase()}\n${rows.join("\n")}`;
      }).join("\n\n")
    : "No additional signals beyond primary set.";

  /* ── QUICK BRIEF ── */
  if (depth === "quick") {
    const compact = workingSet.slice(0, 5).map((e, i) =>
      `${i + 1}. [${e.domain}] ${e.title}\n   Confidence: ${e.confidence}/100  |  Severity: ${"■".repeat(e.severity)}${"□".repeat(4 - e.severity)}  |  Pressure: ${assessPressureState(e)}`
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
    ? `\nNote: Signal density was insufficient for full-length expansion without degrading analytic quality. Assessment reflects available signals only.`
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
      : `Signals distributed across domains without dominant concentration. Breadth-over-focus conditions can mask cumulative pressure.`,
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
    ``, div, `§9  PRESSURE MAP`, div, s9,
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

  const subhead = activeDomains.length >= 2
    ? `${activeDomains.slice(0, 2).map(d => d[0].toUpperCase() + d.slice(1)).join(" and ")} pressures intersect as the ${cycleLabel.toLowerCase()} reflects a ${matrix.overall.toLowerCase()} posture.`
    : `AXION assesses the ${date} intelligence cycle at ${matrix.overall} across ${events.length} processed signals.`;

  const opening = `The RSR AXION ${cycleLabel.toLowerCase()} for ${date} reflects an operating environment assessed at ${matrix.overall}. Processing ${events.length} signals at ${conf}/100 cycle confidence, the dominant signal character is ${matrix.conflict !== "LOW" ? "kinetic and defense-related" : matrix.markets !== "LOW" ? "economic and energy" : matrix.infrastructure !== "LOW" ? "infrastructure and technology" : "broadly distributed"}. ${counts.conflict > 2 && counts.markets > 2 ? "Security and market signals are co-moving — a configuration that reduces predictive certainty and increases correlated risk probability." : counts.conflict > 2 ? "Security and defense signals are the dominant cycle driver. Active tension in at least one conflict-adjacent theater carries potential for economic and logistics transmission." : counts.markets > 2 ? "Economic and energy signals are the leading cycle driver. Market dynamics are shaping the posture assessment more than any kinetic development." : "Signals are distributed across domains without a dominant cluster — characteristic of a transitional or accumulation phase."}`;

  const background = `RSR AXION synthesizes open-source intelligence from verified public sources spanning defense, economics, technology, international affairs, and policy. The system applies multi-factor domain classification, severity scoring, confidence weighting, and cross-cluster correlation to produce structured assessments calibrated for executive decision-support. The posture model operates across four primary domains — Conflict/Security, Markets/Energy, Infrastructure/Technology, and Policy/Information — and derives an overall assessment from their interaction. This output reflects the state of the environment at time of synthesis.`;

  const developments = events.slice(0, 8).map((e, i) => {
    const ctx = e.summary ? e.summary.slice(0, 160) : "No additional context available from source.";
    const why = buildWhyItMatters(e, matrix);
    return `${i + 1}. [${e.domain}]  Confidence: ${e.confidence}/100\n   Signal: ${e.title}\n   Context: ${ctx}\n   Significance: ${why.slice(0, 140)}`;
  }).join("\n\n") || "No primary developments identified in this cycle.";

  const mechanism = `The ${date} cycle is characterized by a ${matrix.overall.toLowerCase()} posture with ${activeDomains.length >= 2 ? `demonstrable coupling between the ${activeDomains.join(" and ")} domains` : activeDomains.length === 1 ? `primary pressure concentration in the ${activeDomains[0]} domain` : `signals distributed without dominant coupling`}. ${matrix.overall === "CRITICAL" ? "At CRITICAL posture, this is an active management environment. Signal convergence across multiple domains indicates structural stress — the coupling itself is a risk factor." : matrix.overall === "HIGH" ? "At HIGH posture, cross-domain pressure is generating secondary effects. A disruption in one domain transmits into adjacent systems with reduced friction." : matrix.overall === "ELEVATED" ? "At ELEVATED posture, the cycle is actively developing. Anticipatory positioning and disciplined monitoring can meaningfully reduce exposure to consequential surprise." : "The GUARDED posture reflects an environment where normal background tension is present without acute escalation. The primary risk is analytical drift during quiet periods."} Conflict: ${matrix.conflict}. Economic stress: ${matrix.markets}. Infrastructure: ${matrix.infrastructure}. Policy pressure: ${matrix.information}.`;

  const implications = matrix.conflict !== "LOW" && matrix.markets !== "LOW"
    ? `The intersection of security and economic pressure represents a high-consequence configuration. Conflict-driven market shocks, supply chain fragility under geopolitical stress, and energy corridor vulnerability are active risk pathways. The coupling is not additive — it introduces a volatility multiplier that reduces the effectiveness of single-domain response strategies.`
    : matrix.infrastructure !== "LOW"
    ? `Infrastructure and technology vulnerabilities carry a disproportionate consequence profile. Individual signals may appear bounded in scope, but cascading failures are possible from limited initial events. Proactive hardening assessments and resilience review are warranted in all technology-dependent environments.`
    : matrix.information !== "LOW"
    ? `Policy and institutional signals indicate the regulatory and diplomatic environment is actively being reshaped. Organizations in policy-sensitive sectors — energy, finance, defense, technology — should monitor for near-term executive or legislative action. Institutional signaling of this type frequently precedes formal action within one to three cycles.`
    : `The current cycle operates within normal parameters. No systemic amplification pathway is indicated. Standard protocols are appropriate. The primary risk at GUARDED is analytical drift — signal discipline erodes during quiet periods and can leave organizations unprepared for rapid environment shifts.`;

  const watchItems = [
    matrix.conflict !== "LOW" && "conflict-domain escalation velocity, geographic spread, and partner nation responses",
    matrix.markets !== "LOW" && "energy pricing trajectories, trade finance conditions, and logistics network stress",
    matrix.infrastructure !== "LOW" && "cyber threat attribution, critical system advisories, and infrastructure resilience metrics",
    matrix.information !== "LOW" && "legislative, executive, and diplomatic signaling for directional confirmation or reversal",
  ].filter(Boolean) as string[];

  const outlook = `AXION projects the short-term operating picture at ${matrix.overall}. ${watchItems.length > 0 ? `Next cycle monitoring priority: ${watchItems.join("; ")}. ` : ""}Posture revision requires confirming signals across at least two independent domains. Cycle confidence of ${conf}/100 supports this assessment as ${conf >= 82 ? "reliable and actionable" : conf >= 72 ? "directional but not definitive" : "indicative — additional signal ingestion is recommended"}.`;

  const closing = `AXION operates as a signal synthesis system, not a replacement for domain expertise. All assessments should be validated against specialized knowledge before informing consequential decisions. The intelligence cycle runs continuously — this output represents a moment-in-time synthesis. The operating environment can and will shift.`;

  const header = [
    "FROM THE OFFICE OF EXECUTIVE INTELLIGENCE",
    "RSR AXION — INTELLIGENCE SYNTHESIS SYSTEM v3.0",
    `Date: ${date}  |  Cycle: ${cycleLabel}  |  Confidence: ${conf}/100`,
    "",
  ].join("\n");

  return [
    header,
    `RSR AXION — ${cycleLabel} ARTICLE OUTPUT`,
    ``,
    `HEADLINE`, headline,
    ``, `SUBHEAD`, subhead,
    ``, `§1  OPENING`, opening,
    ``, `§2  BACKGROUND CONTEXT`, background,
    ``, `§3  CURRENT DEVELOPMENTS`, developments,
    ``, `§4  MECHANISM ANALYSIS`, mechanism,
    ``, `§5  SYSTEM-LEVEL IMPLICATIONS`, implications,
    ``, `§6  FORWARD OUTLOOK`, outlook,
    ``, `§7  CLOSING ASSESSMENT`, closing,
    ``, `END OF ARTICLE OUTPUT`,
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

  const keyDevelopments = events.slice(0, 7).map((e, i) => {
    const why = buildWhyItMatters(e, matrix).slice(0, 130);
    const state = assessPressureState(e);
    return `${i + 1}. [${e.domain}]  ${e.confidence}/100 confidence  |  Pressure: ${state}\n   ${e.title}\n   ${why}`;
  }).join("\n\n") || "No primary signals available this cycle.";

  const crossDomain = counts.conflict > 2 && counts.markets > 2
    ? `Security and market signals are co-active. This coupling increases systemic risk and reduces near-term predictability in both domains.`
    : counts.conflict > 2
    ? `Security cluster is the dominant driver. Monitor for economic and logistics transmission as the leading secondary risk.`
    : counts.markets > 2
    ? `Market and energy pressure leads the cycle. Watch for security-adjacent ripple effects in resource-competitive geographies.`
    : counts.infrastructure > 1
    ? `Infrastructure and technology signals carry the highest latent risk this cycle. Consequence profiles are nonlinear.`
    : `Broad signal distribution without convergence. No concentrated pattern pressure confirmed.`;

  const watchIndicators = [
    matrix.conflict !== "LOW" && `• Conflict/Security: Escalation velocity, geographic spread, partner nation responses`,
    matrix.markets !== "LOW" && `• Markets/Energy: Commodity pricing, trade logistics, financial system stress`,
    matrix.infrastructure !== "LOW" && `• Infrastructure/Cyber: Threat actor activity, critical advisories, resilience metrics`,
    matrix.information !== "LOW" && `• Policy/Diplomacy: Legislative, executive, or institutional action confirming current signaling`,
    `• Posture revision requires confirming signals from two or more independent domains`,
  ].filter(Boolean).join("\n");

  const patternText = patterns.length > 0
    ? patterns.map(p => `• ${p}`).join("\n")
    : `• No dominant cross-domain pattern confirmed this cycle.`;

  const div = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

  return [
    "FROM THE OFFICE OF EXECUTIVE INTELLIGENCE",
    "RSR AXION — INTELLIGENCE BULLETIN",
    `Date: ${date}  |  Time: ${time}  |  Cycle: ${mode.toUpperCase()}  |  Confidence: ${conf}/100`,
    ``,
    div, `THREAT POSTURE`, div,
    `Overall:         ${matrix.overall}`,
    `Conflict:        ${matrix.conflict}`,
    `Markets:         ${matrix.markets}`,
    `Infrastructure:  ${matrix.infrastructure}`,
    `Policy/Info:     ${matrix.information}`,
    `Confidence:      ${conf}/100`,
    `Signals:         ${events.length} processed`,
    ``,
    div, `KEY DEVELOPMENTS`, div,
    keyDevelopments,
    ``,
    div, `STRATEGIC IMPLICATION`, div,
    patternText,
    ``,
    crossDomain,
    ``,
    div, `WATCH INDICATORS`, div,
    watchIndicators,
    ``,
    `END OF BULLETIN`,
  ].join("\n");
}

/* ═══════════════════════════════════════════════════════════
   PRINT HTML — PROFESSIONAL DOCUMENT
═══════════════════════════════════════════════════════════ */

export function buildPrintHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Parse sections from § markers for print formatting
  const sections = escaped.split(/(?=§\d+\s)/g);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>RSR AXION — Intelligence Brief</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 11px; }
  body {
    background: #fff;
    color: #1a1f2e;
    font-family: 'IBM Plex Mono', 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.75;
    padding: 52px 64px;
    max-width: 900px;
    margin: 0 auto;
  }

  /* ── Header Block ── */
  .doc-header {
    border-bottom: 2px solid #1a1f2e;
    padding-bottom: 18px;
    margin-bottom: 22px;
  }
  .doc-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 0.15em;
    color: #1a1f2e;
    margin-bottom: 6px;
  }
  .doc-subtitle {
    font-family: 'Orbitron', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.28em;
    color: #666;
    text-transform: uppercase;
  }
  .doc-meta {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .doc-meta-item {
    border: 1px solid #ddd;
    padding: 7px 10px;
    font-size: 9.5px;
    letter-spacing: 0.08em;
  }
  .doc-meta-label {
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    font-size: 8px;
    letter-spacing: 0.16em;
  }
  .doc-meta-value {
    color: #1a1f2e;
    font-weight: 600;
    margin-top: 2px;
  }

  /* ── Threat Badge ── */
  .threat-badge {
    display: inline-block;
    padding: 5px 14px;
    border: 2px solid #1a1f2e;
    font-family: 'Orbitron', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
    margin-top: 10px;
  }
  .threat-CRITICAL { border-color: #dc2626; color: #dc2626; }
  .threat-HIGH     { border-color: #d97706; color: #d97706; }
  .threat-ELEVATED { border-color: #0369a1; color: #0369a1; }
  .threat-GUARDED  { border-color: #0369a1; color: #0369a1; }
  .threat-LOW      { border-color: #16a34a; color: #16a34a; }

  /* ── Section ── */
  .section {
    margin-top: 24px;
    page-break-inside: avoid;
  }
  .section-header {
    font-family: 'Orbitron', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #888;
    border-bottom: 1px solid #ddd;
    padding-bottom: 5px;
    margin-bottom: 12px;
  }
  .section-body {
    font-size: 10.5px;
    line-height: 1.8;
    color: #2a2f3e;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ── Data Box ── */
  .data-box {
    border: 1px solid #ddd;
    padding: 12px 16px;
    margin-top: 10px;
    background: #f9fafb;
    font-size: 10px;
    white-space: pre;
    font-family: 'IBM Plex Mono', monospace;
  }

  /* ── Signal Block ── */
  .signal-block {
    border-left: 3px solid #1a1f2e;
    padding: 10px 14px;
    margin-bottom: 14px;
    page-break-inside: avoid;
    background: #fafafa;
  }
  .signal-block .field-label {
    font-size: 8.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: #888;
    text-transform: uppercase;
    display: inline-block;
    width: 110px;
    flex-shrink: 0;
  }

  /* ── Footer ── */
  .doc-footer {
    margin-top: 40px;
    border-top: 1px solid #ddd;
    padding-top: 10px;
    font-size: 8px;
    color: #aaa;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  /* ── Print ── */
  @media print {
    body { padding: 30px 42px; }
    .section { page-break-inside: avoid; }
    .signal-block { page-break-inside: avoid; }
    @page { margin: 1.5cm 2cm; }
  }
</style>
</head>
<body>
  <div class="doc-header">
    <div class="doc-title">RSR AXION</div>
    <div class="doc-subtitle">Intelligence Synthesis System v3.0 — Office of Executive Intelligence</div>
    <div class="doc-meta">
      ${extractMetaBlock(text)}
    </div>
  </div>

  <div id="content">
    <pre class="section-body">${escaped}</pre>
  </div>

  <div class="doc-footer">
    UNCLASSIFIED · RSR AXION INTELLIGENCE SYNTHESIS SYSTEM · FOR AUTHORIZED USE
  </div>

  <script>
    // Auto-print
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 300);
    });
  </script>
</body>
</html>`;
}

function extractMetaBlock(text: string): string {
  const dateMatch = text.match(/Date:\s*(.+)/);
  const timeMatch = text.match(/Time:\s*(.+)/);
  const cycleMatch = text.match(/INTELLIGENCE CYCLE:\s*(.+)/);
  const confMatch = text.match(/CYCLE CONFIDENCE:\s*(.+)/);
  const sigMatch = text.match(/SIGNALS PROCESSED:\s*(.+)/);

  const items = [
    { label: "Date", value: dateMatch?.[1]?.trim() || "—" },
    { label: "Time", value: timeMatch?.[1]?.trim() || "—" },
    { label: "Cycle", value: cycleMatch?.[1]?.trim() || "—" },
    { label: "Confidence", value: confMatch?.[1]?.trim() || "—" },
    { label: "Signals", value: sigMatch?.[1]?.trim() || "—" },
    { label: "Classification", value: "UNCLASSIFIED" },
  ];

  return items.map(i => `
    <div class="doc-meta-item">
      <div class="doc-meta-label">${i.label}</div>
      <div class="doc-meta-value">${i.value}</div>
    </div>`).join("");
}

/* ═══════════════════════════════════════════════════════════
   STORAGE HELPERS
═══════════════════════════════════════════════════════════ */

export function safeLoad<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage quota exceeded */ }
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildRealtimeHeader(
  intelligenceCycleLine: string = "INTELLIGENCE CYCLE: DAILY",
  now: Date = new Date()
): string {
  const { date, time } = getBrowserDateTimeParts(now);
  return [
    "FROM THE OFFICE OF EXECUTIVE INTELLIGENCE",
    "RSR AXION — INTELLIGENCE SYNTHESIS SYSTEM v3.0",
    `Location: ${getLocation()}`,
    `Date: ${date}`,
    `Time: ${time}`,
    intelligenceCycleLine,
    "",
  ].join("\n");
}
