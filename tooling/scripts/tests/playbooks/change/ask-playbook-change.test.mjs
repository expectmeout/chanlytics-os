/**
 * propose_campaign's action change (the moment spec §4.9 A5): a playbook that exists paused, resumed, renamed or retimed,
 * proposed as a card through the real registry over a workspace in memory. The card is judged by the PUT's own core
 * judgement (checkPlaybookPatch, against the playbook as it stands), carries what changes and what it held and nothing
 * else of the playbook, says a pause leaves a waiting run waiting and a resume's mode in full, and its Approve and Undo
 * go to the real route. Since 00461 it also sets its sequence's mode (decision 0064), which a resume says.
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
const {
  LIFECYCLE_WORDS,
  PLAYBOOK_CARD_REFUSALS,
  PROPOSAL_SPECS,
  PLAYBOOK_PATCH_WORDS,
  REACH_OUT_IS_NOT_A_MOMENT,
  SEQUENCE_MODE_WORDS,
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
  // Its words seen going (00461): its batches go by its sequence's mode, the class's row's when it was made.
  words_ok_at: "2026-09-02T14:00:00Z",
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
  return buildProposal(t, "propose_sequence", { action: "change", playbook_id: PB, ...input });
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

test("a pause says the run that waits stays waiting; a resume says its sequence's mode in full, under auto in the Resume ask's own sentence, and that a batch of new words waits for an OK first (decision 0064)", async () => {
  const waiting = {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    tenant_id: A,
    playbook_id: PB,
    state: "pending_approval",
    recipient_count: 12,
  };
  const pause = await change({ state: "paused" }, tables({ broadcasts: [waiting] }));
  assert.equal(pause.isError, false, pause.result);
  // Its undo resumes it, under its sequence's mode: auto here, said in full in the Resume ask's own sentence (D7).
  assert.deepEqual(
    [pause.proposal.title, pause.proposal.undo],
    ["Pause: Win-back", `Resume it. ${LIFECYCLE_WORDS.ledger.resume.auto}`],
  );
  assert.equal(pause.proposal.payload.mode, "auto");
  assert.equal(pause.proposal.payload.sequence_mode, undefined, "a pause changes no mode");
  assert.equal(pause.proposal.summary, `${PLAYBOOK_PATCH_WORDS.paused} · ${PLAYBOOK_PATCH_WORDS.pausedWaits(12)}`);
  assert.equal(pause.proposal.payload.run_waits, true);
  // Its words are new: its next batch asks whatever its mode, so its undo never promises it sends on its own.
  const fresh = await change({ state: "paused" }, tables({ playbooks: [playbookRow({ words_ok_at: null })] }));
  assert.deepEqual([fresh.proposal.undo, fresh.proposal.payload.mode], ["Resume it", "ask"]);
  // With no run waiting, a pause says what it does and nothing of a run.
  const quiet = await change({ state: "paused" });
  assert.equal(quiet.proposal.summary, PLAYBOOK_PATCH_WORDS.paused);
  const resume = await change({ state: "running" }, tables({ playbooks: [playbookRow({ state: "paused" })] }));
  assert.equal(resume.isError, false, resume.result);
  assert.deepEqual([resume.proposal.title, resume.proposal.undo], ["Resume: Win-back", "Pause it again"]);
  // Under auto it sends on its own: one fact, one sentence, the drawer's Resume line, which the pause's undo says too.
  assert.equal(resume.proposal.summary, PLAYBOOK_PATCH_WORDS.resumed(LIFECYCLE_WORDS.ledger.resume.auto));
  assert.ok(pause.proposal.undo.endsWith(LIFECYCLE_WORDS.ledger.resume.auto));
  // A class with no row made its sequence one that asks (00461 sequence_mode_for), and the card says that one.
  const asks = await change(
    { state: "running" },
    tables({ policies: [], playbooks: [playbookRow({ state: "paused" })] }),
  );
  assert.equal(asks.proposal.summary, "Runs again: each batch waits for your OK");
  // New words under auto: its first batch waits for an OK, and after that each goes on its own.
  const newWords = await change(
    { state: "running" },
    tables({ playbooks: [playbookRow({ state: "paused", words_ok_at: null })] }),
  );
  assert.equal(
    newWords.proposal.summary,
    "Runs again: its first batch waits for your OK; after that, each batch goes on its own",
  );
});

test("its mode (decision 0064): How it runs' choice said with what it was, carried as sequence_mode, committed as the PUT's mode, written on its sequence and undone to what it held; a mode it holds is no change", async () => {
  const rows = tables();
  const made = await change({ mode: "ask" }, rows);
  assert.equal(made.isError, false, made.result);
  const p = made.proposal;
  assert.deepEqual([p.title, p.undo], ["Change: Win-back", "Put it back"]);
  assert.equal(p.summary, PLAYBOOK_PATCH_WORDS.mode("ask", "auto"));
  assert.equal(p.summary, "Before each batch: Ask me, where it was Send it");
  assert.deepEqual([p.payload.sequence_mode, p.payload.mode, p.payload.was], ["ask", undefined, { mode: "auto" }]);
  const spec = PROPOSAL_SPECS.playbook_change;
  const commit = spec.commit(p, { settings: null });
  assert.deepEqual(commit.body, { mode: "ask" }, "the mode, and nothing else");
  const sequence = () => rows.sequences.find((q) => q.id === PB);
  const approved = await sendTo(rows, commit);
  assert.deepEqual(approved.was, { mode: "auto" });
  assert.equal(sequence().mode, "ask");
  await undoTo(rows, p, approved);
  assert.equal(sequence().mode, "auto");
  assert.deepEqual(
    rows.decisions.map((d) => [d.verb, d.undo_of ?? null]),
    [
      ["change_playbook", null],
      ["change_playbook", approved.decision_id],
    ],
  );
  assert.equal(said(await change({ mode: "auto" }, rows)), PLAYBOOK_PATCH_WORDS.same("Win-back"));
  // A resume beside a new mode says the mode it resumes under, then the change.
  const resume = await change(
    { state: "running", mode: "veto" },
    tables({ playbooks: [playbookRow({ state: "paused" })] }),
  );
  assert.equal(
    resume.proposal.summary,
    [PLAYBOOK_PATCH_WORDS.resumed(SEQUENCE_MODE_WORDS.veto.does), PLAYBOOK_PATCH_WORDS.mode("veto", "auto")].join(
      " · ",
    ),
  );
});

test("a sequence to leads takes its mode here as its state: held or asked, said as How it runs says it, never Send it", async () => {
  const leads = tables({
    playbooks: [
      playbookRow({ id: STEP, kind: "reach_out", trigger: "lead_first", name: "Movers", policy_class: "outreach" }),
    ],
  });
  const held = await change({ playbook_id: STEP, mode: "veto" }, leads);
  assert.equal(held.isError, false, held.result);
  assert.equal(held.proposal.summary, PLAYBOOK_PATCH_WORDS.mode("veto", "ask"));
  assert.deepEqual([held.proposal.payload.sequence_mode, held.proposal.payload.was], ["veto", { mode: "ask" }]);
  await sendTo(leads, PROPOSAL_SPECS.playbook_change.commit(held.proposal, { settings: null }));
  assert.equal(leads.sequences.find((q) => q.id === STEP).mode, "veto");
  assert.equal(said(await change({ playbook_id: STEP, mode: "auto" }, leads)), PLAYBOOK_PATCH_WORDS.modeLeads);
});

test("a change is refused in words before any card: not an id, not this workspace's, a sequence to leads past its state, a value out of bounds, a cadence off the month's offer, and nothing that would change", async () => {
  assert.match(said(await change({ playbook_id: "nope", state: "paused" })), /^playbook_id must be a playbook's id/);
  assert.match(
    said(await change({ playbook_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9", state: "paused" })),
    /^no such playbook in this workspace/,
  );
  const step = tables({
    playbooks: [playbookRow({ id: STEP, kind: "reach_out", trigger: "lead_first", name: "Movers" })],
  });
  // A sequence to leads is paused or resumed here as its page does it (decision 0060: Ask runs every sequence), in its
  // page's words and never under a class's mode; anything else of it is its page's.
  const paused = await change({ playbook_id: STEP, state: "paused" }, step);
  assert.deepEqual(
    [paused.proposal?.kind, paused.proposal?.summary, paused.proposal?.payload.state, paused.proposal?.payload.was],
    ["playbook_change", PLAYBOOK_PATCH_WORDS.paused, "paused", { state: "running" }],
  );
  assert.match(
    said(await change({ playbook_id: STEP, name: "Movers again" }, step)),
    /only paused, resumed or given its mode here/,
  );
  assert.equal(said(await change({ run_hour: 7 })), "The hour must be a whole number from 9 to 20.");
  assert.equal(said(await change({ name: "x".repeat(81) })), PLAYBOOK_PATCH_WORDS.nameLong(80));
  assert.equal(said(await change({ cadence_days: 14 })), PLAYBOOK_PATCH_WORDS.cadenceOffer("Win-back"));
  assert.equal(said(await change({ state: "running", run_hour: 10 })), PLAYBOOK_PATCH_WORDS.same("Win-back"));
  // A field only another action takes is refused by the registry, so a change card never quietly becomes another.
  assert.match(said(await change({ state: "paused", trigger: "lapsed" })), /trigger/);
  assert.ok(REACH_OUT_IS_NOT_A_MOMENT);
});

test("a part asked that the campaign already holds is left off the card and said, on the card and to the model (the operator stress run, 15 Oct 2026: a pause of a Win-back already paused, beside a new gap, made the gap's card and never said so); what it leaves as it is never rides in the payload", async () => {
  const paused = tables({ playbooks: [playbookRow({ state: "paused" })] });
  const made = await change({ state: "paused", gap_days: 45 }, paused);
  assert.equal(made.isError, false, made.result);
  const already = "“Win-back” is already paused, so the card leaves that as it is";
  assert.equal(made.noted, already, "the outcome carries it, for the turn's answer");
  assert.equal(made.proposal.title, "Change: Win-back", "a change, never a pause");
  assert.equal(made.proposal.summary, [PLAYBOOK_PATCH_WORDS.gap_days(45, 90), already].join(" · "));
  assert.deepEqual(
    [made.proposal.payload.state, made.proposal.payload.gap_days, made.proposal.payload.was],
    [undefined, 45, { gap_days: 90 }],
  );
  assert.equal(JSON.parse(made.result).also_say, `${already}: say so in the answer beside the card`);
  // Each part that holds already, in the card's order and the campaign's words.
  const two = await change({ state: "running", run_hour: 10, name: "Back again" });
  assert.equal(
    two.noted,
    "“Win-back” is already running and already runs at 10:00 AM, so the card leaves that as it is",
  );
  const three = await change({ state: "running", run_hour: 10, gap_days: 90, cap_per_run: 30 });
  assert.equal(
    three.noted,
    "“Win-back” is already running, already runs at 10:00 AM and already waits 90 days before reaching a person again, so the card leaves that as it is",
  );
  // Nothing held already: nothing noted.
  const plain = await change({ gap_days: 45 });
  assert.deepEqual([plain.noted, "also_say" in JSON.parse(plain.result)], [undefined, false]);
  // REGRESSION (the run of 16 Oct, 3 of 3): the model saw the Win-back paused and asked the gap alone. A change to a
  // paused campaign's runs says it waits for the resume; a rename runs nothing, and a resume beside it says nothing.
  const gapOnly = await change({ gap_days: 45 }, paused);
  assert.equal(gapOnly.noted, "“Win-back” is paused, so none of this runs until it is resumed");
  assert.equal(gapOnly.proposal.summary, [PLAYBOOK_PATCH_WORDS.gap_days(45, 90), gapOnly.noted].join(" · "));
  const renamed = await change({ name: "Past clients" }, paused);
  assert.equal(renamed.noted, undefined, "a rename runs nothing");
  const resumed = await change({ state: "running", gap_days: 45 }, paused);
  assert.equal(resumed.noted, undefined, "resumed in the same card");
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

test("an undo restores what the door recorded, past or not: a resume under a new mode, and a later end on a campaign that has ended, are undone to the past values, each line naming the line it undoes; a PUT that is no undo still refuses a past end or a mode none of the three", async () => {
  // Paused, its sequence sending on its own; resumed now to be held for a stop.
  const rows = tables({ playbooks: [playbookRow({ state: "paused" })] });
  const resumed = (await change({ state: "running", mode: "veto" }, rows)).proposal;
  assert.deepEqual(resumed.payload.was, { state: "paused", mode: "auto" });
  const spec = PROPOSAL_SPECS.playbook_change;
  const approved = await sendTo(rows, spec.commit(resumed, { settings: null }));
  const sequence = () => rows.sequences.find((q) => q.id === PB);
  assert.deepEqual([rows.playbooks[0].state, sequence().mode], ["running", "veto"]);
  await undoTo(rows, resumed, approved);
  assert.deepEqual([rows.playbooks[0].state, sequence().mode], ["paused", "auto"], "as it was");
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

  // A PUT that names no undo is judged as any change is: a past end and a mode none of the three are refused.
  const direct = (body) => sendTo(over, { route: "PUT playbooks/[id]", params: { id: PB }, body });
  await assert.rejects(direct({ until: "2026-09-11" }), (e) => {
    assert.match(e.message, /^An end is today or later: today is /);
    return true;
  });
  await assert.rejects(direct({ mode: "never" }), (e) => {
    assert.equal(e.message, PLAYBOOK_PATCH_WORDS.modeWhich);
    return true;
  });
  assert.deepEqual(
    [over.playbooks[0].until, over.sequences.find((q) => q.id === PB).mode],
    ["2026-09-10", "auto"],
    "nothing written",
  );
  assert.equal(over.decisions.length, 2, "no line for a refused change");
});
