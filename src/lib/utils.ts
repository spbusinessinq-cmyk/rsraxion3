import type { FeedEvent, ThreatMatrix } from "./types";

function getBrowserDateTimeParts(now: Date) {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tz = localTz || "America/Los_Angeles";
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find(p => p.type === type)?.value || "";
  const date = `${pick("month")} ${pick("day")}, ${pick("year")}`;
  const time = `${pick("hour")}:${pick("minute")}`;
  return { date, time };
}

function getLocation(): string {
  return "Los Angeles, California";
}

export function buildRealtimeHeader(
  intelligenceCycleLine: string = "INTELLIGENCE CYCLE: DAILY",
  now: Date = new Date()
): string {
  const { date, time } = getBrowserDateTimeParts(now);
  return [
    "FROM THE OFFICE OF EXECUTIVE INTELLIGENCE",
    "RSR AXION – INTELLIGENCE SYNTHESIS SYSTEM",
    `Location: ${getLocation()}`,
    `Date: ${date}`,
    `Time: ${time}`,
    intelligenceCycleLine,
    "",
  ].join("\n");
}

export function withRealtimeHeader(
  body: string,
  intelligenceCycleLine: string = "INTELLIGENCE CYCLE: DAILY",
  now: Date = new Date()
): string {
  const trimmed = (body || "").replace(/^\s+/, "");
  const header = buildRealtimeHeader(intelligenceCycleLine, now);
  if (trimmed.startsWith("FROM THE OFFICE OF EXECUTIVE INTELLIGENCE")) return body;
  return `${header}${trimmed}`;
}

export function scoreBand(value: number): string {
  if (value >= 8) return "CRITICAL";
  if (value >= 6) return "HIGH";
  if (value >= 3) return "ELEVATED";
  return "LOW";
}

export function averageConfidence(events: FeedEvent[]): number {
  if (!events.length) return 0;
  return Math.round(events.reduce((s, e) => s + e.confidence, 0) / events.length);
}

export function formatThreatOrder(threat: string): number {
  const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, ELEVATED: 2, LOW: 1 };
  return rank[threat] || 0;
}

export function clusterCounts(events: FeedEvent[]) {
  return {
    conflict: events.filter(e =>
      /missile|drone|military|war|strike|defense|navy|air force|ukraine|iran|israel|gaza/i.test(`${e.title} ${e.summary}`)
    ).length,
    markets: events.filter(e =>
      /oil|shipping|logistics|tariff|dollar|treasury|inflation|equity|market|energy|trade/i.test(`${e.title} ${e.summary}`)
    ).length,
    infrastructure: events.filter(e =>
      /cyber|infrastructure|compute|ai|semiconductor|data|cloud|network|grid/i.test(`${e.title} ${e.summary}`)
    ).length,
    information: events.filter(e =>
      /policy|executive|congress|agency|sanction|diplomacy|summit|foreign ministry|white house|senate/i.test(`${e.title} ${e.summary}`)
    ).length,
  };
}

/* ── Internal Helpers ───────────────────────────────────────────────────── */

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

  const postureLine: Record<string, string> = {
    CRITICAL: `AXION assesses the operating environment at CRITICAL. Multiple high-severity signals across intersecting domains indicate compounding systemic risk. The convergence is structural, not coincidental — it requires active management, not routine monitoring.`,
    HIGH: `AXION assesses the operating environment at HIGH. Elevated pressure is active across two or more primary domains, generating secondary effects that reduce predictability and increase correlated risk. Decision-makers should adopt an elevated readiness posture.`,
    ELEVATED: `AXION assesses the operating environment at ELEVATED. Developing pressure in ${activeDomains[0] || "one or more primary domains"} is reshaping the intelligence picture. The cycle is fluid and direction of travel warrants accelerated monitoring.`,
    GUARDED: `AXION assesses the operating environment at GUARDED. No acute escalation pathway is indicated. Background tension is present but within normal range for a globally connected signal environment.`,
  };

  const posture = postureLine[matrix.overall] || postureLine.GUARDED;

  const coupling = activeDomains.length >= 2
    ? ` Cross-domain coupling is active between ${activeDomains.slice(0, 2).join(" and ")}, a configuration that compresses response lead time and increases systemic stress probability.`
    : activeDomains.length === 1
    ? ` Primary pressure is concentrated in ${activeDomains[0]}; no significant cross-domain coupling is detected at this time.`
    : ``;

  const tail = ` This cycle processed ${events.length} signals at ${conf}/100 average confidence.`;

  return `${posture}${coupling}${tail}`;
}

