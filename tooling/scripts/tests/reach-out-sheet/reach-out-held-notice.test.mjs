/**
 * The first-hold notice (Reach out, Part 4 PR 7, R20; apps/edge/lib/reach-out/held-notice.ts), run over the fake
 * database with the real notification door (ops/notify.ts notifyOnce) and a stubbed mail provider: a live run holding
 * sends its owner was not told of is told once, with its link; the mark on the run says sent only once the owner was
 * told; a mail that failed leaves no bell twin and is asked again when its claim goes stale, not before; a workspace
 * the mail cannot address has its bell row, which is the notice; a row that could not be kept sends no mail; and of
 * two ticks that read one run, one tells.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

const { noticeHeldRuns } = await import(at("apps/edge/lib/reach-out/held-notice.ts"));
/** held-notice.ts's CLAIM_STALE_MS: a claim that never went is asked again ten minutes on. */
const CLAIM_STALE_MS = 10 * 60_000;

const T = "11111111-1111-4111-8111-111111111111";
const DAY = 86_400_000;
const ago = (ms, from = Date.now()) => new Date(from - ms).toISOString();

/**
 * A run as the table holds it, whose updated_at moves on every write as moddatetime moves it (00046), so a claim onto
 * the row as it was read is the compare-and-set it is on the database.
 */
function runRow(over = {}) {
  let bump = 0;
  const row = { id: "run-1", tenant_id: T, name: "Reach out · Movers", state: "scheduled", updated_at: ago(DAY) };
  let audience = { kind: "reach_out", root_id: "root-1" };
  Object.defineProperty(row, "audience", {
    enumerable: true,
    get: () => audience,
    set: (v) => {
      audience = v;
      bump += 1;
      row.updated_at = new Date(Date.now() + bump).toISOString();
    },
  });
  return Object.assign(row, over);
}

function world({
  runs = [runRow()],
  held = 2,
  config = { escalation_emails: ["owner@harbor.example"], from: "alerts@harbor.example" },
} = {}) {
  const tables = {
    broadcasts: runs,
    reach_out_sends: Array.from({ length: held }, (_, i) => ({
      id: `send-${i}`,
      tenant_id: T,
      broadcast_id: "run-1",
      state: "held",
      reason: i === 0 ? "unbacked_fact" : "check_unavailable",
      updated_at: ago(60_000),
    })),
    tenant_config: config ? [{ tenant_id: T, config: { notifications: config } }] : [],
    tenant_channels: [],
    notifications: [],
    jobs: [],
  };
  return { tables, db: fakeDb(tables) };
}

/** Resend, stubbed: each mail recorded, answered as the test says. */
function provider(answers) {
  const mails = [];
  const was = globalThis.fetch;
  const key = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_key";
  globalThis.fetch = async (url, init) => {
    mails.push(JSON.parse(init.body));
    const status = answers.length > 1 ? answers.shift() : answers[0];
    return new Response(status === 200 ? "{}" : "down", { status });
  };
  const restore = () => {
    globalThis.fetch = was;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
  };
  return { mails, restore };
}

const tick = (w, now = new Date(), over = {}) => {
  const errors = [];
  return noticeHeldRuns({
    db: w.db,
    now,
    error: (event, fields, e) => errors.push({ event, fields, e }),
    ...over,
  }).then((told) => ({ told, errors }));
};

test("a live run holding sends is told once, through the real door, with its link and its holds' doors; marked sent", async () => {
  const w = world();
  const p = provider([200]);
  try {
    const one = await tick(w);
    assert.deepEqual([one.told, one.errors.length], [1, 0]);
    assert.equal(p.mails.length, 1);
    assert.deepEqual(p.mails[0].to, ["owner@harbor.example"]);
    assert.equal(p.mails[0].subject, "The check held 2 emails in Reach out · Movers");
    assert.equal(
      p.mails[0].text,
      "They wait for your say on the run in Broadcasts: rewrite the opening, include or skip. The rest of the run goes as planned.",
      "the doors their holds offer (holdDoors), nothing they do not",
    );
    assert.deepEqual(
      w.tables.notifications.map((n) => [n.kind, n.route, n.subject_type, n.subject_id]),
      [["playbook", "broadcasts/run:run-1", "broadcast", "run-1"]],
      "the bell's row, with the run's link",
    );
    assert.ok(w.tables.broadcasts[0].audience.held_notice.sent_at);
    assert.equal(w.tables.broadcasts[0].audience.root_id, "root-1", "the run's audience kept whole");
    const two = await tick(w, new Date(Date.now() + CLAIM_STALE_MS * 3));
    assert.deepEqual([two.told, p.mails.length, w.tables.notifications.length], [0, 1, 1], "once, however long after");
  } finally {
    p.restore();
  }
});

test("a mail that failed is not told: no bell twin kept, the claim kept, and asked again once it goes stale", async () => {
  const w = world();
  const p = provider([500, 200]);
  const now = Date.now();
  try {
    const failed = await tick(w, new Date(now));
    assert.deepEqual([failed.told, failed.errors.length], [0, 1]);
    assert.equal(failed.errors[0].fields.broadcast_id, "run-1");
    assert.equal(w.tables.notifications.length, 0, "the row goes with the mail that failed");
    const mark = w.tables.broadcasts[0].audience.held_notice;
    assert.ok(mark.claimed_at && !mark.sent_at, "claimed, never sent");
    const soon = await tick(w, new Date(now + 60_000));
    assert.deepEqual([soon.told, p.mails.length], [0, 1], "not asked again before its claim goes stale");
    const later = await tick(w, new Date(now + CLAIM_STALE_MS + 60_000));
    assert.deepEqual([later.told, p.mails.length, w.tables.notifications.length], [1, 2, 1]);
    assert.ok(w.tables.broadcasts[0].audience.held_notice.sent_at);
  } finally {
    p.restore();
  }
});

test("a workspace the mail cannot address is told by its bell row; a row that could not be kept sends no mail", async () => {
  const quiet = world({ config: null });
  const p = provider([200]);
  try {
    const out = await tick(quiet);
    assert.deepEqual([out.told, p.mails.length, quiet.tables.notifications.length], [1, 0, 1]);
    // The bell's row refused: nothing is mailed, and the run is asked again later.
    const w = world();
    w.db = fakeDb(w.tables, { "notifications.insert": { message: "down" } });
    const none = await tick(w);
    assert.deepEqual([none.told, p.mails.length], [0, 0]);
    assert.ok(!w.tables.broadcasts[0].audience.held_notice.sent_at);
  } finally {
    p.restore();
  }
});

test("of two ticks that read one run, one tells; a run waiting on its owner, or finished, is not told", async () => {
  const w = world({
    runs: [runRow(), runRow({ id: "run-2", state: "pending_approval" }), runRow({ id: "run-3", state: "sent" })],
  });
  for (const id of ["run-2", "run-3"])
    w.tables.reach_out_sends.push({
      id: `s-${id}`,
      tenant_id: T,
      broadcast_id: id,
      state: "held",
      reason: "language",
      updated_at: ago(60_000),
    });
  const told = [];
  const send = async (db, tenantId, msg) => (told.push(msg.about.id), true);
  const [a, b] = await Promise.all([tick(w, new Date(), { send }), tick(w, new Date(), { send })]);
  assert.equal(a.told + b.told, 1);
  assert.deepEqual(told, ["run-1"]);
});
