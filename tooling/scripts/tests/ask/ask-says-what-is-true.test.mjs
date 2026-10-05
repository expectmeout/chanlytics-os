/**
 * Ask says what is true (5 Oct 2026, the Ask honesty pass): four things Ask said that the dashboard does not.
 *
 * - A dial the receptionist placed that nobody answered is "a call that didn't connect", never "missed" (contracts
 *   missedCall, with callAttemptWords): the quick answer, the suggestion's count, the jump list's word under a call,
 *   the calls tool's filter, its rows and the page context's call lines, and the glossary the model reads. The quick
 *   answer reads every call Live holds (missedCalls, uncapped), not the page's newest eight.
 * - An action card names the person as People and the Inbox do (personName), and a whisper names the call as Live does
 *   (callerName): a saved name, else the number as it is printed, never the raw E.164 or "this person".
 * - A held draft is one still waiting, by the Inbox's rule (heldDraftWaits, over replyWaitsOnYou): a queued draft past
 *   its deadline is going out, not held.
 *
 * Executed: the contracts' own functions, the palette over a window, and the tools over the database in memory.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  askCallOutcome,
  buildAskSuggestions,
  callAttemptWords,
  callJumpSub,
  callsAnswer,
  callsToday,
  DEAL_STAGE_WORDS,
  heldDraftWaits,
  missedCall,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runTool, buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { buildContext, clearContextCache } = await import(at("apps/dashboard/src/server/ask/context.ts"));
const { readerCache, readerContext } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { ASK_DEFINITIONS } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
const { askPalette, quickAnswer } = await import(at("apps/dashboard/src/legacy-bridge/ask/palette.ts"));

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
const HOUR = 3600_000;
const iso = (ms) => new Date(ms).toISOString();
const ago = (ms) => iso(NOW.getTime() - ms);
const id = (kind, n) =>
  `${kind.repeat(8)}-${kind.repeat(4)}-4${kind.repeat(3)}-8${kind.repeat(3)}-${String(n).padStart(12, "0")}`;

/* ------------------------------------------------------------------- the world */

const ROSA = id("a", 1);
const PHONE_ONLY = id("a", 2);
const NOBODY = id("a", 3);
const person = (pid, over = {}) => ({
  id: pid,
  tenant_id: A,
  display_name: null,
  wa_profile_name: null,
  phone_e164: null,
  email: null,
  erased_at: null,
  marketing_consent: null,
  ...over,
});
const CONTACTS = [
  person(ROSA, { display_name: "Rosa", phone_e164: "+15555550100" }),
  person(PHONE_ONLY, { phone_e164: "+15555550103" }),
  person(NOBODY),
];
const embed = (c) => ({
  display_name: c.display_name,
  wa_profile_name: c.wa_profile_name,
  phone_e164: c.phone_e164,
  email: c.email,
  consent: "opted_in",
  dnc: false,
  id: c.id,
});

