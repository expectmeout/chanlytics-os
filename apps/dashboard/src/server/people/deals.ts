import "server-only";
import { dbRefusal, type RouteContext } from "@/server/shared/with-route";
import {
  type DealMove,
  getDealOnFile,
  listDealRowsOf,
  listYesesSince,
  pageDealReport,
  recordDeal,
} from "@chanlytics/db/deals";
import { readAllRows, readAnswer } from "@chanlytics/db/shared";
import {
  AppError,
  DAY_MS,
  DEAL_LOST_REASONS,
  DEAL_REFUSALS,
  PERSON_CAME_FROM_WORDS,
  appointmentWordOf,
  cameFromOf,
  dealPaceFrom,
  isDealLostReason,
  isYes,
  medianWait,
  PACE_WINDOW_DAYS,
  pickCurrentDeal,
  yesWaits,
  type AppointmentWord,
  type DealDto,
  type DealPaceDto,
  type DealReportDto,
  type PersonCameFrom,
  type PersonRowDto,
  recordOrNull,
  keysOf,
  shaped,
} from "@chanlytics/contracts";
import { log } from "@/server/shared/log";
import { findAppointmentWord } from "@chanlytics/db/workspace";
import type { TenantId, ContactId } from "@chanlytics/contracts";
import { z } from "zod";

/** What record_deal answers: its refusal, or the deal, where it stood before, and the decision it wrote. */
const DealAnswer = z
  .object({ error: z.string(), deal: shaped<DealDto>(), from: z.string().nullable(), decision_id: z.string() })
  .partial();

/**
 * What this workspace calls an appointment (tenants.appointment_word, 00458), by contracts' one derivation
 * (appointmentWordOf): the word it picked, else "appointment", which a row that cannot be read says too (a database
 * 00458 has not reached among them): a word never costs the page. The one read every server page and Ask share.
 */
export async function getAppointmentWord(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
): Promise<AppointmentWord> {
  const r = await findAppointmentWord(ctx.supabase, tenantId);
  const word = r.error ? null : recordOrNull(r.data)?.appointment_word;
  return appointmentWordOf(typeof word === "string" ? word : null);
}

/** Whether a deal was ever recorded here (packages/db getDealOnFile), under the member's own RLS. */
export const hasDealsRead = (ctx: Pick<RouteContext, "supabase">, tenantId: TenantId): Promise<boolean> =>
  getDealOnFile(ctx.supabase, tenantId);

/**
 * The workspace's pace (0008, amended): its yeses decided in the last year, under the member's own RLS, and their
 * median wait by the one rule Reports' median reads (contracts yesWaits, dealPaceFrom). Null where the deals could
 * not be read, which is said in the log: no pace is a week's wait, which costs the pace, never the page. The two
 * People routes share it.
 */
