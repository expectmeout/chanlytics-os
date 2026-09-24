import {
  dealsAreOn,
  toPersonRowVM,
  type ListContext,
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
  return {
    people,
    // For the member asking: a teammate's thread is theirs, and a list about "me" is about them.
    rows: people.map((r) => toPersonRowVM(r, tz, now, ctx.userId ?? null)),
    calendar,
    consult_first,
    deals_on,
    listCtx: { calendar: calendar.state, dealsOn: deals_on, consultFirst: consult_first, viewer: !!ctx.userId },
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
