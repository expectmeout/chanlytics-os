/** Policy: prices. */

import { HOUR_MS } from "../../shared/time";

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

/**
 * A run of digits as one figure: thousands separators gone ("1,200" and "1.200" are 1200), the decimal mark unified
 * and trailing zeros dropped ("45.50" is "45.5", "45,00" is "45"). A group of exactly three digits after a separator is
 * thousands; one or two after the last separator are cents.
 */
function canonicalNumber(run: string): string {
  const m = /^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(run);
  if (!m) return run.replace(/[.,]0+$/, "");
  const [, whole = "", cents = ""] = m;
  const int = String(Number(whole.replace(/[.,]/g, "")));
  const dec = cents.replace(/0+$/, "");
  return dec ? `${int}.${dec}` : int;
}

/** The number words a price is spelled with, English and Spanish (accents folded), and what each is worth. */
const NUMBER_WORDS: Readonly<Record<string, number>> = /* @__PURE__ */ (() => {
  const record: Record<string, number> = {};
  const units = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
  const teens = ["twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  units.forEach((u, i) => (record[u] = i));
  teens.forEach((t, i) => (record[t] = 12 + i));
  tens.forEach((t, i) => (record[t] = 20 + 10 * i));
  const es = "un uno una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince".split(" ");
  es.forEach((u, i) => (record[u] = i < 3 ? 1 : i - 1));
  ["dieciseis", "diecisiete", "dieciocho", "diecinueve"].forEach((t, i) => (record[t] = 16 + i));
  record.veinte = 20;
  ["veintiun", "veintiuno", "veintiuna"].forEach((t) => (record[t] = 21));
  "veintidos veintitres veinticuatro veinticinco veintiseis veintisiete veintiocho veintinueve"
    .split(" ")
    .forEach((t, i) => (record[t] = 22 + i));
  ["treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"].forEach(
    (t, i) => (record[t] = 30 + 10 * i),
  );
  record.cien = 100;
  record.ciento = 100;
  "doscientos trescientos cuatrocientos quinientos seiscientos setecientos ochocientos novecientos"
    .split(" ")
    .forEach((t, i) => (record[t] = [200, 300, 400, 500, 600, 700, 800, 900][i] ?? 0));
  return record;
})();

/** "forty-five", "two hundred and fifty", "cuarenta y cinco", "mil quinientos" as a number, or null where a word is not one. */
function numberOfWords(words: string): number | null {
  const tokens = words
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((t) => t && t !== "and" && t !== "y");
  if (!tokens.length) return null;
  let total = 0;
  let current = 0;
  for (const t of tokens) {
    if (t === "hundred") current = (current || 1) * 100;
    else if (t === "thousand" || t === "mil") {
      total += (current || 1) * 1000;
      current = 0;
    } else if (t in NUMBER_WORDS) current += NUMBER_WORDS[t] ?? 0;
    else return null;
  }
  return total + current;
}

const CURRENCY_WORDS = new RegExp(String.raw`\b${COUNTRY}(?:${CODES}|${NAMES}|quid)\b`, "gi");

const PERCENT_SIGN = new RegExp(PERCENT, "i");

/** A deal written with digits that are no price: "2x1" is two for one, never a price of 2. */
const DEAL = /\b(?:2\s?x\s?1|dos por uno)\b/i;

/** One matched price as its figure: the canonical number, "%" after a share, and the words where none can be read. */
function figureOf(whole: string): string {
  if (DEAL.test(whole)) return "2x1";
  const percent = PERCENT_SIGN.test(whole) ? "%" : "";
  const run = /\d+(?:[.,]\d+)*/.exec(whole)?.[0];
  if (run) return `${canonicalNumber(run)}${percent}`;
  const spelled = numberOfWords(
    whole
      .replace(CURRENCY_WORDS, " ")
      .replace(PERCENT_SIGN, " ")
      .replace(/\b(?:off|discount)\b/gi, " "),
  );
  return spelled !== null ? `${spelled}${percent}` : whole.toLowerCase().replace(/\s+/g, " ").trim();
}

/** What a number after a price may be instead of a second price: a time, a duration, a count, a phone number. */
const NOT_A_PRICE_AFTER = String.raw`(?!\d|[.,]\d|-\d|\s*(?::|%|-?\s*(?:am|pm|a\.m|p\.m|o'clock|min|mins|minutes?|hours?|hrs?|people|persons?|guests?|days?|weeks?|months?|years?|minutos?|horas?|personas?|d[ií]as?|semanas?|meses|años?)\b))`;

/** The top of a range written after a price: "$45-60", "$45 to 60", "$45 a 60", "$45 hasta 60". */
const RANGE_TOP = new RegExp(
  String.raw`^\s*(?:-|–|—|to|a|hasta)\s*[$€£]?\s*(\d+(?:[.,]\d+)*)${NOT_A_PRICE_AFTER}`,
  "i",
);

/** The top of a range opened by "between" or "entre": "between $45 and 60", "entre $45 y 60". */
const BETWEEN_TOP = new RegExp(String.raw`^\s*(?:and|y)\s*[$€£]?\s*(\d+(?:[.,]\d+)*)${NOT_A_PRICE_AFTER}`, "i");

/** The second figure of a range that starts with a price ending at `to`, or null: "60" of "$45-60". */
function rangeTopAfter(text: string, from: number, to: number): string | null {
  const tail = text.slice(to);
  const top =
    RANGE_TOP.exec(tail) ?? (/\b(?:between|entre)\s+$/i.test(text.slice(0, from)) ? BETWEEN_TOP.exec(tail) : null);
  return top?.[1] ? canonicalNumber(top[1].replace(/[.,]$/, "")) : null;
}

/**
 * Each price a text names, as the figure it states: "45" of "$45", of "45 dollars" and of "forty-five dollars";
 * "1200" of "$1,200"; "20%" of "20% off", so a share never reads as a price of the same number; and the words
 * themselves where a price is written with no number to read ("half price"); and the top of a range ("60" of "$45-60",
 * "$45 to 60", "between $45 and 60"), which a pattern stops short of. So two texts can be asked whether one
 * names a price the other does not (priceBreach; a draft and what its author gave it, the dashboard's person-draft.ts),
 * where violatesNoPrices can only say whether a price is named at all.
 */
export function priceFigures(text: string): string[] {
  const found: string[] = [];
  for (const pRICEPATTERNS of PRICE_PATTERNS) {
    for (const match of text.matchAll(
      new RegExp(
        pRICEPATTERNS.source,
        pRICEPATTERNS.flags.includes("g") ? pRICEPATTERNS.flags : `${pRICEPATTERNS.flags}g`,
      ),
    )) {
      // A pattern may stop at the figure's first digit ("$4" of "$45"): the figure is the whole run it touches.
      let from = match.index;
      let to = match.index + match[0].length;
      while (from > 0 && /[\d.,]/.test(text.charAt(from - 1))) from -= 1;
      while (to < text.length && /[\d.,]/.test(text.charAt(to))) to += 1;
      const figure = figureOf(text.slice(from, to).replace(/[.,]$/, ""));
      found.push(figure);
      const top = /^\d/.test(figure) && !figure.endsWith("%") ? rangeTopAfter(text, from, to) : null;
      if (top) found.push(top);
    }
  }
  return [...new Set(found)];
}

/**
 * Whether a text names a price it may not (decision 0051). With no allowance, any price at all (violatesNoPrices: the
 * strict rule, and every workspace's while "Never quote a price" is on). With one (price-allowance.ts: the amounts the
 * owner wrote, while the switch is off), any figure outside it: a price it worked out, a share, or words it cannot
 * read as a number. ONE predicate for a chat reply (layerTwo), a call (spokenBreach), a steer and the eval judge.
 */
export function priceBreach(text: string, allowed: ReadonlySet<string> | null): boolean {
  if (!allowed) return violatesNoPrices(text);
  return priceFigures(text).some((f) => !allowed.has(f));
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
export type HeldLineKind = "price" | "money" | "booking" | "faq";

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
 *
 * The greeting is not read: the agent's first turn, before the caller has said a word, is the owner's own line spoken as
 * written (contracts voice/greeting-owner.ts, decision 0051), never the receptionist's choice, so a price in it is
 * theirs to say whatever the switch is ("Callers hear this one anyway"). Exempting the turn, never its figures, keeps
 * "Never quote a price" whole for everything the receptionist says after it.
 *
 * `allowed` is the workspace's allowance (price-allowance.ts priceAllowance): null for the strict rule, any price at
 * all; otherwise the amounts the owner wrote, which may be said (priceBreach, the one predicate). Required, so every
 * caller says which: a defaulted one would let a caller forget, and nothing would fail.
 */
export function spokenBreach(
  turns: ReadonlyArray<SpokenTurn> | null | undefined,
  allowed: ReadonlySet<string> | null,
): SpokenBreach | null {
  if (!turns?.length) return null;
  let count = 0;
  let callerSpoke = false;
  for (const t of turns) {
    if (t?.role === "user") callerSpoke = true;
    if (t?.role !== "agent") continue;
    count += 1;
    if (count === 1 && !callerSpoke) continue;
    const sentence = (t.content ?? "").trim();
    if (sentence && priceBreach(sentence, allowed)) return { rule: "price", said: sentence.slice(0, 300), turn: count };
  }
  return null;
}

/** What the owner reads in the Inbox. Names the words, and what they cost. */
export function spokenBreachDetails(spokenBreach: SpokenBreach): string {
  return (
    "The phone receptionist said a price out loud that it may not give: none while “Never quote a price” is on, and otherwise one you haven't written. " +
    `It said: "${spokenBreach.said}" ` +
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
export function guardSpokenTurns(options: {
  turns: ReadonlyArray<SpokenTurn> | null | undefined;
  /** The call is still in progress. */
  live: boolean;
  alreadyCorrected: boolean;
  /** The phone allowance, or null for the strict rule (spokenBreach). */
  allowed: ReadonlySet<string> | null;
}): SpokenGuardVerdict {
  const breach = spokenBreach(options.turns, options.allowed);
  if (!breach) return { breach: null, escalate: null, correct: false };
  return {
    breach,
    escalate: { reason: "policy_block", details: spokenBreachDetails(breach) },
    correct: options.live && !options.alreadyCorrected,
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
 * templates; WhatsApp's is 24 hours from the customer's last WhatsApp message,
 * and an Instagram DM's 24 hours from their last DM (Meta's standard messaging
 * window: past it a business may not write at all, and has no template to write
 * with). The second argument is that wire's own clock (windowClockOf).
 * The reply route enforces it and the composer and the assistant display it,
 * so all three ask here: with separate expressions, the assistant's card told
 * an operator a texting thread was closed while the route would have sent.
 */
export function replyWindow(
  replyChannel: string | null | undefined,
  lastWaInboundAtIso: string | null | undefined,
  now = new Date(),
): WaWindow {
  // WhatsApp and Instagram have a window: a text and an email may be answered whenever.
  return replyChannel === "sms" || replyChannel === "email"
    ? { open: true, closesAtIso: null }
    : waWindow(lastWaInboundAtIso, now);
}
