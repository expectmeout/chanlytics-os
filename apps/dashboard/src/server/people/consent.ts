/**
 * A member records a person's answer: for one person (PUT contacts/:id/consent, about their own visit; PUT
 * contacts/:id/marketing-consent, about offers) or for many at once (POST contacts/consent). Each is one call to one
 * door (00356 record_consent): the answer, its event and the line in the person's history land together or not at
 * all, so an answer is never changed with no line saying who recorded it, and a batch that fails for one person has
 * recorded the others whole and says which it could not.
 *
 * What may be recorded is judged here first, in a person's words, by the one rule the three routes share (how they
 * told you, which message an answer "in their own message" names, that a yes to offers is written), and again by the
 * doors themselves, which no caller can skip. The routes declare who may and how often.
 *
 * And the one answer a member may not record but may ask for: a website sign-up's yes to offers by email, which only the
 * person's press on its confirmation link gives (00489), asked for here (askToConfirmSignup).
 */
import {
  AppError,
  CONSENT_RESET_SOURCE,
  CONSENT_SOURCES,
  OWN_MESSAGE_REFUSALS,
  offersYesRefusal,
  ownMessageRefusal,
  signupAskLine,
  type AskedPurpose,
  type SignupAskRefusal,
} from "@chanlytics/contracts";
import { recordConsent } from "@chanlytics/db";
import { callEdge, edgeConfigured } from "@/server/edge";
import { log } from "@/server/log";
import { dbRefusal, type RouteContext } from "@/server/with-route";
import type { contactScope } from "@/server/verbs";

/** The person a contactScope route acts on, as the scope read them. */
type ContactRow = Awaited<ReturnType<typeof contactScope.load>>;

interface ConsentInput {
  consent: string;
  source?: string;
  note?: string;
  /** The message an answer "in their own message" was given in (00137); one person's alone, never a batch's. */
  message_id?: string;
}

interface ManyOutcome {
  done: number;
  failed: { id: string; message: string }[];
  skipped: string[];
}

/**
 * How they said it: one of the four sources, or the reset, which carries none. The rule every consent route applies,
 * in the order each always asked it. For one person, an answer in their own message names that message and no other
 * source does; for many at once it is refused, since one message is not every person's. A yes to OFFERS is written or
 * it is not recorded: the database refuses a spoken one as well (00100), and asking here first hands the person a
 * sentence instead of the database's, before any row is touched. A no is never narrowed.
 */
function consentSourceOf(
  input: ConsentInput,
  purpose: AskedPurpose,
  named: { messageId: string | null } | "many",
): string {
  const s = input.consent === "unknown" ? CONSENT_RESET_SOURCE : input.source;
  if (typeof s !== "string" || (input.consent !== "unknown" && !CONSENT_SOURCES.some((k) => k.id === s))) {
    throw new AppError(
      "validation",
      "Say how they told you: in person, on the phone, on a form, or in their own message.",
    );
  }
  if (named === "many" && s === "customer_message") throw new AppError("validation", OWN_MESSAGE_REFUSALS.batch);
  if (purpose === "marketing" && input.consent === "opted_in") {
    const refusal = offersYesRefusal(s);
    if (refusal) throw new AppError("validation", refusal);
  }
  if (named !== "many") {
    const ownMessage = ownMessageRefusal(s, named.messageId);
    if (ownMessage) throw new AppError("validation", ownMessage);
  }
  return s;
}

/** The note, trimmed to what the door takes, or nothing. */
function noteOf(note: unknown): string | null {
  return typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;
}

/** What the door answered, read as a record: its own fields with the decision's id beside them. */
const whatTheDoorAnswered = (data: unknown): Record<string, unknown> =>
  data !== null && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
const textOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** One person's answer through the door, judged first; the door's refusal is the route's, in the door's words. */
async function recordOne(ctx: RouteContext, contact: ContactRow, purpose: AskedPurpose, input: ConsentInput) {
  const messageId = input.message_id ?? null;
  const source = consentSourceOf(input, purpose, { messageId });
  const { data, error } = await recordConsent(ctx.supabase, {
    contactId: contact.id,
    purpose,
    consent: input.consent,
    source,
    note: noteOf(input.note),
    messageId,
    batch: null,
    via: ctx.via ?? null,
    undoOf: ctx.undoOf ?? null,
  });
  if (error) throw dbRefusal(error);
  const r = whatTheDoorAnswered(data);
  return { r, source, decisionId: textOrNull(r.decision_id) };
}

/**
 * PUT contacts/:id/consent: the customer's CONVERSATIONAL answer (messages about their own visit, and a reply when
 * they write), recorded by the person who heard it. The door writes the three consent columns together, keeps the
 * event with the message's words where one was named, and the history line that says who recorded it and how.
 */
