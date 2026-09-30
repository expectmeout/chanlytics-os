/**
 * Layer-2 policy enforcement (Blueprint §6): deterministic post-generation
 * checks — prompt text is never the only defense. Two hard rules: no price,
 * in any currency or in words (violatesNoPrices), and no money (namesMoney):
 * a refund, a discount, a deposit or a payment term is a person's to decide,
 * whatever the model made of the prompt (the money charter, defect 5).
 */

import { MIN_MS, HOUR_MS } from "../shared/time";
import { PolicyLimitsSchema } from "./workspace-config/policy-classes";

/** A currency by its code, before or after a figure: USD 45, 45 EUR, 450 MXN. */
const CODES = "usd|eur|gbp|mxn|cad|aud|cop|ars|clp|pen|brl";
/** A currency by its name, after a figure: 45 dollars, 45 euros, 450 pesos, 45 dólares. */
const NAMES = "dollars?|bucks?|euros?|quid|pesos?|d[oó]lares?|reales?";
/** A country's word before a currency's name: 45 US dollars, 45 Canadian dollars, 450 Mexican pesos. */
const COUNTRY = String.raw`(?:(?:u\.?s\.?|american|canadian|australian|mexican|argentine|colombian|chilean)\s+)?`;
/** The numbers a price is spelled with, in English and in Spanish. */
const EN_NUMBER =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)";
const ES_NUMBER =
  "(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci[a-zé]+|veinte|veinti[a-zéáíóú]+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|quinientos|[a-z]+cientos|mil)";
/** "per cent", "percent", "por ciento" and the sign: a share, written any of the ways a reply writes one. */
const PERCENT = String.raw`(?:%|per\s?cent|percent|por\s+ciento)`;

// A figure with a currency, in any of the ways a reply writes one -- $45, € 45,
// 45€, £30, MX$450, USD 45, 45 EUR, 450 MXN, 45 dollars, forty-five dollars,
// cuarenta y cinco pesos -- or a cut to one: 20% off, un 15% de descuento,
// half price. Bare durations and times ("45 minutes", "at 9:30") are not prices.
const PRICE_PATTERNS: RegExp[] = [
  /[$€£¥₹]\s?\d/,
  /\d\s?[€£]/,
  /\b\d+(?:[.,]\d{1,2})?\s?\$/,
  new RegExp(String.raw`\b(?:${CODES})\s?\d`, "i"),
  new RegExp(String.raw`\b\d+(?:[.,]\d{1,2})?\s?${COUNTRY}(?:${CODES}|${NAMES})\b`, "i"),
  new RegExp(
    String.raw`\b${EN_NUMBER}(?:[\s-]+(?:and[\s-]+)?${EN_NUMBER})*[\s-]+${COUNTRY}(?:dollars?|bucks?|euros?|pesos?|quid)\b`,
    "i",
  ),
  new RegExp(String.raw`\b${ES_NUMBER}(?:\s+(?:y\s+)?${ES_NUMBER})*\s+(?:pesos?|d[oó]lares?|euros?)\b`, "i"),
  new RegExp(String.raw`\b\d{1,3}\s?${PERCENT}\s?(?:off|discount|de descuento|descuento|menos)\b`, "i"),
  new RegExp(String.raw`\b${EN_NUMBER}(?:[\s-]+${EN_NUMBER})*\s+${PERCENT}\s+(?:off|discount)\b`, "i"),
  new RegExp(String.raw`\b(?:discount|descuento)\s+(?:of\s+|del?\s+)?\d{1,3}\s?${PERCENT}`, "i"),
  /\b(?:half[\s-]price|half off|mitad de precio|2\s?x\s?1|dos por uno)\b/i,
];

export function violatesNoPrices(text: string): boolean {
  return PRICE_PATTERNS.some((p) => p.test(text));
}

