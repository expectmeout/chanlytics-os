import { findSavedList, listSavedLists, type SavedListRow } from "@chanlytics/db/people";
import {
  asListRule,
  listUnknownWords,
  membersOf,
  poolListContext,
  poolRowsOf,
  resolveList,
  ruleLists,
  type ChannelsReady,
  type ListContext,
  type ListRef,
  type PersonRowDto,
  type PersonRowVM,
} from "@chanlytics/contracts";
import type { RouteContext } from "../shared/with-route";
import { listEveryone } from "../people/people";
import { withVisits, type PeopleVisits, type ZoneAndSettings } from "../calendar/people-visits";
import { hasDealsRead } from "../people/deals";
import { loadLazily, type Lazy } from "../shared/lazy";
import type { TenantId } from "@chanlytics/contracts";

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
  /** A deal was ever recorded here (packages/db getDealOnFile): the deal lists are counted only then. */
  has_deals: boolean;
  /** What this pool can give a list (lists.ts): its calendar, a deal on file, a consult-first service, and the member asking. */
  listCtx: ListContext;
}

export async function getAudiencePool(
  ctx: RouteContext,
  tenantId: TenantId,
  tz: string,
  now: Date,
  /**
   * What the workspace can send on now, channel by channel (campaigns/channels-ready.ts findChannelsReadyOrNull): each row's
   * reach is judged against it, so a list that reads who can be sent what (contracts reach-any.ts) counts as the page does.
   * Required: no pool may be read without it. Null where it could not be read: counted by WhatsApp alone, as before.
   */
  ready: ChannelsReady | null,
  /**
   * What a caller already read this turn, or how to read it from the turn (readers/audience-pool.ts): whether a deal
   * was ever recorded here, taken instead of reading it here; everyone in People, read just where this reads its
   * own (readers/everyone.ts, which the Playbooks page's pools share); and the calendar's zone and settings, which the
   * calendar's lookup then reads neither of (withVisits). The send reads its own.
   */
  opts: { hasDeals?: boolean; people?: Lazy<PersonRowDto[]>; known?: ZoneAndSettings; stale?: boolean } = {},
): Promise<AudiencePool> {
  const [{ people, calendar, consult_first }, has_deals] = await Promise.all([
    (opts.people === undefined ? listEveryone(ctx, tenantId) : loadLazily(opts.people)).then((rows) =>
      // `stale`: the calendar's last good read may answer, for a caller that only counts (readers/list-counts.ts).
      withVisits(ctx, tenantId, rows, now, opts.known, opts.stale ? { stale: true } : {}),
    ),
    opts.hasDeals !== undefined ? opts.hasDeals : hasDealsRead(ctx, tenantId),
  ]);
  const viewer = ctx.userId ?? null;
  return {
    people,
    // The pool's one reading (contracts audience-pool.ts), for the member asking: a teammate's thread is theirs, and a
    // list about "me" is about them.
    rows: poolRowsOf(people, { tz, now, viewer, ready }),
    calendar,
    consult_first,
    has_deals,
    // What the pool can give a list (contracts poolListContext), the consult-first service as withVisits read it.
    listCtx: poolListContext({
      calendar: calendar.state,
      hasDeals: has_deals,
      consultFirst: consult_first,
      viewer,
    }),
  };
}

/** What a new send or playbook is told of an archived list (00169). */
export const archivedListWords = (name: string, to: "send" | "run") =>
  `${name} is archived. Restore it on People to ${to === "send" ? "send to it" : "run a campaign on it"}.`;

/**
 * One list over a pool (decision 0009): resolved by its reference (contracts resolveList), counted the one way
 * (membersOf) with the saved lists its rule may read, and, when it can't be counted here, why, in the page's words.
 * Null when there is no such list. What a send, the assistant's search and its proposals all ask.
 */
export async function findPoolList(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  pool: Pick<AudiencePool, "rows" | "listCtx">,
  ref: ListRef,
  /**
   * The workspace's lists as listSavedLists answers them, archived and members included, when the caller already holds
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
  let saved: Awaited<ReturnType<typeof listSavedLists>> = [];
  // Archived (00169): still counted, for what already names it, and said, for a send or a proposal to refuse.
  let archived = false;
  if (ref.kind === "saved") {
    // Handed the lists, the one asked for as findSavedList answers it: a rule list's members are its rule's, never rows.
    const held = lists?.find((l) => l.id === ref.id);
    const one = lists
      ? held
        ? { ...held, ids: held.rule == null ? held.ids : [] }
        : null
      : await findSavedList(ctx.supabase, tenantId, ref.id);
    if (!one) return null;
    archived = !!one.archived_at;
    const rule = one.rule == null ? null : asListRule(one.rule);
    saved = rule && ruleLists(rule).length ? (lists ?? (await listSavedLists(ctx.supabase, tenantId))) : [one];
  }
  const def = resolveList(ref, saved);
  if (!def) return null;
  const members = membersOf(def, pool.rows, pool.listCtx, saved);
  const archivedFilter = archived ? { archived: true as const } : {};
  return members.state === "ok"
    ? { label: def.label, memberIds: [...members.ids], rule: def.rule, ...archivedFilter }
    : { label: def.label, unknown: listUnknownWords(members.reason, pool.listCtx.calendar), ...archivedFilter };
}
