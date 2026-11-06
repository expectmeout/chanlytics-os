/**
 * Whoever a press of Delete… has handed the ledger has left the lists, not only People (5 Nov 2026: 192 people left
 * People at the press, and the Inbox went on losing threads in batches for the minute the ledger took; a press of 5,000
 * is about twenty-five minutes of that). The Inbox, Conversations, Today and Ask read their threads, holds and calls
 * through these readers, so the rule is theirs. A thread named by its id still reads, as a person's own page does, and an
 * erasure that stopped shows again a day on, to be pressed again (00547). What PostgREST itself answers is
 * the-inbox-reads-each-thread-s-newest.db.test.mjs; these run the real readers over a database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { conversations } = await import(at("apps/dashboard/src/server/readers/conversations.ts"));
const { escalations } = await import(at("apps/dashboard/src/server/readers/escalations.ts"));
const { calls } = await import(at("apps/dashboard/src/server/readers/calls.ts"));
const { inbox } = await import(at("apps/dashboard/src/server/readers/inbox.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const person = (id, erasing_since = null) => ({
  id,
  display_name: id,
  wa_profile_name: null,
  phone_e164: null,
  email: `${id}@example.com`,
  consent: "unknown",
  dnc: false,
  marketing_consent: null,
  proposal_url: null,
  email_suppressed_at: null,
  email_suppressed_reason: null,
  erasing_since,
});
const here = person("here");
const going = person("going", ago(HOUR));
const stopped = person("stopped", ago(25 * HOUR));

const thread = (id, who, over = {}) => ({
  id,
  tenant_id: A,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: null,
  last_message_at: ago(HOUR),
  contact_id: who.id,
  contacts: who,
  ...over,
});
const hold = (id, conversation_id, who, over = {}) => ({
  id,
  tenant_id: A,
  conversation_id,
  reason: "manual",
  details: null,
  state: "open",
  created_at: ago(HOUR),
  conversations: { contacts: who },
  ...over,
});
const call = (id, who, over = {}) => ({
  id,
  tenant_id: A,
  retell_call_id: `r-${id}`,
  direction: "inbound",
  status: "ended",
  started_at: ago(HOUR),
  transcript_object: null,
  recording: null,
  analysis: null,
  conversation_id: null,
  contact_id: who?.id ?? null,
  contacts: who,
  ...over,
});
const world = (tables, rpcs = {}) => ({
  supabase: fakeDb({ conversations: [], messages: [], escalations: [], calls: [], ...tables }, {}, rpcs),
  userId: "u1",
  email: "ada@example.com",
  params: {},
});
const turn = (ctx) => kernel.readerContext(ctx, { tenantId: A, role: "viewer" });
const threadIds = (r) => r.data.conversations.map((c) => c.id);

const threeThreads = [
  thread("c-here", here),
  thread("c-going", going),
  thread("c-stopped", stopped, { last_message_at: ago(2 * HOUR) }),
];

test("REGRESSION: the Inbox's list leaves out whoever is being erased, from the press, and shows a stopped erasure a day on (5 Nov 2026: threads left in batches as the ledger reached them)", async () => {
  const ctx = world({ conversations: threeThreads });
  assert.deepEqual(threadIds(await kernel.load(turn(ctx), conversations, { ids: null })), ["c-here", "c-stopped"]);
});

test("the list is cut after who is going has left it: a press of the newest hundred does not leave older threads out", async () => {
  const newest = Array.from({ length: 100 }, (_, i) => thread(`c-${i}`, going, { last_message_at: ago(i * 1000) }));
  const ctx = world({ conversations: [...newest, thread("c-older", here, { last_message_at: ago(48 * HOUR) })] });
  assert.deepEqual(threadIds(await kernel.load(turn(ctx), conversations, { ids: null })), ["c-older"]);
});

test("a thread named by its id still reads: a link, or a page open on it, is one record, not a list", async () => {
  const ctx = world({ conversations: threeThreads });
  assert.deepEqual(threadIds(await kernel.load(turn(ctx), conversations, { ids: ["c-going"] })), ["c-going"]);
});

test("what a search finds of them is left out too", async () => {
  const hit = (conversation_id) => ({ kind: "message", id: `m-${conversation_id}`, conversation_id, at: ago(HOUR) });
  const ctx = world({ conversations: threeThreads }, { search_messages: () => [hit("c-going"), hit("c-here")] });
  assert.deepEqual(threadIds(await kernel.load(turn(ctx), conversations, { ids: null, said: "pitch" })), ["c-here"]);
});

test("a hold of someone being erased no longer waits on anyone, and its row carries nothing of how it was found", async () => {
  const ctx = world({
    conversations: threeThreads,
    escalations: [
      hold("e-here", "c-here", here),
      hold("e-going", "c-going", going),
      hold("e-stopped", "c-stopped", stopped),
      hold("e-going-stop", "c-going", going, { reason: "opt_out" }),
    ],
  });
  const { data } = await kernel.load(turn(ctx), escalations, { state: "open" });
  assert.deepEqual(data.escalations.map((e) => e.id).sort(), ["e-here", "e-stopped"]);
  for (const e of data.escalations) assert.ok(!("conversations" in e), "the answer's shape is as it was");
});

test("a hold does not bring back the thread of someone being erased, past the newest hundred", async () => {
  const ctx = world({
    conversations: [thread("c-going", going)],
    escalations: [hold("e-going", "c-going", going)],
  });
  const { data } = await kernel.load(turn(ctx), inbox, undefined);
  assert.deepEqual(data.conversations, [], "the Inbox reads no thread for a hold that has left");
  assert.deepEqual(data.escalations, []);
});

test("the calls' list leaves out whoever is being erased, keeps a call with no person, and a thread's own calls still read", async () => {
  const conv = { conversation_id: "c-going" };
  const ctx = world({
    calls: [call("k-here", here), call("k-going", going, conv), call("k-stopped", stopped), call("k-nobody", null)],
  });
  const listed = await kernel.load(turn(ctx), calls, {});
  assert.deepEqual(listed.data.calls.map((c) => c.id).sort(), ["k-here", "k-nobody", "k-stopped"]);
  for (const c of listed.data.calls) assert.ok(!JSON.stringify(c).includes("erasing_since"), "nothing new on the wire");
  const own = await kernel.load(turn(ctx), calls, { conversationId: "c-going" });
  assert.deepEqual(
    own.data.calls.map((c) => c.id),
    ["k-going"],
  );
  const named = await kernel.load(turn(ctx), calls, { ids: ["k-going"] });
  assert.deepEqual(
    named.data.calls.map((c) => c.id),
    ["k-going"],
  );
});
