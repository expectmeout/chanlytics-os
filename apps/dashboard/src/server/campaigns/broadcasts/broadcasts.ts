/** Broadcasts: broadcasts. */

import "server-only";
import {
  AppError,
  answersToRuns,
  firstNameOf,
  isReachOutRun,
  RUN_GOING_STATES,
  personName,
  runCountsOf,
  type AnswerEvent,
  type AnswerSend,
  type BroadcastCounts,
  type BroadcastDetailDto,
  type BroadcastDto,
  type BroadcastRecipientDto,
  type PersonCampaignDto,
  type RecipientState,
  type RunAnswer,
  recordOrNull,
} from "@chanlytics/contracts";
import { readAllRows } from "@chanlytics/db/shared";
import { runCounts } from "@chanlytics/db/reports";
import {
  findRunRow,
  listConsentChangesSince,
  listPlaybookRunRows,
  listRecentRunRows,
  listRunNames,
  listRunRowsByIds,
  listWaitingRuns,
  pagePersonSends,
  pageRunPeople,
  runWaitingCounts,
} from "@chanlytics/db/campaigns";
import { log } from "@/server/shared/log";
import { findReachOutRun } from "@/server/campaigns/reach-outs/reach-outs";
import type { RouteContext } from "@/server/shared/with-route";
import {
  IN_CHUNK,
  RECENT,
  answeredAfter,
  countRecipients,
  emptyCounts,
  repliedThreads,
  statusAt,
  toDto,
  type BroadcastRow,
  type RecipientRow,
  waitingThreads,
  withCounts,
} from "./replied";
import type { TenantId, ContactId } from "@chanlytics/contracts";

/**
 * A run's sheet's numbers: run_counts' (00374), the same a list of runs says of it; on a database before it, for one
 * release, what the sheet counted of its own people (`own`). `counting` is that call, started beside the sheet's people
 * (getBroadcast), so the sheet pays no round trip at its end for it.
 */
async function sheetCountsOf(
  counting: ReturnType<typeof runCounts>,
  id: string,
  own: BroadcastCounts,
): Promise<BroadcastCounts> {
  const read = await counting;
  if (read === "missing") return own;
  const counted = runCountsOf(read);
  if (!counted) throw new Error("run_counts answered a shape it does not know");
  return counted[id] ?? emptyCounts();
}

/**
 * The runs still waiting for a word that are older than the newest fifty (packages/db listWaitingRuns, the one rule the
 * server's Today and Ask count by: waiting for approval, or a going reach-out run whose emails are held or handed to its
 * owner), as Sent's rows. Null where they could not be read, said in the log: the list stands without them.
 */
