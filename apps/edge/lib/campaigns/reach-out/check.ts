/**
 * The check before each send (Reach out, Part 4; spec §4.4; F2–F6, R1–R7, R12), the work of its own clock
 * (api/cron/reach-out-check.ts). Every planned send not yet checked, in a run that goes ahead or waits for its owner,
 * is checked once before the claim may take it, as soon as it is planned and whatever its day (decision 0098), so its line
 * can be read and changed before it goes. A lead's own words at its step (decision 0096) are its words here: with
 * no {{opening}} in them nothing is asked of the model, and what holds a send for its business still does.
 * How one send is checked (the opening written and read, the code holds,
 * a business hold its owner included past never made again while a word hold's Include covers one email, R7) is
 * check-one.ts's.
 *
 * What passes is marked checked, with the words it was checked against (checked_words, R5), and stays planned: the claim
 * takes it when it is due. What is held waits for its owner. A model that fails (it throws, runs past its deadline,
 * says nothing, or says it in no shape) is tried again later, backing off, and only an hour of failures holds the send
 * as check_unavailable (R4); such a hold is put back to be checked an hour on. One not due soon has days to spare, and no
 * model's bad hour holds it (failedCheck).
 *
 * What the model costs is bounded where it is spent (R2, R12): a few sends of each workspace a tick, only a workspace
 * that may spend and has room in its month, at most REACH_OUT_CHECKS_PER_DAY attempts a UTC day (00197
 * reach_out_check_spend, taken before each attempt that asks the model, so no reset gives one back), the last of them kept
 * for what is due soon (REACH_OUT_CHECKS_AHEAD_PER_DAY), and never a call
 * after the tick's budget. The sends are leased (00197 reach_out_unchecked), and a check writes only onto the send and the words'
 * version it read (R3, R5), so two ticks never pay for one send and a check never stamps words that changed under it.
 *
 * This file is the tick: checkSends drives one send's check (check-one.ts: the writer, the reader, the one rewrite, the
 * verdict, and the model and budget it keeps to, all re-exported here): the holds the model could not answer put back
 * an hour on, the sends leased to this tick (a few of each workspace, round-robin), each workspace's gates asked
 * before any call (billing, the month's room, the day's attempts), the checks run a few sends at once until the tick's
 * budget, and last the runs that got their first hold have their owner told (R20, held-notice.ts).
 *
 * The rules are contracts' (reach-out/words/opening.ts, reach-out/opening.ts). This file asks the model and writes the answers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OPENING_CHARS_MAX,
  REACH_OUT_CHECKS_AHEAD_PER_DAY,
  REACH_OUT_CHECKS_PER_DAY,
  REACH_OUT_MONTH_EMAILS,
  openingAskedOf,
  reachOutCountryOf,
  type RewriteStep,
  type WrittenOpening,
} from "@chanlytics/contracts";
import {
  findEmailWords,
  leadStepKey,
  getLeadWordsOfLeads,
  readMonthSent,
  recordCheck,
  releaseUnavailableHolds,
  takeCheckAttempt,
  listUncheckedSends,
  mayWorkspaceSpend,
  type ReachOutSendRow,
  type UncheckedSend,
} from "@chanlytics/db/campaigns";
import { findLeadCountries } from "@chanlytics/db/leads";
import type { Database } from "@chanlytics/db/types";
import {
  askReachOutModel,
  checkBudget,
  checkInputOf,
  checkOne,
  checkWorkspaceOf,
  siteReaderOf,
  type AskModel,
  type CheckBudget,
  type CheckInput,
  type CheckWorkspace,
  type Tokens,
} from "./check-one.js";
import { checkedWordsOf } from "@chanlytics/channels/email";
import { notifyHeldRuns, type HeldNoticeSend } from "./held-notice.js";
import type { LogEvent, Logger } from "../../shared/log.js";
import { once } from "./once.js";

export {
  CHECK_CALLS_UNTIL_MS,
  CHECK_CALL_MS,
  CHECK_DONE_BY_MS,
  askReachOutModel,
  checkBudget,
  checkInputOf,
  checkOne,
  checkWorkspaceOf,
  siteReaderOf,
  type AskModel,
  type CheckBudget,
  type CheckWorkspace,
} from "./check-one.js";

type Db = SupabaseClient<Database>;

/** How many sends one tick reads to check, and how many of one workspace (R2): round-robin, so none waits on another. */
export const CHECK_PER_TICK = 40;
export const CHECK_PER_WORKSPACE_PER_TICK = 20;
/**
 * How near its time a send is due soon: taken before those further off, and the only kind a model's bad hour holds. A run
 * waiting for its owner is due soon whatever its day, since they may be reading it now. No send waits for this (decision 0098).
 */
