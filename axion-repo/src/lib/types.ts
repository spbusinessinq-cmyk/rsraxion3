export type Mode = "daily" | "weekly";
export type BriefDepth = "full" | "quick";
export type FeedEvent = { id:string; source:string; domain:string; title:string; summary:string; severity:number; confidence:number; timestamp:string; };
export type ThreatMatrix = { overall:string; conflict:string; markets:string; infrastructure:string; information:string; };
export type HistoryEntry = { id:string; issue:string; date:string; title:string; mode:Mode|"quick"; threat:string; brief:string; starred:boolean; };
