/**
 * propose_campaign's action change (the moment spec §4.9 A5): a playbook that exists paused, resumed, renamed or retimed,
 * proposed as a card through the real registry over a workspace in memory. The card is judged by the PUT's own core
 * judgement (checkPlaybookPatch, against the playbook as it stands), carries what changes and what it held and nothing
 * else of the playbook, says a pause leaves a waiting run waiting and a resume's mode in full, and its Approve and Undo
 * go to the real route.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { LIFECYCLE_WORDS, PROPOSAL_SPECS, PLAYBOOK_PATCH_WORDS, REACH_OUT_IS_NOT_A_MOMENT } =
  await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const playbookRoute = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/route.ts"));
beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const STEP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

const playbookRow = (over = {}) => ({
  id: PB,
  tenant_id: A,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
  template_name: "month_offer",
  template_language: "en",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_at: "2026-09-01T00:00:00Z",
  channels: null,
  ...over,
});
const tables = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ }],
  policies: [{ tenant_id: A, class: "reengage", mode: "auto", subject_type: null, limits: null }],
  playbooks: [playbookRow()],
  broadcasts: [],
  segments: [],
  decisions: [],
  events: [],
  ...over,
});
/**
 * The change_playbook door in memory, as 00377 writes it and the route calls it: of the columns named only those that
 * differ written, the line's verb following the state that moved, what each held answered; nothing that differs is no
 * write and no line (`was` empty, `decision_id` null).
 */
const changeDoor = (rows) => ({
  change_playbook: (a) => {
    const p = rows.playbooks.find((x) => x.id === a.p_playbook_id && x.tenant_id === a.p_tenant_id);
    if (!p) throw Object.assign(new Error("Playbook not found."), { code: "P0002" });
    const set = Object.fromEntries(Object.entries(a.p_set).filter(([k, v]) => p[k] !== v));
    if (Object.keys(set).length === 0) return { id: p.id, was: {}, decision_id: null, undo_dropped: false };
    const was = Object.fromEntries(Object.keys(set).map((k) => [k, p[k]]));
    Object.assign(p, set);
    const id = `d${rows.decisions.length + 1}`;
    const verb =
      set.state === "running" ? "start_playbook" : set.state === "paused" ? "pause_playbook" : "change_playbook";
    rows.decisions.push({ id, verb });
    return { id: p.id, was, decision_id: id, undo_dropped: false };
  },
});
const change = (input, rows = tables(), faults = {}) => {
  const supabase = fakeDb(rows, faults, changeDoor(rows));
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  return buildProposal(t, "propose_campaign", { action: "change", playbook_id: PB, ...input });
};
const said = (r) => JSON.parse(r.result).error;
/** A card's commit or undo, sent to the real PUT over the same rows. */
const sendTo = async (rows, call) => {
  assert.equal(call.route, "PUT playbooks/[id]");
  setRateStore(memoryStore());
  return playbookRoute.PUT.run(
    new Request("http://localhost/api/v1/x", { method: "PUT", body: JSON.stringify(call.body) }),
    {
      supabase: fakeDb(rows, {}, changeDoor(rows)),
      userId: USER,
      email: "ada@example.com",
      params: call.params,
    },
  );
};

test("a rename and a new hour: a card that carries what changes and what it held, in the product's words, and whose Approve and Undo are the playbook's own PUT", async () => {
  const rows = tables();
  const made = await change({ name: "Past clients", run_hour: 9 }, rows);
  assert.equal(made.isError, false, made.result);
  const p = made.proposal;
  assert.deepEqual(
    [p.kind, p.needs, p.title, p.undo],
    ["playbook_change", "operator", "Change: Win-back", "Put it back"],
  );
  assert.equal(
    p.summary,
    [PLAYBOOK_PATCH_WORDS.name("Past clients"), PLAYBOOK_PATCH_WORDS.run_hour(9, 10)].join(" · "),
  );
  assert.deepEqual(p.payload, {
    playbook_id: PB,
    playbook_name: "Win-back",
    name: "Past clients",
    run_hour: 9,
    was: { name: "Win-back", run_hour: 10 },
    run_waits: false,
    timezone: TZ,
  });
  assert.deepEqual(rows.decisions, [], "a card writes nothing");
  const spec = PROPOSAL_SPECS.playbook_change;
  const approved = await sendTo(rows, spec.commit(p, { settings: null }));
  assert.deepEqual([rows.playbooks[0].name, rows.playbooks[0].run_hour], ["Past clients", 9]);
  assert.equal(spec.receipt(p, approved), "Past clients changed");
  const undo = spec.undo.call(spec.undo.record(p, approved, { settings: null }), { settings: null });
  await sendTo(rows, undo);
  assert.deepEqual([rows.playbooks[0].name, rows.playbooks[0].run_hour], ["Win-back", 10]);
});

