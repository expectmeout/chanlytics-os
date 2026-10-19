/**
 * Ask says what the page says (the wiring's second audit, lane R13): where Ask's reads said a stored value, a count of
 * their own or a wait the page had closed, they say the page's.
 *
 * - X5-1: Ask's read of the notifications closes what the bell closes -- a run approved, a booking email dismissed, a
 *   review answered read as read -- and counts the rest as the bell does.
 * - X5-2: "needs you" in Ask's Inbox doors is the Inbox's: a hold nobody has taken, or a reply counting down.
 * - X5-3: a person's line says their last contact as their People row does ("Phoned · 2h ago" when they phoned after they
 *   wrote) and both answers, to messages and to offers.
 * - X5-4: a warm turn says when the turns it replays were asked, as history.
 *
 * Executed: the tools over the database in memory, and the turn's words. X5-5 to X5-8 are held where their reads are run:
 * the Library's figure and the shape block in ask-context.test.mjs, the words of four fields in ask-tool-names.test.mjs.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NEW_REVIEW_NEWS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { clearContextCache } = await import(at("apps/dashboard/src/server/ask/context.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { turnWords } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));

beforeEach(() => {
  readerCache.clear();
  clearContextCache();
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();
const ago = (ms) => iso(NOW.getTime() - ms);
const id = (kind, n) =>
  `${kind.repeat(8)}-${kind.repeat(4)}-4${kind.repeat(3)}-8${kind.repeat(3)}-${String(n).padStart(12, "0")}`;

/* ------------------------------------------------------------------- the world */

const ROSA = id("a", 1);
const C_HOLD = id("c", 1);
const C_SENDING = id("c", 2);
const C_QUIET = id("c", 3);
const RUN_APPROVED = id("b", 1);
const RUN_WAITING = id("b", 2);
const EMAIL_DISMISSED = id("e", 1);
const REVIEW_ANSWERED = id("f", 1);

const embed = {
  id: ROSA,
  display_name: "Rosa",
  wa_profile_name: null,
  phone_e164: "+15555550100",
  email: null,
  consent: "opted_in",
  dnc: false,
};
const conversation = (cid, over = {}) => ({
  id: cid,
  tenant_id: A,
  contact_id: ROSA,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: ago(HOUR),
  last_message_at: ago(HOUR),
  contacts: embed,
  ...over,
});
const message = (mid, conversation_id, over = {}) => ({
  id: mid,
  conversation_id,
  tenant_id: A,
  direction: "inbound",
  sender: "client",
  type: "text",
  body: "Are you open Saturday?",
  media: null,
  meta: null,
  status: "delivered",
  created_at: ago(HOUR),
  channel_ts: ago(HOUR),
  channel: "whatsapp",
  ...over,
});
/** A notice kept for the bell, about a subject. */
const notice = (nid, kind, title, subject_type, subject_id) => ({
  id: nid,
  tenant_id: A,
  kind,
  title,
  body: title,
  route: null,
  subject_type,
  subject_id,
  recipient_user_id: null,
  created_at: ago(2 * HOUR),
  closed_at: null,
});
const run = (rid, state) => ({
  id: rid,
  tenant_id: A,
  name: "Win-back",
  state,
  playbook_id: null,
  run_for: null,
  audience: {},
  recipient_count: 3,
  template_name: "winback",
  template_language: "en",
  params: [],
  scheduled_for: ago(HOUR),
  channels: ["whatsapp"],
  created_at: ago(3 * HOUR),
  updated_at: ago(HOUR),
});

const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" }],
  tenant_config: [{ tenant_id: A, config: { brain: { business_name: "Harbor" } }, version: 1 }],
  tenant_channels: [],
  lines: [],
  policies: [],
  contacts: [{ ...embed, tenant_id: A, erased_at: null, marketing_consent: null }],
  conversations: [
    // Handed to a person, nobody has it: a hold.
    conversation(C_HOLD, { state: "needs_human" }),
    // The receptionist's reply counting down in the owner's name: it waits on them for its seconds.
    conversation(C_SENDING),
    conversation(C_QUIET),
  ],
  messages: [
    message(id("d", 1), C_HOLD),
    message(id("d", 2), C_SENDING),
    // Written a minute ago, held ten: it goes out in nine unless the owner stops it.
    message(id("d", 3), C_SENDING, {
      direction: "outbound",
      sender: "ai",
      status: "queued",
      body: "Yes, Saturday 9 to 1.",
      created_at: ago(MIN),
      channel_ts: ago(MIN),
      meta: { delay_ms: 10 * MIN },
    }),
    message(id("d", 4), C_QUIET, { direction: "outbound", sender: "ai", status: "delivered", body: "See you then." }),
  ],
  escalations: [
    {
      id: id("9", 1),
      tenant_id: A,
      conversation_id: C_HOLD,
      reason: "human_token",
      details: null,
      state: "open",
      created_at: ago(HOUR),
      updated_at: ago(HOUR),
    },
  ],
  deals: [],
  calls: [],
  templates: [],
  segments: [],
  segment_members: [],
  playbooks: [],
  events: [],
  contact_identities: [],
  // The bell's notices: a run since approved, a run still waiting, a booking email since dismissed, a review since answered.
  notifications: [
    notice(id("7", 1), "playbook", "Campaign “Win-back” is ready", "broadcast", RUN_APPROVED),
    notice(id("7", 2), "playbook", "Campaign “Win-back” is ready", "broadcast", RUN_WAITING),
    notice(id("7", 3), "booking_notice", "A booking email to look at", "booking_notice", EMAIL_DISMISSED),
    notice(id("7", 4), "review", `${NEW_REVIEW_NEWS} 5 stars from Ana`, "review", REVIEW_ANSWERED),
  ],
  notification_reads: [],
  notification_marks: [],
  broadcasts: [run(RUN_APPROVED, "scheduled"), run(RUN_WAITING, "pending_approval")],
  appointment_notices: [
    {
      id: EMAIL_DISMISSED,
      tenant_id: A,
      notice_id: "mail-1",
      tool: "square",
      from_address: "no-reply@example.com",
      subject: "New booking",
      received_at: ago(3 * HOUR),
      read_at: ago(3 * HOUR),
      outcome: "dismissed",
      hold_reason: null,
      appointment_id: null,
      created_at: ago(3 * HOUR),
      updated_at: ago(HOUR),
    },
  ],
  google_reviews: [
    {
      id: REVIEW_ANSWERED,
      tenant_id: A,
      review_id: "g-1",
      origin: "places",
      rating: 5,
      author: "Ana",
      body: "Lovely",
      reply_text: "Thank you, Ana!",
      replied_at: ago(HOUR),
      first_seen_at: ago(3 * HOUR),
      last_seen_at: ago(HOUR),
    },
  ],
});

