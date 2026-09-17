#!/usr/bin/env node
/**
 * Filler for a live workspace, so every scenario the product knows has a
 * row to show — a handoff, a thread the owner took over, a reply window
 * about to close, calls with outcomes and one that needs a call back, a
 * photo, a STOP, a snooze, a done thread, quiet people, phoned-only people,
 * two finished broadcasts, three playbooks with one run held for approval,
 * two saved lists, and a week of notifications.
 *
 * Prod-script bar: dry-run DEFAULT (prints the plan, writes nothing);
 * `--apply` writes; `--purge` lists what would be removed; `--purge --apply`
 * removes it. Idempotent: `--apply` refuses when any filler phone already
 * exists. A JSONL ledger of every row written goes to tooling/backups.
 *
 * Every person here has a number from the NANP block reserved for fiction
 * (+1 917 555 01xx) — nobody can be messaged or dialed. Nothing here
 * schedules a job, a dial, or a send: the one held run (pending_approval)
 * sends only if a person approves it, to a number nobody has, and fails
 * harmlessly at Meta.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TENANT_ID, OWNER_USER_ID,
 *      FILLER_PHOTO (optional jpeg path; default tooling/scripts/fixtures/filler-photo.jpg).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.TENANT_ID;
const OWNER = process.env.OWNER_USER_ID;
if (!URL_ || !KEY || !TENANT || !OWNER) { console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TENANT_ID and OWNER_USER_ID are required"); process.exit(2); }
const APPLY = process.argv.includes("--apply");
const PURGE = process.argv.includes("--purge");
const HERE = dirname(fileURLToPath(import.meta.url));
const PHOTO = process.env.FILLER_PHOTO || join(HERE, "fixtures", "filler-photo.jpg");
const TZ = "America/New_York";
const AGENT = "agent_242005d0ce9352af2cef792432";
const SALON = "+19175746416";

/* ------------------------------- the clock -------------------------------- */
const NOW = new Date();
function tzOffsetMs(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime();
}
/** A wall-clock moment in the salon's time zone, `daysAgo` days back. */
function dayAt(daysAgo, hh, mm = 0) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(NOW).map((x) => [x.type, x.value]));
  const guess = new Date(Date.UTC(+p.year, +p.month - 1, +p.day - daysAgo, hh, mm));
  return new Date(guess.getTime() - tzOffsetMs(guess));
}
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000);
const minutesAfter = (d, m) => new Date(d.getTime() + m * 60_000);
const inHours = (h) => new Date(NOW.getTime() + h * 3_600_000);
const iso = (d) => d.toISOString();
const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/* -------------------------------- the rest -------------------------------- */
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json" };
async function rest(method, path, body, prefer) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const insert = (table, rows) => rest("POST", table, rows, "return=representation");
const patch = (table, filter, body) => rest("PATCH", `${table}?${filter}`, body, "return=representation");
const select = (table, q) => rest("GET", `${table}?${q}`);
const del = (table, filter) => rest("DELETE", `${table}?${filter}`, undefined, "return=representation");
const rpc = (fn, args) => rest("POST", `rpc/${fn}`, args);
// Values are encoded one by one: a "+" left bare in a query string is a space.
const inList = (ids) => `in.(${ids.map((v) => encodeURIComponent(String(v))).join(",")})`;

/* --------------------------------- people --------------------------------- */
// Steps are chronological. kind: in (customer wrote) · ai (receptionist) ·
// human (a person at the salon) · call (the phone receptionist).
let wam = 0;
const wamid = () => `wamid.filler.${String(++wam).padStart(3, "0")}`;
const brain = (intent, confidence) => ({ source: "brain", delay_ms: 30000, intent, confidence, model: "claude-sonnet-5", language: "en" });

function person(p) { return { conv: {}, escalations: [], consent: null, ...p }; }

