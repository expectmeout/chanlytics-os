/**
 * Go live's view model (decision 0073, canvas 5A–5C; contracts first-run-golive.ts): which stage the step is at, what
 * starts and what it costs said as it is, Switch it on's one list and its count, Setup's own rows for what the list
 * cannot do, and what answers now with Ask's three moves and what is still connecting. The page draws it
 * (first-run-golive-page.test.mjs); this holds the words and the rules under it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_HELPERS, FIRST_RUN_TRIAL_DAYS, GET_YES_ROUTE, setupSteps } from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const PRICE = { id: "price_example", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Plan" };
const line = (over = {}) => ({
  id: "line-1",
  e164: "+13055550142",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 305,
  voice_state: "answering",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: null,
  last_error: null,
  state_since: "2026-09-07T14:00:00Z",
  created_at: "2026-09-07T14:00:00Z",
  ...over,
});
const forwarded = (state = "instructed") =>
  line({
    id: "fw-1",
    e164: "+13055550100",
    kind: "forwarded",
    provider: "carrier",
    voice_state: "none",
    forwarding_state: state,
    forwarding: {
      carrier: "tmobile",
      mode: "unanswered",
      destination_e164: "+13055550142",
      test_until: null,
      verified_at: null,
    },
  });
const dtoOf = (over = {}) => ({
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 2,
    bookingLink: true,
    address: true,
    handoff: null,
    broken: false,
    receptionist: "set",
  },
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
  google: { ready: true, places: true, listing: null, connected: false, phone: "+13055550100" },
  billing: {
    ready: true,
    livemode: true,
    mode: "stripe",
    status: "none",
    trial_end: null,
    current_period_end: null,
    trial_days: 14,
    price: PRICE,
  },
  ...over,
});
const KEEP = { way: "keep", number: "+13055550100" };
/** Go live as the page asks for it: the phone at Go live, then the step's own. */
function goLive(dto, { want = KEEP, whatsapp = null, choice = null, complete = false, returned = false } = {}) {
  const vm = setupSteps({ ...dto, later: [], want, choices: { whatsapp } }, NOW);
  const phone = FIRST_RUN_HELPERS.phone({ dto, vm, choice, returned, nowMs: NOW });
  return FIRST_RUN_HELPERS.goLive({
    dto,
    vm,
    phone,
    complete,
    whatsapp,
    toolName: null,
    people: null,
    tz: "America/New_York",
    nowMs: NOW,
  });
}
const answeringDto = (extra = [], over = {}) =>
  dtoOf({
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: true, active: true, number: "+13055550142", lastInboundAt: null },
    },
    lines: { rows: [line(), ...extra], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
    billing: { ...dtoOf().billing, status: "active" },
    ...over,
  });

test("Pay (5A): what starts and what it asks after, the plan's price, and the trial as FIRST_RUN_TRIAL_DAYS says it, never more", () => {
  const gl = goLive(dtoOf({ calendar: { state: "ok" } }), { whatsapp: "same" });
  assert.equal(gl.stage, "pay");
  assert.equal(FIRST_RUN_TRIAL_DAYS, 0, "D2: no trial until Ruben says");
  assert.deepEqual(gl.pay, {
    starts: [
      { key: "calls", label: "Calls to +1 (305) 555-0100 nobody picks up", after: "one code, then one call" },
      { key: "whatsapp", label: "WhatsApp on the same number, keeping the app", after: "approve on your phone, after" },
      { key: "bookings", label: "Bookings from your calendar", after: "nothing to do" },
    ],
    price: "$49.00 a month",
    trial: "Charged today",
    note: "Its number, calls and WhatsApp included. Cancel anytime from Billing.",
    after: [
      "Its number is bought for you",
      "Your booking-link message goes to Meta for approval · minutes to a day",
      "Then on your phone: dial one code, call your number once, approve WhatsApp",
    ],
    secured: "Secured by Stripe",
  });
  assert.equal(gl.hands, 2, "the forwarding code and WhatsApp's approval");
  assert.equal(
    FIRST_RUN_HELPERS.goLiveWords.lead(gl.hands),
    "Everything you chose starts at once. Two things need you for a minute after.",
  );
  assert.equal(FIRST_RUN_HELPERS.goLiveWords.lead(0), "Everything you chose starts at once.");
  // The trial words, as they would be with a trial: the days said, and the first charge.
  assert.equal(FIRST_RUN_HELPERS.goLiveWords.trial(14), "14 days free");
  assert.match(FIRST_RUN_HELPERS.goLiveWords.note(14, "Sep 21"), /First charge on Sep 21\./);
  // A new number, every call kept: said as what it is.
  const own = goLive(dtoOf(), { want: { way: "new", number: "+13055550177" } });
  assert.deepEqual(own.pay.starts[0], {
    key: "calls",
    label: "Calls to its own number, +1 (305) 555-0177",
    after: "about a minute",
  });
  assert.equal(own.hands, 0);
  const always = goLive(dtoOf(), { want: { ...KEEP, mode: "always" } });
  assert.equal(always.pay.starts[0].label, "Calls to +1 (305) 555-0100 · every one");
});

