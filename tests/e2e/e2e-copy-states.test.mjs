/**
 * What only a copy may hold (tooling/scripts/e2e-harness/copy-states.mjs): a run waiting for an OK and emails handed to
 * their owner, the states the specs read that production's sweeps would act on, so the seed never writes them. Run here
 * over the seed's own workspace in memory, and read by the rules the pages read them by. e2e-workspace.test.mjs holds the
 * seed (it is at its length), and workflow-rules.test.mjs which job runs which.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, isReachOutRun, runDraftedEmails, runWaitsOnYou, waitRowsOf } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { converge, LEADS, verify } from "../../tooling/scripts/ops/e2e-workspace.mjs";
import { HANDED_OVER, WAITING_RUN, isACopy, writeCopyStates } from "../../tooling/scripts/e2e-harness/copy-states.mjs";

const NOW = Date.parse("2026-09-14T09:00:00Z");
/** What the sequence readers ask a run's day by: the business's day, and the day an OK now would send it. */
const DAYS = { today: "2026-09-14", sendsOn: "2026-09-14", say: "America/New_York" };

/** The seed's workspace in memory, with what converge asks of a database beside its tables. */
function seeded() {
  const t = { tenants: [], memberships: [], lead_platform: [{ id: true, searches_on: false, tenants_on: [] }] };
  const users = [];
  const rows = (name) => (t[name] ??= []);
  const db = fakeDb(
    t,
    {},
    {
      provision_tenant: ({ p_tenant_id }) => {
        if (!rows("tenant_config").some((r) => r.tenant_id === p_tenant_id))
          rows("tenant_config").push({ tenant_id: p_tenant_id, config: {}, version: 1 });
        if (!rows("billing_accounts").some((r) => r.tenant_id === p_tenant_id))
          rows("billing_accounts").push({ tenant_id: p_tenant_id, mode: "stripe", status: "none" });
        return null;
      },
      get_google_credentials: () => null,
    },
  );
  db.auth = {
    admin: {
      listUsers: async ({ page }) => ({ data: { users: page === 1 ? users.map((u) => ({ ...u })) : [] }, error: null }),
      createUser: async ({ email }) => {
        const user = { id: crypto.randomUUID(), email };
        users.push(user);
        return { data: { user }, error: null };
      },
    },
  };
  return { db, t };
}

const night = (w, over = {}) =>
  converge(w.db, {
    ownerEmail: "e2e-owner@example.com",
    memberEmail: "e2e-member@example.com",
    apply: true,
    now: NOW,
    ...over,
  });

/** The runs as the pages read them: their state, their day and how many emails each has handed over (withHeld). */
function runsOf(t, T) {
  return (t.sequence_batches ?? [])
    .filter((b) => b.tenant_id === T)
    .map((b) => ({
      ...b,
      playbook_id: b.step_id ?? null,
      drafted: isReachOutRun(b.audience)
        ? (t.sequence_sends ?? []).filter((s) => s.batch_id === b.id && s.state === "drafted").length
        : null,
    }));
}

test("it writes the runner's own stack and refuses every other address", () => {
  for (const own of ["http://127.0.0.1:54321", "http://localhost:54321"]) assert.equal(isACopy(own), true, own);
  for (const other of ["https://abc.supabase.co", "https://127.0.0.1.example.com", "https://app.chanlytics.com"])
    assert.equal(isACopy(other), false, other);
});

test("the pages read one run waiting for an OK, and To send's one row of two runs handing an email each", async () => {
  const w = seeded();
  const { tenantId: T } = await night(w);
  await writeCopyStates(w.db, { now: NOW });
  const runs = runsOf(w.t, T);
  const waiting = runs.filter((r) => runWaitsOnYou(r, DAYS));
  assert.deepEqual(
    waiting.map((r) => [r.state, runDraftedEmails(r)]).sort(),
    [
      ["pending_approval", 0],
      ["sending", 1],
      ["sending", 1],
    ],
    "three runs wait on the owner, and the sent one does not",
  );
  const rows = waitRowsOf(waiting);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["to_send", "run"],
    "the two fold into To send's row, as brief-to-send draws it, and the one waiting for an OK is a row of its own",
  );
  assert.deepEqual([rows[0].count, rows[0].from], [2, 1], "two emails, from the one reach-out");
  assert.equal(rows[1].run.name, WAITING_RUN);
});

