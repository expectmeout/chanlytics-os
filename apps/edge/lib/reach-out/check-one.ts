/**
 * One send's check (Reach out, Part 4; spec §4.4; F2–F6, R1–R7, R12): when its step's words name {{opening}}, the writer
 * writes the opening from the business's record and code reads it (checkOpening); the reader reads it against the same
 * record; a failed rule asks for one rewrite, told why, then holds (openingVerdict). The three code holds come first: a
 * person in People writes from the business's domain (F6), the business reads like a chain (F4), and the business is
 * abroad, in a country its owner says yes to first (decision 0056, 9: contracts reachOutCountryOf); the opening is still
 * written for them, so an owner's Include sends it as it reads. A business hold its owner already included this send, or
 * its lead in this chain, past is never made again; an Include past a word hold (an unbacked fact, a pitch) covered that
 * one email, and a later step's opening, new words, is read as any other (R7: contracts HOLDS_INCLUDED_FOR_CHAIN).
 *
 * Here too: the model it asks (askReachOutModel: Haiku, the registry's reach_out_check route, through the platform's one
 * JSON-model transport, with no retry of its own on "not now"; an overload is asked once of the route's fallback when
 * the call's deadline leaves room), the budget a caller's calls keep to (checkBudget), and the input built from a
 * business's record and a step's words, which the clock and the preview both use (checkInputOf, checkWorkspaceOf). The
 * tick that drives it is check.ts, which re-exports all of this. The rules are contracts' (reach-out-words.ts,
 * reach-out-opening.ts). Moved whole from check.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOLDS_INCLUDED_FOR_CHAIN,
  OPENING_SCHEMA,
  READING_SCHEMA,
  chainOf,
  checkOpening,
  customerDomainOf,
  leadFactOf,
  openingSystemPrompt,
  openingUserContent,
  openingVerdict,
  parseOpening,
  parseReading,
  parseTenantConfig,
  readingSystemPrompt,
  SECOND_MS,
  readingUserContent,
  reachOutCountryOf,
  wordsNeedOpening,
  type OpeningRecord,
  type OpeningVerdict,
  type OpeningWorkspace,
  type ReachOutHold,
  type WrittenOpening,
} from "../packages/contracts.js";
import { workspaceAbout, workspaceNameAndConfig, type Database, type ReachOutRecordRow } from "../packages/db.js";
import { askJson, type JsonAnswer, type ModelCallFor } from "../model.js";
import { publicPageText, siteWordsOf } from "../public-page.js";

type Db = SupabaseClient<Database>;

/** How long a business's home page may take, and how much of it is read: its head and first words, never a download. */
const SITE_READ = { timeoutMs: 4 * SECOND_MS, maxBytes: 200_000 };

/**
 * What a business's own website says of itself (siteWordsOf), read by one GET of its home page through the public
 * reader's address rule, for its opening's record (30 Oct 2026: a lead is not only its listing, and a finder's company
 * or an owner's file has none). Undefined where it has no website.
 */
export function siteReaderOf(fetchImpl: typeof fetch, host: string | null): (() => Promise<string | null>) | undefined {
  const at = host?.trim();
  if (!at) return undefined;
  return async () => {
    const html = await publicPageText(fetchImpl, `https://${at}/`, SITE_READ);
    return html ? siteWordsOf(html) : null;
  };
}

/** No call starts after this, from the tick's start (R1): the door has 60 s (vercel.json). */
export const CHECK_CALLS_UNTIL_MS = 40_000;
/** Each call's deadline: this, or what is left before CHECK_DONE_BY_MS, whichever is sooner (R1). */
export const CHECK_CALL_MS = 8_000;
export const CHECK_DONE_BY_MS = 50_000;

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
  /** Who the call is for: the usage ledger's row (the send's workspace, and the send). */
  forWhom: ModelCallFor,
) => Promise<JsonAnswer | null>;

/**
 * Haiku (the registry's reach_out_check route), through the platform's one JSON-model transport, with no retry of its
 * own on "not now": a failure is the check's to count. An overload is asked once of the route's fallback when the
 * call's deadline leaves room.
 */
