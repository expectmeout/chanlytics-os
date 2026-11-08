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
 * tick that drives it is check.ts, which re-exports all of this. The rules are contracts' (reach-out/words/opening.ts,
 * reach-out/opening.ts). Moved whole from check.ts.
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
  openingWorkspaceOf,
  openingVerdict,
  parseOpening,
  parseReading,
  parseTenantConfig,
  reachOutSignatureOf,
  readingSystemPrompt,
  readingUserContent,
  reachOutCountryOf,
  wordsNeedOpening,
  type OpeningAsked,
  type RewriteStep,
  type OpeningRecord,
  type OpeningVerdict,
  type OpeningWorkspace,
  type ReachOutHold,
  type WrittenOpening,
  ANSWER_JSON_ONLY,
  recordOrNull,
  textOrEmpty,
  valueAt,
} from "@chanlytics/contracts";
import { findWorkspaceAbout, findWorkspaceNameAndConfig, type ReachOutRecordRow } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { askJson, type JsonAnswer, type ModelCallFor } from "../../ai/model.js";
import { siteWordsOf } from "@chanlytics/core";
import { findHomePage, PAGE_READS } from "../../shared/public-page.js";

type Db = SupabaseClient<Database>;

/** The most a business's website is said in, in characters: as much as a directory's about (core leads/cards.ts). */
const WEBSITE_SAYS_MAX = 600;

/**
 * What a business's own website says of itself (core siteWordsOf), its home page read by the platform's one page reader
 * (lib/shared/public-page.ts findHomePage), for its opening's record (30 Oct 2026: a lead is not only its listing, and a finder's
 * company or an owner's file has none). Undefined where it has no website.
 */
