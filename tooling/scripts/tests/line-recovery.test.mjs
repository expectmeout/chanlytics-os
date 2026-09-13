/**
 * A line that stopped setting up can start again.
 *
 * THE DEFECT, and it was not a rare crash. The provisioning saga runs inside its own
 * request, capped at 60 seconds (apps/edge/vercel.json), and it makes ten Twilio
 * calls at a 15-second timeout each plus four Retell calls at eight — about 180
 * seconds worst case, three times the ceiling. So a run is killed by a slow
 * afternoon at the provider, and a killed run never reaches the `catch` that would
 * have written `voice_state = 'failed'`.
 *
 * Then nothing would touch it. No sweep read `lines` for this, `retry` demanded
 * `failed`, `buy` refused as `line_exists`, `number_drift()` deliberately exempts a
 * line still being set up, and the owner's Setup row said "usually a minute or two"
 * with no button, for ever. The only exit was a platform admin handing the number
 * back permanently so the owner could buy a different one — and that escape left a
 * disabled routing row beside the new active one, which is the second defect below.
 *
 * Everything here is about making the state leaveable, by the three people who
 * might want it to: the owner, support, and nobody at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PROVISIONING_DEADLINE_MS, lineStuckProvisioning, lineRetryRefusal, setupSteps, platformLineActions, channelFor, toChannelVM,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";
import { fakeDb, fakeLog } from "./_fake-db.mjs";
import { claimLineForResume, sweepStuckLines, retryRequestedBy, automaticResumesOf, countAutomaticResume, MAX_AUTOMATIC_RESUMES } from "../../../apps/edge/lib/line-resume.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const NOW = 1_800_000_000_000;
const ago = (ms) => new Date(NOW - ms).toISOString();

const line = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  e164: "+13055550100", kind: "chanlytics", provider: "twilio", area_code: 305,
  voice_state: "provisioning", sms_state: "none", whatsapp_state: "none",
  port_state: "none", forwarding_state: "none",
  step: "trunk", last_error: null,
  state_since: ago(30 * 60_000), created_at: ago(30 * 60_000),
  ...over,
});

/* ------------------------------- the deadline ------------------------------ */

test("the deadline is one number, and it does not fire on a saga that is still running", () => {
  // Five minutes against a three-minute worst case. A state that is genuinely still
  // running must never be declared dead underneath itself — a resume that races the
  // original would have two sagas writing one row.
  assert.ok(PROVISIONING_DEADLINE_MS > 3 * 60_000, "past the saga's own worst case");
  assert.ok(PROVISIONING_DEADLINE_MS <= 10 * 60_000, "and not so long that a customer is left guessing");

  assert.equal(lineStuckProvisioning(line({ state_since: ago(10_000) }), NOW), false, "ten seconds in");
  assert.equal(lineStuckProvisioning(line({ state_since: ago(PROVISIONING_DEADLINE_MS - 1_000) }), NOW), false, "just inside");
  assert.equal(lineStuckProvisioning(line({ state_since: ago(PROVISIONING_DEADLINE_MS + 1_000) }), NOW), true, "just past");

  // Only this state. A line that answers is not stuck, and a failed one already has
  // its own words and its own button.
  for (const st of ["none", "answering", "failed"]) {
    assert.equal(lineStuckProvisioning(line({ voice_state: st, state_since: ago(99 * 60_000) }), NOW), false, st);
  }
  assert.equal(lineStuckProvisioning(null, NOW), false);
  // An unparseable stamp is not evidence of being stuck: reading it as stuck would
  // let a bad clock restart a saga that is running right now.
  assert.equal(lineStuckProvisioning(line({ state_since: "not a date" }), NOW), false, "a bad stamp is not a deadline");
});

/* ------------------------- what each person is shown ----------------------- */

const setupDto = (lines) => ({
  business: { name: "Northside Movers", hours: true, services: 2, address: "1 Main St", handoff: null, broken: false },
  channels: {
    voice: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0 },
  calendar: { state: "none", events: 0 },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0 },
  requests: { line: null },
  lines: { rows: lines, ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  conflicts: [],
  later: [],
});
const rowOf = (vm, id) => vm.rows.find((r) => r.id === id);