export const askReachOutModel: AskModel = (system, user, schema, maxTokens, signal, forWhom) =>
  askJson({
    purpose: "reach_out_check",
    system,
    user,
    schema,
    maxTokens,
    plainJsonHint: "Answer with only a JSON object in the shape asked.",
    timeoutMs: CHECK_CALL_MS,
    signal,
    for: forWhom,
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
  /** The lead's country when it is one its owner says yes to first (contracts reachOutCountryOf: held); else null. */
  abroad: string | null;
  /**
   * The opening the listing's own fields say (contracts leadFactOf, decision 0078): read by the reader before the
   * writer is asked. Null, or absent, where the listing says nothing code can write.
   */
  fact?: WrittenOpening | null;
  /**
   * What the business's own website says (siteReaderOf): read once, and only where the writer is asked, so a listing's
   * fact that passes reads no site; the writer and the reader then read the same record. Absent where it has none.
   */
  site?: () => Promise<string | null>;
  /**
   * The holds this send's owner included it, or its lead in this chain, past (the planner's union over the lead's sends):
   * one an Include carries (contracts HOLDS_INCLUDED_FOR_CHAIN) is never made again; the rest covered one email (R7).
   */
  included: string[];
}

export type Tokens = { input: number; output: number };
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

/** The record with what its website says, read once for the writer and the reader alike; a site unread says nothing. */
async function withWebsite(i: CheckInput): Promise<OpeningRecord> {
  if (!i.site) return i.record;
  const said = await i.site().catch(() => null);
  return { ...i.record, website_says: said };
}

/** One send's check, over an injectable model; `forWhom` is the usage ledger's row for each call. */
export async function checkOne(
  i: CheckInput,
  ask: AskModel,
  budget: CheckBudget,
  forWhom: ModelCallFor = { tenantId: null },
): Promise<CheckOutcome> {
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
      a = await ask(system, user, schema, maxTokens, budget.signal(), forWhom);
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
  // The record every call reads: the listing's, and what its website says once the writer is to be asked.
  let record = i.record;
  // The reader's verdict on an opening against the record, after code's own reading of it: the call every opening takes,
  // a fact's and each one the writer wrote; an outcome where the check ends there.
  const verdictOn = async (o: WrittenOpening): Promise<OpeningVerdict | CheckOutcome> => {
    const r = await call(
      readingSystemPrompt(),
      readingUserContent({ record, opening: o.opening }),
      READING_SCHEMA,
      200,
    );
    if (r === "late") return late();
    if ("failed" in r) return failed(r.failed);
    const reading = parseReading(r.answer);
    if (!reading) return failed("unparseable");
    return openingVerdict(checkOpening(o, record), reading, i.language, o.opening);
  };

  let opening: WrittenOpening | null = null;
  let hold: ReachOutHold | null = null;
  let detail: string | null = null;
  let rewritten = false;
  // An opening the listing's own fields say (decision 0078): read once, by the reader, as every opening is. It stands
  // where it passes, and where its hold is one no rewrite changes (the business's language); one the reader or code
  // cannot back is the writer's to write, as an opening with no fact is.
  if (i.needsOpening && i.fact) {
    const v = await verdictOn(i.fact);
    if ("kind" in v) return v;
    if (v.ok || !v.rewrite) {
      opening = i.fact;
      hold = v.ok ? null : v.hold;
      detail = v.ok ? null : v.detail;
    }
  }
  if (i.needsOpening && opening === null) {
    record = await withWebsite(i);
    let retry: { opening: string; why: string } | undefined;
    for (let round = 0; round < 2; round += 1) {
      const w = await call(
        openingSystemPrompt(),
        openingUserContent({ record, workspace: i.workspace, words: i.words, retry }),
        OPENING_SCHEMA,
        400,
      );
      if (w === "late") return late();
      if ("failed" in w) return failed(w.failed);
      const o = parseOpening(w.answer);
      if (!o) return failed("unparseable");
      const v = await verdictOn(o);
      if ("kind" in v) return v;
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
  // Included past it by its owner, where an Include carries (R7): a business hold is not made again, and the opening
  // goes as it reads; a word hold's Include covered one email, and this opening is new words.
  const included = (h: ReachOutHold): boolean => HOLDS_INCLUDED_FOR_CHAIN.has(h) && i.included.includes(h);
  if (hold && included(hold)) {
    hold = null;
    detail = null;
  }
  // The code holds come first: they are facts about the business, not about the words written for it. One that wins
  // over an opening the reader or code refused keeps no opening: an Include past the code hold then finds none, and the
  // send is checked again (the sender's no_opening), where the opening's own hold is said.
  const code: { hold: ReachOutHold; detail: string } | null =
    i.customerDomain && !included("customer_domain")
      ? { hold: "customer_domain", detail: i.customerDomain }
      : i.chain && !included("chain")
        ? { hold: "chain", detail: `${i.chain.by}:${i.chain.listings}` }
        : i.abroad && !included("abroad")
          ? { hold: "abroad", detail: i.abroad }
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
    // Read by the check itself, and only when the writer is asked (CheckInput.site).
    website_says: null,
  };
}

/**
 * The check's input for one business and one step's words. The clock and the preview both build it here. `country` is
 * the lead's (db leadCountriesOf); a country never written to is the clock's to skip before it asks (check.ts).
 */
export function checkInputOf(
  r: ReachOutRecordRow,
  words: { subject: string | null; body: string },
  workspace: OpeningWorkspace,
  language: string,
  included: string[] = [],
  country: string | null = null,
): CheckInput {
  return {
    record: openingRecordOf(r),
    workspace,
    words,
    language,
    needsOpening: wordsNeedOpening(words),
    chain: chainOf({ website: r.website_host, site_listings: r.site_listings, name_listings: r.name_listings }),
    customerDomain: customerDomainOf(r.email, r.email_domain_shared),
    abroad: reachOutCountryOf(country) === "held" ? (country ?? "").trim().toUpperCase() : null,
    included,
    fact: leadFactOf({
      business_name: r.business_name,
      city: r.city,
      hours: r.hours,
      rating: r.rating,
      reviews: r.reviews,
    }),
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