export function siteReaderOf(host: string | null): (() => Promise<string | null>) | undefined {
  const at = host?.trim();
  if (!at) return undefined;
  return async () => {
    const page = await findHomePage(`https://${at}/`, PAGE_READS.opening);
    return page ? siteWordsOf(page, WEBSITE_SAYS_MAX) : null;
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
    plainJsonHint: ANSWER_JSON_ONLY,
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
   * What its owner asked when they pressed Rewrite the opening (00505 rewrite_asked): the listing's fact is not offered
   * again, and the writer is told what was turned down and what should change. Null, or absent, where nobody asked.
   */
  asked?: OpeningAsked | null;
  /**
   * What the business's own website says (siteReaderOf): read once, and only where the writer is asked, so a listing's
   * fact that passes reads no site; the writer and the reader then read the same record. Absent where it has none.
   */
  site?: () => Promise<string | null>;
  /**
   * Said as the check takes each step (00505: a pressed rewrite shows them as they happen): writing, checking, and
   * writing again where the reader refused it. Reading the site is the site's own to say (check.ts), since only a page
   * read anew takes time.
   */
  onStep?: (step: RewriteStep) => void;
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
      /** What the business's website said, where the writer was asked and the site read (the send keeps it, 00505). */
      site: string | null;
      tokens: Tokens;
      calls: number;
    }
  /** A call failed: the send stays unchecked, to be tried again. The last call is the one that failed. */
  | { kind: "failed"; why: CheckFailure; tokens: Tokens; calls: number }
  /** The budget ran out before a call: the send is handed back untouched. */
  | { kind: "late"; tokens: Tokens; calls: number };

function timedOut(e: unknown): boolean {
  const name = recordOrNull(e)?.name;
  return name === "TimeoutError" || name === "AbortError" || /timed? ?out|aborted/i.test(String(e));
}

/** The record with what its website says, read once for the writer and the reader alike; a site unread says nothing. */
async function withWebsite(i: CheckInput): Promise<OpeningRecord> {
  if (!i.site) return i.record;
  const sentence = await i.site().catch(() => null);
  return { ...i.record, website_says: sentence };
}

/** One send's check, over an injectable model; `forWhom` is the usage ledger's row for each call. */
export async function checkOne(
  checkInput: CheckInput,
  ask: AskModel,
  budget: CheckBudget,
  forWhom: ModelCallFor,
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
    let jsonAnswer: JsonAnswer | null;
    try {
      jsonAnswer = await ask(system, user, schema, maxTokens, budget.signal(), forWhom);
    } catch (e) {
      return { failed: timedOut(e) ? "timeout" : "error" };
    }
    if (!jsonAnswer) return { failed: "no_answer" };
    tokens.input += jsonAnswer.tokens.input;
    tokens.output += jsonAnswer.tokens.output;
    return { answer: jsonAnswer.answer };
  };
  const failed = (reason: CheckFailure): CheckOutcome => ({ kind: "failed", why: reason, tokens, calls });
  const late = (): CheckOutcome => ({ kind: "late", tokens, calls });
  // The record every call reads: the listing's, and what its website says once the writer is to be asked.
  let record = checkInput.record;
  // The reader's verdict on an opening against the record, after code's own reading of it: the call every opening takes,
  // a fact's and each one the writer wrote; an outcome where the check ends there.
  const verdictOn = async (writtenOpening: WrittenOpening): Promise<OpeningVerdict | CheckOutcome> => {
    checkInput.onStep?.("checking");
    const result = await call(
      readingSystemPrompt(),
      readingUserContent({ record, opening: writtenOpening.opening }),
      READING_SCHEMA,
      200,
    );
    if (result === "late") return late();
    if ("failed" in result) return failed(result.failed);
    const reading = parseReading(result.answer);
    if (!reading) return failed("unparseable");
    return openingVerdict(checkOpening(writtenOpening, record), reading, checkInput.language, writtenOpening.opening);
  };

  let opening: WrittenOpening | null = null;
  let hold: ReachOutHold | null = null;
  let detail: string | null = null;
  let rewritten = false;
  // An opening the listing's own fields say (decision 0078): read once, by the reader, as every opening is. It stands
  // where it passes, and where its hold is one no rewrite changes (the business's language); one the reader or code
  // cannot back is the writer's to write, as an opening with no fact is. An owner who pressed Rewrite turned the
  // listing's sentence down already: theirs goes to the writer.
  if (checkInput.needsOpening && checkInput.fact && !checkInput.asked) {
    const v = await verdictOn(checkInput.fact);
    if ("kind" in v) return v;
    if (v.ok || !v.rewrite) {
      opening = checkInput.fact;
      hold = v.ok ? null : v.hold;
      detail = v.ok ? null : v.detail;
    }
  }
  if (checkInput.needsOpening && opening === null) {
    record = await withWebsite(checkInput);
    let retry: { opening: string; why: string } | undefined;
    for (let round = 0; round < 2; round += 1) {
      checkInput.onStep?.(round === 0 ? "writing" : "again");
      const result = await call(
        openingSystemPrompt(),
        openingUserContent({
          record,
          workspace: checkInput.workspace,
          words: checkInput.words,
          asked: checkInput.asked,
          retry,
        }),
        OPENING_SCHEMA,
        400,
      );
      if (result === "late") return late();
      if ("failed" in result) return failed(result.failed);
      const otherOpening = parseOpening(result.answer);
      if (!otherOpening) return failed("unparseable");
      const verdict = await verdictOn(otherOpening);
      if ("kind" in verdict) return verdict;
      opening = otherOpening;
      if (verdict.ok) {
        hold = null;
        detail = null;
        break;
      }
      hold = verdict.hold;
      detail = verdict.detail;
      // One rewrite, told why; a second failure holds (F2).
      if (!verdict.rewrite || round === 1) break;
      retry = { opening: otherOpening.opening, why: verdict.why };
      rewritten = true;
    }
  }
  // Included past it by its owner, where an Include carries (R7): a business hold is not made again, and the opening
  // goes as it reads; a word hold's Include covered one email, and this opening is new words.
  const included = (h: ReachOutHold): boolean => HOLDS_INCLUDED_FOR_CHAIN.has(h) && checkInput.included.includes(h);
  if (hold && included(hold)) {
    hold = null;
    detail = null;
  }
  // The code holds come first: they are facts about the business, not about the words written for it. One that wins
  // over an opening the reader or code refused keeps no opening: an Include past the code hold then finds none, and the
  // send is checked again (the sender's no_opening), where the opening's own hold is said.
  const code: { hold: ReachOutHold; detail: string } | null =
    checkInput.customerDomain && !included("customer_domain")
      ? { hold: "customer_domain", detail: checkInput.customerDomain }
      : checkInput.chain && !included("chain")
        ? { hold: "chain", detail: `${checkInput.chain.by}:${checkInput.chain.listings}` }
        : checkInput.abroad && !included("abroad")
          ? { hold: "abroad", detail: checkInput.abroad }
          : null;
  if (code) {
    if (hold) opening = null;
    hold = code.hold;
    detail = code.detail;
  }
  return { kind: "checked", opening, hold, detail, rewritten, site: record.website_says ?? null, tokens, calls };
}

