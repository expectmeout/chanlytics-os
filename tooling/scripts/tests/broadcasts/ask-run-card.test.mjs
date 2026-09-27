/**
 * Ask's run card (Ask Rewired, PR 4.7; the Phase 4 plan, D11): propose_campaign's action run, a playbook's run that
 * waits for a person, approved or skipped -- the verb required, with no default. Each call the model makes runs through
 * the registry over the database in memory, from a table: the refusal in the model's words and what was read before it
 * (not an id, no verb, another workspace's run, a reach-out run, a person's broadcast, a run not waiting, a run past its
 * day in the route's own words), or the card, in the words the run's sheet says it (contracts toApprovalVM). Then the
 * card walked end to end against the real routes -- approved and cancelled, and skipped -- the run's rows read back.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROPOSAL_SPECS, localDate, runDayPassed } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { commitProposal, undoProposal } = await import(at("apps/dashboard/src/legacy-bridge/ask/commit.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const approveRoute = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/approve/route.ts"));
const cancelRoute = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/cancel/route.ts"));

beforeEach(() => {
  readerCache.clear();
  setRateStore(memoryStore());
});
afterEach(() => setServiceClient(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN = "88888888-8888-4888-8888-888888888881";
const OLD = "88888888-8888-4888-8888-888888888882";
const SENT = "88888888-8888-4888-8888-888888888883";
const REACH = "88888888-8888-4888-8888-888888888884";
const MINE = "88888888-8888-4888-8888-888888888885";
const THEIRS = "88888888-8888-4888-8888-88888888888b";
const PB1 = "99999999-9999-4999-8999-999999999991";
const STEP1 = "99999999-9999-4999-8999-999999999992";
const P = (n) => `abababab-abab-4aba-8aba-abababababa${n}`;
const USER = "u1";
const TZ = "America/New_York";
/** A Sunday at 16:00 in New York: inside the hours a message may go out in. */
const NOW = new Date("2026-09-20T20:00:00Z");
/** 22:30 the same Sunday in New York: past them, so an approval now goes at nine. */
const NIGHT = new Date("2026-09-21T02:30:00Z");
const TODAY = "2026-09-20";

/** A broadcasts row as the table holds it (ask-broadcasts-reads.test.mjs's shape). */
const bcRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  name: "Reminder",
  template_id: "77777777-7777-4777-8777-777777777771",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  audience: { kind: "list", id: "quiet", label: "Quiet 30 days" },
  state: "pending_approval",
  scheduled_for: "2026-09-20T14:00:00.000Z",
  started_at: null,
  finished_at: null,
  recipient_count: 3,
  failure: null,
  created_at: "2026-09-20T14:00:00.000Z",
  playbook_id: PB1,
  run_for: TODAY,
  ...over,
});
/** Someone a run enrolled, waiting to be sent it. */
const enrolled = (broadcast_id, n, name) => ({
  broadcast_id,
  tenant_id: A,
  contact_id: P(n),
  state: "queued",
  reason: null,
  sent_at: null,
  messages: null,
  contacts: { display_name: name, wa_profile_name: null, phone_e164: `+1555555010${n}`, email: null },
});
/**
 * Harbor's runs: today's win-back waiting on a person (three enrolled), yesterday's still waiting, one sent, a
 * reach-out's run waiting, and a broadcast a person scheduled; and Bayside's run, which a member of both could read.
 */
function world(role = "operator") {
  return {
    memberships: [
      { user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
      { user_id: USER, tenant_id: B, role, tenants: { slug: "bayside" }, created_at: "2026-02-01T00:00:00Z" },
    ],
    tenants: [
      { id: A, name: "Harbor", timezone: TZ },
      { id: B, name: "Bayside", timezone: "Europe/Madrid" },
    ],
    broadcasts: [
      bcRow(RUN, A, { name: `Win-back · ${TODAY}` }),
      bcRow(OLD, A, { name: "Win-back · 2026-09-19", run_for: "2026-09-19", recipient_count: 2 }),
      bcRow(SENT, A, { name: "Win-back · 2026-09-18", run_for: "2026-09-18", state: "sent" }),
      bcRow(REACH, A, {
        name: "Dentists in Austin · step 1",
        playbook_id: STEP1,
        audience: { kind: "reach_out", root_id: STEP1, label: "Dentists in Austin" },
      }),
      bcRow(MINE, A, { name: "October offer", state: "scheduled", playbook_id: null, run_for: null }),
      bcRow(THEIRS, B, { name: `Recupera · ${TODAY}` }),
    ],
    broadcast_recipients: [enrolled(RUN, 1, "Ana"), enrolled(RUN, 2, "Lu"), enrolled(RUN, 3, "Rosa")],
    messages: [],
    events: [],
    conversations: [],
    reach_out_sends: [],
    playbooks: [],
    decisions: [],
    jobs: [],
  };
}

/** One call the model makes, through the registry, over a fresh world: what it came to, what it read, the read set. */
async function runCall(input, { role = "operator", now = NOW } = {}) {
  const supabase = fakeDb(world(role), {}, {});
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, role, TZ, now);
  const out = await buildProposal(t, "propose_campaign", { action: "run", ...input });
  const p = out.proposal;
  return {
    got: p
      ? { kind: p.kind, needs: p.needs, title: p.title, summary: p.summary, payload: p.payload, undo: p.undo }
      : JSON.parse(out.result),
    isError: out.isError,
    reads: [...new Set(supabase.seen.map((q) => (q.rpc ? `rpc.${q.rpc}` : `${q.table}.${q.op}`)))],
    read: t.read,
  };
}