const conversation = (cid, who, over = {}) => ({
  id: cid,
  tenant_id: A,
  contact_id: who.id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: ago(HOUR),
  last_message_at: ago(HOUR),
  contacts: embed(who),
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
/** A queued draft of the receptionist's, written `writtenAgo` ms before NOW and held for `window` ms (none: no window). */
const draft = (mid, conversation_id, writtenAgo, window) =>
  message(mid, conversation_id, {
    direction: "outbound",
    sender: "ai",
    status: "queued",
    body: "Yes, Saturday 9 to 1.",
    created_at: ago(writtenAgo),
    channel_ts: ago(writtenAgo),
    ...(window === undefined ? {} : { meta: { delay_ms: window } }),
  });

const call = (kid, over = {}) => ({
  id: kid,
  tenant_id: A,
  retell_call_id: `r-${kid.slice(-2)}`,
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+15555550100",
  from_raw: null,
  to_e164: "+19295550100",
  started_at: ago(2 * HOUR),
  ended_at: ago(2 * HOUR - 200_000),
  duration_ms: 200_000,
  disconnection_reason: "user_hangup",
  sentiment: null,
  call_successful: true,
  in_voicemail: false,
  summary: "Asked about Saturday.",
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: null,
  transcript_object: [],
  recording: null,
  conversation_id: null,
  contact_id: null,
  message_id: null,
  updated_at: iso(NOW.getTime()),
  contacts: null,
  ...over,
});
const K_MISSED = id("d", 1);
const K_PLACED = id("d", 2);
const K_ANSWERED = id("d", 3);
const K_LIVE_NAMED = id("d", 4);
const K_LIVE_PHONE = id("d", 5);
const K_LIVE_NUMBER = id("d", 6);
const K_LIVE_WITHHELD = id("d", 7);
const live = (kid, over) =>
  call(kid, {
    status: "ongoing",
    started_at: ago(MIN),
    ended_at: null,
    duration_ms: null,
    disconnection_reason: null,
    ...over,
  });

const C_WAITS = id("c", 1);
const C_PAST = id("c", 2);
const C_NOBODY = id("c", 3);

/** One workspace: a draft that still waits, one past its deadline, calls both ways, and three people to name. */
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "proposal" }],
  tenant_config: [],
  tenant_channels: [],
  policies: [],
  contacts: CONTACTS,
  conversations: [
    conversation(C_WAITS, CONTACTS[0]),
    conversation(C_PAST, CONTACTS[1]),
    conversation(C_NOBODY, CONTACTS[2]),
  ],
  messages: [
    message(id("e", 1), C_WAITS),
    // Written a minute ago, held ten: it waits for another nine.
    draft(id("e", 2), C_WAITS, MIN, 10 * MIN),
    message(id("e", 3), C_PAST),
    // Written half an hour ago with no window: its deadline is long gone.
    draft(id("e", 4), C_PAST, 30 * MIN),
    message(id("e", 5), C_NOBODY),
  ],
  escalations: [],
  deals: [],
  calls: [
    call(K_MISSED, {
      status: "not_connected",
      started_at: ago(2 * HOUR),
      ended_at: null,
      duration_ms: null,
      disconnection_reason: "dial_no_answer",
      summary: null,
      contacts: embed(CONTACTS[0]),
      contact_id: ROSA,
    }),
    call(K_PLACED, {
      direction: "outbound",
      status: "not_connected",
      from_e164: "+19295550100",
      to_e164: "+15555550100",
      started_at: ago(HOUR),
      ended_at: null,
      duration_ms: null,
      disconnection_reason: "dial_no_answer",
      summary: null,
      contacts: embed(CONTACTS[0]),
      contact_id: ROSA,
    }),
    call(K_ANSWERED, { contacts: embed(CONTACTS[0]), contact_id: ROSA }),
    live(K_LIVE_NAMED, { contacts: embed(CONTACTS[0]), contact_id: ROSA }),
    live(K_LIVE_PHONE, { from_e164: "+15555550103", contacts: embed(CONTACTS[1]), contact_id: PHONE_ONLY }),
    live(K_LIVE_NUMBER, { from_e164: "+15555550177" }),
    live(K_LIVE_WITHHELD, { from_e164: null, from_raw: null }),
  ],
  templates: [],
  segments: [],
  segment_members: [],
  playbooks: [],
  events: [],
  contact_identities: [],
});

const ctxFor = () => ({ supabase: fakeDb(tables(), {}, {}), userId: USER, email: "ada@example.com", params: {} });
const toolsIn = (ctx = ctxFor()) => newToolContext(ctx, A, "owner", TZ, NOW);
/** A read tool's answer, parsed. */
const read = async (name, input) => JSON.parse((await runTool(toolsIn(), { name, input })).result);
/** The card a builder made, or the refusal it said. */
const card = async (name, input) => {
  const out = await buildProposal(toolsIn(), name, input);
  return out.proposal ?? JSON.parse(out.result);
};

/* ------------------------------------------------- 1. a dial we placed is not "missed" */

