/**
 * What Meta holds about a connected WhatsApp number, and the words for it.
 *
 * Meta answers, for a phone number and for the account behind it (apps/edge/lib/whatsapp/meta-graph.ts `numberStanding`),
 * whether the number may send at all (`can_send_message`: AVAILABLE, LIMITED or BLOCKED), what stands in the way (each
 * entity's errors, with Meta's own fix), how the display name's review fares, whether the business is verified and how many
 * people it may start a conversation with in a day. The edge keeps that answer whole on the channel's config
 * (`channel_keep_standing`, 00338) and says a change of `can_send` as a `channel.standing` event. This is the one place it
 * is read back and put into words, for the Connections row, the owner's alert, a campaign's readiness and the Activity log.
 * The words are Chanlytics' own, from the fields Meta answers (whether it may send, a payment method on file, the verification,
 * the name's review, the tier): Meta's own prose is repeated only for a number it has stopped for a reason none of those
 * fields explains, and a word of Meta's that is not one of the three is kept as Meta said it and never turned into one that
 * is. The account's payment method (is one on file), the business that owns the account and the account itself ride with the
 * standing, so the row can send the owner to Meta's own page for each (whatsapp-cost.ts addPaymentMethodLink, and the links here).
 */
import { dailyLimit, numberHealth, type NumberHealth } from "../broadcasts/broadcast-number";
import { formatPhoneDisplay } from "../shared/phone";
import { MIN_MS } from "../shared/time";
import type { ConnectionNote } from "./connection-note";
import { addPaymentMethodLink } from "./whatsapp-cost";

/**
 * One thing Meta says stands in the way, from an entity's errors: whose it is, Meta's code, what it said, and how to fix it.
 * A type alias and not an interface: an interface has no index signature, and the edge hands a standing whole to the
 * database as `Json`, which a type alias of plain fields is.
 */
export type StandingProblem = {
  entity: string;
  code: number | null;
  said: string;
  fix: string | null;
};

/** What Meta holds about a number, as the edge keeps it on the channel's config (a type alias, as the problem is). */
export type NumberStanding = {
  /** `can_send_message` of the number: AVAILABLE, LIMITED or BLOCKED, or a word of Meta's that is none of these. */
  can_send: string;
  problems: StandingProblem[];
  /** The `additional_info` Meta gave, each as it said it. */
  notes: string[];
  /** The display name, and where its review stands: APPROVED, AVAILABLE_WITHOUT_REVIEW, DECLINED, EXPIRED, PENDING_REVIEW or NONE. */
  name: string | null;
  name_status: string | null;
  /** The business's verification (`verified`, `not_verified`, `pending`, ...) and its tier (TIER_250, TIER_UNLIMITED, UNTIERED, ...). */
  verification: string | null;
  limit: string | null;
  /**
   * Whether the WhatsApp Business Account has a payment method on file (its `primary_funding_id` is there): false where Meta
   * answered without one, null where the account's funding could not be read (never guessed).
   */
  has_payment_method: boolean | null;
  /** The Meta business that owns the account (`owner_business_info.id`), where Meta's billing page opens; null where it could not be read. */
  owner_business_id: string | null;
  /** The WhatsApp Business Account the number belongs to; null where none is on file. */
  waba_id: string | null;
};

/**
 * How many people a business new to Meta may start a conversation with in a day, until it is verified (Meta, messaging
 * limits: a new business portfolio starts at 250, shared by every number in it). Replies to a customer who wrote first are
 * not counted. Said under a connected number's row when Meta has not said a tier of its own.
 */
const NEW_BUSINESS_LIMIT = 250;

/** How long a page that opens trusts a standing that is not AVAILABLE, before it asks Meta again. */
const STANDING_STALE_MS = 10 * MIN_MS;

const heldObject = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);

/** Text that says something: trimmed, and null where it is not a string or is blank. */
const textOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The standing a channel's config holds, read back as held and no looser: an object with Meta's word for `can_send`,
 * else nothing. A problem with nothing said, or a note that is not text, is dropped; nothing is mended into a sentence.
 */
