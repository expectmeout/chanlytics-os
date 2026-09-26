import "server-only";
import type { RouteContext } from "../with-route";
import type { Member } from "../route";

/**
 * One read layer (Ask Rewired, spec 5.1).
 *
 * A reader is a named function of the request context and typed arguments
 * that returns what the page's route answers (`data`, key for key), the rows
 * it touched as references a citation may name, and a freshness stamp. The
 * GET routes, Ask's tools and, from Phase 2, the context providers all read
 * through here, so the number Ask says is the number the page shows by
 * construction. The repositories in packages/db and the view models in
 * packages/contracts stay where they are; readers compose them, and a tool
 * applies the page's own view-model builder to `data`.
 *
 * Two caches. The TurnCache memoises by reader and arguments for the life of
 * one turn or one request (the memo that lived in Ask's ToolContext,
 * generalised; a failure is never kept). The ReaderCache keeps a reader that
 * declares `ttlMs` across turns on this instance, per workspace and person;
 * in Phase 1 only the tenant's name and zone do.
 */

/** The kinds a row may be cited as (contracts AskReadSet) and a page. Phase 4 grows this to twelve. */
export type RowKind = "thread" | "conversation" | "call" | "person" | "page";

export interface RowRef {
  kind: RowKind;
  id: string;
  /** Where it opens, as the page opens it. */
  route: string;
  label: string;
}

export interface Read<T> {
  data: T;
  rows: RowRef[];
  /** When it was read (Date.now()). */
  stamp: number;
}

export interface Reader<A, T> {
  /** Unique in the directory: the first half of every cache key. */
  name: string;
  read(rc: ReaderContext, args: A): Promise<Read<T>>;
  /** Kept across turns on this instance for this long, per workspace and person. Unset: per turn only. */
  ttlMs?: number;
}

export interface ReaderContext {
  ctx: RouteContext;
  tenantId: string;
  userId: string;
  role: Member["role"];
  /** The turn's clock: every reader that says "today" says this day. */
  now: Date;
  turn: TurnCache;
}

/** The arguments as one key: the same fields in any order are the same key; undefined is the empty key. */
export function stableJson(v: unknown): string {
  if (v === undefined) return "";
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.keys(val as Record<string, unknown>)
            .sort()
            .map((k) => [k, (val as Record<string, unknown>)[k]]),
        )
      : val,
  );
}

export const READER_CACHE_CAP = 500;

/** Across turns, per instance: only readers with a ttl, keyed by workspace, person, reader and arguments. */
class ReaderCache {
  private readonly kept = new Map<string, { at: number; read: Promise<Read<unknown>> }>();

  get<A, T>(rc: ReaderContext, r: Reader<A, T>, args: A, key: string): Promise<Read<T>> {
    const k = `${rc.tenantId}|${rc.userId}|${key}`;
    const had = this.kept.get(k);
    if (had && Date.now() - had.at < (r.ttlMs ?? 0)) return had.read as Promise<Read<T>>;
    const read = r.read(rc, args);
    this.kept.set(k, { at: Date.now(), read });
    // A failure is not a fact: the next turn reads again.
    read.catch(() => {
      if (this.kept.get(k)?.read === read) this.kept.delete(k);
    });
    // Bounded first-in-first-out, as the snapshot's cache is.
    if (this.kept.size > READER_CACHE_CAP) this.kept.delete(this.kept.keys().next().value as string);
    return read;
  }

  clear(): void {
    this.kept.clear();
  }
}

export const readerCache = new ReaderCache();

/** One turn's reads, by reader and arguments: the same rows are never fetched twice in a turn. */
export class TurnCache {
  private readonly hits = new Map<string, Promise<Read<unknown>>>();

  get<A, T>(rc: ReaderContext, r: Reader<A, T>, args: A): Promise<Read<T>> {
    const key = `${r.name}:${stableJson(args)}`;
    const had = this.hits.get(key) as Promise<Read<T>> | undefined;
    if (had) return had;
    const read = r.ttlMs ? readerCache.get(rc, r, args, key) : r.read(rc, args);
    this.hits.set(key, read);
    // memoised() in tools.ts kept a rejection for the whole turn, so a read
    // that failed once failed on every later call. Not here.
    read.catch(() => {
      if (this.hits.get(key) === read) this.hits.delete(key);
    });
    return read;
  }
}

/** Read through the turn's cache. The one call every route, tool and provider makes. */
export function load<A, T>(rc: ReaderContext, r: Reader<A, T>, args: A): Promise<Read<T>> {
  return rc.turn.get(rc, r, args);
}

/** The context a route builds from its resolved membership, or a turn from its own. */
export function readerContext(
  ctx: RouteContext,
  member: Pick<Member, "tenantId" | "role">,
  now: Date = new Date(),
): ReaderContext {
  return { ctx, tenantId: member.tenantId, userId: ctx.userId, role: member.role, now, turn: new TurnCache() };
}

/** A stamp for a read made now. */
export const stamp = (): number => Date.now();
