/**
 * The business's own phone greeting (decision 0051, "The owner's words"): the line a caller hears first, written by the
 * owner in Settings › Business, with no cap and nothing refused (Ruben, 11 Oct 2026: "let users do whatever they want
 * in such regards we can provide tips or warnings thats it").
 *
 * One thing is held here, at the moment the line is spoken, whatever any door stored: the caller is told they are
 * talking to an automated assistant. The receptionist runs on Claude, and Anthropic's usage policy asks every
 * consumer-facing agent to say it is AI at the start of each session. So a line that never says it has the product's
 * clause added; a line that denies it, or claims to be a person, is not spoken, and the standard greeting is. The
 * check is asked here and not at save because other doors write the profile too (migrations, the service role), and a
 * save-time refusal would be a second, bypassable copy of the rule.
 *
 * Everything else is the owner's: the recording sentence may go, the line may run long, it may name a price. The
 * notes below say what each choice means, every one that applies, and never stop a save.
 *
 * The standard line, the paused line and the nameless line are greeting.ts's, unchanged: the shell's default greeting
 * on every Retell agent is GREETING_DEFAULT, and a change to it is a converger run on every agent.
 */
import { greetingFor, pausedGreetingFor } from "./greeting";

/** Where the greeting a caller hears came from: the retell_inbound log line says it, so a call can be traced. */
export type GreetingSource = "standard" | "owner" | "owner_disclosed" | "paused" | "standard_denied";

/** The words a name stands in for in the owner's line: the business's name, filled when the call starts. */
const GREETING_NAME_SLOT = "{business}";

/** The product's clause, added to an owner's line that never says it is automated, in the line's language. */
const AI_CLAUSE = { en: "I'm the automated assistant.", es: "Soy el asistente automático." } as const;

/** The standard greeting as the owner's box shows it: the slot in place of the name, so a rename follows it. */
export const GREETING_TEMPLATE = greetingFor(GREETING_NAME_SLOT);

/**
 * Spoken words past which the note says a caller waits too long. The evidence (the engine review's second pass): the
 * 22-word line, about 8.8 seconds, lost most callers who stayed silent before it ended; the standard line is 16 words
 * with a name. The business's name is left out of the count, since the owner cannot shorten it.
 */
const GREETING_LONG_WORDS = 18;
/** Seconds a spoken word takes at the live voice's pace, for the note's estimate. */
const SECONDS_PER_WORD = 0.4;

/* ------------------------------------------------------------- the checks */

/** A role a caller talks to: what "virtual", "automated" or "AI" must stand before to say the caller is talking to one. */
const ROLE = String.raw`(?:assistant|receptionist|agent|attendant|operator|concierge|helper|host)`;
/** The words that say "a machine" once a claim names the speaker ("I'm an AI", "this is a bot"). */
const MACHINE = String.raw`(?:A\.?I\.?|(?:chat)?bot|robot|machine|computer|automated|automatic|virtual|digital|artificial intelligence)`;

// An AI statement says the CALLER is talking to a machine, in English or Spanish: a machine word before a role ("our AI
// receptionist", "an automated assistant"), or a claim about the speaker ("I'm an AI", "you've reached the automated
// line"). A bare word is not one: "automated booking system", "automatic payments" and Iowa's "IA" say nothing about
// who answers, and a line that only seems to disclose would go out with no disclosure. "assistant" alone is not one
// either (a person is an assistant too). A miss costs a line the product's clause; a false match costs the disclosure.
const STATES_AI: readonly RegExp[] = [
  new RegExp(
    String.raw`\b(?:automated|automatic|virtual|digital|A\.?I\.?|artificial[- ]intelligence|robot(?:ic)?)\s+${ROLE}\b`,
    "i",
  ),
  new RegExp(
    String.raw`\b(?:I'm|I am|this is|you're (?:speaking|talking) (?:with|to)|you are (?:speaking|talking) (?:with|to)|you've reached|you have reached)\s+(?:(?:the|a|an|our|your|\w+'s)\s+)?(?:\w+\s+)?${MACHINE}\b`,
    "i",
  ),
  /\bchat\s?bot\b/i,
  /\b(?:asistente|recepcionista|agente|operador[a]?)\s+(?:virtual|digital|autom[aá]tic[oa]|de\s+IA|de\s+inteligencia\s+artificial)\b/i,
  /\b(?:soy|habla\s+con|est[aá]\s+hablando\s+con|le\s+atiende)\s+(?:(?:el|la|un|una|su|nuestr[oa])\s+)?(?:IA|robot|bot|m[aá]quina|inteligencia\s+artificial|asistente\s+(?:virtual|autom[aá]tic[oa]|digital))\b/i,
];

