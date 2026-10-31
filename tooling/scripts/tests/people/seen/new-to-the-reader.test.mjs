/**
 * Who is new to the reader (00349): one rule for the Inbox, Conversations and People.
 *
 * Seen on the salon's phone, 7 Oct 2026: every row of Conversations drew at one weight, read or not; the Inbox's dot
 * meant "needs you", so a thread never went from unread to read by being opened; and People's list said nothing of who
 * had written since the owner last looked. Now each member keeps their own reading of each person, and a row is new to
 * them when the customer wrote or called after it, when they put the person back as unread, or when the bell still
 * holds an unread note about them.
 *
 * Run against the contracts (the rule, the three view models, who a bell row is about) and the tab's own store
 * (surfaces/seen.ts) over a fake wire and a stand-in bell.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isUnseen, noteWhose, seenBy, toConversationVM, toInboxThreadVM, toPersonRowVM } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-10-07T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const ms = (iso) => Date.parse(iso);

/* ---------------------------------- the rule ---------------------------------- */

test("a member's reading of a person is the later of their floor and their own mark; without an answer nothing is known", () => {
  const of = seenBy({
    floor_at: ago(600),
    marks: [
      { contact_id: "p-opened", seen_at: ago(30), unread_at: null, marked_at: ago(29) },
      { contact_id: "p-before-floor", seen_at: ago(900), unread_at: null },
      { contact_id: "p-put-back", seen_at: ago(30), unread_at: ago(5) },
      { contact_id: "p-never-opened", seen_at: null, unread_at: ago(5) },
    ],
  });
  assert.deepEqual(
    of("p-opened"),
    { seen_at: ago(30), marked_at: ago(29) },
    "their own mark, later than the floor, with the stamp of its writing",
  );
  assert.deepEqual(of("p-before-floor"), { seen_at: ago(600) }, "a mark older than the floor reads as the floor");
  assert.deepEqual(of("p-nobody-marked"), { seen_at: ago(600) }, "nobody marked: the floor");
  assert.deepEqual(of("p-put-back"), { seen_at: ago(30), marked_unread: true });
  assert.deepEqual(of("p-never-opened"), { seen_at: ago(600), marked_unread: true });
  assert.deepEqual(seenBy(null)("p-opened"), {}, "the marks were not read: nothing is known of anyone");
  assert.deepEqual(seenBy({ floor_at: null, marks: [] })("p-opened"), {}, "no floor and no mark: nothing is known");
});

test("new to the member: heard from after they last saw them, or put back; never on a reading that is not known", () => {
  assert.equal(isUnseen(ago(10), { seen_at: ago(30) }), true, "they wrote after the member last looked");
  assert.equal(isUnseen(ago(40), { seen_at: ago(30) }), false, "the member has seen what they wrote");
  assert.equal(isUnseen(ago(30), { seen_at: ago(30) }), false, "the same moment is seen");
  assert.equal(isUnseen(ago(40), { seen_at: ago(30), marked_unread: true }), true, "put back as unread");
  assert.equal(isUnseen(null, { seen_at: ago(30) }), false, "nothing came in: nothing is new");
  assert.equal(isUnseen(ago(10), {}), false, "REGRESSION guard: an unknown reading is never called new");
  assert.equal(isUnseen(ms(ago(10)), { seen_at: ago(30) }), true, "the moment as epoch ms, as People's row holds it");
  assert.equal(isUnseen(0, { seen_at: ago(30) }), false, "never heard from");
});

/* ------------------------------ the view models ------------------------------ */

const person = (id, name) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+16465550123",
  consent: "opted_in",
  dnc: false,
});
const wrote = (id, body, min) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at: ago(min),
  channel_ts: ago(min),
});
const conv = (over = {}) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(40),
  last_message_at: ago(20),
  last_inbound_at: ago(40),
  contact: person("p-1", "Rosa Example"),
  messages: [wrote("m-1", "Can I move my appointment?", 40)],
  ...over,
});
const asked = { id: "e-1", reason: "human_token", details: null, state: "open", created_at: ago(35) };