/** A listing's hours ([{day, hours}], 00144), as words the writer can lean on. */
export function hoursLine(hours: unknown): string | null {
  if (!Array.isArray(hours)) return null;
  const parts = hours
    .map((h) =>
      h && typeof h === "object"
        ? `${textOrEmpty(valueAt(h, "day")).trim()} ${textOrEmpty(valueAt(h, "hours")).trim()}`.trim()
        : "",
    )
    .filter(Boolean);
  return parts.length > 0 ? parts.join("; ").slice(0, 300) : null;
}

/** The record the writer and the reader are given, from the database's. */
export function openingRecordOf(reachOut: ReachOutRecordRow): OpeningRecord {
  return {
    business_name: reachOut.business_name?.trim() || "",
    category: reachOut.category?.trim() || null,
    city: reachOut.city?.trim() || null,
    region: reachOut.region?.trim() || null,
    rating: reachOut.rating,
    reviews: reachOut.reviews,
    website: reachOut.website_host?.trim() || null,
    hours: hoursLine(reachOut.hours),
    about: reachOut.about?.trim() || null,
    why_it_fits: reachOut.why_it_fits?.trim() || null,
    what_you_asked: reachOut.what_you_asked?.trim() || null,
    // Read by the check itself, and only when the writer is asked (CheckInput.site).
    website_says: null,
  };
}

/**
 * The check's input for one business and one step's words. The clock and the preview both build it here. `country` is
 * the lead's (db findLeadCountries); a country never written to is the clock's to skip before it asks (check.ts).
 */
export function checkInputOf(
  reachOut: ReachOutRecordRow,
  words: { subject: string | null; body: string },
  workspace: OpeningWorkspace,
  language: string,
  included: string[] = [],
  country: string | null = null,
): CheckInput {
  return {
    record: openingRecordOf(reachOut),
    workspace,
    words,
    language,
    needsOpening: wordsNeedOpening(words),
    chain: chainOf({
      website: reachOut.website_host,
      site_listings: reachOut.site_listings,
      name_listings: reachOut.name_listings,
    }),
    customerDomain: customerDomainOf(reachOut.email, reachOut.email_domain_shared),
    abroad: reachOutCountryOf(country) === "held" ? (country ?? "").trim().toUpperCase() : null,
    included,
    fact: leadFactOf({
      business_name: reachOut.business_name,
      city: reachOut.city,
      hours: reachOut.hours,
      rating: reachOut.rating,
      reviews: reachOut.reviews,
    }),
  };
}

/** A workspace as the check and its preview read it: the writer's side of the input, and the words' slots. */
export interface CheckWorkspace {
  opening: OpeningWorkspace;
  businessName: string | null;
  address: string | null;
  bookingLink: string | null;
  /** Sign-off's signature with its phone (decision 0113): under the name of every email the sender and the preview lay out. */
  signature: string | null;
}

export async function checkWorkspaceOf(db: Db, tenantId: string): Promise<CheckWorkspace> {
  const [w, about] = await Promise.all([findWorkspaceNameAndConfig(db, tenantId), findWorkspaceAbout(db, tenantId)]);
  const config = parseTenantConfig(w.config);
  const brain = config?.brain;
  const name = w.name?.trim() || null;
  return {
    opening: openingWorkspaceOf(name ?? "", config, about),
    businessName: name,
    address: brain?.profile?.address?.trim() || null,
    bookingLink: brain?.booking_link?.trim() || null,
    signature: reachOutSignatureOf(config),
  };
}
