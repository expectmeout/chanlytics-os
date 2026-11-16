/**
 * The line its owner approves is the one that goes (the review of 16 November 2026). An email that carries their
 * preview had its line written from the listing while its run waited for its owner, since the preview was made only when
 * the email went; once made, the sender saw a mark the line was not stamped with, and the line was written again, from
 * the preview, and went unread. Now:
 *
 *   the check    an email its owner reads first (its run waits for their OK), or one due soon, has its preview made
 *                before its line is written: it is asked for, and the line waits the minutes a build takes; the day's
 *                all made, it waits the hour; with none to make (the switch off, a lead the door refuses) its line is
 *                written as any other, now. An email days off that nobody reads first, and a press, write now from
 *                what stands.
 *   the stamp    a line its owner reads first is stamped with which preview alone, and the sender takes that as it
 *                stands: what the lead does with their preview after the OK never writes the approved line again. A
 *                line in a run that goes without an OK keeps the preview's whole mark, and follows what they did.
 *
 * Made-up businesses only.
 */
import { test, after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fakeLog } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";
import { importSrc } from "../_source.mjs";
import { T, ago, ahead, send, record, world, byBusiness } from "../reach-out/check/_world.mjs";

const { checkSends } = await import(at("apps/edge/lib/campaigns/reach-out/check.ts"));
const { lineMarkOf } = await importSrc("apps/edge/lib/previews/for-opening.ts");
const { lineStands } = await importSrc("apps/edge/lib/campaigns/reach-out/sender/their-preview.ts");
const { checkedWordsOf } = await import("@chanlytics/channels/email");

const MIN = 60_000;
const DAY = 86_400_000;
const CARRIES = { subject: "Quick one", body: "{{opening}}\n\nI set it up for you: {{their preview}}" };
const WROTE = (opening, over = {}) => ({ opening, angle: "their reviews", facts_used: ["rating"], ...over });
const READ = () => ({ backed: true, unbacked: "", pitch: false, language: "en" });

const leadRow = (id, name) => ({
  id,
  tenant_id: T,
  kind: "place",
  stage: "ready",
  erased_at: null,
  blanked_at: null,
  business_name: name,
  city: "Austin",
  region: "TX",
});
/** What a preview's own workspace holds: what it knows of the business, as a made one holds it. */
const PREVIEW_BRAIN = {
  business_name: "Kvitka Salon",
  booking_link: "https://book.example/kvitka",
  system_prompt: "Answer as the front desk of Kvitka Salon: brief and warm.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { services: [{ name: "Gel nails", duration_min: 60 }] },
};
/** A preview of the lead's that is open, and how far they used it. */
const openPreview = (leadId, over = {}) => ({
  id: `pv-${leadId}`,
  tenant_id: T,
  lead_id: leadId,
  preview_tenant_id: null,
  state: "ready",
  token: "TokenTokenTokenToken01",
  ends_at: ahead(20 * DAY),
  created_at: ago(DAY),
  asked_count: 0,
  call_count: 0,
  call_seconds: 0,
  not_right: [],
  ...over,
});

// No business's website answers: each line is written from its record, and its preview where it has one.
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("", { status: 404 });
after(() => {
  globalThis.fetch = realFetch;
});
const was = process.env.LEAD_PREVIEWS;
beforeEach(() => {
  process.env.LEAD_PREVIEWS = "on";
});
afterEach(() => {
  if (was === undefined) delete process.env.LEAD_PREVIEWS;
  else process.env.LEAD_PREVIEWS = was;
});
const tick = (w, ask, over = {}) =>
  checkSends({ db: w.db, now: new Date(), started: Date.now(), log: fakeLog(), ask, ...over });
/** Minutes from now to a send's next check, as it was written. */
const waitsMinutes = (row) => Math.round((Date.parse(row.check_after) - Date.now()) / MIN);
/** The send free to be checked again, as its wait over and its lease lapsed would leave it. */
const due = (row) => Object.assign(row, { check_after: ago(MIN), check_started_at: null });

