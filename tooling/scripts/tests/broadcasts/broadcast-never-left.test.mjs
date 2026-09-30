/**
 * A broadcast meets a WhatsApp it cannot reach (the scorecard of 29 September, new defect E:0), run end to end: the
 * real channels send (providerFetch, whose connection never opens: its "retryable", "provably did not leave"), the
 * real core door (deliver) and the real batch (sendBroadcastBatch), over the tests' database in memory. Kept from the
 * reviewer's probe (review3/E/probe-broadcast-never-left.mjs).
 *
 * Before: all four people were marked failed/send_failed, one call each, and the run finished telling the owner
 * "Broadcast sent". Now: the first person is given back, nobody after them is tried, nothing is written to their
 * threads, and the run waits; past its last wait it stops and says WhatsApp could not be reached.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const { deliver } = await importSrc("packages/core/src/deliver.ts");
const { whatsappSender } = await importSrc("packages/core/src/wire-senders.ts");
const { sendBroadcastBatch } = await importSrc("packages/core/src/messages/broadcast.ts");
const { resetBreakers } = await importSrc("packages/channels/src/provider-fetch.ts");
const { BROADCAST_THROTTLE_WAITS_MS, OUTCOME_UNKNOWN } = await import("@chanlytics/contracts");

const T = "t1";
const NOW = Date.parse("2026-09-29T15:00:00Z");
const PEOPLE = ["k1", "k2", "k3", "k4"];

let calls = 0;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = 0;
  resetBreakers();
  // The network: every connection refused before the request leaves.
  globalThis.fetch = async () => {
    calls += 1;
    throw Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED" },
    });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The run's ports over the database in memory, the real door and the real WhatsApp wire; the writes it made, logged. */
function world(tally = { sent: 0, held: 0 }) {
  const tables = {
    conversations: PEOPLE.map((k) => ({
      id: `c-${k}`,
      tenant_id: T,
      paused_until: null,
      contact_id: k,
      contacts: { consent: "opted_in", dnc: false, marketing_consent: "opted_in", erased_at: null },
      tenants: { status: "active" },
    })),
    messages: [],
    events: [],
  };
  const db = fakeDb(tables, {}, {});
  const wire = { whatsapp: whatsappSender({ phoneId: "p1", accessToken: "tok" }) };
  const marks = [];
  const log = [];
  const pages = [];
  const ports = {
    broadcast: async () => ({
      id: "b1",
      state: "sending",
      name: "Offer",
      template_name: "offer",
      template_language: "en_US",
      params: [],
      recipient_count: PEOPLE.length,
      playbook_id: null,
      audience: null,
    }),
    workspacePaused: async () => false,
    wireUnavailable: async () => null,
    template: async () => ({ meta_status: "approved", body_preview: "Hello.", category: "marketing" }),
    facts: async () => ({ businessName: "B", bookingLink: null, timezone: "UTC" }),
    batch: async () => PEOPLE.map((k) => ({ contact_id: k, facts: null })),
    contacts: async (ids) =>
      new Map(ids.map((id) => [id, { id, phone_e164: `+1555010${id.slice(1)}`, erased_at: null, display_name: "A" }])),
    alreadySent: async () => new Map(),
    target: async (phone) => ({ conversationId: `c-k${phone.slice(-1)}` }),
    mark: async (_b, k, patch) => {
      marks.push([k, patch.state, patch.reason ?? null]);
    },
    deliver: (d) => deliver({ db, wire, now: () => NOW }, d),
    remaining: async () => 3,
    state: async () => "sending",
    tally: async () => tally,
    finish: async (...a) => log.push(["finish", ...a]),
    fail: async (...a) => log.push(["fail", ...a]),
    alert: async (a) => log.push(["alert", a.subject, a.body]),
    scheduleNext: async (...a) => log.push(["scheduleNext", ...a]),
    page: async (key) => pages.push(key),
    startSending: async () => true,
    sleep: async () => {},
    now: () => NOW,
    random: () => 0,
  };
  return { ports, tables, marks, log, pages };
}

test("a WhatsApp nobody can connect to burns nobody: the first person is given back, the rest are never tried, and the run waits", async () => {
  const w = world();
  await sendBroadcastBatch(w.ports, { tenantId: T, broadcastId: "b1", deadline: NOW + 60_000 });
  assert.equal(calls, 1, "one request, and it never left: the people after it are not sent into the same outage");
  assert.deepEqual(
    w.marks,
    [
      ["k1", "failed", OUTCOME_UNKNOWN],
      ["k1", "queued", "not_taken"],
    ],
    "claimed before the wire, then given back: k2 to k4 are still queued, never claimed",
  );
  assert.deepEqual(w.tables.messages, [], "nothing is written to anyone's thread as failed: nothing left");
  assert.deepEqual(
    w.log,
    [["scheduleNext", "b1", new Date(NOW + BROADCAST_THROTTLE_WAITS_MS[0]), { waits: 1 }]],
    "the run waits its first wait: not finished, not failed, and nobody told it was sent",
  );
  assert.deepEqual(w.pages, ["unreachable:whatsapp"], "the platform hears it, once per window by the pager's quiet");
});

test("still unreachable past the last wait, the run stops and says WhatsApp could not be reached, never that it was sent", async () => {
  const w = world({ sent: 0, held: 0 });
  await sendBroadcastBatch(w.ports, {
    tenantId: T,
    broadcastId: "b1",
    deadline: NOW + 60_000,
    waits: BROADCAST_THROTTLE_WAITS_MS.length,
  });
  assert.equal(calls, 1);
  assert.deepEqual(
    w.log.map((l) => l.slice(0, 2)),
    [
      ["fail", "b1"],
      ["alert", "Broadcast “Offer” stopped"],
    ],
  );
  assert.equal(w.log[0][2], "wire_unavailable");
  assert.match(
    w.log[1][2],
    /^WhatsApp could not be reached for about an hour, so the rest was not sent\. Nobody got it\./,
  );
});