/** A run as the run's sheet reads it (getBroadcast): the run, and every person on it. */
const RUN_READ = ["broadcasts.select", "broadcast_recipients.select"];
const payload = (id, verb, name, people) => ({ broadcast_id: id, verb, name, people, timezone: TZ });

/** Each call and what it comes to: a refusal in the model's words (and what was read before it), or the card. */
const RUN_CALLS = [
  [
    "not an id",
    { broadcast_id: "win-back", verb: "approve" },
    {},
    {
      error:
        "broadcast_id must be a waiting run's id, as campaigns with action playbooks (a playbook's waiting) or action broadcasts (waiting_on_you) gives it",
    },
    [],
  ],
  [
    "no verb: it has no default",
    { broadcast_id: RUN },
    {},
    { error: 'propose_campaign: verb Invalid option: expected one of "approve"|"skip"' },
    [],
  ],
  [
    "a verb the run has no door for",
    { broadcast_id: RUN, verb: "cancel" },
    {},
    { error: 'propose_campaign: verb Invalid option: expected one of "approve"|"skip"' },
    [],
  ],
  [
    "a field only another action takes",
    { broadcast_id: RUN, verb: "approve", name: "Win-back" },
    {},
    { error: "propose_campaign: name not taken by action run" },
    [],
  ],
  [
    "a run of another workspace the member also belongs to",
    { broadcast_id: THEIRS, verb: "approve" },
    {},
    { error: "no such run in this workspace" },
    ["broadcasts.select"],
  ],
  [
    "a reach-out run: cold email, approved on its own sheet (D11)",
    { broadcast_id: REACH, verb: "approve" },
    {},
    {
      error: `a reach-out run is cold email to leads, approved on its own sheet where each email's check is shown, never from here: say so, and open broadcasts/run:${REACH}`,
    },
    null,
  ],
  [
    "a reach-out run skipped: refused the same",
    { broadcast_id: REACH, verb: "skip" },
    {},
    {
      error: `a reach-out run is cold email to leads, approved on its own sheet where each email's check is shown, never from here: say so, and open broadcasts/run:${REACH}`,
    },
    null,
  ],
  [
    "a broadcast a person scheduled is no playbook's run",
    { broadcast_id: MINE, verb: "skip" },
    {},
    { error: "that broadcast is not a playbook's run: only a playbook's run waits for a person to approve or skip" },
    RUN_READ,
  ],
  [
    "a run that already went",
    { broadcast_id: SENT, verb: "approve" },
    {},
    { error: "that run is not waiting for approval: the Broadcasts page says Sent" },
    RUN_READ,
  ],
  [
    "a run made for a day that has passed, approved: the route's refusal, in its words",
    { broadcast_id: OLD, verb: "approve" },
    {},
    {
      error:
        "This run was made for 2026-09-19 and that day has passed: its people and its words were that day's. Skip it; the next run reads the calendar again.",
    },
    RUN_READ,
  ],
  [
    "the same run, skipped: a card",
    { broadcast_id: OLD, verb: "skip" },
    {},
    {
      kind: "run",
      needs: "operator",
      title: "Skip the run: Win-back · 2026-09-19",
      summary: "2 people · Skipping loses this run only — the playbook keeps running.",
      payload: payload(OLD, "skip", "Win-back · 2026-09-19", 2),
      undo: null,
    },
    RUN_READ,
  ],
  [
    "today's run, approved inside the hours: it goes the moment it is approved",
    { broadcast_id: RUN, verb: "approve" },
    {},
    {
      kind: "run",
      needs: "operator",
      title: `Approve the run: Win-back · ${TODAY}`,
      summary: "3 people · goes the moment you approve it",
      payload: payload(RUN, "approve", `Win-back · ${TODAY}`, 3),
      undo: "Cancel it, if it has not finished",
    },
    RUN_READ,
  ],
  [
    "today's run, approved at night: it goes at nine, by the business's clock",
    { broadcast_id: RUN, verb: "approve" },
    { now: NIGHT },
    {
      kind: "run",
      needs: "operator",
      title: `Approve the run: Win-back · ${TODAY}`,
      summary: "3 people · goes at 9:00 AM once you approve it",
      payload: payload(RUN, "approve", `Win-back · ${TODAY}`, 3),
      undo: "Cancel it, if it has not finished",
    },
    RUN_READ,
  ],
  [
    "today's run, skipped: no undo",
    { broadcast_id: RUN, verb: "skip" },
    {},
    {
      kind: "run",
      needs: "operator",
      title: `Skip the run: Win-back · ${TODAY}`,
      summary: "3 people · Skipping loses this run only — the playbook keeps running.",
      payload: payload(RUN, "skip", `Win-back · ${TODAY}`, 3),
      undo: null,
    },
    RUN_READ,
  ],
];