test("the stages: confirming with the bank once back from Stripe, a person for the line where none is automatic, then Switch it on", () => {
  const choice = { way: "keep", number: null, pick: null, pending: true };
  assert.equal(goLive(dtoOf(), { choice, returned: true }).stage, "confirming");
  assert.equal(goLive(dtoOf({ lines: { ...dtoOf().lines, ready: false } })).stage, "noProvider");
  assert.equal(goLive(dtoOf({ requests: { line: "2026-09-07T14:00:00Z" } })).stage, "noProvider", "a person was asked");
  // What goes live now without the line is what is connected, and nothing else.
  const noLines = (over = {}) => goLive(dtoOf({ lines: { ...dtoOf().lines, ready: false }, ...over })).noProvider.now;
  const wa = {
    whatsapp: { present: true, active: true, number: "+13055550142", quality: "GREEN", lastInboundAt: null },
  };
  const box = {
    ready: true,
    domain: null,
    mailbox: null,
    sending: { providers: [], mailboxes: [{ address: "a@b.example" }] },
  };
  assert.equal(noLines(), null, "nothing connected: nothing said to go live");
  assert.equal(noLines({ channels: { ...dtoOf().channels, ...wa } }), "WhatsApp goes live now");
  assert.equal(noLines({ email: box }), "Emails keep coming to the Inbox", "a mailbox connected");
  assert.equal(
    noLines({ channels: { ...dtoOf().channels, ...wa }, email: { ...box, sending: null, mailbox: { address: "x" } } }),
    "WhatsApp goes live now; emails keep coming to the Inbox",
    "the hosted address counts as the Inbox's mail too",
  );
  assert.equal(goLive(dtoOf()).noProvider, null, "said only where no provider is");
  const paying = dtoOf({ billing: { ...dtoOf().billing, status: "active" } });
  assert.equal(goLive(paying).stage, "pay", "already paying: the press, which buys");
  assert.equal(goLive(paying, { choice }).stage, "switch", "pressed: the list fills itself in");
  assert.equal(goLive(paying, { complete: true }).stage, "live");
});