type PatternType = "CONVERGENCE" | "ESCALATION" | "FRAGMENTATION" | "STABILIZATION";

function identifyPatternType(
  matrix: ThreatMatrix,
  counts: ReturnType<typeof clusterCounts>
): { type: PatternType; explanation: string } {
  const active = [
    counts.conflict > 2,
    counts.markets > 2,
    counts.infrastructure > 1,
    counts.information > 2,
  ].filter(Boolean).length;

  if (active >= 3) {
    return {
      type: "CONVERGENCE",
      explanation: "Three or more domain clusters are simultaneously elevated. Signals are converging across security, economic, and institutional lines — a high-stress configuration that limits single-domain response effectiveness.",
    };
  }
  if (active === 2 && (matrix.overall === "HIGH" || matrix.overall === "CRITICAL")) {
    return {
      type: "ESCALATION",
      explanation: "Two active clusters are co-moving in an upward direction. The coupling between them is driving the overall posture higher. Escalation pattern requires monitoring for cross-domain transmission.",
    };
  }
  if (active >= 2 && matrix.overall === "ELEVATED") {
    return {
      type: "CONVERGENCE",
      explanation: `Moderate convergence detected across ${[counts.conflict > 2 && "security", counts.markets > 2 && "markets", counts.infrastructure > 1 && "infrastructure", counts.information > 2 && "policy"].filter(Boolean).join(" and ")}. Signals are clustering but have not yet reached acute cross-domain coupling.`,
    };
  }
  if (active === 0 && matrix.overall === "GUARDED") {
    return {
      type: "STABILIZATION",
      explanation: "Signal distribution is broad without concentration. No dominant cluster has formed. The environment is holding within baseline parameters — a stabilization pattern that rewards monitoring continuity over reactive adjustment.",
    };
  }
  return {
    type: "FRAGMENTATION",
    explanation: "Signals are active across multiple domains but without convergence. The current pattern is fragmented — developments are occurring independently rather than coupling. This can obscure cumulative pressure that does not yet appear systemic.",
  };
}

