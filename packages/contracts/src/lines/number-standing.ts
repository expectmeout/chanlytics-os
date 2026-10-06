/**
 * What Meta holds about a connected WhatsApp number, and the words for it.
 *
 * Meta answers, for a phone number and for the account behind it (apps/edge/lib/whatsapp/meta-graph.ts `numberStanding`),
 * whether the number may send at all (`can_send_message`: AVAILABLE, LIMITED or BLOCKED), what stands in the way (each
 * entity's errors, with Meta's own fix), how the display name's review fares, whether the business is verified and how many
 * people it may start a conversation with in a day. The edge keeps that answer whole on the channel's config
 * (`channel_keep_standing`, 00330) and says a change of `can_send` as a `channel.standing` event. This is the one place it
 * is read back and put into words, for the Connections row, the owner's alert and the Activity log: what Meta said, and
 * nothing it did not. A word of Meta's that is not one of the three is kept as Meta said it and never turned into one that is.
 * The account's payment method (is one on file), the business that owns the account and the account itself ride with the standing,
 * so the row can say that none is on file and where to add one (whatsapp-cost.ts).
 */
import { dailyLimit } from "../broadcasts/broadcast-number";
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
 * not counted. Said before Connect, and after it when Meta has not said a tier of its own.
 */
export const NEW_BUSINESS_LIMIT = 250;

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
 * Whether a page that has just opened should ask Meta again: nothing was kept, or what was kept is not AVAILABLE and was read
 * more than ten minutes ago (so a payment method added a minute ago shows as fixed without waiting for the six-hourly
 * read). An AVAILABLE number is the clock's to renew.
 */
export function standingNeedsRead(
  n: { standing: NumberStanding | null; standingReadAt: string | null },
  nowMs: number,
): boolean {
  if (!n.standing) return true;
  if (n.standing.can_send === "AVAILABLE") return false;
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

/** A problem as a note: what Meta said, then how it said to fix it. */
const problemWords = (p: StandingProblem): string =>
  p.fix ? `${withStop(p.said)} ${withStop(p.fix)}` : withStop(p.said);

/** The sentence of a number Meta will not let send, where it named no problem. */
const BLOCKED_SENTENCE = "Meta says WhatsApp cannot send from this number right now.";

/**
 * What a payment method is for. Meta delivers the replies to customers who write first without one, and does not bill them, and does
 * not deliver the messages the business starts, like reminders and campaigns (6 October: a reply was delivered within eight seconds
 * on an account with none). Meta's own problem, "a payment method is required to send messages", says neither, so Chanlytics says it.
 */
const NO_PAYMENT_METHOD =
  "No payment method on your WhatsApp account yet: replies still go out, but reminders and campaigns will not be delivered.";
const PAYMENT_NOTE =
  "Without a payment method, Meta still delivers replies to customers who write first; it does not deliver the messages your business starts, like reminders and campaigns.";
const PAYMENT_PROBLEM = /\bpayment\b/i;

/**
 * The note for the account's payment method. Where the account says none is on file, that is said plainly, with the way to add one: Meta's
 * billing page for this business and this account, or Meta Business Suite where either is not known. Where it could not be read, a
 * problem of Meta's that names a payment gets the note that says what a payment method is for, once; where one is on file, nothing.
 */
function paymentNotes(s: NumberStanding): ConnectionNote[] {
  if (s.has_payment_method === false) {
    const href = addPaymentMethodLink(s.owner_business_id, s.waba_id);
    return href
      ? [{ text: NO_PAYMENT_METHOD, link: { label: "Add one in Meta", href } }]
      : [{ text: `${NO_PAYMENT_METHOD} Add one in Meta Business Suite › Billing.` }];
  }
  const named = s.has_payment_method === null && s.problems.some((p) => PAYMENT_PROBLEM.test(p.said));
  return named ? [{ text: PAYMENT_NOTE }] : [];
}

/** The WhatsApp row's sentence for a number Meta will not let send: Meta's first problem, in its words. */
export function standingSentence(s: NumberStanding): string {
  const first = s.problems.at(0);
  return first ? `Meta: ${withStop(first.said)}` : BLOCKED_SENTENCE;
}

/** The display name as a phrase: “Harbor Moving”, or "your display name" while Meta has given none. */
const displayNameWords = (name: string | null): string => (name ? `the display name “${name}”` : "your display name");

/**
 * What the display name's review says, where it says something an owner can act on: the Connections row's note for the status the
 * standing keeps (the Graph's own words), and the sentence of a decline's notice (nameDecisionWords). One set of words.
 */
function nameWords(status: string | null, name: string | null): string | null {
  const who = displayNameWords(name);
  switch (status) {
    case "PENDING_REVIEW":
      return `Meta is reviewing ${who}; until then customers see the number.`;
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
 * Where the business stands with Meta and what it may start: verified, at the tier Meta gave; or not verified, at the tier
 * Meta gave or at the start a new business has. Replies to customers who write first are never limited, and the note says so.
 */
function verificationNote(s: NumberStanding): string | null {
  if (s.verification === null) return null;
  const tier = dailyLimit(s.limit);
  if (s.verification.toLowerCase() === "verified") {
    if (tier === Number.POSITIVE_INFINITY)
      return "Your business is verified with Meta and has no daily limit on starting conversations.";
    return tier === null
      ? "Your business is verified with Meta."
      : `Your business is verified with Meta: you can start conversations with ${peopleADay(tier)}.`;
  }
  const cap = tier === null || tier === Number.POSITIVE_INFINITY ? NEW_BUSINESS_LIMIT : tier;
  return `Your business isn't verified with Meta: you can start conversations with ${peopleADay(cap)}. Replies to customers who write first are not limited.`;
}

/**
 * The notes under the WhatsApp row for a number with a standing read: Meta's problems (a blocked number's first is the
 * row's sentence, so its note is the fix and the rest), the note for the account's payment method, what Meta added, the display
 * name's review and the business's verification. Nothing for a number nothing was read for.
 */
export function standingNotes(s: NumberStanding | null): ConnectionNote[] {
  if (!s) return [];
  const out: ConnectionNote[] = [];
  const first = s.problems.at(0);
  if (s.can_send === "BLOCKED") {
    if (first?.fix) out.push({ text: withStop(first.fix) });
    for (const p of s.problems.slice(1)) out.push({ text: problemWords(p) });
  } else {
    for (const p of s.problems) out.push({ text: problemWords(p) });
  }
  out.push(...paymentNotes(s));
  for (const n of s.notes) out.push({ text: withStop(n) });
  const name = nameWords(s.name_status, s.name);
  if (name) out.push({ text: name });
  const verification = verificationNote(s);
  if (verification) out.push({ text: verification });
  return out.filter((n, at) => out.findIndex((m) => m.text === n.text) === at);
}

/**
 * The owner's alert for a number that has turned BLOCKED, as the bell and the owner's mail say it: which number, Meta's
 * first problem and Meta's fix. A number Meta blocked without a reason says so and sends the owner to Connections.
 */
export function standingAlertWords(number: string | null, s: NumberStanding): { subject: string; body: string } {
  const which = formatPhoneDisplay(number) ?? "your number";
  const first = s.problems.at(0);
  const body = first
    ? `WhatsApp can't send from ${which}: ${problemWords(first)}`
    : `WhatsApp can't send from ${which}. Meta did not say why; open Connections to read what it holds.`;
  return { subject: "WhatsApp can't send from your number", body };
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