// Money the receptionist never decides, in English and Spanish: a refund, a
// discount or coupon, a deposit, a payment plan, financing, a waived fee, a
// thing given free of charge. Payment methods ("we take cards") are not here:
// they are a fact, not a term.
const MONEY_PATTERNS: RegExp[] = [
  /\brefund(?:s|ed|ing|able)?\b/i,
  /\breimburs\w*/i,
  /\bmoney back\b/i,
  /\bdiscount(?:s|ed)?\b/i,
  /\b(?:coupons?|vouchers?|promo(?:s| codes?)?|promotions?)\b/i,
  /\b(?:free of charge|on the house|no charge|at no (?:extra )?cost)\b/i,
  /\bdeposits?\b/i,
  /\bdown[\s-]payments?\b/i,
  /\bpayment plans?\b/i,
  /\binstall?ments?\b/i,
  /\bfinanc(?:e|ed|ing)\b/i,
  /\bpay (?:it )?(?:later|over time|in (?:\d+|two|three|four|six|twelve) (?:payments|installments|months))\b/i,
  /\bwaiv(?:e|ed|ing) (?:the |your |a |any )?(?:fee|charge|deposit|cost)s?\b/i,
  /\breembols\w*/i,
  /\bdevoluci[oó]n\b/i,
  /\bdev(?:olv|uelv)\w*\s+(?:el|tu|su)\s+dinero\b/i,
  /\bdescuentos?\b/i,
  /\bcup[oó]n(?:es)?\b/i,
  /\bpromoci[oó]n(?:es)?\b/i,
  /\b(?:sin costo|sin cargo|de cortes[ií]a)\b/i,
  /\brebajas?\b/i,
  /\bdep[oó]sitos?\b/i,
  /\banticipos?\b/i,
  /\benganche\b/i,
  /\bplan(?:es)? de pagos?\b/i,
  /\ba plazos\b/i,
  /\bmensualidades\b/i,
  /\bfinanciamiento\b/i,
  /\bfinanciaci[oó]n\b/i,
  /\bmeses sin intereses\b/i,
];

/**
 * Whether a reply names money the receptionist may not decide: a refund, a
 * discount, a deposit or a payment term, in English or Spanish. Layer two
 * holds such a reply for a person even when the model's intent says it was
 * about something else; a reply that only says someone will be in touch about
 * it is held too, and loses nothing: the words it is replaced with say the same.
 */
export function namesMoney(text: string): boolean {
  return MONEY_PATTERNS.some((p) => p.test(text));
}

/** Why layer two replaced a reply: a price, money, a booking or a service question under "ask". */
export const HELD_LINE_KINDS = ["price", "money", "booking", "faq"] as const;
export type HeldLineKind = (typeof HELD_LINE_KINDS)[number];

/**
 * The words a customer gets instead of a held reply, in the language the
 * receptionist was answering in (the brain's record says which), in no one
 * trade's words. English is also what "other" gets: the one the workspace's
 * own greetings are written in by default.
 */
const HELD_LINES: Record<"en" | "es", Record<HeldLineKind, string> & { urgent: (phone: string) => string }> = {
  en: {
    price: "Good question! A member of our team will follow up here with the details shortly.",
    money: "Thanks for asking. A member of our team will get back to you here about that shortly.",
    booking: "A member of our team will confirm your booking with you shortly.",
    faq: "A member of our team will get back to you with the details shortly.",
    urgent: (phone) => ` For anything urgent, call ${phone}.`,
  },
  es: {
    price: "¡Buena pregunta! Alguien de nuestro equipo te responderá aquí con los detalles en breve.",
    money: "Gracias por preguntar. Alguien de nuestro equipo te responderá aquí sobre eso en breve.",
    booking: "Alguien de nuestro equipo te confirmará la cita en breve.",
    faq: "Alguien de nuestro equipo te responderá con los detalles en breve.",
    urgent: (phone) => ` Si es urgente, llama al ${phone}.`,
  },
};

/** The line for a held reply, in the answer's language, with the number to call when there is one. */
export function heldLine(kind: HeldLineKind, language: string | null | undefined, phone: string | null): string {
  const words = language === "es" ? HELD_LINES.es : HELD_LINES.en;
  return `${words[kind]}${phone ? words.urgent(phone) : ""}`;
}

/* ------------------------------------------- the same rule, said out loud */

