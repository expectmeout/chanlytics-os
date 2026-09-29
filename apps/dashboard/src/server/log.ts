import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The dashboard's one logger: one JSON object per line, the edge's shape (apps/edge/lib/log.ts), and every line
 * carries the request it belongs to.
 *
 * It had none. A hundred and twenty-five console calls wrote three shapes (a JSON string, positional values, a bare
 * message), and no line said which request it came from. "What happened to this click?" meant matching timestamps
 * by eye across two apps' logs. Now with-route names each request (channels requestIdOf) and runs the handler inside
 * that name. Every line logged beneath it carries `request_id`, the answer carries it back to the browser, and a call
 * to the edge carries it to the edge's own lines (edge.ts).
 *
 * EVENT NAMES DO NOT CHANGE: they are what alerting greps for. A line's fields are named rather than positional, so
 * the log can be queried.
 */

/** The request the code running now serves: with-route binds it where the request enters. */
const serving = new AsyncLocalStorage<{ id: string }>();

/** Run `fn` as the request named `id`: every line it logs, and every call it makes to the edge, carries the name. */
export function withRequestId<T>(id: string, fn: () => T): T {
  return serving.run({ id }, fn);
}

/** The name of the request the code running now serves, or null outside one (a script, a test). */
export function requestId(): string | null {
  return serving.getStore()?.id ?? null;
}

type Level = "info" | "warn" | "error";
/** A line's fields: anything JSON can carry. An undefined field is dropped, not written as null. */
type LogFields = Record<string, unknown>;

function write(level: Level, event: string, fields: LogFields): void {
  const line: Record<string, unknown> = { level, event };
  const id = requestId();
  if (id) line.request_id = id;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    // The envelope's keys are the logger's own: a field that would replace one rides under `<key>_field`.
    line[k === "event" || k === "level" || k === "request_id" ? `${k}_field` : k] = v;
  }
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  info: (event: string, fields: LogFields = {}): void => write("info", event, fields),
  warn: (event: string, fields: LogFields = {}): void => write("warn", event, fields),
  error: (event: string, fields: LogFields = {}): void => write("error", event, fields),
};

/** An error for a log field: its message, never a stack. */
export function errField(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