test("a run waiting for an OK never runs out of day: a spec may read it at any hour of the night", async () => {
  const w = seeded();
  const { tenantId: T } = await night(w);
  await writeCopyStates(w.db, { now: NOW });
  const run = runsOf(w.t, T).find((r) => r.name === WAITING_RUN);
  assert.equal(run.run_for, null, "a one-off, with no day of its own");
  assert.equal(run.playbook_id, null);
  const later = { today: "2026-09-16", sendsOn: "2026-09-16", say: DAYS.say };
  assert.equal(runWaitsOnYou(run, later), true);
  assert.equal(run.scheduled_for, new Date(NOW + DAY_MS).toISOString());
  const people = w.t.sequence_sends.filter((s) => s.batch_id === run.id);
  assert.deepEqual(
    people.map((s) => s.state),
    ["queued", "queued", "queued"],
    "its people are the seed's three, none sent to",
  );
  assert.equal(run.recipient_count, people.length);
});

test("an email handed over is whole as 00429 holds one, to the seed's own fictional lead, and nothing has left", async () => {
  const w = seeded();
  const { tenantId: T } = await night(w);
  await writeCopyStates(w.db, { now: NOW });
  const drafted = w.t.sequence_sends.filter((s) => s.state === "drafted");
  assert.equal(drafted.length, HANDED_OVER.leads.length);
  const addresses = LEADS.filter((l) => HANDED_OVER.leads.includes(l.place_id)).map((l) => l.email);
  for (const s of drafted) {
    assert.ok(s.drafted_at, "sequence_sends_drafted_is_whole: dated");
    assert.deepEqual(Object.keys(s.draft).sort(), ["body", "subject", "text", "to"], "as the sender writes one");
    assert.ok(addresses.includes(s.draft.to), `${s.draft.to} is a seeded lead's`);
    assert.match(s.draft.to, /\.example$/, "an address that reaches nobody");
    assert.equal(s.message_id ?? null, null, "and no message was written for it");
  }
  assert.equal((w.t.jobs ?? []).filter((j) => j.tenant_id === T).length, 0, "no job for anything to carry");
  const [root, nudge] = w.t.sequence_steps.filter((s) => s.template_name === HANDED_OVER.template);
  assert.deepEqual([root.owner_sends, nudge.owner_sends ?? false], [true, false], "only a first step's to say");
  assert.equal(nudge.after_step_id, root.id, "a first email and its nudge, one reach-out");
});

test("run again, it stands as it did: nothing is added to", async () => {
  const w = seeded();
  await night(w);
  await writeCopyStates(w.db, { now: NOW });
  const counted = () => ["sequence_batches", "sequence_sends", "sequence_steps", "templates"].map((n) => w.t[n].length);
  const once = counted();
  await night(w);
  await writeCopyStates(w.db, { now: NOW });
  assert.deepEqual(counted(), once);
});

test("the seed alone, which production's job runs, holds none of it, and says so if it ever does", async () => {
  const w = seeded();
  const { tenantId: T } = await night(w);
  const runs = runsOf(w.t, T);
  assert.deepEqual(
    runs.map((r) => r.state),
    ["sent"],
    "nothing waits",
  );
  assert.equal((w.t.sequence_sends ?? []).filter((s) => s.state === "drafted").length, 0, "and nothing is handed over");
  const ownerId = w.t.memberships.find((m) => m.role === "owner").user_id;
  assert.deepEqual(await verify(w.db, T, ownerId), []);
  await writeCopyStates(w.db, { now: NOW });
  assert.ok(
    (await verify(w.db, T, ownerId)).some((p) => p.includes("run(s) not sent")),
    "the seed's own check, which production's job runs, names a run left waiting",
  );
});