/**
 * THE SAME RULE, WHERE THERE IS NO DRAFT TO REPLACE.
 *
 * On text, layerTwo runs `violatesNoPrices` over the model's draft and swaps
 * the words before the customer ever sees them: real prevention, and it works
 * only because a draft sits between the model and the person reading it.
 *
 * A call has no such gap. The provider hosts the agent and it speaks
 * directly, so by the time a transcript turn reaches us the caller has
 * already heard it. The guardrails on that side were prompt lines and nothing
 * else, which is why voice rated lowest on the systems map: an instruction is
 * not an enforcement, and a model may disregard one.
 *
 * So this is the honest equivalent rather than a pretend one. The same
 * detector reads the agent's turns as they arrive; a breach cannot be
 * unspoken, but it can be corrected in what the agent says NEXT, and the
 * owner can be told while the call is still live. Detection is per turn
 * because the provider delivers per turn; when that delivery is switched off
 * on the agent, the same check still runs on the final transcript and the
 * owner is told after the fact instead. Degrading is the point: it never
 * silently does nothing.
 *
 * Only `price` is detected, and that is deliberate. A currency figure is a
 * clean signal. "You are booked for Tuesday" and "I am a real person" are
 * not: the phrases that would catch them also catch the agent DECLINING to
 * book and the agent CORRECTLY saying it is an automated assistant, and a
 * guardrail that fires on the compliant answer is worse than none, because
 * it teaches an owner to ignore it. The type is open so a second rule can
 * join it the day there is a signal worth trusting.
 */
export type SpokenRule = "price";

export interface SpokenBreach {
  rule: SpokenRule;
  /** The agent's own words, trimmed for the record. */
  said: string;
  /** Which of the agent's turns it was, counting only the agent's. */
  turn: number;
}

/** One spoken turn, as the provider delivers it. */
export interface SpokenTurn {
  role: string;
  content: string;
}

/**
 * The FIRST thing the agent said that broke a standing rule, or null.
 *
 * ONLY the agent's own speech is read. The caller may say any figure they
 * like, and a correction arrives back in the transcript as a turn of role
 * "injected" — so a check that scanned every turn would find the rule it had
 * just quoted, correct the call again, and keep doing it for the length of
 * the call.
 */
export function spokenBreach(turns: ReadonlyArray<SpokenTurn> | null | undefined): SpokenBreach | null {
  if (!turns?.length) return null;
  let n = 0;
  for (const t of turns) {
    if (t?.role !== "agent") continue;
    n += 1;
    const said = (t.content ?? "").trim();
    if (said && violatesNoPrices(said)) return { rule: "price", said: said.slice(0, 300), turn: n };
  }
  return null;
}

/** What the owner reads in the Inbox. Names the words, and what they cost. */
export function spokenBreachDetails(b: SpokenBreach): string {
  return (
    "The phone receptionist quoted a price out loud, which its standing rules do not allow. " +
    `It said: "${b.said}" ` +
    "A call cannot be taken back the way a draft can, so check what the caller was told before confirming anything."
  );
}

export interface SpokenGuardVerdict {
  breach: SpokenBreach | null;
  /** What the owner is told. The same reason a blocked text draft raises. */
  escalate: { reason: "policy_block"; details: string } | null;
  /** Whether the LIVE call should be corrected: only while it is still running, and only once. */
  correct: boolean;
}

/**
 * What to do about the agent's turns so far.
 *
 * The escalation is raised whether or not the call is still live, because the
 * owner needs to know either way; the correction is attempted only while
 * there is a call left to correct, and only once, because a receptionist
 * being told the same thing every turn is worse than being told once.
 */
export function guardSpokenTurns(o: {
  turns: ReadonlyArray<SpokenTurn> | null | undefined;
  /** The call is still in progress. */
  live: boolean;
  alreadyCorrected: boolean;
}): SpokenGuardVerdict {
  const breach = spokenBreach(o.turns);
  if (!breach) return { breach: null, escalate: null, correct: false };
  return {
    breach,
    escalate: { reason: "policy_block", details: spokenBreachDetails(breach) },
    correct: o.live && !o.alreadyCorrected,
  };
}