test("Switch it on (5B): the plan started, the number on its way, the forwarding, WhatsApp, the booking-link message, and Ask's count", () => {
  const paying = dtoOf({
    billing: { ...dtoOf().billing, status: "active", current_period_end: "2026-10-07T15:00:00Z" },
  });
  const gl = goLive(paying, { whatsapp: "same", choice: { way: "keep", number: null, pick: null, pending: true } });
  const s = gl.switchOn;
  assert.match(s.plan, /^Plan started · \$49\.00 a month · first charge /);
  assert.deepEqual(
    s.items.map((x) => [x.key, x.state, x.label, x.sub]),
    [
      ["number", "waiting", "Its number", "On its way"],
      [
        "forward",
        "needs",
        "Send missed calls to it · on +1 (305) 555-0100",
        "Then call +1 (305) 555-0100 from any other phone and let it ring. When it answers, forwarding is proved.",
      ],
      ["whatsapp", "needs", "WhatsApp · approve the connection in WhatsApp Business on that phone", null],
      [
        "template",
        "waiting",
        "Your booking-link message · Meta is reviewing it · until then it takes a caller's details",
        null,
      ],
    ],
  );
  assert.deepEqual([s.needs, s.done, s.of], [2, 1, 5], "the plan counts as one done");
  assert.deepEqual(s.answers, [
    { key: "email", label: "Email", value: "Waits for you in the Inbox" },
    { key: "whatsapp", label: "WhatsApp", value: "Once you approve" },
    { key: "calls", label: "Calls", value: "Once your line is proved" },
  ]);
  assert.deepEqual(gl.rows, [], "nothing the list cannot do itself");
});

test("Switch it on: the number bought, the code proved by a call, the owner's own number checked by one; put off is said as later", () => {
  const kept = goLive(answeringDto([forwarded("verified")]));
  assert.deepEqual(
    kept.switchOn.items.slice(0, 2).map((x) => [x.key, x.state, x.label, x.sub]),
    [
      ["number", "done", "Its number · +1 (305) 555-0142", "Bought"],
      ["forward", "done", "Send missed calls to it · on +1 (305) 555-0100", "Forwarding works"],
    ],
  );
  assert.equal(kept.switchOn.answers.at(-1).value, "On");
  const own = goLive(answeringDto(), { want: { way: "new", number: "+13055550142" } });
  assert.deepEqual(own.switchOn.items[1], {
    key: "forward",
    state: "needs",
    label: "Call +1 (305) 555-0142 once from your cell. When it answers, it's live.",
    sub: null,
  });
  const tested = answeringDto([], {
    channels: {
      ...answeringDto().channels,
      voice: { present: true, active: true, number: "+13055550142", lastInboundAt: "2026-09-07T14:30:00Z" },
    },
  });
  assert.deepEqual(
    goLive(tested, { want: { way: "new", number: "+13055550142" } }).switchOn.items[1].sub,
    "It answered",
  );
  const vm = setupSteps({ ...answeringDto(), later: ["keep"], want: KEEP, choices: { whatsapp: null } }, NOW);
  const later = FIRST_RUN_HELPERS.goLive({
    dto: answeringDto(),
    vm,
    phone: FIRST_RUN_HELPERS.phone({ dto: answeringDto(), vm, choice: null, returned: false, nowMs: NOW }),
    complete: false,
    whatsapp: null,
    toolName: null,
    people: null,
    tz: "UTC",
    nowMs: NOW,
  });
  assert.equal(later.switchOn.items[1].state, "later", "Set up forwarding later: the row says so");
});

test("Switch it on: a card that did not pay is Billing's own row above the list, and no plan is said to have started", () => {
  const pastDue = dtoOf({ billing: { ...dtoOf().billing, status: "past_due" } });
  const gl = goLive(pastDue);
  assert.equal(gl.stage, "switch");
  assert.equal(gl.switchOn.plan, null);
  assert.ok(gl.rows.includes("billing"));
  assert.equal(gl.switchOn.of, gl.switchOn.items.length, "nothing counted for a plan that does not run");
  // A line stopped part-way: the line row's Retry.
  const stopped = dtoOf({
    billing: { ...dtoOf().billing, status: "active" },
    lines: {
      rows: [line({ voice_state: "failed", last_error: "carrier refused" })],
      ready: true,
      provider: "twilio",
      costs: { local_number_month_usd: 1.15 },
    },
  });
  assert.ok(goLive(stopped).rows.includes("line"));
});