/** A person as people_list returns them: wrote six days ago, phoned this morning, yes to messages, offers not asked. */
const rosaRow = {
  id: ROSA,
  display_name: "Rosa",
  wa_profile_name: null,
  phone_e164: "+15555550100",
  email: null,
  consent: "opted_in",
  consent_source: "customer_message",
  consent_updated_at: ago(30 * DAY),
  marketing_consent: "unknown",
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp", "voice"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: C_QUIET,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: ago(6 * DAY),
  last_message_at: ago(6 * DAY),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Thanks!",
  last_inbound_at: ago(6 * DAY),
  last_call_at: ago(2 * HOUR),
  last_inbound_call_at: ago(2 * HOUR),
  call_count: 1,
  call_seconds: 120,
  first_contact_at: ago(60 * DAY),
  earliest_row_at: ago(60 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
};

const ctxFor = () => ({
  supabase: fakeDb(tables(), {}, { people_list: () => [rosaRow], contact_seen: () => [] }),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
/** A read tool's answer, parsed. */
const read = async (name, input) =>
  JSON.parse((await runTool(newToolContext(ctxFor(), A, "owner", TZ, NOW), { name, input })).result);

/* ---------------------------------------------- X5-1: the notices, closed as the bell closes them */

test("Ask's read of the notifications closes what the bell closes: a run approved, a booking email dismissed, a review answered read as read, and the count is the bell's", async () => {
  const said = await read("workspace", { action: "notifications" });
  assert.equal(said.unread, 1, "REGRESSION: four unread, above the bell's one");
  const unreadTitles = said.notifications.filter((n) => n.unread).map((n) => n.says);
  assert.equal(unreadTitles.length, 1, "the run that still waits for your word");
  assert.equal(said.notifications.length, 4, "the settled ones stay, as the record, read");
});

/* ---------------------------------------------- X5-2: "needs you" is the Inbox's */

test("inbox.list needs_you is the Inbox's count: the hold, and the reply counting down in your name", async () => {
  const said = await read("inbox", { action: "list", filter: "needs_you" });
  assert.deepEqual(
    said.threads.map((t) => t.conversation_id).sort(),
    [C_HOLD, C_SENDING].sort(),
    "REGRESSION: the holds alone, one fewer than the Inbox's 'need you'",
  );
  assert.equal(said.total_matching, 2);
});

/* ---------------------------------------------- X5-3: a person's line in the row's words */

test("people.search says a person's last contact as their People row does, and both their answers", async () => {
  const said = await read("people", { action: "search", query: "rosa" });
  const [rosa] = said.people;
  assert.equal(rosa.last_contact, "Phoned · 2h ago", "REGRESSION: their last message, six days before the call");
  assert.deepEqual(rosa.consent, { messages: "Yes", offers: "Not asked" }, "REGRESSION: one raw word for two answers");
});

/* ---------------------------------------------- X5-4: a warm turn says its replayed reads' times */

test("a warm turn says when the turns it replays were asked, as history, and a cold one says nothing of it", () => {
  const facts = {
    role: "owner",
    personLabel: "ada",
    scope: null,
    surface: null,
    language: "en",
    timezone: TZ,
    closures: [],
    now: NOW,
  };
  const warm = turnWords({ ...facts, replayedAt: [NOW.getTime() - 3 * MIN, NOW.getTime() - MIN] });
  // The clock's own words, whatever space the zone's formatter puts before AM.
  assert.match(warm, /were made at 9:57\sAM and 9:59\sAM, by the business's clock: they are what was true then/);
  assert.match(warm, /Read again what may have changed since/);
  assert.equal(turnWords(facts).includes("were made at"), false, "a cold turn replays nothing");
  assert.equal(turnWords({ ...facts, replayedAt: [] }).includes("were made at"), false);
});
