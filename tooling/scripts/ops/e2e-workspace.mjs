/**
 * The nightly's own workspace, made or put back in its known state.
 *
 * The signed-in end-to-end specs used to run as the owner's own account inside
 * a live customer's workspace: every run wrote to it, and the Ask specs spent
 * model tokens there. This makes a workspace that is the suite's alone -- a test
 * owner with exactly one membership, a teammate, three fictional people, two
 * conversations, two calls and a WhatsApp channel -- and puts it back in the same
 * state every night, because the specs change some of it and time moves the rest
 * (Reports only counts the last thirty days, so the conversations are re-dated).
 *
 * Every row is chosen to be one production's background work leaves alone:
 *   - the WhatsApp channel has no credentials, no WhatsApp business account and
 *     an id no real phone number can have, so nothing can send from it;
 *   - billing is `direct`, so no Stripe event can reach the workspace or pause it;
 *   - the conversation is open with nothing timed, and the AI reply is delivered,
 *     so no pause, snooze or send sweep selects it;
 *   - the call is ended, with no recording and no thread for the call sweep to
 *     write a note into;
 *   - the config has no calendar, and one notification address: Resend's test
 *     inbox, delivered@resend.dev, which Resend documents as an address that
 *     simulates a delivery, so what is sent to it reaches nobody. It is there
 *     because e2e/conversations/thread.spec.ts sends a reply this channel cannot carry: the
 *     failure opens an escalation and alerts the owner, and for a workspace with
 *     no address chooseAddressing (apps/edge/lib/ops/notify.ts) answers `redacted`,
 *     which mails the platform's own mailbox -- a real person -- every night,
 *     and the deadman pages the platform if the escalation outlives two hours.
 *     With an address on file both go to the workspace's own, and this one
 *     delivers nowhere;
 *   - the people have said yes to MESSAGES and nobody has said yes to OFFERS --
 *     the state a real salon was in on 17 Sep 2026, and the one Today's "Worth a
 *     look", People's list steps and Broadcasts' "Get their yes" exist to answer.
 *     A yes to messages starts nothing on its own: the receptionist only ever
 *     answers, nothing here is scheduled to write first, and the channel above
 *     could not carry it if it were. With nobody's yes to offers, no promotional
 *     send has an audience at all. Three, because a list the product calls a
 *     list starts at three (contracts todayLeaks) -- the seed meets the product's
 *     floor rather than the product meeting the seed's;
 *   - the lead finder holds two searches of fictional places: one ended, and one
 *     whose round is waiting on the owner's answer -- nothing is spent while a
 *     round waits, no job or sweep moves it but the sweep's end after a day, and
 *     the seed writes the bell's row for each round itself, so 00163's trigger
 *     queues no push (convergeLeads says how);
 *   - Google holds one listing at a fixture place id, the Business Profile connected to it with no credentials, four of
 *     its reviews and two days of its count: what e2e/google.spec.ts reads of the Reviews lens, with a reply the
 *     receptionist wrote and one held back (convergeGoogle says how the sweeps leave them);
 *   - Reports' Receptionist lens reads a week of Sam Example's own conversation, a call nobody took, a send the door held
 *     back and two handovers (convergeReceptionist says how each is left alone): every row terminal and dated from the
 *     run, and none of it for a sweep, a job or the bell to find. The config keeps no profile, so no opening hours, and
 *     the lens's "answered while you were closed" asks for them, as it does of any workspace that has not set them;
 *   - Reports' People lens reads the ledger's three yeses, one for each person above and a week old as their own
 *     columns date them, and three steps the owner finished, two on their day or before and one a day late
 *     (convergePeople): every row terminal and dated from the run. The workspace holds no open step, no stop and no
 *     address that stopped working: an open step is a row in Today and a person on the Steps due list, and other specs
 *     count those, and nothing here is for a sweep, a job or the bell to select;
 *   - Reports' Campaigns lens reads one run that went out, three days ago, to the three people: a message of its own
 *     (e2e_seed_hello), the run, Casey Example's and Sam Example's WhatsApp messages (delivered, and read), Casey's reply
 *     two hours after hers, Robin Example held back because a person had his thread, and the owner's approval 40 minutes
 *     after the run was made (convergeCampaigns): every row terminal and dated from the run. The workspace holds no run
 *     waiting for a person or for a send job, no queued message and no failed one (Today counts each failed message as a
 *     reply that failed to deliver), and nothing here is for a sweep, a job or the bell to select;
 *   - under `--seed-win-back` alone (Ruben's run by hand, never the nightly's),
 *     one playbook, a Win-back on silence, paused so no sweep runs it, on a
 *     made-up message of its own: what Ask's change cases resume, rename and
 *     retime (the moment spec, A8; decision D3); without it, an existing
 *     Win-back is only put back paused, and nothing is added;
 *   - and there is no job, open escalation, open step or line, and no run that is not sent: the two handovers are resolved,
 *     since the deadman pages the platform for one left open two hours, the three steps are done, and the one run went.
 *
 * Merging seeds no Win-back: the nightly (.github/workflows/nightly-e2e.yml, every
 * day at 09:00 UTC) passes --apply alone. The Win-back's first run,
 * `--apply --seed-win-back`, is Ruben's call, run by hand and away from 09:00
 * UTC, after the merge; the nightly then keeps it paused and adds nothing.
 *
 * It refuses an owner or teammate address outside example.com, so it can never
 * reset a real account, and refuses when the owner belongs to any workspace but
 * this one and the probes workspace-create.spec.ts makes, or when this workspace
 * has any member but the two test users.
 *
 * The prod-script bar: a dry run by default, a JSONL backup of the workspace
 * before any write, idempotent, and --apply to write.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_USER_EMAIL, E2E_MEMBER_EMAIL
 * Usage: node tooling/scripts/ops/e2e-workspace.mjs [--apply] [--seed-win-back]
 */
import { createClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  EVERYONE_LABEL,
  HOUR_MS,
  MIN_MS,
  SHARED_EVENT_VERSIONS,
  TenantConfigWriteSchema,
  leadMonth,
  leadQuestionRoute,
  leadQuestionTitle,
  leadsRoute,
  newReceptionistDefaults,
} from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SLUG = "chanlytics-e2e";
export const NAME = "Chanlytics E2E Studio";
export const CALL_ID = "e2e-seed-call-1";
/** The workspace's clock, which everything the pages say a time in is said by. */
export const TIMEZONE = "America/New_York";
/**
 * The eval's Win-back (the moment spec, A8): its name, moment and message, as the change cases name them. The message's
 * name is no starter's (contracts STARTER_TEMPLATES), so Ask never takes it for a starter on file.
 */
export const WIN_BACK = { name: "Win-back", trigger: "quiet_30", template: "e2e_win_back" };
const BOOKING_LINK = "https://example.com/book/e2e";
const BUSINESS_PHONE = "+12125550142";
const BUSINESS_PHONE_DISPLAY = "(212) 555-0142";
/** 555-01xx is the range set aside for fiction. Stored canonical, as the app compares them. */
export const PEOPLE = [
  {
    phone: "+12125550143",
    name: "Robin Example",
    waProfile: "Robin",
    identity: { channel: "whatsapp", external_id: "12125550143" },
  },
  {
    phone: "+12125550144",
    name: "Casey Example",
    waProfile: null,
    identity: { channel: "voice", external_id: "+12125550144" },
  },
  {
    phone: "+12125550145",
    name: "Sam Example",
    waProfile: null,
    identity: { channel: "voice", external_id: "+12125550145" },
  },
];

/**
 * One finished search and six leads, in every class and stage e2e/leads.spec.ts
 * reads. Nothing here is a real business: `.example` hosts, 555-01xx numbers,
 * ChIJfixture place ids. The search's phones sit in a different exchange from
 * the people above, so 00140's contacts_link_lead trigger never links one to a
 * seeded person.
 */
export const LEAD_SEARCH = {
  name: "Personal trainers · Austin",
  asked: "personal trainers in Austin with a website, then find their email",
  via: "people",
  card: "local_businesses",
};
export const LEAD_PLAN = {
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: LEAD_SEARCH.asked,
  terms: ["personal trainer"],
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 15000,
    query: "Austin, TX",
  },
  count: 6,
  contact: "email",
  criteria: [
    { key: "independent", text: "independent, not a chain", standard: "likely", required: true },
    { key: "website", text: "has a website", standard: "seen", required: true },
    { key: "right_kind", text: "a personal trainer, not a big-box gym", standard: "likely", required: true },
  ],
  exclusions: [{ key: "chain", text: "chain gyms", origin: "claude" }],
};
/** The round the specs read: one probe that reached what it was asked for. */
export const LEAD_ROUND = {
  seq: 1,
  purpose: "probe",
  ending: "target_reached",
  target: 6,
  plan_version: 1,
  cost_usd: "0.1800",
  judge_tokens: 2400,
};
export const LEADS = [
  {
    place_id: "ChIJfixture0001",
    business_name: "Zilker Strength Lab",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "1200 Barton Springs Rd",
    phone_e164: "+15125550101",
    email: "hello@zilkerstrength.example",
    email_state: "ok",
    website_host: "zilkerstrength.example",
    rating: "5.0",
    reviews: 16,
    stage: "ready",
    member: {
      class: "qualified",
      fit: "strong",
      reason: "Independent coaching, 5.0 from 16 reviews",
      counted: true,
      judged: { independent: "pass", website: "pass", right_kind: "pass", chain: "pass" },
    },
  },
  {
    place_id: "ChIJfixture0002",
    business_name: "Travis Heights Coaching Co.",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "1500 S Congress Ave",
    phone_e164: "+15125550102",
    email: "hello@travisheightscoaching.example",
    email_state: "ok",
    website_host: "travisheightscoaching.example",
    rating: "4.9",
    reviews: 88,
    stage: "ready",
    member: {
      class: "qualified",
      fit: "strong",
      reason: "Independent, one location, 88 reviews",
      counted: true,
      judged: { independent: "pass", website: "pass", right_kind: "pass", chain: "pass" },
    },
  },
  {
    place_id: "ChIJfixture0003",
    business_name: "Mueller Movement Studio",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "1900 Aldrich St",
    phone_e164: "+15125550103",
    email: "info@muellermovement.example",
    email_state: "catch_all",
    website_host: "muellermovement.example",
    rating: "4.7",
    reviews: 40,
    stage: "ready",
    member: {
      class: "review",
      fit: null,
      reason: "Couldn't confirm the email",
      counted: false,
      judged: { independent: "pass", website: "pass", right_kind: "pass", chain: "pass" },
    },
  },
  {
    place_id: "ChIJfixture0004",
    business_name: "East Side Kettlebell",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "2200 E 7th St",
    phone_e164: "+15125550104",
    email: null,
    email_state: "none",
    website_host: null,
    rating: "4.8",
    reviews: 22,
    stage: "ready",
    member: {
      class: "review",
      fit: null,
      reason: "No email to check; a phone only",
      counted: false,
      judged: { independent: "pass", website: "fail", right_kind: "pass", chain: "pass" },
    },
  },
  {
    place_id: "ChIJfixture0005",
    business_name: "FitCorp Austin Central",
    category: "Gym",
    city: "Austin",
    region: "TX",
    street: "500 W 6th St",
    phone_e164: "+15125550105",
    email: null,
    email_state: "none",
    website_host: "fitcorp.example",
    rating: "4.1",
    reviews: 900,
    stage: "ready",
    member: {
      class: "excluded",
      excluded_by: "chain",
      fit: null,
      reason: "A chain gym",
      counted: false,
      judged: { independent: "fail", website: "pass", right_kind: "fail", chain: "fail" },
    },
  },
  {
    place_id: "ChIJfixture0006",
    business_name: "Hyde Park Personal Training",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "4300 Speedway",
    phone_e164: "+15125550106",
    email: "hi@hydeparkpt.example",
    email_state: "ok",
    website_host: "hydeparkpt.example",
    rating: "4.9",
    reviews: 31,
    stage: "nurture",
    member: {
      class: "qualified",
      fit: "look",
      reason: "Independent; one review mentions a waitlist",
      counted: true,
      judged: { independent: "pass", website: "pass", right_kind: "pass", chain: "pass" },
    },
  },
];
/** What the three counted leads used of the month's allowance. */
export const LEAD_COUNTED = LEADS.filter((l) => l.member.counted).length;

/**
 * A second search, stopped after its first places to ask its question: the state Today's queue ("Leads, waited
 * 3h" with one button, Answer), Ask's Right now ("1 search waiting") and the Leads strip exist to answer, and the
 * one a real search reaches only by spending. Nothing is spent while it waits and nothing here can start: the
 * round is `waiting_on_owner`, which no job or sweep moves on but an answer (never pressed by a spec) and the
 * sweep's end_question after a day (planLeadSweep; the seed runs every morning, three hours into the wait).
 * Its three places are what it asks about -- all left out as franchises -- in another trade, another city and
 * another area code from the Austin six, so no spec reading those finds these.
 */