/** The WhatsApp 24h customer-service window (Blueprint §4/§6). Pure — imported
 *  by BOTH the reply endpoint (enforcement) and the composer (honest display). */
export const WA_WINDOW_MS = 24 * HOUR_MS;

export interface WaWindow {
  open: boolean;
  /** When the window closes (null when it never opened). */
  closesAtIso: string | null;
}

export function waWindow(lastWaInboundAtIso: string | null | undefined, now = new Date()): WaWindow {
  if (!lastWaInboundAtIso) return { open: false, closesAtIso: null };
  const closes = new Date(lastWaInboundAtIso).getTime() + WA_WINDOW_MS;
  return { open: closes > now.getTime(), closesAtIso: new Date(closes).toISOString() };
}

/**
 * Whether a reply may be written freely, on the channel it goes out on.
 *
 * A reply goes back where the customer last wrote. A text has no window and no
 * templates; WhatsApp's is 24 hours from the customer's last WhatsApp message.
 * The reply route enforces it and the composer and the assistant display it,
 * so all three ask here: with separate expressions, the assistant's card told
 * an operator a texting thread was closed while the route would have sent.
 */
export function replyWindow(
  replyChannel: string | null | undefined,
  lastWaInboundAtIso: string | null | undefined,
  now = new Date(),
): WaWindow {
  // Only WhatsApp has a window: a text and an email may be answered whenever.
  return replyChannel === "sms" || replyChannel === "email"
    ? { open: true, closesAtIso: null }
    : waWindow(lastWaInboundAtIso, now);
}

/**
 * How long one reply may be on each wire, and the sentence for one that is
 * longer. WhatsApp's and the carriers' limits are theirs; email's is ours, the
 * same bound an email taken in is kept to. Asked before anything is queued: a
 * reply over WhatsApp's limit was once stored, reported queued, and failed
 * fifteen seconds later as an escalation and an alert.
 */
export const REPLY_LIMITS = {
  whatsapp: { max: 4096, refusal: "WhatsApp refuses a message over 4096 characters." },
  sms: { max: 1600, refusal: "A text can be at most 1600 characters." },
  email: { max: 20000, refusal: "An email reply can be at most 20,000 characters." },
} as const;
/** The longest reply any wire takes: what a route may accept before it knows the wire. */
export const REPLY_MAX_ANY = Math.max(...Object.values(REPLY_LIMITS).map((l) => l.max));

/* ----------------------------- live calls -------------------------------- */

/**
 * How long a call may go without any sign of life before we stop calling it
 * live, whatever its status column says.
 *
 * `calls.status = 'ongoing'` is written from Retell's own `call_status`, and it
 * is only ever cleared by a later webhook. So a single lost `call_ended` — a
 * deploy mid-call, a provider blip, a 500 on our side — leaves that row
 * `ongoing` FOREVER, and anything reading the flag alone shows a call in
 * progress that hung up days ago. A status flag is a claim; this is the
 * evidence.
 *
 * Ten minutes, not ninety seconds, and the difference is a deployment fact
 * rather than a preference: with only `call_started` and `call_ended`
 * configured on the Retell webhook, nothing touches the row between them, so a
 * tight bound would declare every ordinary call dead a minute into it. Enabling
 * the `transcript_updated` event — which fires on every turn — makes the
 * heartbeat continuous and this bound effectively tight, at which point it can
 * come down.
 *
 * This is a DISPLAY guard, not the fix. It bounds how long a phantom can be
 * shown; only reconciling against the provider makes the row itself honest.
 */
export const CALL_HEARTBEAT_MS = 10 * MIN_MS;

export function isLiveCall(
  call: { status: string; updated_at?: string | null; started_at?: string | null },
  now = new Date(),
): boolean {
  if (call.status !== "ongoing") return false;
  // updated_at moves on every ingest (moddatetime + the upsert in ingest_call);
  // started_at is the fallback for a row written before that was true.
  const beat = call.updated_at ?? call.started_at;
  // Ongoing with no timestamp at all is not evidence of anything.
  if (!beat) return false;
  const at = new Date(beat).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < CALL_HEARTBEAT_MS;
}

