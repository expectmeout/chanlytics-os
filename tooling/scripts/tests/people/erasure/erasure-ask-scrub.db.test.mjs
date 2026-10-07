/**
 * An erased person leaves Ask: by their id, the ids of their conversations and calls, and their number and address
 * however a turn spells them, everywhere in the workspace; and by their name in the threads that are about them
 * (00238; the Ask Rewired Phase 5 plan, D13). The first test that runs scrub_ask_for_contact: 00040's was pinned by
 * reading its text, and it matched a person by digits and an address alone, case-sensitive, took every empty thread
 * in the workspace with it, and ran on anyone.
 *
 * Proved on a real Postgres with real sessions, the way leads/engine/lead-search-thread.db.test.mjs runs: an owner
 * and an operator of one workspace; a person being erased, with a conversation, a call and two identities; Ask
 * threads of both members, written as the Ask route writes them; the scrub called on the owner's session with the
 * needles the erasure route computes (erasureKeys); every outcome read back with the service role. Local stack only,
 * and it leaves nothing behind.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { v1FromAnswer } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const { erasureKeys } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/people/erasure.ts")).href
);

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and people"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
let A; // the workspace under test
let B; // another workspace
let owner; // A's owner, who erases
let operator; // A's operator, a teammate with threads of their own
const users = [];
const at = new Date().toISOString();

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const idOf = async (q) => ok(await q.select("id").single()).id;

async function memberClient(role, tenant) {
  const email = `ask-scrub-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

/* ------------------------------------------------------------ Ask rows, as the Ask route writes them */

/** A row the model cited: an item of the answer, with its source. */
const item = (kind, id, label, to) => ({
  title: label,
  meta: "",
  line: "",
  source: { kind, id, label, to, door: false },
});

/** An answer's row (app/api/v1/ask/route.ts): the Line's answer, the v1 fields it gives, and the turn's record. */
function answerRow(headline, items = [], extra = {}) {
  const answer = {
    v: 2,
    form: "structured",
    say: { headline, detail: "" },
    show: { figures: [], items, breakdown: null },
    do: { open: null, next: [] },
    language: "en",
  };
  return {
    v: 2,
    answer,
    ...v1FromAnswer(answer),
    proposals: [],
    language: "en",
    ungrounded: false,
    tools: ["people.search"],
    latency_ms: 1800,
    failed: false,
    model: "claude-opus-5-5",
    rounds: 2,
    shape: { v: 1, model: "claude-opus-5-5", effort: "medium", surface: "people", scope_kind: null, follow_up: false },
    ...extra,
  };
}

/** The turn as the model was sent it (5.3): `blocks` one JSON string, the page's rows among them. */
const rawTurn = (rows) => ({
  at: Date.now(),
  model: "claude-opus-5-5",
  prefix: "0".repeat(64),
  blocks: JSON.stringify({
    base: [],
    question: [
      ...rows.map(([id, name]) => ({
        type: "search_result",
        source: `person://${id}`,
        title: name,
        content: [{ type: "text", text: `${name} · last wrote 2 days ago` }],
        citations: { enabled: true },
      })),
      { type: "text", text: "Who wrote today?" },
    ],
    rounds: [],
    final: [{ type: "text", text: "One person wrote." }],
    results: [],
  }),
});

const threadOf = (who, fields = {}, tenant = A) =>
  idOf(db.from("ask_threads").insert({ tenant_id: tenant, user_id: who.userId, title: "", ...fields }));
const say = (thread, who, role, content, tenant = A) =>
  idOf(db.from("ask_messages").insert({ thread_id: thread, tenant_id: tenant, user_id: who.userId, role, content }));
const ask = (thread, who, text) => say(thread, who, "user", { text });

const messageOf = async (id) => ok(await db.from("ask_messages").select("id, content").eq("id", id).maybeSingle());
const thread = async (id) => ok(await db.from("ask_threads").select("id, title, scope").eq("id", id).maybeSingle());
const everything = async () => {
  const threads = ok(await db.from("ask_threads").select("id, title, scope").in("tenant_id", [A, B]).order("id"));
  const messages = ok(await db.from("ask_messages").select("id, content").in("tenant_id", [A, B]).order("id"));
  return JSON.stringify({ threads, messages });
};

