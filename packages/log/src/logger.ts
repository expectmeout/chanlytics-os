/**
 * The platform's one logger: the edge, the dashboard's server and the packages write through it.
 *
 * One JSON object per line: `level`, `event`, the request it belongs to (`request_id`, request.ts), the workspace
 * once the request has said which (`tenant_id`), then the line's own fields, each redacted by its key (redact.ts).
 * Vercel keeps stdout per invocation, so the line is the whole transport: no dependency, no shipping, no sampling.
 *
 * It was two copies and a third way. The edge's logger (apps/edge/lib/shared/log.ts, 21 September) and the dashboard's
 * (#1332) had one shape and two stores; core, jobs and db wrote positional console lines no query could read and no
 * request could be found in. The apps now re-export this module, each with its own closed set of names (the edge's
 * LOG_EVENTS, the dashboard's DASHBOARD_LOG_EVENTS); the packages log through it, db through the port it is handed.
 *
 * EVENT NAMES DO NOT CHANGE: they are what alerting and every incident's first query grep for.
 */
import { errText, redact } from "./redact";
import { requestId, requestTenant, serveAs, type ServedStore, type ServingAbout } from "./request";

export type LogLevel = "info" | "warn" | "error";

/** A line's fields: anything JSON can carry. An undefined field is dropped, not written as null. */
export type LogFields = Record<string, unknown>;

/** The envelope's keys are the logger's own: a field that would replace one rides under `<key>_field`. */
const ENVELOPE = new Set(["level", "event", "request_id"]);
/** How many frames of a stack an error line keeps: where it was thrown, not the framework under it. */
const STACK_FRAMES = 8;

/**
 * An error's stack, trimmed: its first frames, one string, scrubbed like any text. Only the frames (`at …`): the lines
 * above them are the message, which can run over several lines (a provider's pretty-printed answer) and is written,
 * redacted, under the error's own key.
 */
function stackOf(e: Error): string | undefined {
  if (!e.stack) return undefined;
  const frames = e.stack
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at "))
    .slice(0, STACK_FRAMES);
  return frames.length ? String(redact("", frames.join(" | "))) : undefined;
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
export function errField(error: unknown): string {
  return error instanceof Error ? errText(error) : String(error);
}

/** Writes down a failure something chose to go on past: what was being done (`doing`), and what went wrong. */
export function logKeptGoing(doing: string, failure: unknown): void {
  emit("warn", "kept_going", { what: doing, error: errField(failure) });
}

/**
 * A promise's failure handler for work that must not stop what is being done and must not vanish either: a read a page
 * can do without, a copy of a record, a page to the platform (decision 0114). `.catch(() => null)` made a failed read
 * look the same as "nothing there" and a failed write the same as done, with no line anywhere. The answer is `fallback`.
 */
export function logAndGoOn(doing: string): (failure: unknown) => undefined;
export function logAndGoOn<F>(doing: string, fallback: F): (failure: unknown) => F;
export function logAndGoOn(doing: string, fallback?: unknown): (failure: unknown) => unknown {
  return (failure) => {
    logKeptGoing(doing, failure);
    return fallback;
  };
}

/*
 * A unit of work named as it enters, and its one line of outside calls as it ends (layer 12, lane 8 of the "prove it
 * works" plan, 28 Nov 2026).
 *
 * `withRequestId` names the request a door, a route or a job serves (request.ts holds the name). What the work says of
 * itself goes in with the name: the workspace it acts on, what it is for (a door's path, a job's kind) and which try it
 * is. The provider door reads them back: the workspace is whose limits a call spends, and a later try asks each call
 * once (channels provider-fetch).
 *
 * When the work has ended, the calls it made to services outside our own two apps are said in one line,
 * `outside_calls`: by provider, how many and how long, under the workspace and the purpose. Before it, a call's time was
 * said only inside a dashboard route's answer, and a job's or a webhook's calls were said nowhere, so what one workspace
 * costs at Meta or Google could not be added up. One line per unit of work, never one per call: a sweep makes hundreds
 * (decision 0149, point 2).
 */

/** The line a unit of work's outside calls are said in, when it made any. */
function sayOutsideCalls(store: ServedStore): void {
  if (!store.calls?.size) return;
  const calls: Record<string, { n: number; ms: number }> = {};
  for (const [provider, spent] of store.calls) calls[provider] = { n: spent.n, ms: Math.round(spent.ms) };
  logger().info("outside_calls", {
    ...(store.tenantId ? { tenant_id: store.tenantId } : {}),
    purpose: store.purpose ?? null,
    attempt: store.attempt ?? null,
    calls,
  });
}

/**
 * Run `fn` as the request named `id`: every line it logs, every job it schedules and every event it writes carries the
 * name, and its outside calls are said once it has ended. `about` is what the work says of itself as it enters.
 */
export function withRequestId<T>(id: string, fn: () => T, about: ServingAbout = {}): T {
  return serveAs(id, about, fn, sayOutsideCalls);
}