test("the Inbox's dot is the reader's, apart from standing: a thread that needs you may be read, and one the receptionist handled may be new", () => {
  const needsAndRead = toInboxThreadVM(conv({ state: "needs_human", seen_at: ago(10) }), asked, ZONE, NOW);
  assert.deepEqual(
    [needsAndRead.needsYou, needsAndRead.unread],
    [true, false],
    "REGRESSION: the dot meant needs you, so opening a thread never read it",
  );
  const handledAndNew = toInboxThreadVM(conv({ seen_at: ago(60) }), null, ZONE, NOW);
  assert.deepEqual(
    [handledAndNew.needsYou, handledAndNew.unread],
    [false, true],
    "REGRESSION: a thread the receptionist answered alone never read as new",
  );
  assert.equal(toInboxThreadVM(conv({ seen_at: ago(10), marked_unread: true }), null, ZONE, NOW).unread, true);
  assert.equal(
    toInboxThreadVM(conv({ state: "needs_human" }), asked, ZONE, NOW).unread,
    false,
    "a read that carries no reading (a dashboard ahead of the migration) calls nothing new",
  );
  assert.equal(needsAndRead.heardAtMs, ms(ago(40)), "when they last wrote, never when we last replied");
  assert.equal(needsAndRead.lastAtMs, ms(ago(20)));
  assert.equal(toInboxThreadVM(conv({ last_inbound_at: null }), null, ZONE, NOW).heardAtMs, 0);
  // The stamp of the reader's mark rides with the row: what a tab holds its own word against (surfaces/seen.ts).
  assert.equal(needsAndRead.markAtMs, 0, "no mark of their own: the floor alone");
  assert.equal(toInboxThreadVM(conv({ seen_at: ago(10), marked_at: ago(9) }), null, ZONE, NOW).markAtMs, ms(ago(9)));
});

test("Conversations' row says the same of the same person", () => {
  const fresh = toConversationVM(conv({ seen_at: ago(60) }), null, ZONE, NOW);
  assert.deepEqual([fresh.unseen, fresh.heardAtMs, fresh.markAtMs], [true, ms(ago(40)), 0]);
  assert.equal(toConversationVM(conv({ seen_at: ago(10), marked_at: ago(9) }), null, ZONE, NOW).markAtMs, ms(ago(9)));
  assert.equal(toConversationVM(conv({ seen_at: ago(10) }), null, ZONE, NOW).unseen, false);
  assert.equal(toConversationVM(conv(), null, ZONE, NOW).unseen, false, "no reading: not new");
});

const personRow = (over = {}) => ({
  id: "p-1",
  display_name: "Rosa Example",
  wa_profile_name: null,
  phone_e164: "+16465550123",
  email: null,
  consent: "opted_in",
  dnc: false,
  created_at: ago(5000),
  has_chat: true,
  latest_conversation_id: "c1",
  latest_state: "open",
  latest_paused_until: null,
  latest_snooze_until: null,
  latest_assignee_user_id: null,
  last_message_at: ago(20),
  last_inbound_at: ago(40),
  last_inbound_text: "Can I move my appointment?",
  last_outbound_at: ago(20),
  conversation_count: 1,
  call_count: 0,
  escalation_count: 0,
  call_seconds: 0,
  open_escalation_since: null,
  ...over,
});

test("People's row says it too, from the later of what they wrote and a call they placed, and names their conversation", () => {
  const fresh = toPersonRowVM(personRow({ seen_at: ago(60) }), ZONE, NOW);
  assert.deepEqual([fresh.unseen, fresh.conversationId, fresh.threadId, fresh.markAtMs], [true, "c1", "th-c1", 0]);
  assert.equal(toPersonRowVM(personRow({ seen_at: ago(30), marked_at: ago(29) }), ZONE, NOW).markAtMs, ms(ago(29)));
  assert.equal(toPersonRowVM(personRow({ seen_at: ago(30) }), ZONE, NOW).unseen, false);
  assert.equal(
    toPersonRowVM(personRow({ seen_at: ago(30), last_inbound_call_at: ago(5) }), ZONE, NOW).unseen,
    true,
    "they phoned after the member last looked",
  );
  assert.equal(toPersonRowVM(personRow(), ZONE, NOW).unseen, false, "no reading: not new");
  const phonedOnly = toPersonRowVM(personRow({ has_chat: false, seen_at: ago(60) }), ZONE, NOW);
  assert.deepEqual(
    [phonedOnly.threadId, phonedOnly.conversationId],
    [null, "c1"],
    "a person who only phoned has no thread to open, and still a conversation a bell note may name",
  );
});

/* ---------------------------- who a bell row is about ---------------------------- */

const CONV = "0f3b6c1e-5b0a-4c7e-9a43-2f8f5d1c7a10";
const PERSON = "7a1d2e3f-4b5c-4d6e-8f70-112233445566";