test("missedCall is the one rule: a dial that never connected is missed only where the customer dialled, and a row that does not say who dialled is a customer's; callAttemptWords says it by the same rule", () => {
  assert.equal(missedCall({ missed: true, direction: "inbound" }), true);
  assert.equal(missedCall({ missed: true }), true, "a row with no direction is a customer's, as the bell reads it");
  assert.equal(missedCall({ missed: true, direction: "outbound" }), false);
  assert.equal(missedCall({ missed: false, direction: "inbound" }), false);
  assert.equal(callAttemptWords("inbound"), "Missed call");
  assert.equal(callAttemptWords("outbound"), "Call didn't connect");
  const outcome = (outcome, direction) => askCallOutcome({ outcome, missed: outcome === "missed", direction });
  assert.deepEqual(
    [
      outcome("missed", "inbound"),
      outcome("missed", "outbound"),
      outcome("handled", "outbound"),
      outcome("live", "outbound"),
    ],
    ["missed", "not_connected", "handled", "live"],
    "the Calls page's outcome, but a dial we placed that nobody answered is not_connected, never missed",
  );
  assert.deepEqual(
    [
      callJumpSub({ live: false, missed: true, direction: "inbound" }),
      callJumpSub({ live: false, missed: true, direction: "outbound" }),
      callJumpSub({ live: false, missed: true }),
      callJumpSub({ live: true, missed: false, direction: "outbound" }),
      callJumpSub({ live: false, missed: false, direction: "outbound" }),
    ],
    ["missed", "didn't connect", "missed", "live", undefined],
  );
});

test("did anyone call: today's missed calls are the customers' dials that never connected; the receptionist's own that nobody answered is not one, in either language", () => {
  const NOW_MS = Date.parse("2026-09-05T16:00:00Z");
  const row = (callId, over) => ({
    callId,
    who: callId,
    missed: true,
    live: false,
    startedAtMs: NOW_MS - HOUR,
    ...over,
  });
  const calls = [
    row("in", { direction: "inbound" }),
    row("placed", { direction: "outbound" }),
    row("unsaid"),
    row("old", { direction: "inbound", startedAtMs: NOW_MS - 3 * 86_400_000 }),
    row("on-the-line", { missed: false, live: true, direction: "outbound" }),
  ];
  const { missed, live } = callsToday(calls, NOW_MS, "America/New_York");
  assert.deepEqual([missed.map((c) => c.callId), live.map((c) => c.callId)], [["in", "unsaid"], ["on-the-line"]]);
  assert.equal(callsAnswer(missed, live, "en").say.headline, "2 missed calls today.");
  const onlyPlaced = callsToday([row("placed", { direction: "outbound" })], NOW_MS, "America/New_York");
  assert.deepEqual(onlyPlaced.missed, []);
  assert.equal(callsAnswer(onlyPlaced.missed, onlyPlaced.live, "en").say.headline, "No missed calls today.");
  assert.equal(callsAnswer(onlyPlaced.missed, onlyPlaced.live, "es").say.headline, "Ninguna llamada perdida hoy.");
});