test("THE OWNER: past the deadline the row stops saying 'a minute or two' and offers the retry it withheld", () => {
  const fresh = setupSteps(setupDto([line({ state_since: ago(60_000) })]), NOW);
  assert.match(rowOf(fresh, "line").sentence, /Setting up/);
  assert.equal(rowOf(fresh, "line").verb, null, "a minute in, there is nothing to press and nothing to say");
  assert.ok(rowOf(fresh, "line").details.some((d) => /minute or two/.test(d)));

  const stuck = setupSteps(setupDto([line({ state_since: ago(30 * 60_000) })]), NOW);
  const r = rowOf(stuck, "line");
  assert.match(r.sentence, /stopped while/, "it says it stopped");
  // It says what WILL happen, not what has. This row used to claim "A person at
  // Chanlytics has it" and "We have been told" -- and nothing had told anybody: a
  // saga cut off by its lambda returns nothing, so the failure email never fires.
  // The sweep's first pickup is what tells the platform now, and that comes after
  // this row first shows.
  assert.doesNotMatch(r.sentence, /A person at Chanlytics has it/, "REGRESSION: a claim nothing had made true");
  assert.ok(!r.details.some((d) => /We have been told/.test(d)), "REGRESSION: 'we have been told' before anybody was");
  assert.ok(r.details.some((d) => /Chanlytics is told when it is/.test(d)), "and it says when somebody will be");
  assert.ok(!/minute or two/.test(r.details.join(" ")), "REGRESSION: 'usually a minute or two', half an hour in");
  assert.equal(r.verb.label, "Retry");
  assert.match(r.verb.to, /^verb:retry-line:/, "the same verb the failed branch has always had");
  assert.ok(r.details.some((d) => /buys nothing twice/.test(d)), "and it says why pressing it is safe");
  assert.ok(r.details.some((d) => /retried automatically/.test(d)), "and that nobody has to be watching");
});

test("SUPPORT: the back office offers the same retry, which it offered for nothing before", () => {
  const stuck = line({ state_since: ago(30 * 60_000) });
  const acts = platformLineActions(stuck, NOW);
  const retry = acts.find((a) => a.action === "retry");
  assert.ok(retry, "a line stuck setting up is retryable");
  assert.equal(retry.permanent, false);
  assert.match(retry.sentence, /reads its own receipts/, "and says why it is safe");

  // Before the deadline it is not offered: the saga may still be running.
  assert.equal(platformLineActions(line({ state_since: ago(60_000) }), NOW).some((a) => a.action === "retry"), false);
  // A failed line keeps the action it always had.
  assert.ok(platformLineActions(line({ voice_state: "failed" }), NOW).some((a) => a.action === "retry"));
  // And release is still offered, because it is still the answer for a number a
  // workspace is giving up — it is just no longer the ONLY answer.
  assert.ok(acts.some((a) => a.action === "release" && a.permanent === true));
});

/* ----------------------------- the two doors ------------------------------ */

test("the retry rule accepts a line the wall killed, and refuses one that is still running", () => {
  // BEHAVIOUR, not text. This test used to read `apps/edge/api/admin/lines.ts` and
  // assert five regexes against an `if` statement buried in a 400-line handler —
  // it passed whether or not the rule was right, and it was one of thirty-six such
  // assertions added in a single day. The rule now returns a value, so it has a
  // seam, so it can simply be called.
  assert.equal(lineRetryRefusal(line({ voice_state: "failed" }), NOW), null, "a failed line has always been retryable");
  assert.equal(lineRetryRefusal(line({ state_since: ago(30 * 60_000) }), NOW), null, "and now so is one the wall killed");

  // Still running: refused, but with something a person can act on. "Not failed"
  // is true of this and useless to it.
  const running = lineRetryRefusal(line({ state_since: ago(60_000) }), NOW);
  assert.match(running, /still setting up/);
  assert.match(running, /retried automatically after that/, "so nobody sits refreshing");
  assert.doesNotMatch(running, /not failed/, "REGRESSION: the sentence that told a waiting person nothing");

  // Every other state names itself, which is what support needs to see.
  assert.equal(lineRetryRefusal(line({ voice_state: "answering" }), NOW), "the line is answering, not failed");
  assert.equal(lineRetryRefusal(line({ voice_state: "none" }), NOW), "the line is none, not failed");
  assert.equal(lineRetryRefusal(null, NOW), "no such line");

  // The refusal and the deadline agree by construction: one reads the other.
  for (const age of [0, 60_000, PROVISIONING_DEADLINE_MS - 1, PROVISIONING_DEADLINE_MS + 1, 99 * 60_000]) {
    const l = line({ state_since: ago(age) });
    assert.equal(
      lineRetryRefusal(l, NOW) === null,
      lineStuckProvisioning(l, NOW),
      `a provisioning line is retryable exactly when it is stuck (age ${age}ms)`,
    );
  }
});