test("propose_campaign.run over the database in memory, from a table: each refusal in the model's words, before any read where it can be -- not an id, no verb, a verb it does not know, another action's field, another workspace's run, a reach-out run, a person's broadcast, a run not waiting, a run past its day -- and each card in its sheet's words; the run is a row the answer may cite", async () => {
  for (const [what, input, opts, want, reads] of RUN_CALLS) {
    const r = await runCall(input, opts);
    assert.deepEqual(r.got, want, what);
    assert.equal(r.isError, "error" in want, what);
    if (reads) assert.deepEqual(r.reads, reads, `${what}: what was read`);
  }
  // The run a card names is in the turn's read set, opened on its sheet.
  const { read } = await runCall({ broadcast_id: RUN, verb: "approve" });
  assert.deepEqual(read.broadcast.get(RUN), {
    kind: "broadcast",
    id: RUN,
    route: `broadcasts/run:${RUN}`,
    label: `Win-back · ${TODAY}`,
  });
  // The day check is the route's own rule, one sentence (contracts runDayPassed): today's run passes it.
  assert.equal(runDayPassed({ playbook_id: PB1, run_for: TODAY }, localDate(TZ, NOW)), null);
  // An operator's, a partner's and an owner's; a viewer is refused the action, before anything is read.
  for (const role of ["partner", "owner"])
    assert.equal((await runCall({ broadcast_id: RUN, verb: "skip" }, { role })).got.kind, "run", role);
  const viewer = await runCall({ broadcast_id: RUN, verb: "skip" }, { role: "viewer" });
  assert.deepEqual(
    [viewer.got, viewer.reads],
    [{ error: "propose_campaign: action run is an owner's, a partner's or an operator's" }, []],
  );
});

const envelope = (data) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });

/** The routes a run card reaches, by method and path: each the real route module, run as the server runs it. */
const CARD_ROUTES = [
  ["POST", /^\/api\/v1\/broadcasts\/([^/]+)\/approve$/, approveRoute.POST],
  ["POST", /^\/api\/v1\/broadcasts\/([^/]+)\/cancel$/, cancelRoute.POST],
];

/**
 * A tab over the world, on the real clock (approveRun reads its own): the typed client on a fetch that runs the route a
 * card names over the database the card's builder read -- the card's marks carried as route() carries them, and the
 * jobs the approval schedules on the service client -- answered as the server answers; the window the walk tells.
 */
function tabOver(tables) {
  const sent = [];
  const events = [];
  const supabase = fakeDb(tables, {}, {});
  setServiceClient(supabase);
  const client = createApi({
    fetch: async (url, init) => {
      const u = new URL(String(url), "http://localhost");
      const hit = CARD_ROUTES.find(([method, re]) => method === init.method && re.test(u.pathname));
      assert.ok(hit, `a route this walk does not run: ${init.method} ${u.pathname}`);
      const [, re, handler] = hit;
      sent.push({ key: `${init.method} ${u.pathname}`, undoOf: init.headers["x-undo-of"] ?? null });
      const ctx = {
        supabase,
        userId: USER,
        email: "ada@example.com",
        params: { id: re.exec(u.pathname)[1] },
        ...(init.headers["x-via"] === "ask" ? { via: "ask" } : {}),
        ...(init.headers["x-undo-of"] ? { undoOf: init.headers["x-undo-of"] } : {}),
      };
      try {
        return envelope(await handler.run(new Request(u, { method: init.method, body: init.body }), ctx));
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: { code: e.code, message: e.message } }), {
          status: e.status ?? 500,
        });
      }
    },
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async (key) => {
      events.push(`refresh ${key}`);
    },
    now: () => 1_000,
  });
  const win = { __SETTINGS: null, location: { hash: "" }, dispatchEvent: () => true, setTimeout: (fn) => fn() };
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "operator", TZ);
  return { client, win, sent, events, t };
}
const doneWith = (r) => ({ state: "done", receipt: r.receipt, atMs: 1, undo: r.undo });
/** A world whose waiting run was made for the business's today by the real clock, as approveRun judges it. */
function todays() {
  const tables = world();
  const today = localDate(TZ, new Date());
  const run = tables.broadcasts.find((b) => b.id === RUN);
  Object.assign(run, { run_for: today, name: `Win-back · ${today}` });
  return tables;
}