function buildSignalBlock(e: FeedEvent, matrix: ThreatMatrix): string {
  const whatHappened = e.summary
    ? e.summary.replace(/\s+/g, " ").trim().slice(0, 180)
    : e.title;

  const whyItMatters = ((): string => {
    if (/Security|Defense/.test(e.domain))
      return "Directly affects strategic stability and partner posturing. Movement in this domain frequently precedes broader geopolitical shifts.";
    if (/Markets/.test(e.domain))
      return "Affects commodity pricing, supply chain resilience, and trade corridor stability with downstream effects across logistics and finance.";
    if (/Technology|Infrastructure/.test(e.domain))
      return "Exposes systems that underpin economic activity, communications, and defense capability. Disruption in this domain amplifies nonlinearly across other clusters.";
    if (/Policy|Domestic/.test(e.domain))
      return "Shapes the regulatory and diplomatic operating environment. Institutional shifts frequently precede material changes to legal, financial, or strategic conditions.";
    return "Movement in the global operating environment with cross-domain secondary effect potential.";
  })();

  const domains = ((): string => {
    if (/Security|Defense/.test(e.domain))
      return matrix.markets !== "LOW"
        ? "Security, Markets (energy/logistics exposure), and partner nation positioning."
        : "Security domain and adjacent diplomatic/institutional channels.";
    if (/Markets/.test(e.domain))
      return matrix.conflict !== "LOW"
        ? "Markets, Energy pricing, and conflict-adjacent supply chains."
        : "Markets, Trade logistics, and financial system conditions.";
    if (/Technology|Infrastructure/.test(e.domain))
      return "Infrastructure, Technology dependencies, and any sectors reliant on the affected systems.";
    if (/Policy|Domestic/.test(e.domain))
      return "Policy/Regulatory environment, Institutional credibility, and Diplomatic conditions.";
    return "Cross-domain — monitor for secondary transmission.";
  })();

  const outlook = ((): string => {
    if (/Security|Defense/.test(e.domain))
      return matrix.conflict !== "LOW"
        ? "Track: escalation velocity, geographic spread, partner nation responses, and any kinetic follow-on activity."
        : "Monitor: conflict-adjacent indicators for directional change. No immediate escalation pathway confirmed.";
    if (/Markets/.test(e.domain))
      return matrix.markets !== "LOW"
        ? "Track: contagion to energy pricing, trade finance, and logistics networks. Secondary market response is the key indicator."
        : "Monitor: commodity and credit conditions for asymmetric shock potential.";
    if (/Technology|Infrastructure/.test(e.domain))
      return matrix.infrastructure !== "LOW"
        ? "Track: attribution developments, patch cycle responses, and critical advisories. Lateral spread is the primary risk vector."
        : "Monitor: vulnerability advisories on standard cadence. No acute infrastructure threat confirmed.";
    if (/Policy|Domestic/.test(e.domain))
      return matrix.information !== "LOW"
        ? "Track: near-term regulatory, legislative, or executive action confirming or reversing the current trajectory."
        : "Monitor: institutional stance for directional shifts that could precede operational environment changes.";
    return "Monitor for trajectory change and cross-domain transmission in the next cycle.";
  })();

  return [
    `SIGNAL — ${e.domain.toUpperCase()} — CONFIDENCE ${e.confidence}/100`,
    ``,
    `What happened:  ${whatHappened}`,
    `Why it matters: ${whyItMatters}`,
    `System impact:  ${domains}`,
    `Forward outlook: ${outlook}`,
  ].join("\n");
}

export function buildEscalationModel(matrix: ThreatMatrix, confidence: number, signalCount: number = 10): string {
  const severe = [matrix.conflict, matrix.markets, matrix.infrastructure, matrix.information].filter(
    x => x === "HIGH" || x === "CRITICAL"
  ).length;

  const caveat = signalCount < 6
    ? ` Note: Signal set is limited (${signalCount} items). Additional ingestion recommended before escalation decisions.`
    : confidence < 76
    ? ` Note: Cycle confidence is below threshold (${confidence}/100). Treat as directional, not definitive.`
    : "";

  if (matrix.overall === "CRITICAL" || severe >= 3)
    return `Cross-domain stress confirmed. Compounding risk vectors are active with high probability of systemic coupling. Confidence: ${confidence}/100. Immediate executive notification warranted.${caveat}`;
  if (matrix.overall === "HIGH" || severe >= 2)
    return `Elevated pressure active across two or more domains. Secondary transmission is plausible within this cycle window. Confidence: ${confidence}/100. Sustained elevated watch posture recommended.${caveat}`;
  if (matrix.overall === "ELEVATED")
    return `Developing pressure in at least one domain. Cycle is fluid. Confidence: ${confidence}/100. Elevated reporting frequency appropriate.${caveat}`;
  return `Guarded posture holds. No immediate cross-domain escalation pathway indicated. Confidence: ${confidence}/100. Routine monitoring is sufficient.${caveat}`;
}

/* ── Article ────────────────────────────────────────────────────────────── */

