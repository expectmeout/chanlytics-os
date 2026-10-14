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
 * the ledger's rows take it from there (00277: events.request_id), whether TypeScript or a SQL function wrote them.
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
  /**
   * How long one call to the database took, inside the request that made it (decision 0053): the app adds it to the
   * request's `db` share, which its answer says in Server-Timing. Absent, nothing is timed.
   */
  timed?(ms: number): void;
  /**
   * The table one call touched and how, or the SQL function it called (`touchOfCall`), inside the request that made it: what
   * a route's trace is held to (decision 0058, lane R7). Absent, nothing is noted.
   */
  touched?(table: string, how: string): void;
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

/** One call's time, told to the process that asked to hear it. */
function dbTimed(ms: number): void {
  (observerHolder[OBSERVER_SLOT] ?? FALLBACK).timed?.(ms);
}

/** What one call to the database touched: a table and how (`read`, `INSERT`, `UPDATE`, `DELETE`), or a SQL function (`rpc:<name>`, `call`). */
export interface DbTouch {
  table: string;
  how: string;
}

/** A PostgREST path: the table, or `rpc/` and the function's name, after the API's root. */
const REST_PATH = /\/rest\/v1\/(rpc\/)?([a-z_][a-z0-9_]*)\/?$/;

/**
 * What a call of the database client touches, from its address and its method as PostgREST reads them: a read of a table, a
 * row written (an insert that merges on a conflict is an update too), or a function called, whose own tables only the trace can
 * say. Null for anything that is not PostgREST's (the auth server, storage).
 */
export function touchOfCall(input: string | URL | Request, init?: RequestInit): DbTouch | null {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let path: string;
  try {
    path = new URL(url, "http://db.invalid").pathname;
  } catch {
    return null;
  }
  const [, rpc, name] = REST_PATH.exec(path) ?? [];
  if (!name) return null;
  if (rpc) return { table: `rpc:${name}`, how: "call" };
  const method = (
    init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")
  ).toUpperCase();
  if (method === "GET" || method === "HEAD") return { table: name, how: "read" };
  if (method === "PATCH") return { table: name, how: "UPDATE" };
  if (method === "DELETE") return { table: name, how: "DELETE" };
  const prefer = new Headers(init?.headers).get("prefer") ?? "";
  return { table: name, how: /resolution=merge-duplicates/.test(prefer) ? "INSERT UPDATE" : "INSERT" };
}

/** One call's touch, told to the process that asked to hear it. */
function dbTouched(input: string | URL | Request, init?: RequestInit): void {
  const observer = observerHolder[OBSERVER_SLOT] ?? FALLBACK;
  if (!observer.touched) return;
  const touch = touchOfCall(input, init);
  if (touch) observer.touched(touch.table, touch.how);
}

/**
 * A fetch that names the request it is made for: the database client's transport, so a SQL function writing to the
 * ledger in that request can say which it was, and that says how long each call took (`timed`), so the answer can say
 * how much of its time was the database's and in how many calls, and what each touched (`touched`). A call outside a
 * request goes as it came.
 */
export function namedFetch(base?: typeof fetch): typeof fetch {
  return (input, init) => {
    // The process's fetch as it is at the call, not at the client's making: a test that stubs it later is heard.
    const send = base ?? globalThis.fetch;
    const id = dbRequestId();
    if (!id) return send(input, init);
    dbTouched(input, init);
    const headers = new Headers(init?.headers);
    headers.set(DB_REQUEST_HEADER, id);
    const started = performance.now();
    const call = send(input, { ...init, headers });
    // Timed to its headers: what the request waited for before it could read the answer.
    void call.then(
      () => dbTimed(performance.now() - started),
      () => dbTimed(performance.now() - started),
    );
    return call;
  };
}