test("the sweep's route: its own preconditions, its bound, its schedule, and its 60 seconds", () => {
  // What the sweep DECIDES -- which lines, the take, the count, when the platform
  // hears -- moved to lib/line-resume.ts and is run below against a fake database;
  // the pins that read those decisions off the route went with it. What stays is
  // what nothing runs: the route's own refusals, and configuration.
  const sweep = readCode("apps/edge/api/cron/lines.ts");
  // A small bound, because each item is a whole saga and this sweep exists to clean
  // up a half-run saga rather than to create more of them.
  assert.match(sweep, /const MAX_PER_TICK = 2;/);
  // The provider preconditions the writing ops check, so a tick that cannot
  // provision says so instead of reporting a clean sweep over lines it never touched.
  assert.match(sweep, /no_line_provider/);
  assert.match(sweep, /no_provider_key/);

  // Registered, scheduled, and watched from its first tick.
  const m = readRaw("supabase/migrations/00097_a_line_stops_being_stuck.sql");
  assert.match(m, /check \(sweep in \('calls', 'deadman', 'health', 'jobs', 'registration', 'calendar', 'google', 'playbooks', 'lines'\)\)/);
  assert.match(m, /values \('lines', now\(\)\)/, "the deploy grace row, or the first health run mails a false alarm");
  assert.match(m, /select public\.request_sweep\('lines', '\/api\/cron\/lines'\)/);
  assert.match(m, /cron\.schedule\('lines-sweep', '8,23,38,53 \* \* \* \*'/);
  assert.doesNotMatch(m, /cron\.schedule\('lines-sweep', '13,43/, "never onto the health check's own grid");
  assert.match(readRaw("apps/edge/vercel.json"), /"api\/cron\/lines\.ts"/, "or Vercel gives it ten seconds");
});

/* ---------------------- taking a line, and the sweep, run ---------------------- */

const TENANT = { id: "22222222-2222-4222-8222-222222222222", name: "Northside Movers" };
/** A row as the database holds it: the columns line-resume reads, and its facts. */
const dbRow = (over = {}) => ({
  id: "33333333-3333-4333-8333-333333333333",
  tenant_id: TENANT.id,
  e164: "+13055550100",
  voice_state: "provisioning",
  step: "trunk",
  last_error: null,
  state_since: ago(30 * 60_000),
  facts: {},
  ...over,
});
/** What the sweep is handed, recording every call. */
function deps({ resume = async () => ({ ok: true }) } = {}) {
  const calls = { resume: [], alert: [], failed: [] };
  return {
    calls,
    deps: {
      resume: async (tenant, row) => { calls.resume.push({ tenant, row }); return resume(tenant, row); },
      alert: async (subject, body) => { calls.alert.push({ subject, body }); },
      reportFailed: async (tenant, row, error) => { calls.failed.push({ tenant, row, error }); },
      now: () => NOW,
      log: fakeLog(),
    },
  };
}

test("taking a line is exclusive: two callers, one line, exactly one of them wins", async () => {
  // THE RACE. A resume used to be read-check-run. The sweep and an owner's Retry --
  // or an owner and support at once -- could both read the line stuck and both run
  // the same saga on one row: two trunks at the carrier, two writers on the row.
  // Taking it is now one compare-and-swap, and the fake applies it the way Postgres
  // does: to whatever matches at the moment it runs.
  for (const start of [dbRow(), dbRow({ voice_state: "failed" })]) {
    // Both callers read the SAME row before either acts -- that is the race.
    const read = { ...start };
    const db = fakeDb({ lines: [{ ...start }] });
    const first = await claimLineForResume(db, read, NOW, "owner");
    const second = await claimLineForResume(db, read, NOW, "support");
    assert.ok(first, `${start.voice_state}: the first caller takes it`);
    assert.equal(first.voice_state, "provisioning", "and the take is visible on the row");
    assert.equal(first.state_since, new Date(NOW).toISOString(), "with a clock that restarts now");
    assert.equal(second, null, `${start.voice_state}: the second caller's filters match nothing, so it learns somebody has it`);
  }
  // A saga that is genuinely still running is never taken from underneath itself.
  const running = dbRow({ state_since: ago(60_000) });
  assert.equal(await claimLineForResume(fakeDb({ lines: [{ ...running }] }), running, NOW, "sweep"), null);
  // Nor is a line that answers.
  const answering = dbRow({ voice_state: "answering" });
  assert.equal(await claimLineForResume(fakeDb({ lines: [{ ...answering }] }), answering, NOW, "owner"), null);
});

test("a person's Retry clears the automatic count; the sweep's own tries are what it counts", async () => {
  const worn = dbRow({ voice_state: "failed", facts: { automatic_resumes: MAX_AUTOMATIC_RESUMES, trunk_ready: true } });
  const byOwner = await claimLineForResume(fakeDb({ lines: [{ ...worn }] }), worn, NOW, "owner");
  assert.equal(automaticResumesOf(byOwner), 0, "a person pressing Retry is a fresh decision to try");
  assert.equal(byOwner.facts.trunk_ready, true, "and every receipt the saga reads survives the take");

  const stuck = dbRow({ facts: { automatic_resumes: 2 } });
  const bySweep = await claimLineForResume(fakeDb({ lines: [{ ...stuck }] }), stuck, NOW, "sweep");
  assert.equal(automaticResumesOf(bySweep), 2, "the sweep leaves its own count alone at the take");
});

test("who pressed Retry is who the platform is told pressed it", () => {
  // The edge wrote "support" for every retry, so an owner pressing the button on
  // their own Setup page reached the platform mailbox as "started by support".
  assert.equal(retryRequestedBy("owner"), "owner");
  for (const raw of ["support", undefined, null, "", "sweep", "OWNER"]) {
    assert.equal(retryRequestedBy(raw), "support", `${JSON.stringify(raw)} came from somebody holding the diagnostic key`);
  }
});

test("the sweep resumes a stuck line from the row it TOOK, counts the try, and tells the platform once", async () => {
  const lines = [dbRow()];
  const db = fakeDb({ lines, tenants: [{ ...TENANT }] });
  const { calls, deps: d } = deps();
  const out = await sweepStuckLines(db, d, 2);

  assert.deepEqual(out, { stuck: 1, resumed: 1, failed: 0, gaveUp: 0, skipped: 0, unreadable: 0 });
  assert.equal(calls.resume.length, 1);
  // The saga starts from the row as it is after the take, never from the snapshot
  // the sweep read -- which can predate steps another run finished.
  assert.equal(calls.resume[0].row.state_since, new Date(NOW).toISOString());
  assert.equal(automaticResumesOf(calls.resume[0].row), 1, "the saga is handed the counted row");
  assert.equal(automaticResumesOf(lines[0]), 1, "and the count is on the row itself, for the next tick");
  // "We have been told" is made TRUE here: this is the first moment anything in the
  // product knows the line is stuck.
  assert.equal(calls.alert.length, 1);
  assert.match(calls.alert[0].subject, /^Line stuck · Northside Movers$/);
  assert.match(calls.alert[0].body, /try 1 of 3/);
  assert.equal(calls.failed.length, 0);
});

test("later tries go to the ledger, not the mailbox", async () => {
  const lines = [dbRow({ facts: { automatic_resumes: 1 } })];
  const { calls, deps: d } = deps();
  const out = await sweepStuckLines(fakeDb({ lines, tenants: [{ ...TENANT }] }), d, 2);
  assert.equal(out.resumed, 1);
  assert.equal(calls.alert.length, 0, "the platform heard at the first try, and hears again only if it is handed a person");
  assert.equal(automaticResumesOf(lines[0]), 2);
});

test("past the ceiling a line is handed to a person, in the same words a returned failure uses", async () => {
  // Without a ceiling, a line that can never finish inside its lambda would be
  // resumed and killed every quarter hour for ever.
  const lines = [dbRow({ facts: { automatic_resumes: MAX_AUTOMATIC_RESUMES } })];
  const { calls, deps: d } = deps();
  const out = await sweepStuckLines(fakeDb({ lines, tenants: [{ ...TENANT }] }), d, 2);
  assert.deepEqual(out, { stuck: 1, resumed: 0, failed: 0, gaveUp: 1, skipped: 0, unreadable: 0 });
  assert.equal(calls.resume.length, 0, "no fourth automatic try");
  assert.equal(lines[0].voice_state, "failed", "failed is the state every Retry button already knows");
  assert.match(lines[0].last_error, /3 automatic tries did not finish it/);
  assert.equal(calls.failed.length, 1, "told through reportLineFailed: the bell, the platform, the ledger");
  assert.equal(calls.alert.length, 0);
});

test("a line somebody restarted between the sweep's read and its take is left to them", async () => {
  // The race, run. The sweep reads two stuck lines; while it is resuming the first,
  // somebody presses Retry on the second. The sweep's take of the second names a
  // `state_since` that is no longer there, so it matches nothing.
  const lines = [dbRow(), dbRow({ id: "44444444-4444-4444-8444-444444444444", state_since: ago(40 * 60_000) })];
  const db = fakeDb({ lines, tenants: [{ ...TENANT }] });
  const { calls, deps: d } = deps({
    resume: async (_tenant, row) => {
      const other = lines.find((l) => l.id !== row.id);
      Object.assign(other, { state_since: new Date(NOW).toISOString(), voice_state: "provisioning" });
      return { ok: true };
    },
  });
  const out = await sweepStuckLines(db, d, 2);
  assert.equal(out.resumed, 1);
  assert.equal(out.skipped, 1, "the second line was somebody else's by then");
  assert.equal(calls.resume.length, 1, "and exactly one saga ran");
});

test("a workspace that cannot be read leaves its line untouched for the next tick", async () => {
  const lines = [dbRow()];
  const before = { ...lines[0] };
  const { calls, deps: d } = deps();
  const out = await sweepStuckLines(fakeDb({ lines, tenants: [] }), d, 2);
  assert.equal(out.unreadable, 1);
  assert.equal(lines[0].state_since, before.state_since, "not taken and then abandoned");
  assert.equal(calls.resume.length, 0);
});

test("a resume that dies outside its own error handling is counted, and the line stays taken", async () => {
  const lines = [dbRow()];
  const { deps: d } = deps({ resume: async () => { throw new Error("socket hang up"); } });
  const out = await sweepStuckLines(fakeDb({ lines, tenants: [{ ...TENANT }] }), d, 2);
  assert.equal(out.failed, 1);
  assert.equal(automaticResumesOf(lines[0]), 1, "the try counts, so a line that always dies still reaches the ceiling");
  assert.equal(lines[0].voice_state, "provisioning", "and the next tick after the deadline takes it again");
});

test("a sweep that cannot read the lines says so, instead of reporting a clean pass", async () => {
  const { deps: d } = deps();
  await assert.rejects(
    sweepStuckLines(fakeDb({ lines: [dbRow()] }, { "lines.select": { message: "permission denied" } }), d, 2),
    /lines_sweep_read: permission denied/,
  );
});

/* ------------------- the money the row did not know about ------------------ */

test("THE LOST RECEIPT: a number bought without its SID saved is found, not bought again", async () => {
  // The window is real: `buyNumber` answers, and only THEN is `number_sid` written.
  // A saga killed between the two left the number bought and the row silent — we
  // paid for it monthly, `release` skipped it, `number_drift()` never asked the
  // provider, and a retry could never succeed because a carrier will not sell you a
  // number you already hold. This walks exactly that.
  const { dryProvider } = await import(pathToFileURL(path.join(here, "../../../packages/channels/src/lines-dry.ts")).href);
  const provider = dryProvider();
  const acct = { sid: "ACsub", token: "t" };

  const bought = await provider.buyNumber(acct, "+13055550100", "Northside · Chanlytics");
  assert.match(bought.sid, /^PN/);

  // The row never learned the SID. The saga runs the number step again.
  const found = await provider.ownedNumber(acct, "+13055550100");
  assert.deepEqual(found, { sid: bought.sid, e164: "+13055550100" }, "the same number, with the SID the row lost");

  // And a number nobody bought is honestly absent, so a first filing still buys.
  assert.equal(await provider.ownedNumber(acct, "+13055550999"), null);
});

test("a read that FAILS must not be reported as 'we do not own it'", () => {
  // That answer sends the saga on to buy a second number. So the Twilio
  // implementation throws on a non-200 rather than returning null, and the step
  // retries instead of spending.
  const impl = readCode("packages/channels/src/lines-twilio.ts");
  const body = impl.slice(impl.indexOf("async ownedNumber("), impl.indexOf("async releaseNumber("));
  assert.match(body, /if \(a\.status === 404\) return null;/, "a 404 is a real 'no'");
  assert.match(body, /need\(a, "list owned numbers"\)/, "and anything else throws");
  assert.ok(!/catch/.test(body), "REGRESSION: swallowing the read turns a failure into a purchase");
});

test("release gives back a number the row lost the receipt for", () => {
  const edge = readCode("apps/edge/api/admin/lines.ts");
  assert.match(edge, /const sid = line\.number_sid \?\? \(line\.e164 \? \(await choice\.provider\.ownedNumber\(acct, line\.e164\)\)\?\.sid \?\? null : null\);/);
  assert.match(edge, /released\.number_found_by_lookup = true;/, "and says so, because it means a saga was killed mid-purchase");
  assert.ok(!/if \(line\.number_sid\) \{ await choice\.provider\.releaseNumber/.test(edge),
    "REGRESSION: deleting the row while still paying for the number");
});

/* --------------- and the bug the old escape route created ---------------- */

test("a released line leaves a disabled route beside the active one, and the pick is no longer arbitrary", () => {
  // `release` switches the routing row off rather than deleting it, so calls keep
  // their history — which means a released-then-rebought line legitimately has two
  // voice rows. Postgres row order is unspecified, so `.find(c => c.kind === kind)`
  // picked between them at random; picking the disabled one made `voice.active`
  // false, which read "your line is switched off" over a line that was answering,
  // removed `tryIt`, and bounced the owner back onto Setup.
  //
  // Escaping a stuck line by releasing it was the ONLY exit before this change, so
  // the fix for one used to manufacture the other.
  const rows = [
    { kind: "voice", status: "disabled", number_e164: "+13055550100", created_at: ago(9 * 86_400_000) },
    { kind: "voice", status: "active", number_e164: "+13055550111", created_at: ago(86_400_000) },
    { kind: "whatsapp", status: "active", number_e164: "+13055550222", created_at: ago(86_400_000) },
  ];
  assert.equal(channelFor(rows, "voice").number_e164, "+13055550111", "the ACTIVE one, whatever the order");
  assert.equal(channelFor([...rows].reverse(), "voice").number_e164, "+13055550111", "including reversed");
  assert.equal(channelFor(rows, "whatsapp").number_e164, "+13055550222");
  assert.equal(channelFor(rows, "sms"), null, "no row of that kind at all");

  // Two active rows of one kind: the oldest, deterministically — which is what
  // ensureVoiceAgent, line_forwarding_set and businessPageFor all choose.
  const two = [
    { kind: "voice", status: "active", number_e164: "+1305555AAAA", created_at: ago(86_400_000) },
    { kind: "voice", status: "active", number_e164: "+1305555BBBB", created_at: ago(2 * 86_400_000) },
  ];
  assert.equal(channelFor(two, "voice").number_e164, "+1305555BBBB");
  assert.equal(channelFor([...two].reverse(), "voice").number_e164, "+1305555BBBB");

  // All disabled: still answerable, because `present` means "there is a row at all".
  const off = [{ kind: "voice", status: "disabled", number_e164: "+1305555CCCC", created_at: ago(86_400_000) }];
  assert.equal(channelFor(off, "voice").number_e164, "+1305555CCCC");

  // The SAME rule on the view-model shape, where the fact is spelled `on`.
  const vm = (o) => toChannelVM({ id: o.id, kind: "voice", number_e164: o.n, status: o.status, created_at: o.at, last_inbound_at: null }, new Date(NOW));
  const vms = [vm({ id: "a", n: "+13055550100", status: "disabled", at: ago(9 * 86_400_000) }), vm({ id: "b", n: "+13055550111", status: "active", at: ago(86_400_000) })];
  assert.equal(channelFor(vms, "voice").id, "b");
  assert.equal(channelFor([...vms].reverse(), "voice").id, "b");

  // Both page readers use it, rather than one of them getting it right.
  assert.match(readCode("apps/dashboard/src/server/setup.ts"), /const byKind = \(kind: string\) => channelFor\(channels\.data \?\? \[\], kind\);/);
  assert.match(readCode("apps/dashboard/src/server/setup.ts"), /select\("kind, status, number_e164, config, created_at"\)/, "or the tie-break has nothing to read");
  assert.match(readCode("packages/contracts/src/connections.ts"), /const channel = \(kind: string\) => channelFor\(i\.channels, kind\);/);
});

test("a failure at the vault is named as one: no Retry on the row, the refusal says why, the capability says why", async () => {
  const { lineCredentialFailure, capabilityStatus } = await import("@chanlytics/contracts");
  assert.equal(lineCredentialFailure("keeping the line's credentials: permission denied for schema vault"), true);
  assert.equal(lineCredentialFailure("the subaccount's token is missing from the vault"), true);
  assert.equal(lineCredentialFailure("Twilio 21422: number not available"), false);
  assert.equal(lineCredentialFailure(null), false);
  const wall = line({ voice_state: "failed", last_error: "keeping the line's credentials: permission denied for schema vault" });
  assert.match(lineRetryRefusal(wall, NOW), /a retry cannot help until a person at Chanlytics restores them/);
  assert.equal(lineRetryRefusal(line({ voice_state: "failed", last_error: "Twilio 21422" }), NOW), null, "a carrier failure is still the owner's to retry");
});

test("counting a try is one function, because two callers resume a line and only one of them used to count", async () => {
  // The sweep here and the ledger's handler (line-provision-job.ts) both take
  // a line and resume it on nobody's behalf. MAX_AUTOMATIC_RESUMES is only a
  // ceiling if BOTH count against it, and the ledger path did not: the header
  // claiming they matched was the only thing that said so. The count is now
  // the one function they share.
  const tables = { lines: [line({ voice_state: "provisioning", facts: { automatic_resumes: 1 } })] };
  const counted = await countAutomaticResume(fakeDb(tables), tables.lines[0]);
  assert.equal(counted.ok, true);
  assert.equal(tables.lines[0].facts.automatic_resumes, 2, "written to the row");
  assert.equal(counted.row.facts.automatic_resumes, 2, "and handed back, so the caller resumes from what it wrote");
  assert.equal(automaticResumesOf(counted.row), 2);

  // A try nobody could write is a try that must not run: the caller is told
  // rather than thrown at, and leaves the line for the next tick.
  const stuck = await countAutomaticResume(fakeDb({ lines: [line()] }, { "lines.update": { message: "row is locked" } }), line());
  assert.deepEqual(stuck, { ok: false, error: "row is locked" });
});