export function buildArticle(
  events: FeedEvent[],
  matrix: ThreatMatrix,
  mode: string,
  now: Date = new Date()
): string {
  const { date } = getBrowserDateTimeParts(now);
  const lead = events[0];
  const headline = lead?.title || "Intelligence Cycle Report";
  const conf = averageConfidence(events);
  const counts = clusterCounts(events);
  const cycleLabel = mode === "weekly" ? "Weekly Intelligence Cycle" : "Daily Intelligence Cycle";
  const domains = [...new Set(events.slice(0, 10).map(e => e.domain))].join(", ");
  const header = buildRealtimeHeader(`INTELLIGENCE CYCLE: ${mode.toUpperCase()}`, now);

  const activeDomains = [
    counts.conflict > 2 && "security",
    counts.markets > 2 && "market",
    counts.infrastructure > 1 && "infrastructure",
    counts.information > 2 && "policy",
  ].filter(Boolean) as string[];

  const subhead = activeDomains.length >= 2
    ? `${activeDomains.slice(0, 2).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(" and ")} pressures intersect as the ${cycleLabel.toLowerCase()} reflects a ${matrix.overall.toLowerCase()} posture across ${events.length} processed signals.`
    : `AXION assesses the ${date} intelligence cycle at ${matrix.overall} with primary signal activity across ${domains}.`;

  const openingCharacter = matrix.conflict !== "LOW"
    ? "kinetic and defense-related"
    : matrix.markets !== "LOW"
    ? "economic and energy"
    : matrix.infrastructure !== "LOW"
    ? "infrastructure and technology"
    : "broadly distributed";

  const openingCoupling = counts.conflict > 2 && counts.markets > 2
    ? `Security and market signals are co-moving — a configuration that reduces predictive certainty and increases the probability of correlated risk materializing across domains simultaneously.`
    : counts.conflict > 2
    ? `Security and defense signals are the dominant driver. Active tension in at least one conflict-adjacent theater carries potential for economic and logistics transmission.`
    : counts.markets > 2
    ? `Economic and energy signals are the leading cycle driver. Market dynamics and resource allocation pressures are shaping the posture assessment more than any kinetic development.`
    : `Signals are distributed across domains without a dominant cluster — a breadth-over-focus pattern characteristic of a transitional or accumulation phase.`;

  const opening = `The RSR AXION ${cycleLabel.toLowerCase()} for ${date} reflects an operating environment assessed at ${matrix.overall}. Across ${events.length} processed signals at ${conf}/100 cycle confidence, the dominant signal character is ${openingCharacter}. ${openingCoupling}`;

  const background = `RSR AXION synthesizes open-source intelligence from verified public sources spanning defense, economics, technology, international affairs, and policy. The system applies domain classification, severity scoring, confidence weighting, and cross-cluster correlation to produce structured assessments calibrated for executive decision-support. The posture model operates across four primary domains — Conflict/Security, Markets/Energy, Infrastructure/Technology, and Policy/Information — and derives an overall assessment from their interaction. This output reflects the state of the environment at time of synthesis and is intended to inform, not replace, expert judgment.`;

  const developments = events.slice(0, 6).map((e, i) => {
    const ctx = e.summary ? e.summary.slice(0, 180) : "No additional context available from source.";
    return `${i + 1}. [${e.domain}] — Confidence: ${e.confidence}/100\n   Signal: ${e.title}\n   Context: ${ctx}`;
  }).join("\n\n") || "No primary developments identified in this cycle.";

  const strategicCharacter = matrix.overall === "CRITICAL"
    ? `At CRITICAL posture, this is an active management environment. Signal convergence across multiple domains indicates structural stress. Decision-makers cannot treat these as independent events — the coupling itself is a risk factor.`
    : matrix.overall === "HIGH"
    ? `At HIGH posture, cross-domain pressure is generating secondary effects. A disruption originating in one domain will transmit into adjacent systems with reduced friction. Active scenario planning is required — passive observation is insufficient.`
    : matrix.overall === "ELEVATED"
    ? `At ELEVATED posture, the cycle is actively developing. Disciplined monitoring, anticipatory positioning, and stakeholder communication can meaningfully reduce exposure to consequential surprise. Direction of travel matters more than current position.`
    : `The GUARDED posture reflects an environment where normal background tension is present without acute escalation. The primary risk at this posture level is analytical drift — the gradual erosion of signal discipline during quiet periods.`;

  const strategicAnalysis = `The ${date} cycle is characterized by a ${matrix.overall.toLowerCase()} posture with ${activeDomains.length >= 2 ? `demonstrable coupling between the ${activeDomains.join(" and ")} domains` : activeDomains.length === 1 ? `primary pressure concentration in the ${activeDomains[0]} domain` : `signals distributed across domains without dominant coupling`}. ${strategicCharacter} Conflict: ${matrix.conflict}. Economic stress: ${matrix.markets}. Infrastructure: ${matrix.infrastructure}. Policy/Information: ${matrix.information}.`;

  const systemImplications = matrix.conflict !== "LOW" && matrix.markets !== "LOW"
    ? `The intersection of security and economic pressure represents the highest-consequence configuration in the AXION model. Conflict-driven market shocks, supply chain fragility under geopolitical stress, and energy corridor vulnerability are all active risk pathways. The coupling is not additive — it introduces a volatility multiplier that reduces the effectiveness of single-domain response strategies.`
    : matrix.infrastructure !== "LOW"
    ? `Infrastructure and technology vulnerabilities carry a disproportionate consequence profile. While individual signals may appear bounded in scope, cascading failures are possible from limited initial events. Proactive hardening assessments and resilience review are warranted in technology-dependent environments.`
    : matrix.information !== "LOW"
    ? `Policy and institutional signals indicate the regulatory and diplomatic environment is actively being reshaped. Organizations in policy-sensitive sectors — energy, finance, defense, technology — should monitor for near-term executive or legislative action. Institutional signaling of this type frequently precedes formal action within one to three cycles.`
    : `The current cycle operates within normal parameters. No systemic amplification pathway is indicated. Standard protocols are appropriate. The primary risk at GUARDED is analytical drift — signal discipline erodes during quiet periods.`;

  const watchItems = [
    matrix.conflict !== "LOW" && "conflict-domain escalation velocity, geographic spread, and partner nation responses",
    matrix.markets !== "LOW" && "energy pricing trajectories, trade finance conditions, and supply chain stress signals",
    matrix.infrastructure !== "LOW" && "cyber threat attribution, critical system advisories, and infrastructure resilience metrics",
    matrix.information !== "LOW" && "legislative, executive, and diplomatic signaling for directional confirmation or reversal",
  ].filter(Boolean) as string[];

  const outlook = `AXION projects the short-term operating picture at ${matrix.overall}. ${watchItems.length > 0 ? `Next cycle priority monitoring: ${watchItems.join("; ")}. ` : ""}Posture revision requires confirming signals across at least two independent domains. Cycle confidence of ${conf}/100 supports this assessment as ${conf >= 80 ? "reliable and actionable" : conf >= 70 ? "directional but not definitive" : "indicative — additional signal ingestion is recommended"}.`;

  return [
    header,
    `RSR AXION – ${cycleLabel.toUpperCase()} ARTICLE OUTPUT`,
    ``,
    `HEADLINE`,
    headline,
    ``,
    `SUBHEAD`,
    subhead,
    ``,
    `OPENING PARAGRAPH`,
    opening,
    ``,
    `BACKGROUND CONTEXT`,
    background,
    ``,
    `CURRENT DEVELOPMENTS`,
    developments,
    ``,
    `STRATEGIC ANALYSIS`,
    strategicAnalysis,
    ``,
    `SYSTEM-LEVEL IMPLICATIONS`,
    systemImplications,
    ``,
    `FORWARD OUTLOOK`,
    outlook,
    ``,
    `END OF ARTICLE OUTPUT`,
  ].join("\n");
}