test("Switch it on: what came in, a line a source, the kept app's chats with Meta's parts under theirs, a stop with nothing to press", () => {
  const imports = [
    {
      source: "whatsapp_history",
      state: "running",
      counts: {},
      parts_done: 1,
      parts_total: 3,
      oldest: null,
      started_at: "2026-09-07T14:00:00Z",
      finished_at: null,
      last_error: null,
      via: null,
    },
    {
      source: "whatsapp_contacts",
      state: "failed",
      counts: {},
      parts_done: 0,
      parts_total: 1,
      oldest: null,
      started_at: "2026-09-07T14:00:00Z",
      finished_at: null,
      last_error: "Meta offers it once, while the number connects. To bring it, connect WhatsApp again from Settings.",
      via: null,
    },
  ];
  const gl = goLive(answeringDto([forwarded()], { imports }));
  const came = gl.switchOn.items.filter((x) => x.key === "imports");
  assert.deepEqual(
    came.map((x) => [x.state, !!x.parts]),
    [
      ["stopped", false],
      ["waiting", true],
    ],
    "contacts stopped (Meta offers it once: nothing to press), chats coming in three parts",
  );
  assert.equal(came[1].parts.length, 3);
});

test("You're live (5C): what answers now and since when, Ask's three moves -- the yes first -- and what is still connecting", () => {
  const live = answeringDto([], {
    channels: {
      whatsapp: { present: true, active: false, number: "+13055550100", quality: null, lastInboundAt: null },
      voice: { present: true, active: true, number: "+13055550142", lastInboundAt: "2026-09-07T14:30:00Z" },
    },
    calendar: { state: "ok" },
    consent: { yes: 3, offers: 0, offersSaidYes: 0 },
    activations: [{ capability: "voice", activated_at: "2026-09-07T14:12:00Z", deactivated_at: null }],
  });
  const gl = goLive(live, { want: { way: "new", number: "+13055550142" }, whatsapp: "same", complete: true });
  assert.equal(gl.stage, "live");
  assert.deepEqual(gl.live.since, "Answering since 10:12 AM", "in the workspace's own clock");
  assert.equal(gl.live.channels, "Calls to +1 (305) 555-0142 · WhatsApp on the same number · your emails in the Inbox");
  assert.deepEqual(
    gl.live.moves.map((m) => [m.key, m.act]),
    [
      ["yes", "Get the QR"],
      ["remind", "Turn on"],
      ["winBack", "See the draft"],
    ],
  );
  assert.equal(gl.live.moves[0].to, GET_YES_ROUTE);
  assert.match(gl.live.moves[0].says, /3 said yes$/);
  assert.deepEqual(
    gl.live.notes.map((n) => [n.key, n.act]),
    [["whatsapp_waiting", null]],
    "connected, Meta approving: nothing to press",
  );
});

test("You're live never waited on WhatsApp: chosen and not connected, its steps offered; left for later, the way back to choose it", () => {
  const live = answeringDto([], {
    channels: {
      ...answeringDto().channels,
      voice: { present: true, active: true, number: "+13055550142", lastInboundAt: "2026-09-07T14:30:00Z" },
    },
  });
  const want = { way: "new", number: "+13055550142" };
  const chosen = goLive(live, { want, whatsapp: "own", complete: true });
  assert.deepEqual(chosen.live.notes, [
    {
      key: "whatsapp_connect",
      title: "WhatsApp · connect it on its own number",
      says: "Calls and email answer now. WhatsApp joins once you approve it on your phone; Today keeps this until then.",
      act: { kind: "connect", label: "Connect WhatsApp" },
    },
  ]);
  for (const whatsapp of ["later", null]) {
    const n = goLive(live, { want, whatsapp, complete: true }).live.notes;
    assert.deepEqual(
      n.map((x) => [x.key, x.act]),
      [["whatsapp_later", { kind: "choose", label: "Connect WhatsApp now" }]],
      String(whatsapp),
    );
  }
  // No calendar linked: no day-before reminder to offer, and the win-back reads who has been quiet.
  const moves = goLive(live, { want, complete: true }).live.moves;
  assert.deepEqual(
    moves.map((m) => m.key),
    ["yes", "winBack"],
  );
  assert.match(moves[1].to, /quiet_30/);
});
