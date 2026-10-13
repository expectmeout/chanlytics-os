/**
 * The check before each send (Reach out, Part 4; spec §4.4; F2–F6, R1–R7, R12), the work of its own clock
 * (api/cron/reach-out-check.ts). Every planned send not yet checked, in a run that goes ahead or waits for its owner,
 * is checked once before the claim may take it. How one send is checked (the opening written and read, the two code
 * holds, a hold its owner included past never made again, R7) is check-one.ts's.
 *
 * What passes is marked checked, with the words it was checked against (checked_words, R5), and stays planned: the claim
 * takes it when it is due. What is held waits for its owner. A model that fails (it throws, runs past its deadline,
 * says nothing, or says it in no shape) is tried again later, backing off, and only an hour of failures holds the send
 * as check_unavailable (R4); such a hold is put back to be checked an hour on.
 *
 * What the model costs is bounded where it is spent (R2, R12): a few sends of each workspace a tick, only a workspace
 * that may spend and has room in its month, at most REACH_OUT_CHECKS_PER_DAY attempts a UTC day (00197
 * reach_out_check_spend, taken before each attempt that asks the model, so no reset gives one back), and never a call
 * after the tick's budget. The sends are leased (00197 reach_out_unchecked), and a check writes only onto the send and the words'
 * version it read (R3, R5), so two ticks never pay for one send and a check never stamps words that changed under it.
 *
 * This file is the tick: checkSends drives one send's check (check-one.ts: the writer, the reader, the one rewrite, the
 * verdict, and the model and budget it keeps to, all re-exported here): the holds the model could not answer put back
 * an hour on, the sends leased to this tick (a few of each workspace, round-robin), each workspace's gates asked
 * before any call (billing, the month's room, the day's attempts), the checks run a few sends at once until the tick's
 * budget, and last the runs that got their first hold have their owner told (R20, held-notice.ts).
 *
 * The rules are contracts' (reach-out-words.ts, reach-out-opening.ts). This file asks the model and writes the answers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OPENING_CHARS_MAX,
  REACH_OUT_CHECKS_PER_DAY,
  REACH_OUT_MONTH_EMAILS,
  reachOutCountryOf,
  type WrittenOpening,
} from "../packages/contracts.js";
import {
  emailWordsOf,
  leadCountriesOf,
  monthSent,
  recordCheck,
  releaseUnavailableHolds,
  takeCheckAttempt,
  uncheckedSends,
  workspaceMaySpend,
  type Database,
  type ReachOutSendRow,
  type UncheckedSend,
} from "../packages/db.js";
import {
  askReachOutModel,
  checkBudget,
  checkInputOf,
  checkOne,
  checkWorkspaceOf,
  type AskModel,
  type CheckBudget,
  type CheckWorkspace,
  type Tokens,
} from "./check-one.js";
import { checkedWordsOf } from "./request.js";
import { noticeHeldRuns, type HeldNoticeSend } from "./held-notice.js";
import type { LogEvent, Logger } from "../log.js";

export {
  CHECK_CALLS_UNTIL_MS,
  CHECK_CALL_MS,
  CHECK_DONE_BY_MS,
  askReachOutModel,
  checkBudget,
  checkInputOf,
  checkOne,
  checkWorkspaceOf,
  type AskModel,
  type CheckBudget,
  type CheckWorkspace,
} from "./check-one.js";

type Db = SupabaseClient<Database>;

/** How many sends one tick reads to check, and how many of one workspace (R2): round-robin, so none waits on another. */
export const CHECK_PER_TICK = 40;
export const CHECK_PER_WORKSPACE_PER_TICK = 20;
/** How far ahead a send due is checked: a run waiting for its owner is checked whatever its day (R2). */
export const CHECK_AHEAD_MS = 2 * 3_600_000;
/** Sends asked about at once. */
const CHECK_AT_ONCE = 4;