const PEOPLE = [
  person({
    key: "daniela", phone: "+19175550101", name: "Daniela Reyes", wa: "Dani ✨",
    consent: { state: "opted_in", source: "customer_message", at: dayAt(3, 10, 16) },
    thread: [
      { kind: "in", at: dayAt(3, 10, 12), body: "Hi! Do you do balayage? How much for medium length hair?" },
      { kind: "ai", at: dayAt(3, 10, 13), body: "Hi Daniela! Yes — balayage is one of our specialties. For medium-length hair it usually runs $180–$240 depending on the technique and toner. Would you like the booking link?", intent: "pricing", confidence: 0.86 },
      { kind: "in", at: dayAt(3, 10, 15), body: "Yes please! And yes to offers" },
      { kind: "ai", at: dayAt(3, 10, 16), body: "Done — you'll hear about our monthly offers here. Book any time: {link}", intent: "booking", confidence: 0.91, template: "booking_link", status: "read" },
      { kind: "in", at: hoursAgo(2.1), body: "I booked for Saturday but can you do it for $150? my friend got that price last month" },
    ],
    conv: { state: "needs_human", pausedUntil: inHours(22) },
    escalations: [{ reason: "policy_block", state: "open", details: "Asked for a discount — $150 instead of $180. Money is owner-only; nothing was sent.", at: hoursAgo(2.1) }],
  }),
  person({
    key: "marcus", phone: "+19175550102", name: "Marcus Bell", wa: "Marcus B",
    thread: [
      { kind: "in", at: dayAt(1, 18, 30), body: "Hey, do you cut men's hair too? Looking for a fade" },
      { kind: "ai", at: dayAt(1, 18, 31), body: "We do! A men's cut with a fade is $45 and takes about 45 minutes. Want the booking link?", intent: "services", confidence: 0.88 },
      { kind: "in", at: dayAt(1, 18, 33), body: "can I just come by tomorrow around 4?" },
      { kind: "human", at: dayAt(1, 18, 50), body: "Hi Marcus, Melany here — 4 pm tomorrow works, I'll pencil you in. What's your last name?", status: "read" },
      { kind: "in", at: hoursAgo(3), body: "Bell. Also is parking ok around there?" },
    ],
    conv: { assignee: true },
  }),
  person({
    key: "priya", phone: "+19175550103", name: "Priya Nair", wa: "Priya",
    thread: [
      { kind: "in", at: hoursAgo(22.6), body: "Do you have anything open this Friday afternoon for a gloss + trim?" },
      { kind: "ai", at: hoursAgo(22.58), body: "Hi Priya! Friday we have 1:30 PM and 3:00 PM open for a gloss and trim (about 90 minutes). Shall I hold one for you? You can also book straight away here: {link}", intent: "booking", confidence: 0.84 },
      { kind: "in", at: hoursAgo(22.5), body: "Perfect, I'll take the 3pm. Thanks!" },
    ],
  }),
  person({
    key: "sofia", phone: "+19175550104", name: "Sofia Alvarez", wa: "Sofi 🌸",
    consent: { state: "opted_in", source: "customer_message", at: dayAt(25, 11, 5) },
    thread: [
      { kind: "in", at: dayAt(25, 11, 2), body: "Hola! Do you do keratin treatments?" },
      { kind: "ai", at: dayAt(25, 11, 3), body: "Hi Sofia! Yes — a keratin smoothing treatment is $220–$280 depending on length and lasts about 3 months. Want the booking link?", intent: "services", confidence: 0.9 },
      { kind: "in", at: dayAt(25, 11, 5), body: "Yes and YES to offers 🙂" },
      { kind: "ai", at: dayAt(25, 11, 6), body: "Done — you'll hear about our monthly offers here. Book any time: {link}", intent: "booking", confidence: 0.92, template: "booking_link", status: "read" },
      { kind: "in", at: dayAt(12, 12, 40), body: "Is the 20% also for highlights?" },
      { kind: "ai", at: dayAt(12, 12, 41), body: "It is — the September offer covers any color service, highlights included, booked before the 20th. Want me to send the booking link again?", intent: "pricing", confidence: 0.87 },
      { kind: "in", at: dayAt(5, 9, 48), body: "What are your hours on Saturdays?" },
      { kind: "ai", at: dayAt(5, 9, 49), body: "We're open Saturdays 9:30 AM – 6 PM. Sundays we're closed. See you soon, Sofia!", intent: "hours", confidence: 0.95, status: "read" },
    ],
  }),
  person({
    key: "carlos", phone: "+19175550105", name: "Carlos Mendez",
    thread: [
      { kind: "call", at: dayAt(9, 13, 20), seconds: 112, outcome: "answered", sentiment: "Positive", callerName: "Carlos",
        wanted: "Asked for Saturday hours and whether walk-ins are welcome",
        summary: "The user called Melany's Beauty Salon to ask about Saturday hours and walk-ins. The receptionist gave the hours and suggested booking ahead for weekends.",
        turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "Hi, are you open Saturdays? And can I just walk in?"], ["agent", "We are — Saturdays 9:30 AM to 6 PM. Walk-ins are welcome when there's a free chair, but Saturdays fill up, so booking ahead is safest. Would you like the booking link by text?"], ["user", "No that's fine, I'll come by. Thanks!"], ["agent", "You're welcome, Carlos. See you Saturday."]] },
      { kind: "call", at: dayAt(1, 8, 5), seconds: 23, outcome: "no_request", sentiment: "Neutral",
        summary: "The user called Melany's Beauty Salon and hung up shortly after the greeting without making a request.",
        turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "Oh — sorry, wrong number."]] },
    ],
  }),
  person({
    key: "emily", phone: "+19175550106", name: "Emily Chen",
    thread: [
      { kind: "call", at: hoursAgo(0.95), seconds: 190, outcome: "callback_needed", sentiment: "Positive", callerName: "Emily",
        wanted: "Wants to book a bridal trial on October 3 for herself and two bridesmaids",
        followUp: "Call Emily back to confirm the bridal trial on Oct 3 — she needs a quote for three people and asked to speak with Melany directly",
        summary: "The user called Melany's Beauty Salon to arrange a bridal trial for October 3 for three people. The receptionist could not quote a group booking and offered a call back from Melany.",
        turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "Hi! I'm getting married in November and I'd like to do a trial on October third — for me and two bridesmaids."], ["agent", "Congratulations, Emily! A bridal trial for three is something Melany plans personally so the timing and pricing are right. May I have her call you back at this number?"], ["user", "Yes please, today if possible."], ["agent", "I've noted it — Melany will call you back today. Is there anything else?"], ["user", "No, that's all. Thank you!"]] },
    ],
    conv: { state: "needs_human", pausedUntil: inHours(20) },
    escalations: [{ reason: "callback", state: "open", details: "Call Emily back to confirm the bridal trial on Oct 3 — she needs a quote for three people and asked to speak with Melany directly", at: hoursAgo(0.9) }],
  }),
  person({
    key: "jasmine", phone: "+19175550107", name: "Jasmine Okafor", wa: "Jas",
    thread: [
      { kind: "call", at: dayAt(4, 15, 40), seconds: 125, outcome: "booking_link_sent", sentiment: "Positive", callerName: "Jasmine", link: true,
        wanted: "Wanted to book a keratin treatment next week",
        summary: "The user called Melany's Beauty Salon to book a keratin treatment. The receptionist explained the options and texted the booking link.",
        turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "Hi, I'd like to book a keratin treatment sometime next week."], ["agent", "Happy to help. A keratin treatment takes about two and a half hours and runs $220 to $280 depending on length. I can text you the booking link so you can pick a time — shall I?"], ["user", "Yes, please text it."], ["agent", "Sent. You'll see it on WhatsApp in a moment. Anything else?"], ["user", "No, thank you!"]] },
      { kind: "in", at: dayAt(4, 15, 58), body: "Got it, booked for next Tuesday 🙌" },
      { kind: "ai", at: dayAt(4, 15, 59), body: "Wonderful — see you Tuesday, Jasmine! Reply here if anything changes.", intent: "booking", confidence: 0.93, status: "read" },
    ],
  }),
  person({
    key: "laura", phone: "+19175550108", name: "Laura Gómez", wa: "Lau",
    consent: { state: "opted_out", source: "customer_message", at: dayAt(6, 19, 12), previous: "opted_in", previousAt: dayAt(20, 16, 33) },
    thread: [
      { kind: "in", at: dayAt(20, 16, 30), body: "Hola, cuánto cuesta un corte y color?" },
      { kind: "ai", at: dayAt(20, 16, 31), body: "¡Hola Laura! El corte cuesta $65 y el color desde $120 según el largo. ¿Te envío el enlace para reservar?", intent: "pricing", confidence: 0.89, language: "es" },
      { kind: "in", at: dayAt(20, 16, 33), body: "Sí, y sí a las ofertas" },
      { kind: "ai", at: dayAt(20, 16, 34), body: "Listo — te avisaremos de las ofertas del mes por aquí. Reserva cuando quieras: {link}", intent: "booking", confidence: 0.9, template: "booking_link", status: "read", language: "es" },
      { kind: "in", at: dayAt(6, 19, 12), body: "STOP" },
      { kind: "ai", at: dayAt(6, 19, 13), body: "Entendido, Laura — no recibirás más ofertas por aquí. Si necesitas una cita, escríbenos cuando quieras.", intent: "other", confidence: 0.97, status: "read", language: "es" },
    ],
    escalations: [{ reason: "opt_out", state: "resolved", details: "Wrote STOP after the September offer.", at: dayAt(6, 19, 12), resolvedAt: dayAt(6, 19, 13) }],
  }),
  person({
    key: "nina", phone: "+19175550109", name: "Nina Petrova", wa: "nina.p",
    consent: { state: "opted_in", source: "form", at: dayAt(2, 14, 22), note: "Scanned the QR at the front desk" },
    thread: [
      { kind: "in", at: dayAt(2, 14, 18), body: "Hi, I saw your lash extensions on Instagram — do you do classic sets?" },
      { kind: "ai", at: dayAt(2, 14, 19), body: "Hi Nina! Yes — a classic set is $110 and takes about 90 minutes. Hybrid is $140 and volume $170. Want the booking link?", intent: "services", confidence: 0.9 },
      { kind: "in", at: dayAt(2, 14, 22), body: "Classic please!" },
      { kind: "ai", at: dayAt(2, 14, 23), body: "Here you go: {link} — pick any slot that suits you and we'll take it from there.", intent: "booking", confidence: 0.92, template: "booking_link", status: "delivered" },
    ],
  }),
  person({
    key: "olivia", phone: "+19175550110", name: "Olivia Brooks", wa: "Liv",
    consent: { state: "opted_in", source: "in_person", at: dayAt(60, 17, 0), note: "Said yes at checkout" },
    thread: [
      { kind: "in", at: dayAt(41, 9, 30), body: "Can I move my Thursday to Friday, same time?" },
      { kind: "ai", at: dayAt(41, 9, 31), body: "Of course, Olivia — I've noted Friday at 11 AM instead of Thursday. Melany will confirm shortly.", intent: "booking", confidence: 0.82 },
      { kind: "human", at: dayAt(41, 9, 55), body: "Confirmed — see you Friday at 11! 💛", status: "read" },
    ],
  }),
  person({
    key: "hannah", phone: "+19175550111", name: "Hannah Kim",
    thread: [
      { kind: "call", at: dayAt(62, 12, 10), seconds: 70, outcome: "answered", sentiment: "Neutral", callerName: "Hannah",
        wanted: "Asked whether the salon does hair extensions",
        summary: "The user called Melany's Beauty Salon to ask about hair extensions. The receptionist confirmed the service and offered the booking link, which the caller declined.",
        turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "Do you guys do extensions?"], ["agent", "We do — tape-in and hand-tied extensions, by consultation first. Would you like me to text you the booking link for a consultation?"], ["user", "Not right now, just checking. Thanks."]] },
    ],
  }),
  person({
    key: "rosa", phone: "+19175550112", name: "Rosa Delgado", wa: "Rosa D.",
    thread: [
      { kind: "in", at: dayAt(2, 20, 5), body: "Hi! I'd like to book a color correction but I'm traveling until the 15th. Can we talk then?" },
      { kind: "ai", at: dayAt(2, 20, 6), body: "Absolutely, Rosa — enjoy your trip! Message us when you're back and we'll find you a time for the color correction.", intent: "booking", confidence: 0.88, status: "read" },
    ],
    conv: { state: "snoozed", snoozeUntil: inHours(48) },
  }),
  person({
    key: "ava", phone: "+19175550113", name: "Ava Thompson", wa: "Ava T",
    consent: { state: "opted_in", source: "in_person", at: dayAt(30, 15, 45) },
    thread: [
      { kind: "in", at: dayAt(8, 17, 40), body: "Thank you so much, loved the cut!!" },
      { kind: "ai", at: dayAt(8, 17, 41), body: "Thank you, Ava — that made our day! See you next time 💛", intent: "other", confidence: 0.96, status: "read" },
    ],
    conv: { state: "archived" },
  }),
  person({
    key: "zoe", phone: "+19175550114", name: "Zoe Martin", wa: "zoë",
    thread: [
      { kind: "in", at: hoursAgo(4.2), body: "Hi! I'm thinking of going warmer for fall. Something like this? 👀", type: "media", caption: "Something like this? 👀" },
    ],
    // No pause on this one: People counts a paused thread as owned, so an
    // unpaused flag is the one row its "Needs you" list can show.
    conv: { state: "needs_human" },
    escalations: [{ reason: "non_text", state: "open", details: "Sent a photo — a reference color.", at: hoursAgo(4.2) }],
  }),
  person({
    key: "grace", phone: "+19175550115", name: "Grace Liu", wa: "Grace",
    consent: { state: "opted_in", source: "form", at: dayAt(40, 10, 0) },
    thread: [],
  }),
  person({
    key: "tom", phone: "+19175550116", name: "Tom Baker", wa: "Tom",
    consent: { state: "opted_in", source: "in_person", at: dayAt(35, 13, 0) },
    thread: [],
  }),
  // Callers the salon has not named: the phone is who they are.
  person({ key: "caller1", phone: "+19175550120", name: null, thread: [
    { kind: "call", at: dayAt(12, 11, 15), seconds: 58, outcome: "other", sentiment: "Negative",
      wanted: "Was upset that a confirmation for a Tuesday appointment never arrived",
      summary: "The user called Melany's Beauty Salon upset that no confirmation had arrived for a Tuesday appointment. The receptionist apologized and could not verify the booking.",
      turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "I booked for Tuesday and never got any confirmation. Is my appointment even in the system?"], ["agent", "I'm sorry about that. I can't see the booking system from here, but I can have a person check and get back to you. What name is the booking under?"], ["user", "Forget it, I'll call back later."]] } ] }),
  person({ key: "caller2", phone: "+19175550121", name: null, thread: [
    { kind: "call", at: dayAt(24, 10, 5), seconds: 140, outcome: "booking_link_sent", sentiment: "Positive", link: "failed",
      wanted: "Wanted to book a blowout for Friday",
      summary: "The user called Melany's Beauty Salon to book a blowout for Friday. The receptionist texted the booking link.",
      turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "Hi, can I book a blowout for Friday afternoon?"], ["agent", "Of course. I can text you the booking link so you can pick the exact time — shall I?"], ["user", "Sure."], ["agent", "Sent. Let me know if it doesn't arrive."]] } ] }),
  person({ key: "caller3", phone: "+19175550122", name: null, thread: [
    { kind: "call", at: dayAt(15, 16, 45), seconds: 93, outcome: "answered", sentiment: "Neutral", callerName: "Tom",
      wanted: "Asked if the salon takes walk-ins on Sundays",
      summary: "The user called Melany's Beauty Salon asking about Sunday walk-ins. The receptionist explained the salon is closed on Sundays.",
      turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "Are you open Sundays for walk-ins?"], ["agent", "We're closed on Sundays — open Monday to Saturday, 9:30 to 6. Would you like the booking link for another day?"], ["user", "No, I'll figure it out. Thanks."]] } ] }),
  person({ key: "caller4", phone: "+19175550123", name: null, thread: [
    { kind: "call", at: dayAt(18, 9, 40), seconds: 35, outcome: "no_request", sentiment: "Neutral",
      summary: "The user called Melany's Beauty Salon and ended the call after the greeting.",
      turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "Hello? ... hello?"], ["agent", "I can hear you — how can I help today?"]] } ] }),
  person({ key: "caller5", phone: "+19175550124", name: null, thread: [
    { kind: "call", at: dayAt(27, 14, 25), seconds: 65, outcome: "answered", sentiment: "Positive", callerName: "Grace",
      wanted: "Asked whether gift cards are available",
      summary: "The user called Melany's Beauty Salon to ask about gift cards. The receptionist confirmed they are sold at the front desk.",
      turns: [["agent", "Thank you for calling Melany's Beauty Salon, this is the assistant. How can I help?"], ["user", "Do you sell gift cards?"], ["agent", "We do — any amount, at the front desk, Monday to Saturday. Anything else I can help with?"], ["user", "That's it, thanks!"]] } ] }),
];