/** A negation, in the forms a line says it: "not", "never", "isn't". */
const NEGATION = String.raw`(?:not|never|isn't|aren't|ain't|wasn't)`;
/** Up to two words between a negation and what it governs ("not talking to a robot"), never across "but" or a comma. */
const GOVERNED = String.raw`(?:(?!but\b|and\b|or\b|though\b)[\w']+\s+){0,2}`;
/** What a denial denies being: a machine, or a virtual or digital role. */
const DENIED = String.raw`(?:(?:a|an|the|some)\s+)?(?:bot|chatbot|robot|machine|computer|automated|automatic|A\.?I\.?|artificial intelligence|(?:virtual|digital)\s+${ROLE})`;

// A denial of being automated, or a claim to be a person: the line is not spoken, the standard one is. The negation must
// govern the word ("not a bot", "isn't a robot", "not talking to a machine"): "No worries, I'm an AI assistant" and "not
// open now, but our AI assistant can help" are disclosures, and so is "No soy una persona real, soy un asistente virtual".
// "Not a recording" is not a denial: a live receptionist is not a recording either.
const DENIES_AI: readonly RegExp[] = [
  new RegExp(String.raw`\b${NEGATION}\s+${GOVERNED}${DENIED}\b`, "i"),
  /\bno\s+(?:bots?|robots?|machines?|A\.?I\.?)\b/i,
  /\bAI[- ]free\b/i,
  /\b(?:I'm|I am|this is|you're (?:speaking|talking) (?:with|to)|you are (?:speaking|talking) (?:with|to))\s+(?:a\s+)?(?:real|live|actual)\s+(?:person|human)\b/i,
  /(?<!\bnot\s(?:a\s)?)\b(?:a\s+)?(?:real|live|actual)\s+(?:person|human)\s+(?:here|speaking|answering)\b/i,
  /\bno\s+(?:soy|es)\s+(?:un\s+|una\s+)?(?:robot|bot|m[aá]quina|autom[aá]tic[oa]|IA|asistente\s+virtual|inteligencia\s+artificial)\b/i,
  /\bno\s+(?:est[aá]\s+)?habla(?:ndo)?\s+con\s+(?:un\s+|una\s+)?(?:robot|bot|m[aá]quina|IA|asistente\s+virtual)\b/i,
  /(?<!\bno\s)\bsoy\s+una\s+persona(?:\s+real)?\b/i,
  /(?<!\bno\s(?:soy|es)\s(?:una\s)?)\bpersona\s+real\b/i,
];

