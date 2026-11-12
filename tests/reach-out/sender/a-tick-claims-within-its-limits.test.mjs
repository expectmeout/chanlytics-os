/**
 * What one tick of the reach-out sender may take (apps/edge/lib/campaigns/reach-out/sender/sender.ts claimAndWrite), run
 * over a database in memory that answers each claim with nothing and remembers what it was asked. The sender's limits
 * were named by no test (the review of 11 November 2026), and docs/capacity.md had read one of them as another's: the
 * drafts' cap as the mailboxes'. Here each limit is asked for where it is spent:
 *
 *   drafts      one claim a tick, for DRAFTS_PER_TICK, with the mailbox lane or without it.
 *   mailboxes   DUE_PAGES pages of DUE_MAILBOXES_PAGE, each past the mailboxes already done; each mailbox claims up to
 *               CLAIM_PER_MAILBOX_PER_TICK inside its day's share (mailboxDailyCap); a short page ends the read.
 *   the month   a claim never asks for more than the workspace's month has left (REACH_OUT_MONTH_EMAILS), and a
 *               workspace whose month is spent claims nothing and is counted once.
 *   the lane    no mailbox is read without the lane's seal; a mailbox resting or not connected claims nothing.
 *   the window  a tick past CLAIM_YIELD_AT_MS starts nothing.
 *   the turn    both lanes are written inside that one window, so they take turns at going first (draftsGoFirst): a
 *               morning of drafts that uses a window up leaves the next minute's to the mailboxes' emails.
 *
 * What a claim then writes is the database suites' (reach-out-sender.db.test.mjs).
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, fakeLog } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";

const { claimAndWrite } = await import(at("apps/edge/lib/campaigns/reach-out/sender/sender.ts"));
const { CLAIM_PER_MAILBOX_PER_TICK, CLAIM_YIELD_AT_MS, DRAFTS_PER_TICK, DUE_MAILBOXES_PAGE, DUE_PAGES } = await import(
  at("apps/edge/lib/campaigns/reach-out/sender/lanes.ts")
);
const { REACH_OUT_MONTH_EMAILS, mailboxDailyCap } = await import("@chanlytics/contracts");

const NOW = new Date("2026-11-11T15:00:00Z");
const tenant = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const mailbox = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** A mailbox's day as mailbox_capacity answers it: connected, past its ramp, nothing spent. */
const DAY = {
  state: "connected",
  used: 0,
  sent_days: 60,
  daily_cap: 40,
  customer_domain: false,
  resting_until: null,
  clean_since: null,
  recent: [],
  last_sent_at: null,
};
const LANE = { unsubscribeSecret: "a-seal-for-this-file", unsubscribeOrigin: "https://app.example.com" };

/** A platform with these mailboxes due ({ id, tenant_id }), every claim answering nothing, and what each was asked. */
function world({ mailboxes = [], monthSent = () => 0, dayOf = () => DAY, asTheDraftsAreClaimed = () => {} } = {}) {
  /** `lanes`: which lane asked the database first, then second. */
  const asked = { drafts: [], due: [], claims: [], lanes: [] };
  const lane = (name) => asked.lanes.includes(name) || asked.lanes.push(name);
  const tenants = [...new Set(mailboxes.map((m) => m.tenant_id))];
  const db = fakeDb(
    {
      tenants: tenants.map((id, i) => ({ id, name: `Harbor Moving Co ${i + 1}` })),
      // A configuration the schema takes whole (a brain's required words), with the address an email's foot owes.
      tenant_config: tenants.map((tenant_id) => ({
        tenant_id,
        config: {
          brain: {
            business_name: "Harbor Moving Co",
            system_prompt: "You answer for Harbor Moving Co, a moving company in Austin, Texas.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: { address: "100 Example St, Austin, TX 78701" },
          },
        },
      })),
      mailbox_connections: mailboxes.map((m) => ({ ...m, state: "connected" })),
      sequence_sends: [],
    },
    {},
    {
      sequence_claim_drafts: (args) => {
        lane("drafts");
        asked.drafts.push(args);
        asTheDraftsAreClaimed();
        return [];
      },
      // As the database answers it: the longest waiting first, past the workspaces and mailboxes the tick is done with.
      reach_out_due_mailboxes: (args) => {
        lane("mailboxes");
        asked.due.push(args);
        const done = new Set(args.p_skip_mailboxes);
        const held = new Set(args.p_skip_tenants);
        return mailboxes.filter((m) => !done.has(m.id) && !held.has(m.tenant_id)).slice(0, args.p_limit);
      },
      reach_out_month_sent: (args) => monthSent(args.p_tenant_id),
      mailbox_capacity: (args) => dayOf(args.p_mailbox_id),
      sequence_claim_from: (args) => (asked.claims.push(args), []),
    },
  );
  return { db, asked, log: fakeLog() };
}
const tick = (w, over = {}) =>
  claimAndWrite({ db: w.db, now: NOW, started: Date.now(), lane: LANE, log: w.log, ...over });