const SEGMENTS = [
  { name: "VIP regulars", members: ["sofia", "ava", "olivia", "daniela"] },
  { name: "Bridal party — Emily (Oct 3)", members: ["emily", "zoe"] },
];

const PLAYBOOKS = [
  { key: "winback", name: "Win-back · quiet 30 days", trigger: "quiet_30", cls: "reengage", template: "winback_offer", params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }], state: "running", run_hour: 10, cap: 20, gap: 90, cadence: 30, lastRunAt: dayAt(6, 10, 0), lastRunFor: dayKey(dayAt(6, 10)) },
  { key: "welcome", name: "Welcome", trigger: "new_week", cls: "campaign", template: "welcome_new", params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }], state: "running", run_hour: 11, cap: 20, gap: 90, cadence: 30, lastRunAt: null, lastRunFor: null },
  { key: "monthly", name: "The month's offer", trigger: "everyone_monthly", cls: "campaign", template: "monthly_offer", params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "text", value: "20% off any color service booked before September 20." }, { kind: "booking_link" }], state: "paused", run_hour: 10, cap: 50, gap: 90, cadence: 30, lastRunAt: dayAt(12, 10, 0), lastRunFor: dayKey(dayAt(12, 10)) },
];

const BROADCASTS = [
  { name: "The month's offer", template: "monthly_offer", params: PLAYBOOKS[2].params, playbook: "monthly", runFor: dayKey(dayAt(12, 10)), audience: { kind: "playbook", id: null, label: "The month's offer" }, at: dayAt(12, 10, 0), state: "sent",
    recipients: [
      { person: "sofia", status: "read" },
      { person: "ava", status: "read" },
      { person: "olivia", status: "delivered" },
      { person: "laura", status: "read" },
      { person: "grace", status: "delivered" },
      { person: "tom", status: "read", reply: { at: dayAt(12, 13, 5), body: "Is this for men too?", ai: "It is, Tom — the 20% applies to any color service, for anyone. Book before the 20th: {link}", intent: "pricing", confidence: 0.88 } },
    ] },
  { name: "Labor Day hours", template: "quick_note", params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "text", value: "we're closed Monday, September 7 for Labor Day and back Tuesday at 9:30." }], playbook: null, runFor: null, audience: { kind: "everyone", id: null, label: "Everyone who said yes" }, at: dayAt(25, 10, 0), state: "sent",
    recipients: [
      { person: "sofia", status: "delivered" },
      { person: "ava", status: "read" },
      { person: "olivia", status: "delivered" },
      { person: "grace", status: "delivered" },
      { person: "tom", status: "delivered" },
    ] },
  { name: "Win-back · quiet 30 days", template: "winback_offer", params: PLAYBOOKS[0].params, playbook: "winback", runFor: dayKey(dayAt(6, 10)), audience: { kind: "playbook", id: null, label: "Win-back · quiet 30 days" }, at: dayAt(6, 10, 0), state: "sent",
    recipients: [
      { person: "grace", status: "delivered" },
      { person: "tom", status: "read", reply: { at: dayAt(6, 11, 20), body: "Ha, it has been a while. I'll book for next month.", ai: "We'd love to see you, Tom — whenever suits you: {link}", intent: "booking", confidence: 0.9 } },
    ] },
  // Today's run, waiting for a person: the ask mode holds it.
  { name: "Win-back · quiet 30 days", template: "winback_offer", params: PLAYBOOKS[0].params, playbook: "winback", runFor: dayKey(NOW), audience: { kind: "playbook", id: null, label: "Win-back · quiet 30 days" }, at: dayAt(0, 10, 0), state: "pending_approval",
    recipients: [{ person: "olivia", status: null }] },
];

