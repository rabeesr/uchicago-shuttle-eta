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