test("a run card approved, walked end to end: Approve sends it through the run's own door, the send is scheduled and the ledger says a card did it, the receipt is the Broadcasts page's; Cancel it cancels that very run, linked to the approval it undoes", async () => {
  const tables = todays();
  const tab = tabOver(tables);
  const run = () => tables.broadcasts.find((b) => b.id === RUN);
  const built = await buildProposal(tab.t, "propose_campaign", { action: "run", broadcast_id: RUN, verb: "approve" });
  assert.equal(built.isError, false, built.result);
  const card = built.proposal;
  const done = await commitProposal(tab.win, card, tab.client);
  assert.equal(done.ok, true, done.message);
  assert.equal(run().state, "scheduled");
  const [job] = tables.jobs;
  assert.deepEqual([job.kind, job.payload], ["broadcast_send", { broadcast_id: RUN }]);
  // The column's default (00002: jobs.state defaults to scheduled), which the database in memory does not apply.
  job.state ??= "scheduled";
  const approval = tables.decisions.find((d) => d.verb === "send_broadcast");
  assert.deepEqual(
    [approval.subject_id, approval.payload.approved, approval.payload.via],
    [RUN, true, "ask"],
    "the approver's, marked as a card's",
  );
  assert.deepEqual(done.undo, { broadcast_id: RUN, decision_id: approval.id });
  // Now, or at nine when the real clock is past the hours: the route's answer says which, and the receipt says it.
  const moved = !!approval.payload.moved_from;
  assert.match(
    done.receipt,
    moved
      ? new RegExp(
          `^Win-back · ${run().run_for} approved — 3 people, scheduled for .+ — messages go out between 9:00 and 20:59 by your clock$`,
        )
      : new RegExp(`^Win-back · ${run().run_for} approved — 3 people, sending now$`),
  );
  assert.ok(tab.events.includes("refresh POST broadcasts/[id]/approve"), "Broadcasts, Playbooks and Today read again");
  const undone = await undoProposal(tab.win, card, doneWith(done), tab.client);
  assert.deepEqual(undone, { ok: true, receipt: "Canceled — nothing will send", undo: null });
  assert.equal(run().state, "canceled");
  assert.equal(job.state, "canceled", "the send withdrawn");
  const cancel = tables.decisions.find((d) => d.verb === "cancel_broadcast");
  assert.deepEqual(
    [cancel.subject_id, cancel.payload.was, cancel.undo_of],
    [RUN, "scheduled", approval.id],
    "the undo names the approval it reverses",
  );
  assert.deepEqual(
    tab.sent.map((s) => [s.key, s.undoOf]),
    [
      [`POST /api/v1/broadcasts/${RUN}/approve`, null],
      [`POST /api/v1/broadcasts/${RUN}/cancel`, approval.id],
    ],
  );
});

test("a run card skipped, walked end to end: Skip ends the run unsent through its cancel, nothing is scheduled, the receipt is the Broadcasts page's, and there is nothing to undo; approved after its day, the route refuses in the words the card's builder refuses in", async () => {
  const tables = todays();
  const tab = tabOver(tables);
  const card = (await buildProposal(tab.t, "propose_campaign", { action: "run", broadcast_id: RUN, verb: "skip" }))
    .proposal;
  const done = await commitProposal(tab.win, card, tab.client);
  const run = tables.broadcasts.find((b) => b.id === RUN);
  assert.deepEqual(done, { ok: true, receipt: `${run.name} skipped — nothing will send`, undo: null });
  assert.equal(run.state, "canceled");
  assert.deepEqual(tables.jobs, [], "nothing scheduled");
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.payload.was, d.payload.via]),
    [["cancel_broadcast", "pending_approval", "ask"]],
  );
  // A card for yesterday's run, had its approval been built before the day turned: the route refuses it, and the words
  // are the ones the builder refuses in (contracts runDayPassed, one sentence).
  const old = tables.broadcasts.find((b) => b.id === OLD);
  const late = await commitProposal(
    tab.win,
    { ...card, payload: { ...card.payload, broadcast_id: OLD, verb: "approve" } },
    tab.client,
  );
  assert.deepEqual([late.ok, late.status, late.message], [false, 409, runDayPassed(old, localDate(TZ, new Date()))]);
  assert.equal(old.state, "pending_approval", "still waiting, to be skipped");
  assert.equal(PROPOSAL_SPECS.run.undo.label(card), null);
});
