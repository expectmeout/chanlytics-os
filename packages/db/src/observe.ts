/**
 * What packages/db asks of the process it runs in: somewhere to write a line, and the name of the request it serves.
 *
 * Both belong to channels (its logger, its request store), which db may not import: db sits under every other package
 * (lint-boundaries). So db takes them as a port. The edge's lib/log.ts and the dashboard's server/log.ts hand in the
 * one logger when they load (`observeDb`), and db's lines then go out as every other line does, redacted and carrying
 * the request's name. Before it, db wrote twenty positional console lines that no query could read.
 *
 * The port lives on globalThis under a registered symbol, not in this module: core and jobs inline their own copy of
 * db, and a port handed to one copy would be unseen by the others.
 *
 * The same name rides to the database. A client this module makes sends it on every call (DB_REQUEST_HEADER), and
 * the ledger's rows take it from there (00279: events.request_id), whether TypeScript or a SQL function wrote them.
 */

/** A line's fields: what JSON can carry. */
type Fields = Record<string, unknown>;

export interface DbLog {
  info(event: string, fields?: Fields): void;
  warn(event: string, fields?: Fields): void;
  error(event: string, fields?: Fields): void;
}

export interface DbObserver {
  log: DbLog;
  /** The request the code running now serves, or null outside one. */
  requestId(): string | null;
}

/** The header a request's name rides to the database in: PostgREST hands it to SQL as request.headers. */
export const DB_REQUEST_HEADER = "x-chanlytics-request-id";

const OBSERVER_SLOT: unique symbol = Symbol.for("chanlytics.db.observer");
const observerHolder = globalThis as { [OBSERVER_SLOT]?: DbObserver };

/**
 * Until an app hands its logger in (a script, a test of db alone): the logger's envelope, one JSON line per call.
 * db's own lines carry ids, codes and a database's words, never a person's number or message, so the redaction the
 * logger adds is not missed here.
 */
function fallbackLine(level: "info" | "warn" | "error", event: string, fields: Fields = {}): void {
  const text = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}
const FALLBACK: DbObserver = {
  log: {
    info: (event, fields) => fallbackLine("info", event, fields),
    warn: (event, fields) => fallbackLine("warn", event, fields),
    error: (event, fields) => fallbackLine("error", event, fields),
  },
  requestId: () => null,
};

/** Hand db the process's logger and request store. The edge and the dashboard call it once, as their logger loads. */
export function observeDb(observer: DbObserver): void {
  observerHolder[OBSERVER_SLOT] = observer;
}

/** Where db's lines go. */
export function dbLog(): DbLog {
  return (observerHolder[OBSERVER_SLOT] ?? FALLBACK).log;
}

/** The request being served, when the process has said. */
export function dbRequestId(): string | null {
  return (observerHolder[OBSERVER_SLOT] ?? FALLBACK).requestId();
}

/**
 * A fetch that names the request it is made for: the database client's transport, so a SQL function writing to the
 * ledger in that request can say which it was. A call outside a request goes as it came.
 */
export function namedFetch(base?: typeof fetch): typeof fetch {
  return (input, init) => {
    // The process's fetch as it is at the call, not at the client's making: a test that stubs it later is heard.
    const send = base ?? globalThis.fetch;
    const id = dbRequestId();
    if (!id) return send(input, init);
    const headers = new Headers(init?.headers);
    headers.set(DB_REQUEST_HEADER, id);
    return send(input, { ...init, headers });
  };
}