/** `n` mailboxes over `workspaces` workspaces, in the order they are due. */
const due = (n, workspaces = 7) =>
  Array.from({ length: n }, (_, i) => ({ id: mailbox(i), tenant_id: tenant(i % workspaces) }));

test("the drafts are claimed once a tick, for DRAFTS_PER_TICK, and without the lane's seal nothing else is", async () => {
  const w = world({ mailboxes: due(3) });
  const out = await tick(w, { lane: null });
  assert.deepEqual(
    w.asked.drafts.map((a) => [a.p_limit, a.p_at]),
    [[DRAFTS_PER_TICK, NOW.toISOString()]],
  );
  assert.deepEqual([w.asked.due.length, w.asked.claims.length], [0, 0], "no mailbox is read or claimed from");
  assert.deepEqual([out.claimed, out.errors], [0, 0], JSON.stringify(w.log.lines));

  const sealed = world();
  await tick(sealed);
  assert.deepEqual(
    sealed.asked.drafts.map((a) => a.p_limit),
    [DRAFTS_PER_TICK],
    "the same one claim beside the mailboxes",
  );
});

test("a tick reads DUE_PAGES pages of mailboxes, each past the ones done, and each mailbox claims its few inside its day", async () => {
  const most = DUE_PAGES * DUE_MAILBOXES_PAGE;
  const w = world({ mailboxes: due(most + 30) });
  const out = await tick(w);
  assert.deepEqual(
    [out.errors, out.workspaces_held, out.month_spent],
    [0, 0, 0],
    JSON.stringify(w.log.lines.slice(0, 3)),
  );
  assert.deepEqual(
    w.asked.due.map((a) => [a.p_limit, a.p_skip_mailboxes.length]),
    Array.from({ length: DUE_PAGES }, (_, page) => [DUE_MAILBOXES_PAGE, page * DUE_MAILBOXES_PAGE]),
    "a page at a time, past every mailbox already taken",
  );
  assert.equal(w.asked.claims.length, most, "the thirty past the last page wait for the next tick");
  assert.equal(new Set(w.asked.claims.map((a) => a.p_mailbox_id)).size, most, "no mailbox is claimed from twice");
  assert.deepEqual(
    [...new Set(w.asked.claims.map((a) => `${a.p_limit} within ${a.p_cap}`))],
    [`${CLAIM_PER_MAILBOX_PER_TICK} within ${mailboxDailyCap(DAY)}`],
    "each claim: the tick's few, inside the mailbox's share of a day",
  );
  assert.ok(most * CLAIM_PER_MAILBOX_PER_TICK > DRAFTS_PER_TICK, "the mailboxes' counts are not the drafts' cap");
});

test("a page that comes back short ends the tick's reads", async () => {
  const w = world({ mailboxes: due(DUE_MAILBOXES_PAGE + 10) });
  await tick(w);
  assert.equal(w.asked.due.length, 2);
  assert.equal(w.asked.claims.length, DUE_MAILBOXES_PAGE + 10);
});

test("a claim asks for no more than the month has left, and a workspace whose month is spent claims nothing", async () => {
  const [some, none] = [tenant(1), tenant(2)];
  const w = world({
    mailboxes: [
      { id: mailbox(0), tenant_id: some },
      { id: mailbox(1), tenant_id: some },
      { id: mailbox(2), tenant_id: none },
      { id: mailbox(3), tenant_id: none },
    ],
    monthSent: (id) => (id === some ? REACH_OUT_MONTH_EMAILS - 3 : REACH_OUT_MONTH_EMAILS),
  });
  const out = await tick(w);
  assert.deepEqual(
    w.asked.claims.map((a) => [a.p_mailbox_id, a.p_limit]),
    [
      [mailbox(0), 3],
      [mailbox(1), 3],
    ],
    "three left of the month: three asked for, and nothing of the workspace that spent its own",
  );
  assert.deepEqual([out.month_spent, out.errors], [1, 0], "the spent workspace is said once, not once a mailbox");
  assert.ok(w.log.events().includes("reach_out_month_spent"));
});