// Titles are fixed so a purge can find them without the ledger.
const NOTIFICATIONS = [
  { kind: "playbook", at: dayAt(0, 10, 0), route: "outbound", about: { type: "broadcast", broadcast: 3 }, title: "Playbook “Win-back · quiet 30 days” is ready: 1 person", body: "1 person has become eligible for “Win-back · quiet 30 days”. Approve or skip the run on Today or in Campaigns › Playbooks. Nothing is sent until you do." },
  { kind: "call", at: hoursAgo(0.9), route: "inbox", aboutConv: "emily", title: "Emily phoned · 3 min · needs a call back", body: "They wanted: a bridal trial on October 3 for herself and two bridesmaids.\nOutcome: needs a call back.\nTo do: Call Emily back to confirm the bridal trial on Oct 3 — she needs a quote for three people and asked to speak with Melany directly." },
  { kind: "handoff", at: hoursAgo(2.1), route: "inbox", aboutConv: "daniela", title: "WhatsApp handoff needed: +19175550101", body: "Daniela Reyes asked for a discount — $150 instead of $180 for a balayage. Money is owner-only, so nothing was sent. Open the thread to answer." },
  { kind: "handoff", at: hoursAgo(4.2), route: "inbox", aboutConv: "zoe", title: "WhatsApp handoff needed: +19175550114", body: "Zoe Martin sent a photo — a reference color for going warmer this fall. The receptionist does not answer photos on its own. Open the thread to reply." },
  { kind: "call", at: dayAt(1, 8, 6), route: "conversations/phone", about: { type: "call", person: "carlos" }, title: "Voice call: +19175550105 (23s, Neutral)", body: "The user called Melany's Beauty Salon and hung up shortly after the greeting without making a request." },
  { kind: "deadman", at: dayAt(2, 22, 10), route: "inbox", aboutConv: "rosa", title: "Still waiting: a customer has had no answer for 2h", body: "Rosa Delgado wrote at 8:05 PM and the thread has been with a person since. Nothing has gone out. Open the Inbox to answer or hand it back to the receptionist." },
  { kind: "calendar_people", at: dayAt(3, 6, 0), route: "clients", about: null, title: "2 people added from your calendar", body: "Appointments on your calendar carried a phone number nobody in People had. They are all in People now, with consent unknown." },
  { kind: "call", at: dayAt(4, 15, 43), route: "conversations/phone", about: { type: "call", person: "jasmine" }, title: "Voice call: +19175550107 (125s, Positive)", body: "They wanted: to book a keratin treatment next week.\nOutcome: booking link sent." },
  { kind: "number", at: dayAt(6, 9, 30), route: "admin/integrations", about: null, title: "WhatsApp number: quality rating is now Yellow", body: "Meta rates your number's quality Yellow — a few recipients blocked or reported a message this week. Keep answering promptly and send offers only to people who said yes; a Red rating limits how many people you can message." },
  { kind: "job_failed", at: dayAt(24, 10, 8), route: "inbox", about: { type: "call", person: "caller2" }, title: "A booking link could not be sent", body: "The booking link for +19175550121 failed to send: Meta error 131026 — the number is not on WhatsApp. Nothing else was affected." },
];

