// Structured, levelled server logging — the base for observability. Emits one
// JSON object per line (parseable by any log aggregator). Errors are also handed
// to `captureError`, the single hook where an error tracker (e.g. Sentry) plugs
// in without touching call sites.
type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const MIN_LEVEL: Level =
  (process.env["LOG_LEVEL"] as Level) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

export type LogMeta = Record<string, unknown>;

function emit(level: Level, msg: string, meta?: LogMeta): void {
  if (ORDER[level] < ORDER[MIN_LEVEL]) return;
  const record = { ts: new Date().toISOString(), level, msg, ...meta };
  const line = JSON.stringify(record);
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  if (level === "error") captureError(msg, meta);
}

// Extension point for an external error tracker. Wire Sentry here (guarded by
// SENTRY_DSN) when you add it — nothing else needs to change.
function captureError(_msg: string, _meta?: LogMeta): void {
  // if (process.env.SENTRY_DSN) Sentry.captureException(...)
}

export const logger = {
  debug: (msg: string, meta?: LogMeta) => emit("debug", msg, meta),
  info: (msg: string, meta?: LogMeta) => emit("info", msg, meta),
  warn: (msg: string, meta?: LogMeta) => emit("warn", msg, meta),
  error: (msg: string, meta?: LogMeta) => emit("error", msg, meta),
};
