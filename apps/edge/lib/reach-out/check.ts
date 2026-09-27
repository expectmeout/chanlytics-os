/**
 * The check before each send (Reach out, Part 4; spec §4.4; F2–F6, R1–R7, R12), the work of its own clock
 * (api/cron/reach-out-check.ts). Every planned send not yet checked, in a run that goes ahead or waits for its owner,
 * is checked once before the claim may take it:
 *
 *   - when its step's words name {{opening}}, the writer writes the opening from the business's record and code reads
 *     it (checkOpening); the reader reads it against the same record; a failed rule asks for one rewrite, told why,
 *     then holds (openingVerdict);
 *   - the two code holds come first: a person in People writes from the business's domain (F6), and the business reads
 *     like a chain (F4). The opening is still written for them, so an owner's Include sends it as it reads;
 *   - a hold its owner already included this send, or its lead in this chain, past is never made again (R7).
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
 * The rules are contracts' (reach-out-words.ts, reach-out-opening.ts). This file asks the model and writes the answers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OPENING_CHARS_MAX,
  OPENING_SCHEMA,
  READING_SCHEMA,
  REACH_OUT_CHECKS_PER_DAY,
  REACH_OUT_MODEL,
  REACH_OUT_MONTH_EMAILS,
  chainOf,
  checkOpening,
  customerDomainOf,
  openingSystemPrompt,
  openingUserContent,
  openingVerdict,
  parseOpening,
  parseReading,
  parseTenantConfig,
  readingSystemPrompt,
  readingUserContent,
  wordsNeedOpening,
  type OpeningRecord,
  type OpeningWorkspace,
  type ReachOutHold,
  type WrittenOpening,
} from "../packages/contracts.js";
import {
  emailWordsOf,
  monthSent,
  recordCheck,
  releaseUnavailableHolds,
  takeCheckAttempt,
  uncheckedSends,
  workspaceAbout,
  workspaceMaySpend,
  workspaceNameAndConfig,
  type Database,
  type ReachOutRecordRow,
  type ReachOutSendRow,
  type UncheckedSend,
} from "../packages/db.js";
import { askJson, type JsonAnswer } from "../model.js";
import { checkedWordsOf } from "./request.js";
import { noticeHeldRuns, type HeldNoticeSend } from "./held-notice.js";
import type { LogEvent, Logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** How many sends one tick reads to check, and how many of one workspace (R2): round-robin, so none waits on another. */
export const CHECK_PER_TICK = 40;
export const CHECK_PER_WORKSPACE_PER_TICK = 20;
/** How far ahead a send due is checked: a run waiting for its owner is checked whatever its day (R2). */
export const CHECK_AHEAD_MS = 2 * 3_600_000;
/** Sends asked about at once. */
const CHECK_AT_ONCE = 4;
/** No call starts after this, from the tick's start (R1): the door has 60 s (vercel.json). */
export const CHECK_CALLS_UNTIL_MS = 40_000;
/** Each call's deadline: this, or what is left before CHECK_DONE_BY_MS, whichever is sooner (R1). */
export const CHECK_CALL_MS = 8_000;
export const CHECK_DONE_BY_MS = 50_000;
/** How long a send's tries may fail before it is held check_unavailable for its owner (R4). */
export const CHECK_GIVE_UP_MS = 60 * 60_000;
/** A failed try waits this long before the next, by the try it was: 1, 2, 4, 8, then 15 minutes (R4). */
export const CHECK_BACKOFF_MINUTES = [1, 2, 4, 8, 15] as const;
/** A workspace that may not spend, or has no room, is asked again this much later (R2). */
export const CHECK_GATE_WAIT_MS = 3_600_000;
/** A check_unavailable hold with no rule broken goes back to be checked this long after it was held (R4). */
export const CHECK_RELEASE_AFTER_MS = 3_600_000;

/**
 * One call: the model's answer in the schema asked, with what it cost; null when there is no model to ask. The signal
 * ends the call at its deadline, and a call that runs past it throws.
 */
export type AskModel = (
  system: string,
  user: string,
  schema: object,
  maxTokens: number,
  signal: AbortSignal,
) => Promise<JsonAnswer | null>;

/** Haiku, through the platform's one JSON-model transport, with no retry of its own: a failure is the check's to count. */
export const askReachOutModel: AskModel = (system, user, schema, maxTokens, signal) =>
  askJson({
    model: REACH_OUT_MODEL,
    system,
    user,
    schema,
    maxTokens,
    plainJsonHint: "Answer with only a JSON object in the shape asked.",
    timeoutMs: CHECK_CALL_MS,
    maxRetries: 0,
    signal,
  });

/** When a caller's calls stop, and each call's deadline. */
export interface CheckBudget {
  /** Asked before every call: past it, no call starts. */
  late(): boolean;
  /** A new call's deadline. */
  signal(): AbortSignal;
}

