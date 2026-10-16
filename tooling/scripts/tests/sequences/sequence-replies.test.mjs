/**
 * A sequence's replies in the Inbox (decision 0060; the canvas's History board: Replied is a door to the Inbox). Its
 * address, `inbox/from:<id>[:<period>]`, written and read by one pair (contracts sequenceRepliesRoute, sequenceRepliesOf);
 * the line the Inbox says over them; and the reader behind GET sequences/:id/replies, run over the database in memory:
 * the batches of History's period, a customer's reply by a run sheet's own rule (a person's words within the reply window
 * after the batch reached them) and a lead's as History counts one (a person's or the owner's reading, not undone).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SEQUENCE_REPLIES_WORDS as W, sequenceRepliesOf, sequenceRepliesRoute } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache, load, readerContext } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { sequenceReplies } = await import(at("apps/dashboard/src/server/readers/sequences.ts"));

beforeEach(() => readerCache.clear());

const SEQ = "11111111-1111-4111-8111-111111111111";
const TID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const H = 3_600_000;
const NOW = new Date("2026-10-16T16:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

test("its address: the sequence and History's period, written and read by one pair; any other param is none", () => {
  assert.equal(sequenceRepliesRoute(SEQ), `inbox/from:${SEQ}`, "30 days is the address's own");
  assert.equal(sequenceRepliesRoute(SEQ, "90"), `inbox/from:${SEQ}:90`);
  assert.deepEqual(sequenceRepliesOf(`from:${SEQ}`), { id: SEQ, period: "30" });
  assert.deepEqual(sequenceRepliesOf(`from:${SEQ.toUpperCase()}:all`), { id: SEQ, period: "all" });
  for (const other of [null, "", `th-${SEQ}`, "new", "from:not-an-id", `from:${SEQ}:7`])
    assert.equal(sequenceRepliesOf(other), null, String(other));
});

test("its line: whose replies and over which days, and how many are here when some are older than what the Inbox holds", () => {
  assert.equal(W.line("Win-back", "30", 12), "12 replies to Win-back, the last 30 days");
  assert.equal(W.line("Win-back", "all", 1), "1 reply to Win-back, since it began");
  assert.equal(W.line("Win-back", "90", 0), "Nobody wrote back to Win-back in the last 90 days");
  assert.equal(W.shown(12, 12), null, "all of them here: nothing more to say");
  assert.equal(W.shown(9, 12), "9 of them are here; the rest are older");
});

const msg = (conversation_id, ms, over = {}) => ({
  id: `m-${conversation_id}-${ms}`,
  tenant_id: TID,
  conversation_id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "words",
  meta: {},
  created_at: ago(ms),
  ...over,
});
const rec = (contact_id, sentMs) => ({
  broadcast_id: "b-customers",
  tenant_id: TID,
  contact_id,
  state: "sent",
  reason: null,
  sent_at: ago(sentMs),
  channel: "whatsapp",
  messages: { conversation_id: `cv-${contact_id}`, status: "delivered", meta: {} },
});

/** The sequence's History: one batch to customers and one to leads in the last 30 days, and one older than them. */
const batch = (id, ms) => ({
  id,
  state: "sent",
  run_for: null,
  at: ago(ms),
  scheduled_for: ago(ms),
  finished_at: ago(ms),
  people: 2,
  failure: null,
  place: 1,
  counts: {},
});
const RPCS = {
  sequence_overview: () => [{ id: SEQ, name: "Win-back" }],
  sequence_history: () => ({
    batches: [batch("b-customers", 5 * 24 * H), batch("b-leads", 6 * 24 * H), batch("b-old", 60 * 24 * H)],
    more: false,
  }),
};

const world = () => ({
  tenants: [{ id: TID, name: "Harbor Studio", timezone: "America/New_York" }],
  broadcast_recipients: [
    // Ana wrote back two hours after the batch reached her; Bo never did; Cy wrote back a week later, past the window.
    rec("ana", 5 * 24 * H),
    rec("bo", 5 * 24 * H),
    rec("cy", 5 * 24 * H),
  ],
  messages: [msg("cv-ana", 5 * 24 * H - 2 * H), msg("cv-cy", 5 * 24 * H - 7 * 24 * H)],
  reach_out_sends: [
    { id: "s-lead", tenant_id: TID, broadcast_id: "b-leads", lead_id: "l1", state: "sent" },
    { id: "s-away", tenant_id: TID, broadcast_id: "b-leads", lead_id: "l2", state: "sent" },
  ],
  reach_out_replies: [
    {
      message_id: "m-lead",
      tenant_id: TID,
      conversation_id: "cv-lead",
      send_id: "s-lead",
      claim: "person",
      undone_at: null,
    },
    {
      message_id: "m-away",
      tenant_id: TID,
      conversation_id: "cv-away",
      send_id: "s-away",
      claim: "auto_reply",
      undone_at: null,
    },
  ],
});

test("the reader: the period's batches, a customer's reply by the sheet's own rule and a lead's as History counts it", async () => {
  const supabase = fakeDb(world(), {}, RPCS, { missing: true });
  const rc = readerContext({ supabase, userId: "u1" }, { tenantId: TID, role: "operator", facts: {} }, NOW);
  const { data } = await load(rc, sequenceReplies, { id: SEQ, period: "30" });
  assert.deepEqual(
    { ...data, conversation_ids: [...data.conversation_ids].sort() },
    { sequence_id: SEQ, name: "Win-back", period: "30", conversation_ids: ["cv-ana", "cv-lead"] },
    "Bo never wrote, Cy wrote past the window, and an out-of-office is no lead's reply",
  );
});