export function standingFromConfig(value: unknown): NumberStanding | null {
  const s = heldObject(value);
  const canSend = textOrNull(s?.can_send);
  if (!s || !canSend) return null;
  const problems = listOf(s.problems).flatMap((p): StandingProblem[] => {
    const r = heldObject(p);
    const said = textOrNull(r?.said);
    if (!r || !said) return [];
    return [
      {
        entity: textOrNull(r.entity) ?? "UNKNOWN",
        code: typeof r.code === "number" ? r.code : null,
        said,
        fix: textOrNull(r.fix),
      },
    ];
  });
  const notes = listOf(s.notes).flatMap((n): string[] => {
    const text = textOrNull(n);
    return text ? [text] : [];
  });
  return {
    can_send: canSend,
    problems,
    notes,
    name: textOrNull(s.name),
    name_status: textOrNull(s.name_status),
    verification: textOrNull(s.verification),
    limit: textOrNull(s.limit),
    has_payment_method: typeof s.has_payment_method === "boolean" ? s.has_payment_method : null,
    owner_business_id: textOrNull(s.owner_business_id),
    waba_id: textOrNull(s.waba_id),
  };
}

/**
 * Whether a page that has just opened should ask Meta again: nothing was kept, or what was kept is not AVAILABLE, or says the
 * account has no payment method, and was read more than ten minutes ago (so a payment method added a minute ago shows as fixed
 * without waiting for the six-hourly read: a number with none can stay AVAILABLE, since its replies still go out). Any other
 * AVAILABLE number is the clock's to renew.
 */
export function standingNeedsRead(
  n: { standing: NumberStanding | null; standingReadAt: string | null },
  nowMs: number,
): boolean {
  if (!n.standing) return true;
  if (n.standing.can_send === "AVAILABLE" && n.standing.has_payment_method !== false) return false;
  const readAt = n.standingReadAt ? Date.parse(n.standingReadAt) : Number.NaN;
  return Number.isNaN(readAt) || nowMs - readAt > STANDING_STALE_MS;
}

/**
 * Meta's text as a sentence: trimmed, and ended with a stop where it has none. (Not named `sentence`: the contracts bundle
 * already has a top-level one, and a second renames every local `sentence` in the bundle.)
 */