/* ── Bulletin ───────────────────────────────────────────────────────────── */

export function buildBulletin(
  events: FeedEvent[],
  matrix: ThreatMatrix,
  patterns: string[],
  mode: string,
  now: Date = new Date()
): string {
  const conf = averageConfidence(events);
  const counts = clusterCounts(events);
  const header = buildRealtimeHeader(`INTELLIGENCE CYCLE: ${mode.toUpperCase()}`, now);

  const keyDevelopments = events.slice(0, 6).map((e, i) => {
    const whyItMatters = ((): string => {
      if (/Security|Defense/.test(e.domain)) return "Defense/security movement with implications for strategic stability and partner posturing.";
      if (/Markets/.test(e.domain)) return "Economic signal with downstream implications for commodity pricing, trade flows, and market conditions.";
      if (/Technology|Infrastructure/.test(e.domain)) return "Infrastructure or technology exposure with systemic risk potential across connected domains.";
      if (/Policy|Domestic/.test(e.domain)) return "Policy signal with near-term regulatory or diplomatic significance.";
      return "Cross-domain intelligence signal — monitor for secondary transmission effects.";
    })();
    return `${i + 1}. [${e.domain}] ${e.title}\n   Why It Matters: ${whyItMatters}`;
  }).join("\n\n") || "No primary signals available this cycle.";

  const patternText = patterns.length > 0
    ? patterns.map(p => `• ${p}`).join("\n")
    : `• No dominant cross-domain pattern is confirmed in this cycle.`;

  const crossDomainAssessment = counts.conflict > 2 && counts.markets > 2
    ? `Security and market signals are co-active. This coupling increases systemic risk and reduces the predictability of near-term developments in both domains.`
    : counts.conflict > 2
    ? `Security cluster is the dominant driver. Monitor for economic and logistics transmission effects as the leading secondary risk.`
    : counts.markets > 2
    ? `Market and energy pressure is the leading signal type. Watch for security-adjacent ripple effects, particularly in resource-competitive geographies.`
    : counts.infrastructure > 1
    ? `Infrastructure and technology signals carry the highest latent risk this cycle. Consequence profiles are nonlinear — low signal volume does not imply low impact potential.`
    : `Signal distribution is broad without convergence. No concentrated pattern pressure is confirmed.`;

  const watchIndicators = [
    matrix.conflict !== "LOW" && `• Conflict/Security: Track escalation velocity, geographic spread, and partner nation responses`,
    matrix.markets !== "LOW" && `• Markets/Energy: Monitor commodity pricing, trade logistics, and financial system stress indicators`,
    matrix.infrastructure !== "LOW" && `• Infrastructure/Cyber: Track threat actor activity, critical advisories, and system resilience signals`,
    matrix.information !== "LOW" && `• Policy/Diplomacy: Watch for legislative, executive, or institutional action confirming current signaling`,
    `• Posture revision requires confirming signals across two or more independent domains`,
  ].filter(Boolean).join("\n");

  return [
    header,
    `RSR AXION – INTELLIGENCE BULLETIN`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `THREAT POSTURE`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Overall:         ${matrix.overall}`,
    `Conflict:        ${matrix.conflict}`,
    `Markets:         ${matrix.markets}`,
    `Infrastructure:  ${matrix.infrastructure}`,
    `Policy/Info:     ${matrix.information}`,
    `Confidence:      ${conf}/100`,
    `Signals:         ${events.length} processed`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `KEY DEVELOPMENTS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    keyDevelopments,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `STRATEGIC IMPLICATION`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    patternText,
    ``,
    crossDomainAssessment,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `WATCH INDICATORS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    watchIndicators,
    ``,
    `END OF BULLETIN`,
  ].join("\n");
}

/* ── Storage Helpers ────────────────────────────────────────────────────── */

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
  } catch {
    // storage quota exceeded — fail silently
  }
}

/* ── File Download ──────────────────────────────────────────────────────── */

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

/* ── Print HTML ─────────────────────────────────────────────────────────── */

export function buildPrintHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RSR AXION – Intelligence Brief</title><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; color: #111; font-family: "Courier New", Courier, monospace; font-size: 12px; line-height: 1.75; padding: 48px 56px; }
    pre { white-space: pre-wrap; word-break: break-word; }
    @media print { body { padding: 24px; } }
  </style></head><body><pre>${escaped}</pre></body></html>`;
}

/* ── Full Brief ─────────────────────────────────────────────────────────── */

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
  const cycleLabel = depth === "quick" ? "QUICK" : mode === "weekly" ? "WEEKLY" : "DAILY";
  const briefTitle = depth === "quick" ? "Quick Brief" : mode === "weekly" ? "Weekly Brief" : "Daily Brief";
  const conf = averageConfidence(sourceSet);
  const counts = clusterCounts(sourceSet);
  const pattern = identifyPatternType(matrix, counts);

  const header = [
    "FROM THE OFFICE OF EXECUTIVE INTELLIGENCE",
    "RSR AXION – INTELLIGENCE SYNTHESIS SYSTEM",
    `Location: ${location}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `INTELLIGENCE CYCLE: ${cycleLabel}`,
    "",
  ].join("\n");

  /* ── Shared sections ── */
  const execSummary = buildExecutiveSummary(sourceSet, matrix, counts, conf);

  const postureTable = [
    `Overall Threat Posture:          ${matrix.overall}`,
    `Conflict Index:                  ${matrix.conflict}`,
    `Economic Stress Index:           ${matrix.markets}`,
    `Infrastructure Exposure Index:   ${matrix.infrastructure}`,
    `Information / Policy Index:      ${matrix.information}`,
    `Cycle Confidence:                ${conf}/100`,
    `Signals Processed:               ${sourceSet.length}`,
  ].join("\n");

  /* Top 3 only for full brief; Top 3 compact for quick */
  const top3 = sourceSet.slice(0, 3);

  /* Supporting signals (4+) compact format */
  const supporting = sourceSet.slice(3).map((e, i) =>
    `${i + 4}. [${e.domain}] ${e.title} — ${e.confidence}/100 confidence`
  ).join("\n") || "None additional.";

  const activeClusters = [
    counts.conflict > 2 && "Conflict / Security",
    counts.markets > 2 && "Markets / Energy",
    counts.infrastructure > 1 && "Infrastructure / Technology",
    counts.information > 2 && "Policy / Information",
  ].filter(Boolean) as string[];

  const patternText = patterns.length > 0
    ? patterns.map(p => `• ${p}`).join("\n")
    : `• No dominant cross-domain cluster pattern confirmed this cycle.`;

  const crossDomainNote = activeClusters.length >= 3
    ? `Active pressure across ${activeClusters.join(", ")}. Three-cluster elevation is a high-stress configuration — systemic feedback loops become more probable and response lead time compresses.`
    : activeClusters.length === 2
    ? `Pressure is co-locating across ${activeClusters.join(" and ")}. Cross-cluster transmission is where the consequential risk is most likely to develop.`
    : activeClusters.length === 1
    ? `Pressure is concentrated in ${activeClusters[0]}. No significant cross-cluster coupling detected — risk remains domain-contained at this time.`
    : `Signals are distributed across domains without forming a concentrated pattern. Breadth-over-focus conditions can mask cumulative pressure.`;

  const patternAnalysis = [
    `Pattern Type: ${pattern.type}`,
    ``,
    pattern.explanation,
    ``,
    patternText,
    ``,
    crossDomainNote,
  ].join("\n");

  const strategicInterpretation = (() => {
    const lines: string[] = [];
    if (matrix.conflict !== "LOW" && matrix.markets !== "LOW") {
      lines.push(`Security-economic coupling is active. When conflict and market signals co-move, the risk is not additive — the coupling introduces a volatility multiplier that reduces the effectiveness of single-domain response strategies. Correlated scenarios, not independent ones, should be the planning baseline.`);
    }
    if (matrix.markets !== "LOW" && matrix.infrastructure !== "LOW") {
      lines.push(`Market and infrastructure signals are intersecting through logistics corridors, energy systems, and technology dependency chains. Disruption originating in either domain will propagate into the other with reduced friction. Supply chain resilience and system redundancy are the primary structural buffers.`);
    }
    if (matrix.information !== "LOW" && matrix.conflict !== "LOW") {
      lines.push(`Policy and institutional signaling is reinforcing the security picture. Diplomatic activity and executive action are frequently leading indicators of kinetic or economic escalation. This convergence warrants anticipatory positioning rather than reactive response.`);
    }
    if (matrix.infrastructure !== "LOW" && lines.length < 2) {
      lines.push(`Infrastructure and technology pressure represents a low-visibility, high-consequence vector. Failure modes in this domain are nonlinear — consequence profiles are disproportionate to the volume of preceding indicators. This cycle warrants particular attention to infrastructure exposure.`);
    }
    if (lines.length === 0) {
      lines.push(`The operating environment holds at a guarded posture. No single domain presents acute pressure, and cross-domain coupling remains at baseline levels. The appropriate response is monitoring continuity, not elevated readiness. Conditions can shift rapidly — signal discipline is the primary risk management instrument at this posture level.`);
    }
    return lines.join("\n\n");
  })();

  const operatorTakeaway = (() => {
    if (matrix.overall === "CRITICAL")
      return `The environment is at CRITICAL. Compounding systemic risk across multiple domains warrants immediate executive-level attention and active contingency management — this is not a monitoring cycle.`;
    if (matrix.overall === "HIGH")
      return `The environment is at HIGH. Multi-domain pressure is active and secondary transmission effects are plausible. Elevate readiness posture and initiate contingency review. Do not wait for confirmation before positioning.`;
    if (matrix.overall === "ELEVATED")
      return `The environment is ELEVATED. At least one domain is generating above-baseline pressure. Increase monitoring cadence and review exposure in ${activeClusters[0] || "the active domain"}. Direction of travel is the key variable to watch.`;
    return `The environment is GUARDED. No immediate escalation pathway is indicated. Maintain monitoring continuity and signal discipline. Complacency during guarded periods is the primary analytical risk.`;
  })();

  const watchIndicators = [
    matrix.conflict !== "LOW" && `• Conflict/Security: escalation velocity, geographic spread, partner nation responses, and kinetic follow-on activity`,
    matrix.markets !== "LOW" && `• Markets/Energy: energy pricing trajectories, trade finance conditions, and logistics network stress`,
    matrix.infrastructure !== "LOW" && `• Infrastructure/Cyber: threat actor attribution, patch cycle responses, and critical system advisories`,
    matrix.information !== "LOW" && `• Policy/Information: legislative, executive, or diplomatic action confirming or reversing current signaling`,
    `• Posture revision (up or down) requires confirming signals across at least two independent domains`,
  ].filter(Boolean).join("\n");

  /* ── Quick Brief ── */
  if (depth === "quick") {
    const compactSignals = top3.map((e, i) =>
      `${i + 1}. [${e.domain}] ${e.title} — ${e.confidence}/100`
    ).join("\n");

    return [
      header,
      `RSR AXION – ${briefTitle.toUpperCase()}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `EXECUTIVE SUMMARY`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      execSummary,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `THREAT POSTURE SUMMARY`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      postureTable,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `TOP 3 PRIORITY SIGNALS`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      compactSignals || "No primary signals identified.",
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `PATTERN ANALYSIS`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Pattern Type: ${pattern.type}`,
      pattern.explanation,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `STRATEGIC INTERPRETATION`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      strategicInterpretation,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `OPERATOR TAKEAWAY`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      operatorTakeaway,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `FORWARD WATCH INDICATORS`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      watchIndicators,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `SUPPORTING SIGNALS`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      supporting,
      ``,
      `END OF QUICK BRIEF`,
    ].join("\n");
  }

  /* ── Full Brief ── */
  const primarySignalBlock = top3.map(e => buildSignalBlock(e, matrix)).join("\n\n─────────────────────────────────────────\n\n");

  return [
    header,
    `RSR AXION – ${briefTitle.toUpperCase()}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `EXECUTIVE SUMMARY`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    execSummary,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `THREAT POSTURE SUMMARY`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    postureTable,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `TOP 3 PRIORITY SIGNALS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    primarySignalBlock || "No primary signals identified in this cycle.",
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `PATTERN ANALYSIS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    patternAnalysis,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `STRATEGIC INTERPRETATION`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    strategicInterpretation,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OPERATOR TAKEAWAY`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    operatorTakeaway,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `FORWARD WATCH INDICATORS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    watchIndicators,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `SUPPORTING SIGNALS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    supporting,
    ``,
    `END OF ${briefTitle.toUpperCase()}`,
  ].join("\n");
}