test("the palette reads every call Live holds, each once: today's missed calls past the page's newest few count, and a dial we placed is not one -- in the quick answer, the suggestion's count and the jump list's word", async () => {
  const win = (live) => ({
    __WORKSPACES: [{ id: "w1", slug: "h", name: "Harbor", status: "active", timezone: TZ }],
    __ACTIVE_WORKSPACE: "w1",
    INBOX_DATA: { THREADS: [] },
    __LIVE: live,
  });
  const call = (callId, over) => ({
    callId,
    cvId: `cv-${callId}`,
    who: callId,
    missed: true,
    live: false,
    startedAtMs: NOW.getTime() - 2 * HOUR,
    ...over,
  });
  const inbound = call("k-in", { direction: "inbound" });
  const placed = call("k-placed", { direction: "outbound" });
  const pinned = async (fn) => {
    const real = Date.now;
    Date.now = () => NOW.getTime();
    try {
      return await fn();
    } finally {
      Date.now = real;
    }
  };
  const base = { surface: "today", language: "en", needsYou: 0, heldDrafts: 0, liveNow: 0, hasCalendar: false };
  const none = buildAskSuggestions({ ...base, missedToday: 0 }).map((s) => s.q);
  const missedQ = buildAskSuggestions({ ...base, missedToday: 1 })
    .map((s) => s.q)
    .find((q) => !none.includes(q));
  const asked = (p) =>
    pinned(async () => [
      (await quickAnswer(p, async () => ({ state: "unavailable" }))("did anyone call?")).say.headline,
      p
        .suggestions("today", null, "en")
        .map((s) => s.q)
        .includes(missedQ),
    ]);

  // The morning's missed call fell out of the page's newest eight, so only missedCalls holds it.
  const p = askPalette(win({ now: [], recent: [placed], missedCalls: [inbound, placed] }), null);
  assert.deepEqual(await asked(p), ["One missed call today.", true]);
  const jump = p.jumpIndex().filter((j) => j.kind === "call");
  assert.deepEqual(
    jump.map((j) => [j.to, j.sub]),
    [
      ["conversations/cv-k-in", "missed"],
      ["conversations/cv-k-placed", "didn't connect"],
    ],
    "each call once, the word for a dial we placed not 'missed'",
  );
  const only = askPalette(win({ now: [], recent: [placed], missedCalls: [placed] }), null);
  assert.deepEqual(
    await asked(only),
    ["No missed calls today.", false],
    "a dial we placed is no missed call to ask about",
  );
});

test("calls.list: missed is the customers' dials that never connected today; each row says which way it was dialled, and a dial we placed that nobody answered is not_connected, never missed", async () => {
  const missed = await read("calls", { action: "list", filter: "missed" });
  assert.deepEqual(
    missed.calls.map((c) => [c.call_id, c.direction, c.outcome]),
    [[K_MISSED, "inbound", "missed"]],
  );
  const today = await read("calls", { action: "list", filter: "today" });
  const by = new Map(today.calls.map((c) => [c.call_id, [c.direction, c.outcome]]));
  assert.deepEqual(by.get(K_PLACED), ["outbound", "not_connected"]);
  assert.deepEqual(by.get(K_MISSED), ["inbound", "missed"]);
  assert.deepEqual(by.get(K_ANSWERED), ["inbound", "handled"]);
  const one = await read("calls", { action: "get", call_id: K_PLACED });
  assert.deepEqual([one.direction, one.outcome], ["outbound", "not_connected"]);
});

test("the page context's call lines say a dial we placed 'not_connected', and a customer's 'missed'", async () => {
  const rc = readerContext(ctxFor(), { tenantId: A, role: "operator" }, NOW, { keep: true });
  const b = await buildContext(rc, {
    v: 1,
    surface: "live",
    route: "live",
    view: null,
    focus: null,
    rows: [
      { kind: "call", id: K_MISSED },
      { kind: "call", id: K_PLACED },
    ],
    askedAt: 1,
  });
  const lines = b.blocks.map((x) => x.content[0].text);
  assert.match(lines.find((l) => l.includes(K_MISSED)) ?? "", /· missed ·/);
  assert.match(lines.find((l) => l.includes(K_PLACED)) ?? "", /· not_connected ·/);
  assert.ok(!lines.find((l) => l.includes(K_PLACED))?.includes("missed"));
});

test("the glossary the model reads: a missed call is a customer's dial that never connected; one we placed did not connect (not_connected), and a caller who hung up within seconds is abandoned", () => {
  const said = ASK_DEFINITIONS["missed call"];
  assert.ok(!said.includes("ended before anyone spoke"), "that is the abandoned outcome, a separate one");
  assert.ok(
    said.includes(askCallOutcome({ outcome: "missed", missed: true, direction: "outbound" })),
    "the word the tool says",
  );
  assert.ok(said.includes("abandoned"));
});

/* ----------------------------------------- 2. an action card names the person as the pages do */

