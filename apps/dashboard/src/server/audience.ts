import { savedListsFor } from "@chanlytics/db";
import {
  dealsAreOn,
  listUnknownWords,
  membersOf,
  poolRowsOf,
  resolveList,
  type ListContext,
  type ListRef,
  type PersonRowDto,
  type PersonRowVM,
} from "@chanlytics/contracts";
import type { RouteContext } from "./with-route";
import { everyone } from "./people";
import { withVisits, type PeopleVisits } from "./calendar";
import { sellsByOf } from "./deals";

/**
 * Everyone, with their appointments: the pool a broadcast's audience, a People list and a playbook's moment are
 * drawn from on the server.
 *
 * The send (campaign-ports) and the assistant's listing, proposals and search each read their own pool, and the
 * assistant's was the first thousand people with no appointments: "Lapsed" and "Asked, never booked" counted nobody
 * there while the page and the send counted them, a visit reminder it proposed reached no one, and past a thousand
 * people every count it said was short of the one the send would enrol. One pool, so the number the assistant says is
 * the number the card carries and the send enrols.
 */
export interface AudiencePool {
  /** The rows as people_list answers them, each with its appointments attached. */
  people: PersonRowDto[];
  /** The same people as the page reads them: what every audience and list predicate in contracts is judged on. */
  rows: PersonRowVM[];
  calendar: PeopleVisits["calendar"];
  /** The profile lists a consult-first service (0004): the Consultations list can be counted only then. */
  consult_first: boolean;
  /** Deals are on here: the workspace says some customers get a proposal first (dealsAreOn, 0008). The deal lists exist only then. */
  deals_on: boolean;
  /** What this pool can give a list (lists.ts): its calendar, deals, a consult-first service, and the member asking. */
  listCtx: ListContext;
}

export async function audiencePool(ctx: RouteContext, tenantId: string, tz: string, now: Date): Promise<AudiencePool> {
  const [{ people, calendar, consult_first }, sellsBy] = await Promise.all([
    everyone(ctx, tenantId).then((rows) => withVisits(ctx, tenantId, rows, now)),
    sellsByOf(ctx, tenantId),
  ]);
  const deals_on = dealsAreOn(sellsBy);
  const viewer = ctx.userId ?? null;
  return {
    people,
    // The pool's one reading (contracts audience-pool.ts), for the member asking: a teammate's thread is theirs, and a
    // list about "me" is about them. Where deals are off no row carries one.
    rows: poolRowsOf(people, { tz, now, viewer, dealsOn: deals_on }),
    calendar,
    consult_first,
    deals_on,
    // What the pool can give a list (lists.ts ListContext): the consult-first service is withVisits' reading of it.
    listCtx: { calendar: calendar.state, dealsOn: deals_on, consultFirst: consult_first, viewer: viewer !== null },
  };
}

/** The pool once per assistant turn: a turn that lists audiences and then proposes a send reads everyone once. */
export function audiencePoolOnce(
  memo: Map<string, Promise<unknown>>,
  ctx: RouteContext,
  tenantId: string,
  tz: string,
  now: Date,
): Promise<AudiencePool> {
  let p = memo.get("audience_pool") as Promise<AudiencePool> | undefined;
  if (!p) {
    p = audiencePool(ctx, tenantId, tz, now);
    memo.set("audience_pool", p);
  }
  return p;
}

/**
 * One list over a pool (decision 0009): resolved by its reference (contracts resolveList), counted the one way
 * (membersOf) with the saved lists its rule may read, and, when it can't be counted here, why, in the page's words.
 * Null when there is no such list. What a send, the assistant's search and its proposals all ask.
 */
export async function poolList(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  pool: Pick<AudiencePool, "rows" | "listCtx">,
  ref: ListRef,
): Promise<{ label: string; memberIds: string[] } | { label: string; unknown: string } | null> {
  // A saved list, and any list a rule reads, is the workspace's: every one of them, every member.
  const saved = ref.kind === "saved" ? await savedListsFor(ctx.supabase, tenantId) : [];
  const def = resolveList(ref, saved);
  if (!def) return null;
  const m = membersOf(def, pool.rows, pool.listCtx, saved);
  return m.state === "ok"
    ? { label: def.label, memberIds: [...m.ids] }
    : { label: def.label, unknown: listUnknownWords(m.reason, pool.listCtx.calendar) };
}