const withStop = (text: string): string => {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/** A problem as a sentence: what Meta said, then how it said to fix it. */
const problemWords = (p: StandingProblem): string =>
  p.fix ? `${withStop(p.said)} ${withStop(p.fix)}` : withStop(p.said);

/** The sentence of a number Meta will not let send, where it named no problem about messaging. */
const BLOCKED_SENTENCE = "Meta says WhatsApp cannot send from this number right now.";

/**
 * Meta's problems about WhatsApp calling, its SIP signalling ("WhatsApp Business calling cannot use SIP because it is not
 * enabled", on the phone and again on the app). Chanlytics does not use WhatsApp calling: a call reaches the business on its
 * phone line. So a calling problem is never shown, never the row's reason and never the owner's alert (6 October: the row led
 * with one, over the payment method that was the real block). Told apart by their words until Meta's codes for them are
 * known: the edge logs each read's codes (`wa_standing_read`).
 */
const CALLING_PROBLEM = /\bSIP\b|\bcalling\b/i;
const messagingProblems = (s: NumberStanding): StandingProblem[] =>
  s.problems.filter((p) => !CALLING_PROBLEM.test(p.said) && !(p.fix !== null && CALLING_PROBLEM.test(p.fix)));

/** A problem of Meta's that names the account's payment method ("There is an error with the payment method…"). */
const PAYMENT_PROBLEM = /\bpayment\b/i;

/**
 * What stands with the account's payment method: none on file (the account's own word, `has_payment_method` false), one Meta
 * names a problem with (a card declined, an account with no timezone or currency: Meta's words name a payment), or nothing.
 * Chanlytics is a Tech Provider: Meta bills the business to the card on its own WhatsApp account, so without one Meta does not
 * deliver the messages the business starts, reminders and campaigns.
 */
type PaymentTrouble = "missing" | "failing";
function paymentTrouble(s: NumberStanding): PaymentTrouble | null {
  if (s.has_payment_method === false) return "missing";
  return messagingProblems(s).some((p) => PAYMENT_PROBLEM.test(p.said)) ? "failing" : null;
}

const META_ID = /^\d+$/;

/** Meta's Security Center for the business that owns the account, where business verification is started; Meta's own page without the business. */
function securityCenterLink(ownerBusinessId: string | null): string {
  return ownerBusinessId && META_ID.test(ownerBusinessId)
    ? `https://business.facebook.com/settings/security?business_id=${ownerBusinessId}`
    : "https://business.facebook.com/settings/security";
}

/** WhatsApp Manager on the account's numbers, where Meta says what it holds against one; Meta's own page without the ids. */
function whatsappManagerLink(ownerBusinessId: string | null, wabaId: string | null): string {
  return ownerBusinessId && wabaId && META_ID.test(ownerBusinessId) && META_ID.test(wabaId)
    ? `https://business.facebook.com/wa/manage/phone-numbers/?business_id=${ownerBusinessId}&waba_id=${wabaId}`
    : "https://business.facebook.com/wa/manage/";
}

const PAYMENT_SENTENCE: Record<PaymentTrouble, string> = {
  missing: "Meta needs a payment method on your WhatsApp account before it delivers reminders and campaigns.",
  failing:
    "Meta reports a problem with the payment method on your WhatsApp account: reminders and campaigns are not delivered until it is fixed.",
};
/**
 * What still goes out without one, said only where Meta itself says the number may send: a BLOCKED number is Meta's word that
 * it may not, replies included (the final review of 6 October).
 */
const REPLIES_STILL_GO = "Replies to customers who write first still go out.";
/** Where to add one when Meta's own page for it cannot be opened (the business or the account is not known). */
const ADD_ONE_IN_SUITE = "Add one in Meta Business Suite › Billing.";
const PAYMENT_ACT: Record<PaymentTrouble, string> = { missing: "Add a card", failing: "Fix the card" };

/**
 * What a connected number's row says while Meta holds something against it: its state's words, one sentence, and the one act
 * that mends it, a page of Meta's. Null where Meta holds nothing against it (the row is then its rating's and its last message's).
 */
interface StandingRow {
  stateWords: "Waiting on you" | "Needs attention";
  sentence: string;
  act: { label: string; href: string } | null;
}

/**
 * The row's words for what Meta holds against a number, in the order an owner can act on: the account's payment method, missing
 * or failing, is the owner's to mend ("Waiting on you", Meta's billing page for this account); a number Meta has stopped for
 * anything else needs attention, with Meta's first problem about messaging in Meta's words, and WhatsApp Manager to read the
 * rest. Nothing else of Meta's is repeated: its notes, its calling problems, and a limit or a review the notes say in
 * Chanlytics' words (standingNotes).
 */
export function standingRow(s: NumberStanding): StandingRow | null {
  const payment = paymentTrouble(s);
  if (payment) {
    const href = addPaymentMethodLink(s.owner_business_id, s.waba_id);
    const words = [
      PAYMENT_SENTENCE[payment],
      ...(s.can_send === "BLOCKED" ? [] : [REPLIES_STILL_GO]),
      ...(href ? [] : [ADD_ONE_IN_SUITE]),
    ];
    return {
      stateWords: "Waiting on you",
      sentence: words.join(" "),
      act: href ? { label: PAYMENT_ACT[payment], href } : null,
    };
  }
  if (s.can_send !== "BLOCKED") return null;
  const first = messagingProblems(s).at(0);
  return {
    stateWords: "Needs attention",
    sentence: first ? `Meta has stopped this number from sending: ${withStop(first.said)}` : BLOCKED_SENTENCE,
    act: { label: "Open WhatsApp Manager", href: whatsappManagerLink(s.owner_business_id, s.waba_id) },
  };
}

/** The display name as a phrase: “Harbor Moving”, or "your display name" while Meta has given none. */
const displayNameWords = (name: string | null): string => (name ? `the display name “${name}”` : "your display name");

/**
 * What the display name's review says, where it says something an owner can act on: a decline, and a request that lapsed. A
 * name still in review says nothing: until Meta approves one, customers see the number, which the verification's note says.
 * The Connections row's note for the status the standing keeps (the Graph's own words), and the sentence of a decline's
 * notice (nameDecisionWords). One set of words.
 */
function nameWords(status: string | null, name: string | null): string | null {
  const who = displayNameWords(name);
  switch (status) {
    case "DECLINED":
      return `Meta declined ${who} — change it in WhatsApp Manager.`;
    case "EXPIRED":
      return `The request for ${who} expired — submit it again in WhatsApp Manager.`;
    default:
      return null;
  }
}

/**
 * Meta's decision on a display name (the phone_number_name_update webhook: APPROVED, REJECTED, PENDING or DEFERRED) as the status the
 * standing keeps it under, in the Graph's own words. DECLINED is the Graph's word for a rejection, and is taken too.
 */
const NAME_DECISIONS: Readonly<Record<string, string>> = {
  APPROVED: "APPROVED",
  REJECTED: "DECLINED",
  DECLINED: "DECLINED",
  PENDING: "PENDING_REVIEW",
  DEFERRED: "PENDING_REVIEW",
};

const nameStatusOf = (decision: unknown): string | null =>
  typeof decision === "string" && Object.hasOwn(NAME_DECISIONS, decision) ? (NAME_DECISIONS[decision] ?? null) : null;

/**
 * The standing with Meta's decision on the display name applied: the name the decision was about (the standing's own when the notice
 * carries none) and its status, and nothing else of it. A decision that is none of Meta's words corrects nothing (null). Meta's
 * decision is about the requested name and the Graph's `name_status` about the live one, so the next read may put the live name
 * back; the owner's notice (nameDecisionWords) is what told them.
 */
export function standingAfterNameDecision(
  s: NumberStanding,
  decision: unknown,
  requestedName: unknown,
): NumberStanding | null {
  const status = nameStatusOf(decision);
  if (!status) return null;
  return { ...s, name: textOrNull(requestedName) ?? s.name, name_status: status };
}

/**
 * What an owner is told when Meta decides a display name: approved (good news, kept and not alerted) or declined, with the way on
 * and Meta's reason when it gave one (alerted). A name still in review has no notice: the row's own note says so. Null for a decision
 * that is in progress or none of Meta's words.
 */
export function nameDecisionWords(
  decision: unknown,
  requestedName: unknown,
  reason: unknown,
): { subject: string; body: string; alert: boolean } | null {
  const status = nameStatusOf(decision);
  const name = textOrNull(requestedName);
  if (status === "APPROVED")
    return {
      subject: "WhatsApp display name approved",
      body: `Meta approved ${displayNameWords(name)}.`,
      alert: false,
    };
  const declined = status === "DECLINED" ? nameWords(status, name) : null;
  if (!declined) return null;
  const why = textOrNull(reason);
  const said =
    why && why !== "UNKNOWN" && why !== "NONE" ? ` Meta's reason: ${why.toLowerCase().replace(/_/g, " ")}.` : "";
  return { subject: "WhatsApp display name declined", body: `${declined}${said}`, alert: true };
}

/** How many people a day a tier is, in words: "up to 1,000 people a day". */
const peopleADay = (n: number): string => `up to ${n.toLocaleString("en-US")} people a day`;

/**
 * The business's verification, where it changes what the owner can do: not verified (or still in Meta's review), so customers
 * see the number and not the name, and Meta caps the conversations the business may start in a day: the tier Meta gave, or the
 * start a new business has. The cap is said here only where the row's sentence does not say it already (`limitSaid`: the
 * rating's label carries it once the rating is known). Meta's own page to verify on, for the business that owns the account.
 * A verified business says nothing of itself: its tier is the sentence's, and an owner who needs nothing is told nothing.
 * Verification is not asked of anyone: a receptionist whose customers write first needs none, and a business grows into it
 * (more than the day's conversations, its name shown, a third number).
 */
function verificationNote(s: NumberStanding, limitSaid: boolean): ConnectionNote | null {
  if (s.verification === null) return null;
  const word = s.verification.toLowerCase();
  if (word === "verified") return null;
  const tier = dailyLimit(s.limit);
  const cap = tier === null || tier === Number.POSITIVE_INFINITY ? NEW_BUSINESS_LIMIT : tier;
  const capWords = limitSaid ? "" : `, and you can start conversations with ${peopleADay(cap)}`;
  const link = { label: "Verify in Meta", href: securityCenterLink(s.owner_business_id) };
  return word.startsWith("pending")
    ? {
        text: `Meta is reviewing your business's verification: until then customers see your number instead of your name${capWords}.`,
        link: { ...link, label: "See it in Meta" },
      }
    : {
        text: `Not verified with Meta: customers see your number instead of your name${capWords}. Verify when you need more.`,
        link,
      };
}

/**
 * The notes under the WhatsApp row for a number with a standing read: what changes what the owner can do, each its own short
 * line with Meta's page after it, and no more. A declined or lapsed display name, and the business's verification. Nothing for
 * a number nothing was read for, nothing of Meta's own notes and problems (the row's sentence says the one that matters), and
 * nothing of what is fine.
 */
export function standingNotes(s: NumberStanding | null, o: { limitSaid: boolean }): ConnectionNote[] {
  if (!s) return [];
  const out: ConnectionNote[] = [];
  // A name Meta declined or let lapse stops messages until the owner acts: on the row, never behind a press
  // (ConnectionNote.live). The verification is what Meta holds, to act on "when you need more": it waits to be asked.
  const name = nameWords(s.name_status, s.name);
  if (name) out.push({ text: name, live: true });
  const verification = verificationNote(s, o.limitSaid);
  if (verification) out.push(verification);
  return out;
}

/**
 * The owner's alert for a number that has turned BLOCKED, as the bell and the owner's mail say it. A payment method missing
 * or failing says what Meta stops, the conversations the business starts, and where to mend it; anything else says which
 * number, Meta's first problem about messaging and Meta's fix. A number Meta blocked without a reason says so and sends the
 * owner to Connections.
 */
export function standingAlertWords(number: string | null, s: NumberStanding): { subject: string; body: string } {
  const which = formatPhoneDisplay(number) ?? "your number";
  const payment = paymentTrouble(s);
  if (payment) {
    const where = payment === "missing" ? ADD_ONE_IN_SUITE : "Fix it in Meta Business Suite › Billing.";
    return {
      subject: "WhatsApp can't start conversations from your number",
      body: `WhatsApp can't start conversations from ${which}: ${PAYMENT_SENTENCE[payment]} ${where}`,
    };
  }
  const first = messagingProblems(s).at(0);
  const body = first
    ? `WhatsApp can't send from ${which}: ${problemWords(first)}`
    : `WhatsApp can't send from ${which}. Meta did not say why; open Connections to read what it holds.`;
  return { subject: "WhatsApp can't send from your number", body };
}

/**
 * The number's health with what Meta holds against it: a number whose row says "Waiting on you" or "Needs attention"
 * (standingRow) cannot carry a campaign whatever its rating said, and the composer refuses it in the row's own sentence, so
 * the two never disagree. Any other standing, or none read, leaves the health as the rating read it.
 */
export function numberHealthWithStanding(health: NumberHealth, standing: NumberStanding | null): NumberHealth {
  const row = standing ? standingRow(standing) : null;
  return row ? { ...health, canSend: false, tone: "danger", refusal: row.sentence } : health;
}

/**
 * The health of the connected WhatsApp number, from what its channel's config holds: the rating Meta gave at connection
 * (`quality_rating`), the newest quality webhook (`quality_event`) and messaging limit (`messaging_limit`), each read when it
 * is a string and as nothing when it is not, and the standing Meta keeps for the number (`standing`, 00338). THE derivation,
 * so the composer's gate (`whatsappHealthOf`) and Reports' Campaigns lens say the same of the same number.
 */
export function numberHealthOfConfig(config: Record<string, unknown>): NumberHealth {
  const s = (key: string): string | null => {
    const value = config[key];
    return typeof value === "string" ? value : null;
  };
  const health = numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") });
  return numberHealthWithStanding(health, standingFromConfig(config.standing));
}

const CAN_SEND_WORDS: Readonly<Record<string, string>> = {
  AVAILABLE: "can send",
  LIMITED: "limited",
  BLOCKED: "blocked",
};

const sendWords = (w: unknown): string | null => {
  if (typeof w !== "string" || !w) return null;
  return Object.hasOwn(CAN_SEND_WORDS, w) ? (CAN_SEND_WORDS[w] ?? null) : w.toLowerCase().replace(/_/g, " ");
};

/** The Activity log's words for a `channel.standing` event { from?, to }: "from can send to blocked", or the first word read. */
export function standingChangeWords(p: Record<string, unknown>): string | null {
  const to = sendWords(p.to);
  const from = sendWords(p.from);
  if (!to) return null;
  return from ? `from ${from} to ${to}` : to;
}
