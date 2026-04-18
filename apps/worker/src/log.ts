type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: unknown, meta?: Record<string, unknown>) {
  const line = {
    t: new Date().toISOString(),
    level,
    ...(typeof msg === "string" ? { msg, ...meta } : { ...(msg as object), ...meta }),
  };
  const out = level === "error" || level === "warn" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const log = {
  debug: (msg: unknown, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: unknown, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: unknown, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: unknown, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