test("a pause says the run that waits stays waiting; a resume says its class's mode in full, under auto in the Resume ask's own sentence", async () => {
  const waiting = {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    tenant_id: A,
    playbook_id: PB,
    state: "pending_approval",
    recipient_count: 12,
  };
  const pause = await change({ state: "paused" }, tables({ broadcasts: [waiting] }));
  assert.equal(pause.isError, false, pause.result);
  // Its undo resumes it, under its class's mode: auto here, said in full in the Resume ask's own sentence (D7).
  assert.deepEqual(
    [pause.proposal.title, pause.proposal.undo],
    ["Pause: Win-back", `Resume it. ${LIFECYCLE_WORDS.ledger.resume.auto}`],
  );
  assert.equal(pause.proposal.payload.mode, "auto");
  assert.equal(pause.proposal.summary, `${PLAYBOOK_PATCH_WORDS.paused} · ${PLAYBOOK_PATCH_WORDS.pausedWaits(12)}`);
  assert.equal(pause.proposal.payload.run_waits, true);
  // A pause needs no mode, so one whose mode could not be read is still a card; its undo claims no mode.
  const unknown = await change({ state: "paused" }, tables(), { "policies.select": { message: "the read failed" } });
  assert.equal(unknown.isError, false, unknown.result);
  assert.deepEqual([unknown.proposal.undo, unknown.proposal.payload.mode], ["Resume it", null]);
  // With no run waiting, a pause says what it does and nothing of a run.
  const quiet = await change({ state: "paused" });
  assert.equal(quiet.proposal.summary, PLAYBOOK_PATCH_WORDS.paused);
  const resume = await change({ state: "running" }, tables({ playbooks: [playbookRow({ state: "paused" })] }));
  assert.equal(resume.isError, false, resume.result);
  assert.deepEqual([resume.proposal.title, resume.proposal.undo], ["Resume: Win-back", "Pause it again"]);
  // Under auto it sends on its own: one fact, one sentence, the drawer's Resume line, which the pause's undo says too.
  assert.equal(
    resume.proposal.summary,
    PLAYBOOK_PATCH_WORDS.resumed("Re-engage", "auto", LIFECYCLE_WORDS.ledger.resume.auto),
  );
  assert.ok(pause.proposal.undo.endsWith(LIFECYCLE_WORDS.ledger.resume.auto));
  // A class with no row of its own runs under ask, a missing row's mode, and the card says that one.
  const asks = await change(
    { state: "running" },
    tables({ policies: [], playbooks: [playbookRow({ state: "paused" })] }),
  );
  assert.match(asks.proposal.summary, /^Runs again under “Re-engage” \(ask\): each run waits for you on Today$/);
  // The mode is the one thing a resume says that it cannot know unread (D7): a failed read is no card, never a guess.
  const unread = await change({ state: "running" }, tables({ playbooks: [playbookRow({ state: "paused" })] }), {
    "policies.select": { message: "the read failed" },
  });
  assert.equal(unread.isError, true);
  assert.match(said(unread), /sending mode .* could not be read/);
});

test("a change is refused in words before any card: not an id, not this workspace's, a reach-out's step, a value out of bounds, a cadence off the month's offer, and nothing that would change", async () => {
  assert.match(said(await change({ playbook_id: "nope", state: "paused" })), /^playbook_id must be a playbook's id/);
  assert.match(
    said(await change({ playbook_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9", state: "paused" })),
    /^no such playbook in this workspace/,
  );
  const step = tables({
    playbooks: [playbookRow({ id: STEP, kind: "reach_out", trigger: "lead_first", name: "Movers" })],
  });
  assert.match(
    said(await change({ playbook_id: STEP, state: "paused" }, step)),
    /reach-out is changed on its own sheet/,
  );
  assert.equal(said(await change({ run_hour: 7 })), "The hour must be a whole number from 9 to 20.");
  assert.equal(said(await change({ name: "x".repeat(81) })), PLAYBOOK_PATCH_WORDS.nameLong(80));
  assert.equal(said(await change({ cadence_days: 14 })), PLAYBOOK_PATCH_WORDS.cadenceOffer("Win-back"));
  assert.equal(said(await change({ state: "running", run_hour: 10 })), PLAYBOOK_PATCH_WORDS.same("Win-back"));
  // A field only another action takes is refused by the registry, so a change card never quietly becomes another.
  assert.match(said(await change({ state: "paused", trigger: "lapsed" })), /trigger/);
  assert.ok(REACH_OUT_IS_NOT_A_MOMENT);
});

test("a card approved after somebody else made the same change writes nothing, and offers no undo of what it did not do", async () => {
  const rows = tables();
  const p = (await change({ state: "paused" }, rows)).proposal;
  // A teammate pauses it from the drawer before the card's Approve.
  rows.playbooks[0].state = "paused";
  const spec = PROPOSAL_SPECS.playbook_change;
  const approved = await sendTo(rows, spec.commit(p, { settings: null }));
  assert.deepEqual([approved.state, approved.was, approved.decision_id], ["paused", {}, null]);
  assert.deepEqual(rows.decisions, [], "no line for a change that changed nothing");
  assert.equal(
    spec.undo.record(p, approved, { settings: null }),
    null,
    "no undo: a resume now would undo the teammate",
  );
  // Its pause, approved while it still ran, is one line, its verb the state that moved.
  rows.playbooks[0].state = "running";
  const paused = await sendTo(rows, spec.commit(p, { settings: null }));
  assert.deepEqual(
    rows.decisions.map((d) => d.verb),
    ["pause_playbook"],
  );
  // Its undo names that line (undo_of), as every card's undo names the row it reverses.
  assert.deepEqual(spec.undo.record(p, paused, { settings: null }), {
    playbook_id: PB,
    was: { state: "running" },
    decision_id: rows.decisions[0].id,
  });
});
