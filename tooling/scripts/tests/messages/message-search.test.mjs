/**
 * What was said, found: the message search reader (Ask Rewired 4.5, readers/messages.ts) over search_messages (00219),
 * and inbox.search over the reader, run against the database in memory, whose search_messages answers from the
 * messages and calls a fixture holds in the function's own row shape (_fake-db.mjs).
 *
 * Proven here: the words the database is handed (trimmed, cut at 200 characters counted as characters, never halving
 * one), the window (30 days unless asked, 1 to 90, counted back from the turn's clock and never the machine's), the cap
 * (the caller's, held to the function's fifty); the three reads by the hits' ids, each one bounded read -- the people's
 * names, the messages' sender, status and kind, the calls' lines; a message named as the pages name its person, a call
 * as every call surface names it (callerName), a hit whose row the second read no longer answers left out; a message
 * cited as its thread and a call as the call, each opening where its page opens it; a read that fails failing. Then the
 * tool: who wrote a message and what became of it, as inbox.thread says them (a held, a canceled and a failed reply each
 * say so), a call's note as the call's note; more_available exact, and only the shown rows citable; and what an empty
 * answer says. That the function itself answers so on a real database is text-search.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { callerName, personName } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerContext, load } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { messageSearch } = await import(at("apps/dashboard/src/server/readers/messages.ts"));
const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const C3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const ROSA = "abababab-abab-4aba-8aba-abababababa1";
const SAM = "abababab-abab-4aba-8aba-abababababa2";
const MAIL = "abababab-abab-4aba-8aba-abababababa3";
const THEIRS = "abababab-abab-4aba-8aba-abababababa4";
const K1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const K2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const K3 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const DAY = 86_400_000;
const TZ = "America/New_York";
/** The turn's clock: a Monday at 10:00 in New York. The machine's is never read. */
const NOW = new Date("2026-09-14T14:00:00.000Z");
const ago = (days, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3_600_000).toISOString();

/** A person as contacts holds them: the name fields personName reads. */
const person = (id, over = {}) => ({
  id,
  tenant_id: A,
  display_name: null,
  wa_profile_name: null,
  phone_e164: null,
  email: null,
  erased_at: null,
  ...over,
});
/** A message as the intake and the send door write it (packages/db ingest.ts): its thread, its person, its wire. */
const message = (id, conversation_id, contact_id, body, created_at, over = {}) => ({
  id,
  tenant_id: A,
  conversation_id,
  contact_id,
  channel: "whatsapp",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at,
  channel_ts: created_at,
  ...over,
});
/** A reply the business wrote, as recordOutbound writes one: the receptionist's unless `sender` says the team's. */
const reply = (id, conversation_id, body, created_at, status, sender = "ai") =>
  message(id, conversation_id, ROSA, body, created_at, { direction: "outbound", sender, status });
/**
 * A call as ingestCall writes it (packages/db calls.ts): what the line showed beside its transcript. A call with a
 * person came from their number; one with nobody on file was withheld, or handed over something no number is (00007).
 */
const call = (id, contact_id, transcript, started_at, over = {}) => ({
  id,
  tenant_id: A,
  conversation_id: null,
  contact_id,
  direction: "inbound",
  status: "ended",
  from_e164: contact_id ? "+15555550101" : null,
  from_raw: null,
  started_at,
  created_at: started_at,
  transcript,
  ...over,
});

function world(tables, rpcs = {}, faults = {}) {
  const supabase = fakeDb({ messages: [], calls: [], contacts: [], ...tables }, faults, rpcs);
  const ctx = { supabase, userId: "u1", email: "ada@example.com", params: {} };
  const rc = readerContext(ctx, { tenantId: A, role: "viewer" }, NOW);
  return { supabase, rc, ctx };
}
const rpcs = (supabase) => supabase.seen.filter((q) => q.rpc);
const reads = (supabase, table) => supabase.seen.filter((q) => q.table === table);
const search = (words, over = {}) => ({ words, days: null, limit: 20, ...over });

