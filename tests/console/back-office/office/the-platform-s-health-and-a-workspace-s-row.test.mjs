/**
 * The back office's judgement: the platform's own health, a failed line ours with the provider's words, new and
 * stalled, a paused or test workspace no problem, and the four facts as words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  platformRows,
  platformSummary,
  platformNumber,
  textingWords,
  PLATFORM_VERDICTS,
  PLATFORM_QUIET_DAYS,
  PLATFORM_NEW_DAYS,
  platformHealthOf,
  platformHealthWords,
} from "@chanlytics/contracts";
import { NOW, ago, clock, live, only } from "./_office.mjs";

test("the platform's own health: every clock running AND nothing waiting, or it is not healthy", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");
  const all = [clock("calendar", true), clock("lines", true)];

  const well = platformHealthOf(all, 0, now);
  assert.equal(well.ok, true);
  assert.deepEqual(well.unhealthy, []);
  assert.equal(well.checked_at, now.toISOString());
  assert.equal(platformHealthWords(well), "Every clock is running and nothing is waiting.");

  // A clock that stopped, with the reason the function gave.
  const stopped = platformHealthOf(
    [clock("calendar", false, "no successful run in 3 hours"), clock("lines", true)],
    0,
    now,
  );
  assert.equal(stopped.ok, false);
  assert.deepEqual(stopped.unhealthy, [{ sweep: "calendar", detail: "no successful run in 3 hours" }]);
  assert.match(platformHealthWords(stopped), /1 clock not running/);

  // Work piling up while every clock says it is fine is still not healthy:
  // the heartbeat running and the heartbeat DRAINING are different facts.
  const piling = platformHealthOf(all, 40, now);
  assert.equal(piling.ok, false);
  assert.equal(platformHealthWords(piling), "40 jobs late");
  assert.equal(platformHealthWords(platformHealthOf(all, 1, now)), "1 job late");

  // Both at once reads as both.
  assert.match(
    platformHealthWords(platformHealthOf([clock("calendar", false)], 5, now)),
    /1 clock not running · 5 jobs late/,
  );
});

test("a backlog that could not be READ is never mistaken for a backlog of zero", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");
  // The two answers a health check must never confuse. Null keeps the verdict
  // false, and the words say the read failed rather than claiming all clear.
  const unknown = platformHealthOf([clock("calendar", true)], null, now);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.backlog, null);
  assert.equal(platformHealthWords(unknown), "The platform's health could not be read just now.");
  // And no rows at all is not "healthy": it is the same unknown.
  assert.equal(platformHealthOf(null, null, now).ok, false);
});

test("a workspace that is fine says so, and says it last", () => {
  const r = only({});
  assert.equal(r.verdict, "live");
  assert.match(r.sentence, /Answering; last heard from 1d ago/);
  // Live is near the bottom of the page on purpose: the whole value of this
  // surface is that the workspaces needing a person are at the top.
  assert.ok(PLATFORM_VERDICTS.live.rank < PLATFORM_VERDICTS.broken.rank);
  assert.ok(PLATFORM_VERDICTS.live.rank < PLATFORM_VERDICTS.quiet.rank);
  assert.equal(PLATFORM_VERDICTS.live.tone, "ok");
});

test("a failed line is ours, and it carries the provider's own words", () => {
  const r = only({ voice_state: "failed", line_error: "Twilio refused the number: 21422", reg_step: null });
  assert.equal(r.verdict, "broken");
  assert.match(r.sentence, /Twilio refused the number: 21422/, "the error a person can act on, not a category");
  // A registration that stopped says WHERE, because that is what decides
  // whether it can be resumed or has to be refiled.
  const s = only({ sms_state: "failed", line_error: "the carriers suspended the brand", reg_step: "brand" });
  assert.equal(s.verdict, "broken");
  assert.match(s.sentence, /stopped at brand/);
  // Silence is its own fact: an unexplained stop must not read as nothing wrong.
  assert.match(only({ voice_state: "failed", line_error: null }).sentence, /stopped and said nothing/);
});

test("money is a verdict only where it can stop the receptionist", () => {
  // past_due still answers -- Stripe has not given up yet -- and that is
  // exactly why it needs a person BEFORE it becomes unpaid.
  const due = only({ billing_status: "past_due" });
  assert.equal(due.verdict, "billing");
  assert.match(due.sentence, /still answers; once Stripe gives up, the workspace is paused/);
  for (const status of ["unpaid", "canceled", "paused", "incomplete_expired"]) {
    assert.equal(only({ billing_status: status }).verdict, "billing", status);
  }
  // A workspace that has never entered a card is still answering and is not a
  // billing emergency: it is somebody who has not finished, which is a
  // different conversation and a different verdict.
  assert.equal(only({ billing_status: "none" }).verdict, "waiting_owner");
  // Invoiced by hand: Stripe's words do not apply at all.
  assert.equal(only({ billing_mode: "direct", billing_status: "none" }).verdict, "live");
  assert.equal(only({ billing_mode: "direct" }).facts.paying, "Invoiced");
  assert.equal(only({ billing_mode: null, billing_status: null }).facts.paying, "No arrangement");
});

test("a rehearsal filing outranks everything that merely looks unfinished", () => {
  // The state most likely to be mistaken for working: the console shows the
  // brand approved, our row says approved, and not one message is delivered.
  const r = only({ reg_mock: true, sms_state: "approved" });
  assert.equal(r.verdict, "rehearsal");
  assert.match(r.sentence, /test registry/);
  assert.match(r.sentence, /expires thirty days/);
  assert.equal(only({ reg_mock: true, sms_state: "approved" }).facts.texting, "Rehearsal");
  assert.ok(PLATFORM_VERDICTS.rehearsal.rank > PLATFORM_VERDICTS.waiting_owner.rank);
  assert.ok(PLATFORM_VERDICTS.rehearsal.rank > PLATFORM_VERDICTS.stalled.rank);
});

test("nothing answering is 'new' for a day and 'stalled' after", () => {
  const off = { voice_active: false, whatsapp_active: false, voice_state: "none", sms_state: "none", line_e164: null };
  assert.equal(only({ ...off, created_at: ago(0.5) }).verdict, "new");
  const stalled = only({ ...off, created_at: ago(9), members: 1 });
  assert.equal(stalled.verdict, "stalled");
  assert.match(stalled.sentence, /nothing answers yet/);
  assert.match(
    stalled.sentence,
    /one person in the workspace/,
    "a workspace of one that never started is a different call",
  );
  assert.equal(PLATFORM_NEW_DAYS, 1);
  // Getting a number is not stalled: it is us, in progress.
  assert.equal(only({ ...off, voice_state: "provisioning", created_at: ago(9) }).facts.answering, "Getting a number");
});

test("the states whose next move is the owner's say the words the owner is being shown", () => {
  for (const sms_state of ["needs_record", "otp_waiting", "rejected"]) {
    const r = only({ sms_state, line_error: null });
    assert.equal(r.verdict, "waiting_owner", sms_state);
    // THE point of the whole surface: not a paraphrase. The literal sentence
    // on the customer's own texting row, so support and customer cannot end up
    // describing the same state differently on the same call.
    assert.equal(r.sentence, textingWords({ sms_state, reg_mock: false, reg_sole_prop: false }).sentence, sms_state);
  }
  // Plus the carriers' reason where there is one. Setup leaves it out -- the
  // owner has it on their own row -- but the reason IS the support question, and
  // the live Chanlytics campaign came back with two of them.
  const refused = only({
    sms_state: "rejected",
    line_error: "invalid campaign description (30886 · USE_CASE_DESCRIPTION)",
  });
  assert.match(refused.sentence, /Texting wasn't approved\. — invalid campaign description \(30886/);
});

test("quiet means answering with nobody reaching them, and says for how long", () => {
  const r = only({ last_inbound_at: ago(30) });
  assert.equal(r.verdict, "quiet");
  assert.match(r.sentence, /no customer has reached them in 30 days/);
  assert.equal(only({ last_inbound_at: ago(PLATFORM_QUIET_DAYS - 1) }).verdict, "live", "a fortnight is the line");
  // Never heard from at all, and old enough for that to mean something.
  const never = only({ last_inbound_at: null, created_at: ago(60) });
  assert.equal(never.verdict, "quiet");
  assert.match(never.sentence, /no customer has ever reached them/);
  assert.equal(never.facts.heard, "Never");
  // Never heard from and three days old is just new.
  assert.equal(only({ last_inbound_at: null, created_at: ago(3) }).verdict, "new");
});

test("a paused workspace and a test workspace are not problems to solve", () => {
  assert.equal(only({ status: "paused" }).verdict, "paused");
  assert.match(only({ status: "paused" }).sentence, /by design/);
  assert.match(
    only({ status: "paused" }).sentence,
    /by design: calls are answered only to take a message\.$/,
    "and says what a call gets, in the value's own clause and to a reader who is staff, not the owner",
  );
  // And a test tenant is not a customer at all -- it must not inflate a count
  // or sit in the middle of a support queue.
  const t = only({ status: "test", voice_active: false, whatsapp_active: false, created_at: ago(200) });
  assert.equal(t.verdict, "test");
  assert.equal(PLATFORM_VERDICTS.test.rank, 0);
});

test("the page sorts itself: needs-a-person first, then by name", () => {
  const rows = platformRows(
    [
      live({ tenant_id: "a", name: "All Good" }),
      live({ tenant_id: "b", name: "Broken Co", voice_state: "failed", line_error: "boom" }),
      live({ tenant_id: "c", name: "Zed Quiet", last_inbound_at: ago(40) }),
      live({ tenant_id: "d", name: "Smoke", status: "test" }),
      live({ tenant_id: "e", name: "Card Failed", billing_status: "past_due" }),
      live({ tenant_id: "f", name: "Also Quiet", last_inbound_at: ago(40) }),
    ],
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ["Broken Co", "Card Failed", "Also Quiet", "Zed Quiet", "All Good", "Smoke"],
  );
  // Two workspaces in the same verdict are ordered by name, so the page does
  // not reshuffle under somebody reading it.
  assert.deepEqual(
    rows.filter((r) => r.verdict === "quiet").map((r) => r.name),
    ["Also Quiet", "Zed Quiet"],
  );
});

test("the one line at the top counts customers, not test workspaces", () => {
  const rows = platformRows(
    [
      live({ tenant_id: "a", name: "A" }),
      live({ tenant_id: "b", name: "B", voice_state: "failed" }),
      live({ tenant_id: "c", name: "C", reg_mock: true }),
      live({ tenant_id: "d", name: "D", billing_status: "unpaid" }),
      live({ tenant_id: "e", name: "E", status: "test" }),
    ],
    NOW,
  );
  const s = platformSummary(rows);
  assert.equal(s.total, 4, "the test workspace is not a customer");
  assert.equal(s.live, 1);
  assert.equal(s.needsUs, 2, "broken and rehearsal are ours");
  assert.equal(s.needsThem, 1);
  assert.match(s.sentence, /4 workspaces · 1 live · 2 on us · 1 on them/);
  // Nothing wrong anywhere: the line says so without inventing zeroes.
  const calm = platformSummary(platformRows([live({ tenant_id: "a" })], NOW));
  assert.equal(calm.sentence, "1 workspace · 1 live");
});

test("the four facts are words, so the page renders and never decides", () => {
  const r = only({});
  assert.equal(r.facts.answering, "phone + WhatsApp");
  assert.equal(only({ whatsapp_active: false }).facts.answering, "phone");
  assert.equal(only({ voice_active: false, whatsapp_active: false }).facts.answering, "Nothing yet");
  assert.equal(r.facts.texting, "On");
  assert.equal(
    only({ reg_sole_prop: true }).facts.texting,
    "On (sole proprietor)",
    "the capped registration is named where support can see it",
  );
  assert.equal(only({ line_e164: null, sms_state: "none" }).facts.texting, "No line");
  assert.equal(only({ sms_state: "needs_record" }).facts.texting, "needs record", "a state, in words, never the enum");
  assert.equal(
    only({ billing_status: "trialing", trial_end: "2026-09-30T00:00:00Z" }).facts.paying,
    "Trial to 2026-09-30",
  );
  // Numbers are read aloud on support calls, so they are grouped, and a
  // workspace with no number renders a dash rather than "null".
  assert.equal(platformNumber("+19296566623"), "+1 (929) 656-6623");
  assert.equal(platformNumber(null), "—");
});

test("a bad timestamp never becomes a wrong answer", () => {
  // The RPC returns what the columns hold, and a column can hold anything a
  // migration once allowed. A row that cannot be dated must not read as fresh.
  const r = only({ last_inbound_at: "not a date", created_at: "also not a date" });
  assert.equal(r.facts.heard, "Never");
  assert.ok(r.verdict === "new" || r.verdict === "quiet", `got ${r.verdict}`);
});