export function checkBudget(
  started: number,
  limits: { callsUntilMs: number; doneByMs: number } = {
    callsUntilMs: CHECK_CALLS_UNTIL_MS,
    doneByMs: CHECK_DONE_BY_MS,
  },
  now: () => number = Date.now,
): CheckBudget {
  return {
    late: () => now() - started > limits.callsUntilMs,
    signal: () => AbortSignal.timeout(Math.max(1, Math.min(CHECK_CALL_MS, limits.doneByMs - (now() - started)))),
  };
}

export interface CheckInput {
  record: OpeningRecord;
  workspace: OpeningWorkspace;
  words: { subject: string | null; body: string };
  /** The step's language (playbooks.template_language). */
  language: string;
  needsOpening: boolean;
  chain: { by: "site" | "name"; listings: number } | null;
  customerDomain: string | null;
  /** The holds this send's owner included it (or its lead in this chain) past: never made again (R7). */
  included: string[];
}

type Tokens = { input: number; output: number };
export type CheckFailure = "no_answer" | "unparseable" | "timeout" | "error";

export type CheckOutcome =
  | {
      kind: "checked";
      opening: WrittenOpening | null;
      hold: ReachOutHold | null;
      detail: string | null;
      rewritten: boolean;
      tokens: Tokens;
      calls: number;
    }
  /** A call failed: the send stays unchecked, to be tried again. The last call is the one that failed. */
  | { kind: "failed"; why: CheckFailure; tokens: Tokens; calls: number }
  /** The budget ran out before a call: the send is handed back untouched. */
  | { kind: "late"; tokens: Tokens; calls: number };

function timedOut(e: unknown): boolean {
  const name = (e as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError" || /timed? ?out|aborted/i.test(String(e));
}

/** One send's check, over an injectable model. */
export async function checkOne(i: CheckInput, ask: AskModel, budget: CheckBudget): Promise<CheckOutcome> {
  const tokens: Tokens = { input: 0, output: 0 };
  let calls = 0;
  const call = async (
    system: string,
    user: string,
    schema: object,
    maxTokens: number,
  ): Promise<{ answer: unknown } | { failed: CheckFailure } | "late"> => {
    if (budget.late()) return "late";
    calls += 1;
    let a: JsonAnswer | null;
    try {
      a = await ask(system, user, schema, maxTokens, budget.signal());
    } catch (e) {
      return { failed: timedOut(e) ? "timeout" : "error" };
    }
    if (!a) return { failed: "no_answer" };
    tokens.input += a.tokens.input;
    tokens.output += a.tokens.output;
    return { answer: a.answer };
  };
  const failed = (why: CheckFailure): CheckOutcome => ({ kind: "failed", why, tokens, calls });
  const late = (): CheckOutcome => ({ kind: "late", tokens, calls });

  let opening: WrittenOpening | null = null;
  let hold: ReachOutHold | null = null;
  let detail: string | null = null;
  let rewritten = false;
  if (i.needsOpening) {
    let retry: { opening: string; why: string } | undefined;
    for (let round = 0; round < 2; round += 1) {
      const w = await call(
        openingSystemPrompt(),
        openingUserContent({ record: i.record, workspace: i.workspace, words: i.words, retry }),
        OPENING_SCHEMA,
        400,
      );
      if (w === "late") return late();
      if ("failed" in w) return failed(w.failed);
      const o = parseOpening(w.answer);
      if (!o) return failed("unparseable");
      const r = await call(
        readingSystemPrompt(),
        readingUserContent({ record: i.record, opening: o.opening }),
        READING_SCHEMA,
        200,
      );
      if (r === "late") return late();
      if ("failed" in r) return failed(r.failed);
      const reading = parseReading(r.answer);
      if (!reading) return failed("unparseable");
      const v = openingVerdict(checkOpening(o, i.record), reading, i.language);
      opening = o;
      if (v.ok) {
        hold = null;
        detail = null;
        break;
      }
      hold = v.hold;
      detail = v.detail;
      // One rewrite, told why; a second failure holds (F2).
      if (!v.rewrite || round === 1) break;
      retry = { opening: o.opening, why: v.why };
      rewritten = true;
    }
  }
  // Included past it by its owner: the opening goes as it reads (R7).
  if (hold && i.included.includes(hold)) {
    hold = null;
    detail = null;
  }
  // The code holds come first: they are facts about the business, not about the words written for it. One that wins
  // over an opening the reader or code refused keeps no opening: an Include past the code hold then finds none, and the
  // send is checked again (the sender's no_opening), where the opening's own hold is said.
  const code: { hold: ReachOutHold; detail: string } | null =
    i.customerDomain && !i.included.includes("customer_domain")
      ? { hold: "customer_domain", detail: i.customerDomain }
      : i.chain && !i.included.includes("chain")
        ? { hold: "chain", detail: `${i.chain.by}:${i.chain.listings}` }
        : null;
  if (code) {
    if (hold) opening = null;
    hold = code.hold;
    detail = code.detail;
  }
  return { kind: "checked", opening, hold, detail, rewritten, tokens, calls };
}

/** A listing's hours ([{day, hours}], 00144), as words the writer can lean on. */
export function hoursLine(hours: unknown): string | null {
  if (!Array.isArray(hours)) return null;
  const parts = hours
    .map((h) =>
      h && typeof h === "object"
        ? `${String((h as { day?: unknown }).day ?? "").trim()} ${String((h as { hours?: unknown }).hours ?? "").trim()}`.trim()
        : "",
    )
    .filter(Boolean);
  return parts.length > 0 ? parts.join("; ").slice(0, 300) : null;
}

/** The record the writer and the reader are given, from the database's. */
export function openingRecordOf(r: ReachOutRecordRow): OpeningRecord {
  return {
    business_name: r.business_name?.trim() || "",
    category: r.category?.trim() || null,
    city: r.city?.trim() || null,
    region: r.region?.trim() || null,
    rating: r.rating,
    reviews: r.reviews,
    website: r.website_host?.trim() || null,
    hours: hoursLine(r.hours),
    about: r.about?.trim() || null,
    why_it_fits: r.why_it_fits?.trim() || null,
    what_you_asked: r.what_you_asked?.trim() || null,
  };
}

/** The check's input for one business and one step's words. The clock and the preview both build it here. */
export function checkInputOf(
  r: ReachOutRecordRow,
  words: { subject: string | null; body: string },
  workspace: OpeningWorkspace,
  language: string,
  included: string[] = [],
): CheckInput {
  return {
    record: openingRecordOf(r),
    workspace,
    words,
    language,
    needsOpening: wordsNeedOpening(words),
    chain: chainOf({ website: r.website_host, site_listings: r.site_listings, name_listings: r.name_listings }),
    customerDomain: customerDomainOf(r.email, r.email_domain_shared),
    included,
  };
}

/** A workspace as the check and its preview read it: the writer's side of the input, and the words' slots. */
export interface CheckWorkspace {
  opening: OpeningWorkspace;
  businessName: string | null;
  address: string | null;
  bookingLink: string | null;
}

export async function checkWorkspaceOf(db: Db, tenantId: string): Promise<CheckWorkspace> {
  const [w, about] = await Promise.all([workspaceNameAndConfig(db, tenantId), workspaceAbout(db, tenantId)]);
  const brain = parseTenantConfig(w.config)?.brain;
  const name = w.name?.trim() || null;
  return {
    opening: { name: name ?? "", what_we_do: about, tone: brain?.profile?.tone?.trim() || null },
    businessName: name,
    address: brain?.profile?.address?.trim() || null,
    bookingLink: brain?.booking_link?.trim() || null,
  };
}

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
  return CHECK_BACKOFF_MINUTES[i] * 60_000;
}