async function waitingBeyond(ctx: RouteContext, tenantId: TenantId, shown: readonly BroadcastRow[]) {
  try {
    const seen = new Set(shown.map((r) => r.id));
    const ids = (await listWaitingRuns(ctx.supabase, tenantId)).map((r) => r.id).filter((id) => !seen.has(id));
    if (!ids.length) return [];
    const { data, error } = await listRunRowsByIds(ctx.supabase, tenantId, ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as BroadcastRow[];
  } catch (e) {
    log.error("broadcasts_waiting_read_failed", {
      tenant_id: tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * The recent fifty, newest first: the Broadcasts page's history -- and whether
 * older broadcasts exist beyond it. The page summed these fifty under headings
 * that read as everything; one row past the fifty is how it knows to say "latest".
 *
 * And after them every older run still waiting for a word (waitingBeyond), so what the badge, the Inbox's run rows,
 * Today's queue and the bell judge waiting is every run that waits, as the server's Today and Ask count them: a reach-out
 * run holding emails a week on fell out of the fifty, and out of all of them, while Ask still named it (the Inbox's run
 * review, 19 Oct 2026). Older than every one of the fifty, they keep the list newest first; `more` still says whether
 * older runs exist at all.
 */
export async function listBroadcasts(
  ctx: RouteContext,
  tenantId: TenantId,
): Promise<{ broadcasts: BroadcastDto[]; more: boolean }> {
  const { data: rows, error } = await listRecentRunRows(ctx.supabase, tenantId, RECENT + 1);
  if (error) throw new Error(error.message);
  const all = (rows ?? []) as BroadcastRow[];
  const recent = all.slice(0, RECENT);
  const beyond = all.length > RECENT ? await waitingBeyond(ctx, tenantId, recent) : [];
  const counted = await withCounts(ctx, tenantId, [...recent, ...(beyond ?? [])]);
  return { broadcasts: await withHeld(ctx, tenantId, counted), more: all.length > RECENT };
}

/**
 * A going reach-out run says how many of its emails the check holds for its owner's say (`held`), and how many are handed
 * to its owner to send from their inbox (`drafted`, 00429): the run's row, Today's (contracts runWaitsOnYou), the bell's
 * held notice (contracts notice-closes.ts, which reads it as read once none is held) and Campaigns' chain row read them.
 * One waiting for an OK says them too: its row's Decide (contracts batchHeldEmails) offers the emails an OK does not send.
 * Counts that cannot be read leave both absent, logged, and the rows stand (the wiring's second audit,
 * W-campaign-run-template-reachout-4).
 */
async function withHeld(ctx: RouteContext, tenantId: TenantId, rows: BroadcastDto[]): Promise<BroadcastDto[]> {
  const counted: readonly string[] = [...RUN_GOING_STATES, "pending_approval"];
  const going = rows.filter((b) => isReachOutRun(b.audience) && counted.includes(b.state));
  if (!going.length) return rows;
  try {
    const runIds = going.map((b) => b.id);
    const waiting = await runWaitingCounts(ctx.supabase, { tenantId, runIds });
    // Every run counted says its counts, a zero too: one with none waiting reads 0, never absent.
    return rows.map((b) => {
      if (!runIds.includes(b.id)) return b;
      const w = waiting.get(b.id);
      return { ...b, held: w?.held ?? 0, drafted: w?.drafted ?? 0 };
    });
  } catch (e) {
    log.error("broadcasts_held_read_failed", {
      tenant_id: tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return rows;
  }
}

/**
 * Every run a playbook ever made, newest first, uncapped: a card's totals
 * used to be summed over the recent fifty broadcasts of ANY kind, so a
 * playbook that had run daily for two months was counted from whatever was
 * left of it in that window.
 */
export async function listRuns(ctx: RouteContext, tenantId: TenantId): Promise<BroadcastDto[]> {
  const { data: rows, error } = await listPlaybookRunRows(ctx.supabase, tenantId);
  if (error) throw new Error(error.message);
  return withCounts(ctx, tenantId, (rows ?? []) as BroadcastRow[]);
}

/** A person's answer to the run, as the sheet draws it: which, about what, and when. */
type ConsentAnswer = Pick<RunAnswer, "consent" | "purpose" | "at">;

/** The sheet's people the run reached, as the rule reads a send: the channel, the email and message it names, whether they stand. */
function sendsOf(rows: RecipientRow[]): AnswerSend[] {
  const out: AnswerSend[] = [];
  for (const row of rows) {
    if (row.state !== "sent" || !row.sent_at) continue;
    out.push({
      runId: row.broadcast_id,
      contactId: row.contact_id,
      sentAt: row.sent_at,
      byEmail: row.channel === "email",
      live: !row.contacts?.erased_at && !row.contacts?.merged_into_contact_id,
      messageId: row.message_id ?? null,
      messageExternalId: row.messages?.external_id ?? null,
    });
  }
  return out;
}

/** These people's consent changes after `since`, two hundred people at a time so the URL stays short. */
async function consentEventsOf(
  ctx: RouteContext,
  tenantId: TenantId,
  contactIds: string[],
  since: string,
): Promise<AnswerEvent[]> {
  const out: AnswerEvent[] = [];
  for (let index = 0; index < contactIds.length; index += IN_CHUNK) {
    const { data, error } = await listConsentChangesSince(
      ctx.supabase,
      tenantId,
      contactIds.slice(index, index + IN_CHUNK),
      since,
    );
    if (error) throw new Error(error.message);
    for (const e of data ?? []) {
      if (e.subject_id) out.push({ id: e.id, contactId: e.subject_id, at: e.created_at, data: e.data });
    }
  }
  return out;
}

/**
 * What each person the run reached said about hearing from the business because
 * of it: the consent ledger both doors write (00013) -- a yes at the desk or in
 * their own words, a STOP, an unsubscribe -- and which of it is this run's answer
 * is one rule, contracts answersToRuns (campaigns/broadcasts/run-answers.ts), which Reports
 * › Campaigns and the Campaigns home count by too (00403). It says what counts (a
 * merge's restated consent does not), who answers (a person who stands, not one
 * erased or merged away), and whose an event is (the send an unsubscribe or a
 * carrier's stop names, however late; else the reply window after the send); this
 * reads the sheet's people and their events and keeps the run's own rows.
 * Someone the run never reached did not answer it.
 */
async function consentAfter(
  ctx: RouteContext,
  tenantId: TenantId,
  rows: RecipientRow[],
  runId: string,
): Promise<Map<string, ConsentAnswer>> {
  const out = new Map<string, ConsentAnswer>();
  const sends = sendsOf(rows);
  const sentMs = sends.map((s) => Date.parse(s.sentAt)).filter(Number.isFinite);
  if (sentMs.length === 0) return out;
  // Someone who does not stand answers nothing (the rule), so their events are not read.
  const people = [...new Set(sends.filter((s) => s.live).map((s) => s.contactId))];
  const since = new Date(Math.min(...sentMs)).toISOString();
  for (const a of answersToRuns(sends, await consentEventsOf(ctx, tenantId, people, since))) {
    if (a.runId === runId) out.set(a.contactId, { consent: a.consent, purpose: a.purpose, at: a.at });
  }
  return out;
}

/** What a person on a run is called: their name, else the number or the address the run went to. */
function nameOf(r: RecipientRow): string {
  return personName({
    display_name: r.contacts?.display_name ?? null,
    wa_profile_name: r.contacts?.wa_profile_name ?? null,
    phone_e164: r.contacts?.phone_e164 ?? null,
    email: r.contacts?.email ?? null,
  });
}

/** The first name a run may greet them by: none for a stand-in, or a name the engine set and nobody settled (0052). */
function firstNameOfRecipient(r: RecipientRow): string | null {
  const c = r.contacts;
  return firstNameOf(c?.display_name, c?.wa_profile_name, { source: c?.name_source, settled: !!c?.name_settled_at });
}

/**
 * Every person on a run, a page at a time, each with the channel the send picked for them (00298; every send has its
 * column since 00440 made the one table of sends).
 */
async function recipientsOf(ctx: RouteContext, tenantId: TenantId, id: string): Promise<RecipientRow[]> {
  // The person is the tiebreak the pager needs (the key is broadcast_id, contact_id).
  return readAllRows("broadcast recipients", (from, to) =>
    pageRunPeople(ctx.supabase, tenantId, id, from, to),
  ) as Promise<RecipientRow[]>;
}

/** One broadcast and every person on it, in the words of what happened to them -- and what came back from each. */
export async function getBroadcast(ctx: RouteContext, tenantId: TenantId, id: string): Promise<BroadcastDetailDto> {
  const { data: row, error } = await findRunRow(ctx.supabase, tenantId, id);
  if (error) throw new Error(error.message);
  if (!row) throw new AppError("not_found", "Run not found.", 404);

  // Its numbers as the database counts them go out WITH its people, not after every read below; read where the sheet
  // says them (sheetCountsOf). The catch is for a sheet that fails first and never reads them: one that does still throws.
  const counting = runCounts(ctx.supabase, tenantId, [id]);
  counting.catch(() => {});
  // Every person on it, a page at a time: an unbounded read answers with PostgREST's first 1,000, and a broadcast may
  // hold BROADCAST_MAX_RECIPIENTS (2,000), so a large run's counts and rows stopped at the thousandth.
  const rows = await recipientsOf(ctx, tenantId, id);

  const { counts, threadsOf } = countRecipients(rows, [id]);
  const threads = threadsOf.get(id);
  const words = new Map<string, string | null>();
  const replied = threads ? await repliedThreads(ctx, tenantId, threads, words) : new Map<string, string>();
  // The sheet's own count of its people, which a database before 00374 is read by (sheetCountsOf).
  const own = { ...(counts.get(id) ?? emptyCounts()), replied: replied.size };
  const answered = await consentAfter(ctx, tenantId, rows, id);
  const answers = await answeredAfter(ctx, tenantId, replied);
  const waiting = replied.size > 0 ? await waitingThreads(ctx, tenantId, [...replied.keys()]) : new Set<string>();

  const people: BroadcastRecipientDto[] = rows.map((row) => ({
    contact_id: row.contact_id,
    name: nameOf(row),
    channel: row.channel,
    first_name: firstNameOfRecipient(row),
    phone: row.contacts?.phone_e164 ?? null,
    state: row.state as RecipientState,
    reason: row.reason,
    sent_at: row.sent_at,
    message_status: row.messages?.status ?? null,
    conversation_id: row.messages?.conversation_id ?? null,
    replied: !!(row.messages?.conversation_id && replied.has(row.messages.conversation_id)),
    delivered_at: statusAt(row.messages?.meta, "delivered"),
    read_at: statusAt(row.messages?.meta, "read"),
    replied_at: row.messages?.conversation_id ? (replied.get(row.messages.conversation_id) ?? null) : null,
    consent_after: answered.get(row.contact_id)?.consent ?? null,
    consent_at: answered.get(row.contact_id)?.at ?? null,
    consent_purpose: answered.get(row.contact_id)?.purpose ?? null,
    reply_words: row.messages?.conversation_id ? (words.get(row.messages.conversation_id) ?? null) : null,
    answered_by: row.messages?.conversation_id ? (answers.get(row.messages.conversation_id)?.by ?? null) : null,
    answered_at: row.messages?.conversation_id ? (answers.get(row.messages.conversation_id)?.at ?? null) : null,
    waiting_on_you: !!(row.messages?.conversation_id && waiting.has(row.messages.conversation_id)),
  }));
  return {
    broadcast: toDto(row as BroadcastRow, await sheetCountsOf(counting, id, own)),
    recipients: people,
    reach_out: await findReachOutRun(ctx, tenantId, row),
  };
}

/** How many of a person's runs their page lists: the newest. */
export const PERSON_RUNS = 20;

/**
 * The runs that named one person, newest first, the newest PERSON_RUNS of them: a playbook's run named for its
 * playbook, a broadcast for itself, each with what the send job recorded for them. Every recipient row is read, since
 * a row carries no time of its own and the newest is known only once each run's time is: a person is on few runs.
 */
export async function listPersonRuns(
  ctx: RouteContext,
  tenantId: TenantId,
  contactId: ContactId,
): Promise<PersonCampaignDto[]> {
  const read = await readAllRows<{
    broadcast_id: string | null;
    state: string;
    reason: string | null;
    sent_at: string | null;
    message_id: string | null;
    channel: string | null;
  }>("broadcast_recipients", (from, to) => pagePersonSends(ctx.supabase, tenantId, contactId, from, to));
  // A customer's send always names its batch (00540's check).
  const rows = read.flatMap((r) => (r.broadcast_id ? [{ ...r, broadcast_id: r.broadcast_id }] : []));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.broadcast_id);
  const runs = new Map<
    string,
    { name: string; playbook_id: string | null; audience: unknown; scheduled_for: string | null; created_at: string }
  >();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await listRunNames(ctx.supabase, tenantId, ids.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    for (const b of data ?? []) runs.set(b.id, b);
  }
  const out: (PersonCampaignDto & { at: string })[] = [];
  for (const row of rows) {
    const run = runs.get(row.broadcast_id);
    if (!run) continue;
    const label = recordOrNull(run.audience)?.label;
    out.push({
      broadcast_id: row.broadcast_id,
      name: run.name,
      playbook_id: run.playbook_id,
      // The name a run's messages carry (core messages/broadcast/batch.ts): the playbook's, as the run was drawn.
      playbook_name: run.playbook_id ? (typeof label === "string" && label ? label : run.name) : null,
      // One of RECIPIENT_STATES: the column's CHECK.
      state: row.state as RecipientState,
      reason: row.reason,
      sent_at: row.sent_at,
      scheduled_for: run.scheduled_for,
      message_id: row.message_id,
      channel: row.channel,
      at: row.sent_at ?? run.scheduled_for ?? run.created_at,
    });
  }
  return out
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, PERSON_RUNS)
    .map(({ at: _at, ...c }) => c);
}
