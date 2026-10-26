import { greetingFor, pausedGreetingFor } from "./greeting.js";
const GREETING_NAME_SLOT = "{business}";
const AI_CLAUSE = { en: "I'm the automated assistant.", es: "Soy el asistente autom\xE1tico." };
export const GREETING_TEMPLATE = greetingFor(GREETING_NAME_SLOT);
const GREETING_LONG_WORDS = 18;
const SECONDS_PER_WORD = 0.4;
const ROLE = String.raw`(?:assistant|receptionist|agent|attendant|operator|concierge|helper|host)`;
const MACHINE = String.raw`(?:A\.?I\.?|(?:chat)?bot|robot|machine|computer|automated|automatic|virtual|digital|artificial intelligence)`;
const STATES_AI = [
  new RegExp(
    String.raw`\b(?:automated|automatic|virtual|digital|A\.?I\.?|artificial[- ]intelligence|robot(?:ic)?)\s+${ROLE}\b`,
    "i"
  ),
  new RegExp(
    String.raw`\b(?:I'm|I am|this is|you're (?:speaking|talking) (?:with|to)|you are (?:speaking|talking) (?:with|to)|you've reached|you have reached)\s+(?:(?:the|a|an|our|your|\w+'s)\s+)?(?:\w+\s+)?${MACHINE}\b`,
    "i"
  ),
  /\bchat\s?bot\b/i,
  /\b(?:asistente|recepcionista|agente|operador[a]?)\s+(?:virtual|digital|autom[aá]tic[oa]|de\s+IA|de\s+inteligencia\s+artificial)\b/i,
  /\b(?:soy|habla\s+con|est[aá]\s+hablando\s+con|le\s+atiende)\s+(?:(?:el|la|un|una|su|nuestr[oa])\s+)?(?:IA|robot|bot|m[aá]quina|inteligencia\s+artificial|asistente\s+(?:virtual|autom[aá]tic[oa]|digital))\b/i
];
const NEGATION = String.raw`(?:not|never|isn't|aren't|ain't|wasn't)`;
const GOVERNED = String.raw`(?:(?!but\b|and\b|or\b|though\b)[\w']+\s+){0,2}`;
const DENIED = String.raw`(?:(?:a|an|the|some)\s+)?(?:bot|chatbot|robot|machine|computer|automated|automatic|A\.?I\.?|artificial intelligence|(?:virtual|digital)\s+${ROLE})`;
const DENIES_AI = [
  new RegExp(String.raw`\b${NEGATION}\s+${GOVERNED}${DENIED}\b`, "i"),
  /\bno\s+(?:bots?|robots?|machines?|A\.?I\.?)\b/i,
  /\bAI[- ]free\b/i,
  /\b(?:I'm|I am|this is|you're (?:speaking|talking) (?:with|to)|you are (?:speaking|talking) (?:with|to))\s+(?:a\s+)?(?:real|live|actual)\s+(?:person|human)\b/i,
  /(?<!\bnot\s(?:a\s)?)\b(?:a\s+)?(?:real|live|actual)\s+(?:person|human)\s+(?:here|speaking|answering)\b/i,
  /\bno\s+(?:soy|es)\s+(?:un\s+|una\s+)?(?:robot|bot|m[aá]quina|autom[aá]tic[oa]|IA|asistente\s+virtual|inteligencia\s+artificial)\b/i,
  /\bno\s+(?:est[aá]\s+)?habla(?:ndo)?\s+con\s+(?:un\s+|una\s+)?(?:robot|bot|m[aá]quina|IA|asistente\s+virtual)\b/i,
  /(?<!\bno\s)\bsoy\s+una\s+persona(?:\s+real)?\b/i,
  /(?<!\bno\s(?:soy|es)\s(?:una\s)?)\bpersona\s+real\b/i
];
const SAYS_RECORDING = [
  /\brecord(?:ed|ing|s)?\b/i,
  /\bgrab(?:a|an|ada|adas|ado|amos|ando|ar|aci[oó]n)\b/i
];
const DENIES_RECORDING = [
  /\b(?:not|never)\s+(?:being\s+|be\s+|get\s+)?record(?:ed|ing|s)?\b/i,
  /\bno\s+recordings?\b/i,
  /\b(?:don't|doesn't|won't|aren't|isn't|ain't)\s+(?:being\s+|be\s+)?record(?:ed|ing|s)?\b/i,
  /\bno\s+(?:se\s+)?(?:graba|graban|grabamos|grabada|grabadas|est[aá]\s+grabando|estamos\s+grabando|son\s+grabadas|es\s+grabada)\b/i,
  /\bsin\s+grabar\b/i
];
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|co|io|us|mx|es)\b/i;
const SPANISH = /[¿¡ñ]|\b(?:hola|gracias|llamar|llamada|ayudar|ayudarle|ayudarte|bienvenid[oa]s?|c[oó]mo|est[aá]|usted)\b/i;
const NAME_STANDS_IN = "Xname";
function judged(text, name) {
  const straight = (s) => s.replace(/[‘’]/g, "'");
  let t = straight(text).split(GREETING_NAME_SLOT).join(NAME_STANDS_IN);
  const n = straight(name ?? "").trim();
  if (n) t = t.split(n).join(NAME_STANDS_IN);
  return t;
}
const any = (rules, t) => rules.some((r) => r.test(t));
export function statesAutomated(text, name = null) {
  const t = judged(text, name);
  return any(STATES_AI, t) && !any(DENIES_AI, t);
}
export function deniesAutomated(text, name = null) {
  return any(DENIES_AI, judged(text, name));
}
export function spokenNameOf(name) {
  const n = (name ?? "").trim();
  return n || null;
}
const clauseFor = (text, name) => SPANISH.test(judged(text, name)) ? AI_CLAUSE.es : AI_CLAUSE.en;
function withAiClause(text, clause) {
  const closing = /^([\s\S]*[.!?…])\s+([^.!?…]*\?)\s*$/.exec(text);
  if (closing) {
    const [, head, question] = closing;
    return `${head} ${clause} ${question}`;
  }
  const trimmed = text.trimEnd();
  return `${trimmed}${/[.!?…]$/.test(trimmed) ? "" : "."} ${clause}`;
}
export function greetingOf(input) {
  const name = spokenNameOf(input.name);
  const assistant = input.assistant ?? null;
  if (input.paused) return { text: pausedGreetingFor(name, assistant), source: "paused" };
  const raw = (input.stored ?? "").replace(/\{\{/g, "{").replace(/\}\}/g, "}").trim();
  if (!raw) return { text: greetingFor(name, assistant), source: "standard" };
  if (deniesAutomated(raw, name)) return { text: greetingFor(name, assistant), source: "standard_denied" };
  if (raw.includes(GREETING_NAME_SLOT) && !name) return { text: greetingFor(null, assistant), source: "standard" };
  const filled = name ? raw.split(GREETING_NAME_SLOT).join(name) : raw;
  return statesAutomated(raw, name) ? { text: filled, source: "owner" } : { text: withAiClause(filled, clauseFor(raw, name)), source: "owner_disclosed" };
}
export function greetingNotes(input) {
  const raw = (input.stored ?? "").trim();
  if (!raw) return [];
  const name = spokenNameOf(input.name);
  const t = judged(raw, name);
  const notes = [];
  if (deniesAutomated(raw, name)) {
    notes.push({
      key: "denies_ai",
      words: "This says it isn't automated, so callers hear the standard greeting instead: your receptionist always says it's an automated assistant."
    });
    return notes;
  }
  if (!statesAutomated(raw, name)) {
    notes.push({
      key: "adds_ai",
      words: `It doesn't say it's automated, so callers also hear \u201C${clauseFor(raw, name)}\u201D Say it your own way to replace it.`
    });
  }
  if (any(DENIES_RECORDING, t)) {
    notes.push({
      key: "denies_recording",
      words: "This tells callers they aren't recorded. Calls to your receptionist are recorded, so that isn't so."
    });
  } else if (!any(SAYS_RECORDING, t)) {
    notes.push({
      key: "no_recording",
      words: "The standard greeting says calls are recorded; yours doesn't. In some places callers have to be told first."
    });
  }
  const spoken = greetingOf({ name, stored: raw, paused: false }).text;
  const words = (name ? spoken.split(name).join(" ") : spoken).split(/\s+/).filter(Boolean).length;
  if (words > GREETING_LONG_WORDS) {
    notes.push({
      key: "long",
      words: `About ${Math.round(words * SECONDS_PER_WORD)} seconds before a caller can speak. Callers hang up during long greetings; under 7 seconds keeps more of them.`
    });
  }
  if (LINK.test(t)) notes.push({ key: "link", words: "A web address is read out letter by letter on a call." });
  const [slot] = (raw.match(/\{[^{}]*\}/g) ?? []).filter((s) => s !== GREETING_NAME_SLOT);
  if (slot) {
    notes.push({
      key: "slot",
      words: `${slot} isn't filled in, so callers hear it as written. Only ${GREETING_NAME_SLOT} is.`
    });
  }
  if (input.namesMoney(t)) {
    notes.push({
      key: "money",
      words: "It mentions a discount, deposit or refund. If a caller asks about it, your receptionist hands it to you."
    });
  }
  if (input.neverQuotePrices && input.namesPrice(t)) {
    notes.push({
      key: "price",
      words: "It says a price while \u201CNever quote a price\u201D is on. Callers hear this one anyway."
    });
  }
  return notes;
}
