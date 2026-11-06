/**
 * A workspace's setup choices are its own (decision 0091): what the first run's Where it answers chose, and the marks
 * that say a step of the workspace is done, stand for every member and for the back office, so all of them stand at the
 * same step; Not by phone goes live with no number; and no combination of what the first run asks leaves a workspace
 * that has what it chose unable to finish. Run through contracts' own setupSteps and firstRunOf, the fold every page and
 * the back office read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setupSteps,
  firstRunOf,
  withWorkspaceChoices,
  callsNotByPhone,
  CHANNELS_SEEN,
  RECEPTIONIST_MET,
  REHEARSE_SKIPPED,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-11-03T15:00:00Z");
const KEPT = "+15555550142";
const NEW = "+15555550187";
const WA = "+15555550111";

const facts = {
  name: "Northside Movers",
  hours: true,
  services: 4,
  bookingLink: true,
  address: true,
  handoff: "+15555550199",
  broken: false,
  receptionist: "set",
};

/** Set up and met, nothing chosen, nothing paid, nothing answering: where Where it answers is the step. */
const chosenNothing = (over = {}) => ({
  business: facts,
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
  lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  rehearsal: { reviewed: 1, kept: 1, last_at: "2026-11-03T14:00:00Z" },
  billing: {
    ready: true,
    livemode: false,
    mode: "stripe",
    status: "none",
    trial_end: null,
    current_period_end: null,
    trial_days: 14,
  },
  later: [],
  rests: {},
  ...over,
});

const choices = (phone, whatsapp = null, marks = [RECEPTIONIST_MET]) => ({
  phone,
  whatsapp,
  marks,
  version: 1,
});

const stepOf = (dto) => firstRunOf(setupSteps(dto, NOW)).current;

test("the workspace's choices stand where the member's view stood, and its marks join the member's put-offs", () => {
  const w = choices({ way: "new", number: NEW }, "own", [RECEPTIONIST_MET, REHEARSE_SKIPPED]);
  const merged = withWorkspaceChoices(
    chosenNothing({ later: ["keep"], want: { way: "keep", number: KEPT }, workspace_choices: w }),
  );
  assert.deepEqual(merged.want, { way: "new", number: NEW }, "the workspace's number, not the member's");
  assert.deepEqual(merged.choices, { whatsapp: "own" });
  assert.deepEqual(new Set(merged.later), new Set(["keep", RECEPTIONIST_MET, REHEARSE_SKIPPED]));
  assert.equal(merged.noCalls, false);
  // A database or a server from before the row: the member's view stands, untouched.
  const before = chosenNothing({ want: { way: "keep", number: KEPT } });
  assert.equal(withWorkspaceChoices(before), before);
  // A row with no number is no number, whatever a member's own view still holds from before the row.
  const none = withWorkspaceChoices(
    chosenNothing({ want: { way: "keep", number: KEPT }, workspace_choices: choices(null) }),
  );
  assert.equal(none.want, null);
  // A mark that is not a step of the workspace's is never taken from the row.
  const odd = withWorkspaceChoices(
    chosenNothing({ workspace_choices: choices(null, null, ["keep", RECEPTIONIST_MET]) }),
  );
  assert.deepEqual(odd.later, [RECEPTIONIST_MET]);
});

test("every member and the back office stand at the same step: the owner who chose, a second owner, the partner who handed it over", () => {
  const w = choices({ way: "new", number: NEW }, "later");
  const owner = chosenNothing({ workspace_choices: w, later: [RECEPTIONIST_MET] });
  const secondOwner = chosenNothing({ workspace_choices: w });
  const ownerAfterHandover = chosenNothing({ workspace_choices: w, want: null });
  // The back office reads Setup with no member's view at all.
  const backOffice = chosenNothing({ workspace_choices: w, later: [], rests: {} });
  const steps = [owner, secondOwner, ownerAfterHandover, backOffice].map(stepOf);
  assert.deepEqual(steps, ["live", "live", "live", "live"], "Where it answers is done for all of them");
  // Before the row, the step was the member's own: the owner who chose stood at Go live, a second owner back at Where
  // it answers, asked to choose a number all over again.
  const memberOnly = [
    chosenNothing({ want: { way: "new", number: NEW }, later: [RECEPTIONIST_MET] }),
    chosenNothing({}),
  ].map(stepOf);
  assert.deepEqual(memberOnly, ["live", "channels"]);
});