test("a mailbox that rests, or is not connected, claims nothing; the one beside it does", async () => {
  const later = new Date(NOW.getTime() + 3_600_000).toISOString();
  const days = {
    [mailbox(0)]: { ...DAY, resting_until: later },
    [mailbox(1)]: { ...DAY, state: "paused" },
    [mailbox(2)]: { ...DAY, resting_until: new Date(NOW.getTime() - 1000).toISOString() },
  };
  const w = world({ mailboxes: due(3, 1), dayOf: (id) => days[id] });
  const out = await tick(w);
  assert.deepEqual(
    w.asked.claims.map((a) => a.p_mailbox_id),
    [mailbox(2)],
    "a rest that has ended is no rest",
  );
  assert.equal(out.errors, 0);
});

test("the lanes take turns: the drafts first on an even minute, the mailboxes' emails first on an odd one", async () => {
  const odd = new Date(NOW.getTime() + 60_000);
  // An even minute to its last millisecond, the odd one after it, and the even one after that: a tick at each.
  const first = [];
  for (const now of [NOW, new Date(NOW.getTime() + 59_999), odd, new Date(odd.getTime() + 60_000)]) {
    const w = world({ mailboxes: due(2) });
    await tick(w, { now });
    first.push(w.asked.lanes[0]);
  }
  assert.deepEqual(first, ["drafts", "drafts", "mailboxes", "drafts"], "the minute's own number is the turn");
  const even = world({ mailboxes: due(2) });
  await tick(even);
  assert.deepEqual(even.asked.lanes, ["drafts", "mailboxes"]);
  const next = world({ mailboxes: due(2) });
  await tick(next, { now: odd });
  assert.deepEqual(next.asked.lanes, ["mailboxes", "drafts"]);
  assert.deepEqual(
    [next.asked.drafts.length, next.asked.claims.length],
    [even.asked.drafts.length, even.asked.claims.length],
    "the same work either way round",
  );
});

test("REGRESSION: drafts that use a tick's window up no longer keep the mailboxes' emails waiting: the next minute is theirs first", async () => {
  mock.timers.enable({ apis: ["Date"], now: NOW.getTime() });
  try {
    // A morning's drafts, all due at once: claiming and writing them takes the tick past its yield.
    const slow = () => mock.timers.tick(CLAIM_YIELD_AT_MS + 1);
    const w = world({ mailboxes: due(3), asTheDraftsAreClaimed: slow });
    await tick(w);
    assert.deepEqual(
      [w.asked.lanes, w.asked.claims.length],
      [["drafts"], 0],
      "an even minute: the drafts took the window",
    );
    // The minute after, the drafts as slow as before: the mailboxes are claimed from before the drafts are touched.
    const odd = new Date(Date.now() + 60_000 - CLAIM_YIELD_AT_MS - 1);
    mock.timers.setTime(odd.getTime());
    const out = await tick(w, { now: odd });
    assert.deepEqual(w.asked.lanes, ["drafts", "mailboxes"], "both lanes have now been reached");
    assert.equal(w.asked.claims.length, 3, "every due mailbox claimed in the odd minute, whatever the drafts held");
    assert.equal(w.asked.drafts.length, 2, "and the drafts asked for after them");
    assert.equal(out.errors, 0);
  } finally {
    mock.timers.reset();
  }
});

test("a tick past its yield starts nothing: no drafts, no mailbox", async () => {
  const w = world({ mailboxes: due(5) });
  const out = await tick(w, { started: Date.now() - CLAIM_YIELD_AT_MS - 1000 });
  assert.deepEqual([w.asked.drafts.length, w.asked.due.length, w.asked.claims.length], [0, 0, 0]);
  assert.deepEqual([out.claimed, out.written, out.errors], [0, 0, 0]);
});