const FILLER_PHONES = PEOPLE.map((p) => p.phone);
const FILLER_NAMES = { broadcasts: [...new Set(BROADCASTS.map((b) => b.name))], playbooks: PLAYBOOKS.map((p) => p.name), segments: SEGMENTS.map((s) => s.name), notifications: NOTIFICATIONS.map((n) => n.title) };

/* ------------------------------- the plan --------------------------------- */
function describe() {
  const lines = [];
  let msgs = 0, calls = 0, esc = 0;
  for (const p of PEOPLE) {
    const ins = p.thread.filter((s) => s.kind === "in").length, out = p.thread.filter((s) => s.kind === "ai" || s.kind === "human").length, c = p.thread.filter((s) => s.kind === "call").length;
    msgs += ins + out; calls += c; esc += p.escalations.length;
    const state = p.conv.state ?? (p.conv.assignee ? "open · owner took over" : "open");
    lines.push(`  ${(p.name ?? p.phone).padEnd(18)} ${String(ins).padStart(2)} in ${String(out).padStart(2)} out ${String(c).padStart(2)} calls  ${(p.consent ? p.consent.state : "unknown").padEnd(9)} ${state}${p.escalations.length ? "  ⚑ " + p.escalations.map((e) => `${e.reason}/${e.state}`).join(",") : ""}`);
  }
  const recips = BROADCASTS.reduce((n, b) => n + b.recipients.length, 0);
  return { lines, msgs, calls, esc, recips };
}

/* ------------------------------- the apply -------------------------------- */
const ledger = [];
const note = (table, id, extra = {}) => ledger.push({ table, id, ...extra });

function render(preview, params, ctx) {
  let out = preview;
  params.forEach((p, i) => {
    const v = p.kind === "text" ? p.value : p.kind === "first_name" ? ctx.first : p.kind === "business_name" ? ctx.business : p.kind === "booking_link" ? ctx.link : "";
    out = out.replace(`{{${i + 1}}}`, v);
  });
  return out;
}
const spoken = (s) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
const firstName = (p) => (p.name ? p.name.split(" ")[0] : "there");