/** How long a send's tries may fail before it is held check_unavailable for its owner (R4). */
export const CHECK_GIVE_UP_MS = 60 * 60_000;
/** A failed try waits this long before the next, by the try it was: 1, 2, 4, 8, then 15 minutes (R4). */
export const CHECK_BACKOFF_MINUTES = [1, 2, 4, 8, 15] as const;
/** A workspace that may not spend, or has no room, is asked again this much later (R2). */
export const CHECK_GATE_WAIT_MS = 3_600_000;
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

/** A check that failed: asked again after its backoff, or, a day of tries on, held for its owner (R4). */
function failedCheck(s: ReachOutSendRow, now: Date, at: string) {
  const tries = Math.min((s.check_tries ?? 0) + 1, 100);
  const first = s.check_first_at ?? at;
  if (now.getTime() - Date.parse(first) < CHECK_GIVE_UP_MS) {
    const after = new Date(now.getTime() + backoffMs(tries)).toISOString();
    return { gaveUp: false, tries, patch: { check_tries: tries, check_first_at: first, check_after: after } };
  }
  const held = { state: "held", reason: "check_unavailable", hold_detail: null, checked_at: at } as const;
  return { gaveUp: true, tries, patch: { ...held, check_tries: tries, check_first_at: first } };
}

/**
 * One tick of the check: the holds to check again, then the sends leased to this tick, each workspace's gates asked
 * before any call, then each send's check, a few at once, until the budget. `ask` is the model (tests give their own).
 */