test("an email its owner reads first has its preview made before its line is written, and the line is written from it", async () => {
  const waiting = send({ lead_id: "kvitka" });
  const w = world({
    sends: [waiting],
    records: { kvitka: record("Kvitka Salon") },
    body: CARRIES,
    leads: [leadRow("kvitka", "Kvitka Salon")],
    run: "pending_approval",
  });
  const m = byBusiness({ "Kvitka Salon": [WROTE("It already knows you do gel nails."), READ()] });
  const first = await tick(w, m.ask);
  assert.equal(first.waited, 1);
  assert.deepEqual(m.calls, [], "no line is written before the preview stands");
  assert.equal(w.row(waiting.id).checked_at, null);
  assert.equal(w.row(waiting.id).opening, null);
  assert.equal(waitsMinutes(w.row(waiting.id)), 3, "the minutes a build takes");
  const made = w.tables.lead_previews.find((p) => p.lead_id === "kvitka");
  assert.equal(made?.state, "building", "their preview is asked for now, not when the email goes");
  assert.deepEqual(
    w.tables.jobs.filter((j) => j.kind === "preview_build").map((j) => j.payload.preview_id),
    [made.id],
    "its build is scheduled",
  );

  // Still being made a tick later: it waits again, and nothing more is asked for.
  due(w.row(waiting.id));
  assert.equal((await tick(w, m.ask)).waited, 1);
  assert.equal(w.tables.lead_previews.length, 1);

  // Made: the line is written from it, and it is the line the owner reads.
  const PREVIEW_WS = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  w.tables.tenant_config.push({ tenant_id: PREVIEW_WS, config: { brain: PREVIEW_BRAIN }, version: 1 });
  Object.assign(made, openPreview("kvitka", { preview_tenant_id: PREVIEW_WS }));
  due(w.row(waiting.id));
  const written = await tick(w, m.ask);
  assert.deepEqual([written.checked, written.waited], [1, 0]);
  assert.match(m.calls[0], /preview_knows: 1 service \(Gel nails\)/, "the writer is told what the preview knows");
  assert.equal(w.row(waiting.id).opening, "It already knows you do gel nails.");
  assert.equal(w.row(waiting.id).checked_words, checkedWordsOf(CARRIES, "Sam", false, made.id), "which preview alone");
});

test("the day's previews all made, the line waits the hour; with none to make, it is written now, as any other's", async () => {
  const full = world({
    sends: [send({ lead_id: "late" })],
    records: { late: record("Late Barbers") },
    body: CARRIES,
    leads: [leadRow("late", "Late Barbers")],
    previews: Array.from({ length: 50 }, (_, i) => openPreview(`other-${i}`, { created_at: new Date().toISOString() })),
    run: "pending_approval",
  });
  const none = byBusiness({});
  assert.equal((await tick(full, none.ask)).waited, 1);
  assert.deepEqual(none.calls, []);
  const [late] = full.tables.reach_out_sends;
  assert.equal(waitsMinutes(late), 60, "the hour, as the sender holds an email past the day's limit");
  assert.equal(full.tables.lead_previews.length, 50, "nothing is made past the limit");

  // The switch off: nothing can be made, so nothing is waited for.
  process.env.LEAD_PREVIEWS = "off";
  const off = world({
    sends: [send({ lead_id: "off" })],
    records: { off: record("Off Barbers") },
    body: CARRIES,
    leads: [leadRow("off", "Off Barbers")],
    run: "pending_approval",
  });
  const m = byBusiness({ "Off Barbers": [WROTE("A 4.9 across 16 reviews says people find you."), READ()] });
  const out = await tick(off, m.ask);
  assert.deepEqual([out.checked, out.waited], [1, 0]);
  assert.ok(m.calls.every((user) => !/preview_/.test(user)));
  assert.deepEqual(off.tables.lead_previews, []);
});