export const CHECK_AHEAD_MS = 2 * 3_600_000;
/** Sends asked about at once. */
const CHECK_AT_ONCE = 4;

/** How long a send's tries may fail before it is held check_unavailable for its owner (R4). */
export const CHECK_GIVE_UP_MS = 60 * 60_000;
/** A failed try waits this long before the next, by the try it was: 1, 2, 4, 8, then 15 minutes (R4). */
export const CHECK_BACKOFF_MINUTES = [1, 2, 4, 8, 15] as const;
/** A workspace that may not spend, or has no room, is asked again this much later (R2). */
export const CHECK_GATE_WAIT_MS = 3_600_000;
/** The most of what a site said a send keeps (00505 sequence_sends_website_says_shape). */
const WEBSITE_SAYS_KEPT_MAX = 800;
/** A check_unavailable hold with no rule broken goes back to be checked this long after it was held (R4). */
export const CHECK_RELEASE_AFTER_MS = 3_600_000;

/**
 * What a written opening stores, within the columns' bounds (00197), or null when it does not fit them. checkOpening
 * refuses an opening past OPENING_CHARS_MAX, so this is the last guard, never a pass: a sendable opening that cannot be
 * stored is a failed check, and a held one is kept without its words.
 */
function stored(o: WrittenOpening | null): Pick<ReachOutSendRow, "opening" | "angle" | "facts_used"> | null {
  if (!o) return { opening: null, angle: null, facts_used: [] };
  const opening = o.opening.trim();
  const angle = o.angle.trim();
  if (!opening || opening.length > OPENING_CHARS_MAX || !angle || angle.length > 40 || o.facts_used.length > 12)
    return null;
  return { opening, angle, facts_used: o.facts_used };
}

/** How much of the workspace's day a send may spend: all of it where it is due soon or a person is waiting (decision 0098). */
const dayShareOf = (u: UncheckedSend, pressed: boolean): number =>
  pressed || u.due_soon ? REACH_OUT_CHECKS_PER_DAY : REACH_OUT_CHECKS_AHEAD_PER_DAY;

/** How long a send waits after its nth failed try (R4). */
export function backoffMs(tries: number): number {
  const i = Math.min(Math.max(tries, 1), CHECK_BACKOFF_MINUTES.length) - 1;
  const minutes = CHECK_BACKOFF_MINUTES[i];
  if (minutes === undefined) throw new RangeError(`no backoff after ${tries} tries`);
  return minutes * 60_000;
}

export interface CheckCounts {
  /** Sends leased this tick. */
  read: number;
  checked: number;
  held: number;
  /** Never written to: the business is in a country whose law asks consent first (decision 0056, 9). */
  skipped: number;
  rewritten: number;
  /** A model failed: tried again later, backing off. */
  failed: number;
  /** An hour of failures: held check_unavailable for its owner. */
  gave_up: number;
  /** Handed back untouched: the tick's budget ran out. */
  late: number;
  /** Handed back an hour on: its workspace may not spend, has no room this month, or checked its day's share. */
  gated: number;
  /** check_unavailable holds put back to be checked. */
  released: number;
  /** Runs not waiting on their owner that got their first hold, their owner told (R20). */
  noticed: number;
  errors: number;
  calls: number;
  calls_failed: number;
  tokens: Tokens;
}