test("the database is handed the words trimmed and cut at 200 characters, never halving one, the window counted back from the turn's clock (30 days unless asked, 1 to 90), and the caller's cap held to the function's fifty", async () => {
  const long = "parking ".repeat(40);
  // 199 letters and two characters outside the 16-bit range: the 200th is whole, never half of one Postgres refuses.
  const wide = `${"a".repeat(199)}😀😀`;
  const cases = [
    ["words trimmed, the window and the cap as asked", search("  parking  "), "parking", 30, 20],
    ["the words cut at 200 characters", search(long), long.slice(0, 200), 30, 20],
    ["a character past the 16-bit range is one character", search(wide), `${"a".repeat(199)}😀`, 30, 20],
    ["a week asked is a week", search("parking", { days: 7 }), "parking", 7, 20],
    ["a year asked is ninety days", search("parking", { days: 365 }), "parking", 90, 20],
    ["no day at all is one day", search("parking", { days: 0 }), "parking", 1, 20],
    ["days before now are one day", search("parking", { days: -4 }), "parking", 1, 20],
    ["a part of a day is the nearest day", search("parking", { days: 6.6 }), "parking", 7, 20],
    ["days that are no number are thirty", search("parking", { days: Number.NaN }), "parking", 30, 20],
    ["a cap past the function's is fifty", search("parking", { limit: 80 }), "parking", 30, 50],
    ["a cap of none is one", search("parking", { limit: 0 }), "parking", 30, 1],
  ];
  for (const [said, args, words, days, limit] of cases) {
    const { supabase, rc } = world({});
    const r = await load(rc, messageSearch, args);
    assert.deepEqual(
      rpcs(supabase).map((q) => q.args),
      [{ p_tenant: A, p_words: words, p_since: new Date(NOW.getTime() - days * DAY).toISOString(), p_limit: limit }],
      said,
    );
    assert.deepEqual([r.data.words, r.data.days], [words, days], `${said}: what was searched, said back`);
  }
  assert.ok(!/[\uD800-\uDBFF]$/.test(`${"a".repeat(199)}😀`), "the cut ends on a whole character");
});