// Message rows are immutable once written (the P3 trigger), so a backdated
// inbound is written whole rather than ingested and then re-dated. The
// contact, its WhatsApp identity and the thread come first, as the ingest
// function would make them.
async function ensureContact(p, me, at) {
  if (me.contact) return me.contact;
  const found = await select("contacts", `select=id&tenant_id=eq.${TENANT}&phone_e164=eq.${encodeURIComponent(p.phone)}`);
  if (found.length) me.contact = found[0].id;
  else {
    const [c] = await insert("contacts", { tenant_id: TENANT, phone_e164: p.phone, display_name: p.name, wa_profile_name: p.wa ?? null, first_seen_at: iso(at), last_seen_at: iso(at), created_at: iso(at) });
    me.contact = c.id;
  }
  return me.contact;
}
async function ensureIdentity(p, me) {
  await rest("POST", "contact_identities?on_conflict=tenant_id,channel,external_id", { tenant_id: TENANT, contact_id: me.contact, channel: "whatsapp", external_id: p.phone.slice(1) }, "resolution=ignore-duplicates,return=minimal");
}
async function ensureConversation(me, at) {
  if (me.conversation) return me.conversation;
  const found = await select("conversations", `select=id&tenant_id=eq.${TENANT}&contact_id=eq.${me.contact}`);
  if (found.length) me.conversation = found[0].id;
  else {
    const [c] = await insert("conversations", { tenant_id: TENANT, contact_id: me.contact, last_message_at: iso(at), last_inbound_at: iso(at), created_at: iso(at) });
    me.conversation = c.id;
  }
  return me.conversation;
}
async function inbound(p, me, s) {
  await ensureContact(p, me, s.at);
  await ensureIdentity(p, me);
  await ensureConversation(me, s.at);
  const media = s.type === "media" ? { mime_type: "image/jpeg", fetch_state: "pending", caption: s.caption ?? null, filename: null } : null;
  const [m] = await insert("messages", { tenant_id: TENANT, conversation_id: me.conversation, contact_id: me.contact, channel: "whatsapp", direction: "inbound", sender: "customer", type: s.type ?? "text", body: s.type === "media" ? null : s.body, media, external_id: wamid(), channel_ts: iso(s.at), created_at: iso(s.at), status: "received", meta: { raw_type: s.type === "media" ? "image" : "text", processed_at: iso(minutesAfter(s.at, 0.5)) } });
  note("messages", m.id);
  if (media) {
    const path = `${TENANT}/${me.conversation}/${m.id}.jpg`;
    if (existsSync(PHOTO)) {
      const up = await fetch(`${URL_}/storage/v1/object/media/${path}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "image/jpeg", "x-upsert": "true" }, body: readFileSync(PHOTO) });
      if (!up.ok) throw new Error(`photo upload -> ${up.status} ${(await up.text()).slice(0, 200)}`);
      await patch("messages", `id=eq.${m.id}`, { media: { ...media, fetch_state: "stored", storage_path: path } });
      note("storage", path);
    } else {
      await patch("messages", `id=eq.${m.id}`, { media: { ...media, fetch_state: "failed" } });
    }
  }
  return m.id;
}

async function apply() {
  const existing = await select("contacts", `select=id,phone_e164&tenant_id=eq.${TENANT}&phone_e164=${inList(FILLER_PHONES)}`);
  if (existing.length) { console.error(`refusing: ${existing.length} filler contact(s) already exist — run --purge --apply first`); process.exit(1); }
  const tenant = (await select("tenants", `select=name&id=eq.${TENANT}`))[0];
  const business = tenant?.name ?? "the salon";
  const cfg = await select("tenant_config", `select=*&tenant_id=eq.${TENANT}&limit=1`).catch(() => []);
  const link = String(JSON.stringify(cfg)).match(/https?:\/\/[^"\\\s]*booksy[^"\\\s]*|booksy\.com[^"\\\s]*/)?.[0] ?? "booksy.com/melanys";
  const templates = Object.fromEntries((await select("templates", `select=id,name,language,body_preview&tenant_id=eq.${TENANT}`)).map((t) => [t.name, t]));
  const ids = {};   // person key -> { contact, conversation, calls: {}, lastMessage }
  const ctxOf = (p) => ({ first: firstName(p), business, link });

  for (const p of PEOPLE) {
    const me = { contact: null, conversation: null, calls: [], firstAt: null, lastAt: null, lastInboundAt: null, lastWaInboundAt: null, lastMsg: null, lastCall: null };
    ids[p.key] = me;
    const touch = (at, inbound, wa) => { me.firstAt = me.firstAt && me.firstAt < at ? me.firstAt : at; me.lastAt = me.lastAt && me.lastAt > at ? me.lastAt : at; if (inbound) me.lastInboundAt = at; if (inbound && wa) me.lastWaInboundAt = at; };
    for (const s of p.thread) {
      if (s.kind === "in") {
        me.lastMsg = await inbound(p, me, s);
        touch(s.at, true, true);
      } else if (s.kind === "ai" || s.kind === "human") {
        if (!me.conversation) throw new Error(`${p.key}: an outbound step before any inbound`);
        const body = s.body.replace("{link}", link);
        const row = { tenant_id: TENANT, conversation_id: me.conversation, contact_id: me.contact, channel: "whatsapp", direction: "outbound", sender: s.kind, sent_by: s.kind === "human" ? OWNER : null, type: s.template ? "template" : "text", template_name: s.template ?? null, body, status: s.status ?? "delivered", status_updated_at: iso(minutesAfter(s.at, 1)), external_id: wamid(), channel_ts: iso(s.at), created_at: iso(s.at), meta: s.kind === "ai" ? { ...brain(s.intent, s.confidence), ...(s.language ? { language: s.language } : {}) } : {} };
        const [m] = await insert("messages", row);
        note("messages", m.id);
        me.lastMsg = m.id;
        touch(s.at, false, false);
      } else if (s.kind === "call") {
        const ended = new Date(s.at.getTime() + s.seconds * 1000);
        const retellId = `call_filler_${p.key}_${p.thread.indexOf(s) + 1}`;
        const analysis = { caller_wanted: s.wanted ?? "", outcome: s.outcome, follow_up: s.followUp ?? "", caller_name: s.callerName ?? "" };
        const transcript = s.turns.map(([role, content]) => `${role === "agent" ? "Agent" : "User"}: ${content}`).join("\n");
        const r = await rpc("ingest_call", {
          p_tenant_id: TENANT, p_retell_call_id: retellId, p_agent_id: AGENT, p_from_e164: p.phone, p_from_raw: p.phone, p_to_e164: SALON,
          p_direction: "inbound", p_call_type: "phone_call", p_status: "ended", p_started_at: iso(s.at), p_ended_at: iso(ended), p_duration_ms: s.seconds * 1000,
          p_disconnection: s.outcome === "no_request" && s.seconds < 40 ? "user_hangup" : "agent_hangup", p_sentiment: s.sentiment, p_successful: s.outcome !== "other" && s.outcome !== "no_request", p_in_voicemail: false,
          p_summary: s.summary, p_transcript: transcript, p_transcript_obj: s.turns.map(([role, content], i) => ({ role, content, start: i * 6 })), p_recording: null, p_public_log_url: null,
          p_cost: {}, p_latency: {}, p_raw: { call_id: retellId, call_status: "ended", filler: true }, p_analysis: analysis,
        });
        me.contact = r.contact_id; me.conversation = r.conversation_id; me.calls.push(r.call_id); me.lastCall = r.call_id;
        note("calls", r.call_id);
        const [noteRow] = await insert("messages", { tenant_id: TENANT, conversation_id: me.conversation, contact_id: me.contact, channel: "voice", direction: "inbound", sender: "system", type: "call_summary", body: `Inbound call · ${spoken(s.seconds)} — ${s.summary}`, external_id: `call:${retellId}`, channel_ts: iso(ended), created_at: iso(ended), status: "received", meta: {} });
        note("messages", noteRow.id);
        await patch("calls", `id=eq.${r.call_id}`, { message_id: noteRow.id });
        me.lastMsg = noteRow.id;
        touch(s.at, true, false);
        if (s.link) {
          const t = templates.booking_link;
          const [m] = await insert("messages", { tenant_id: TENANT, conversation_id: me.conversation, contact_id: me.contact, channel: "whatsapp", direction: "outbound", sender: "ai", type: "template", template_name: "booking_link", body: render(t?.body_preview ?? "Thanks for reaching out to {{1}}! You can book your appointment here: {{2}}", [{ kind: "business_name" }, { kind: "booking_link" }], ctxOf(p)), status: s.link === "failed" ? "failed" : "delivered", status_updated_at: iso(minutesAfter(ended, 1)), external_id: s.link === "failed" ? null : wamid(), channel_ts: iso(ended), created_at: iso(minutesAfter(ended, 0.2)), meta: { source: "voice_booking_link", call_id: retellId }, ...(s.link === "failed" ? { error: { http_status: 400, body: { error: { code: 131026, message: "Message Undeliverable." } } } } : {}) });
          note("messages", m.id);
          touch(minutesAfter(ended, 0.2), false, false);
        }
      }
    }
    // A person with no thread yet still exists — a yes recorded at the desk.
    if (!me.contact) {
      await ensureContact(p, me, p.consent?.at ?? NOW);
      await ensureIdentity(p, me);
      me.firstAt = p.consent?.at ?? NOW; me.lastAt = me.firstAt;
    }
    note("contacts", me.contact, { phone: p.phone });
    const consentPatch = p.consent
      ? { consent: p.consent.state, consent_source: p.consent.source, consent_updated_at: iso(p.consent.at), dnc: p.consent.state === "opted_out" }
      : {};
    await patch("contacts", `id=eq.${me.contact}`, { display_name: p.name, ...(p.wa ? { wa_profile_name: p.wa } : {}), first_seen_at: iso(me.firstAt), last_seen_at: iso(me.lastAt), created_at: iso(me.firstAt), ...consentPatch });
    if (p.consent) {
      const events = [];
      if (p.consent.previous) events.push({ tenant_id: TENANT, kind: "contact.consent_changed", category: "contact", subject_type: "contact", subject_id: me.contact, created_at: iso(p.consent.previousAt), data: { consent: p.consent.previous, source: "customer_message", previous: "unknown" } });
      events.push({ tenant_id: TENANT, kind: "contact.consent_changed", category: "contact", subject_type: "contact", subject_id: me.contact, created_at: iso(p.consent.at), data: { consent: p.consent.state, source: p.consent.source, previous: p.consent.previous ?? "unknown", ...(p.consent.source === "customer_message" ? {} : { by: OWNER }), ...(p.consent.note ? { note: p.consent.note } : {}) } });
      for (const e of events) { const [row] = await insert("events", e); note("events", row.id); }
    }
    if (me.conversation) {
      note("conversations", me.conversation);
      await patch("conversations", `id=eq.${me.conversation}`, {
        state: p.conv.state ?? "open",
        paused_until: p.conv.pausedUntil ? iso(p.conv.pausedUntil) : null,
        snooze_until: p.conv.snoozeUntil ? iso(p.conv.snoozeUntil) : null,
        assignee_user_id: p.conv.assignee ? OWNER : null,
        last_message_at: iso(me.lastAt), last_inbound_at: me.lastInboundAt ? iso(me.lastInboundAt) : null, last_wa_inbound_at: me.lastWaInboundAt ? iso(me.lastWaInboundAt) : null,
        created_at: iso(me.firstAt),
      });
      for (const e of p.escalations) {
        const [row] = await insert("escalations", { tenant_id: TENANT, conversation_id: me.conversation, reason: e.reason, state: e.state, details: e.details, created_at: iso(e.at), updated_at: iso(e.resolvedAt ?? e.at), deadman_alerted_at: iso(e.at), ...(e.state === "resolved" ? { resolved_by_user_id: OWNER } : {}) });
        note("escalations", row.id);
      }
    }
    console.log(`  ✓ ${p.name ?? p.phone}`);
  }

  for (const s of SEGMENTS) {
    const [seg] = await insert("segments", { tenant_id: TENANT, name: s.name, created_by: OWNER });
    note("segments", seg.id);
    await insert("segment_members", s.members.map((k) => ({ tenant_id: TENANT, segment_id: seg.id, contact_id: ids[k].contact, added_by: OWNER })));
  }
  console.log(`  ✓ ${SEGMENTS.length} saved lists`);

  const pbIds = {};
  for (const p of PLAYBOOKS) {
    const t = templates[p.template];
    if (!t) throw new Error(`template ${p.template} not on this workspace`);
    const [row] = await insert("playbooks", { tenant_id: TENANT, name: p.name, trigger: p.trigger, policy_class: p.cls, template_id: t.id, template_name: t.name, template_language: t.language, params: p.params, run_hour: p.run_hour, cap_per_run: p.cap, gap_days: p.gap, cadence_days: p.cadence, state: p.state, created_by: OWNER, last_run_at: p.lastRunAt ? iso(p.lastRunAt) : null, last_run_for: p.lastRunFor, created_at: iso(dayAt(14, 9, 0)) });
    pbIds[p.key] = row.id; note("playbooks", row.id);
  }
  console.log(`  ✓ ${PLAYBOOKS.length} playbooks`);

  const bcIds = [];
  for (const b of BROADCASTS) {
    const t = templates[b.template];
    if (!t) throw new Error(`template ${b.template} not on this workspace`);
    const finished = b.state === "sent" ? minutesAfter(b.at, 2) : null;
    const [row] = await insert("broadcasts", { tenant_id: TENANT, name: b.name, template_id: t.id, template_name: t.name, template_language: t.language, params: b.params, audience: b.playbook ? { ...b.audience, id: pbIds[b.playbook] } : b.audience, state: b.state, scheduled_for: iso(b.at), started_at: b.state === "sent" ? iso(b.at) : null, finished_at: finished ? iso(finished) : null, recipient_count: b.recipients.length, playbook_id: b.playbook ? pbIds[b.playbook] : null, run_for: b.runFor, created_by: b.playbook ? null : OWNER, created_at: iso(b.state === "sent" ? minutesAfter(b.at, -30) : b.at) });
    bcIds.push(row.id); note("broadcasts", row.id);
    for (const [i, r] of b.recipients.entries()) {
      const p = PEOPLE.find((x) => x.key === r.person); const me = ids[r.person];
      if (b.state !== "sent") { await insert("broadcast_recipients", { tenant_id: TENANT, broadcast_id: row.id, contact_id: me.contact, state: "queued", facts: null }); continue; }
      const sentAt = minutesAfter(b.at, i * 0.3);
      const conv = me.conversation ?? (await (async () => { const [c] = await insert("conversations", { tenant_id: TENANT, contact_id: me.contact, last_message_at: iso(sentAt), created_at: iso(sentAt) }); note("conversations", c.id); me.conversation = c.id; return c.id; })());
      const [m] = await insert("messages", { tenant_id: TENANT, conversation_id: conv, contact_id: me.contact, channel: "whatsapp", direction: "outbound", sender: "human", sent_by: b.playbook ? null : OWNER, type: "template", template_name: t.name, body: render(t.body_preview ?? "", b.params, ctxOf(p)), status: r.status, status_updated_at: iso(minutesAfter(sentAt, 3)), external_id: wamid(), channel_ts: iso(sentAt), created_at: iso(sentAt), meta: { broadcast_id: row.id, ...(b.playbook ? { playbook_id: pbIds[b.playbook] } : {}) } });
      note("messages", m.id);
      await insert("broadcast_recipients", { tenant_id: TENANT, broadcast_id: row.id, contact_id: me.contact, state: "sent", sent_at: iso(sentAt), message_id: m.id, facts: null });
      if (r.reply) {
        await inbound(p, me, { at: r.reply.at, body: r.reply.body });
        const [a] = await insert("messages", { tenant_id: TENANT, conversation_id: conv, contact_id: me.contact, channel: "whatsapp", direction: "outbound", sender: "ai", type: "text", body: r.reply.ai.replace("{link}", link), status: "read", status_updated_at: iso(minutesAfter(r.reply.at, 2)), external_id: wamid(), channel_ts: iso(minutesAfter(r.reply.at, 1)), created_at: iso(minutesAfter(r.reply.at, 1)), meta: brain(r.reply.intent, r.reply.confidence) });
        note("messages", a.id);
      }
      // The thread's clocks follow its latest word, whichever side said it.
      const last = r.reply ? minutesAfter(r.reply.at, 1) : sentAt;
      if (!me.lastAt || last > me.lastAt) { me.lastAt = last; if (r.reply) { me.lastInboundAt = r.reply.at; me.lastWaInboundAt = r.reply.at; } }
      const lastIn = me.lastInboundAt ?? null;
      await patch("conversations", `id=eq.${conv}`, { last_message_at: iso(me.lastAt), ...(lastIn ? { last_inbound_at: iso(lastIn), last_wa_inbound_at: iso(me.lastWaInboundAt ?? lastIn) } : {}) });
      await patch("contacts", `id=eq.${me.contact}`, { last_seen_at: iso(me.lastAt) });
    }
  }
  console.log(`  ✓ ${BROADCASTS.length} broadcasts`);

  for (const n of NOTIFICATIONS) {
    const about = n.aboutConv
      ? { subject_type: "conversation", subject_id: ids[n.aboutConv].conversation }
      : n.about?.type === "call" ? { subject_type: "call", subject_id: ids[n.about.person].lastCall }
      : n.about?.type === "broadcast" ? { subject_type: "broadcast", subject_id: bcIds[n.about.broadcast] }
      : { subject_type: "filler", subject_id: null };
    const route = n.aboutConv ? `inbox/th-${ids[n.aboutConv].conversation}` : n.route;
    const [row] = await insert("notifications", { tenant_id: TENANT, kind: n.kind, title: n.title, body: n.body, route, ...about, created_at: iso(n.at) });
    note("notifications", row.id);
  }
  console.log(`  ✓ ${NOTIFICATIONS.length} notifications`);

  const backups = join(HERE, "..", "backups");
  mkdirSync(backups, { recursive: true });
  const path = join(backups, `filler-${NOW.toISOString().replace(/[:.]/g, "-")}.jsonl`);
  writeFileSync(path, ledger.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`\nledger: ${path} (${ledger.length} rows)`);
}

/* -------------------------------- the purge ------------------------------- */
async function purge() {
  const contacts = await select("contacts", `select=id,phone_e164,display_name&tenant_id=eq.${TENANT}&phone_e164=${inList(FILLER_PHONES)}`);
  const cids = contacts.map((c) => c.id);
  const convs = cids.length ? await select("conversations", `select=id&tenant_id=eq.${TENANT}&contact_id=${inList(cids)}`) : [];
  const vids = convs.map((c) => c.id);
  const calls = cids.length ? await select("calls", `select=id&tenant_id=eq.${TENANT}&contact_id=${inList(cids)}`) : [];
  const kids = calls.map((c) => c.id);
  const msgs = vids.length ? await select("messages", `select=id,media&tenant_id=eq.${TENANT}&conversation_id=${inList(vids)}`) : [];
  const mids = msgs.map((m) => m.id);
  const paths = msgs.map((m) => m.media?.storage_path).filter(Boolean);
  const escs = vids.length ? await select("escalations", `select=id&tenant_id=eq.${TENANT}&conversation_id=${inList(vids)}`) : [];
  const bcs = await select("broadcasts", `select=id,name&tenant_id=eq.${TENANT}&name=${inList(FILLER_NAMES.broadcasts.map((n) => `"${n}"`))}`);
  const pbs = await select("playbooks", `select=id,name&tenant_id=eq.${TENANT}&name=${inList(FILLER_NAMES.playbooks.map((n) => `"${n}"`))}`);
  const segs = await select("segments", `select=id,name&tenant_id=eq.${TENANT}&name=${inList(FILLER_NAMES.segments.map((n) => `"${n}"`))}`);
  const subjectIds = [...cids, ...vids, ...kids, ...bcs.map((b) => b.id)];
  const notifs = [
    ...(subjectIds.length ? await select("notifications", `select=id&tenant_id=eq.${TENANT}&subject_id=${inList(subjectIds)}`) : []),
    ...(await select("notifications", `select=id&tenant_id=eq.${TENANT}&subject_type=eq.filler`)),
  ];
  const nids = [...new Set(notifs.map((n) => n.id))];
  const events = subjectIds.length ? await select("events", `select=id&tenant_id=eq.${TENANT}&subject_id=${inList(subjectIds)}`) : [];
  const jobs = bcs.length ? await select("jobs", `select=id,kind,state&tenant_id=eq.${TENANT}`) : [];
  const bcJobs = jobs.filter((j) => j.kind === "broadcast_send");
  console.log(`contacts ${cids.length} · conversations ${vids.length} · messages ${mids.length} (${paths.length} photos) · calls ${kids.length} · escalations ${escs.length} · broadcasts ${bcs.length} · playbooks ${pbs.length} · saved lists ${segs.length} · notifications ${nids.length} · events ${events.length} · broadcast jobs ${bcJobs.length}`);
  for (const c of contacts) console.log(`  ${c.phone_e164}  ${c.display_name ?? ""}`);
  if (!APPLY) { console.log("\nDry run only. Re-run with --purge --apply to remove."); return; }
  const chunks = (xs) => { const out = []; for (let i = 0; i < xs.length; i += 80) out.push(xs.slice(i, i + 80)); return out; };
  const delIn = async (table, col, list) => { for (const c of chunks(list)) await del(table, `tenant_id=eq.${TENANT}&${col}=${inList(c)}`); };
  if (nids.length) await delIn("notifications", "id", nids);
  if (bcs.length) { for (const j of bcJobs) await patch("jobs", `id=eq.${j.id}`, { state: "canceled", last_error: "filler purged" }).catch(() => {}); await delIn("broadcast_recipients", "broadcast_id", bcs.map((b) => b.id)); }
  if (cids.length) await delIn("broadcast_recipients", "contact_id", cids);
  if (bcs.length) await delIn("broadcasts", "id", bcs.map((b) => b.id));
  if (pbs.length) await delIn("playbooks", "id", pbs.map((p) => p.id));
  if (cids.length) await delIn("segment_members", "contact_id", cids);
  if (segs.length) { await delIn("segment_members", "segment_id", segs.map((s) => s.id)); await delIn("segments", "id", segs.map((s) => s.id)); }
  if (escs.length) await delIn("escalations", "id", escs.map((e) => e.id));
  if (kids.length) await delIn("calls", "id", kids);
  if (mids.length) await delIn("messages", "id", mids);
  if (cids.length) await delIn("messages", "contact_id", cids);
  if (vids.length) await delIn("conversations", "id", vids);
  if (cids.length) { await delIn("contact_identities", "contact_id", cids); await delIn("policies", "subject_id", cids).catch(() => {}); }
  if (events.length) await delIn("events", "id", events.map((e) => e.id));
  for (const path of paths) {
    const r = await fetch(`${URL_}/storage/v1/object/media/${path}`, { method: "DELETE", headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) console.log(`  (photo ${path} not removed: ${r.status})`);
  }
  if (cids.length) await delIn("contacts", "id", cids);
  console.log("purged.");
}

/* ---------------------------------- main ---------------------------------- */
if (PURGE) {
  await purge();
} else {
  const d = describe();
  console.log(`Filler plan for workspace ${TENANT} (${TZ}):\n`);
  console.log(d.lines.join("\n"));
  console.log(`\n  ${PEOPLE.length} people · ${d.msgs} messages · ${d.calls} calls · ${d.esc} escalations · ${SEGMENTS.length} saved lists · ${PLAYBOOKS.length} playbooks · ${BROADCASTS.length} broadcasts (${d.recips} recipients) · ${NOTIFICATIONS.length} notifications`);
  console.log(`  photo: ${existsSync(PHOTO) ? PHOTO : "(none — the photo thread will show an unavailable photo)"}`);
  if (!APPLY) { console.log("\nDry run only. Re-run with --apply to write."); process.exit(0); }
  console.log("\napplying…");
  await apply();
}