export async function checkSends(p: {
  db: Db;
  now: Date;
  started: number;
  log: Logger;
  tenantId?: string;
  ask?: AskModel;
  budget?: CheckBudget;
  notice?: HeldNoticeSend;
}): Promise<CheckCounts> {
  const { db, now, log } = p;
  const ask = p.ask ?? askReachOutModel;
  const budget = p.budget ?? checkBudget(p.started);
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

  /* the holds the model could not answer, an hour on: checked again (R4) */
  try {
    out.released = await releaseUnavailableHolds(db, {
      before: new Date(now.getTime() - CHECK_RELEASE_AFTER_MS),
      tenantId: p.tenantId,
    });
  } catch (e) {
    error("reach_out_check_release_failed", {}, e);
  }

  const rows = await uncheckedSends(db, {
    limit: CHECK_PER_TICK,
    perWorkspace: CHECK_PER_WORKSPACE_PER_TICK,
    aheadMinutes: CHECK_AHEAD_MS / 60_000,
    tenantId: p.tenantId,
  });
  out.read = rows.length;

  /* each workspace's gates, before any call (R2, R12); the day's ceiling is taken one attempt at a time, below */
  const byTenant = new Map<string, UncheckedSend[]>();
  for (const u of rows) byTenant.set(u.send.tenant_id, [...(byTenant.get(u.send.tenant_id) ?? []), u]);
  const go: UncheckedSend[] = [];
  const later = { check_after: new Date(now.getTime() + CHECK_GATE_WAIT_MS).toISOString() };
  const gatedSaid = new Set<string>();
  const gate = async (u: UncheckedSend, why: string) => {
    if (await write(u, later)) out.gated += 1;
    if (!gatedSaid.has(`${u.send.tenant_id}:${why}`)) {
      gatedSaid.add(`${u.send.tenant_id}:${why}`);
      log.info("reach_out_check_gated", { tenant_id: u.send.tenant_id, reason: why });
    }
  };
  for (const [tenantId, sends] of byTenant) {
    let why: string | null = null;
    try {
      if (!(await workspaceMaySpend(db, tenantId))) why = "billing";
      else if ((await monthSent(db, tenantId, now)) >= REACH_OUT_MONTH_EMAILS) why = "month_spent";
    } catch (e) {
      // Its leases lapse in two minutes, and the next tick asks again.
      error("reach_out_check_gate_failed", { tenant_id: tenantId }, e);
      continue;
    }
    if (why) for (const u of sends) await gate(u, why);
    else go.push(...sends);
  }

  /* each lead's country, once (decision 0056, 9): one where the law asks consent first is never asked about */
  const countries = await leadCountriesOf(
    db,
    go.map((u) => u.send.lead_id),
  ).catch((e: unknown) => {
    // Nothing is checked without them: the leases lapse in two minutes, and the next tick asks again.
    error("reach_out_check_error", { stage: "countries" }, e);
    go.length = 0;
    return new Map<string, string | null>();
  });

  /* each send's check, a few at once */
  const words = new Map<string, Promise<{ subject: string | null; body: string } | null>>();
  const workspaces = new Map<string, Promise<CheckWorkspace>>();
  const once = <T>(m: Map<string, Promise<T>>, key: string, read: () => Promise<T>): Promise<T> => {
    let v = m.get(key);
    if (!v) {
      v = read();
      v.catch(() => m.delete(key));
      m.set(key, v);
    }
    return v;
  };
  const one = async (u: UncheckedSend) => {
    const s = u.send;
    try {
      if (budget.late()) {
        if (await write(u, {})) out.late += 1;
        return;
      }
      const country = countries.get(s.lead_id) ?? null;
      if (reachOutCountryOf(country) === "refused") {
        if (await write(u, { state: "skipped", reason: "outreach_country", checked_at: at, check_after: null }))
          out.skipped += 1;
        return;
      }
      const w = await once(words, u.template_id, () => emailWordsOf(db, s.tenant_id, u.template_id));
      // No words to check: marked checked, so the sender holds it as it always has (no_template).
      if (!w) {
        if (await write(u, { checked_at: at, checked_words: null, check_after: null })) out.checked += 1;
        return;
      }
      const ws = await once(workspaces, s.tenant_id, () => checkWorkspaceOf(db, s.tenant_id));
      const input = checkInputOf(u.record, w, ws.opening, u.template_language, u.included_for, country);
      // One attempt of the workspace's UTC day, taken before the model is asked (a rewrite is the same attempt, a
      // failure spends it): words that name no opening cost nothing and take none.
      const cap = REACH_OUT_CHECKS_PER_DAY;
      if (input.needsOpening && !(await takeCheckAttempt(db, { tenantId: s.tenant_id, cap, at: now }))) {
        await gate(u, "day_spent");
        return;
      }
      const c = await checkOne(input, ask, budget, { tenantId: s.tenant_id, subjectId: s.id });
      out.calls += c.calls;
      out.tokens.input += c.tokens.input;
      out.tokens.output += c.tokens.output;
      if (c.kind === "late") {
        if (await write(u, {})) out.late += 1;
        return;
      }
      const failed = async (why: string) => {
        const f = failedCheck(s, now, at);
        if (!(await write(u, f.patch))) return;
        if (!f.gaveUp) return void (out.failed += 1);
        out.gave_up += 1;
        const { tenant_id, id: send_id, broadcast_id } = s;
        log.warn("reach_out_check_held", { tenant_id, send_id, broadcast_id, tries: f.tries, why });
      };
      if (c.kind === "failed") {
        out.calls_failed += 1;
        await failed(c.why);
        return;
      }
      const keep = stored(c.opening);
      // A sendable opening the send cannot store is no pass: tried again, as a model's answer out of shape is.
      if (!keep && !c.hold) {
        await failed("unstorable");
        return;
      }
      const patch: Partial<ReachOutSendRow> = {
        checked_at: at,
        ...(keep ?? { opening: null, angle: null, facts_used: [] }),
        hold_detail: c.detail ? c.detail.slice(0, 120) : null,
        checked_words: checkedWordsOf(w, u.signed_by, ws.bookingLink !== null),
        check_after: null,
        ...(c.hold ? { state: "held", reason: c.hold } : {}),
      };
      if (await write(u, patch)) {
        out.checked += 1;
        if (c.hold) out.held += 1;
        if (c.rewritten) out.rewritten += 1;
      }
    } catch (e) {
      // One send's failure is its own: its lease lapses in two minutes, and a tick after that checks it.
      error("reach_out_check_error", { send_id: s.id, tenant_id: s.tenant_id }, e);
    }
  };
  for (let i = 0; i < go.length; i += CHECK_AT_ONCE) await Promise.all(go.slice(i, i + CHECK_AT_ONCE).map(one));
  out.noticed = await noticeHeldRuns({ db, now, error, tenantId: p.tenantId, send: p.notice });
  return out;
}