export async function recordVisitConsent(ctx: RouteContext, contact: ContactRow, input: ConsentInput) {
  const { r, source, decisionId } = await recordOne(ctx, contact, "conversational", input);
  return {
    contact_id: contact.id,
    consent: input.consent,
    dnc: r.dnc === true,
    source,
    updated_at: textOrNull(r.updated_at),
    decision_id: decisionId,
  };
}

/**
 * PUT contacts/:id/marketing-consent: their answer about OFFERS, a separate question since 00095 because the carriers
 * require the two collected separately. The route hands in no evidence of its own (a session that did would be
 * writing the proof): the door reads the message it names.
 */
export async function recordOffersConsent(ctx: RouteContext, contact: ContactRow, input: ConsentInput) {
  const { r, source, decisionId } = await recordOne(ctx, contact, "marketing", input);
  return {
    contact_id: contact.id,
    purpose: "marketing" as const,
    consent: textOrNull(r.marketing_consent) ?? input.consent,
    source,
    updated_at: textOrNull(r.marketing_consent_updated_at),
    decision_id: decisionId,
  };
}

/**
 * The same answer for many people at once, through the same door each of them would go through alone.
 *
 * The page used to send one request per person: fifty round trips for a class that said yes at the desk together,
 * fifty takes of the consent bucket, and a page that refreshed once at the end whatever had happened in between. One
 * request now, and one call per person (the door judges membership and the written-yes rule per row, and writes each
 * person's history line with their answer, so each profile's timeline is whole).
 *
 * The ids are read back under RLS first and held to THIS workspace: a member of two cannot record an answer for the
 * other's customers from this tab, and an erased person is not written on. What was not ours, or not there, comes
 * back as skipped rather than as a failure: it is not an error to have selected a row that changed underneath you.
 * A person the door refused is said with the door's own words; one the database failed for, in words that are a
 * person's to read, never the database's.
 */
export async function recordConsentMany(
  ctx: RouteContext,
  tenantId: string,
  purpose: AskedPurpose,
  input: { ids: string[] } & ConsentInput,
): Promise<ManyOutcome> {
  const source = consentSourceOf(input, purpose, "many");
  const note = noteOf(input.note);
  const ids = [...new Set(input.ids)];
  const { data, error } = await ctx.supabase.from("contacts").select("id, tenant_id, erased_at").in("id", ids);
  if (error) throw new Error(error.message);
  const ours = (data ?? []).filter((c) => c.tenant_id === tenantId && !c.erased_at);
  const skipped = ids.filter((id) => !ours.some((c) => c.id === id));
  const failed: ManyOutcome["failed"] = [];
  let done = 0;
  for (const c of ours) {
    const door = await recordConsent(ctx.supabase, {
      contactId: c.id,
      purpose,
      consent: input.consent,
      source,
      note,
      messageId: null,
      batch: ids.length,
      via: ctx.via ?? null,
      undoOf: null,
    });
    if (door.error) failed.push({ id: c.id, message: dbRefusal(door.error).message });
    else done += 1;
  }
  return { done, failed, skipped };
}

/**
 * A member asks a website sign-up's person to confirm by email, from the person's page (Ask to confirm, Ask again;
 * 00489's double opt-in): the edge asks under the same rules and limits as the form's own ask
 * (apps/edge/lib/website/signup-confirm.ts askAgain, POST /api/admin/email/signup-confirm). Its refusal of the rules is an answer, said in the page's words
 * (contracts signupAskLine); a door that could not be reached, or that failed, is an error.
 */

/** How long the edge has to answer: a few reads, one email written and its send scheduled. */
const ASK_TIMEOUT_MS = 15_000;

/** What the ask came to: whether the email is on its way, and the sentence the page says. */
interface SignupAskAnswer {
  asked: boolean;
  said: string;
}

/** The words when the edge names a reason the page has none for: someone gone since the page was read. */
const NOBODY_TO_ASK = "There is nobody to ask: they are no longer in this workspace.";

export async function askToConfirmSignup(
  tenantId: string,
  userId: string,
  contactId: string,
): Promise<SignupAskAnswer> {
  if (!edgeConfigured()) throw new AppError("conflict", "Asking them to confirm is not available right now.", 503);
  const a = await callEdge(
    "/api/admin/email/signup-confirm",
    { tenant_id: tenantId, user_id: userId, contact_id: contactId },
    { workspace: tenantId, user: userId, timeoutMs: ASK_TIMEOUT_MS },
  );
  const b = a.body as { ok?: unknown; asked?: unknown; why?: unknown } | null;
  if (a.status === 200 && b?.ok === true) {
    const asked = b.asked === true;
    const why = typeof b.why === "string" ? (b.why as SignupAskRefusal) : null;
    return { asked, said: signupAskLine(asked ? "asked" : why) ?? NOBODY_TO_ASK };
  }
  log.warn("signup_confirm_ask_failed", { tenant_id: tenantId, status: a.status, reason: b?.why ?? null });
  throw new AppError("conflict", "The email asking them to confirm could not be sent. Try again in a minute.", 502);
}
