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
import { changePlaybookDoor } from "./_change-door.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { MODE_WORDS } = await import(at("apps/dashboard/src/server/ask/tools/act/playbook-card.ts"));
const {
  LIFECYCLE_WORDS,
  PLAYBOOK_CARD_REFUSALS,
  PROPOSAL_SPECS,
  PLAYBOOK_PATCH_WORDS,
  REACH_OUT_IS_NOT_A_MOMENT,
  lifecyclePlaybooksOf,
} = await import("@chanlytics/contracts");
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
/** The change_playbook door in memory, as 00416 writes it and the route calls it (_change-door.mjs). */
const changeDoor = (rows) => changePlaybookDoor(rows, USER);
const change = (input, rows = tables(), faults = {}) => {
  const supabase = fakeDb(rows, faults, changeDoor(rows));
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  return buildProposal(t, "propose_campaign", { action: "change", playbook_id: PB, ...input });
};
const said = (r) => JSON.parse(r.result).error;
/**
 * A card's commit or undo, sent to the real PUT over the same rows. `undoOf` is the decision an undo names, as the
 * commit runner sends it (legacy-bridge/ask/commit.ts: the x-undo-of header, the route's ctx.undoOf).
 */
const sendTo = async (rows, call, undoOf) => {
  assert.equal(call.route, "PUT playbooks/[id]");
  setRateStore(memoryStore());
  return playbookRoute.PUT.run(
    new Request("http://localhost/api/v1/x", { method: "PUT", body: JSON.stringify(call.body) }),
    {
      supabase: fakeDb(rows, {}, changeDoor(rows)),
      userId: USER,
      email: "ada@example.com",
      params: call.params,
      ...(undoOf ? { undoOf } : {}),
    },
  );
};
/** A change card's Undo, as the commit runner sends it: its spec's call, naming the decision its Approve wrote. */
const undoTo = (rows, p, approved) => {
  const spec = PROPOSAL_SPECS.playbook_change;
  const record = spec.undo.record(p, approved, { settings: null });
  return sendTo(rows, spec.undo.call(record, { settings: null }), record.decision_id ?? undefined);
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

test("a campaign on trial goes as veto (00416): its resume card says veto's words, never that it sends on its own, and its pause's undo claims no auto; once its trial is over, auto's words again", async () => {
  // A week of trial from the 14th: its runs wait half an hour for a Stop, whatever its auto class says.
  const onTrial = { trial_until: "2026-09-21T14:00:00Z" };
  const resume = await change(
    { state: "running" },
    tables({ playbooks: [playbookRow({ state: "paused", ...onTrial })] }),
  );
  assert.equal(resume.isError, false, resume.result);
  assert.equal(resume.proposal.summary, PLAYBOOK_PATCH_WORDS.resumed("Re-engage", "veto", MODE_WORDS.veto));
  assert.ok(!resume.proposal.summary.includes(LIFECYCLE_WORDS.ledger.resume.auto), resume.proposal.summary);
  const pause = await change({ state: "paused" }, tables({ playbooks: [playbookRow(onTrial)] }));
  assert.equal(pause.isError, false, pause.result);
  assert.deepEqual([pause.proposal.undo, pause.proposal.payload.mode], ["Resume it", "veto"]);
  // A minute before now, the trial ended: its class's auto is how its runs go.
  const over = { trial_until: "2026-09-14T13:59:00Z" };
  const after = await change({ state: "running" }, tables({ playbooks: [playbookRow({ state: "paused", ...over })] }));
  assert.equal(
    after.proposal.summary,
    PLAYBOOK_PATCH_WORDS.resumed("Re-engage", "auto", LIFECYCLE_WORDS.ledger.resume.auto),
  );
  const pausedAfter = await change({ state: "paused" }, tables({ playbooks: [playbookRow(over)] }));
  assert.deepEqual(
    [pausedAfter.proposal.undo, pausedAfter.proposal.payload.mode],
    [`Resume it. ${LIFECYCLE_WORDS.ledger.resume.auto}`, "auto"],
  );
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

/** The campaign's message as the workspace holds it: WhatsApp's approved version, which takes two values. */
const MONTH_OFFER = {
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
  tenant_id: A,
  channel: "whatsapp",
  name: "month_offer",
  language: "en",
  meta_status: "approved",
  category: "marketing",
  variables: ["1", "2"],
  hidden_at: null,
  title: null,
  components: null,
  body_preview: null,
};
/** Its words as the route stored them when it was made. */
const HELD = [{ kind: "first_name" }, { kind: "text", value: "10% off" }];

test("its words (00416 params): the model's slot text becomes the specs the route stores, as a new campaign's does, judged against its message; the card quotes them, and its Approve and Undo are the playbook's own PUT", async () => {
  const rows = tables({ templates: [MONTH_OFFER], playbooks: [playbookRow({ params: HELD })] });
  const made = await change({ params: ["@first_name", "15% off a colour"] }, rows);
  assert.equal(made.isError, false, made.result);
  const specs = [{ kind: "first_name" }, { kind: "text", value: "15% off a colour" }];
  const p = made.proposal;
  assert.deepEqual([p.title, p.undo], ["Change: Win-back", "Put it back"]);
  assert.equal(p.summary, PLAYBOOK_PATCH_WORDS.params(specs));
  assert.equal(p.summary, "Its words changed: their first name, “15% off a colour”");
  assert.deepEqual([p.payload.params, p.payload.was], [specs, { params: HELD }]);
  assert.deepEqual(rows.decisions, [], "a card writes nothing");
  const spec = PROPOSAL_SPECS.playbook_change;
  const approved = await sendTo(rows, spec.commit(p, { settings: null }));
  assert.deepEqual(rows.playbooks[0].params, specs);
  await sendTo(rows, spec.undo.call(spec.undo.record(p, approved, { settings: null }), { settings: null }));
  assert.deepEqual(rows.playbooks[0].params, HELD);
  // A typed value is plain text, as a new campaign's is: refused in the playbook action's own words.
  assert.equal(said(await change({ params: ["@first_name", "two\nlines"] }, rows)), PLAYBOOK_CARD_REFUSALS.plainText);
  // Its message takes two values: one is refused in the PUT's own words (core checkPlaybookPatch).
  assert.equal(said(await change({ params: ["@first_name"] }, rows)), "This template takes 2 values.");
  // The words it already says are no change.
  assert.equal(said(await change({ params: ["@first_name", "10% off"] }, rows)), PLAYBOOK_PATCH_WORDS.same("Win-back"));
});

test("its end (00416 until): a day by the business's clock, said as the product says a date (“Ends Nov 30”), its undo no end; a day already past is refused in the PUT's words", async () => {
  const rows = tables();
  const made = await change({ until: "2026-11-30" }, rows);
  assert.equal(made.isError, false, made.result);
  const p = made.proposal;
  assert.equal(p.summary, "Ends Nov 30");
  assert.equal(p.summary, PLAYBOOK_PATCH_WORDS.until("Nov 30"));
  assert.deepEqual([p.payload.until, p.payload.was], ["2026-11-30", { until: null }]);
  const spec = PROPOSAL_SPECS.playbook_change;
  const approved = await sendTo(rows, spec.commit(p, { settings: null }));
  assert.equal(rows.playbooks[0].until, "2026-11-30");
  // Its undo writes "no end" back: a null clears the date.
  await sendTo(rows, spec.undo.call(spec.undo.record(p, approved, { settings: null }), { settings: null }));
  assert.equal(rows.playbooks[0].until, null);
  // The 14th in New York: the 13th has passed.
  assert.equal(said(await change({ until: "2026-09-13" })), PLAYBOOK_PATCH_WORDS.untilPast("Sep 14"));
  assert.equal(said(await change({ until: "the end of November" })), PLAYBOOK_PATCH_WORDS.untilDay);
});

test("its trial (00416 trial_until): an instant says its last day; null ends it, said in the change's words and committed as the null that clears it; a resume on a trial the card ends says its class's own mode", async () => {
  const set = await change({ trial_until: "2026-09-21T14:00:00Z" });
  assert.equal(set.isError, false, set.result);
  assert.equal(set.proposal.summary, PLAYBOOK_PATCH_WORDS.trial_until("Sep 21"));
  assert.equal(set.proposal.summary, "On trial until Sep 21: each run waits 30 minutes for you to stop it");
  assert.deepEqual(
    [set.proposal.payload.trial_until, set.proposal.payload.was],
    ["2026-09-21T14:00:00.000Z", { trial_until: null }],
  );
  // Its undo writes back what the door recorded, past or not: the PUT judges at its own clock, by which this trial has
  // ended, and an undo restores it all the same (core checkPlaybookPatch `undo`).
  const onTrial = { trial_until: "2026-09-21T14:00:00Z" };
  const rows = tables({ playbooks: [playbookRow(onTrial)] });
  const ended = await change({ trial_until: null }, rows);
  assert.equal(ended.isError, false, ended.result);
  const p = ended.proposal;
  assert.equal(p.summary, PLAYBOOK_PATCH_WORDS.trial_until(null));
  assert.deepEqual([p.payload.trial_until, p.payload.was], [null, onTrial]);
  const spec = PROPOSAL_SPECS.playbook_change;
  const commit = spec.commit(p, { settings: null });
  assert.deepEqual(commit.body, { trial_until: null }, "the null that clears it, and nothing else");
  const approved = await sendTo(rows, commit);
  assert.equal(rows.playbooks[0].trial_until, null);
  await undoTo(rows, p, approved);
  // The same instant, kept in the one spelling a change writes (core trialUntilOf).
  assert.equal(rows.playbooks[0].trial_until, "2026-09-21T14:00:00.000Z");
  // A trial's end already past is refused: null is how a trial ends now.
  assert.equal(
    PLAYBOOK_PATCH_WORDS.trialPast,
    "A trial ends at a time still to come: name a later one, or null, which ends it now.",
  );
  assert.equal(said(await change({ trial_until: "2026-09-14T13:59:00Z" })), PLAYBOOK_PATCH_WORDS.trialPast);
  // A resume that ends the trial too goes under its auto class at once, and says so in full.
  const resume = await change(
    { state: "running", trial_until: null },
    tables({ playbooks: [playbookRow({ state: "paused", ...onTrial })] }),
  );
  assert.equal(
    resume.proposal.summary,
    [
      PLAYBOOK_PATCH_WORDS.resumed("Re-engage", "auto", LIFECYCLE_WORDS.ledger.resume.auto),
      PLAYBOOK_PATCH_WORDS.trial_until(null),
    ].join(" · "),
  );
  assert.equal(said(await change({ trial_until: "next week" })), PLAYBOOK_PATCH_WORDS.trialWhen);
});

test("a trial follows its class's mode: under ask or never a trial changes nothing, and the card says so with what a run does there, never that each run waits half an hour; under veto its runs wait as they did; a trial whose mode could not be read is no card", async () => {
  const trial = { trial_until: "2026-09-21T14:00:00Z" };
  const asks = await change(trial, tables({ policies: [] }));
  assert.equal(asks.isError, false, asks.result);
  assert.equal(asks.proposal.summary, PLAYBOOK_PATCH_WORDS.trialInert("Sep 21", "Re-engage", "ask", MODE_WORDS.ask));
  assert.equal(
    asks.proposal.summary,
    "On trial until Sep 21, which changes nothing under “Re-engage” (ask): each run waits for you on Today",
  );
  const never = await change(
    trial,
    tables({ policies: [{ tenant_id: A, class: "reengage", mode: "never", subject_type: null, limits: null }] }),
  );
  assert.equal(
    never.proposal.summary,
    PLAYBOOK_PATCH_WORDS.trialInert("Sep 21", "Re-engage", "never", MODE_WORDS.never),
  );
  const veto = await change(
    trial,
    tables({ policies: [{ tenant_id: A, class: "reengage", mode: "veto", subject_type: null, limits: null }] }),
  );
  assert.equal(veto.proposal.summary, PLAYBOOK_PATCH_WORDS.trial_until("Sep 21"));
  const unread = await change(trial, tables(), { "policies.select": { message: "the read failed" } });
  assert.equal(unread.isError, true);
  assert.match(said(unread), /sending mode .* could not be read/);
  // Ending a trial says the same under any mode, so it reads none.
  const ends = await change(
    { trial_until: null },
    tables({ playbooks: [playbookRow({ trial_until: "2099-09-21T14:00:00Z" })] }),
    { "policies.select": { message: "the read failed" } },
  );
  assert.equal(ends.proposal.summary, PLAYBOOK_PATCH_WORDS.trial_until(null));
});

test("an undo restores what the door recorded, past or not: a resume with a new trial on a campaign whose earlier trial ended, and a later end on a campaign that has ended, are undone to the past values, each line naming the line it undoes; a PUT that is no undo still refuses a past end or a past trial", async () => {
  // Its first week's trial ended on the 1st; resumed now with a new one (far off, still to come by the PUT's own clock).
  const ended = { state: "paused", trial_until: "2026-09-01T14:00:00Z" };
  const rows = tables({ playbooks: [playbookRow(ended)] });
  const resumed = (await change({ state: "running", trial_until: "2099-09-21T14:00:00Z" }, rows)).proposal;
  assert.deepEqual(resumed.payload.was, ended);
  const spec = PROPOSAL_SPECS.playbook_change;
  const approved = await sendTo(rows, spec.commit(resumed, { settings: null }));
  assert.deepEqual([rows.playbooks[0].state, rows.playbooks[0].trial_until], ["running", "2099-09-21T14:00:00.000Z"]);
  await undoTo(rows, resumed, approved);
  assert.deepEqual(
    [rows.playbooks[0].state, rows.playbooks[0].trial_until],
    ["paused", "2026-09-01T14:00:00.000Z"],
    "the trial that had ended, as it was",
  );
  assert.deepEqual(
    rows.decisions.map((d) => [d.verb, d.undo_of ?? null]),
    [
      ["start_playbook", null],
      ["pause_playbook", approved.decision_id],
    ],
  );

  // It ended on the 10th; a later end is undone to the 10th, and the home says it has ended again.
  const over = tables({ playbooks: [playbookRow({ until: "2026-09-10" })] });
  const later = (await change({ until: "2099-11-30" }, over)).proposal;
  assert.deepEqual(later.payload.was, { until: "2026-09-10" });
  const extended = await sendTo(over, spec.commit(later, { settings: null }));
  assert.equal(over.playbooks[0].until, "2099-11-30");
  await undoTo(over, later, extended);
  assert.equal(over.playbooks[0].until, "2026-09-10");
  assert.deepEqual(
    over.decisions.map((d) => [d.verb, d.undo_of ?? null]),
    [
      ["change_playbook", null],
      ["change_playbook", extended.decision_id],
    ],
  );
  const home = lifecyclePlaybooksOf(
    { playbooks: [{ ...over.playbooks[0], last_run_for: null }], timezone: TZ, calendar: "none" },
    NOW,
  );
  assert.deepEqual([home.cards[0].read.ended, home.cards[0].read.off], ["Sep 10", LIFECYCLE_WORDS.ended("Sep 10")]);
  assert.equal(LIFECYCLE_WORDS.ended("Sep 10"), "Ended Sep 10");

  // A PUT that names no undo is judged as any change is: a past end and a past trial are refused, nothing written.
  const direct = (body) => sendTo(over, { route: "PUT playbooks/[id]", params: { id: PB }, body });
  await assert.rejects(direct({ until: "2026-09-11" }), (e) => {
    assert.match(e.message, /^An end is today or later: today is /);
    return true;
  });
  await assert.rejects(direct({ trial_until: "2026-09-21T14:00:00Z" }), (e) => {
    assert.equal(e.message, PLAYBOOK_PATCH_WORDS.trialPast);
    return true;
  });
  assert.deepEqual([over.playbooks[0].until, over.playbooks[0].trial_until ?? null], ["2026-09-10", null]);
  assert.equal(over.decisions.length, 2, "no line for a refused change");
});