/**
 * A check that failed: asked again after its backoff, or, an hour of tries on, held for its owner (R4). One not due soon is
 * only asked again (decision 0098): no model's bad hour holds an email due next week, so its hour starts once it is due
 * soon, and past the last backoff it is asked hourly, so one that never answers does not spend the day on itself.
 */
function failedCheck(reachOutSend: ReachOutSendRow, now: Date, at: string, dueSoon: boolean) {
  const tries = Math.min((reachOutSend.check_tries ?? 0) + 1, 100);
  if (!dueSoon) {
    const wait = tries > CHECK_BACKOFF_MINUTES.length ? CHECK_GATE_WAIT_MS : backoffMs(tries);
    const after = new Date(now.getTime() + wait).toISOString();
    return { gaveUp: false, tries, patch: { check_tries: tries, check_after: after } };
  }
  const first = reachOutSend.check_first_at ?? at;
  if (now.getTime() - Date.parse(first) < CHECK_GIVE_UP_MS) {
    const after = new Date(now.getTime() + backoffMs(tries)).toISOString();
    return { gaveUp: false, tries, patch: { check_tries: tries, check_first_at: first, check_after: after } };
  }
  const held = { state: "held", reason: "check_unavailable", hold_detail: null, checked_at: at } as const;
  return { gaveUp: true, tries, patch: { ...held, check_tries: tries, check_first_at: first } };
}

/**
 * A leased send's check input (checkInputOf), with what its business's website says when the writer is asked: what the
 * send kept from the last read (00505), else read by the platform's page reader (siteReaderOf, 30 Oct 2026), the
 * reading said as a step since only a page read anew takes time. `onStep` hears each step the check takes.
 */
function sendInputOf(
  uncheckedSend: UncheckedSend,
  words: { subject: string | null; body: string },
  ws: CheckWorkspace,
  country: string | null,
  onStep?: (step: RewriteStep) => void,
): CheckInput {
  const kept = uncheckedSend.send.website_says?.trim() || null;
  const read = siteReaderOf(uncheckedSend.record.website_host);
  const site = kept
    ? () => Promise.resolve(kept)
    : read
      ? async () => {
          onStep?.("reading");
          return read();
        }
      : undefined;
  return {
    ...checkInputOf(
      uncheckedSend.record,
      words,
      ws.opening,
      uncheckedSend.template_language,
      uncheckedSend.included_for,
      country,
    ),
    site,
    asked: openingAskedOf(uncheckedSend.send.rewrite_asked),
    onStep,
  };
}

/**
 * One tick of the check: the holds to check again, then the sends leased to this tick, each workspace's gates asked
 * before any call, then each send's check, a few at once, until the budget. `ask` is the model (tests give their own).
 * With `sendIds` (a person pressed them: Rewrite the opening, 00505), those sends alone, whatever their day, and nothing
 * the clock does around them (its releases and its notices are the next tick's).
 */
