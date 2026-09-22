/**
 * One receptionist, one memory.
 *
 * The WhatsApp bot and the voice agent are meant to be the same receptionist —
 * a customer who phoned yesterday and texts today should not have to start
 * again. They were not. The bot read the conversation from Postgres while the
 * voice agent read a six-turn slice out of the BLOB mirror, a store we are
 * actively retiring. Same person, two accounts of them, one of them stale.
 *
 * These pin the unification: one reader, one set of rules for what counts as a
 * turn, and one description of who the person is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCode } from "./_source.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleHistory, describeLead } from "@chanlytics/db";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\r\n").join("\n");

const row = (over = {}) => ({
  body: "hello",
  sender: "customer",
  direction: "inbound",
  status: "received",
  created_at: "2026-08-29T10:00:00.000Z",
  channel_ts: null,
  meta: null,
  ...over,
});

/* ------------------------ what counts as a turn --------------------------- */

test("an outbound message that never LEFT is not something we said", () => {
  // A canceled or failed send was never seen by the customer. Feeding it to the
  // model as history makes it apologise for, or build on, words nobody read.
  for (const status of ["queued", "canceled", "failed"]) {
    assert.equal(assembleHistory([row({ direction: "outbound", sender: "ai", status })], 10).length, 0, status);
  }
  assert.equal(assembleHistory([row({ direction: "outbound", sender: "ai", status: "sent" })], 10).length, 1);
});

test("a blank body carries nothing to reason over", () => {
  assert.equal(assembleHistory([row({ body: "" }), row({ body: "   " }), row({ body: null })], 10).length, 0);
});

test("calls and messages interleave by when they HAPPENED", () => {
  // A call yesterday must sit before a message this morning, whatever order the
  // rows were written in — the backfill wrote calls hours after they occurred.
  const turns = assembleHistory(
    [
      row({ body: "texted this morning", created_at: "2026-08-29T09:00:00.000Z" }),
      row({
        body: "called yesterday",
        type: "call_summary",
        sender: "system",
        created_at: "2026-08-29T14:00:00.000Z",
        channel_ts: "2026-08-28T17:00:00.000Z",
      }),
    ],
    10,
  );
  assert.deepEqual(
    turns.map((t) => t.content),
    ["called yesterday", "texted this morning"],
  );
});

test("a call the customer made is the customer's history, not ours", () => {
  // sender 'system' on a call note maps to assistant — it is the receptionist's
  // record of the call, and the model should read it as its own note.
  const t = assembleHistory([row({ body: "Inbound call · 2 min", sender: "system" })], 10);
  assert.equal(t[0].role, "assistant");
});

test("the backfilled copy of a call loses to the native row", () => {
  // Both in would show the model each call twice, in two formats, and it would
  // reasonably conclude they phoned twice as often as they did.
  const turns = assembleHistory(
    [
      row({
        body: "[voice call note 2026-08-26T20:59] Caller phoned",
        sender: "ai",
        direction: "outbound",
        status: "sent",
        meta: { backfill: true },
      }),
      row({ body: "Inbound call · 1 min", sender: "system" }),
    ],
    10,
  );
  assert.equal(turns.length, 1);
  assert.match(turns[0].content, /Inbound call/);
});

test("the limit keeps the MOST RECENT turns", () => {
  const rows = Array.from({ length: 20 }, (_, i) =>
    row({ body: `m${i}`, created_at: `2026-08-29T10:${String(i).padStart(2, "0")}:00.000Z` }),
  );
  const turns = assembleHistory(rows, 5);
  assert.deepEqual(
    turns.map((t) => t.content),
    ["m15", "m16", "m17", "m18", "m19"],
  );
});

/* --------------------------- who the person is ---------------------------- */

const NOW = new Date("2026-08-29T12:00:00.000Z");

test("an unknown number is described as new, not as an anonymous blank", () => {
  // "New contact" is itself useful and honest for an agent to be told.
  assert.match(describeLead({ contactId: null, history: [] }, NOW), /New contact/);
});

test("a returning contact is named and dated", () => {
  const d = describeLead(
    {
      contactId: "c1",
      name: "Ana",
      returning: true,
      lastSeenAt: "2026-08-27T12:00:00.000Z",
      history: [{ role: "user", content: "hi" }],
      optedOut: false,
    },
    NOW,
  );
  assert.match(d, /Ana/);
  assert.match(d, /Returning/);
  assert.match(d, /2 days ago/);
});

test("a contact with no name is not given an invented one", () => {
  const d = describeLead(
    { contactId: "c1", name: null, returning: false, lastSeenAt: null, history: [], optedOut: false },
    NOW,
  );
  assert.match(d, /No name on record/);
  assert.match(d, /First time/);
});

test("an opted-out contact is flagged to both agents", () => {
  const d = describeLead(
    {
      contactId: "c1",
      name: "Ana",
      returning: true,
      lastSeenAt: null,
      history: [{ role: "user", content: "stop" }],
      optedOut: true,
    },
    NOW,
  );
  assert.match(d, /asked not to receive messages/);
});

/* ------------------------------ the wiring -------------------------------- */

const voice = read("apps/edge/lib/voice/call-start.ts");
const wa = read("packages/core/src/inbound/answer.ts");
// describeLead is a VALUE from the db package, which a core verb may not
// import, so the receptionist reaches the one description through a port. The
// edge is where the two are joined.
const waPorts = read("apps/edge/lib/whatsapp/ports.ts");
const brain = read("apps/edge/lib/receptionist/brain.ts");

test("REGRESSION: the voice agent no longer reads the Blob mirror", () => {
  assert.ok(!/getThread\(/.test(voice), "caller context must come from Postgres");
  assert.match(voice, /readLeadContext\(/);
});

test("both agents describe the lead with the same function", () => {
  assert.match(voice, /describeLead\(/);
  assert.match(wa, /ports\.leads\.describe\(/);
  assert.match(waPorts, /describe: describeLead/);
});

test("a failed lead lookup costs recognition, never the reply", () => {
  assert.match(wa, /lead_context_unavailable/);
});

test("the per-contact note does not evict the business profile from cache", () => {
  // The profile is identical for every customer and is cached; one line that
  // changes per contact would invalidate it on every new person.
  assert.match(brain, /cache_control: \{ type: "ephemeral" \} \},/);
  const sysBlock = brain.slice(brain.indexOf("system: ["), brain.indexOf("messages,"));
  assert.ok(!/leadNote[\s\S]*cache_control/.test(sysBlock), "the lead note must stay uncached");
});

test("the owner's notes ride with who the person is — as facts, with the rule never to recite them", () => {
  const d = describeLead(
    {
      contactId: "c1",
      name: "Maria Lopez",
      returning: true,
      lastSeenAt: null,
      history: [{ role: "user", content: "hi" }],
      optedOut: false,
      notes: "  Sees Sofia.\n Allergic to ammonia. ",
    },
    NOW,
  );
  assert.ok(
    d.includes(
      "Notes from the owner about them (use as facts, never read aloud or quoted): Sees Sofia. Allergic to ammonia.",
    ),
    d,
  );
  const none = describeLead(
    {
      contactId: "c1",
      name: "Maria Lopez",
      returning: true,
      lastSeenAt: null,
      history: [],
      optedOut: false,
      notes: "   ",
    },
    NOW,
  );
  assert.ok(!none.includes("Notes from the owner"), "blank notes say nothing");
  const src = readCode("packages/db/src/repositories/thread.ts");
  assert.ok(
    src.includes('.select("id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes")'),
    "read with the rest of who they are",
  );
});
