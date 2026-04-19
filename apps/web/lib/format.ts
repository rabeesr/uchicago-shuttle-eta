export function formatCountdown(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 0) return "now";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function etaDisagreement(
  ours: number | null | undefined,
  theirs: number | null | undefined,
): "agree" | "disagree-warn" | "disagree-strong" | "one-sided" {
  if (ours == null || theirs == null) return "one-sided";
  const diff = Math.abs(ours - theirs);
  if (diff < 60) return "agree";
  if (diff < 180) return "disagree-warn";
  return "disagree-strong";
}

export interface LeaveBy {
  /** Status categorizes what message the UI should render. */
  status: "no-data" | "too-late" | "leave-now" | "leave-in" | "have-time";
  /** Wall-clock time the user should leave to arrive just before the bus, ISO. */
  leaveAtIso?: string;
  /** Same thing, as "3:42 PM" local. */
  leaveAtDisplay?: string;
  /** How many seconds of slack the user has until they must leave. */
  slackSeconds?: number;
}

/** 60-second cushion so we don't literally recommend "leave at the exact bus arrival second". */
const LEAVE_BY_CUSHION_SEC = 60;

export function computeLeaveBy(
  nowMs: number,
  etaSeconds: number | null | undefined,
  walkingSeconds: number | null | undefined,
): LeaveBy {
  if (etaSeconds == null || walkingSeconds == null) return { status: "no-data" };
  const slack = etaSeconds - walkingSeconds - LEAVE_BY_CUSHION_SEC;
  if (etaSeconds < walkingSeconds) return { status: "too-late", slackSeconds: slack };
  const leaveAt = new Date(nowMs + slack * 1000);
  const leaveAtIso = leaveAt.toISOString();
  const leaveAtDisplay = leaveAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (slack <= 0) return { status: "leave-now", slackSeconds: slack, leaveAtIso, leaveAtDisplay };
  if (slack < 120) return { status: "leave-in", slackSeconds: slack, leaveAtIso, leaveAtDisplay };
  return { status: "have-time", slackSeconds: slack, leaveAtIso, leaveAtDisplay };
}

export function formatLeaveBy(lb: LeaveBy): string {
  switch (lb.status) {
    case "no-data":   return "";
    case "too-late":  return "🏃 Next bus is closer than you can walk";
    case "leave-now": return "🚶 Leave now";
    case "leave-in":  return `🚶 Leave in ${Math.max(1, Math.round((lb.slackSeconds ?? 0) / 60))}m`;
    case "have-time": return `🚶 Leave by ${lb.leaveAtDisplay}`;
  }
}