export async function checkSends(params: {
  db: Db;
  now: Date;
  started: number;
  log: Logger;
  tenantId?: string;
  sendIds?: string[];
  /** Hears each step a send's check takes, as it takes it (00505: a pressed rewrite says them). */
  onStep?: (sendId: string, step: RewriteStep) => void;
  ask?: AskModel;
  budget?: CheckBudget;
  notice?: HeldNoticeSend;
}): Promise<CheckCounts> {
  const { db, now, log } = params;
  const ask = params.ask ?? askReachOutModel;
  const budget = params.budget ?? checkBudget(params.started);
  const at = now.toISOString();
  const out: CheckCounts = {
    read: 0,
    checked: 0,
    held: 0,
    skipped: 0,
    rewritten: 0,
    failed: 0,
    gave_up: 0,
    late: 0,
    gated: 0,
    released: 0,
    noticed: 0,
    errors: 0,
    calls: 0,
    calls_failed: 0,
    tokens: { input: 0, output: 0 },
  };
  const error = (event: LogEvent, fields: Record<string, unknown>, e: unknown) => {
    out.errors += 1;
    log.error(event, { ...fields, error: e instanceof Error ? e.message : String(e) });
  };
  const write = (u: UncheckedSend, patch: Partial<ReachOutSendRow>) =>
    recordCheck(db, { tenantId: u.send.tenant_id, id: u.send.id, gen: u.check_gen, patch });

  const pressed = params.sendIds !== undefined;

  /* the holds the model could not answer, an hour on: checked again (R4) */
  if (!pressed) {
    try {
      out.released = await releaseUnavailableHolds(db, {
        before: new Date(now.getTime() - CHECK_RELEASE_AFTER_MS),
        tenantId: params.tenantId,
      });
    } catch (e) {
      error("reach_out_check_release_failed", {}, e);
    }
  }

  const rows = await listUncheckedSends(db, {
    limit: CHECK_PER_TICK,
    perWorkspace: CHECK_PER_WORKSPACE_PER_TICK,
    aheadMinutes: CHECK_AHEAD_MS / 60_000,
    tenantId: params.tenantId,
    sendIds: params.sendIds,
  });
  out.read = rows.length;

  /* each workspace's gates, before any call (R2, R12); the day's ceiling is taken one attempt at a time, below */
  const byTenant = new Map<string, UncheckedSend[]>();
  for (const u of rows) byTenant.set(u.send.tenant_id, [...(byTenant.get(u.send.tenant_id) ?? []), u]);
  const go: UncheckedSend[] = [];
  const later = { check_after: new Date(now.getTime() + CHECK_GATE_WAIT_MS).toISOString() };
  const gatedSaid = new Set<string>();
  const gate = async (u: UncheckedSend, reason: string) => {
    if (await write(u, later)) out.gated += 1;
    if (!gatedSaid.has(`${u.send.tenant_id}:${reason}`)) {
      gatedSaid.add(`${u.send.tenant_id}:${reason}`);
      log.info("reach_out_check_gated", { tenant_id: u.send.tenant_id, reason: reason });
    }
  };
  for (const [tenantId, sends] of byTenant) {
    let reason: string | null = null;
    try {
      // Both read at once: a pressed rewrite waits on them before its first call (00505).
      const [mays, sent] = await Promise.all([mayWorkspaceSpend(db, tenantId), readMonthSent(db, tenantId, now)]);
      if (!mays) reason = "billing";
      else if (sent >= REACH_OUT_MONTH_EMAILS) reason = "month_spent";
    } catch (e) {
      // Its leases lapse in two minutes, and the next tick asks again.
      error("reach_out_check_gate_failed", { tenant_id: tenantId }, e);
      continue;
    }
    if (reason) for (const u of sends) await gate(u, reason);
    else go.push(...sends);
  }

  /* each lead's country, once (decision 0056, 9): one where the law asks consent first is never asked about */
  const leadIds = go.map((u) => u.send.lead_id);
  const countries = await findLeadCountries(db, leadIds).catch((e: unknown) => {
    // Nothing is checked without them: the leases lapse in two minutes, and the next tick asks again.
    error("reach_out_check_error", { stage: "countries" }, e);
    go.length = 0;
    return new Map<string, string | null>();
  });

  /* the words typed for these leads (decision 0096): nothing is checked against the step's where a lead has its own */
  const ownWords = await getLeadWordsOfLeads(
    db,
    go.map((u) => u.send.lead_id),
  ).catch((e: unknown) => {
    // As the countries: the leases lapse in two minutes, and the next tick asks again.
    error("reach_out_check_error", { stage: "own_words" }, e);
    go.length = 0;
    return new Map<string, { subject: string | null; body: string }>();
  });

  /* each send's check, a few at once */
  const words = new Map<string, Promise<{ subject: string | null; body: string } | null>>();
  const workspaces = new Map<string, Promise<CheckWorkspace>>();
  const one = async (uncheckedSend: UncheckedSend) => {
    const send = uncheckedSend.send;
    try {
      if (budget.late()) {
        if (await write(uncheckedSend, {})) out.late += 1;
        return;
      }
      const country = countries.get(send.lead_id) ?? null;
      if (reachOutCountryOf(country) === "refused") {
        if (
          await write(uncheckedSend, {
            state: "skipped",
            reason: "outreach_country",
            checked_at: at,
            check_after: null,
          })
        )
          out.skipped += 1;
        return;
      }
      const own = send.step_id ? (ownWords.get(leadStepKey(send.step_id, send.lead_id)) ?? null) : null;
      const item =
        own ??
        (await once(words, uncheckedSend.template_id, () =>
          findEmailWords(db, send.tenant_id, uncheckedSend.template_id),
        ));
      // No words to check: marked checked, so the sender holds it as it always has (no_template).
      if (!item) {
        if (await write(uncheckedSend, { checked_at: at, checked_words: null, check_after: null })) out.checked += 1;
        return;
      }
      const ws = await once(workspaces, send.tenant_id, () => checkWorkspaceOf(db, send.tenant_id));
      const input = sendInputOf(
        uncheckedSend,
        item,
        ws,
        country,
        params.onStep && ((step) => params.onStep?.(send.id, step)),
      );
      // One attempt of the workspace's UTC day, taken before the model is asked (a rewrite is the same attempt, a
      // failure spends it): words that name no opening cost nothing and take none.
      const cap = dayShareOf(uncheckedSend, pressed);
      if (input.needsOpening && !(await takeCheckAttempt(db, { tenantId: send.tenant_id, cap, at: now }))) {
        await gate(uncheckedSend, "day_spent");
        return;
      }
      const result = await checkOne(input, ask, budget, { tenantId: send.tenant_id, subjectId: send.id });
      out.calls += result.calls;
      out.tokens = { input: out.tokens.input + result.tokens.input, output: out.tokens.output + result.tokens.output };
      if (result.kind === "late") {
        if (await write(uncheckedSend, {})) out.late += 1;
        return;
      }
      const failed = async (reason: string) => {
        const f = failedCheck(send, now, at, uncheckedSend.due_soon);
        if (!(await write(uncheckedSend, f.patch))) return;
        if (!f.gaveUp) return void (out.failed += 1);
        out.gave_up += 1;
        const { tenant_id, id: send_id, batch_id: broadcast_id } = send;
        log.warn("reach_out_check_held", { tenant_id, send_id, broadcast_id, tries: f.tries, why: reason });
      };
      if (result.kind === "failed") {
        out.calls_failed += 1;
        await failed(result.why);
        return;
      }
      const keep = stored(result.opening);
      // A sendable opening the send cannot store is no pass: tried again, as a model's answer out of shape is.
      if (!keep && !result.hold) {
        await failed("unstorable");
        return;
      }
      // Words of the lead's own that hold no line write none: the one the send has stands, for the step's words coming back.
      const line = own && !input.needsOpening ? {} : (keep ?? { opening: null, angle: null, facts_used: [] });
      const patch: Partial<ReachOutSendRow> = {
        checked_at: at,
        ...line,
        hold_detail: result.detail ? result.detail.slice(0, 120) : null,
        // What the site said, kept for the next time this email's opening is written (00505).
        ...(result.site && result.site !== send.website_says
          ? { website_says: result.site.slice(0, WEBSITE_SAYS_KEPT_MAX) }
          : {}),
        checked_words: checkedWordsOf(item, uncheckedSend.signed_by, ws.bookingLink !== null),
        check_after: null,
        ...(result.hold ? { state: "held", reason: result.hold } : {}),
      };
      if (await write(uncheckedSend, patch)) {
        out.checked += 1;
        if (result.hold) out.held += 1;
        if (result.rewritten) out.rewritten += 1;
      }
    } catch (e) {
      // One send's failure is its own: its lease lapses in two minutes, and a tick after that checks it.
      error("reach_out_check_error", { send_id: send.id, tenant_id: send.tenant_id }, e);
    }
  };
  for (let i = 0; i < go.length; i += CHECK_AT_ONCE) await Promise.all(go.slice(i, i + CHECK_AT_ONCE).map(one));
  if (!pressed) out.noticed = await notifyHeldRuns({ db, now, error, tenantId: params.tenantId, send: params.notice });
  return out;
}
