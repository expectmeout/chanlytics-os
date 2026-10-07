/**
 * Who is new to the reader (00346): one rule for the Inbox, Conversations and People.
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
      { contact_id: "p-opened", seen_at: ago(30), unread_at: null },
      { contact_id: "p-before-floor", seen_at: ago(900), unread_at: null },
      { contact_id: "p-put-back", seen_at: ago(30), unread_at: ago(5) },
      { contact_id: "p-never-opened", seen_at: null, unread_at: ago(5) },
    ],
  });
  assert.deepEqual(of("p-opened"), { seen_at: ago(30) }, "their own mark, later than the floor");
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
});

test("Conversations' row says the same of the same person", () => {
  const fresh = toConversationVM(conv({ seen_at: ago(60) }), null, ZONE, NOW);
  assert.deepEqual([fresh.unseen, fresh.heardAtMs], [true, ms(ago(40))]);
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
  assert.deepEqual([fresh.unseen, fresh.conversationId, fresh.threadId], [true, "c1", "th-c1"]);
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
const marks = [];
globalThis.window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const hit = /^\/api\/v1\/contacts\/([^/]+)\/seen$/.exec(u.pathname);
  if (hit && init.method === "PUT") marks.push([hit[1], JSON.parse(String(init.body)).seen]);
  return new Response(JSON.stringify({ ok: true, data: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const S = "../../../../../apps/dashboard/src";
const { seePerson, unseePerson, unreadHere, threadUnread, threadWhose } = await import(`${S}/surfaces/seen.ts`);
const settle = () => new Promise((r) => setImmediate(r));

test("a row says what the last read said until the tab does something: opening reads it at once and asks the server once", async () => {
  const who = { personId: "p-open", conversationId: "c-open" };
  const heard = ms(ago(40));
  assert.equal(unreadHere(who, true, heard), true, "the read's word");
  assert.equal(unreadHere(who, false, heard), false);
  seePerson(who, heard);
  await settle();
  assert.deepEqual(marks.splice(0), [["p-open", true]], "the mark goes out");
  assert.equal(unreadHere(who, true, heard), false, "read here, over a read that left before the mark landed");
  assert.equal(
    unreadHere(who, true, ms(ago(5))),
    true,
    "REGRESSION guard: what they wrote after the opening is new, whatever this device's clock says",
  );
  seePerson(who, heard);
  await settle();
  assert.deepEqual(marks.splice(0), [], "already marked up to what they last said: nothing more is asked");
  seePerson(who, ms(ago(5)));
  await settle();
  assert.deepEqual(marks.splice(0), [["p-open", true]], "something newer, opened: marked again");
  assert.equal(unreadHere(who, true, ms(ago(5))), false);
});

test("a row with nobody behind it is the read's word, and opening it asks nothing", async () => {
  const nobody = { personId: null, conversationId: null };
  seePerson(nobody, ms(ago(5)));
  await settle();
  assert.deepEqual(marks.splice(0), []);
  assert.equal(unreadHere(nobody, false, 0), false);
});

test("put back as unread: the row says so though the last read says read, until a read says it or they are opened", async () => {
  const who = { personId: "p-back", conversationId: null };
  const heard = ms(ago(40));
  seePerson(who, heard);
  unseePerson("p-back");
  await settle();
  assert.deepEqual(marks.splice(0), [
    ["p-back", true],
    ["p-back", false],
  ]);
  assert.equal(unreadHere(who, false, heard), true, "the tab's own word, before any read");
  assert.equal(unreadHere(who, false, heard), true, "and it holds: no clock lets it go");
  assert.equal(unreadHere(who, true, heard), true, "the read caught up: the server's word from here");
  assert.equal(unreadHere(who, false, heard), false, "so a later read that says read is believed (opened elsewhere)");
  unseePerson("p-back");
  seePerson(who, heard);
  await settle();
  assert.deepEqual(marks.splice(0), [
    ["p-back", false],
    ["p-back", true],
  ]);
  assert.equal(unreadHere(who, false, heard), false, "opened again: read");
});

test("a thread's row: a seeded thread keeps the page's own flag; a real one is the reader's", () => {
  assert.equal(threadUnread({ real: false, unread: true, clientId: "p-seed" }), true);
  const real = { real: true, unread: true, clientId: "p-real", conversationId: "c-real", heardAtMs: ms(ago(40)) };
  assert.deepEqual(threadWhose(real), { personId: "p-real", conversationId: "c-real" });
  assert.equal(threadUnread(real), true);
  seePerson(threadWhose(real), real.heardAtMs);
  marks.splice(0);
  assert.equal(threadUnread(real), false);
});

test("the bell's half: a person with a note still unread in the bell says so on their row, and opening them reads the note", async () => {
  const read = [];
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
      read.push(key);
      rows.find((r) => r.id === key).unread = false;
      hearers.forEach((h) => h());
    },
    onChange: (cb) => {
      hearers.push(cb);
      return () => {};
    },
  };
  const heard = ms(ago(40));
  assert.equal(unreadHere({ personId: "p-x", conversationId: "c-noted" }, false, heard), true, "by their conversation");
  assert.equal(unreadHere({ personId: "p-noted", conversationId: null }, false, heard), true, "by the person");
  assert.equal(unreadHere({ personId: "p-quiet", conversationId: null }, false, heard), false, "a note already read");
  assert.equal(unreadHere({ personId: "p-other", conversationId: "c-other" }, false, heard), false);

  seePerson({ personId: "p-noted", conversationId: "c-noted" }, heard);
  await settle();
  assert.deepEqual(read.sort(), ["n:1", "n:2"], "both notes about them are read, and the broadcast's is left alone");
  assert.deepEqual(marks.splice(0), [["p-noted", true]]);
  assert.equal(unreadHere({ personId: "p-noted", conversationId: "c-noted" }, false, heard), false);

  // A note that arrives later about someone this tab has already read up to date is the note's alone.
  rows.push({ id: "n:5", unread: true, about: { type: "contact", id: "p-noted" }, actions: [{ to: "clients" }] });
  hearers.forEach((h) => h());
  assert.equal(unreadHere({ personId: "p-noted", conversationId: "c-noted" }, false, heard), true);
  seePerson({ personId: "p-noted", conversationId: "c-noted" }, heard);
  await settle();
  assert.deepEqual(read.slice(-1), ["n:5"]);
  assert.deepEqual(marks.splice(0), [], "the person was already marked: only the note is read");
  delete globalThis.window.__notifs;
});

/* ---------------------------------- the rows ---------------------------------- */

