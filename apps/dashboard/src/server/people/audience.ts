import { savedListFor, savedListsFor, type SavedListRow } from "@chanlytics/db";
import {
  asListRule,
  dealsAreOn,
  listUnknownWords,
  membersOf,
  poolListContext,
  poolRowsOf,
  resolveList,
  ruleLists,
  type ListContext,
  type ListRef,
  type PersonRowDto,
  type PersonRowVM,
  type SellsBy,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { everyone } from "./people";
import { withVisits, type PeopleVisits, type ZoneAndSettings } from "../calendar/people-visits";
import { sellsByOf } from "./deals";
import { lazily, type Lazy } from "../lazy";

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

export async function audiencePool(
  ctx: RouteContext,
  tenantId: string,
  tz: string,
  now: Date,
  /**
   * What a caller already read this turn, or how to read it from the turn (readers/audience-pool.ts): how the
   * workspace's customers buy, taken instead of reading it here; everyone in People, read just where this reads its
   * own (readers/everyone.ts, which the Playbooks page's pools share); and the calendar's zone and settings, which the
   * calendar's lookup then reads neither of (withVisits). The send reads its own.
   */
  opts: { sellsBy?: SellsBy | null; people?: Lazy<PersonRowDto[]>; known?: ZoneAndSettings } = {},
): Promise<AudiencePool> {
  const [{ people, calendar, consult_first }, sellsBy] = await Promise.all([
    (opts.people === undefined ? everyone(ctx, tenantId) : lazily(opts.people)).then((rows) =>
      withVisits(ctx, tenantId, rows, now, opts.known),
    ),
    opts.sellsBy !== undefined ? opts.sellsBy : sellsByOf(ctx, tenantId),
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
    // What the pool can give a list (contracts poolListContext), the consult-first service as withVisits read it.
    listCtx: poolListContext({
      calendar: calendar.state,
      dealsOn: deals_on,
      consultFirst: consult_first,
      viewer,
    }),
  };
}

/** What a new send or playbook is told of an archived list (00169). */
export const archivedListWords = (name: string, to: "send" | "run") =>
  `${name} is archived. Restore it on People to ${to === "send" ? "send to it" : "run a playbook on it"}.`;

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
  /**
   * The workspace's lists as savedListsFor answers them, archived and members included, when the caller already holds
   * them (Ask's turn, readers/lists.ts): the list and any its rule names are taken from them, and nothing is read. The
   * send reads its own.
   */
  lists?: SavedListRow[],
): Promise<
  | { label: string; memberIds: string[]; rule: unknown; archived?: true }
  | { label: string; unknown: string; archived?: true }
  | null
> {
  // A saved list is read with every member; the workspace's other lists only when its rule reads one (in_list). No
  // built-in reads a saved list.
  let saved: Awaited<ReturnType<typeof savedListsFor>> = [];
  // Archived (00169): still counted, for what already names it, and said, for a send or a proposal to refuse.
  let archived = false;
  if (ref.kind === "saved") {
    // Handed the lists, the one asked for as savedListFor answers it: a rule list's members are its rule's, never rows.
    const held = lists?.find((l) => l.id === ref.id);
    const one = lists
      ? held
        ? { ...held, ids: held.rule == null ? held.ids : [] }
        : null
      : await savedListFor(ctx.supabase, tenantId, ref.id);
    if (!one) return null;
    archived = !!one.archived_at;
    const rule = one.rule == null ? null : asListRule(one.rule);
    saved = rule && ruleLists(rule).length ? (lists ?? (await savedListsFor(ctx.supabase, tenantId))) : [one];
  }
  const def = resolveList(ref, saved);
  if (!def) return null;
  const m = membersOf(def, pool.rows, pool.listCtx, saved);
  const said = archived ? { archived: true as const } : {};
  return m.state === "ok"
    ? { label: def.label, memberIds: [...m.ids], rule: def.rule, ...said }
    : { label: def.label, unknown: listUnknownWords(m.reason, pool.listCtx.calendar), ...said };
}