// The recording, said; and the recording, denied, the negation next to the word ("not recorded", "don't record"), so
// "No problem, calls are recorded." says it.
const SAYS_RECORDING: readonly RegExp[] = [
  /\brecord(?:ed|ing|s)?\b/i,
  /\bgrab(?:a|an|ada|adas|ado|amos|ando|ar|aci[oó]n)\b/i,
];
const DENIES_RECORDING: readonly RegExp[] = [
  /\b(?:not|never)\s+(?:being\s+|be\s+|get\s+)?record(?:ed|ing|s)?\b/i,
  /\bno\s+recordings?\b/i,
  /\b(?:don't|doesn't|won't|aren't|isn't|ain't)\s+(?:being\s+|be\s+)?record(?:ed|ing|s)?\b/i,
  /\bno\s+(?:se\s+)?(?:graba|graban|grabamos|grabada|grabadas|est[aá]\s+grabando|estamos\s+grabando|son\s+grabadas|es\s+grabada)\b/i,
  /\bsin\s+grabar\b/i,
];

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|co|io|us|mx|es)\b/i;
const SPANISH =
  /[¿¡ñ]|\b(?:hola|gracias|llamar|llamada|ayudar|ayudarle|ayudarte|bienvenid[oa]s?|c[oó]mo|est[aá]|usted)\b/i;

/** One word in place of the business's name in the words the checks read, so "this is {business}'s AI" still reads. */
const NAME_STANDS_IN = "Xname";

/**
 * The words the checks read: curly apostrophes made straight (a phone types "isn’t"), and the slot and the business's
 * own name each one neutral word, so "Botanica", "Virtual Hair" or "La Piñata" says nothing.
 */
function judged(text: string, name: string | null): string {
  const straight = (s: string) => s.replace(/[‘’]/g, "'");
  let t = straight(text).split(GREETING_NAME_SLOT).join(NAME_STANDS_IN);
  const n = straight(name ?? "").trim();
  if (n) t = t.split(n).join(NAME_STANDS_IN);
  return t;
}

const any = (rules: readonly RegExp[], t: string) => rules.some((r) => r.test(t));

/** Whether the line tells the caller it is automated, in any words, English or Spanish. */
export function statesAutomated(text: string, name: string | null = null): boolean {
  const t = judged(text, name);
  return any(STATES_AI, t) && !any(DENIES_AI, t);
}

/** Whether the line denies being automated, or claims to be a person. */
export function deniesAutomated(text: string, name: string | null = null): boolean {
  return any(DENIES_AI, judged(text, name));
}

/* ----------------------------------------------------------- the greeting */

/** The name a caller hears: the one typed, trimmed; none when it is blank. One reading for the call, the card and the box. */
export function spokenNameOf(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  return n || null;
}

/** The product's AI clause in the line's language, read with the name taken out ("Hola Beauty" is not Spanish). */
const clauseFor = (text: string, name: string | null): string =>
  SPANISH.test(judged(text, name)) ? AI_CLAUSE.es : AI_CLAUSE.en;

/** The owner's line with the product's AI clause, before its closing question when it ends on one, else after it. */
function withAiClause(text: string, clause: string): string {
  const closing = /^([\s\S]*[.!?…])\s+([^.!?…]*\?)\s*$/.exec(text);
  if (closing) {
    const [, head, question] = closing;
    return `${head} ${clause} ${question}`;
  }
  const trimmed = text.trimEnd();
  return `${trimmed}${/[.!?…]$/.test(trimmed) ? "" : "."} ${clause}`;
}

/**
 * The greeting a caller hears, and where it came from. Paused, the product's take-a-message line. No line stored, a
 * blank one, or one that names the business when no name is known: the standard line. A line that denies being
 * automated or claims to be a person: the standard line. Otherwise the owner's line, the name filled, double braces made
 * single (Retell fills its own {{…}} and never sees ours), and the AI clause added where it never says it.
 */
export function greetingOf(input: {
  name: string | null | undefined;
  stored: string | null | undefined;
  paused: boolean;
  /** The receptionist's own name (profile.assistant_name, decision 0073), said in the standard line; absent, none. */
  assistant?: string | null;
}): { text: string; source: GreetingSource } {
  const name = spokenNameOf(input.name);
  const assistant = input.assistant ?? null;
  if (input.paused) return { text: pausedGreetingFor(name, assistant), source: "paused" };
  const raw = (input.stored ?? "").replace(/\{\{/g, "{").replace(/\}\}/g, "}").trim();
  if (!raw) return { text: greetingFor(name, assistant), source: "standard" };
  if (deniesAutomated(raw, name)) return { text: greetingFor(name, assistant), source: "standard_denied" };
  if (raw.includes(GREETING_NAME_SLOT) && !name) return { text: greetingFor(null, assistant), source: "standard" };
  const filled = name ? raw.split(GREETING_NAME_SLOT).join(name) : raw;
  return statesAutomated(raw, name)
    ? { text: filled, source: "owner" }
    : { text: withAiClause(filled, clauseFor(raw, name)), source: "owner_disclosed" };
}

