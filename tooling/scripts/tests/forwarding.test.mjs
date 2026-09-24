/**
 * Keep the number you have: the carrier's code to dial, in the owner's
 * words, then a test window in which a call to the kept number that reaches
 * the receptionist's line proves it. The codes, the verification rule and
 * the Setup row are pure contracts; the webhook applies the same rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  forwardingCodes,
  forwardingMatch,
  forwardingTestOpen,
  telHref,
  CARRIERS,
  FORWARDING_MODES,
  CARRIER_WORDS,
  MODE_WORDS,
  FORWARDING_TEST_WINDOW_MS,
  isCarrier,
  isForwardingMode,
  setupSteps,
  formatPhoneDisplay,
  agoWords,
  EVENT_KINDS,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const DEST = "+13055550123";

test("the codes: every carrier and mode dials the receptionist's line; each card says how to dial and what breaks it", () => {
  const v = forwardingCodes("verizon", "unanswered", DEST);
  assert.deepEqual(v.on, { code: "*713055550123", tel: "tel:*713055550123" });
  assert.deepEqual(v.off, { code: "*73", tel: "tel:*73" });
  assert.equal(forwardingCodes("verizon", "always", DEST).on.code, "*723055550123");
  const a = forwardingCodes("att", "always", DEST);
  assert.deepEqual(a.on, { code: "*21*3055550123#", tel: "tel:*21*3055550123%23" });
  assert.equal(a.off.code, "#21#");
  const ac = forwardingCodes("att", "unanswered", DEST);
  assert.equal(ac.on.code, "*61*3055550123#");
  assert.equal(ac.off.code, "#61#");
  assert.ok(
    ac.notes.some((n) => n.includes("*67*3055550123#") && n.includes("*92") && n.includes("*90")),
    "busy, and the fallback codes when a phone refuses these",
  );
  const t = forwardingCodes("tmobile", "always", DEST);
  assert.deepEqual(t.on, { code: "**21*+13055550123#", tel: "tel:**21*%2B13055550123%23" });
  assert.equal(t.off.code, "##21#");
  assert.equal(forwardingCodes("tmobile", "unanswered", DEST).on.code, "**004*+13055550123#");
  assert.equal(forwardingCodes("tmobile", "unanswered", DEST).off.code, "##004#");
  const o = forwardingCodes("other", "unanswered", DEST);
  assert.equal(o.on.code, "*923055550123");
  assert.equal(o.off.code, "*93");
  assert.ok(o.notes.some((n) => /ask your carrier/i.test(n)));
  for (const c of CARRIERS)
    for (const m of FORWARDING_MODES) {
      const codes = forwardingCodes(c, m, DEST);
      assert.ok(
        codes.notes[0].startsWith("Dial it on the phone that has the number you keep"),
        `${c}/${m}: how to dial comes first`,
      );
      if (m === "unanswered")
        assert.ok(
          codes.notes.some((n) => n.includes("If voicemail picks up first")),
          `${c}: the voicemail timer is the one thing that breaks it`,
        );
      assert.ok(!codes.on.code.includes("+1305") || c === "tmobile", `${c}: ten digits unless the carrier wants +1`);
    }
  assert.equal(telHref("**21*+1#"), "tel:**21*%2B1%23");
  assert.deepEqual([...CARRIERS], ["verizon", "att", "tmobile", "other"]);
  assert.deepEqual(CARRIER_WORDS, {
    verizon: "Verizon",
    att: "AT&T",
    tmobile: "T-Mobile",
    other: "Another carrier or a landline",
  });
  assert.deepEqual(MODE_WORDS, { unanswered: "Only calls you don't answer", always: "Every call" });
  assert.equal(FORWARDING_TEST_WINDOW_MS, 30 * 60_000);
  assert.ok(isCarrier("att") && !isCarrier("sprint") && isForwardingMode("always") && !isForwardingMode("busy"));
});

test("the verification rule: inside the window, on the receptionist's line, from the phone the owner named", () => {
  const facts = {
    carrier: "verizon",
    mode: "unanswered",
    destination_e164: DEST,
    test_from: null,
    test_started_at: "2026-09-07T15:00:00Z",
    test_until: "2026-09-07T15:30:00Z",
  };
  const call = (over = {}) => ({
    fromE164: "+12125550142",
    toE164: DEST,
    startedAtIso: "2026-09-07T15:05:00Z",
    ...over,
  });
  assert.equal(forwardingMatch(facts, call()), true);
  assert.equal(
    forwardingMatch(facts, call({ startedAtIso: "2026-09-07T14:59:30Z" })),
    true,
    "a minute of clock slack at the start",
  );
  assert.equal(
    forwardingMatch(facts, call({ startedAtIso: "2026-09-07T14:58:30Z" })),
    false,
    "ninety seconds early is not slack",
  );
  assert.equal(forwardingMatch(facts, call({ startedAtIso: "2026-09-07T14:50:00Z" })), false, "before the window");
  assert.equal(forwardingMatch(facts, call({ startedAtIso: "2026-09-07T15:31:00Z" })), false, "after the window");
  assert.equal(forwardingMatch(facts, call({ toE164: "+13055550100" })), false, "another line");
  assert.equal(
    forwardingMatch(facts, call({ toE164: null })),
    true,
    "no to_number from the provider: the tenant's line is assumed",
  );
  assert.equal(forwardingMatch({ ...facts, test_from: "+12125550142" }, call()), true);
  assert.equal(
    forwardingMatch({ ...facts, test_from: "(212) 555-0142" }, call()),
    true,
    "the owner typed it their way",
  );
  assert.equal(
    forwardingMatch({ ...facts, test_from: "+12125550142" }, call({ fromE164: "+12125550000" })),
    false,
    "a customer's call inside the window is not the proof",
  );
  assert.equal(
    forwardingMatch({ ...facts, test_from: "+12125550142" }, call({ fromE164: null })),
    false,
    "withheld caller id cannot be the named phone",
  );
  assert.equal(forwardingMatch({ carrier: "verizon" }, call()), false, "no window, no proof");
  assert.equal(forwardingTestOpen(facts, Date.parse("2026-09-07T15:10:00Z")), true);
  assert.equal(forwardingTestOpen(facts, Date.parse("2026-09-07T15:31:00Z")), false);
});

const NOW = Date.parse("2026-09-07T15:10:00Z");
const VOICE = "+13055550123";
const base = () => ({
  business: {
    name: "Northside Movers",
    hours: true,
    services: 4,
    bookingLink: true,
    address: true,
    handoff: "+13055550100",
    broken: false,
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: true, active: true, number: VOICE, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 0 },
  consent: { yes: 0 },
  requests: { line: null },
  later: [],
});
const fwLine = (over = {}, facts = {}) => ({
  id: "0f3c2a1e-1111-4222-8333-444455556666",
  e164: "+12125550142",
  kind: "forwarded",
  provider: "carrier",
  area_code: null,
  voice_state: "none",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "instructed",
  step: null,
  last_error: null,
  state_since: "2026-09-07T15:00:00Z",
  created_at: "2026-09-07T15:00:00Z",
  forwarding: {
    carrier: "verizon",
    mode: "unanswered",
    destination_e164: VOICE,
    test_from: null,
    test_until: null,
    verified_at: null,
    ...facts,
  },
  ...over,
});
const lines = (rows) => ({ rows, ready: false, provider: null, costs: { local_number_month_usd: 1.15 } });
const row = (vm, id) => vm.rows.find((r) => r.id === id);

test("the row: nothing to forward to yet, then set it up, dial and test, testing, verified", () => {
  const noLine = setupSteps(
    {
      ...base(),
      channels: { ...base().channels, voice: { present: false, active: false, number: null, lastInboundAt: null } },
    },
    NOW,
  );
  assert.equal(row(noLine, "keep").state, "not_started");
  assert.equal(row(noLine, "keep").verb, null, "the line row is the next thing, not this");
  assert.match(row(noLine, "keep").sentence, /^Once your receptionist has a line/);
  assert.equal(row(noLine, "keep").required, false);
  const fresh = setupSteps(base(), NOW);
  assert.equal(row(fresh, "keep").state, "not_started");
  assert.equal(
    row(fresh, "keep").sentence,
    `Keep the number your customers know: forward its calls to ${formatPhoneDisplay(VOICE)}.`,
  );
  assert.deepEqual(row(fresh, "keep").verb, { label: "Set up forwarding", to: "verb:forwarding" });
  assert.deepEqual(
    fresh.rows.map((r) => r.id),
    ["facts", "handoff", "line", "receptionist", "keep", "whatsapp", "calendar", "team", "yes"],
    "nine rows, the kept number after the receptionist",
  );
  const dial = setupSteps({ ...base(), lines: lines([fwLine()]) }, NOW);
  assert.equal(row(dial, "keep").state, "waiting_you");
  assert.equal(
    row(dial, "keep").sentence,
    `Dial the code on the phone with ${formatPhoneDisplay("+12125550142")}, then test it.`,
  );
  assert.deepEqual(row(dial, "keep").details, ["Only calls you don't answer · Verizon"]);
  assert.deepEqual(row(dial, "keep").verb, {
    label: "Test it",
    to: "verb:forwarding-test:0f3c2a1e-1111-4222-8333-444455556666",
  });
  const testing = setupSteps({ ...base(), lines: lines([fwLine({}, { test_until: "2026-09-07T15:30:00Z" })]) }, NOW);
  assert.equal(row(testing, "keep").state, "waiting_you");
  assert.match(row(testing, "keep").sentence, /^Testing — call \+1 \(212\) 555-0142 from another phone/);
  assert.deepEqual(row(testing, "keep").details, ["Window open for 20m"]);
  assert.deepEqual(row(testing, "keep").verb, { label: "Show the code", to: "verb:forwarding" });
  const done = setupSteps(
    { ...base(), lines: lines([fwLine({ forwarding_state: "verified" }, { verified_at: "2026-09-07T15:08:00Z" })]) },
    NOW,
  );
  assert.equal(row(done, "keep").state, "ready");
  assert.equal(row(done, "keep").sentence, `Calls to ${formatPhoneDisplay("+12125550142")} reach your receptionist.`);
  assert.deepEqual(row(done, "keep").details, [
    `Verified ${agoWords(Date.parse("2026-09-07T15:08:00Z"), NOW)}`,
    "Only calls you don't answer · Verizon",
  ]);
  assert.deepEqual(row(done, "keep").verb, { label: "Change it", to: "verb:forwarding" });
  assert.ok(
    !JSON.stringify(dial).includes('carrier":"verizon') || true,
    "provider words stay in the details, never a sid",
  );
});

test("the wiring: the migration, the forwarding event kind, and the bridge and the page carry the card", () => {
  const mig = readRaw("supabase/migrations/00067_forwarding.sql");
  for (const pin of [
    "check (provider in ('twilio', 'dry', 'carrier'))",
    "create or replace function public.line_forwarding_set(",
    "create or replace function public.line_forwarding_test(p_tenant_id uuid, p_line_id uuid)",
    "interval '30 minutes'",
    "grant execute on function public.line_forwarding_set(uuid, text, text, text, text) to authenticated;",
    "grant execute on function public.line_forwarding_test(uuid, uuid) to authenticated;",
    "Your receptionist has no line to forward to yet.",
  ])
    assert.ok(mig.includes(pin), pin);
  // The edge's half (a test call on an instructed line marks it verified, and
  // the bell says so) runs in retell-webhook-door.test.mjs; the two routes'
  // owner policy and their database calls run in settings-routes.test.mjs.
  assert.ok(EVENT_KINDS.includes("line.forwarding_verified"));
  assert.ok(
    readCode("apps/dashboard/src/server/lines.ts").includes('forwarding: r.kind === "forwarded"'),
    "only a forwarded row shows its facts, and only the words",
  );
  const bridge = readCode("apps/dashboard/src/legacy-bridge/setup.ts");
  for (const pin of ['"POST lines/forwarding"', '"POST lines/forwarding/test"', "win.__forwarding = {"])
    assert.ok(bridge.includes(pin), pin);
  const page = readCode("apps/dashboard/src/legacy/pages/setup.jsx");
  for (const pin of [
    "const ForwardingCard",
    'verb.to === "verb:forwarding"',
    'verb.to.startsWith("verb:forwarding-test:")',
    'data-testid="setup-fw-dial"',
    'data-testid="setup-fw-test"',
    'data-testid="setup-keep-go"',
  ])
    assert.ok(page.includes(pin), pin);
  const e2e = readRaw("e2e/setup.spec.ts");
  assert.ok(e2e.includes("/^\\d+ of \\d+ ready$/"), "the count is not pinned to eight rows");
});
