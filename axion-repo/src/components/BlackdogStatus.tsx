import { useEffect, useRef, useState } from "react";

type BDStatus = "ok" | "degraded" | "down" | "unreachable";

const ENDPOINT = "https://rsr-blackdog.edgeone.app/api/network-status";
const INTERVAL_MS = 5000;

function mapStatus(raw: string): BDStatus {
  const r = raw.toLowerCase();
  if (r === "ok" || r === "online") return "ok";
  if (r === "degraded") return "degraded";
  if (r === "down" || r === "offline") return "down";
  return "unreachable";
}

const STATUS_CONFIG: Record<BDStatus, { dot: string; label: string; cls: string }> = {
  ok:          { dot: "🟢", label: "CONNECTED",          cls: "bdGreen"  },
  degraded:    { dot: "🟡", label: "DEGRADED",           cls: "bdAmber"  },
  down:        { dot: "🔴", label: "OFFLINE",            cls: "bdRed"    },
  unreachable: { dot: "🔴", label: "BLACKDOG UNREACHABLE", cls: "bdRed"  },
};

export default function BlackdogStatus() {
  const [status, setStatus] = useState<BDStatus>("unreachable");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function poll() {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (!res.ok) { setStatus("unreachable"); return; }
      const data = await res.json();
      const raw: string = data?.services?.axion?.status ?? "";
      setStatus(mapStatus(raw));
    } catch {
      setStatus("unreachable");
    }
  }

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const cfg = STATUS_CONFIG[status];

  return (
    <div className="bdBadge">
      <span className="bdProtected">Protected by Blackdog Security</span>
      <span className={`bdState ${cfg.cls}`}>
        {cfg.dot} {cfg.label}
      </span>
    </div>
  );
}