const { cvCallsStandAsTheirThread, cvOnePerPerson, cvSeenOf, cvWhoseRow } = await import(
  `${S}/surfaces/inbox/cv-rules.ts`
);
const { PL_COLUMNS, PL_PHONE_COLUMNS, plNameCell } = await import(`${S}/surfaces/people/cells/columns.tsx`);
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
  const chat = { id: "c-1", who: "Rosa", clientId: "p-1", threadId: "th-c1", unseen: true, heardAtMs: 500, ts: 400 };
  const calls = cvCallsStandAsTheirThread(
    [
      { id: "cv-1", who: "Rosa", clientId: "p-1", threadId: "th-c1", channel: "phone", ts: 500 },
      { id: "cv-2", who: "Withheld", clientId: null, threadId: null, channel: "phone", ts: 300 },
    ],
    [chat],
  );
  assert.deepEqual(
    [calls[0].unseen, calls[0].heardAtMs],
    [true, 500],
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
    { unseen: true, heardAtMs: 500 },
    "any part new, and the newest they were heard from",
  );
  assert.deepEqual(cvWhoseRow(rosa), { personId: "p-1", conversationId: "c1" });
  assert.deepEqual(cvSeenOf(withheld), { unseen: false, heardAtMs: 0 });
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

  const card = PL_PHONE_COLUMNS[0];
  const drawn = classesIn(card.cell(fresh, ctx));
  assert.ok(drawn.includes("pl-unread"), "a phone's card: the name");
  assert.ok(drawn.includes("pl-unread-said"), "and what they said");
  const plain = classesIn(card.cell(seen, ctx));
  assert.ok(!plain.includes("pl-unread") && !plain.includes("pl-unread-said"));

  // Opened here, the same row reads as read, though the row's own word (the last read's) has not moved.
  seePerson({ personId: fresh.id, conversationId: fresh.conversationId }, fresh.askedMs);
  marks.splice(0);
  assert.ok(!classesIn(name.cell(fresh, ctx)).includes("unread"));
  assert.ok(!classesIn(card.cell(fresh, ctx)).includes("pl-unread"));
});
