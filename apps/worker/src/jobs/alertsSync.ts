import { db } from "../db.js";
import { log } from "../log.js";
import { getAlerts } from "../passio/rest.js";

// Passio returns alert timestamps in America/Chicago local format
// ("YYYY-MM-DD HH:MM:SS"). We assume Chicago for the conversion — 1-hour
// drift during DST is acceptable for "is this alert active" logic.
function parseChicago(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(`${s.replace(" ", "T")}-06:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const INTERVAL_MS = 5 * 60 * 1000;

async function tick() {
  try {
    const resp = (await getAlerts()) as { msgs?: RawAlertMsg[] };
    const msgs = resp.msgs ?? [];
    const rows = msgs
      .filter((m) => m.archive !== "1")
      .map((m) => ({
        id: String(m.id),
        title: m.name ?? m.gtfsAlertHeaderText ?? null,
        body: m.gtfsAlertDescriptionText ?? m.html ?? null,
        route_id: m.routeId ? String(m.routeId) : null,
        starts_at: parseChicago(m.from),
        ends_at: parseChicago(m.to),
      }));
    if (rows.length === 0) {
      log.info("alertsSync: no alerts");
      return;
    }
    const { error } = await db.from("alerts").upsert(rows, { onConflict: "id" });
    if (error) log.warn("alertsSync: upsert failed", { err: error.message });
    else log.info("alertsSync: upserted", { count: rows.length });
  } catch (err) {
    log.error("alertsSync tick failed", { err: String(err) });
  }
}

interface RawAlertMsg {
  id: string | number;
  name?: string;
  html?: string;
  gtfsAlertHeaderText?: string;
  gtfsAlertDescriptionText?: string;
  routeId?: string | null;
  archive?: string;
  from?: string | null;
  to?: string | null;
}

export function scheduleAlertsSync() {
  void tick();
  setInterval(tick, INTERVAL_MS).unref();
}