export interface CheckCounts {
  /** Sends leased this tick. */
  read: number;
  checked: number;
  held: number;
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
      const w = await once(words, u.template_id, () => emailWordsOf(db, s.tenant_id, u.template_id));
      // No words to check: marked checked, so the sender holds it as it always has (no_template).
      if (!w) {
        if (await write(u, { checked_at: at, checked_words: null, check_after: null })) out.checked += 1;
        return;
      }
      const ws = await once(workspaces, s.tenant_id, () => checkWorkspaceOf(db, s.tenant_id));
      const input = checkInputOf(u.record, w, ws.opening, u.template_language, u.included_for);
      // One attempt of the workspace's UTC day, taken before the model is asked (a rewrite is the same attempt, a
      // failure spends it): words that name no opening cost nothing and take none.
      const cap = REACH_OUT_CHECKS_PER_DAY;
      if (input.needsOpening && !(await takeCheckAttempt(db, { tenantId: s.tenant_id, cap, at: now }))) {
        await gate(u, "day_spent");
        return;
      }
      const c = await checkOne(input, ask, budget);
      out.calls += c.calls;
      out.tokens.input += c.tokens.input;
      out.tokens.output += c.tokens.output;
      if (c.kind === "late") {
        if (await write(u, {})) out.late += 1;
        return;
      }
      const failed = async (why: string) => {
        const tries = Math.min((s.check_tries ?? 0) + 1, 100);
        const first = s.check_first_at ?? at;
        if (now.getTime() - Date.parse(first) >= CHECK_GIVE_UP_MS) {
          const patch = {
            state: "held",
            reason: "check_unavailable",
            hold_detail: null,
            checked_at: at,
            check_tries: tries,
            check_first_at: first,
          } as const;
          if (await write(u, patch)) {
            out.gave_up += 1;
            log.warn("reach_out_check_held", {
              tenant_id: s.tenant_id,
              send_id: s.id,
              broadcast_id: s.broadcast_id,
              tries,
              why,
            });
          }
          return;
        }
        const patch = {
          check_tries: tries,
          check_first_at: first,
          check_after: new Date(now.getTime() + backoffMs(tries)).toISOString(),
        };
        if (await write(u, patch)) out.failed += 1;
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