test("Not by phone: Where it answers is done, Go live owes no number, and a channel answering with the trial running is live", () => {
  assert.equal(callsNotByPhone({ phone: { way: "none" } }), true);
  assert.equal(callsNotByPhone({ phone: { way: "keep", number: KEPT } }), false);
  const w = choices({ way: "none" }, "own");
  const chosen = setupSteps(chosenNothing({ workspace_choices: w }), NOW);
  assert.equal(chosen.noCalls, true);
  assert.equal(chosen.want, null, "no number is chosen, and none is owed");
  assert.equal(firstRunOf(chosen).current, "live");
  const line = chosen.rows.find((r) => r.id === "line");
  assert.equal(line.state, "ready");
  assert.equal(line.required, false);
  assert.match(line.sentence, /^Not by phone/);
  // Paid, and WhatsApp answering: live, with no line, no forwarding and no call.
  const live = setupSteps(
    chosenNothing({
      workspace_choices: w,
      billing: { ...chosenNothing().billing, status: "trialing", trial_end: "2026-11-17T15:00:00Z" },
      channels: {
        whatsapp: { present: true, active: true, number: WA, quality: "GREEN", lastInboundAt: null },
        voice: { present: false, active: false, number: null, lastInboundAt: null },
      },
    }),
    NOW,
  );
  assert.equal(firstRunOf(live).complete, true);
  // Paid, and nothing answering yet: still Go live, which waits on the channel chosen.
  const paidOnly = setupSteps(
    chosenNothing({ workspace_choices: w, billing: { ...chosenNothing().billing, status: "trialing" } }),
    NOW,
  );
  assert.equal(firstRunOf(paidOnly).complete, false);
  assert.equal(firstRunOf(paidOnly).current, "live");
});

test("no combination of what the first run asks leaves a workspace that has what it chose unable to finish", () => {
  const ways = [
    { way: "new", number: NEW },
    { way: "keep", number: KEPT },
    { way: "move", number: KEPT },
    { way: "none" },
  ];
  for (const phone of ways) {
    for (const whatsapp of ["same", "own", "later"]) {
      for (const numbersHere of [true, false]) {
        const label = `${phone.way}/${whatsapp}/${numbersHere ? "numbers" : "no numbers"}`;
        const calls = phone.way !== "none";
        const wa = whatsapp !== "later";
        const w = choices(phone, whatsapp, [RECEPTIONIST_MET, ...(numbersHere ? [] : [CHANNELS_SEEN])]);
        // Chosen, nothing yet in place: exactly one step current, and it is Go live.
        const chosen = firstRunOf(
          setupSteps(
            chosenNothing({ workspace_choices: w, lines: { ...chosenNothing().lines, ready: numbersHere } }),
            NOW,
          ),
        );
        assert.equal(chosen.steps.filter((s) => s.state === "current").length, 1, `${label}: one step current`);
        assert.equal(chosen.current, "live", `${label}: chosen, Go live is next`);
        // Everything the choice needs in place: the trial running, the number answering and proved where calls were
        // chosen (a kept or moved number's forwarding verified), WhatsApp answering where it was.
        const forwarded =
          calls && phone.way !== "new"
            ? [
                {
                  id: "line-forwarded",
                  e164: phone.number,
                  kind: "forwarded",
                  provider: "carrier",
                  area_code: 555,
                  voice_state: "none",
                  sms_state: "none",
                  whatsapp_state: "none",
                  port_state: "none",
                  forwarding_state: "verified",
                  step: null,
                  last_error: null,
                  state_since: "2026-11-03T14:00:00Z",
                  created_at: "2026-11-03T14:00:00Z",
                },
              ]
            : [];
        const done = setupSteps(
          chosenNothing({
            workspace_choices: w,
            billing: { ...chosenNothing().billing, status: "trialing", trial_end: "2026-11-17T15:00:00Z" },
            lines: { ...chosenNothing().lines, ready: numbersHere, rows: forwarded },
            channels: {
              whatsapp: wa
                ? { present: true, active: true, number: WA, quality: "GREEN", lastInboundAt: null }
                : { present: false, active: false, number: null, quality: null, lastInboundAt: null },
              voice: calls
                ? { present: true, active: true, number: NEW, lastInboundAt: "2026-11-03T14:30:00Z" }
                : { present: false, active: false, number: null, lastInboundAt: null },
            },
          }),
          NOW,
        );
        const fr = firstRunOf(done);
        if (calls || wa) assert.equal(fr.complete, true, `${label}: live once what it chose is in place`);
        // Not by phone with WhatsApp left for later chose no channel at all: Go live waits for one, and says so by
        // standing, never by finishing a workspace that answers nowhere.
        else assert.equal(fr.complete, false, `${label}: a workspace that answers nowhere is not live`);
        // A step once done never reopens as more comes in place.
        const before = chosen.steps.filter((s) => s.state === "done").map((s) => s.key);
        for (const k of before)
          assert.equal(fr.steps.find((s) => s.key === k).state, "done", `${label}: ${k} stays done`);
      }
    }
  }
});