test("each hit is named as the pages name it -- a message by its person (personName), a call as every call surface names it (callerName) -- from one bounded read each of the people, the messages and the calls; a message is cited as its thread (inbox/th-) and a call as the call (conversations/cv-); a thread two messages matched is one row", async () => {
  const { supabase, rc } = world({
    contacts: [
      person(ROSA, { display_name: "Rosa", wa_profile_name: "Rosa M", phone_e164: "+15555550101" }),
      person(SAM, { wa_profile_name: "Sam", phone_e164: "+15555550102" }),
      person(MAIL, { email: "lee@example.com" }),
      // Another workspace's person: the read keeps to this workspace, so they are nobody on file here.
      person(THEIRS, { tenant_id: B, display_name: "Not ours" }),
    ],
    messages: [
      message("m-1", C1, ROSA, "Is there parking behind the building?", ago(1)),
      reply("m-2", C1, "Yes, free parking after six.", ago(1, -1), "delivered"),
      message("m-3", C2, SAM, "Where do I park? Is parking free?", ago(3)),
      message("m-4", C3, MAIL, "Parking validation, please", ago(5), { channel: "email" }),
      message("m-5", C3, THEIRS, "parking", ago(6)),
      // Outside the window, and a word that is not the one asked: neither is found.
      message("m-6", C1, ROSA, "parking again", ago(40)),
      message("m-7", C2, SAM, "Where do I park?", ago(2)),
    ],
    calls: [
      call(K1, ROSA, "Agent: How can I help?\nUser: Do you have parking for a van?", ago(2)),
      // Nobody on file: withheld, and a line that handed over what no number is.
      call(K2, null, "User: Is the parking lot open late?", ago(4)),
      call(K3, null, "User: Where is the parking entrance?", ago(4, 1), { from_raw: "266696687" }),
    ],
  });
  const r = await load(rc, messageSearch, search("parking"));
  assert.deepEqual(
    r.data.hits.map((h) => [h.kind, h.id, h.who]),
    [
      ["message", "m-2", "Rosa"],
      ["message", "m-1", "Rosa"],
      ["call", K1, "Rosa"],
      ["message", "m-3", "Sam"],
      ["call", K2, "Caller ID withheld"],
      ["call", K3, "266696687"],
      ["message", "m-4", "lee@example.com"],
      ["message", "m-5", "Unknown"],
    ],
    "newest first; a WhatsApp name, an address and nobody on file as personName names them, a call as callerName does",
  );
  assert.equal(personName(null), "Unknown", "a message with nobody on file is what the Inbox calls them");
  assert.equal(callerName({ from_e164: null, from_raw: null, contact: null }), "Caller ID withheld");
  // Three bounded reads, one each, by the hits' own ids and this workspace.
  const [names] = reads(supabase, "contacts");
  const [sent] = reads(supabase, "messages");
  const [lines] = reads(supabase, "calls");
  assert.deepEqual(
    [reads(supabase, "contacts").length, reads(supabase, "messages").length, reads(supabase, "calls").length],
    [1, 1, 1],
    "the people, the messages and the calls, each read once for every hit",
  );
  assert.deepEqual(
    [names.columns, names.filters],
    [
      "id, display_name, wa_profile_name, phone_e164, email",
      [
        ["eq", "tenant_id", A],
        ["in", "id", [ROSA, SAM, MAIL, THEIRS]],
      ],
    ],
  );
  assert.deepEqual(
    [sent.columns, sent.filters],
    [
      "id, sender, status, type",
      [
        ["eq", "tenant_id", A],
        ["in", "id", ["m-2", "m-1", "m-3", "m-4", "m-5"]],
      ],
    ],
  );
  assert.deepEqual(
    [lines.columns, lines.filters],
    [
      "id, from_e164, from_raw",
      [
        ["eq", "tenant_id", A],
        ["in", "id", [K1, K2, K3]],
      ],
    ],
  );
  const customer = ["customer", "received", "text"];
  assert.deepEqual(
    r.data.hits.map((h) => h.sent && [h.sent.sender, h.sent.status, h.sent.type]),
    [["ai", "delivered", "text"], customer, null, customer, null, null, customer, customer],
    "a message carries who sent it and what became of it; a call carries none",
  );
  assert.deepEqual(
    r.data.hits.map((h) => h.ref),
    [
      { kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" },
      { kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" },
      { kind: "call", id: K1, route: `conversations/cv-${K1}`, label: "Rosa" },
      { kind: "thread", id: C2, route: `inbox/th-${C2}`, label: "Sam" },
      { kind: "call", id: K2, route: `conversations/cv-${K2}`, label: "Caller ID withheld" },
      { kind: "call", id: K3, route: `conversations/cv-${K3}`, label: "266696687" },
      { kind: "thread", id: C3, route: `inbox/th-${C3}`, label: "lee@example.com" },
      { kind: "thread", id: C3, route: `inbox/th-${C3}`, label: "Unknown" },
    ],
  );
  assert.deepEqual(
    r.rows.map((x) => [x.kind, x.id]),
    [
      ["thread", C1],
      ["call", K1],
      ["thread", C2],
      ["call", K2],
      ["call", K3],
      ["thread", C3],
    ],
    "the rows a citation may name, each once",
  );
  // The hit as the function answers it, and the words around the match.
  const k1 = r.data.hits.find((h) => h.id === K1);
  assert.deepEqual(
    { ...k1, who: undefined, sent: undefined, ref: undefined },
    {
      kind: "call",
      id: K1,
      conversationId: null,
      contactId: ROSA,
      channel: null,
      direction: "inbound",
      at: ago(2),
      snippet: "Agent: How can I help? User: Do you have parking for a van?",
      who: undefined,
      sent: undefined,
      ref: undefined,
    },
  );
});

test("a hit whose row the second read no longer answers (erased, or gone between the two reads) is left out; no person reads no names; words that find nothing read nothing more", async () => {
  // The function's own answer, as a real database spells it, for a message and a call that are gone by the next read.
  const gone = (kind, id) => ({
    kind,
    id,
    conversation_id: kind === "message" ? C1 : null,
    contact_id: null,
    channel: kind === "message" ? "whatsapp" : null,
    direction: "inbound",
    at: "2026-09-13 14:00:00+00",
    snippet: "parking",
  });
  const { supabase, rc } = world(
    { calls: [call(K2, null, "User: Is the parking lot open late?", ago(1))] },
    {
      search_messages: () => [
        gone("message", "m-gone"),
        { ...gone("call", K2), at: "2026-09-13 13:00:00+00" },
        gone("call", K3),
      ],
    },
  );
  const r = await load(rc, messageSearch, search("parking"));
  assert.deepEqual(
    r.data.hits.map((h) => [h.kind, h.id, h.who, h.ref.route]),
    [["call", K2, "Caller ID withheld", `conversations/cv-${K2}`]],
  );
  assert.deepEqual(reads(supabase, "contacts"), [], "no person, no read");
  for (const words of ["parking lot garage", "-parking", "valet or -parking", "   "]) {
    const w = world({ messages: [message("m-1", C1, ROSA, "parking lot", ago(1))] });
    const none = await load(w.rc, messageSearch, search(words));
    assert.deepEqual([none.data.hits, none.rows], [[], []], words);
    assert.deepEqual(
      w.supabase.seen.filter((q) => !q.rpc),
      [],
      `${words}: nothing found, nothing more read`,
    );
  }
});

test("a read that fails fails: a search the database refused, or names, senders or lines it could not read, is never 'nobody said it', 'Unknown' or a reply it did not know", async () => {
  const refused = world(
    {},
    {
      search_messages: () => {
        throw Object.assign(new Error("permission denied for function search_messages"), { code: "42501" });
      },
    },
  );
  await assert.rejects(load(refused.rc, messageSearch, search("parking")), /searchMessages: permission denied/);
  const held = {
    contacts: [person(ROSA)],
    messages: [message("m-1", C1, ROSA, "parking", ago(1))],
    calls: [call(K1, ROSA, "parking", ago(1))],
  };
  for (const [table, said] of [
    ["contacts", /namesOfPeople: canceling statement/],
    ["messages", /messageSenders: canceling statement/],
    ["calls", /callersOf: canceling statement/],
  ]) {
    const w = world(held, {}, { [`${table}.select`]: { message: "canceling statement due to statement timeout" } });
    await assert.rejects(load(w.rc, messageSearch, search("parking")), said, table);
  }
});

/* ------------------------------------------------------------- the tool */

const tool = (ctx, role = "viewer") => newToolContext(ctx, A, role, TZ, NOW);
const inbox = async (t, input) => JSON.parse((await runTool(t, { name: "inbox", input })).result);

test("inbox.search says who wrote a message and what became of it as inbox.thread says them: a held, a canceled and a failed reply each say so, never as what the customer was told; a call's note is the call's note", async () => {
  const { supabase, ctx } = world({
    contacts: [person(ROSA, { display_name: "Rosa" })],
    // The thread as loadConversation reads it (server/verbs.ts), so inbox.thread can say the same messages.
    conversations: [
      {
        id: C1,
        tenant_id: A,
        state: "open",
        paused_until: null,
        snooze_until: null,
        assignee_user_id: null,
        last_wa_inbound_at: ago(0, 5),
        last_message_at: ago(0, 1),
        contact_id: ROSA,
        contacts: {
          phone_e164: "+15555550101",
          display_name: "Rosa",
          wa_profile_name: null,
          consent: "opted_in",
          dnc: false,
          marketing_consent: null,
          email: null,
          email_suppressed_at: null,
        },
      },
    ],
    escalations: [],
    messages: [
      message("m-note", C1, ROSA, "Inbound call · 2 min — asked about parking", ago(0, 6), {
        channel: "voice",
        sender: "system",
        type: "call_summary",
      }),
      message("m-in", C1, ROSA, "Is there parking?", ago(0, 5)),
      reply("m-sent", C1, "Parking is behind the building.", ago(0, 4), "delivered"),
      // Held for a person: never sent.
      reply("m-held", C1, "Free parking after six.", ago(0, 3), "queued"),
      // The draft an owner rewrote because it was wrong: canceled before it was sent.
      reply("m-canceled", C1, "There is free parking on Sunday.", ago(0, 2), "canceled"),
      reply("m-failed", C1, "Your parking pass is attached.", ago(0, 1), "failed", "human"),
    ],
  });
  const t = tool(ctx);
  const found = await inbox(t, { action: "search", words: "parking" });
  assert.deepEqual(
    found.hits.map((h) => [h.snippet, h.from, h.status, h.channel]),
    [
      ["Your parking pass is attached.", "you", "failed", "WhatsApp"],
      ["There is free parking on Sunday.", "receptionist", "canceled", "WhatsApp"],
      ["Free parking after six.", "receptionist", "queued", "WhatsApp"],
      ["Parking is behind the building.", "receptionist", "delivered", "WhatsApp"],
      ["Is there parking?", "customer", "received", "WhatsApp"],
      ["Inbound call · 2 min — asked about parking", "call note", "received", "Phone"],
    ],
  );
  const [sent] = reads(supabase, "messages").filter((q) => q.columns === "id, sender, status, type");
  assert.deepEqual(
    sent.filters.at(-1),
    ["in", "id", ["m-failed", "m-canceled", "m-held", "m-sent", "m-in", "m-note"]],
    "one bounded read of the message hits",
  );
  // One spelling: the thread says each of them as the search does -- all but the call's note, which the thread files
  // as the customer's because it is recorded as inbound.
  const thread = await inbox(t, { action: "thread", conversation_id: C1 });
  for (const h of found.hits.filter((x) => x.from !== "call note")) {
    const m = thread.messages.find((x) => x.text === h.snippet);
    assert.deepEqual([h.from, h.status], [m.from, m.status], h.snippet);
  }
});

test("inbox.search's more_available is exact: one hit more than is shown is read, twenty are shown, and only the shown rows may be cited", async () => {
  const thread = (i) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`;
  for (const [n, more] of [
    [21, true],
    [20, false],
  ]) {
    const { supabase, ctx } = world({
      contacts: [person(ROSA, { display_name: "Rosa" })],
      messages: Array.from({ length: n }, (_, i) => message(`m-${i}`, thread(i), ROSA, "parking?", ago(0, i + 1))),
    });
    const t = tool(ctx);
    const found = await inbox(t, { action: "search", words: "parking" });
    assert.deepEqual(rpcs(supabase)[0].args.p_limit, 21, `${n}: one more than is shown is asked for`);
    assert.deepEqual([found.shown, found.hits.length, found.more_available], [20, 20, more], `${n} found`);
    assert.equal(t.read.thread.size, 20, `${n}: twenty rows may be cited`);
    assert.equal(t.read.thread.has(thread(20)), false, `${n}: never the one past the cap`);
  }
});

test("an empty answer says why: nothing holds the words (and park is not parking, so try the other form), or the words hold nothing to look for", async () => {
  const { ctx } = world({ messages: [message("m-1", C1, ROSA, "parking lot", ago(1))] });
  const t = tool(ctx);
  for (const [words, note] of [
    ["park", /^Nothing in the last 30 days holds these words\. .*park does not find parking, so try the other form/],
    ["parking garage", /^Nothing in the last 30 days holds these words\./],
    ['"lot parking"', /^Nothing in the last 30 days holds these words\./],
    ["-parking", /^These words hold nothing to look for/],
    ["valet or -parking", /^These words hold nothing to look for/],
    ['-"parking lot"', /^These words hold nothing to look for/],
    ["!!!", /^These words hold nothing to look for/],
  ]) {
    const none = await inbox(t, { action: "search", words });
    assert.deepEqual([none.shown, none.hits, none.more_available], [0, [], false], words);
    assert.match(none.note, note, words);
  }
  const week = await inbox(t, { action: "search", words: "garage", days: 1 });
  assert.match(week.note, /^Nothing in the last day holds these words\./, "one day is a day");
});