export async function findDealPace(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  now = new Date(),
): Promise<DealPaceDto | null> {
  // The one typed read of them, which the edge's playbook sweep reads too (packages/db listYesesSince).
  try {
    const rows = await listYesesSince(ctx.supabase, tenantId, new Date(now.getTime() - PACE_WINDOW_DAYS * DAY_MS));
    return dealPaceFrom(rows, now.getTime());
  } catch (e) {
    log.error("deal_pace_read_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** The columns a deal is read with (contracts DealDto) are packages/db's, where its reads are; the person reader reads them here. */
export { DEAL_DTO_COLUMNS } from "@chanlytics/db/deals";

/**
 * The deal a person's People row shows now, by people_list's own rule (contracts pickCurrentDeal: an open one first,
 * then the newest). The deal door answers with it, so a page moves the row to it as the door answers (0008), and a
 * person with two open deals keeps showing the one their row shows. Null where it could not be read: the People
 * re-read behind the write says it then, and a write that landed never answers a failure for it.
 */
export async function findCurrentDeal(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  contactId: ContactId,
): Promise<DealDto | null> {
  try {
    const r = await listDealRowsOf(ctx.supabase, tenantId, contactId);
    if (r.error || !r.data) return null;
    return pickCurrentDeal(r.data);
  } catch {
    return null;
  }
}

/** Nothing to draw: no deal was ever recorded. A new object each time, since its lists are its own. */
const none = (): DealReportDto => ({
  any: false,
  sent: 0,
  won: 0,
  lost: 0,
  waiting: 0,
  clients: 0,
  monthly_cents: 0,
  median_days_to_yes: null,
  open: { count: 0, amounts: [] },
  sources: [],
  reasons: [],
});

/** How many of each key, most first; a tie keeps the order its set is written in. A null is not a key. */
function countByKey<K extends string>(keys: readonly (K | null)[], order: readonly K[]): { key: K; count: number }[] {
  const n = new Map<K, number>();
  for (const k of keys) if (k !== null) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
}

const CAME_FROM_ORDER = keysOf(PERSON_CAME_FROM_WORDS);

/**
 * Reports' Deals numbers (0004, 0008), from one read of the workspace's deals under the member's own RLS. One cohort
 * -- the proposals sent in the period and whatever became of them since -- with how long its yeses took, where its new
 * clients came from and why its passes passed; and beside it the stock, whenever it began: the clients now with their
 * monthly total, and every proposal still open with what it carries. Where a new client came from is their person's
 * came_from in `people`, the People rows the route already read for the booking line, so People is not read twice.
 * Drawn where a deal was ever recorded (every workspace has deals, 0008 amended 18 Oct 2026). Null where the table
 * cannot be read (an older database): the section is not drawn and the report stands. Takes only the client it reads
 * with, as the calendar's readers do.
 */
export async function readDealReport(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  days: number,
  people: readonly Pick<PersonRowDto, "id" | "came_from">[],
  now = new Date(),
  // The instants of a window that ended before today (Reports' days a member picked), its first and the one after its
  // last; null for a period that ends today, which is the `days` up to `now`.
  span: { since: number; until: number } | null = null,
): Promise<DealReportDto | null> {
  // Every page of them (readAllRows), by id: PostgREST answers a thousand rows whatever a select asks for, so past a
  // thousand deals every figure here counted an arbitrary thousand.
  const data = await readAllRows("deals", (from, to) => pageDealReport(ctx.supabase, tenantId, from, to)).catch(
    () => null,
  );
  if (!data) return null;
  if (!data.length) return none();
  const since = span?.since ?? now.getTime() - days * DAY_MS;
  const until = span?.until ?? Infinity;
  // The cohort is by when the proposal went, whatever became of it since; an ended engagement was won in its cohort.
  const cohort = data.filter((d) => {
    const at = Date.parse(d.proposed_at);
    return at >= since && at < until;
  });
  const yes = cohort.filter(isYes);
  const passed = cohort.filter((d) => d.stage === "lost");
  const running = data.filter((d) => d.stage === "won");
  const open = data.filter((d) => d.stage === "proposed");
  // Month amounts as they are, a year over twelve, once excluded: what the clients now bring in a month.
  const monthly = running.reduce((s, d) => {
    if (d.amount_cents === null) return s;
    if (d.per === "month") return s + d.amount_cents;
    if (d.per === "year") return s + Math.round(d.amount_cents / 12);
    return s;
  }, 0);
  // Whole days from the proposal to the yes, and their median, by the one rule the workspace's pace reads (yesWaits):
  // a client entered after the fact, the yes back-dated or put on file with its proposal, is not a wait.
  const median = medianWait(yesWaits(yes));
  const cameFrom = new Map<string, PersonCameFrom | null>(people.map((p) => [p.id, cameFromOf(p)?.key ?? null]));
  return {
    any: true,
    sent: cohort.length,
    won: yes.length,
    lost: passed.length,
    waiting: cohort.filter((d) => d.stage === "proposed").length,
    clients: running.length,
    monthly_cents: monthly,
    median_days_to_yes: median,
    open: {
      count: open.length,
      amounts: open.flatMap((d) =>
        d.amount_cents === null ? [] : [{ amount_cents: d.amount_cents, per: d.per, currency: d.currency }],
      ),
    },
    sources: countByKey(
      yes.map((d) => cameFrom.get(d.contact_id) ?? null),
      CAME_FROM_ORDER,
    ).map(({ key, count }) => ({ came_from: key, count })),
    reasons: countByKey(
      passed.map((d) => (isDealLostReason(d.lost_reason) ? d.lost_reason : null)),
      DEAL_LOST_REASONS,
    ).map(({ key, count }) => ({ reason: key, count })),
  };
}

/**
 * Record a deal on a person's word, with its line in the ledger (00357 record_deal). The SQL door decides and writes
 * the stage's event, and the decision is written in the same transaction on the member's own session, so a deal is
 * never moved with no line saying who moved it, and a move answered with an error did not happen. The deal as
 * recorded, the stage it came from and the decision's id; a move the door refuses is said in its own sentence.
 */
export async function recordDealMove(
  ctx: Pick<RouteContext, "supabase" | "via" | "undoOf">,
  contactId: ContactId,
  stage: string,
  move: DealMove,
): Promise<{ deal: DealDto; from: string | null; decision_id: string }> {
  const { data, error } = await recordDeal(ctx.supabase, {
    contactId,
    stage,
    move,
    via: ctx.via ?? null,
    undoOf: ctx.undoOf ?? null,
  });
  if (error) throw dbRefusal(error);
  const item = readAnswer("record_deal", DealAnswer, data ?? {});
  if (item.error || !item.deal) {
    // A key the sentences lack, or no deal and no error: an answer this verb does not know. Logged raw before the
    // generic sentence, so a new refusal is found in the log rather than by its blandness.
    if (!(item.error && DEAL_REFUSALS[item.error])) {
      log.error("deal_door_unknown_answer", { contact: contactId, error: item.error ?? null, deal: !!item.deal });
    }
    throw new AppError("validation", DEAL_REFUSALS[item.error ?? ""] ?? "Could not record this.");
  }
  if (typeof item.decision_id !== "string") throw new Error("record_deal: the door answered without its decision");
  return { deal: item.deal, from: item.from ?? null, decision_id: item.decision_id };
}