/* ------------------------------------------------------------ the world */

let ROSA; // Rosa Díaz, being erased: WhatsApp "Rosi", on the phone "Rosie"
let CONV; // her conversation
let CALL; // her call
let PEREZ; // Rosa Pérez, another customer, not erased
let LIVE; // a person nobody is erasing
let JR; // J.R. (Ro), being erased: a name full of regex metacharacters
let ELSEWHERE; // a person being erased in another workspace
const T = {}; // the threads
const M = {}; // the messages

// Her identities as the route reads them: the WhatsApp wa_id, and an address whose digit is an identifier of one
// character ("2", as the finished jobs have always been matched by), which the floor keeps from matching every turn.
const rosa = erasureKeys({ phone_e164: "+15550100123", email: "rosa.diaz@example.com" }, [
  "15550100123",
  "rosa2@example.com",
]);
const scrub = (who, contact, needles, tenant = A) =>
  who.client.rpc("scrub_ask_for_contact", { p_tenant_id: tenant, p_contact_id: contact, p_needles: needles });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await idOf(db.from("tenants").insert({ slug: `ask-scrub-${Date.now()}`, name: "Ask scrub" }));
  B = await idOf(db.from("tenants").insert({ slug: `ask-scrub-other-${Date.now()}`, name: "Other" }));
  owner = await memberClient("owner", A);
  operator = await memberClient("operator", A);

  // Being erased: the route has run beginErasure, and step 2 scrubs while her rows still exist.
  ROSA = await idOf(
    db.from("contacts").insert({
      tenant_id: A,
      phone_e164: "+15550100123",
      display_name: "Rosa Díaz",
      wa_profile_name: "Rosi",
      email: "rosa.diaz@example.com",
      erasing_since: at,
    }),
  );
  ok(
    await db.from("contact_identities").insert([
      { tenant_id: A, contact_id: ROSA, channel: "whatsapp", external_id: "15550100123" },
      { tenant_id: A, contact_id: ROSA, channel: "email", external_id: "rosa2@example.com" },
    ]),
  );
  CONV = await idOf(db.from("conversations").insert({ tenant_id: A, contact_id: ROSA }));
  CALL = await idOf(
    db.from("calls").insert({
      tenant_id: A,
      retell_call_id: `ask-scrub-${Date.now()}`,
      contact_id: ROSA,
      conversation_id: CONV,
      caller_name: "Rosie",
    }),
  );
  PEREZ = await idOf(
    db.from("contacts").insert({ tenant_id: A, phone_e164: "+15550100145", display_name: "Rosa Pérez" }),
  );
  LIVE = await idOf(
    db.from("contacts").insert({ tenant_id: A, phone_e164: "+15550100167", display_name: "Lena Live" }),
  );
  // A word of whose name is also a key every answer row has (a citation's `label`): a key is never a word of a turn.
  // And a WhatsApp name of two letters, under the three a name needs.
  JR = await idOf(
    db
      .from("contacts")
      .insert({ tenant_id: A, display_name: "J.R. (Ro) Label", wa_profile_name: "JR", erasing_since: at }),
  );
  ELSEWHERE = await idOf(
    db
      .from("contacts")
      .insert({ tenant_id: B, phone_e164: "+15550100189", display_name: "Rosa Díaz", erasing_since: at }),
  );

  // (1) A teammate's thread about her by name, whose answer cites her.
  T.teammate = await threadOf(operator, { title: "What did Rosa want?" });
  M.byName = await ask(T.teammate, operator, "What did Rosa want?");
  M.citesHer = await say(
    T.teammate,
    operator,
    "assistant",
    answerRow("She asked to move Thursday.", [item("person", ROSA, "Rosa Díaz", `clients/${ROSA}`)]),
  );
  // (2) Her number as the pages write it and as a person types it; her address in capitals.
  T.number = await threadOf(owner, { title: "Who is +1 (555) 010-0123?" });
  M.formatted = await ask(T.number, owner, "Who is +1 (555) 010-0123?");
  M.national = await say(T.number, owner, "assistant", answerRow("(555) 010-0123 has booked twice."));
  // Her address in capitals, in a thread nothing else makes hers: the words are read lower-cased.
  T.address = await threadOf(owner, { title: "The times?" });
  M.times = await ask(T.address, owner, "The times?");
  M.address = await ask(T.address, owner, "Email them to ROSA.DIAZ@EXAMPLE.COM");
  // (3) Citations of her conversation (inbox/th-) and her call (conversations/cv-).
  T.citations = await threadOf(owner, { title: "Anything waiting?" });
  M.waiting = await ask(T.citations, owner, "Anything waiting?");
  M.thread = await say(
    T.citations,
    owner,
    "assistant",
    answerRow("One thread waits.", [item("thread", CONV, "Thursday", `inbox/th-${CONV}`)]),
  );
  M.call = await say(
    T.citations,
    owner,
    "assistant",
    answerRow("One call came in.", [item("call", CALL, "A call", `conversations/cv-${CALL}`)]),
  );
  // (4) Scoped to her and titled by her name: the turns that name nobody stay, the raw goes, and so do the title and scope.
  T.scoped = await threadOf(owner, {
    title: "Rosa's booking",
    scope: { kind: "person", id: ROSA, label: "Rosa Díaz" },
  });
  M.weekAfter = await ask(T.scoped, owner, "And the week after?");
  M.open = await say(T.scoped, owner, "assistant", answerRow("The week after is open.", [], { raw: rawTurn([]) }));
  // A failed turn keeps a raw of null (5.3): nothing to strip, and not counted.
  M.failed = await say(T.scoped, owner, "assistant", answerRow("That did not work.", [], { failed: true, raw: null }));
  // (5) The same first name, another customer: nothing of it is hers.
  T.perez = await threadOf(owner, {
    title: "Rosa Pérez's week",
    scope: { kind: "person", id: PEREZ, label: "Rosa Pérez" },
  });
  M.perezAsked = await ask(T.perez, owner, "What did Rosa ask?");
  M.perezAnswer = await say(
    T.perez,
    owner,
    "assistant",
    answerRow("Rosa asked for Tuesday.", [item("person", PEREZ, "Rosa Pérez", `clients/${PEREZ}`)]),
  );
  // (6) Someone else's answer whose raw carries the page's rows, hers among them.
  T.rawOnly = await threadOf(operator, { title: "Who wrote today?" });
  M.rawQuestion = await ask(T.rawOnly, operator, "Who wrote today?");
  M.rawAnswer = await say(
    T.rawOnly,
    operator,
    "assistant",
    answerRow("Rosa Pérez wrote.", [item("person", PEREZ, "Rosa Pérez", `clients/${PEREZ}`)], {
      raw: rawTurn([
        [ROSA, "Rosa Díaz"],
        [PEREZ, "Rosa Pérez"],
      ]),
    }),
  );
  // (7) Her name in any case, as a whole word, in a thread that is hers.
  T.cases = await threadOf(operator, { title: "Thursday" });
  M.casesCite = await say(
    T.cases,
    operator,
    "assistant",
    answerRow("Rosa Díaz booked.", [item("person", ROSA, "Rosa Díaz", `clients/${ROSA}`)]),
  );
  M.upper = await ask(T.cases, operator, "ROSA CALLED AGAIN");
  M.possessive = await ask(T.cases, operator, "Was that rosa's second visit?");
  M.surname = await ask(T.cases, operator, "Tell DÍAZ we moved it");
  M.whatsapp = await ask(T.cases, operator, "Rosi wrote on WhatsApp");
  M.caller = await ask(T.cases, operator, "Rosie called at noon");
  // After a line break: the JSON text spells it `\nRosa`, a word boundary the string value keeps.
  M.newline = await ask(T.cases, operator, "Thursday:\nRosa again");
  M.rosalinda = await ask(T.cases, operator, "Rosalinda wants Friday");
  // Hers by its title alone (a thread keeps its first question as its title; that question was scrubbed before).
  T.titled = await threadOf(owner, { title: "Text 555-010-0123 back" });
  M.when = await ask(T.titled, owner, "When?");
  // (8) A name full of regex metacharacters, in a thread that is theirs.
  T.jr = await threadOf(owner, { title: "Cuts" });
  M.jrCite = await say(
    T.jr,
    owner,
    "assistant",
    answerRow("They booked.", [item("person", JR, "J.R. (Ro)", `clients/${JR}`)]),
  );
  M.jrNamed = await ask(T.jr, owner, "J.R. (Ro) booked a cut");
  M.jrLiteral = await ask(T.jr, owner, "JxRx (Rox) is someone else");
  M.jrShort = await ask(T.jr, owner, "Ask JR about it");
  M.jrOther = await say(
    T.jr,
    owner,
    "assistant",
    answerRow("Someone else booked.", [item("person", PEREZ, "Rosa Pérez", `clients/${PEREZ}`)]),
  );
  // (11) A thread just made, its first message not saved yet.
  T.empty = await threadOf(operator);
  // Another workspace's thread naming her id: never this workspace's scrub's to touch.
  T.other = await threadOf(owner, { title: "Rosa" }, B);
  M.other = await say(
    T.other,
    owner,
    "assistant",
    answerRow("Rosa Díaz.", [item("person", ROSA, "Rosa Díaz", `clients/${ROSA}`)]),
    B,
  );
});