test("a card names the person as People and the Inbox do: the saved name, else their number as it is printed, else Unknown -- never the raw E.164 or 'this person'", async () => {
  const verb = (conversation_id) => card("propose_thread_verb", { conversation_id, verb: "take_over" });
  assert.equal((await verb(C_WAITS)).title, "Take over Rosa's thread");
  const phone = await verb(C_PAST);
  assert.equal(phone.title, "Take over +1 (555) 555-0103's thread");
  assert.equal(phone.payload.who, "+1 (555) 555-0103");
  assert.equal((await verb(C_NOBODY)).title, "Take over Unknown's thread");

  const deal = (contact_id) => card("propose_deal", { contact_id, stage: "proposed" });
  const out = DEAL_STAGE_WORDS.proposed;
  assert.equal((await deal(ROSA)).title, `Rosa · ${out}`);
  assert.equal((await deal(PHONE_ONLY)).title, `+1 (555) 555-0103 · ${out}`);
  assert.equal((await deal(NOBODY)).title, `Unknown · ${out}`);

  const note = (contact_id) =>
    card("propose_person", { action: "note", contact_id, body: "Prefers mornings.", for: "team" });
  assert.equal((await note(PHONE_ONLY)).title, "Note on +1 (555) 555-0103");
  assert.equal((await note(NOBODY)).title, "Note on Unknown");
  const details = await card("propose_person", { action: "details", contact_id: PHONE_ONLY, name: "Ana" });
  assert.equal(
    details.summary,
    "Name: no name of their own (shows as +1 (555) 555-0103) → Ana",
    "what the page shows in place of a name, as the page prints it",
  );
});

/* ------------------------------------------------- 3. a whisper names the call as Live does */

test("a whisper names the call as Live does: the saved name, else the number as the phone showed it, else Caller ID withheld", async () => {
  const whisper = async (call_id) => (await card("propose_whisper", { call_id, text: "Saturday is full" })).title;
  assert.equal(await whisper(K_LIVE_NAMED), "Whisper on the call with Rosa");
  assert.equal(await whisper(K_LIVE_PHONE), "Whisper on the call with +1 (555) 555-0103");
  assert.equal(await whisper(K_LIVE_NUMBER), "Whisper on the call with +1 (555) 555-0177");
  assert.equal(await whisper(K_LIVE_WITHHELD), "Whisper on the call with Caller ID withheld");
});

/* ----------------------------------- 4. a held draft is one still waiting, by the Inbox's rule */

test("heldDraftWaits: the draft is there and its deadline is ahead, by replyWaitsOnYou", () => {
  const now = NOW.getTime();
  assert.equal(heldDraftWaits({ heldDraft: { messageId: "m", body: "x", sendsAtMs: now + 1 } }, now), true);
  assert.equal(
    heldDraftWaits({ heldDraft: { messageId: "m", body: "x", sendsAtMs: now } }, now),
    false,
    "at its deadline it goes",
  );
  assert.equal(heldDraftWaits({ heldDraft: { messageId: "m", body: "x", sendsAtMs: now - MIN } }, now), false);
  assert.equal(heldDraftWaits({ heldDraft: null }, now), false);
});

test("inbox.list held: a draft still inside its hold window, and no queued draft past its deadline; the page context counts and marks them the same way", async () => {
  const held = await read("inbox", { action: "list", filter: "held" });
  assert.deepEqual(
    [held.total_matching, held.threads.map((t) => t.conversation_id)],
    [1, [C_WAITS]],
    "Rosa's draft waits another nine minutes; the other was queued half an hour ago with no window",
  );
  const rc = readerContext(ctxFor(), { tenantId: A, role: "operator" }, NOW, { keep: true });
  const b = await buildContext(rc, {
    v: 1,
    surface: "inbox",
    route: "inbox",
    view: "all",
    focus: null,
    rows: [
      { kind: "thread", id: C_WAITS },
      { kind: "thread", id: C_PAST },
    ],
    askedAt: 1,
  });
  const texts = b.blocks.map((x) => x.content[0].text);
  assert.match(texts[0], /· held: 1 ·/);
  assert.match(texts.find((t) => t.startsWith("Rosa")) ?? "", /draft held/);
  assert.ok(!(texts.find((t) => t.startsWith("+1 (555) 555-0103")) ?? "").includes("draft held"));
});