/* -------------------------------------------------------------- the notes */

/** The notes an owner's line can carry, in the order the box shows them: every one that applies, never a refusal. */
export type GreetingNoteKey =
  "denies_ai" | "adds_ai" | "denies_recording" | "no_recording" | "long" | "link" | "slot" | "money" | "price";

export interface GreetingNote {
  key: GreetingNoteKey;
  words: string;
}

/**
 * What the owner's line means for a caller, most important first. Pure, and asked on every read (the box, the row at
 * rest), so a note follows a later change elsewhere (the price switch turned back on) without a save to catch it.
 * `money` and `prices` are the policy's own detectors, passed in so this module stays free of the policy table.
 */
export function greetingNotes(input: {
  stored: string | null | undefined;
  name: string | null | undefined;
  /** "Never quote a price" in force (guardrailsInForce). */
  neverQuotePrices: boolean;
  namesMoney: (text: string) => boolean;
  namesPrice: (text: string) => boolean;
}): GreetingNote[] {
  const raw = (input.stored ?? "").trim();
  if (!raw) return [];
  const name = spokenNameOf(input.name);
  const t = judged(raw, name);
  const notes: GreetingNote[] = [];
  if (deniesAutomated(raw, name)) {
    notes.push({
      key: "denies_ai",
      words:
        "This says it isn't automated, so callers hear the standard greeting instead: your receptionist always says it's an automated assistant.",
    });
    return notes;
  }
  if (!statesAutomated(raw, name)) {
    notes.push({
      key: "adds_ai",
      words: `It doesn't say it's automated, so callers also hear “${clauseFor(raw, name)}” Say it your own way to replace it.`,
    });
  }
  if (any(DENIES_RECORDING, t)) {
    notes.push({
      key: "denies_recording",
      words: "This tells callers they aren't recorded. Calls to your receptionist are recorded, so that isn't so.",
    });
  } else if (!any(SAYS_RECORDING, t)) {
    notes.push({
      key: "no_recording",
      words:
        "The standard greeting says calls are recorded; yours doesn't. In some places callers have to be told first.",
    });
  }
  const spoken = greetingOf({ name, stored: raw, paused: false }).text;
  const words = (name ? spoken.split(name).join(" ") : spoken).split(/\s+/).filter(Boolean).length;
  if (words > GREETING_LONG_WORDS) {
    notes.push({
      key: "long",
      words: `About ${Math.round(words * SECONDS_PER_WORD)} seconds before a caller can speak. Callers hang up during long greetings; under 7 seconds keeps more of them.`,
    });
  }
  if (LINK.test(t)) notes.push({ key: "link", words: "A web address is read out letter by letter on a call." });
  const [slot] = (raw.match(/\{[^{}]*\}/g) ?? []).filter((s) => s !== GREETING_NAME_SLOT);
  if (slot) {
    notes.push({
      key: "slot",
      words: `${slot} isn't filled in, so callers hear it as written. Only ${GREETING_NAME_SLOT} is.`,
    });
  }
  if (input.namesMoney(t)) {
    notes.push({
      key: "money",
      words: "It mentions a discount, deposit or refund. If a caller asks about it, your receptionist hands it to you.",
    });
  }
  if (input.neverQuotePrices && input.namesPrice(t)) {
    notes.push({
      key: "price",
      words: "It says a price while “Never quote a price” is on. Callers hear this one anyway.",
    });
  }
  return notes;
}