test("a bell row is about a person by what it says it is about, else by where its door opens; anything else is nobody's", () => {
  assert.deepEqual(noteWhose({ about: { type: "conversation", id: CONV }, to: "inbox" }), { conversationId: CONV });
  assert.deepEqual(noteWhose({ about: { type: "contact", id: PERSON }, to: "clients" }), { personId: PERSON });
  assert.deepEqual(
    noteWhose({ about: null, to: `inbox/th-${CONV}` }),
    { conversationId: CONV },
    "a derived row carries no subject: its door is the thread it was made from",
  );
  assert.deepEqual(noteWhose({ to: `clients/${PERSON}` }), { personId: PERSON });
  for (const to of ["inbox", "clients", "clients/leads", "broadcasts/run:abc", `conversations/cv-${CONV}`, "today"]) {
    assert.equal(noteWhose({ about: null, to }), null, to);
  }
  assert.equal(noteWhose({ about: { type: "broadcast", id: CONV }, to: "broadcasts" }), null);
});

/* -------------------------------- the tab's store -------------------------------- */

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
Object.assign(globalThis, {
  location: { pathname: "/w/marisas", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  __WORKSPACES: [{ id: "t1", slug: "marisas", name: "Marisa's", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
});
/** Every mark asked of the server: the person, which way, and how far the reader said they had seen. */
const marks = [];
/** What the wire answers a mark with: the door's answer by default, and whatever a test sets in its place. */
const wire = { stamp: 0, answer: null };
const answered = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const hit = /^\/api\/v1\/contacts\/([^/]+)\/seen$/.exec(u.pathname);
  if (!hit || init.method !== "PUT") return answered(200, { ok: true, data: {} });
  const body = JSON.parse(String(init.body));
  marks.push([hit[1], body.seen, body.heard_at ?? null]);
  if (wire.answer) return wire.answer();
  // The database stamps each writing later than the last.
  wire.stamp += 1000;
  return answered(200, { ok: true, data: { contact_id: hit[1], marked_at: new Date(wire.stamp).toISOString() } });
};
const S = "../../../../../apps/dashboard/src";
const { seePerson, unseePerson, unreadHere, threadUnread, threadWhose, threadReading } = await import(
  `${S}/surfaces/seen.ts`
);
// The door's answer is read over a few turns of the loop (the request, its body, the client's own steps): wait them out.
const settle = async () => {
  for (let turn = 0; turn < 6; turn += 1) await new Promise((r) => setImmediate(r));
};
/** A row's reading, as its last read said it. */
const read = (unseen, heardAtMs, markAtMs = 0) => ({ unseen, heardAtMs, markAtMs });
const iso = (at) => new Date(at).toISOString();

test("a row says what the last read said until the tab does something: opening reads it at once, and says how far the reader has seen", async () => {
  const who = { personId: "p-open", conversationId: "c-open" };
  const heard = ms(ago(40));
  assert.equal(unreadHere(who, read(true, heard)), true, "the read's word");
  assert.equal(unreadHere(who, read(false, heard)), false);
  seePerson(who, read(true, heard));
  assert.equal(unreadHere(who, read(true, heard)), false, "read at once, before the server has answered");
  await settle();
  assert.deepEqual(
    marks.splice(0),
    [["p-open", true, iso(heard)]],
    "the mark says they have seen up to what the customer last sent: the customer's own moment, never this device's clock",
  );
  assert.equal(unreadHere(who, read(true, heard)), false, "read here, over a read that left before the mark landed");
  assert.equal(
    unreadHere(who, read(true, ms(ago(5)))),
    true,
    "REGRESSION guard: what they wrote after the opening is new, whatever any clock says",
  );
  seePerson(who, read(true, heard));
  await settle();
  assert.deepEqual(marks.splice(0), [], "already marked up to what they last said: nothing more is asked");
  seePerson(who, read(true, ms(ago(5))));
  await settle();
  assert.deepEqual(marks.splice(0), [["p-open", true, iso(ms(ago(5)))]], "something newer, opened: marked again");
  assert.equal(unreadHere(who, read(true, ms(ago(5)))), false);
});

test("the tab's word lasts until a read carries its mark back: a person put back on another screen then reads unread here too", async () => {
  const who = { personId: "p-two-screens", conversationId: null };
  const heard = ms(ago(40));
  seePerson(who, read(true, heard));
  await settle();
  marks.splice(0);
  const mine = wire.stamp; // the stamp the door answered this tab's mark with
  assert.equal(unreadHere(who, read(true, heard, mine - 5000)), false, "a read made before the mark: the tab's word");
  // Their phone puts the person back: the same row, written again, with a later stamp and nothing new from the customer.
  assert.equal(
    unreadHere(who, read(true, heard, mine + 60_000)),
    true,
    "REGRESSION: the desk had opened them, so it kept drawing them read over the phone's Mark as unread, and a press sent nothing",
  );
  // And from there the tab holds nothing of its own: the next read is believed as it comes.
  assert.equal(unreadHere(who, read(false, heard, mine + 120_000)), false);
  assert.equal(unreadHere(who, read(true, heard, mine + 120_000)), true);
  // A read that carries exactly this tab's mark is the server's word too.
  seePerson(who, read(true, heard, mine + 120_000));
  await settle();
  assert.deepEqual(marks.splice(0), [["p-two-screens", true, iso(heard)]], "so opening it again marks it again");
  assert.equal(unreadHere(who, read(false, heard, wire.stamp)), false);
});

test("a mark that did not land is not the tab's word: the row says what the server says, and the next press makes it again", async () => {
  const who = { personId: "p-lost", conversationId: null };
  const heard = ms(ago(40));
  for (const lost of [
    () => answered(503, { ok: false, error: { code: "unavailable", message: "Try again." } }),
    () => Promise.reject(new TypeError("Failed to fetch")),
  ]) {
    wire.answer = lost;
    seePerson(who, read(true, heard));
    assert.equal(unreadHere(who, read(true, heard)), false, "read at once");
    await settle();
    await settle();
    assert.equal(
      unreadHere(who, read(true, heard)),
      true,
      "REGRESSION: a refused or lost request left the row read in this tab and unread everywhere else, and never tried again",
    );
    assert.equal(marks.splice(0).length, 1);
  }
  wire.answer = null;
  seePerson(who, read(true, heard));
  await settle();
  assert.deepEqual(marks.splice(0), [["p-lost", true, iso(heard)]], "pressed again: asked again");
  assert.equal(unreadHere(who, read(true, heard)), false);
});

test("a person never heard from is marked by the server's own clock, and a row with nobody behind it asks nothing", async () => {
  seePerson({ personId: "p-silent", conversationId: null }, read(true, 0));
  await settle();
  assert.deepEqual(marks.splice(0), [["p-silent", true, null]], "no moment of theirs to have seen up to");
  const nobody = { personId: null, conversationId: null };
  seePerson(nobody, read(true, ms(ago(5))));
  await settle();
  assert.deepEqual(marks.splice(0), []);
  assert.equal(unreadHere(nobody, read(false, 0)), false);
  assert.equal(unreadHere(nobody, read(true, 0)), true, "the read's word");
});

test("put back as unread: the row says so though the last read says read, until a read carries the mark or they are opened", async () => {
  const who = { personId: "p-back", conversationId: null };
  const heard = ms(ago(40));
  seePerson(who, read(true, heard));
  unseePerson("p-back");
  await settle();
  assert.deepEqual(marks.splice(0), [
    ["p-back", true, iso(heard)],
    ["p-back", false, null],
  ]);
  const back = wire.stamp;
  assert.equal(
    unreadHere(who, read(false, heard, back - 1000)),
    true,
    "the tab's own word, over a read made before it",
  );
  assert.equal(unreadHere(who, read(false, heard, back - 1000)), true, "and it holds: no clock lets it go");
  assert.equal(unreadHere(who, read(true, heard, back)), true, "the read caught up: the server's word from here");
  assert.equal(
    unreadHere(who, read(false, heard, back + 5000)),
    false,
    "so a later read that says read is believed (opened elsewhere)",
  );
  unseePerson("p-back");
  seePerson(who, read(true, heard));
  await settle();
  assert.deepEqual(marks.splice(0), [
    ["p-back", false, null],
    ["p-back", true, iso(heard)],
  ]);
  assert.equal(unreadHere(who, read(false, heard)), false, "opened again: read");
});

test("a thread's row: a seeded thread keeps the page's own flag; a real one is the reader's", async () => {
  assert.equal(threadUnread({ real: false, unread: true, clientId: "p-seed" }), true);
  const real = { real: true, unread: true, clientId: "p-real", conversationId: "c-real", heardAtMs: ms(ago(40)) };
  assert.deepEqual(threadWhose(real), { personId: "p-real", conversationId: "c-real" });
  assert.deepEqual(threadReading(real), { unseen: true, heardAtMs: ms(ago(40)), markAtMs: 0 });
  assert.equal(threadUnread(real), true);
  seePerson(threadWhose(real), threadReading(real));
  await settle();
  marks.splice(0);
  assert.equal(threadUnread(real), false);
});

test("the bell's half: a person with a note still unread in the bell says so on their row, and opening them reads the note", async () => {
  const noted = [];
  const hearers = [];
  const rows = [
    { id: "n:1", unread: true, about: { type: "conversation", id: "c-noted" }, actions: [{ to: "inbox/th-c-noted" }] },
    { id: "n:2", unread: true, about: { type: "contact", id: "p-noted" }, actions: [{ to: "clients" }] },
    { id: "n:3", unread: false, about: { type: "contact", id: "p-quiet" }, actions: [{ to: "clients" }] },
    { id: "n:4", unread: true, about: { type: "broadcast", id: "b-1" }, actions: [{ to: "broadcasts" }] },
  ];
  globalThis.window.__notifs = {
    feed: () => rows,
    read: (key) => {
      noted.push(key);
      rows.find((r) => r.id === key).unread = false;
      hearers.forEach((h) => h());
    },
    onChange: (cb) => {
      hearers.push(cb);
      return () => {};
    },
  };
  const heard = ms(ago(40));
  const quiet = read(false, heard);
  assert.equal(unreadHere({ personId: "p-x", conversationId: "c-noted" }, quiet), true, "by their conversation");
  assert.equal(unreadHere({ personId: "p-noted", conversationId: null }, quiet), true, "by the person");
  assert.equal(unreadHere({ personId: "p-quiet", conversationId: null }, quiet), false, "a note already read");
  assert.equal(unreadHere({ personId: "p-other", conversationId: "c-other" }, quiet), false);

  seePerson({ personId: "p-noted", conversationId: "c-noted" }, quiet);
  await settle();
  assert.deepEqual(noted.sort(), ["n:1", "n:2"], "both notes about them are read, and the broadcast's is left alone");
  assert.deepEqual(marks.splice(0), [["p-noted", true, iso(heard)]]);
  assert.equal(unreadHere({ personId: "p-noted", conversationId: "c-noted" }, quiet), false);

  // A note that arrives later about someone this tab has already read up to date is the note's alone.
  rows.push({ id: "n:5", unread: true, about: { type: "contact", id: "p-noted" }, actions: [{ to: "clients" }] });
  hearers.forEach((h) => h());
  assert.equal(unreadHere({ personId: "p-noted", conversationId: "c-noted" }, quiet), true);
  seePerson({ personId: "p-noted", conversationId: "c-noted" }, quiet);
  await settle();
  assert.deepEqual(noted.slice(-1), ["n:5"]);
  assert.deepEqual(marks.splice(0), [], "the person was already marked: only the note is read");
  delete globalThis.window.__notifs;
});

/* ---------------------------------- the rows ---------------------------------- */

const { cvCallsStandAsTheirThread, cvOnePerPerson, cvSeenOf, cvWhoseRow } = await import(
  `${S}/surfaces/inbox/cv-rules.ts`
);
const { PL_COLUMNS, PL_CARD, plNameCell, plReading } = await import(`${S}/surfaces/people/cells/columns.tsx`);
const walk = (n, fn) => {
  if (!n || typeof n !== "object") return;
  if (Array.isArray(n)) return void n.forEach((k) => walk(k, fn));
  fn(n);
  walk(n.props?.children, fn);
  // What the kit's row is handed as props is drawn by it: the name, and the said line it is given as a function.
  for (const key of ["name", "said"]) {
    const part = n.props?.[key];
    walk(typeof part === "function" ? part("list-row-said") : part, fn);
  }
};
const classesIn = (tree) => {
  const out = [];
  walk(tree, (n) => typeof n.props?.className === "string" && out.push(...n.props.className.split(/\s+/)));
  return out;
};

test("Conversations: a call is new to the reader as its thread is, and a person's one row is new when any row it stands for is", () => {
  const chat = {
    id: "c-1",
    who: "Rosa",
    clientId: "p-1",
    threadId: "th-c1",
    unseen: true,
    heardAtMs: 500,
    markAtMs: 450,
    ts: 400,
  };
  const calls = cvCallsStandAsTheirThread(
    [
      { id: "cv-1", who: "Rosa", clientId: "p-1", threadId: "th-c1", channel: "phone", ts: 500 },
      { id: "cv-2", who: "Withheld", clientId: null, threadId: null, channel: "phone", ts: 300 },
    ],
    [chat],
  );
  assert.deepEqual(
    [calls[0].unseen, calls[0].heardAtMs, calls[0].markAtMs],
    [true, 500, 450],
    "REGRESSION guard: a person who only phoned has no chat row, and their call's row must still say they are new",
  );
  assert.deepEqual(
    [calls[1].unseen, calls[1].heardAtMs],
    [undefined, undefined],
    "a call no thread holds says nothing",
  );

  const [rosa, withheld] = cvOnePerPerson([calls[0], { ...chat, unseen: false }, calls[1]]);
  assert.deepEqual(
    cvSeenOf(rosa),
    { unseen: true, heardAtMs: 500, markAtMs: 450 },
    "any part new, and the newest they were heard from",
  );
  assert.deepEqual(cvWhoseRow(rosa), { personId: "p-1", conversationId: "c1" });
  assert.deepEqual(cvSeenOf(withheld), { unseen: false, heardAtMs: 0, markAtMs: 0 });
  assert.deepEqual(cvWhoseRow(withheld), { personId: null, conversationId: null }, "nobody behind it: nobody to mark");
});

test("People's own row wears it, a desk's and a phone's; a read row and the Pipeline's use of the same cell wear nothing", () => {
  // Their words under the name, as the attention strip says them (the page's own map, by person).
  const said = { quoted: true, sentence: "Can I move my appointment?" };
  const ctx = { attention: { "p-new-row": said, "p-read-row": said }, onOpen() {} };
  const row = (over) =>
    toPersonRowVM(personRow({ id: over.id, latest_conversation_id: `c-${over.id}`, ...over }), ZONE, NOW);
  const fresh = row({ id: "p-new-row", seen_at: ago(60) });
  const seen = row({ id: "p-read-row", seen_at: ago(10) });
  const name = PL_COLUMNS.find((c) => c.key === "name");
  assert.ok(classesIn(name.cell(fresh, ctx)).includes("unread"), "the name cell says who is new");
  assert.ok(!classesIn(name.cell(seen, ctx)).includes("unread"));
  assert.ok(!classesIn(plNameCell(fresh, ctx)).includes("unread"), "the Pipeline's rows say nothing of it");

  const card = PL_CARD;
  const drawn = classesIn(card.cell(fresh, ctx));
  assert.ok(drawn.includes("pl-unread"), "a phone's card: the name");
  assert.ok(drawn.includes("pl-unread-said"), "and what they said");
  const plain = classesIn(card.cell(seen, ctx));
  assert.ok(!plain.includes("pl-unread") && !plain.includes("pl-unread-said"));

  // Opened here, the same row reads as read, though the row's own word (the last read's) has not moved.
  seePerson({ personId: fresh.id, conversationId: fresh.conversationId }, plReading(fresh));
  marks.splice(0);
  assert.ok(!classesIn(name.cell(fresh, ctx)).includes("unread"));
  assert.ok(!classesIn(card.cell(fresh, ctx)).includes("pl-unread"));
});

test("several at once, from a pick: one mark each, a row with nobody behind it asks nothing, and marking some read leaves the rest as they were put", async () => {
  const { seePeople, unseePeople } = await import(`${S}/surfaces/seen.ts`);
  const heard = ms(ago(40));
  const a = { personId: "p-many-a", conversationId: null };
  const b = { personId: "p-many-b", conversationId: null };
  marks.length = 0;
  unseePeople([a, b, { personId: null, conversationId: "c-nobodys" }]);
  await settle();
  assert.deepEqual(marks.splice(0), [
    ["p-many-a", false, null],
    ["p-many-b", false, null],
  ]);
  assert.equal(unreadHere(a, read(false, heard)), true);
  assert.equal(unreadHere(b, read(false, heard)), true);
  seePeople([{ who: a, reading: read(true, heard) }]);
  await settle();
  assert.deepEqual(marks.splice(0), [["p-many-a", true, iso(heard)]]);
  assert.equal(unreadHere(a, read(false, heard)), false, "marked read");
  assert.equal(unreadHere(b, read(false, heard)), true, "the other stays as it was put");
  // Opening one person still lets go of whoever was put back, as it always did.
  seePerson(b, read(true, heard));
  await settle();
  assert.equal(unreadHere(b, read(false, heard)), false);
  marks.length = 0;
});