/* --------------------------- the veto window ------------------------------ */

/**
 * How long the receptionist holds its own reply before sending it.
 *
 * A text channel is not a phone call. Nobody expects a WhatsApp answer in under
 * a second, so a short pause costs the customer nothing — and it converts the
 * only two options a business had, "let the bot speak" or "turn the bot off",
 * into a third: let it draft, and redirect it before the customer ever sees it.
 * Correcting a message that has already been read is not a feature; this is.
 */
export const REPLY_DELAY_DEFAULT_MS = 30_000;
export const REPLY_DELAY_MIN_MS = 5_000;
export const REPLY_DELAY_MAX_MS = 10 * MIN_MS;

/**
 * The two limits a workspace is seeded with and Autonomy states: automatic
 * replies to one person in a day, and the hours a person's reply keeps the
 * receptionist off a thread. The runtime keeps its own copy of the cap (core's
 * MAX_REPLIES_PER_DAY), and a test holds it equal to this one; every pause reads
 * pauseHoursOf.
 */
export const REPLY_CAP_DEFAULT = 20;
export const PAUSE_HOURS_DEFAULT = 24;

/**
 * How long a person's touch keeps the receptionist off a thread, in hours, from
 * the reply policy's limits. A stored `pause_hours` counts when it is one the
 * reply policy's schema allows, which is all `PUT policies` and the Autonomy
 * dial write (a whole number from 1 to 168); anything else, or nothing, is the
 * default day. The pause, the handoff email and the pane's words all read this,
 * so none of them can say one number and apply another.
 */
export function pauseHoursOf(limits: { pause_hours?: unknown } | null | undefined): number {
  const stored = PolicyLimitsSchema.shape.pause_hours.safeParse(limits?.pause_hours);
  return stored.success && stored.data !== undefined ? stored.data : PAUSE_HOURS_DEFAULT;
}

/** The same pause in ms, for a `paused_until`. */
export function pauseMsOf(limits: { pause_hours?: unknown } | null | undefined): number {
  return pauseHoursOf(limits) * HOUR_MS;
}

/**
 * The hard limits in an owner's words (the wiring audit's S6). The card called
 * the last two "this workspace's own values", then limits Chanlytics set that
 * nothing on the page could change; they are the owner's two dials now. Each
 * says what it does and what its default is, and the value a dial shows is the
 * stored one, or the default when nothing is stored.
 */
export function hardLimitsWords(limits: { max_replies_day?: unknown; pause_hours?: unknown } | null | undefined): {
  sub: string;
  replies: string;
  pause: string;
  cap: number;
  hours: number;
} {
  const stored = (v: unknown): number | null => {
    const n = Number(v);
    return v !== undefined && v !== null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    sub: "The first two never change; the last two are yours to set",
    replies: `How many it sends before it stops and asks for you. ${REPLY_CAP_DEFAULT} is the default.`,
    pause: `Counted from Take over, a reply sent from the Inbox or the WhatsApp Business app, or a handoff to you. ${PAUSE_HOURS_DEFAULT} hours is the default.`,
    cap: stored(limits?.max_replies_day) ?? REPLY_CAP_DEFAULT,
    hours: pauseHoursOf(limits),
  };
}

/**
 * The wait for THIS reply, in ms. Zero means send now.
 *
 * Clamped rather than trusted: `limits` is tenant-editable JSON, and a typo of
 * one extra zero would leave a customer waiting hours for an answer the bot had
 * already written. A configuration mistake should degrade the experience by
 * seconds, never strand someone.
 */
export function replyDelayMs(mode: string | null | undefined, limits?: { reply_delay_ms?: number } | null): number {
  // 'auto' answers immediately — that is what it means. Every other mode either
  // holds for a human or never speaks, and neither reaches a send.
  if (mode !== "veto") return 0;
  const raw = limits?.reply_delay_ms;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return REPLY_DELAY_DEFAULT_MS;
  return Math.min(REPLY_DELAY_MAX_MS, Math.max(REPLY_DELAY_MIN_MS, Math.round(raw)));
}
