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
  assert.match(r.sentence, /A person at Chanlytics has it/);
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

test("the sweep resumes them unasked, through the same function the buttons call", () => {
  const sweep = readCode("apps/edge/api/cron/lines.ts");
  // Same auth as every other sweep: the Vault-held key, compared in constant time.
  assert.match(sweep, /crypto\.timingSafeEqual/);
  assert.match(sweep, /db\.rpc\("get_cron_sweep_key"\)/);
  assert.match(sweep, /request\.headers\.get\("x-cron-key"\)/);
  // The deadline, in SQL for the read and in the predicate for the decision.
  assert.match(sweep, /PROVISIONING_DEADLINE_MS/);
  assert.match(sweep, /\.eq\("voice_state", "provisioning"\)/);
  assert.match(sweep, /\.lt\("state_since", cutoff\)/);
  assert.match(sweep, /lineStuckProvisioning\(lineForClient\(r\), Date\.now\(\)\)/);
  assert.match(sweep, /\.order\("state_since", \{ ascending: true \}\)/, "oldest first, so a backlog drains in order");
  // A small bound, because each item is a whole saga and this sweep exists to clean
  // up a half-run saga rather than to create more of them.
  assert.match(sweep, /const MAX_PER_TICK = 2;/);
  // The provider preconditions the writing ops check, so a tick that cannot
  // provision says so instead of reporting a clean sweep over lines it never touched.
  assert.match(sweep, /no_line_provider/);
  assert.match(sweep, /no_provider_key/);
  // And the ONE function that also tells the workspace and the platform.
  assert.match(sweep, /provisionLine\(db, choice, \{ apiKey \}, \{ fnSecret \}, t\.data, rowToLine\(row\), "sweep"\)/);

  // Registered, scheduled, and watched from its first tick.
  const m = readRaw("supabase/migrations/00097_a_line_stops_being_stuck.sql");
  assert.match(m, /check \(sweep in \('calls', 'deadman', 'health', 'jobs', 'registration', 'calendar', 'google', 'playbooks', 'lines'\)\)/);
  assert.match(m, /values \('lines', now\(\)\)/, "the deploy grace row, or the first health run mails a false alarm");
  assert.match(m, /select public\.request_sweep\('lines', '\/api\/cron\/lines'\)/);
  assert.match(m, /cron\.schedule\('lines-sweep', '8,23,38,53 \* \* \* \*'/);
  assert.doesNotMatch(m, /cron\.schedule\('lines-sweep', '13,43/, "never onto the health check's own grid");
  assert.match(readRaw("apps/edge/vercel.json"), /"api\/cron\/lines\.ts"/, "or Vercel gives it ten seconds");
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
