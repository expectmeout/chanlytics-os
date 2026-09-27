/**
 * Structured logging for the edge.
 *
 * There were 75 console call sites across the edge and the packages it bundles,
 * and FIVE of them mentioned a tenant. The shapes were ad hoc too — some passed
 * a JSON string, some bare values, some an Error's message — so the log was not
 * queryable even in principle. The practical consequence is that "what happened
 * to this business's line yesterday?" could not be answered, which is the
 * question every incident starts with.
 *
 * The design constraint that shaped this: EVENT NAMES DO NOT CHANGE. They are
 * the stable identifier anything downstream greps for, and renaming them to
 * make a logger look tidy would break the one thing already working. What
 * changes is that every line carries the same envelope — level, event, tenant,
 * and a correlation id — so lines can be joined into the story of one message.
 * The names are a closed set, LOG_EVENTS (log-events.ts): a line names its
 * event with one of them or it does not compile.
 *
 * Vercel captures stdout per invocation, so one JSON object per line is the
 * whole transport. No dependency, no shipping, no sampling.
 */
import type { LogEvent } from "./log-events.js";

export type { LogEvent };

export type LogLevel = "info" | "warn" | "error";

/**
 * Fields carried by every line from one logical unit of work. Anything JSON
 * can carry: a provider's error list or a usage object rides as it is, rather
 * than being flattened by hand at every site.
 */
export type LogContext = Record<string, unknown>;

function emit(level: LogLevel, event: string, fields: LogContext): void {
  // Undefined keys are dropped rather than serialised as null: a field that is
  // absent because it does not apply should not read as a field that is known
  // to be empty.
  const payload: Record<string, unknown> = { level, event };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    // The envelope's two keys are the logger's own. A field named `event` once
    // replaced a line's name with the id it named, and nothing could grep for
    // the line; such a field rides under `<key>_field` instead.
    payload[k === "event" || k === "level" ? `${k}_field` : k] = v;
  }
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  info(event: LogEvent, fields?: LogContext): void;
  warn(event: LogEvent, fields?: LogContext): void;
  error(event: LogEvent, fields?: LogContext): void;
  /** A logger with more context bound — e.g. per message inside a batch. */
  child(extra: LogContext): Logger;
}

/**
 * A logger with context bound to it. Pass the tenant once, at the point where
 * it becomes known, and every line beneath it carries it — which is the only
 * way this stays true as code moves around.
 */
export function logger(base: LogContext = {}): Logger {
  return {
    info: (event, fields) => emit("info", event, { ...base, ...fields }),
    warn: (event, fields) => emit("warn", event, { ...base, ...fields }),
    error: (event, fields) => emit("error", event, { ...base, ...fields }),
    child: (extra) => logger({ ...base, ...extra }),
  };
}

/** An error rendered for a log field: name and message, never a stack blob. */
export function errField(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