after(async () => {
  if (skip) return;
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/* ------------------------------------------------------------ the doors */

test("an operator is refused, and nothing changes", { skip }, async () => {
  const before = await everything();
  const r = await scrub(operator, ROSA, rosa.needles);
  assert.match(r.error?.message ?? "", /owner role required/);
  assert.equal(await everything(), before);
});

test("a person nobody is erasing is refused, and so is one of another workspace", { skip }, async () => {
  const before = await everything();
  const live = await scrub(owner, LIVE, ["15550100167"]);
  assert.equal(live.error?.code, "55000", JSON.stringify(live.error));
  assert.match(live.error.message, /only a person being erased/);
  const theirs = await scrub(owner, ELSEWHERE, ["15550100189"]);
  assert.equal(theirs.error?.code, "55000", "being erased, but not in this workspace");
  const notOwner = await scrub(owner, ELSEWHERE, ["15550100189"], B);
  assert.match(notOwner.error?.message ?? "", /owner role required/);
  assert.equal(await everything(), before);
});

/* ------------------------------------------------------------ the scrub */

test(
  "the owner's scrub takes her from Ask: by id, number and address everywhere, by name in her threads",
  { skip },
  async () => {
    assert.ok(
      rosa.needles.includes("+1 (555) 010-0123") && rosa.needles.includes("(555) 010-0123"),
      "the route's needles",
    );
    assert.ok(rosa.needles.includes("2"), "and a one-character identifier among them");
    const n = ok(await scrub(owner, ROSA, rosa.needles));

    // (1) The teammate's thread: the answer citing her, the question naming her, and the thread left empty.
    assert.equal(await messageOf(M.citesHer), null, "(1) an answer citing her id");
    assert.equal(await messageOf(M.byName), null, "(1) a teammate's question naming her, in a thread that is hers");
    assert.equal(await thread(T.teammate), null, "(1) the thread left empty");
    // (2) The number as the pages write it and as a person types it, and the address in any case.
    for (const id of [M.formatted, M.national]) assert.equal(await messageOf(id), null, `(2) ${id}`);
    assert.equal(await thread(T.number), null, "(2) left empty");
    assert.equal(await messageOf(M.address), null, "(2) her address, in capitals");
    assert.equal((await messageOf(M.times)).content.text, "The times?", "(2) what names nobody stays");
    assert.deepEqual(await thread(T.address), { id: T.address, title: "", scope: null }, "(2) and the thread is hers");
    // (3) A citation of her conversation and one of her call.
    assert.equal(await messageOf(M.thread), null, "(3) inbox/th-<conversation>");
    assert.equal(await messageOf(M.call), null, "(3) conversations/cv-<call>");
    assert.ok(await messageOf(M.waiting), "(3) a question naming nobody stays");
    assert.deepEqual(await thread(T.citations), { id: T.citations, title: "", scope: null }, "(3) hers: no title");
    // (4) Scoped to her: what names nobody stays, without its raw; the title and the scope go.
    assert.equal((await messageOf(M.weekAfter)).content.text, "And the week after?", "(4) kept");
    const open = await messageOf(M.open);
    assert.ok(open && !("raw" in open.content), "(4) no raw survives in her threads");
    assert.equal(open.content.text, "The week after is open.", "(4) the words stay");
    assert.deepEqual(await thread(T.scoped), { id: T.scoped, title: "", scope: null }, "(4) title and scope cleared");
    assert.equal((await messageOf(M.failed)).content.raw, null, "(4) a failed turn's null raw is left, uncounted");
    // (5) Rosa Pérez stays: her rows, her title, her scope.
    assert.equal((await messageOf(M.perezAsked)).content.text, "What did Rosa ask?", "(5)");
    assert.equal((await messageOf(M.perezAnswer)).content.text, "Rosa asked for Tuesday.", "(5)");
    assert.deepEqual(
      await thread(T.perez),
      { id: T.perez, title: "Rosa Pérez's week", scope: { kind: "person", id: PEREZ, label: "Rosa Pérez" } },
      "(5) another customer's thread is not hers",
    );
    // (6) A raw alone: the answer keeps its words and loses the raw; the thread is not hers.
    const rawAnswer = await messageOf(M.rawAnswer);
    assert.ok(rawAnswer && !("raw" in rawAnswer.content), "(6) the raw is stripped");
    assert.equal(rawAnswer.content.text, "Rosa Pérez wrote.", "(6) the turn stays");
    assert.ok(await messageOf(M.rawQuestion), "(6) the question stays");
    assert.equal((await thread(T.rawOnly)).title, "Who wrote today?", "(6) the title stays");
    // (7) Any case, whole words, her WhatsApp name: they go; a longer name that begins with hers stays.
    for (const [id, what] of [
      [M.casesCite, "the citation"],
      [M.upper, "ROSA"],
      [M.possessive, "rosa's"],
      [M.surname, "DÍAZ"],
      [M.whatsapp, "Rosi"],
      [M.caller, "the name a caller gave"],
      [M.newline, "a name after a line break"],
    ])
      assert.equal(await messageOf(id), null, `(7) ${what}`);
    assert.equal((await messageOf(M.rosalinda)).content.text, "Rosalinda wants Friday", "(7) Rosalinda stays");
    // A thread hers by its title alone keeps what names nobody, and loses the title.
    assert.equal((await messageOf(M.when)).content.text, "When?");
    assert.deepEqual(await thread(T.titled), { id: T.titled, title: "", scope: null }, "a title quoting her number");
    // (8) Someone else's thread, untouched by her scrub.
    assert.ok(await messageOf(M.jrNamed), "(8) not hers");
    // (11) A thread just made, whoever's, is not swept.
    assert.ok(await thread(T.empty), "(11) an unrelated empty thread survives");
    // Another workspace is never this one's scrub's to touch.
    assert.ok(await messageOf(M.other), "workspace B untouched");
    // Messages deleted (2 + 3 + 2 + 7) and raws stripped (4 and 6).
    assert.equal(n, 16, "messages deleted plus raws stripped");
  },
);

test("a second run finds nothing", { skip }, async () => {
  const before = await everything();
  assert.equal(ok(await scrub(owner, ROSA, rosa.needles)), 0);
  assert.equal(await everything(), before);
});

test("a name with regex metacharacters raises nothing and matches only itself", { skip }, async () => {
  const n = ok(await scrub(owner, JR, erasureKeys({ phone_e164: null, email: null }, []).needles));
  assert.equal(await messageOf(M.jrCite), null, "the answer citing them");
  assert.equal(await messageOf(M.jrNamed), null, "J.R. (Ro), literally");
  assert.equal(
    (await messageOf(M.jrLiteral)).content.text,
    "JxRx (Rox) is someone else",
    "the dots and brackets are literal",
  );
  assert.equal((await messageOf(M.jrShort)).content.text, "Ask JR about it", "a name of two letters is no needle");
  assert.equal((await messageOf(M.jrOther)).content.text, "Someone else booked.", "a key is not a word of the turn");
  assert.equal(n, 2);
});
