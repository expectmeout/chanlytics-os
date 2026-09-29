/**
 * The platform's one logger: the edge, the dashboard's server and the packages write through it.
 *
 * One JSON object per line: `level`, `event`, the request it belongs to (`request_id`, request.ts), the workspace
 * once the request has said which (`tenant_id`), then the line's own fields, each redacted by its key (redact.ts).
 * Vercel keeps stdout per invocation, so the line is the whole transport: no dependency, no shipping, no sampling.
 *
 * It was two copies and a third way. The edge's logger (apps/edge/lib/log.ts, 21 September) and the dashboard's
 * (#1332) had one shape and two stores; core, jobs and db wrote positional console lines no query could read and no
 * request could be found in. The apps now re-export this module, each with its own closed set of names (the edge's
 * LOG_EVENTS, the dashboard's DASHBOARD_LOG_EVENTS); the packages log through it, db through the port it is handed.
 *
 * EVENT NAMES DO NOT CHANGE: they are what alerting and every incident's first query grep for.
 */
import { errText, redact } from "./redact";
import { requestId, requestTenant } from "./request";

export type LogLevel = "info" | "warn" | "error";

/** A line's fields: anything JSON can carry. An undefined field is dropped, not written as null. */
export type LogFields = Record<string, unknown>;

/** The envelope's keys are the logger's own: a field that would replace one rides under `<key>_field`. */
const ENVELOPE = new Set(["level", "event", "request_id"]);
/** How many frames of a stack an error line keeps: where it was thrown, not the framework under it. */
const STACK_FRAMES = 8;

/** An error's stack, trimmed: its first frames, one string. */
function stackOf(e: Error): string | undefined {
  if (!e.stack) return undefined;
  return e.stack
    .split("\n")
    .slice(1, STACK_FRAMES + 1)
    .map((l) => l.trim())
    .join(" | ");
}

/** One line, as it is written. */
function lineOf(level: LogLevel, event: string, fields: LogFields): Record<string, unknown> {
  const line: Record<string, unknown> = { level, event };
  const id = requestId();
  if (id) line.request_id = id;
  const tenant = requestTenant();
  if (tenant && fields.tenant_id === undefined) line.tenant_id = tenant;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const key = ENVELOPE.has(k) ? `${k}_field` : k;
    line[key] = redact(k, v);
    // An error line says where it came from: the 500 line's stack, which the message alone never did.
    if (level === "error" && v instanceof Error) {
      const stack = stackOf(v);
      if (stack) line[`${key}_stack`] = stack;
    }
  }
  return line;
}

function emit(level: LogLevel, event: string, fields: LogFields): void {
  let text: string;
  try {
    text = JSON.stringify(lineOf(level, event, fields));
  } catch {
    // A field JSON cannot write (a getter that throws): the line still says what happened, without it.
    text = JSON.stringify({ level, event, request_id: requestId() ?? undefined, unwritable: true });
  }
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

/**
 * A logger with context bound to it. Pass the workspace once, as `tenant_id`, where it becomes known, and every line
 * beneath carries it. `E` is the app's closed set of names: tsc refuses a name outside it wherever the logger is typed.
 */
export interface Logger<E extends string = string> {
  info(event: E, fields?: LogFields): void;
  warn(event: E, fields?: LogFields): void;
  error(event: E, fields?: LogFields): void;
  /** A logger with more context bound: per message inside a batch. */
  child(extra: LogFields): Logger<E>;
}

export function logger<E extends string = string>(base: LogFields = {}): Logger<E> {
  return {
    info: (event, fields) => emit("info", event, { ...base, ...fields }),
    warn: (event, fields) => emit("warn", event, { ...base, ...fields }),
    error: (event, fields) => emit("error", event, { ...base, ...fields }),
    child: (extra) => logger<E>({ ...base, ...extra }),
  };
}

/** An error rendered for a log field: name and message, never a stack blob (the logger adds the stack on an error line). */
export function errField(e: unknown): string {
  return e instanceof Error ? errText(e) : String(e);
}
