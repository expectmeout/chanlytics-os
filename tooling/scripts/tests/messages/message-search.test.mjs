/**
 * What was said, found: the message search reader (Ask Rewired 4.5, readers/messages.ts) over search_messages (00219),
 * run against the database in memory, whose search_messages answers from the messages and calls a fixture holds in the
 * function's own row shape (_fake-db.mjs).
 *
 * Proven here: the words the database is handed (trimmed, cut at 200 characters), the window (30 days unless asked, 1
 * to 90, counted back from the turn's clock and never the machine's), the cap (the caller's, held to the function's
 * fifty); each hit named as the pages name its person, the names read once for every hit, a hit with no person (or one
 * the member cannot read) named as the Inbox names a thread with nobody on file; a message cited as its thread and a
 * call as the call, each opening where its page opens it; and a read that fails failing. That the function itself
 * answers so on a real database is text-search.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { personName } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerContext, load } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { messageSearch } = await import(at("apps/dashboard/src/server/readers/messages.ts"));

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
const DAY = 86_400_000;
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
  status: "received",
  created_at,
  ...over,
});
/** A call as ingestCall writes it (packages/db calls.ts): its transcript beside who and when. */
const call = (id, contact_id, transcript, started_at, over = {}) => ({
  id,
  tenant_id: A,
  conversation_id: null,
  contact_id,
  direction: "inbound",
  status: "ended",
  started_at,
  created_at: started_at,
  transcript,
  ...over,
});

function world(tables) {
  const supabase = fakeDb({ messages: [], calls: [], contacts: [], ...tables });
  const rc = readerContext(
    { supabase, userId: "u1", email: "ada@example.com", params: {} },
    { tenantId: A, role: "viewer" },
    NOW,
  );
  return { supabase, rc };
}
const rpcs = (supabase) => supabase.seen.filter((q) => q.rpc);
const nameReads = (supabase) => supabase.seen.filter((q) => q.table === "contacts");

test("the database is handed the words trimmed and cut at 200 characters, the window counted back from the turn's clock (30 days unless asked, 1 to 90), and the caller's cap held to the function's fifty", async () => {
  const long = "parking ".repeat(40);
  const cases = [
    [
      "words trimmed, the window and the cap as asked",
      { words: "  parking  ", days: null, limit: 20 },
      "parking",
      30,
      20,
    ],
    ["the words cut at 200 characters", { words: long, days: null, limit: 20 }, long.slice(0, 200), 30, 20],
    ["a week asked is a week", { words: "parking", days: 7, limit: 20 }, "parking", 7, 20],
    ["a year asked is ninety days", { words: "parking", days: 365, limit: 20 }, "parking", 90, 20],
    ["no day at all is one day", { words: "parking", days: 0, limit: 20 }, "parking", 1, 20],
    ["days before now are one day", { words: "parking", days: -4, limit: 20 }, "parking", 1, 20],
    ["a part of a day is the nearest day", { words: "parking", days: 6.6, limit: 20 }, "parking", 7, 20],
    ["days that are no number are thirty", { words: "parking", days: Number.NaN, limit: 20 }, "parking", 30, 20],
    ["a cap past the function's is fifty", { words: "parking", days: null, limit: 80 }, "parking", 30, 50],
    ["a cap of none is one", { words: "parking", days: null, limit: 0 }, "parking", 30, 1],
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
});

test("each hit is named as the pages name its person, from one read of every hit's person; a message is cited as its thread (inbox/th-) and a call as the call (conversations/cv-); a thread two messages matched is one row", async () => {
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
      message("m-2", C1, ROSA, "Yes, free parking after six.", ago(1, -1), { direction: "outbound", sender: "ai" }),
      message("m-3", C2, SAM, "Where do I park? Is parking free?", ago(3)),
      message("m-4", C3, MAIL, "Parking validation, please", ago(5), { channel: "email" }),
      message("m-5", C3, THEIRS, "parking", ago(6)),
      // Outside the window, and a word that is not the one asked: neither is found.
      message("m-6", C1, ROSA, "parking again", ago(40)),
      message("m-7", C2, SAM, "Where do I park?", ago(2)),
    ],
    calls: [
      call(K1, ROSA, "Agent: How can I help?\nUser: Do you have parking for a van?", ago(2)),
      call(K2, null, "User: Is the parking lot open late?", ago(4)),
    ],
  });
  const r = await load(rc, messageSearch, { words: "parking", days: null, limit: 20 });
  assert.deepEqual(
    r.data.hits.map((h) => [h.kind, h.id, h.who]),
    [
      ["message", "m-2", "Rosa"],
      ["message", "m-1", "Rosa"],
      ["call", K1, "Rosa"],
      ["message", "m-3", "Sam"],
      ["call", K2, "Unknown"],
      ["message", "m-4", "lee@example.com"],
      ["message", "m-5", "Unknown"],
    ],
    "newest first; a WhatsApp name, an address and nobody on file each named as personName names them",
  );
  assert.equal(personName(null), "Unknown", "nobody on file is what the Inbox calls them");
  const reads = nameReads(supabase);
  assert.equal(reads.length, 1, "the names are read once, for every hit");
  assert.deepEqual(reads[0].filters, [
    ["eq", "tenant_id", A],
    ["in", "id", [ROSA, SAM, MAIL, THEIRS]],
  ]);
  assert.equal(reads[0].columns, "id, display_name, wa_profile_name, phone_e164, email");
  assert.deepEqual(
    r.data.hits.map((h) => h.ref),
    [
      { kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" },
      { kind: "thread", id: C1, route: `inbox/th-${C1}`, label: "Rosa" },
      { kind: "call", id: K1, route: `conversations/cv-${K1}`, label: "Rosa" },
      { kind: "thread", id: C2, route: `inbox/th-${C2}`, label: "Sam" },
      { kind: "call", id: K2, route: `conversations/cv-${K2}`, label: "Unknown" },
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
      ["thread", C3],
    ],
    "the rows a citation may name, each once",
  );
  // The hit as the function answers it, and the words around the match.
  const k1 = r.data.hits.find((h) => h.id === K1);
  assert.deepEqual(
    { ...k1, who: undefined, ref: undefined },
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
      ref: undefined,
    },
  );
});

