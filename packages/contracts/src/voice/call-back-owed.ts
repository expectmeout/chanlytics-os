/**
 * Whether a call asks a person for a call back (decisions 0136 and 0137). A call that needed a person, or that reached
 * no answer, opened the thread's `callback` hold whoever rang, and so did a dialler's: it hangs up when a machine
 * answers, says nothing, and its number sat in Needs you for weeks (17 Nov 2026, a toll-free line nobody could usefully
 * ring back). Four things say a call asks for none, in the order a word outranks a guess:
 *
 *   - the workspace's own word: a member said the caller's thread is not a customer's, and it stands until they say
 *     "Reply anyway";
 *   - the carrier's: it flagged the call as spam;
 *   - the carrier's again, with nothing said: the number the call showed failed its carrier's check (number-check.ts),
 *     from someone the business does not talk with;
 *   - nothing said at all, from a toll-free number the business does not talk with. A toll-free caller who speaks is
 *     read as any caller is (a bank, a pharmacy and a supplier ring from one), and so is one the business talks with.
 *
 * What is known of a caller is read for a call that would ask (the edge's voice/call-webhook.ts); where that read
 * failed, the call asks: a customer's call is never dropped by a read that did not answer. Pure.
 */
import { saidNotACustomer } from "../conversations/standing";
import { tollFreeNumber } from "../shared/phone";
import type { NumberCheck } from "./number-check";

/** What a caller's record holds, as the database says it (db voice/caller.ts findCallerFacts). */
export interface CallerFacts {
  /** The thread's own word (conversations.set_aside_at, set_aside_why): when it was set aside, and as what. */
  setAsideAt: string | null;
  setAsideWhy: string | null;
  /** The newer of a member's two words about the thread (decisions: not_a_customer, reply_anyway), or null. */
  lastWord: "not_a_customer" | "reply_anyway" | null;
  /** Words between them: the business wrote to them, or they wrote. A call's own note is neither. */
  wrote: boolean;
  /** The business has phoned them. */
  phoned: boolean;
  /** How they came to be on record, and where their name is from (contacts.acquired_via, name_source). */
  acquiredVia: string | null;
  nameSource: string | null;
}

/** What is known of a caller before anyone is asked to ring them back. */
export interface CallerStanding {
  /** The workspace's own word: a member said their thread is not a customer's, or that they are a person after all. */
  said: "not_a_customer" | "person" | null;
  /** The business talks with them: words went between them, it phoned them, or the owner brought them in or named them. */
  talks: boolean;
}

/** The doors a person comes in by on the owner's own act: a visit on the calendar, an import, a lead kept, a hand, a form, an ad. */
const OWNER_BROUGHT: ReadonlySet<string> = new Set(["calendar", "import", "lead", "manual", "website", "ad"]);
/** A name the owner gave, or brought in with them; never one read off a wire or a signature. */
const OWNER_NAMED: ReadonlySet<string> = new Set(["typed", "import", "calendar", "lead"]);

/**
 * A caller's standing, from their record. A thread set aside with its day gone (`set_aside_why` kept, `set_aside_at`
 * null) is one a member said is not a customer's (00539 conversation_not_a_customer), which stands until Reply anyway
 * clears both; a thread they answered anyway is a person's, whatever a reading says of the next call.
 */
export function callerStandingOf(callerFacts: CallerFacts): CallerStanding {
  const saidNot = saidNotACustomer({ set_aside_at: callerFacts.setAsideAt, set_aside_why: callerFacts.setAsideWhy });
  return {
    said: saidNot ? "not_a_customer" : callerFacts.lastWord === "reply_anyway" ? "person" : null,
    talks:
      callerFacts.wrote ||
      callerFacts.phoned ||
      OWNER_BROUGHT.has(callerFacts.acquiredVia ?? "") ||
      OWNER_NAMED.has(callerFacts.nameSource ?? ""),
  };
}

/**
 * A caller the business does not talk with, whom no member has said is a person: the only kind a guess may act on. A
 * silent call's hold lets itself go for one, a week after anything last happened to it (nothing was said, so nothing is
 * owed; they are held again the day they ring or write), and a call back read as someone selling is set aside for one.
 */
export const strangerCaller = (callerStanding: CallerStanding): boolean =>
  !callerStanding.talks && callerStanding.said !== "person";

/** Why a call that would ask for a call back asks for none. */
export type CallBackNotOwed = "not_a_customer" | "carrier_spam" | "unverified_silent" | "toll_free_silent";

/** The call, as far as the question needs it: who rang, whether anything was said, and how it ended. */
interface CallAsking {
  from: string | null;
  /** It reached no answer: it never connected, or they left without a word. */
  silent: boolean;
  disconnectionReason: string | null;
  /** What the caller's carrier said of the number shown, where the call's headers said (number-check.ts); else null. */
  numberCheck?: NumberCheck | null;
}

/** Why a call asks nobody to ring back, or null where it asks. `callerStanding` is null where it could not be read. */
export function callBackNotOwed(callAsking: CallAsking, callerStanding: CallerStanding | null): CallBackNotOwed | null {
  if (callerStanding?.said === "not_a_customer") return "not_a_customer";
  if (!callAsking.silent) return null;
  if (callAsking.disconnectionReason === "marked_as_spam") return "carrier_spam";
  // The two guesses, which act only on someone the business does not talk with, and never on a record nobody could read.
  if (!callerStanding || !strangerCaller(callerStanding)) return null;
  if (callAsking.numberCheck === "failed") return "unverified_silent";
  return tollFreeNumber(callAsking.from) ? "toll_free_silent" : null;
}
