import { MIN_MS, HOUR_MS } from "../shared/time.js";
const CODES = "usd|eur|gbp|mxn|cad|aud|cop|ars|clp|pen|brl";
const NAMES = "dollars?|bucks?|euros?|quid|pesos?|d[o\xF3]lares?|reales?";
const COUNTRY = String.raw`(?:(?:u\.?s\.?|american|canadian|australian|mexican|argentine|colombian|chilean)\s+)?`;
const EN_NUMBER = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)";
const ES_NUMBER = "(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci[a-z\xE9]+|veinte|veinti[a-z\xE9\xE1\xED\xF3\xFA]+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|quinientos|[a-z]+cientos|mil)";
const PERCENT = String.raw`(?:%|per\s?cent|percent|por\s+ciento)`;
const PRICE_PATTERNS = [
  /[$€£¥₹]\s?\d/,
  /\d\s?[€£]/,
  /\b\d+(?:[.,]\d{1,2})?\s?\$/,
  new RegExp(String.raw`\b(?:${CODES})\s?\d`, "i"),
  new RegExp(String.raw`\b\d+(?:[.,]\d{1,2})?\s?${COUNTRY}(?:${CODES}|${NAMES})\b`, "i"),
  new RegExp(
    String.raw`\b${EN_NUMBER}(?:[\s-]+(?:and[\s-]+)?${EN_NUMBER})*[\s-]+${COUNTRY}(?:dollars?|bucks?|euros?|pesos?|quid)\b`,
    "i"
  ),
  new RegExp(String.raw`\b${ES_NUMBER}(?:\s+(?:y\s+)?${ES_NUMBER})*\s+(?:pesos?|d[oó]lares?|euros?)\b`, "i"),
  new RegExp(String.raw`\b\d{1,3}\s?${PERCENT}\s?(?:off|discount|de descuento|descuento|menos)\b`, "i"),
  new RegExp(String.raw`\b${EN_NUMBER}(?:[\s-]+${EN_NUMBER})*\s+${PERCENT}\s+(?:off|discount)\b`, "i"),
  new RegExp(String.raw`\b(?:discount|descuento)\s+(?:of\s+|del?\s+)?\d{1,3}\s?${PERCENT}`, "i"),
  /\b(?:half[\s-]price|half off|mitad de precio|2\s?x\s?1|dos por uno)\b/i
];
export function violatesNoPrices(text) {
  return PRICE_PATTERNS.some((p) => p.test(text));
}
function canonicalNumber(run) {
  const m = /^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(run);
  if (!m) return run.replace(/[.,]0+$/, "");
  const [, whole = "", cents = ""] = m;
  const int = String(Number(whole.replace(/[.,]/g, "")));
  const dec = cents.replace(/0+$/, "");
  return dec ? `${int}.${dec}` : int;
}
const NUMBER_WORDS = /* @__PURE__ */ (() => {
  const w = {};
  const units = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
  const teens = ["twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  units.forEach((u, i) => w[u] = i);
  teens.forEach((t, i) => w[t] = 12 + i);
  tens.forEach((t, i) => w[t] = 20 + 10 * i);
  const es = "un uno una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince".split(" ");
  es.forEach((u, i) => w[u] = i < 3 ? 1 : i - 1);
  ["dieciseis", "diecisiete", "dieciocho", "diecinueve"].forEach((t, i) => w[t] = 16 + i);
  w.veinte = 20;
  ["veintiun", "veintiuno", "veintiuna"].forEach((t) => w[t] = 21);
  "veintidos veintitres veinticuatro veinticinco veintiseis veintisiete veintiocho veintinueve".split(" ").forEach((t, i) => w[t] = 22 + i);
  ["treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"].forEach(
    (t, i) => w[t] = 30 + 10 * i
  );
  w.cien = 100;
  w.ciento = 100;
  "doscientos trescientos cuatrocientos quinientos seiscientos setecientos ochocientos novecientos".split(" ").forEach((t, i) => w[t] = [200, 300, 400, 500, 600, 700, 800, 900][i] ?? 0);
  return w;
})();
function numberOfWords(words) {
  const tokens = words.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[\s-]+/).filter((t) => t && t !== "and" && t !== "y");
  if (!tokens.length) return null;
  let total = 0;
  let current = 0;
  for (const t of tokens) {
    if (t === "hundred") current = (current || 1) * 100;
    else if (t === "thousand" || t === "mil") {
      total += (current || 1) * 1e3;
      current = 0;
    } else if (t in NUMBER_WORDS) current += NUMBER_WORDS[t] ?? 0;
    else return null;
  }
  return total + current;
}
const CURRENCY_WORDS = new RegExp(String.raw`\b${COUNTRY}(?:${CODES}|${NAMES}|quid)\b`, "gi");
const PERCENT_SIGN = new RegExp(PERCENT, "i");
const DEAL = /\b(?:2\s?x\s?1|dos por uno)\b/i;
function figureOf(whole) {
  if (DEAL.test(whole)) return "2x1";
  const percent = PERCENT_SIGN.test(whole) ? "%" : "";
  const run = /\d+(?:[.,]\d+)*/.exec(whole)?.[0];
  if (run) return `${canonicalNumber(run)}${percent}`;
  const spelled = numberOfWords(
    whole.replace(CURRENCY_WORDS, " ").replace(PERCENT_SIGN, " ").replace(/\b(?:off|discount)\b/gi, " ")
  );
  return spelled !== null ? `${spelled}${percent}` : whole.toLowerCase().replace(/\s+/g, " ").trim();
}
const NOT_A_PRICE_AFTER = String.raw`(?!\d|[.,]\d|-\d|\s*(?::|%|-?\s*(?:am|pm|a\.m|p\.m|o'clock|min|mins|minutes?|hours?|hrs?|people|persons?|guests?|days?|weeks?|months?|years?|minutos?|horas?|personas?|d[ií]as?|semanas?|meses|años?)\b))`;
const RANGE_TOP = new RegExp(
  String.raw`^\s*(?:-|–|—|to|a|hasta)\s*[$€£]?\s*(\d+(?:[.,]\d+)*)${NOT_A_PRICE_AFTER}`,
  "i"
);
const BETWEEN_TOP = new RegExp(String.raw`^\s*(?:and|y)\s*[$€£]?\s*(\d+(?:[.,]\d+)*)${NOT_A_PRICE_AFTER}`, "i");
function rangeTopAfter(text, from, to) {
  const tail = text.slice(to);
  const top = RANGE_TOP.exec(tail) ?? (/\b(?:between|entre)\s+$/i.test(text.slice(0, from)) ? BETWEEN_TOP.exec(tail) : null);
  return top?.[1] ? canonicalNumber(top[1].replace(/[.,]$/, "")) : null;
}
export function priceFigures(text) {
  const found = [];
  for (const p of PRICE_PATTERNS) {
    for (const m of text.matchAll(new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`))) {
      let from = m.index;
      let to = m.index + m[0].length;
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
export function priceBreach(text, allowed) {
  if (!allowed) return violatesNoPrices(text);
  return priceFigures(text).some((f) => !allowed.has(f));
}
const MONEY_PATTERNS = [
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
  /\bmeses sin intereses\b/i
];
export function namesMoney(text) {
  return MONEY_PATTERNS.some((p) => p.test(text));
}
const HELD_LINES = {
  en: {
    price: "Good question! A member of our team will follow up here with the details shortly.",
    money: "Thanks for asking. A member of our team will get back to you here about that shortly.",
    booking: "A member of our team will confirm your booking with you shortly.",
    faq: "A member of our team will get back to you with the details shortly.",
    urgent: (phone) => ` For anything urgent, call ${phone}.`
  },
  es: {
    price: "\xA1Buena pregunta! Alguien de nuestro equipo te responder\xE1 aqu\xED con los detalles en breve.",
    money: "Gracias por preguntar. Alguien de nuestro equipo te responder\xE1 aqu\xED sobre eso en breve.",
    booking: "Alguien de nuestro equipo te confirmar\xE1 la cita en breve.",
    faq: "Alguien de nuestro equipo te responder\xE1 con los detalles en breve.",
    urgent: (phone) => ` Si es urgente, llama al ${phone}.`
  }
};
export function heldLine(kind, language, phone) {
  const words = language === "es" ? HELD_LINES.es : HELD_LINES.en;
  return `${words[kind]}${phone ? words.urgent(phone) : ""}`;
}
export function spokenBreach(turns, allowed) {
  if (!turns?.length) return null;
  let n = 0;
  let callerSpoke = false;
  for (const t of turns) {
    if (t?.role === "user") callerSpoke = true;
    if (t?.role !== "agent") continue;
    n += 1;
    if (n === 1 && !callerSpoke) continue;
    const said = (t.content ?? "").trim();
    if (said && priceBreach(said, allowed)) return { rule: "price", said: said.slice(0, 300), turn: n };
  }
  return null;
}
export function spokenBreachDetails(b) {
  return `The phone receptionist said a price out loud that it may not give: none while \u201CNever quote a price\u201D is on, and otherwise one you haven't written. It said: "${b.said}" A call cannot be taken back the way a draft can, so check what the caller was told before confirming anything.`;
}
export function guardSpokenTurns(o) {
  const breach = spokenBreach(o.turns, o.allowed);
  if (!breach) return { breach: null, escalate: null, correct: false };
  return {
    breach,
    escalate: { reason: "policy_block", details: spokenBreachDetails(breach) },
    correct: o.live && !o.alreadyCorrected
  };
}
export const WA_WINDOW_MS = 24 * HOUR_MS;
export function waWindow(lastWaInboundAtIso, now = /* @__PURE__ */ new Date()) {
  if (!lastWaInboundAtIso) return { open: false, closesAtIso: null };
  const closes = new Date(lastWaInboundAtIso).getTime() + WA_WINDOW_MS;
  return { open: closes > now.getTime(), closesAtIso: new Date(closes).toISOString() };
}
export function replyWindow(replyChannel, lastWaInboundAtIso, now = /* @__PURE__ */ new Date()) {
  return replyChannel === "sms" || replyChannel === "email" ? { open: true, closesAtIso: null } : waWindow(lastWaInboundAtIso, now);
}
export const REPLY_LIMITS = {
  whatsapp: { max: 4096, refusal: "WhatsApp refuses a message over 4096 characters." },
  sms: { max: 1600, refusal: "A text can be at most 1600 characters." },
  email: { max: 2e4, refusal: "An email reply can be at most 20,000 characters." }
};
export const REPLY_MAX_ANY = Math.max(...Object.values(REPLY_LIMITS).map((l) => l.max));
export const CALL_HEARTBEAT_MS = 10 * MIN_MS;
export function isLiveCall(call, now = /* @__PURE__ */ new Date()) {
  if (call.status !== "ongoing") return false;
  const beat = call.updated_at ?? call.started_at;
  if (!beat) return false;
  const at = new Date(beat).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < CALL_HEARTBEAT_MS;
}
export const REPLY_DELAY_DEFAULT_MS = 3e4;
export const REPLY_DELAY_MIN_MS = 5e3;
export const REPLY_DELAY_MAX_MS = 10 * MIN_MS;
export const REPLY_CAP_DEFAULT = 20;
export const PAUSE_HOURS_DEFAULT = 24;
export const PAUSE_HOURS_MIN = 1;
export const PAUSE_HOURS_MAX = 168;
export function pauseHoursOf(limits) {
  const stored = limits?.pause_hours;
  return typeof stored === "number" && Number.isInteger(stored) && stored >= PAUSE_HOURS_MIN && stored <= PAUSE_HOURS_MAX ? stored : PAUSE_HOURS_DEFAULT;
}
export function pauseMsOf(limits) {
  return pauseHoursOf(limits) * HOUR_MS;
}
export function hardLimitsWords(limits) {
  const stored = (v) => {
    const n = Number(v);
    return v !== void 0 && v !== null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    sub: "The first two never change; the last two are yours to set",
    replies: `How many it sends before it stops and asks for you. ${REPLY_CAP_DEFAULT} is the default.`,
    pause: `Counted from Take over, a reply sent from the Inbox or the WhatsApp Business app, or a handoff to you. ${PAUSE_HOURS_DEFAULT} hours is the default.`,
    cap: stored(limits?.max_replies_day) ?? REPLY_CAP_DEFAULT,
    hours: pauseHoursOf(limits)
  };
}
export function replyDelayMs(mode, limits) {
  if (mode !== "veto") return 0;
  const raw = limits?.reply_delay_ms;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return REPLY_DELAY_DEFAULT_MS;
  return Math.min(REPLY_DELAY_MAX_MS, Math.max(REPLY_DELAY_MIN_MS, Math.round(raw)));
}
