export type Mode = "daily" | "weekly" | "full";
export type BriefDepth = "full" | "quick";
export type ExportKind = "txt" | "article" | "bulletin";
export type ArchiveThreatFilter = "ALL" | "LOW" | "GUARDED" | "ELEVATED" | "HIGH" | "CRITICAL";
export type ArchiveModeFilter = "ALL" | "quick" | "daily" | "weekly" | "full";
export type ArchiveSort = "newest" | "oldest" | "threat";

export type DomainFilter =
  | "ALL"
  | "Global Affairs"
  | "Security / Defense"
  | "Technology"
  | "Cyber / Signals"
  | "Markets / Economy"
  | "Energy"
  | "Policy / Regulation"
  | "Infrastructure";

export type PressureState = "BUILDING" | "TRANSFERRING" | "RELEASING" | "STABLE" | "FRAGMENTED";

export type FeedEvent = {
  id: string;
  source: string;
  domain: string;
  title: string;
  summary: string;
  severity: number;
  confidence: number;
  timestamp: string;
};

export type ThreatMatrix = {
  overall: string;
  conflict: string;
  markets: string;
  infrastructure: string;
  information: string;
};

export type HistoryEntry = {
  id: string;
  issue: string;
  date: string;
  title: string;
  mode: string;
  threat: string;
  brief: string;
  starred: boolean;
};