export const WAITING_SEARCH = {
  name: "Pilates studios · Denver",
  asked: "independent pilates studios in Denver, then find their email",
  via: "people",
  card: "local_businesses",
};
export const WAITING_PLAN = {
  version: 1,
  card: "local_businesses",
  name: "pilates studios",
  asked: WAITING_SEARCH.asked,
  terms: ["pilates studio"],
  area: {
    kind: "city",
    label: "Denver, CO",
    state: "CO",
    center: { lat: 39.7392, lng: -104.9903 },
    radius_m: 15000,
    query: "Denver, CO",
  },
  count: 10,
  contact: "email",
  criteria: [
    { key: "independent", text: "independent, not a franchise", standard: "likely", required: true },
    { key: "website", text: "has a website", standard: "seen", required: true },
  ],
  exclusions: [{ key: "franchise", text: "franchise studios", origin: "claude" }],
};
/** How long the question has waited when the seed runs: under Today's twelve-hour warn and the sweep's day. */
export const WAITING_FOR_MS = 3 * 3_600_000;
/**
 * The probe that stopped to ask, and the question in core's RoundQuestion shape (packages/core/src/leads/ports.ts:
 * camelCase, as the runner writes it). The sentence is in contracts questionAfterProbe's words, said of the three
 * places seeded below (the engine asks only after ten; three is the least that makes the pile the question opens
 * on hold what it says).
 */
export const WAITING_ROUND = {
  seq: 1,
  purpose: "probe",
  target: 10,
  plan_version: 1,
  cost_usd: "0.0300",
  judge_tokens: 900,
  question: {
    sentence: "Most of the first 3 are franchise studios, which I'm leaving out. Is that what you meant?",
    criterionKey: "franchise",
    dropTerm: null,
  },
};
export const WAITING_LEADS = [
  {
    place_id: "ChIJfixture0101",
    business_name: "Mile High Reformer Co. LoDo",
    street: "1600 Wazee St",
    phone_e164: "+17205550111",
    website_host: "milehighreformer.example",
    rating: "4.3",
    reviews: 210,
  },
  {
    place_id: "ChIJfixture0102",
    business_name: "Summit Pilates Cherry Creek",
    street: "250 Steele St",
    phone_e164: "+17205550112",
    website_host: "summitpilates.example",
    rating: "4.5",
    reviews: 340,
  },
  {
    place_id: "ChIJfixture0103",
    business_name: "Peak Core Pilates Highlands",
    street: "3300 W 32nd Ave",
    phone_e164: "+17205550113",
    website_host: "peakcorepilates.example",
    rating: "4.6",
    reviews: 150,
  },
];
/** Every place the seed owns: verify() and e2e/leads.spec.ts read this whole set. */
export const ALL_LEAD_PLACES = [...LEADS.map((l) => l.place_id), ...WAITING_LEADS.map((l) => l.place_id)];

/**
 * The workspace's Google (convergeGoogle): a listing at a place id no Google place has, and four reviews of it, written
 * 3, 9, 5 and 40 days before the run, so a 30-day Reviews lens counts three and the 30 days before it one. The first was
 * answered by the receptionist an hour before the run (its google.replied event, filed by the run, is within the six hours
 * the ledger allows of the reply on the row) and the second by its owner on Google (no event is filed for a reply written
 * there); the third waits with a reply the receptionist wrote for it and held, and the fourth waits. The listing's rating
 * and count are what the four say: four reviews, 5 + 4 + 2 + 5 stars. Authors and words are made up. e2e/google.spec.ts
 * restates what these make the lens say, and reads the route first to refuse a seed that has drifted from them.
 */
export const GOOGLE_LISTING = {
  place_id: "ChIJfixture0201",
  name: NAME,
  address: "1 Example Street, New York, NY 10001",
  maps_uri: "https://www.example.com/maps/e2e-fixture",
  rating: 4,
  review_count: 4,
};
export const GOOGLE_CONNECTION = { account_name: "accounts/e2e-fixture", location_name: "locations/e2e-fixture" };
export const GOOGLE_REVIEWS = [
  {
    review_id: "e2e-fixture-review-1",
    author: "Alex Example",
    rating: 5,
    body: "Careful, quick and friendly. I will book again.",
    writtenDaysAgo: 3,
    reply: { text: "Thank you, Alex! We look forward to seeing you again.", hoursAgo: 1, by: "receptionist" },
    held: null,
  },
  {
    review_id: "e2e-fixture-review-2",
    author: "Jordan Example",
    rating: 4,
    body: "Good work, though the wait was a little longer than I expected.",
    writtenDaysAgo: 9,
    reply: { text: "Thanks for your patience, Jordan.", hoursAfter: 26, by: null },
    held: null,
  },
  {
    review_id: "e2e-fixture-review-3",
    author: "Riley Example",
    rating: 2,
    body: "The quote was higher than I was told on the phone.",
    writtenDaysAgo: 5,
    reply: null,
    held: "price",
  },
  {
    review_id: "e2e-fixture-review-4",
    author: "Morgan Example",
    rating: 5,
    body: "A lovely studio and a lovely team.",
    writtenDaysAgo: 40,
    reply: null,
    held: null,
  },
];
/** The listing's count on two days, the first with the oldest review alone and before the 30 days the lens looks at, the last on the run's own day. */
export const GOOGLE_DAYS = [
  { daysAgo: 31, rating: 5, review_count: 1 },
  { daysAgo: 0, rating: 4, review_count: 4 },
];

/**
 * What Reports' Receptionist lens reads (convergeReceptionist): a week of Sam Example's own conversation on WhatsApp, two
 * handovers and a call nobody took. Every row's `external_id` (and the call's id) starts with this, so a run finds and
 * deletes last night's by it, and nothing else.
 */
export const RECEPTIONIST_PREFIX = "e2e-seed-r-";
/** The call nobody took: Casey Example's, that never connected, with nobody ringing back or writing in the hour after. */
export const MISSED_CALL_ID = `${RECEPTIONIST_PREFIX}missed`;
/** The hold the owner set, as a held draft carries it (apps/edge/lib/receptionist/draft-queue.ts: `meta.delay_ms`). */
const HOLD_MS = MIN_MS;
/**
 * Sam's five asks, on the workspace's own calendar (days before the run, and the wall-clock time), every one at least two
 * calendar days back: the unfinished-message sweep looks back a day for a text nobody finished with and the bell keeps a
 * missed call a day, so nothing here is theirs, and Robin's thread, two hours old, stays the newest conversation. Three
 * are about booking and two about prices, as the receptionist read them (`meta.intent`), and each was answered by the
 * receptionist in the language it was asked in. A held reply went out a minute and two seconds after the ask (the hold,
 * and the seconds it took to go); one ask had a draft the owner cancelled first (`cancelled`: an owner's cancel leaves
 * no reason), and one a draft the owner steered (`steered`: the old draft is retired for its replacement, and says so).
 * The times of day are fixed, so the quarter hour each falls in does not depend on when the run is.
 */
const SAM_ASKS = [
  {
    daysAgo: 6,
    at: "10:10",
    intent: "booking",
    body: "Hi, do you have any time on Thursday?",
    answer: { held: true, language: "en", body: `Yes! Pick a time here: ${BOOKING_LINK}` },
  },
  {
    daysAgo: 5,
    at: "14:30",
    intent: "pricing",
    body: "How much is a first visit?",
    cancelled: "Hello! How can I help you today?",
    answer: {
      held: true,
      language: "en",
      body: "Prices depend on the visit; the team will tell you the exact figure.",
    },
  },
  {
    daysAgo: 4,
    at: "21:15",
    intent: "booking",
    body: "Hola, ¿tienen un hueco el sábado?",
    answer: { held: true, language: "es", body: `¡Claro! Reserva aquí: ${BOOKING_LINK}` },
  },
  {
    daysAgo: 3,
    at: "08:20",
    intent: "pricing",
    body: "And what do you charge for a follow-up?",
    steered: "A follow-up costs the same as a first visit.",
    answer: { held: false, language: "en", body: "A follow-up is quoted by the team, who will message you today." },
  },
  {
    daysAgo: 2,
    at: "11:05",
    intent: "booking",
    body: "Can I move my booking to next week?",
    answer: { held: false, language: "en", body: `Of course. Pick a new time here: ${BOOKING_LINK}` },
  },
];
/** Mail a program wrote from an address Sam owns: a customer message by its row, and nobody's words (public.message_is_a_persons_words). */
const SAM_AUTOMATED_MAIL = {
  daysAgo: 3,
  at: "03:12",
  body: "Your order has shipped. This is an automated message; please do not reply.",
};
/**
 * Two handovers, resolved when they were written (the stamp trigger runs on UPDATE only, so the times are the seed's): a
 * person's own reply ten minutes after each, and the thread settled 50 and 70 minutes after it was handed over.
 */
const SAM_HANDOVERS = [
  { daysAgo: 5, at: "15:00", settledAfter: 50 * MIN_MS, reply: "Hello, this is the team. Happy to help with that." },
  { daysAgo: 3, at: "12:00", settledAfter: 70 * MIN_MS, reply: "Hi, the team here. We can look at that together." },
];
/** The call nobody took: an hour or more with no answer, on a day that is not news to the bell for a day after. */
const MISSED_CALL = { daysAgo: 2, at: "15:20" };

/**
 * What Reports' People lens reads of the ledger and of the team's steps (convergePeople), found by a run to be deleted and
 * written again: every yes event carries PEOPLE_NOTE as its `note`, and every step's words start with PEOPLE_PREFIX. A real
 * yes, another kind of event and a step a person wrote carry neither, so a run never touches them.
 */
export const PEOPLE_NOTE = "e2e-seed-p";
export const PEOPLE_PREFIX = "e2e seed step: ";
/** The time of day the owner marks a step done, on a day of the workspace's calendar. */
const STEP_DONE_AT = "11:00";
const [ROBIN, CASEY, SAM] = PEOPLE;
/**
 * The three steps the owner finished, by the workspace's days before the run: whose (by phone number), the day each was due,
 * the day it was done and what it says after the prefix. Casey Example's first was done on its day and the second the day
 * after its day; Robin Example's was done three days before its day came. So the lens counts three steps done in the month,
 * two of them on their day or before, and no step is open.
 */
const PEOPLE_STEPS = [
  { person: CASEY.phone, dueDaysAgo: 5, doneDaysAgo: 5, words: "check in after the first visit" },
  { person: CASEY.phone, dueDaysAgo: 9, doneDaysAgo: 8, words: "send the price list" },
  { person: ROBIN.phone, dueDaysAgo: 3, doneDaysAgo: 6, words: "confirm the booking link works" },
];

/**
 * Every person's two answers, in force after each run: a yes to messages, taken
 * in person a week before the run, and nothing yet about offers. The specs
 * (e2e/today/owner-signals.spec.ts) read this state and nothing else; verify() below
 * refuses a workspace that drifted from it.
 */
export const SAID_YES_TO_MESSAGES = "opted_in";
export const SAID_YES_TO_OFFERS = "unknown";
const CONSENT_SOURCE = "in_person";
const WEEK_MS = 7 * 86_400_000;
/**
 * Where the workspace's alerts go: Resend's test inbox, which simulates a
 * delivery and reaches nobody (resend.com/docs/dashboard/emails/send-test-emails).
 * No `from` of its own, so the alert leaves from the platform's verified sender.
 * The header says why there is an address at all.
 */
export const ALERT_INBOX = "delivered@resend.dev";
/** The name workspace-create.spec.ts gives the workspaces it makes and deletes. */
const PROBE_PREFIX = "E2E probe";
/**
 * What provision_tenant gives a new workspace (00073; offers, win-backs and follow-ups held for a stop since 00463,
 * decision 0064), so a run starts from it.
 */
const POLICY_MODES = {
  faq: "auto",
  booking: "auto",
  reply: "auto",
  reengage: "veto",
  campaign: "veto",
  reviews: "ask",
  money: "never",
  follow_up: "veto",
};
const REPLY_LIMITS = { max_replies_day: 20, pause_hours: 24 };

/** The channel's id: the workspace's own, and never something a real number could be. */
export const channelExternalId = (tenantId) => `e2e-wa-${tenantId}`;

function must(what, res) {
  if (res?.error) throw new Error(`${what}: ${res.error.message}`);
  return res?.data ?? null;
}

/**
 * The one line the workspace answers on: a WhatsApp channel with no credentials and no WhatsApp business account.
 * Pure, and the only spelling of it -- converge() writes it with the workspace's own id, and the local harness
 * (e2e-harness/scenarios.mjs) shows the Business page the same line the nightly's workspace holds.
 */
export function workspaceChannel() {
  return {
    kind: "whatsapp",
    number_e164: BUSINESS_PHONE,
    waba_id: null,
    credentials_ref: null,
    status: "active",
    config: {},
  };
}