test("hits with nobody on file read no names; words that find nothing read none either, and only leaving things out finds nothing", async () => {
  const { supabase, rc } = world({
    calls: [call(K2, null, "User: Is the parking lot open late?", ago(1))],
    messages: [message("m-1", C1, ROSA, "See you Saturday", ago(1))],
  });
  const r = await load(rc, messageSearch, { words: "parking", days: null, limit: 20 });
  assert.deepEqual(
    r.data.hits.map((h) => [h.kind, h.who, h.ref.route]),
    [["call", "Unknown", `conversations/cv-${K2}`]],
  );
  assert.deepEqual(nameReads(supabase), [], "no person, no read");
  for (const words of ["parking lot garage", "-parking", "valet or -parking", "   "]) {
    const w = world({ messages: [message("m-1", C1, ROSA, "parking lot", ago(1))] });
    const none = await load(w.rc, messageSearch, { words, days: null, limit: 20 });
    assert.deepEqual([none.data.hits, none.rows], [[], []], words);
    assert.deepEqual(nameReads(w.supabase), [], `${words}: nothing found, no names read`);
  }
});

test("a read that fails fails: a search the database refused, or names it could not read, is never 'nobody said it' or 'Unknown'", async () => {
  const refused = fakeDb(
    {},
    {},
    {
      search_messages: () => {
        throw Object.assign(new Error("permission denied for function search_messages"), { code: "42501" });
      },
    },
  );
  const rc1 = readerContext({ supabase: refused, userId: "u1", params: {} }, { tenantId: A, role: "viewer" }, NOW);
  await assert.rejects(
    load(rc1, messageSearch, { words: "parking", days: null, limit: 20 }),
    /searchMessages: permission denied/,
  );
  const names = fakeDb(
    { messages: [message("m-1", C1, ROSA, "parking", ago(1))], calls: [], contacts: [person(ROSA)] },
    { "contacts.select": { message: "canceling statement due to statement timeout" } },
  );
  const rc2 = readerContext({ supabase: names, userId: "u1", params: {} }, { tenantId: A, role: "viewer" }, NOW);
  await assert.rejects(
    load(rc2, messageSearch, { words: "parking", days: null, limit: 20 }),
    /namesOfPeople: canceling statement/,
  );
});