test("an email days off that nobody reads first, and a press, are written now from what stands", async () => {
  const later = send({ lead_id: "far", due_soon: false, send_at: ahead(3 * DAY) });
  const w = world({
    sends: [later],
    records: { far: record("Far Movers") },
    body: CARRIES,
    leads: [leadRow("far", "Far Movers")],
  });
  const m = byBusiness({ "Far Movers": [WROTE("A 4.9 across 16 reviews says people find you."), READ()] });
  assert.deepEqual([(await tick(w, m.ask)).checked, w.tables.lead_previews.length], [1, 0], "made when it goes");

  const pressed = send({ lead_id: "pressed" });
  const p = world({
    sends: [pressed],
    records: { pressed: record("Pressed Movers") },
    body: CARRIES,
    leads: [leadRow("pressed", "Pressed Movers")],
    run: "pending_approval",
  });
  const asked = byBusiness({ "Pressed Movers": [WROTE("A 4.9 across 16 reviews says people find you."), READ()] });
  const out = await tick(p, asked.ask, { sendIds: [pressed.id] });
  assert.deepEqual([out.checked, out.waited, p.tables.lead_previews.length], [1, 0, 0], "a person waits on a press");
});

test("a line its owner reads first is stamped with which preview alone; one in a run that goes without an OK, with how far they used it", async () => {
  const stamped = async (run) => {
    const s = send({ lead_id: "used" });
    const w = world({
      sends: [s],
      records: { used: record("Used Movers") },
      body: CARRIES,
      leads: [leadRow("used", "Used Movers")],
      previews: [openPreview("used", { asked_count: 4, call_count: 1, call_seconds: 130 })],
      run,
    });
    const m = byBusiness({
      "Used Movers": [WROTE("You asked it 4 questions.", { facts_used: ["preview_tried"] }), READ()],
    });
    assert.equal((await tick(w, m.ask)).checked, 1);
    return w.row(s.id).checked_words;
  };
  assert.equal(await stamped("pending_approval"), checkedWordsOf(CARRIES, "Sam", false, "pv-used"));
  assert.equal(await stamped("scheduled"), checkedWordsOf(CARRIES, "Sam", false, "pv-used:4:1:0"));
});

test("the sender takes a line as the check stamped it: approved, whatever the lead did since; otherwise, as they stand", () => {
  const preview = { id: "pv-1", mark: "pv-1:4:1:0" };
  assert.equal(lineMarkOf(CARRIES, preview, false), "pv-1:4:1:0");
  assert.equal(lineMarkOf(CARRIES, preview, true), "pv-1", "read first: which preview alone");
  assert.equal(lineMarkOf(CARRIES, null, true), null);
  assert.equal(lineMarkOf({ subject: null, body: "Here it is: {{their preview}}" }, preview, false), null, "no line");

  const stampOf = (mark) => checkedWordsOf(CARRIES, "Sam", false, mark);
  const now = { id: "pv-1", did: "pv-1:6:2:1" };
  // Approved when they had used it four times: they used it since, and the approved line still goes.
  assert.equal(lineStands(stampOf("pv-1"), CARRIES, now, stampOf), true);
  // Written in a run that went without an OK: the line is written again from what they did since.
  assert.equal(lineStands(stampOf("pv-1:4:1:0"), CARRIES, now, stampOf), false);
  assert.equal(lineStands(stampOf("pv-1:6:2:1"), CARRIES, now, stampOf), true);
  // Written before the preview stood, or for another preview: written again either way.
  assert.equal(lineStands(stampOf(null), CARRIES, now, stampOf), false);
  assert.equal(lineStands(stampOf("pv-0"), CARRIES, now, stampOf), false);
  // No preview open, or words with no line: the words alone.
  assert.equal(lineStands(stampOf(null), CARRIES, { id: null, did: null }, stampOf), true);
  assert.equal(lineStands(stampOf(null), CARRIES, null, stampOf), true);
});
