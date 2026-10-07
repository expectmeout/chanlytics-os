/**
 * The first run's Live (docs/superpowers/plans/2026-09-24-first-run-5-try-live.md, 5b; canvas R9, P8, C2): what the owner
 * set up in four lines, the greeting every caller hears, Finish, and the "you're live" email's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstRunLiveOf,
  youAreLiveEmail,
  greetingFor,
  FIRST_RUN_LIVE_WORDS as W,
  FIRST_RUN_HELPERS,
} from "@chanlytics/contracts";

const dtoOf = (over = {}) => ({
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 4,
    bookingLink: true,
    address: true,
    handoff: "+17865550199",
    broken: false,
    receptionist: "set",
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: true, active: true, number: "+13055550142", lastInboundAt: "2026-09-24T14:20:00Z" },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
  lines: {
    rows: [
      {
        id: "fw-1",
        e164: "+13055550100",
        kind: "forwarded",
        provider: "carrier",
        area_code: 305,
        voice_state: "none",
        sms_state: "none",
        whatsapp_state: "none",
        port_state: "none",
        forwarding_state: "verified",
        step: null,
        last_error: null,
        state_since: "2026-09-24T14:10:00Z",
        created_at: "2026-09-24T14:10:00Z",
      },
    ],
    ready: true,
    provider: "twilio",
    costs: { local_number_month_usd: 1.15 },
  },
  ...over,
});

test("published for the page", () => {
  assert.equal(FIRST_RUN_HELPERS.live, firstRunLiveOf);
  assert.equal(FIRST_RUN_HELPERS.liveWords, W);
});

test("Live (canvas R9): the four lines, the greeting word for word, and Finish's email said before the first activation", () => {
  const vm = firstRunLiveOf({ dto: dtoOf(), emails: ["owner@example.com"], business: "Harbor Moving", owner: true });
  assert.equal(vm.heading, "Harbor Moving's receptionist is answering");
  assert.equal(vm.lead, "Every call shows up on Today and in your Inbox.");
  assert.deepEqual(
    vm.summary.map((r) => [r.label, r.value, r.change && r.change.to]),
    [
      ["Answers", "+1 (305) 555-0100, when nobody picks up", null],
      ["Puts callers through to", "+1 (786) 555-0199", "admin/workspace"],
      ["Emails you at", "owner@example.com, when someone needs you", "admin/notifications"],
      ["Knows", "Your hours, your address, 4 services and your booking link", "admin/workspace"],
    ],
  );
  assert.equal(vm.greeting, `Every caller hears “${greetingFor("Harbor Moving")}”`);
  assert.deepEqual(vm.finish, { note: "We'll email you a copy of this." });
  const teammate = firstRunLiveOf({
    dto: dtoOf(),
    emails: ["owner@example.com"],
    business: "Harbor Moving",
    owner: false,
  });
  assert.equal(teammate.finish.note, null, "a teammate's Finish switches nothing on, so no email is promised");
  const unaddressed = firstRunLiveOf({ dto: dtoOf(), emails: [], business: "Harbor Moving", owner: true });
  assert.equal(unaddressed.finish.note, null, "no address: no email goes, so none is promised");
  // The kept number is said once a call proved it, and as the mode saved says.
  const unproven = dtoOf({
    lines: { ...dtoOf().lines, rows: [{ ...dtoOf().lines.rows[0], forwarding_state: "instructed" }] },
  });
  assert.equal(
    firstRunLiveOf({ dto: unproven, emails: [], business: null, owner: true }).summary[0].value,
    "+1 (305) 555-0142",
  );
  const always = dtoOf({
    lines: {
      ...dtoOf().lines,
      rows: [
        {
          ...dtoOf().lines.rows[0],
          forwarding: {
            carrier: "verizon",
            mode: "always",
            destination_e164: null,
            test_from: null,
            test_until: null,
            verified_at: null,
          },
        },
      ],
    },
  });
  assert.equal(
    firstRunLiveOf({ dto: always, emails: [], business: null, owner: true }).summary[0].value,
    "Every call to +1 (305) 555-0100",
  );
});

test("Live says what is not there: its own number, a message instead of a transfer, nobody emailed yet, only the name", () => {
  const bare = dtoOf({
    business: { ...dtoOf().business, handoff: null, hours: false, services: 0, bookingLink: false, address: false },
    lines: { ...dtoOf().lines, rows: [] },
    activations: [
      { capability: "voice", activated_at: "2026-09-24T15:00:00Z", activated_by: "u1", deactivated_at: null },
    ],
  });
  const vm = firstRunLiveOf({ dto: bare, emails: [], business: null, owner: true });
  assert.equal(vm.heading, "Your receptionist is answering");
  assert.deepEqual(
    vm.summary.map((r) => r.value),
    ["+1 (305) 555-0142", "Nobody: it takes a message", "Nobody yet", "Only your name so far"],
    "no alert address: a message nobody is emailed about is not said to be emailed",
  );
  assert.equal(vm.finish.note, null, "activated before: no email goes with Finish, so none is promised");
});

test("the you're-live email (canvas C2): the test call, what happens from now on, where a caller is put through, and Today", () => {
  const m = youAreLiveEmail({
    business: "Harbor Moving",
    own: "+13055550142",
    kept: "+13055550100",
    always: false,
    handoff: null,
    test: { from: "+17865550199", length: "48 sec" },
    todayUrl: null,
  });
  assert.equal(m.subject, "Your receptionist is answering Harbor Moving's calls");
  assert.equal(
    m.body,
    "It answered your test call (48 sec) from +1 (786) 555-0199 through +1 (305) 555-0100.\n\n" +
      "From now on, calls to +1 (305) 555-0100 that nobody picks up reach your receptionist.\n\n" +
      "A caller who asks for a person leaves a message.\n\n" +
      "We'll email you here when someone needs you.\n",
  );
  assert.match(
    youAreLiveEmail({
      business: null,
      own: null,
      kept: "+13055550100",
      always: true,
      handoff: null,
      test: null,
      todayUrl: null,
    }).body,
    /^From now on, every call to \+1 \(305\) 555-0100 reaches your receptionist\./,
    "the mode saved: every call",
  );
  const skipped = youAreLiveEmail({
    business: null,
    own: "+13055550142",
    kept: null,
    always: false,
    handoff: null,
    test: null,
    todayUrl: null,
  });
  assert.equal(skipped.subject, "Your receptionist is answering your calls");
  assert.match(
    skipped.body,
    /^From now on, calls to \+1 \(305\) 555-0142 reach your receptionist\./,
    "no test call, none said",
  );
});