/** A config the settings save would accept, built by the same helpers. */
export function workspaceConfig() {
  const brain = {
    business_name: NAME,
    phone_display: BUSINESS_PHONE_DISPLAY,
    booking_link: BOOKING_LINK,
    ...newReceptionistDefaults(NAME),
  };
  const parsed = TenantConfigWriteSchema.safeParse({ brain, notifications: { escalation_emails: [ALERT_INBOX] } });
  if (!parsed.success) {
    throw new Error(
      `the seeded config would not save: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}

async function findUser(db, email) {
  const want = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listing users: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === want);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function ensureUser(db, email, apply, did) {
  const found = await findUser(db, email);
  if (found) return found.id;
  if (!apply) {
    did.push(`would create the user ${email}`);
    return null;
  }
  // Confirmed at creation, so no email is sent; sign-in is minted by the harness.
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`creating ${email}: ${error.message}`);
  did.push(`created the user ${email}`);
  return data.user.id;
}

/** Every row the workspace holds that a run resets, for the backup taken before one. */
export async function snapshot(db, tenantId, userIds) {
  const rows = [];
  const keep = (table, data) => {
    for (const row of data ?? []) rows.push({ table, row });
  };
  if (tenantId) {
    keep("tenants", must("backing up tenants", await db.from("tenants").select("*").eq("id", tenantId)));
    // Not `events`: the ledger rows a run deletes (blocked sends, the Google replies', the People yeses) are the seed's own, written afresh.
    for (const table of [
      "billing_accounts",
      "tenant_config",
      "policies",
      "memberships",
      "tenant_channels",
      "contacts",
      "contact_identities",
      "conversations",
      "messages",
      "calls",
      "escalations",
      "jobs",
      "sequence_batches",
      "sequence_sends",
      "segments",
      "templates",
      "sequence_steps",
      "ask_threads",
      "invitations",
      "lead_searches",
      "lead_rounds",
      "leads",
      "lead_search_members",
      "lead_counters",
      "lead_operations",
      "google_listings",
      "google_connections",
      "google_reviews",
      "google_listing_days",
      "person_notes",
    ]) {
      keep(table, must(`backing up ${table}`, await db.from(table).select("*").eq("tenant_id", tenantId)));
    }
    // Not every decision: the ledger of what people decided is the workspace's, and a run deletes the one approval it wrote.
    keep(
      "decisions",
      must(
        "backing up the run's approval",
        await db.from("decisions").select("*").eq("tenant_id", tenantId).eq("payload->>seed", CAMPAIGNS_NOTE),
      ),
    );
  }
  const ids = userIds.filter(Boolean);
  if (ids.length)
    keep("profiles", must("backing up profiles", await db.from("profiles").select("*").in("user_id", ids)));
  return rows;
}

async function deleteWhere(db, table, column, values, what) {
  for (const value of values) must(what, await db.from(table).delete().eq(column, value));
}

/**
 * Brings the workspace to its known state. With `apply: false` it reads, checks
 * every refusal, and says what it would do. `seedWinBack` (--seed-win-back, by
 * hand only) adds the eval's Win-back where it is not there (convergeWinBack).
 */
export async function converge(
  db,
  { ownerEmail, memberEmail, apply = false, seedWinBack = false, now = Date.now(), backup = null } = {},
) {
  for (const [label, email] of [
    ["E2E_USER_EMAIL", ownerEmail],
    ["E2E_MEMBER_EMAIL", memberEmail],
  ]) {
    if (!/^[^@\s]+@example\.com$/i.test(email ?? "")) {
      throw new Error(`${label} must be an address at example.com: this resets the account it names`);
    }
  }
  if (ownerEmail.toLowerCase() === memberEmail.toLowerCase())
    throw new Error("the owner and the teammate must be two addresses");
  const config = workspaceConfig();
  const did = [];

  const ownerId = await ensureUser(db, ownerEmail, apply, did);
  const memberId = await ensureUser(db, memberEmail, apply, did);

  let tenant = must(
    "reading the workspace",
    await db.from("tenants").select("id, name, status").eq("slug", SLUG).maybeSingle(),
  );
  if (tenant) {
    const members = must(
      "reading its members",
      await db.from("memberships").select("user_id").eq("tenant_id", tenant.id),
    );
    const strangers = members.filter((m) => m.user_id !== ownerId && m.user_id !== memberId);
    if (strangers.length)
      throw new Error(`${SLUG} has ${strangers.length} member(s) besides the two test users; refusing to reset it`);
  }

  // The specs assume one workspace. A probe workspace-create.spec.ts failed to
  // delete is swept; any other membership is a mistake to report, not to fix.
  let probes = [];
  if (ownerId) {
    const mine = must(
      "reading the owner's memberships",
      await db.from("memberships").select("tenant_id").eq("user_id", ownerId),
    );
    const otherIds = mine.map((m) => m.tenant_id).filter((id) => id !== tenant?.id);
    if (otherIds.length) {
      const others = must(
        "reading the owner's other workspaces",
        await db.from("tenants").select("id, name").in("id", otherIds),
      );
      const foreign = others.filter((t) => !t.name.startsWith(PROBE_PREFIX));
      if (foreign.length)
        throw new Error(
          `the test owner also belongs to ${foreign.map((t) => t.name).join(", ")}; refusing, since the specs assume one workspace`,
        );
      for (const probe of others) {
        const pm = must(
          "reading a probe's members",
          await db.from("memberships").select("user_id").eq("tenant_id", probe.id),
        );
        if (pm.some((m) => m.user_id !== ownerId))
          throw new Error(`the probe workspace "${probe.name}" has another member; refusing to delete it`);
      }
      probes = others;
    }
  }

  if (!apply) {
    for (const probe of probes) did.push(`would delete the leftover probe workspace "${probe.name}"`);
    did.push(tenant ? `would reset ${SLUG} (${tenant.id})` : `would create ${SLUG}`);
    if (seedWinBack) did.push("would add the eval's Win-back, paused, where it is not there");
    return { apply, did, tenantId: tenant?.id ?? null };
  }

  if (backup) await backup(await snapshot(db, tenant?.id ?? null, [ownerId, memberId]));

  for (const probe of probes) {
    must("deleting a probe's events", await db.from("events").delete().eq("tenant_id", probe.id));
    must("deleting a probe's memberships", await db.from("memberships").delete().eq("tenant_id", probe.id));
    must("deleting a probe workspace", await db.from("tenants").delete().eq("id", probe.id));
    did.push(`deleted the leftover probe workspace "${probe.name}"`);
  }

  if (!tenant) {
    tenant = must(
      "creating the workspace",
      await db
        .from("tenants")
        .insert({ slug: SLUG, name: NAME, status: "active", timezone: TIMEZONE })
        .select("id, name, status")
        .single(),
    );
    did.push(`created ${SLUG}`);
  }
  const T = tenant.id;
  const stamp = new Date(now).toISOString();

  // The workspace itself, and what provisioning gives every workspace.
  must("provisioning the workspace", await db.rpc("provision_tenant", { p_tenant_id: T }));
  must(
    "naming the workspace",
    await db.from("tenants").update({ name: NAME, status: "active", timezone: TIMEZONE }).eq("id", T),
  );
  must(
    "setting billing",
    await db.from("billing_accounts").upsert(
      {
        tenant_id: T,
        mode: "direct",
        status: "active",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        price_id: null,
        current_period_end: null,
        trial_end: null,
        cancel_at: null,
        cancel_at_period_end: false,
        card_brand: null,
        card_last4: null,
        last_payment_failed_at: null,
        last_paid_at: null,
        facts: {},
      },
      { onConflict: "tenant_id" },
    ),
  );
  must(
    "setting the config",
    await db.from("tenant_config").update({ config, updated_by: null, calendar_checked_at: null }).eq("tenant_id", T),
  );
  for (const p of must(
    "reading policies",
    await db.from("policies").select("id, class, subject_type").eq("tenant_id", T),
  )) {
    if (p.subject_type === null || p.subject_type === undefined) {
      if (POLICY_MODES[p.class]) {
        must(
          "resetting a policy",
          await db
            .from("policies")
            .update({ mode: POLICY_MODES[p.class], limits: p.class === "reply" ? REPLY_LIMITS : {} })
            .eq("id", p.id),
        );
      }
    } else {
      must("removing a person's policy", await db.from("policies").delete().eq("id", p.id));
    }
  }

  // The people who sign in, each with nothing a spec left behind.
  must(
    "the owner's membership",
    await db
      .from("memberships")
      .upsert({ user_id: ownerId, tenant_id: T, role: "owner", views: {} }, { onConflict: "user_id,tenant_id" }),
  );
  must(
    "the teammate's membership",
    await db
      .from("memberships")
      .upsert({ user_id: memberId, tenant_id: T, role: "operator", views: {} }, { onConflict: "user_id,tenant_id" }),
  );
  must(
    "the profiles",
    await db.from("profiles").upsert(
      [
        { user_id: ownerId, display_name: "", updated_at: stamp },
        { user_id: memberId, display_name: "", updated_at: stamp },
      ],
      { onConflict: "user_id" },
    ),
  );
  // An open invitation to either address is accepted on sign-in, which would
  // add a membership; take any back.
  for (const email of [ownerEmail, memberEmail]) {
    must(
      "revoking invitations",
      await db
        .from("invitations")
        .update({ revoked_at: stamp })
        .eq("email", email.toLowerCase())
        .is("accepted_at", null)
        .is("revoked_at", null),
    );
  }

  // Whatever the specs made in the workspace, gone before it is rebuilt.
  const tenantRows = async (table, columns = "id") =>
    must(`reading ${table}`, await db.from(table).select(columns).eq("tenant_id", T));
  await deleteWhere(
    db,
    "calls",
    "id",
    (await tenantRows("calls", "id, retell_call_id")).filter((c) => c.retell_call_id !== CALL_ID).map((c) => c.id),
    "clearing calls",
  );
  // The people on every run go with their runs (the database cascades them; written out, so a run over a double clears them too).
  must("clearing the runs' people", await db.from("sequence_sends").delete().eq("tenant_id", T));
  // A deal a spec recorded (0004, 0008), and the one a proposal link opens where deals are on: every run starts from none.
  for (const table of ["escalations", "jobs", "sequence_batches", "segments", "ask_threads", "deals"]) {
    await deleteWhere(
      db,
      table,
      "id",
      (await tenantRows(table)).map((r) => r.id),
      `clearing ${table}`,
    );
  }
  must("clearing messages", await db.from("messages").delete().eq("tenant_id", T));

  const people = [];
  for (const person of PEOPLE) {
    let row = must(
      "reading a person",
      await db.from("contacts").select("id, erased_at").eq("tenant_id", T).eq("phone_e164", person.phone).maybeSingle(),
    );
    if (row?.erased_at) {
      await deleteWhere(db, "conversations", "contact_id", [row.id], "clearing an erased person's conversation");
      await deleteWhere(db, "contact_identities", "contact_id", [row.id], "clearing an erased person's identities");
      must("removing an erased person", await db.from("contacts").delete().eq("id", row.id));
      row = null;
    }
    const fields = {
      display_name: person.name,
      wa_profile_name: person.waProfile,
      consent: SAID_YES_TO_MESSAGES,
      consent_source: CONSENT_SOURCE,
      consent_updated_at: new Date(now - WEEK_MS).toISOString(),
      dnc: false,
      notes: null,
      email: null,
      proposal_url: null,
      marketing_consent: SAID_YES_TO_OFFERS,
      marketing_consent_source: null,
      marketing_consent_updated_at: null,
      merged_into_contact_id: null,
    };
    if (row) must("resetting a person", await db.from("contacts").update(fields).eq("id", row.id));
    else
      row = must(
        "adding a person",
        await db
          .from("contacts")
          .insert({ tenant_id: T, phone_e164: person.phone, ...fields })
          .select("id")
          .single(),
      );
    people.push({ ...person, id: row.id });
  }
  const keep = new Set(people.map((p) => p.id));
  const [robin] = people;

  const conversations = await tenantRows("conversations", "id, contact_id");
  await deleteWhere(
    db,
    "conversations",
    "id",
    conversations.filter((c) => c.contact_id !== robin.id).map((c) => c.id),
    "clearing conversations",
  );
  const strangers = (await tenantRows("contacts")).filter((c) => !keep.has(c.id)).map((c) => c.id);
  await deleteWhere(db, "contact_identities", "contact_id", strangers, "clearing identities");
  await deleteWhere(db, "contacts", "id", strangers, "clearing people");
  for (const person of people) {
    must(
      "a person's identity",
      await db.from("contact_identities").upsert(
        {
          tenant_id: T,
          contact_id: person.id,
          channel: person.identity.channel,
          external_id: person.identity.external_id,
          raw: {},
        },
        { onConflict: "tenant_id,channel,external_id" },
      ),
    );
  }

  const channelId = channelExternalId(T);
  if (/^\+?\d+$/.test(channelId)) throw new Error("the channel id must not be something a real number could be");
  await deleteWhere(
    db,
    "tenant_channels",
    "id",
    (await tenantRows("tenant_channels", "id, external_id"))
      .filter((c) => c.external_id !== channelId)
      .map((c) => c.id),
    "clearing channels",
  );
  must(
    "the WhatsApp channel",
    await db
      .from("tenant_channels")
      .upsert({ tenant_id: T, external_id: channelId, ...workspaceChannel() }, { onConflict: "kind,external_id" }),
  );

  // One conversation, re-dated so Reports counts it: the customer asked, the AI answered.
  const inAt = new Date(now - 2 * 3600_000).toISOString();
  const outAt = new Date(now - 2 * 3600_000 + 20_000).toISOString();
  const thread = {
    state: "open",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    last_message_at: outAt,
    last_inbound_at: inAt,
    last_wa_inbound_at: inAt,
  };
  let cv = must(
    "reading the conversation",
    await db.from("conversations").select("id").eq("tenant_id", T).eq("contact_id", robin.id).maybeSingle(),
  );
  if (cv) must("re-dating the conversation", await db.from("conversations").update(thread).eq("id", cv.id));
  else
    cv = must(
      "starting the conversation",
      await db
        .from("conversations")
        .insert({ tenant_id: T, contact_id: robin.id, ...thread })
        .select("id")
        .single(),
    );
  must(
    "the conversation's messages",
    await db.from("messages").insert([
      {
        tenant_id: T,
        conversation_id: cv.id,
        contact_id: robin.id,
        channel: "whatsapp",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "Hi, can I book a trim this week?",
        external_id: "e2e-seed-a-in",
        channel_ts: inAt,
        created_at: inAt,
        status: "received",
        meta: {},
      },
      {
        tenant_id: T,
        conversation_id: cv.id,
        contact_id: robin.id,
        channel: "whatsapp",
        direction: "outbound",
        sender: "ai",
        type: "text",
        body: `Yes! Pick a time here: ${BOOKING_LINK}`,
        external_id: "e2e-seed-a-out",
        channel_ts: outAt,
        created_at: outAt,
        status: "delivered",
        status_updated_at: outAt,
        meta: {},
      },
    ]),
  );

  // One finished call with a transcript, outside any thread, already notified.
  const startedAt = new Date(now - 26 * 3600_000).toISOString();
  const endedAt = new Date(now - 26 * 3600_000 + 95_000).toISOString();
  const casey = people[1];
  must(
    "the call",
    await db.from("calls").upsert(
      {
        tenant_id: T,
        retell_call_id: CALL_ID,
        agent_id: null,
        channel_id: null,
        contact_id: casey.id,
        conversation_id: null,
        message_id: null,
        direction: "inbound",
        call_type: "phone_call",
        from_e164: casey.phone,
        to_e164: BUSINESS_PHONE,
        status: "ended",
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: 95_000,
        disconnection_reason: "user_hangup",
        sentiment: "Positive",
        call_successful: true,
        in_voicemail: false,
        summary: "The caller asked about opening hours and was sent the booking link.",
        wanted: "Asked about opening hours",
        outcome: "answered",
        recording: null,
        raw: {},
        notified_at: endedAt,
        transcript:
          "Agent: Thanks for calling Chanlytics E2E Studio, how can I help?\nUser: What time do you open tomorrow?\nAgent: I can text you the booking link with the times.",
        transcript_object: [
          {
            role: "agent",
            content: "Thanks for calling Chanlytics E2E Studio, how can I help?",
            words: [{ start: 0.4 }],
          },
          { role: "user", content: "What time do you open tomorrow?", words: [{ start: 4.1 }] },
          { role: "agent", content: "I can text you the booking link with the times.", words: [{ start: 7.9 }] },
        ],
      },
      { onConflict: "tenant_id,retell_call_id" },
    ),
  );

  await convergeLeads(db, T, ownerId, now);
  await convergeGoogle(db, T, ownerId, now);
  const winBack = await convergeWinBack(db, T, ownerId, seedWinBack);
  if (winBack) did.push(winBack);
  await convergeReceptionist(db, T, ownerId, now);
  await convergePeople(db, T, ownerId, now);
  await convergeCampaigns(db, T, ownerId, now);

  const problems = await verify(db, T, ownerId);
  if (problems.length) throw new Error(`the workspace is not in its known state: ${problems.join("; ")}`);
  did.push(`${SLUG} is in its known state`);
  return { apply, did, tenantId: T };
}

/**
 * The lead finder's seed: one finished search, six leads, their memberships and
 * the month's counters, deleted and written again every run so the specs read
 * one state. The workspace is listed in `lead_platform.tenants_on` (decision
 * 30) so a paid run may start a real search here while the switch stays off for
 * everyone else -- the list is added to, never replaced, and `searches_on` is
 * never touched.
 *
 * A round may not be inserted ended (00140's lead_rounds_guard: a round starts
 * queued), so it is written queued and then ended in one update, which is the
 * transition the guard allows. The waiting search's round is walked the same
 * way: queued, probing, then waiting_on_owner, the path the runner takes.
 *
 * Each move into waiting_on_owner or ended fires 00163's lead_rounds_notify,
 * which keeps a bell row and queues a push_send job for it -- unless a row of
 * that kind for that round is already there. The seed writes that row first,
 * in the trigger's own words, so the bell holds what production would hold and
 * no push job is ever queued: nothing is left for the job runner to carry to a
 * phone, whatever phone is signed in as a test user. Last night's rows go
 * first, with the rounds they were about.
 */
async function convergeLeads(db, T, ownerId, now) {
  const stamp = new Date(now).toISOString();
  const month = leadMonth(TIMEZONE, new Date(now));
  const day = new Date(now).toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  const platform = must(
    "reading the platform switch",
    await db.from("lead_platform").select("searches_on, tenants_on").eq("id", true).maybeSingle(),
  );
  if (!platform) throw new Error("lead_platform has no row: release A's migration is not on this database");
  if (!(platform.tenants_on ?? []).includes(T)) {
    must(
      "listing the workspace as one that may search",
      await db
        .from("lead_platform")
        .update({ tenants_on: [...(platform.tenants_on ?? []), T] })
        .eq("id", true),
    );
  }

  const old = must("reading the searches", await db.from("lead_searches").select("id").eq("tenant_id", T));
  await deleteWhere(
    db,
    "lead_searches",
    "id",
    old.map((s) => s.id),
    "clearing searches",
  );
  must("clearing lead operations", await db.from("lead_operations").delete().eq("tenant_id", T));
  must("clearing leads", await db.from("leads").delete().eq("tenant_id", T));
  must("clearing the lead counters", await db.from("lead_counters").delete().eq("tenant_id", T));
  must(
    "clearing the bell's lead rows",
    await db.from("notifications").delete().eq("tenant_id", T).eq("subject_type", "lead_round"),
  );
  // The bell's row for a round, written before the move that would make 00163's trigger write it with a push job.
  const bell = async (kind, round, title, body, route) =>
    must(
      `the bell's ${kind} row`,
      await db.from("notifications").insert({
        tenant_id: T,
        kind,
        title,
        body,
        route,
        subject_type: "lead_round",
        subject_id: round.id,
        created_at: stamp,
      }),
    );

  const search = must(
    "the search",
    await db
      .from("lead_searches")
      .insert({
        tenant_id: T,
        created_by: ownerId,
        via: LEAD_SEARCH.via,
        card: LEAD_SEARCH.card,
        name: LEAD_SEARCH.name,
        asked: LEAD_SEARCH.asked,
        plan: LEAD_PLAN,
        created_at: stamp,
      })
      .select("id")
      .single(),
  );

  const round = must(
    "the round",
    await db
      .from("lead_rounds")
      .insert({
        tenant_id: T,
        search_id: search.id,
        seq: LEAD_ROUND.seq,
        purpose: LEAD_ROUND.purpose,
        plan: LEAD_PLAN,
        plan_version: LEAD_ROUND.plan_version,
        target: LEAD_ROUND.target,
        state: "queued",
        allowance_reserved: 0,
        allowance_used: LEAD_COUNTED,
        cost_reserved_usd: 0,
        cost_usd: LEAD_ROUND.cost_usd,
        judge_tokens: LEAD_ROUND.judge_tokens,
        judge_model: "seed",
        month,
        day,
        platform_day: new Date(now).toISOString().slice(0, 10),
        started_at: stamp,
        created_at: stamp,
      })
      .select("id")
      .single(),
  );
  await bell(
    "leads_ready",
    round,
    `Your search for ${LEAD_SEARCH.name} is done`,
    `${LEADS.filter((l) => l.member.class === "qualified").length} found.`,
    leadsRoute({ searchId: search.id }),
  );
  must(
    "ending the round",
    await db
      .from("lead_rounds")
      .update({ state: "ended", ending: LEAD_ROUND.ending, ended_at: stamp })
      .eq("id", round.id),
  );

  // A minute apart, oldest last: `leads_page`'s fit sort packs the band with
  // (9999999999 - found_at), so six leads found in the same second tie and fall
  // back to a random member id. The specs read "strongest fit first" off this.
  for (const [i, lead] of LEADS.entries()) {
    const foundAt = new Date(now - i * 60_000).toISOString();
    const row = must(
      "a lead",
      await db
        .from("leads")
        .insert({
          tenant_id: T,
          place_id: lead.place_id,
          business_name: lead.business_name,
          category: lead.category,
          street: lead.street,
          city: lead.city,
          region: lead.region,
          country: "US",
          website_host: lead.website_host,
          phone_e164: lead.phone_e164,
          phone_sources: lead.website_host ? 2 : 1,
          email: lead.email,
          email_state: lead.email_state,
          email_checked_at: lead.email_state === "none" ? null : foundAt,
          rating: lead.rating,
          reviews: lead.reviews,
          stage: lead.stage,
          found_at: foundAt,
        })
        .select("id")
        .single(),
    );
    must(
      "a membership",
      await db.from("lead_search_members").insert({
        search_id: search.id,
        lead_id: row.id,
        round_id: round.id,
        tenant_id: T,
        judgment: {
          answer: {
            ref: lead.place_id,
            criteria: Object.entries(lead.member.judged).map(([key, answer]) => ({
              key,
              answer,
              facts: ["name", "category"],
            })),
            email_index: lead.email ? 0 : null,
            reason: lead.member.reason,
          },
          reasons: [],
          shares: [],
        },
        class: lead.member.class,
        excluded_by: lead.member.excluded_by ?? null,
        fit: lead.member.fit,
        reason: lead.member.reason,
        counted: lead.member.counted,
        counted_month: lead.member.counted ? month : null,
        created_at: stamp,
      }),
    );
  }

  // The search that stopped to ask. Its round is made now, so that while it is queued and probing no sweep could
  // call it stuck (planLeadSweep: an hour old with nothing live), and is dated back only once it waits, a state the
  // sweep ends only after a day (end_question, from waiting_since).
  const waitingSince = new Date(now - WAITING_FOR_MS).toISOString();
  const asked = new Date(now - WAITING_FOR_MS - 5 * 60_000).toISOString();
  const waiting = must(
    "the waiting search",
    await db
      .from("lead_searches")
      .insert({
        tenant_id: T,
        created_by: ownerId,
        via: WAITING_SEARCH.via,
        card: WAITING_SEARCH.card,
        name: WAITING_SEARCH.name,
        asked: WAITING_SEARCH.asked,
        plan: WAITING_PLAN,
        created_at: asked,
      })
      .select("id")
      .single(),
  );
  const probe = must(
    "the waiting round",
    await db
      .from("lead_rounds")
      .insert({
        tenant_id: T,
        search_id: waiting.id,
        seq: WAITING_ROUND.seq,
        purpose: WAITING_ROUND.purpose,
        plan: WAITING_PLAN,
        plan_version: WAITING_ROUND.plan_version,
        target: WAITING_ROUND.target,
        state: "queued",
        allowance_reserved: 0,
        allowance_used: 0,
        cost_reserved_usd: 0,
        cost_usd: WAITING_ROUND.cost_usd,
        judge_tokens: WAITING_ROUND.judge_tokens,
        judge_model: "seed",
        month,
        day,
        platform_day: new Date(now).toISOString().slice(0, 10),
        started_at: stamp,
        created_at: stamp,
      })
      .select("id")
      .single(),
  );
  must("probing the waiting round", await db.from("lead_rounds").update({ state: "probing" }).eq("id", probe.id));
  for (const [i, lead] of WAITING_LEADS.entries()) {
    const foundAt = new Date(now - WAITING_FOR_MS - i * 60_000).toISOString();
    const row = must(
      "a place the question is about",
      await db
        .from("leads")
        .insert({
          tenant_id: T,
          place_id: lead.place_id,
          business_name: lead.business_name,
          category: "Pilates studio",
          street: lead.street,
          city: "Denver",
          region: "CO",
          country: "US",
          website_host: lead.website_host,
          phone_e164: lead.phone_e164,
          phone_sources: 2,
          email: null,
          email_state: "none",
          email_checked_at: null,
          rating: lead.rating,
          reviews: lead.reviews,
          stage: "ready",
          found_at: foundAt,
        })
        .select("id")
        .single(),
    );
    must(
      "its membership",
      await db.from("lead_search_members").insert({
        search_id: waiting.id,
        lead_id: row.id,
        round_id: probe.id,
        tenant_id: T,
        judgment: {
          answer: {
            ref: lead.place_id,
            criteria: [
              { key: "independent", answer: "fail", facts: ["name", "category"] },
              { key: "website", answer: "pass", facts: ["name", "category"] },
              { key: "franchise", answer: "fail", facts: ["name", "category"] },
            ],
            email_index: null,
            reason: "One of a franchise's studios",
          },
          reasons: [],
          shares: [],
        },
        class: "excluded",
        excluded_by: "franchise",
        fit: null,
        reason: "One of a franchise's studios",
        counted: false,
        counted_month: null,
        created_at: foundAt,
      }),
    );
  }
  const question = { ...WAITING_ROUND.question, asked_at: waitingSince };
  await bell(
    "leads_question",
    probe,
    leadQuestionTitle(WAITING_SEARCH.name),
    question.sentence,
    leadQuestionRoute(waiting.id),
  );
  must(
    "stopping the waiting round to ask",
    await db
      .from("lead_rounds")
      .update({ state: "waiting_on_owner", question, waiting_since: waitingSince, created_at: asked })
      .eq("id", probe.id),
  );

  must(
    "the month's counters",
    await db.from("lead_counters").insert([
      { tenant_id: T, kind: "allowance", period: month, used: LEAD_COUNTED, reserved: 0 },
      {
        tenant_id: T,
        kind: "budget",
        period: month,
        used: (Number(LEAD_ROUND.cost_usd) + Number(WAITING_ROUND.cost_usd)).toFixed(4),
        reserved: 0,
      },
    ]),
  );
}

/**
 * The Google seed: the listing, the Business Profile connected to it, four of its reviews and two days of its count,
 * deleted and written again every run, with the events its replies filed, so e2e/google.spec.ts reads the Reviews lens
 * drawn from a Business Profile that has synced (reviews_complete, last_synced_at), with a reply the receptionist wrote
 * and one it held back. Nothing is linked through the product, for a link reads Google and a connect needs a person's
 * consent: the rows are written as the edge's writers leave them, and the two events through emitEvent, the writer
 * reviews_ledger (00350) reads who wrote a reply and why one was held from.
 *
 * What the sweeps do to them. The hourly Google sweep (apps/edge/lib/google/google-sweep.ts) reads a listing not read for
 * twenty hours and syncs a profile not synced for twenty hours. Both stamps are the run's and the seed runs every
 * morning, so the sweep reaches these rows only after a missed morning, and then harmlessly: the place id is no place
 * Google has, so the read fails and writes `check_error` on the listing; the connection holds no credentials, so the
 * sync fails at its token and writes `sync_error` on the connection. A failure moves no stamp and touches no review, and
 * the receptionist answers reviews only after a sync that succeeded, which this one cannot be (and the workspace's reviews
 * are on `ask`). It rings the bell once: a connection with no credentials is a cause only its owner can mend, told at the
 * first failure (apps/edge/lib/google/sync-notice.ts, the wiring's second audit R11 S11-4). The next run writes both rows
 * afresh, without either column, and clears that notice with them. No review is news (each was first seen when it was written, days before the
 * thirty-six hours news lasts), so Today draws no line about one and none rings the bell.
 */
async function convergeGoogle(db, T, ownerId, now) {
  const stamp = new Date(now).toISOString();
  const ago = (ms) => new Date(now - ms).toISOString();
  const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  must("clearing the Google days", await db.from("google_listing_days").delete().eq("tenant_id", T));
  must("clearing the Google reviews", await db.from("google_reviews").delete().eq("tenant_id", T));
  must("clearing the Google listing", await db.from("google_listings").delete().eq("tenant_id", T));
  must("clearing the Google connection", await db.from("google_connections").delete().eq("tenant_id", T));
  must(
    "clearing the notice of a sync that stopped",
    await db.from("notifications").delete().eq("tenant_id", T).eq("subject_type", "google_connection"),
  );
  must(
    "clearing the events of the replies",
    await db
      .from("events")
      .delete()
      .eq("tenant_id", T)
      .eq("subject_type", "review")
      .in("kind", ["google.replied", "google.reply_held"]),
  );

  must(
    "the Google listing",
    await db.from("google_listings").insert({
      tenant_id: T,
      ...GOOGLE_LISTING,
      linked_by: ownerId,
      linked_at: ago(45 * DAY_MS),
      checked_at: stamp,
      check_error: null,
    }),
  );
  must(
    "the Business Profile",
    await db.from("google_connections").insert({
      tenant_id: T,
      ...GOOGLE_CONNECTION,
      google_email: null,
      account_title: NAME,
      location_title: NAME,
      connected_by: ownerId,
      connected_at: ago(45 * DAY_MS),
      last_synced_at: stamp,
      sync_error: null,
      credentials_ref: null,
      reviews_complete: true,
    }),
  );
  const reviews = must(
    "the Google reviews",
    await db
      .from("google_reviews")
      .insert(
        GOOGLE_REVIEWS.map((r) => {
          const written = now - r.writtenDaysAgo * DAY_MS;
          const repliedAt =
            r.reply && (r.reply.hoursAgo ? now - r.reply.hoursAgo * HOUR_MS : written + r.reply.hoursAfter * HOUR_MS);
          return {
            tenant_id: T,
            review_id: r.review_id,
            origin: "profile",
            rating: r.rating,
            author: r.author,
            body: r.body,
            published_at: new Date(written).toISOString(),
            reply_text: r.reply?.text ?? null,
            replied_at: repliedAt ? new Date(repliedAt).toISOString() : null,
            first_seen_at: new Date(written).toISOString(),
            last_seen_at: stamp,
          };
        }),
      )
      .select("id, review_id"),
  );
  for (const r of GOOGLE_REVIEWS) {
    const row = reviews.find((x) => x.review_id === r.review_id);
    if (r.reply?.by === "receptionist")
      await emitEvent(db, T, "google.replied", "review", row.id, {
        review_id: r.review_id,
        chars: r.reply.text.length,
        by: "receptionist",
      });
    if (r.held) await emitEvent(db, T, "google.reply_held", "review", row.id, { review_id: r.review_id, why: r.held });
  }
  must(
    "the listing's days",
    await db.from("google_listing_days").insert(
      GOOGLE_DAYS.map((d) => ({
        tenant_id: T,
        day: dayOf(now - d.daysAgo * DAY_MS),
        rating: d.rating,
        review_count: d.review_count,
      })),
    ),
  );
}

const SECOND_MS = 1_000;

/**
 * The instant a wall-clock time falls on a day of the workspace's calendar, in its zone: the date and "HH:MM" read as if
 * they were UTC, then moved back by the zone's offset at that moment (asked twice, so a day the clocks change on lands
 * right). The times of day are the seed's own, so the quarter hour a message falls in does not depend on when the run is.
 */
function atLocal(day, clock, zone = TIMEZONE) {
  const [hour, minute] = clock.split(":").map(Number);
  const wall = Date.parse(`${day}T00:00:00Z`) + hour * HOUR_MS + minute * MIN_MS;
  const clockOf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const offsetAt = (at) => {
    const p = Object.fromEntries(clockOf.formatToParts(new Date(at)).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
  };
  return wall - offsetAt(wall - offsetAt(wall));
}

/**
 * The Receptionist lens's rows (Reports, receptionist_series): Sam Example's own conversation, a call nobody took, a send
 * the door held back and two handovers, deleted and written again every run and dated from it. The workspace keeps no
 * opening hours (its config has no profile, which other nightly specs and the local harness's record rely on), so the
 * lens's closed figure says it needs them. Sam's conversation is his, not Robin's, whose two messages the Inbox, thread and exports specs read: every
 * message in it is two or more calendar days old, so Robin's, two hours old, is the newest conversation (verify says so
 * of its first). What the lens draws of them is in SAM_ASKS: topics, languages, the hold and its outcomes, the handovers.
 *
 * All of it terminal, so that nothing production runs in the background finds it:
 *   - no message is queued and no job exists, so no send sweep or send job has a row;
 *   - nothing is less than a day old, so the unfinished-message sweep (a text with no reply or stamp, within a day) cannot
 *     reach a message, and each ask is stamped handled and processed besides; the bell keeps a missed call a day
 *     (missedCallIsNews), and this one is older;
 *   - the conversation and the call are stamped as read by the note sweep (note_checked_at, 00159: it reads a thread
 *     again only for a customer message newer than the stamp, and a call that has none), so no model is asked about them;
 *   - the two handovers are inserted resolved, with both times set (the stamp trigger acts on UPDATE only), and none is
 *     open: the deadman pages the platform for one left open two hours;
 *   - the held replies went out (`delivered`) and the others were cancelled, so the booking-link note (a trigger on a
 *     `sent` row) does not run and no hold is waiting; the call is a dial that never connected, with no recording, no
 *     thread and its post-call mail already sent, which the calls sweep and the note sweep both leave alone;
 *   - the blocked send is an event on the ledger, of the kind and the data packages/core/src/deliver.ts files
 *     (message.send_blocked, through emitEvent), about Sam's thread since the message it would be about is not one of the
 *     seed's; nothing reads it but the lens. A run deletes the workspace's blocked sends before it files its own: the
 *     messages they were about are the ones the specs and this seed clear.
 *
 * The automated email is in Sam's conversation as a customer message by its row and nobody's words by its claim, so the
 * lens counts it nowhere (public.message_is_a_persons_words).
 */
export async function convergeReceptionist(db, T, ownerId, now) {
  const stamp = new Date(now).toISOString();
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  const dayOf = (daysAgo) => new Date(Date.parse(`${today}T00:00:00Z`) - daysAgo * DAY_MS).toISOString().slice(0, 10);
  const at = (daysAgo, clock, afterMs = 0) => new Date(atLocal(dayOf(daysAgo), clock) + afterMs).toISOString();

  const people = must("reading the people", await db.from("contacts").select("id, phone_e164").eq("tenant_id", T));
  const casey = people.find((p) => p.phone_e164 === PEOPLE[1].phone);
  const sam = people.find((p) => p.phone_e164 === PEOPLE[2].phone);
  if (!casey || !sam)
    throw new Error("the Receptionist lens's rows are Casey Example's and Sam Example's: one is missing");

  // Last night's, whatever the specs did to them, gone first: Sam's conversation with everything in it (the handovers
  // first, for they name it), the call by its id, and the workspace's blocked sends, which are about messages that are gone.
  const mine = must(
    "reading Sam's conversation",
    await db.from("conversations").select("id").eq("tenant_id", T).eq("contact_id", sam.id),
  );
  const mineIds = mine.map((c) => c.id);
  await deleteWhere(db, "escalations", "conversation_id", mineIds, "clearing Sam's handovers");
  const strays = must("reading the messages", await db.from("messages").select("id, external_id").eq("tenant_id", T));
  await deleteWhere(
    db,
    "messages",
    "id",
    strays.filter((m) => String(m.external_id ?? "").startsWith(RECEPTIONIST_PREFIX)).map((m) => m.id),
    "clearing the Receptionist messages",
  );
  await deleteWhere(db, "messages", "conversation_id", mineIds, "clearing what else is in Sam's conversation");
  await deleteWhere(db, "conversations", "id", mineIds, "clearing Sam's conversation");
  const missedBefore = must(
    "reading the missed call",
    await db.from("calls").select("id").eq("tenant_id", T).eq("retell_call_id", MISSED_CALL_ID),
  );
  await deleteWhere(
    db,
    "calls",
    "id",
    missedBefore.map((c) => c.id),
    "clearing the missed call",
  );
  must(
    "clearing the blocked sends",
    await db.from("events").delete().eq("tenant_id", T).eq("kind", "message.send_blocked"),
  );

  // Sam's messages, in the order they happened. Every row carries the same keys and its own id: a bulk insert sends a key
  // some rows lack as NULL, and an id of NULL is no id.
  const rows = [];
  const add = (row) =>
    rows.push({ id: randomUUID(), type: "text", channel: "whatsapp", channel_ts: row.created_at, ...row });
  for (const [i, ask] of SAM_ASKS.entries()) {
    const n = i + 1;
    const asked = at(ask.daysAgo, ask.at);
    const after = (ms) => new Date(Date.parse(asked) + ms).toISOString();
    const held = { source: "veto_window", delay_ms: HOLD_MS, language: ask.answer.language };
    const replacementId = randomUUID();
    add({
      direction: "inbound",
      sender: "customer",
      body: ask.body,
      external_id: `${RECEPTIONIST_PREFIX}in-${n}`,
      created_at: asked,
      status: "received",
      meta: { intent: ask.intent, handled: "ai", processed_at: after(3 * SECOND_MS) },
    });
    if (ask.cancelled)
      add({
        direction: "outbound",
        sender: "ai",
        body: ask.cancelled,
        external_id: `${RECEPTIONIST_PREFIX}draft-cancelled`,
        created_at: after(5 * SECOND_MS),
        status: "canceled",
        status_updated_at: after(15 * SECOND_MS),
        error: null,
        meta: held,
      });
    if (ask.steered)
      add({
        direction: "outbound",
        sender: "ai",
        body: ask.steered,
        external_id: `${RECEPTIONIST_PREFIX}draft-steered`,
        created_at: after(5 * SECOND_MS),
        status: "canceled",
        status_updated_at: after(40 * SECOND_MS),
        error: { reason: "steered", replaced_by: replacementId },
        meta: held,
      });
    const wentAt = after(ask.answer.held ? HOLD_MS + 2 * SECOND_MS : ask.steered ? 45 * SECOND_MS : 20 * SECOND_MS);
    add({
      ...(ask.steered ? { id: replacementId } : {}),
      direction: "outbound",
      sender: "ai",
      body: ask.answer.body,
      external_id: `${RECEPTIONIST_PREFIX}out-${n}`,
      created_at: wentAt,
      status: "delivered",
      status_updated_at: wentAt,
      meta: ask.answer.held ? held : { ...(ask.steered ? { source: "steered" } : {}), language: ask.answer.language },
    });
  }
  add({
    channel: "email",
    direction: "inbound",
    sender: "customer",
    body: SAM_AUTOMATED_MAIL.body,
    external_id: `${RECEPTIONIST_PREFIX}mail`,
    created_at: at(SAM_AUTOMATED_MAIL.daysAgo, SAM_AUTOMATED_MAIL.at),
    status: "received",
    meta: { email: { claim: "automated" } },
  });
  for (const [i, h] of SAM_HANDOVERS.entries()) {
    const repliedAt = at(h.daysAgo, h.at, 10 * MIN_MS);
    add({
      direction: "outbound",
      sender: "human",
      sent_by: ownerId,
      body: h.reply,
      external_id: `${RECEPTIONIST_PREFIX}human-${i + 1}`,
      created_at: repliedAt,
      status: "delivered",
      status_updated_at: repliedAt,
      meta: {},
    });
  }

  const latest = (keep) => new Date(Math.max(...rows.filter(keep).map((r) => Date.parse(r.created_at)))).toISOString();
  const cv = must(
    "starting Sam's conversation",
    await db
      .from("conversations")
      .insert({
        tenant_id: T,
        contact_id: sam.id,
        state: "open",
        paused_until: null,
        snooze_until: null,
        assignee_user_id: null,
        created_at: new Date(Math.min(...rows.map((r) => Date.parse(r.created_at)))).toISOString(),
        last_message_at: latest(() => true),
        last_inbound_at: latest((r) => r.direction === "inbound"),
        last_wa_inbound_at: latest((r) => r.direction === "inbound" && r.channel === "whatsapp"),
        // Read by the note sweep as of this run, which is later than anything the customer wrote.
        note_checked_at: stamp,
      })
      .select("id")
      .single(),
  );
  must(
    "Sam's messages",
    await db
      .from("messages")
      .insert(rows.map((r) => ({ tenant_id: T, conversation_id: cv.id, contact_id: sam.id, ...r }))),
  );

  // Two handovers, inserted resolved with both times set.
  must(
    "the handovers",
    await db.from("escalations").insert(
      SAM_HANDOVERS.map((h) => ({
        tenant_id: T,
        conversation_id: cv.id,
        reason: "human_token",
        details: "Asked to speak to a person.",
        state: "resolved",
        resolved_by_user_id: ownerId,
        created_at: at(h.daysAgo, h.at),
        updated_at: at(h.daysAgo, h.at, h.settledAfter),
        resolved_at: at(h.daysAgo, h.at, h.settledAfter),
      })),
    ),
  );

  // A call that never connected: no note, no recording, no thread, already notified, and read by the note sweep.
  const rang = at(MISSED_CALL.daysAgo, MISSED_CALL.at);
  must(
    "the call nobody took",
    await db.from("calls").insert({
      tenant_id: T,
      retell_call_id: MISSED_CALL_ID,
      agent_id: null,
      channel_id: null,
      contact_id: casey.id,
      conversation_id: null,
      message_id: null,
      direction: "inbound",
      call_type: "phone_call",
      from_e164: casey.phone_e164,
      to_e164: BUSINESS_PHONE,
      status: "not_connected",
      started_at: rang,
      ended_at: rang,
      duration_ms: 0,
      disconnection_reason: null,
      in_voicemail: false,
      recording: null,
      raw: {},
      created_at: rang,
      notified_at: rang,
      note_checked_at: stamp,
    }),
  );

  await emitEvent(db, T, "message.send_blocked", "conversation", cv.id, {
    reason: "human_has_it",
    purpose: "conversational",
  });
}

/** The workspace's calendar day `daysAgo` days before the run, "2026-09-07": the day the lens judges a step by. */
function dayBefore(now, daysAgo) {
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  return new Date(Date.parse(`${today}T00:00:00Z`) - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The People lens's rows (Reports, people_series): the yes each seeded person gave, on the ledger, and three steps the
 * owner finished, deleted and written again every run and dated from it. What they give the lens: three yeses won in the
 * month, to messages, in their own message on WhatsApp (the date of their columns' own yes, a week before the run, so the
 * events and the people agree), no stop since their columns say yes; and three steps done, two on their day or before and one
 * a day late. The book's own figures (steps overdue, steps due today) read open steps, so a done step is on no list.
 *
 * All of it terminal, so that nothing production runs in the background finds it:
 *   - the steps are done, so none is open: an open step is a row in Today and a person on the Steps due list, which other
 *     specs count. Nothing reads a done step, nor a yes event, to act: no sweep or job selects either, and no event
 *     subscription (decision 0032) names the yes's kind, so it reaches no reaction;
 *   - the yeses are events only: the people's own columns already say yes (converge sets them), and the trigger that
 *     keeps a person's channels by each yes event adds WhatsApp to the person it names, the only channel the workspace has;
 *   - no suppressed address, no queued message and no job is written, and the notes are team-only, so the receptionist
 *     never reads one.
 *
 * Last night's are found by what marks them and nothing else: the yeses by their kind and `note`, the steps by the
 * prefix of their words. A real yes, an event of another kind and a step a person wrote are not the seed's to delete.
 */
export async function convergePeople(db, T, ownerId, now) {
  const found = must("reading the people", await db.from("contacts").select("id, phone_e164").eq("tenant_id", T));
  const idOf = (phone) => {
    const person = found.find((p) => p.phone_e164 === phone);
    if (!person) throw new Error("the People lens's rows are about the three seeded people: one is missing");
    return person.id;
  };
  const people = PEOPLE.map((p) => idOf(p.phone));

  // Last night's, whatever the specs did to them, gone first.
  must(
    "clearing the yeses",
    await db
      .from("events")
      .delete()
      .eq("tenant_id", T)
      .eq("kind", "contact.consent_changed")
      .eq("data->>note", PEOPLE_NOTE),
  );
  const notes = must("reading the notes", await db.from("person_notes").select("id, body").eq("tenant_id", T));
  await deleteWhere(
    db,
    "person_notes",
    "id",
    notes.filter((n) => n.body.startsWith(PEOPLE_PREFIX)).map((n) => n.id),
    "clearing the steps",
  );

  // The date converge gives each person's own yes (consent_updated_at), so the events and the columns agree.
  const yesAt = new Date(now - WEEK_MS).toISOString();
  must(
    "the yeses",
    await db.from("events").insert(
      people.map((id) => ({
        tenant_id: T,
        kind: "contact.consent_changed",
        category: "contact",
        version: SHARED_EVENT_VERSIONS["contact.consent_changed"],
        subject_type: "contact",
        subject_id: id,
        data: { consent: SAID_YES_TO_MESSAGES, source: "customer_message", channel: "whatsapp", note: PEOPLE_NOTE },
        created_at: yesAt,
      })),
    ),
  );

  // Written the day before they were done, and done in the middle of the day, by the workspace's own clock.
  must(
    "the steps",
    await db.from("person_notes").insert(
      PEOPLE_STEPS.map((s) => {
        const done = atLocal(dayBefore(now, s.doneDaysAgo), STEP_DONE_AT);
        return {
          tenant_id: T,
          contact_id: idOf(s.person),
          body: `${PEOPLE_PREFIX}${s.words}`,
          author_kind: "member",
          // A member's note is kept (person_notes_author_check); a step is the team's (person_notes_step_is_the_teams).
          state: "kept",
          author_user_id: ownerId,
          team_only: true,
          due_on: dayBefore(now, s.dueDaysAgo),
          done_at: new Date(done).toISOString(),
          done_by: ownerId,
          created_at: new Date(done - DAY_MS).toISOString(),
          updated_at: new Date(done).toISOString(),
        };
      }),
    ),
  );
}

/**
 * What Reports' Campaigns lens reads (convergeCampaigns), found by a run to be deleted and written again: every message the run
 * wrote has an `external_id` that starts with CAMPAIGNS_PREFIX, its approval carries CAMPAIGNS_NOTE as `payload.seed` (the run it
 * names is gone by the next night), and the run is found by its name. A run, a decision or a message a person made carries
 * none of them, so a run never touches it.
 */
export const CAMPAIGNS_PREFIX = "e2e-seed-c-";
export const CAMPAIGNS_NOTE = "e2e-seed-c";
export const CAMPAIGN_RUN = "e2e seed: hello";
/**
 * The message the run sent: WhatsApp, in English, approved, made-up words that ask for nothing. It never says "yes offers": a
 * message that does stamps its person as asked (messages_stamp_offers_asked, 00297), which is not for a seed to do.
 */
export const CAMPAIGN_MESSAGE = {
  name: "e2e_seed_hello",
  language: "en_US",
  body: "Hello from the studio. This is a made-up note for the nightly's checks, and nobody is asked to answer it.",
};
/**
 * When the run's steps happened, from the moment it was made, and that moment from the run of the seed: more than three days
 * before, so that every send is past the 72 hours a reply is counted over (public.campaign_reply_window) by the time the specs
 * read and the by-message rate counts it. Approved 40 minutes after it was made and begun at 45; Casey Example's message went at 46
 * minutes and Sam Example's at 47; finished at 48. Casey wrote back two hours after hers. All of it is past the day the
 * unfinished-message sweep looks back over, inside the shortest period the lens reads (7 days), and older than Robin Example's
 * reply, so that conversation stays the newest.
 */
const RUN_MADE_AGO_MS = 3 * DAY_MS + 3 * HOUR_MS;
const RUN_APPROVED_AFTER_MS = 40 * MIN_MS;
const RUN_BEGUN_AFTER_MS = 45 * MIN_MS;
const RUN_FINISHED_AFTER_MS = 48 * MIN_MS;
const CASEY_WROTE_BACK_AFTER_MS = 2 * HOUR_MS;
/** The reply Casey Example wrote: her own words, with no topic, no stop and nothing a sweep would read. */
const CASEY_REPLY = "Thank you, see you soon.";
/** The two messages the run sent, in the order they went: whose, the id that marks it, when it went (after the run was made), and how it stood last. */
const RUN_SENDS = [
  { person: CASEY.phone, id: "out-casey", afterMs: 46 * MIN_MS, status: "delivered", receiptAfterMs: 20 * SECOND_MS },
  { person: SAM.phone, id: "out-sam", afterMs: 47 * MIN_MS, status: "read", receiptAfterMs: 25 * MIN_MS },
];
/** Why Robin Example was left out of the run: the reason the sheet and the lens have words for ("a person had the thread"). */
const RUN_HELD_REASON = "human_has_it";

/**
 * The Campaigns lens's rows (Reports, campaign_ledger): one run that went out, three days ago, to the three seeded people, and
 * what came of it. Deleted and written again every run and dated from it. What they give the lens: two people sent to, both of
 * whom wrote back (Casey Example within two hours; Sam Example by the next ask he wrote in his own thread, which is the
 * Receptionist lens's and which the lens cannot tell from an answer: the run plants no reply of his, and no send three days old
 * could be clear of his asks, which run to two days ago); Robin Example held back for "a person had the thread"; a run of a
 * broadcast, made by the owner and approved 40 minutes after; the message in the library, and no message failed.
 *
 * All of it terminal, so that nothing production runs in the background finds it:
 *   - the run is `sent`, with its time of finishing: no run is waiting for a person (a row in Today) or for a send job, and no
 *     sweep resumes a run that is not scheduled or sending. It is a broadcast, not a playbook's run, so no moment's clock or
 *     allowance reads it;
 *   - Casey Example's message is delivered and Sam Example's read, and nothing is queued, failed or `sent`: the booking-link
 *     note is a trigger on a `sent` row, and a failed outbound message is one Today counts as "a reply failed to deliver";
 *   - Casey's reply is a customer message three days old and stamped as finished with (`processed_at`), in a conversation
 *     stamped as read by the note sweep (`note_checked_at`, as Sam's is), so neither the unfinished-message sweep (a day back)
 *     nor the note sweep (a thread whose newest message is newer than its last look) has a row, and no model is asked about
 *     them. Her conversation is open, with nothing timed and nobody's to answer, and older than Robin Example's;
 *   - no job is written, and no bell row: a run that went out rings nothing when it is written this way;
 *   - the approval is a decision, which nothing reads to act; the message is approved, written here and not synced from
 *     Meta, with no WhatsApp business account to sync it against.
 *
 * Sam's message is written into Sam Example's conversation, which convergeReceptionist wrote before this runs: the Receptionist
 * lens's thread holds one message of this run, three days back and earlier than the last thing that thread says, and no lens
 * reads it as a person's own. Written as a broadcast writes a message (core broadcast-channels.ts `metaOf`): the human's by
 * its row and automated by its source, so no count of what the team wrote (`public.automated_send`) takes it. (A run of
 * convergeReceptionist alone deletes that thread with it, and this puts the message back.)
 *
 * Last night's are found by what marks them and nothing else: the run by its name, its messages by the prefix of their ids,
 * its approval by its mark, Casey's conversation by her. A run, a decision or a message a person made is not the seed's to delete.
 */
export async function convergeCampaigns(db, T, ownerId, now) {
  const stamp = new Date(now).toISOString();
  const iso = (ms) => new Date(ms).toISOString();
  const found = must("reading the people", await db.from("contacts").select("id, phone_e164").eq("tenant_id", T));
  const idOf = (phone) => {
    const person = found.find((p) => p.phone_e164 === phone);
    if (!person) throw new Error("the Campaigns lens's rows are about the three seeded people: one is missing");
    return person.id;
  };
  const [robin, casey, sam] = PEOPLE.map((p) => idOf(p.phone));
  const [samsThread] = must(
    "reading Sam's conversation",
    await db.from("conversations").select("id").eq("tenant_id", T).eq("contact_id", sam),
  );
  if (!samsThread)
    throw new Error(
      "the Campaigns run sent Sam Example a message in his conversation, and he has none: convergeReceptionist writes it first",
    );

  // Last night's, whatever the specs did to them, gone first: the approval by its mark, the run by its name with its people, the
  // messages by their prefix wherever they were left, and Casey's conversation with everything in it.
  must(
    "clearing the approval",
    await db.from("decisions").delete().eq("tenant_id", T).eq("payload->>seed", CAMPAIGNS_NOTE),
  );
  const earlier = must(
    "reading the run",
    await db.from("sequence_batches").select("id").eq("tenant_id", T).eq("name", CAMPAIGN_RUN),
  );
  await deleteWhere(
    db,
    "sequence_sends",
    "batch_id",
    earlier.map((b) => b.id),
    "clearing the run's people",
  );
  await deleteWhere(
    db,
    "sequence_batches",
    "id",
    earlier.map((b) => b.id),
    "clearing the run",
  );
  const strays = must("reading the messages", await db.from("messages").select("id, external_id").eq("tenant_id", T));
  await deleteWhere(
    db,
    "messages",
    "id",
    strays.filter((m) => String(m.external_id ?? "").startsWith(CAMPAIGNS_PREFIX)).map((m) => m.id),
    "clearing the Campaigns messages",
  );
  const caseys = must(
    "reading Casey's conversation",
    await db.from("conversations").select("id").eq("tenant_id", T).eq("contact_id", casey),
  ).map((c) => c.id);
  await deleteWhere(db, "messages", "conversation_id", caseys, "clearing what else is in Casey's conversation");
  await deleteWhere(db, "conversations", "id", caseys, "clearing Casey's conversation");

  // The message: found, and put back as it is seeded, or written. Never deleted: a run that went out names it.
  const words = {
    category: "utility",
    meta_status: "approved",
    body_preview: CAMPAIGN_MESSAGE.body,
    variables: [],
    // templates_source_check takes 'meta' or 'chanlytics': a row written here, not synced from Meta.
    source: "chanlytics",
    hidden_at: null,
  };
  const known = must(
    "reading the run's message",
    await db
      .from("templates")
      .select("id")
      .eq("tenant_id", T)
      .eq("channel", "whatsapp")
      .eq("name", CAMPAIGN_MESSAGE.name)
      .eq("language", CAMPAIGN_MESSAGE.language)
      .maybeSingle(),
  );
  if (known) must("putting the run's message back", await db.from("templates").update(words).eq("id", known.id));
  const template =
    known ??
    must(
      "adding the run's message",
      await db
        .from("templates")
        .insert({
          tenant_id: T,
          channel: "whatsapp",
          name: CAMPAIGN_MESSAGE.name,
          language: CAMPAIGN_MESSAGE.language,
          ...words,
        })
        .select("id")
        .single(),
    );

  // The run, made by the owner, begun and finished a few minutes after it was approved.
  const made = now - RUN_MADE_AGO_MS;
  const begun = made + RUN_BEGUN_AFTER_MS;
  const finished = made + RUN_FINISHED_AFTER_MS;
  const run = must(
    "the run",
    await db
      .from("sequence_batches")
      .insert({
        tenant_id: T,
        name: CAMPAIGN_RUN,
        template_id: template.id,
        template_name: CAMPAIGN_MESSAGE.name,
        template_language: CAMPAIGN_MESSAGE.language,
        params: [],
        audience: { kind: "everyone", id: null, label: EVERYONE_LABEL },
        state: "sent",
        scheduled_for: iso(begun),
        started_at: iso(begun),
        finished_at: iso(finished),
        recipient_count: PEOPLE.length,
        failure: null,
        created_by: ownerId,
        created_at: iso(made),
        updated_at: iso(finished),
        step_id: null,
        run_for: null,
        channels: ["whatsapp"],
      })
      .select("id")
      .single(),
  );

  // Casey's conversation: her message, and her reply two hours after it. Open, with nothing timed, stamped as read.
  const caseySentAt = made + (RUN_SENDS.find((s) => s.person === CASEY.phone)?.afterMs ?? 0);
  const repliedAt = caseySentAt + CASEY_WROTE_BACK_AFTER_MS;
  const caseysThread = must(
    "starting Casey's conversation",
    await db
      .from("conversations")
      .insert({
        tenant_id: T,
        contact_id: casey,
        state: "open",
        paused_until: null,
        snooze_until: null,
        assignee_user_id: null,
        created_at: iso(caseySentAt),
        last_message_at: iso(repliedAt),
        last_inbound_at: iso(repliedAt),
        last_wa_inbound_at: iso(repliedAt),
        // Read by the note sweep as of this run, which is later than anything she wrote.
        note_checked_at: stamp,
      })
      .select("id")
      .single(),
  );

  // The messages, every row with the same keys and its own id: a bulk insert sends a key some rows lack as NULL.
  const threadOf = { [CASEY.phone]: caseysThread.id, [SAM.phone]: samsThread.id };
  const message = (over) => ({
    id: randomUUID(),
    tenant_id: T,
    conversation_id: null,
    contact_id: null,
    channel: "whatsapp",
    direction: null,
    sender: null,
    type: "text",
    body: null,
    template_name: null,
    template_vars: null,
    external_id: null,
    channel_ts: null,
    status: null,
    status_updated_at: null,
    meta: {},
    created_at: null,
    ...over,
  });
  const sends = RUN_SENDS.map((s) => {
    const sentAt = iso(made + s.afterMs);
    return message({
      conversation_id: threadOf[s.person],
      contact_id: idOf(s.person),
      direction: "outbound",
      sender: "human",
      type: "template",
      body: CAMPAIGN_MESSAGE.body,
      template_name: CAMPAIGN_MESSAGE.name,
      template_vars: [],
      external_id: `${CAMPAIGNS_PREFIX}${s.id}`,
      channel_ts: sentAt,
      status: s.status,
      status_updated_at: iso(made + s.afterMs + s.receiptAfterMs),
      meta: { source: "broadcast", broadcast_id: run.id, broadcast_name: CAMPAIGN_RUN },
      created_at: sentAt,
    });
  });
  const reply = message({
    conversation_id: caseysThread.id,
    contact_id: casey,
    direction: "inbound",
    sender: "customer",
    body: CASEY_REPLY,
    external_id: `${CAMPAIGNS_PREFIX}in-casey`,
    channel_ts: iso(repliedAt),
    status: "received",
    meta: { processed_at: iso(repliedAt + 3 * SECOND_MS) },
    created_at: iso(repliedAt),
  });
  must("the run's messages", await db.from("messages").insert([...sends, reply]));

  // The run's people: Casey and Sam sent to, each with the message and the time it went; Robin held back.
  const sentTo = (phone) => sends.find((m) => m.contact_id === idOf(phone));
  const recipient = (over) => ({
    batch_id: run.id,
    tenant_id: T,
    state: "queued",
    reason: null,
    message_id: null,
    sent_at: null,
    facts: null,
    channel: "whatsapp",
    attempts: 0,
    ...over,
  });
  must(
    "the run's people",
    await db.from("sequence_sends").insert([
      ...RUN_SENDS.map((s) =>
        recipient({
          contact_id: idOf(s.person),
          state: "sent",
          message_id: sentTo(s.person).id,
          sent_at: sentTo(s.person).created_at,
        }),
      ),
      recipient({ contact_id: robin, state: "skipped", reason: RUN_HELD_REASON }),
    ]),
  );

  // The owner's approval, 40 minutes after the run was made, as approve.ts records it (name, recipients, approved, the day it was to go).
  must(
    "the approval",
    await db.from("decisions").insert({
      tenant_id: T,
      subject_type: "broadcast",
      subject_id: run.id,
      verb: "send_broadcast",
      actor_type: "user",
      actor_user_id: ownerId,
      payload: {
        name: CAMPAIGN_RUN,
        playbook_id: null,
        recipients: PEOPLE.length,
        approved: true,
        scheduled_for: iso(begun),
        seed: CAMPAIGNS_NOTE,
      },
      created_at: iso(made + RUN_APPROVED_AFTER_MS),
    }),
  );
}

/**
 * The eval's Win-back (the moment spec, A8; decision D3): one playbook on silence, PAUSED, so the hourly sweep never runs
 * it (playbooks_due takes only a running one), on a made-up message of its own: approved, no slot, a WhatsApp row the
 * channel above cannot send from, synced from nowhere and named for no starter. What Ask's change cases resume, rename
 * and retime, and what a "pause" case finds already paused. Added only under --seed-win-back (`seed`), Ruben's run by
 * hand: the nightly's converge never passes it, so merging seeds nothing. Without it, an existing Win-back is put back
 * as it was seeded (a spec that resumed it never leaves it running), and nothing is added. Another playbook a spec made
 * is that spec's to remove. Says what it did, or null where it did nothing.
 */
async function convergeWinBack(db, T, ownerId, seed) {
  const found = must(
    "reading the win-back's message",
    await db
      .from("templates")
      .select("id")
      .eq("tenant_id", T)
      .eq("channel", "whatsapp")
      .eq("name", WIN_BACK.template)
      .eq("language", "en_US")
      .maybeSingle(),
  );
  // The nightly's converge (no --seed-win-back) adds nothing: with no message on file there is no Win-back to put back.
  if (!found && !seed) return null;
  const message =
    found ??
    must(
      "adding the win-back's message",
      await db
        .from("templates")
        .insert({
          tenant_id: T,
          channel: "whatsapp",
          name: WIN_BACK.template,
          language: "en_US",
          category: "marketing",
          meta_status: "approved",
          body_preview: "It has been a while. We would love to see you again: reply to book.",
          variables: [],
          // templates_source_check takes 'meta' or 'chanlytics': a row written here, not synced from Meta.
          source: "chanlytics",
        })
        .select("id")
        .single(),
    );
  const row = {
    tenant_id: T,
    kind: "moment",
    name: WIN_BACK.name,
    trigger: WIN_BACK.trigger,
    template_id: message.id,
    template_name: WIN_BACK.template,
    template_language: "en_US",
    params: [],
    policy_class: "reengage",
    state: "paused",
    run_hour: 10,
    cap_per_run: 25,
    gap_days: 90,
    cadence_days: 30,
    channels: ["whatsapp"],
    created_by: ownerId,
  };
  // The first one made, should someone have made a second on its message: that one is theirs, and stops nothing here.
  const [kept] = must(
    "reading the win-back",
    await db
      .from("sequence_steps")
      .select("id")
      .eq("tenant_id", T)
      .eq("trigger", WIN_BACK.trigger)
      .eq("template_id", message.id)
      .order("created_at", { ascending: true })
      .limit(1),
  );
  if (kept) {
    must("putting the win-back back", await db.from("sequence_steps").update(row).eq("id", kept.id));
    return "put the eval's Win-back back, paused";
  }
  if (!seed) return null;
  must("adding the win-back", await db.from("sequence_steps").insert(row));
  return "added the eval's Win-back, paused";
}

/** Reads the workspace back and names anything that is not as it should be. */
export async function verify(db, T, ownerId) {
  const problems = [];
  const read = async (what, q) => must(what, await q);
  const mine = await read(
    "the owner's memberships",
    db.from("memberships").select("tenant_id, role").eq("user_id", ownerId),
  );
  if (mine.length !== 1 || mine[0].tenant_id !== T || mine[0].role !== "owner")
    problems.push(`the owner has ${mine.length} membership(s), not one owner membership here`);
  const [newest] = await read(
    "the newest conversation",
    db.from("conversations").select("id").eq("tenant_id", T).order("last_message_at", { ascending: false }).limit(1),
  );
  const messages = newest
    ? await read("its messages", db.from("messages").select("sender, status").eq("conversation_id", newest.id))
    : [];
  if (
    !messages.some((m) => m.sender === "customer") ||
    !messages.some((m) => m.sender === "ai" && m.status !== "queued")
  )
    problems.push("the first conversation lacks a customer message and a sent AI reply");
  const billing = await read(
    "billing",
    db.from("billing_accounts").select("mode, status").eq("tenant_id", T).maybeSingle(),
  );
  if (billing?.mode !== "direct" || billing?.status !== "active") problems.push("billing is not direct and active");
  const channels = await read(
    "channels",
    db.from("tenant_channels").select("external_id, status, credentials_ref, waba_id").eq("tenant_id", T),
  );
  if (
    channels.length !== 1 ||
    channels[0].status !== "active" ||
    channels[0].credentials_ref !== null ||
    channels[0].waba_id !== null ||
    /^\+?\d+$/.test(channels[0].external_id)
  ) {
    problems.push("the workspace should hold exactly one active WhatsApp channel with no credentials and no real id");
  }
  const call = await read(
    "the call",
    db
      .from("calls")
      .select("status, conversation_id, recording, transcript_object")
      .eq("tenant_id", T)
      .eq("retell_call_id", CALL_ID)
      .maybeSingle(),
  );
  if (
    call?.status !== "ended" ||
    call?.conversation_id !== null ||
    call?.recording !== null ||
    !(call?.transcript_object?.length > 0)
  )
    problems.push("the call is not an ended call with a transcript and no thread");
  const cfg = await read("the config", db.from("tenant_config").select("config").eq("tenant_id", T).maybeSingle());
  if (!TenantConfigWriteSchema.safeParse(cfg?.config ?? null).success) problems.push("the config would not save");
  if (cfg?.config?.calendar) problems.push("the config has a calendar");
  // The state the owner-signals specs read. A person who said yes to offers here
  // would give a promotional send an audience; fewer than three who said yes to
  // messages would take the list under the product's own floor, and Today's
  // "Worth a look" would have nothing to say -- the specs would then fail on a
  // missing band, which reads nothing like "the seed drifted".
  const people = (
    await read("the people", db.from("contacts").select("consent, marketing_consent, erased_at").eq("tenant_id", T))
  ).filter((p) => !p.erased_at);
  if (people.some((p) => p.marketing_consent === "opted_in"))
    problems.push("someone in the workspace has said yes to offers");
  if (people.filter((p) => p.consent === SAID_YES_TO_MESSAGES).length < 3)
    problems.push("fewer than three people have said yes to messages");
  // The state e2e/leads.spec.ts reads. Not a stage or a class: the specs change
  // those and undo them, and a spec that failed halfway leaves one moved. What
  // must hold is that this workspace's leads ARE the nine fixtures (the six and
  // the three the waiting search asks about), that none of them is a real
  // business, that one search waits on its owner, and that the workspace may search.
  const leads = await read(
    "the leads",
    db.from("leads").select("place_id, business_name, email, phone_e164, website_host").eq("tenant_id", T),
  );
  const wanted = [...ALL_LEAD_PLACES].sort();
  if (JSON.stringify(leads.map((l) => l.place_id).sort()) !== JSON.stringify(wanted))
    problems.push(`the workspace's leads are not the ${ALL_LEAD_PLACES.length} fixtures`);
  for (const l of leads) {
    if (l.email && !/@[\w.-]+\.example$/.test(l.email)) problems.push(`a lead's address is not fictional: ${l.email}`);
    if (l.website_host && !/\.example$/.test(l.website_host))
      problems.push(`a lead's site is not fictional: ${l.website_host}`);
    if (l.phone_e164 && !/^\+1\d{3}55501\d{2}$/.test(l.phone_e164))
      problems.push(`a lead's number is outside the fiction range: ${l.phone_e164}`);
  }
  const searches = await read(
    "the searches",
    db.from("lead_searches").select("id, name, removed_at").eq("tenant_id", T),
  );
  const named = searches
    .filter((x) => !x.removed_at)
    .map((x) => x.name)
    .sort();
  if (searches.length !== 2 || JSON.stringify(named) !== JSON.stringify([LEAD_SEARCH.name, WAITING_SEARCH.name].sort()))
    problems.push("the workspace should hold exactly two kept searches, the seeded ones");
  const waitingId = searches.find((x) => x.name === WAITING_SEARCH.name)?.id;
  const rounds = waitingId
    ? await read(
        "the waiting search's rounds",
        db.from("lead_rounds").select("state, question, waiting_since").eq("search_id", waitingId),
      )
    : [];
  if (
    rounds.length !== 1 ||
    rounds[0].state !== "waiting_on_owner" ||
    rounds[0].question?.sentence !== WAITING_ROUND.question.sentence ||
    !rounds[0].waiting_since
  )
    problems.push("the waiting search's one round is not waiting on the owner with its question");
  const pushes = await read("the push jobs", db.from("jobs").select("id").eq("tenant_id", T).eq("kind", "push_send"));
  if (pushes.length) problems.push(`${pushes.length} push job(s) queued in the workspace, for a phone to hear`);
  const platform = await read(
    "the platform switch",
    db.from("lead_platform").select("tenants_on").eq("id", true).maybeSingle(),
  );
  if (!(platform?.tenants_on ?? []).includes(T))
    problems.push("the workspace is not listed in lead_platform.tenants_on, so a paid lead run could not start");
  const alerts = cfg?.config?.notifications;
  if (
    !alerts ||
    Object.keys(alerts).length !== 1 ||
    alerts.escalation_emails?.length !== 1 ||
    alerts.escalation_emails[0] !== ALERT_INBOX
  ) {
    problems.push(`the config's alerts go somewhere other than the test inbox, ${ALERT_INBOX}`);
  }
  // The state e2e/google.spec.ts reads: the fixture listing, one Business Profile synced and holding no credentials, the four
  // reviews, and the two events the ledger reads who wrote a reply and why one was held from.
  const listings = await read("the Google listings", db.from("google_listings").select("place_id").eq("tenant_id", T));
  if (listings.length !== 1 || listings[0].place_id !== GOOGLE_LISTING.place_id)
    problems.push("the workspace should hold exactly one Google listing, the fixture");
  const profiles = await read(
    "the Google connections",
    db.from("google_connections").select("credentials_ref, last_synced_at, reviews_complete").eq("tenant_id", T),
  );
  if (
    profiles.length !== 1 ||
    profiles[0].credentials_ref !== null ||
    !profiles[0].last_synced_at ||
    profiles[0].reviews_complete !== true
  )
    problems.push("the workspace should hold exactly one Business Profile, synced, with no credentials");
  const reviews = await read(
    "the Google reviews",
    db.from("google_reviews").select("id, review_id, origin").eq("tenant_id", T),
  );
  if (
    JSON.stringify(reviews.map((r) => r.review_id).sort()) !==
      JSON.stringify(GOOGLE_REVIEWS.map((r) => r.review_id).sort()) ||
    reviews.some((r) => r.origin !== "profile")
  )
    problems.push(`the workspace's Google reviews are not the ${GOOGLE_REVIEWS.length} fixtures`);
  const filed = await read(
    "the replies' events",
    db
      .from("events")
      .select("kind, subject_id, data")
      .eq("tenant_id", T)
      .in("kind", ["google.replied", "google.reply_held"]),
  );
  const repliesFiled = filed
    .map((e) => `${e.kind} ${reviews.find((r) => r.id === e.subject_id)?.review_id} ${e.data?.by ?? e.data?.why}`)
    .sort();
  const repliesWanted = GOOGLE_REVIEWS.flatMap((r) => [
    ...(r.reply?.by ? [`google.replied ${r.review_id} ${r.reply.by}`] : []),
    ...(r.held ? [`google.reply_held ${r.review_id} ${r.held}`] : []),
  ]).sort();
  if (JSON.stringify(repliesFiled) !== JSON.stringify(repliesWanted))
    problems.push(`the workspace's reply events are not the fixtures' (${repliesFiled.join(", ")})`);
  // The state the Receptionist lens reads (e2e/reports.spec.ts) and the sweeps must leave alone: a week of Sam's
  // conversation, none of it queued; two handovers, both resolved with the time they were and none open, since the
  // deadman pages the platform for one left open two hours; a call that never connected; and the send the door held back,
  // which is filed best-effort and so is read back.
  const escalations = await read(
    "the escalations",
    db.from("escalations").select("state, resolved_at").eq("tenant_id", T),
  );
  const open = escalations.filter((e) => e.state !== "resolved");
  if (open.length)
    problems.push(
      `${open.length} open escalation(s) in the workspace: the deadman pages the platform for one left open`,
    );
  if (escalations.length !== SAM_HANDOVERS.length || escalations.some((e) => !e.resolved_at))
    problems.push(
      `the workspace should hold exactly ${SAM_HANDOVERS.length} escalations, each resolved at a time of its own`,
    );
  const queued = await read(
    "the queued messages",
    db.from("messages").select("id").eq("tenant_id", T).eq("status", "queued"),
  );
  if (queued.length) problems.push(`${queued.length} message(s) queued in the workspace, for a send job to pick up`);
  const missed = await read(
    "the missed call",
    db.from("calls").select("status, direction").eq("tenant_id", T).eq("retell_call_id", MISSED_CALL_ID).maybeSingle(),
  );
  if (missed?.status !== "not_connected" || missed?.direction !== "inbound")
    problems.push("the workspace should hold the call nobody took: an inbound call that never connected");
  const blocked = await read(
    "the blocked sends",
    db.from("events").select("data").eq("tenant_id", T).eq("kind", "message.send_blocked"),
  );
  if (blocked.length !== 1 || blocked[0].data?.reason !== "human_has_it")
    problems.push(
      "the blocked send the door held back is not on the ledger exactly once, as the Receptionist lens counts it",
    );
  // The state the People lens reads (e2e/reports.spec.ts): the three yeses on the ledger, once each, and the three steps,
  // every one done and with its day. A step left open under the prefix is a row in Today and a person on the Steps due list,
  // which other specs count. (A queued message is named above, for the Receptionist's rows and these alike.)
  const yeses = await read(
    "the yeses",
    db
      .from("events")
      .select("subject_id")
      .eq("tenant_id", T)
      .eq("kind", "contact.consent_changed")
      .eq("data->>note", PEOPLE_NOTE),
  );
  if (yeses.length !== PEOPLE.length || new Set(yeses.map((e) => e.subject_id)).size !== PEOPLE.length)
    problems.push(
      `the workspace should hold one yes event for each of the ${PEOPLE.length} seeded people, noted ${PEOPLE_NOTE}, and holds ${yeses.length}`,
    );
  const steps = (
    await read("the notes", db.from("person_notes").select("body, due_on, done_at").eq("tenant_id", T))
  ).filter((n) => n.body.startsWith(PEOPLE_PREFIX));
  const unfinished = steps.filter((n) => !n.done_at || !n.due_on);
  if (unfinished.length)
    problems.push(
      `${unfinished.length} step(s) under "${PEOPLE_PREFIX}" are open or have no day: an open step is a row in Today and a person on the Steps due list`,
    );
  if (steps.length !== PEOPLE_STEPS.length)
    problems.push(
      `the workspace should hold the ${PEOPLE_STEPS.length} done steps the People lens counts, and holds ${steps.length}`,
    );
  // The state the Campaigns lens reads (e2e/reports.spec.ts): the one run that went out, to the three seeded people, with its two
  // messages delivered or read, Casey Example's reply, the owner's approval and the message it sent. A run that is not sent is
  // a row in Today (waiting for a person) or a send job's, and a failed outbound message is one Today counts as a reply that
  // failed to deliver. (A queued message is named above, for every lens's rows.)
  const runs = await read("the runs", db.from("sequence_batches").select("id, name, state").eq("tenant_id", T));
  const unsent = runs.filter((r) => r.state !== "sent");
  if (unsent.length)
    problems.push(
      `${unsent.length} run(s) not sent in the workspace: a run waiting for a person is a row in Today, and one on its way is a send job's`,
    );
  const sentRuns = runs.filter((r) => r.name === CAMPAIGN_RUN);
  if (sentRuns.length !== 1 || sentRuns.some((r) => r.state !== "sent"))
    problems.push(
      `the workspace should hold the one sent run "${CAMPAIGN_RUN}" the Campaigns lens counts, and holds ${sentRuns.length}`,
    );
  const [theRun] = sentRuns;
  const seeded = (
    await read("the seeded people", db.from("contacts").select("id, phone_e164").eq("tenant_id", T))
  ).filter((c) => PEOPLE.some((p) => p.phone === c.phone_e164));
  const onRun = theRun
    ? await read(
        "the run's people",
        db.from("sequence_sends").select("contact_id, state, reason").eq("tenant_id", T).eq("batch_id", theRun.id),
      )
    : [];
  const robinId = seeded.find((c) => c.phone_e164 === ROBIN.phone)?.id;
  const heldOnRun = onRun.filter((r) => r.state === "skipped");
  if (
    onRun.length !== PEOPLE.length ||
    new Set(onRun.map((r) => r.contact_id)).size !== PEOPLE.length ||
    onRun.some((r) => !seeded.some((c) => c.id === r.contact_id)) ||
    onRun.filter((r) => r.state === "sent").length !== PEOPLE.length - 1 ||
    heldOnRun.length !== 1 ||
    heldOnRun[0].contact_id !== robinId ||
    heldOnRun[0].reason !== RUN_HELD_REASON
  )
    problems.push(
      `the Campaigns run should have its people: the ${PEOPLE.length} seeded people once each, ${PEOPLE.length - 1} sent to and ${ROBIN.name} held back as "${RUN_HELD_REASON}", and has ${onRun.map((r) => `${r.state}${r.reason ? ` ${r.reason}` : ""}`).join(", ") || "none"}`,
    );
  const everyMessage = await read(
    "the messages",
    db.from("messages").select("external_id, direction, status, meta").eq("tenant_id", T),
  );
  const ofTheRun = everyMessage.filter((m) => String(m.external_id ?? "").startsWith(CAMPAIGNS_PREFIX));
  const delivered = ofTheRun.filter((m) => m.direction === "outbound");
  const replies = ofTheRun.filter((m) => m.direction === "inbound");
  if (
    delivered.length !== RUN_SENDS.length ||
    delivered.some((m) => !["delivered", "read"].includes(m.status) || m.meta?.broadcast_id !== theRun?.id) ||
    replies.length !== 1
  )
    problems.push(
      `the Campaigns run should have two messages, delivered or read, and ${CASEY.name}'s reply; the workspace holds ${delivered.length} sent (${delivered.map((m) => m.status).join(", ")}) and ${replies.length} reply`,
    );
  const failedOut = everyMessage.filter((m) => m.direction === "outbound" && m.status === "failed");
  if (failedOut.length)
    problems.push(
      `${failedOut.length} failed outbound message(s) in the workspace: Today counts each as a reply that failed to deliver`,
    );
  const approvals = await read(
    "the approval",
    db.from("decisions").select("subject_id, payload").eq("tenant_id", T).eq("payload->>seed", CAMPAIGNS_NOTE),
  );
  if (approvals.length !== 1 || approvals[0].payload?.approved !== true || approvals[0].subject_id !== theRun?.id)
    problems.push(
      `the Campaigns run should have the one approval of its own, by the owner, on the run, and the workspace holds ${approvals.length}`,
    );
  const hello = await read(
    "the run's message",
    db.from("templates").select("channel, meta_status, hidden_at").eq("tenant_id", T).eq("name", CAMPAIGN_MESSAGE.name),
  );
  if (
    hello.length !== 1 ||
    hello[0].channel !== "whatsapp" ||
    hello[0].meta_status !== "approved" ||
    hello[0].hidden_at
  )
    problems.push(
      `the Campaigns run's message should be one approved WhatsApp message in the library, and the workspace holds ${hello.length} (${hello.map((m) => m.meta_status).join(", ")})`,
    );
  // The eval's Win-back, where --seed-win-back has seeded it: paused, so no sweep runs it. None is no problem: the
  // nightly seeds none.
  const winBacks = await read(
    "the eval's Win-back",
    db.from("sequence_steps").select("state").eq("tenant_id", T).eq("template_name", WIN_BACK.template),
  );
  if (winBacks.some((p) => p.state !== "paused"))
    problems.push("the eval's Win-back is running, and the hourly sweep would run it");
  return problems;
}

/**
 * The script's arguments: --apply writes, and --seed-win-back (Ruben's run by hand, never the nightly's, which passes
 * --apply alone) adds the eval's Win-back where it is not there.
 */
export function runOptions(argv) {
  return { apply: argv.includes("--apply"), seedWinBack: argv.includes("--seed-win-back") };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const { apply, seedWinBack } = runOptions(process.argv);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backups");
  const report = await converge(db, {
    ownerEmail: process.env.E2E_USER_EMAIL,
    memberEmail: process.env.E2E_MEMBER_EMAIL,
    apply,
    seedWinBack,
    backup: async (rows) => {
      mkdirSync(backupsDir, { recursive: true });
      const file = join(backupsDir, `e2e-workspace-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
      writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
      console.log(`backed up ${rows.length} rows to ${file}`);
    },
  });
  for (const line of report.did) console.log(`- ${line}`);
  if (!apply) console.log("dry run: nothing was written; --apply writes");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
