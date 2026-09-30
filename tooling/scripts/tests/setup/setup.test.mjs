/**
 * Setup: one page a new owner lands on until the receptionist is answering.
 * Every row is a fact the workspace holds; the truth table below is the
 * contract, and the wiring pins keep the page, the routes, the bridge and
 * the migration saying the same thing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setupSteps,
  SETUP_STATE_WORDS,
  formatPhoneDisplay,
  agoWords,
  EVENT_KINDS,
  serverNotificationRows,
  verbForRoute,
  LINE_STEP_WORDS,
  textingWords,
  GET_YES_ROUTE,
  NO_NUMBER_REACH,
  newReceptionistDefaults,
} from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { setupDtoFor } from "../../../../apps/dashboard/src/server/workspace/setup.ts";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const VOICE = "+13055550124";
const WA = "+13055550123";
const HANDOFF = "+13055550100";

const empty = (over = {}) => ({
  business: {
    name: null,
    hours: false,
    services: 0,
    bookingLink: false,
    address: false,
    handoff: null,
    broken: false,
    receptionist: "none",
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 0 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
  later: [],
  ...over,
});
const facts = {
  name: "Northside Movers",
  hours: true,
  services: 4,
  bookingLink: true,
  address: true,
  handoff: HANDOFF,
  broken: false,
  receptionist: "set",
};
const live = (over = {}) =>
  empty({
    business: facts,
    channels: {
      whatsapp: { present: true, active: true, number: WA, quality: "GREEN", lastInboundAt: "2026-09-07T14:30:00Z" },
      voice: { present: true, active: true, number: VOICE, lastInboundAt: "2026-09-06T14:30:00Z" },
    },
    templates: { approved: 6, pending: 0, startersApproved: 5 },
    calendar: { state: "ok" },
    team: { members: 2, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 3, offers: 1, offersSaidYes: 1 },
    // The owner's own act (00108): a workspace that answers everywhere has said so.
    activations: [
      { capability: "voice", activated_at: "2026-09-08T09:00:00Z", activated_by: "u-owner", deactivated_at: null },
      { capability: "whatsapp", activated_at: "2026-09-08T09:00:00Z", activated_by: "u-owner", deactivated_at: null },
    ],
    ...over,
  });
const row = (vm, id) => vm.rows.find((r) => r.id === id);

test("a receptionist answering with nothing to answer with says so, and points at the one thing that fixes it", () => {
  // A number is bought in a minute; the facts take longer. The page used to
  // say "Answering", which reads as ready, while every caller got the
  // fallback that refuses to state hours, prices or an address.
  const withLine = empty({
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: true, active: true, number: VOICE, lastInboundAt: null },
    },
  });
  const bare = row(setupSteps(withLine, NOW), "receptionist");
  assert.equal(bare.state, "waiting_you");
  assert.ok(bare.sentence.includes("no facts to answer with yet"));
  assert.equal(bare.verb.to, "admin/workspace");
  const filled = row(setupSteps({ ...withLine, business: facts }, NOW), "receptionist");
  assert.equal(filled.state, "ready");
  assert.ok(filled.sentence.startsWith("Answering on"));
});

test("an empty workspace: nothing answers, every row reads its true state, the first verb is the business facts", () => {
  const vm = setupSteps(empty(), NOW);
  assert.equal(vm.readiness.answering, false);
  assert.equal(vm.readiness.sentence, "Your receptionist is not answering yet.");
  assert.deepEqual(
    vm.rows.map((r) => r.id),
    ["facts", "handoff", "line", "receptionist", "keep", "whatsapp", "calendar", "team", "yes"],
  );
  assert.deepEqual(
    vm.rows.map((r) => r.state),
    [
      "not_started",
      "waiting_you",
      "waiting_you",
      "waiting_them",
      "not_started",
      "waiting_you",
      "not_started",
      "not_started",
      "not_started",
    ],
    "the ask is the owner's move; the receptionist is ours",
  );
  assert.equal(row(vm, "line").sentence, "We set up your phone line with you.");
  assert.deepEqual(row(vm, "line").details, [
    "A number, the receptionist answering it, and forwarding from the number you have",
  ]);
  assert.deepEqual(
    vm.rows.map((r) => r.required),
    [true, false, true, true, false, true, false, false, false],
    "the channel rows count until something answers",
  );
  assert.deepEqual(
    row(vm, "line").verb,
    { label: "Ask for a line", to: "verb:request-line" },
    "until lines provision themselves, the line is asked for",
  );
  assert.equal(row(vm, "receptionist").verb, null, "the receptionist arrives with the line — nothing to press");
  assert.deepEqual(row(vm, "whatsapp").verb, { label: "Connect", to: "admin/integrations" });
  assert.equal(vm.done, 0);
  assert.equal(vm.total, 9);
  assert.deepEqual(vm.next, {
    label: "Start in Business",
    to: "admin/workspace",
    row: "facts",
    title: "Business facts",
  });
  assert.equal(vm.tryIt, null);
  for (const r of vm.rows) assert.equal(r.stateWords, SETUP_STATE_WORDS[r.state]);
});

test("a workspace that answers everywhere: nine of ten — the kept number is the one thing left to offer — both numbers to try", () => {
  const vm = setupSteps(live(), NOW);
  assert.equal(vm.readiness.answering, true);
  assert.equal(
    vm.readiness.sentence,
    `Your receptionist answers calls on ${formatPhoneDisplay(VOICE)} and WhatsApp on ${formatPhoneDisplay(WA)}. Texting is not available yet.`,
  );
  assert.equal(vm.done, 9);
  assert.deepEqual(vm.next, {
    label: "Set up forwarding",
    to: "verb:forwarding",
    row: "keep",
    title: "The number you already have",
  });
  const kept = setupSteps({ ...live(), later: ["keep"] }, NOW);
  assert.equal(kept.next, null, "put off for later: nothing is left to press");
  assert.deepEqual(vm.tryIt, {
    voice: VOICE,
    voiceLabel: formatPhoneDisplay(VOICE),
    whatsapp: WA,
    whatsappLabel: formatPhoneDisplay(WA),
  });
  assert.equal(row(vm, "facts").sentence, "Northside Movers · hours set · 4 services on record");
  assert.equal(
    row(vm, "handoff").sentence,
    `Callers who insist on a person are transferred to ${formatPhoneDisplay(HANDOFF)}.`,
  );
  assert.deepEqual(row(vm, "receptionist").verb, { label: "Call it", to: `tel:${VOICE}` });
  // Three claims, kept apart (PRD ON-02): answering is readiness, a call
  // answered is evidence, and "Activated" is the owner's own act.
  assert.ok(
    row(vm, "receptionist").details.some((d) => d.startsWith("Activated ")),
    "an activated capability says so",
  );
  const untouched = setupSteps({ ...live(), activations: [] }, NOW);
  assert.deepEqual(
    row(untouched, "receptionist").verb,
    { label: "Activate", to: "verb:activate:voice" },
    "tested but not activated: the one verb left is the owner's",
  );
  assert.ok(row(untouched, "receptionist").details.includes("Tested — activate it to say it is yours"));
  assert.deepEqual(row(untouched, "whatsapp").verb, { label: "Activate", to: "verb:activate:whatsapp" });
  assert.ok(row(vm, "receptionist").details.includes(`Last call ${agoWords(Date.parse("2026-09-06T14:30:00Z"), NOW)}`));
  assert.ok(row(vm, "whatsapp").details.includes("Quality green"));
  assert.ok(row(vm, "whatsapp").details.includes("6 approved messages"));
  assert.equal(row(vm, "team").sentence, "2 people · alerts go to 1 address.");
  // The OFFERS answer decides this row, because a marketing broadcast is what its
  // verb opens. It used to read the conversational count and call it "said yes to
  // offers", so a workspace with three people who had texted START was told it had
  // three it could send an offer to, and the composer then refused all three.
  assert.equal(row(vm, "yes").sentence, "1 person said yes to offers.");
  assert.deepEqual(
    row(vm, "yes").details,
    ["3 people said yes to messages about their own visit"],
    "and the other count rides along, so the owner knows what to go and ask for",
  );
  const none = setupSteps({ ...live(), consent: { yes: 3, offers: 0, offersSaidYes: 0 } }, NOW);
  assert.equal(
    row(none, "yes").sentence,
    "Nobody has said yes to offers yet. The keyword and the QR are on Broadcasts.",
  );
  assert.equal(row(none, "yes").state, "not_started", "three conversational yeses do not make this row ready");
  // The door lands on the QR itself (#663), as People's, Today's and Playbooks' do: the top of Broadcasts is the
  // ledger, where the QR can be below the fold.
  assert.deepEqual(row(none, "yes").verb, { label: "Get their yes", to: GET_YES_ROUTE });
  const both = setupSteps({ ...live(), consent: { yes: 3, offers: 3, offersSaidYes: 3 } }, NOW);
  assert.deepEqual(row(both, "yes").details, [], "nothing to add when the two agree");
  assert.equal(
    vm.rows.every((r) => !r.later),
    true,
  );
});

test("REGRESSION: a yes to offers with no number to send one to is a yes -- Setup counted only who can be sent an offer, and told the owner nobody had said yes", async () => {
  // The chain, run: the server's read of the workspace, then the row it makes. The row read one count, who a
  // broadcast reaches (a yes AND a number), and called a zero "Nobody has said yes to offers yet" -- about a
  // workspace whose one yes to offers came by email, or from a walk-in recorded with no number.
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const contact = (id, over) => ({
    id,
    tenant_id: T,
    consent: "opted_in",
    marketing_consent: "unknown",
    dnc: false,
    erased_at: null,
    phone_e164: null,
    email: null,
    ...over,
  });
  const db = fakeDb({
    contacts: [
      // Wrote in by email and said yes to both there: an address, and no number.
      contact("c-ana", { marketing_consent: "opted_in", email: "ana@example.com" }),
      // A number, and a yes to messages only.
      contact("c-luis", { phone_e164: "+15555550101" }),
      // Said yes to offers, then STOP: a stop is a do-not-contact, and no yes outlives it (00095).
      contact("c-stop", { consent: "opted_out", marketing_consent: "opted_in", dnc: true, phone_e164: "+15555550102" }),
      // Erased: nobody's answer any more.
      contact("c-gone", { marketing_consent: "opted_in", erased_at: "2026-09-01T00:00:00Z" }),
    ],
  });
  const dto = await setupDtoFor(db, T, { kind: "back_office" }, new Date(NOW));
  assert.deepEqual(
    dto.consent,
    { yes: 2, offers: 0, offersSaidYes: 1 },
    "REGRESSION: the read counted who can be sent an offer, and nobody who said yes without a number",
  );
  const yes = row(setupSteps({ ...dto, later: [] }, NOW), "yes");
  assert.ok(!/Nobody has said yes/.test(yes.sentence), `REGRESSION: ${yes.sentence}`);
  // What is missing is a number, not an answer: it waits on the owner, says why in #663's reason, and opens People,
  // where a number is added -- never the QR, which would ask Ana for the yes she gave.
  assert.deepEqual(
    { state: yes.state, stateWords: yes.stateWords, sentence: yes.sentence, details: yes.details, verb: yes.verb },
    {
      state: "waiting_you",
      stateWords: "Waiting on you",
      sentence: `1 person said yes to offers, but nobody can be sent one yet — ${NO_NUMBER_REACH}.`,
      details: ["2 people said yes to messages about their own visit"],
      verb: { label: "Open People", to: "clients" },
    },
  );
  // Two, and the messages answer no larger than the offers one: nothing to add under it.
  const two = row(setupSteps(live({ consent: { yes: 2, offers: 0, offersSaidYes: 2 } }), NOW), "yes");
  assert.deepEqual(
    [two.state, two.sentence, two.details],
    ["waiting_you", `2 people said yes to offers, but nobody can be sent one yet — ${NO_NUMBER_REACH}.`, []],
  );
  // And a yes with a number beside it makes the row ready, as before: the reach is the row's number.
  const one = row(setupSteps(live({ consent: { yes: 3, offers: 1, offersSaidYes: 2 } }), NOW), "yes");
  assert.deepEqual(
    [one.state, one.sentence, one.verb],
    ["ready", "1 person said yes to offers.", { label: "Open Broadcasts", to: "broadcasts" }],
  );
});

test("what the first run's Check reads: whether a receptionist is set up, whether a listing is on record, and the days whose hours Google gives in a way the record could not take and does not state", async () => {
  assert.deepEqual(setupSteps(empty(), NOW).check, {
    receptionist: "none",
    listed: false,
    unsure: [],
    type: null,
    bookingPage: null,
  });
  assert.equal(setupSteps(empty({ business: facts }), NOW).check.receptionist, "set");
  assert.equal(
    setupSteps(empty({ business: { ...empty().business, broken: true, receptionist: "broken" } }), NOW).check
      .receptionist,
    "broken",
    "only Chanlytics can repair it",
  );
  const listing = { name: "Northside Movers", rating: null, review_count: null, checked_at: null, check_error: null };
  assert.deepEqual(
    setupSteps(
      empty({
        google: {
          ready: true,
          places: true,
          listing,
          connected: false,
          unsure: ["fri"],
          type: "moving_company",
          bookingPage: "https://calendly.com/northside-movers-example/estimate",
        },
      }),
      NOW,
    ).check,
    {
      receptionist: "none",
      listed: true,
      unsure: ["fri"],
      type: "moving_company",
      bookingPage: "https://calendly.com/northside-movers-example/estimate",
    },
  );

  // The read: Google's week as the edge stored it (day 0 is Sunday), less the days the record states.
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const late = (day) => ({ open: { day, hour: 18, minute: 0 }, close: { day: (day + 1) % 7, hour: 2, minute: 0 } });
  const tables = (hours) => ({
    google_listings: [
      {
        tenant_id: T,
        place_id: "ChIJ-northside-movers",
        name: "Northside Movers",
        address: null,
        maps_uri: null,
        business_status: null,
        rating: null,
        review_count: null,
        linked_at: "2026-09-07T14:00:00Z",
        checked_at: null,
        check_error: null,
        facts: {
          hours: [{ open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } }, late(5), late(6)],
          website: null,
          service_area_only: true,
          primary_type: "moving_company",
          booking_page: "https://calendly.com/northside-movers-example/estimate",
          phone_e164: "+13055550100",
        },
      },
    ],
    tenant_config: [
      {
        tenant_id: T,
        version: 3,
        config: {
          brain: {
            business_name: "Northside Movers",
            ...newReceptionistDefaults("Northside Movers"),
            ...(hours ? { profile: { hours } } : {}),
          },
        },
      },
    ],
  });
  const read = async (hours) =>
    (await setupDtoFor(fakeDb(tables(hours)), T, { kind: "back_office" }, new Date(NOW))).google;
  assert.deepEqual((await read(null)).unsure, ["fri", "sat"], "Friday and Saturday close after midnight");
  const dto = await setupDtoFor(fakeDb(tables(null)), T, { kind: "back_office" }, new Date(NOW));
  assert.deepEqual(
    [dto.business.receptionist, dto.business.broken],
    ["set", false],
    "by the one test (receptionistOf)",
  );
  assert.equal(dto.google.type, "moving_company", "Google's kind of place, which Check's suggestions follow");
  assert.equal(dto.google.bookingPage, "https://calendly.com/northside-movers-example/estimate");
  assert.equal(dto.google.phone, "+13055550100", "the listing's number, which the phone step offers to keep");
  assert.equal(
    setupSteps(dto, NOW).check.bookingPage,
    "https://calendly.com/northside-movers-example/estimate",
    "the website's booking page, offered while the record holds no link",
  );
  const linked = tables(null);
  linked.tenant_config[0].config.brain.booking_link = "https://northside.example.com/book";
  assert.equal(
    setupSteps(await setupDtoFor(fakeDb(linked), T, { kind: "back_office" }, new Date(NOW)), NOW).check.bookingPage,
    null,
    "a link the record holds is the owner's, whatever the website says (bookingPageOffered)",
  );
  const none = await setupDtoFor(fakeDb({}), T, { kind: "back_office" }, new Date(NOW));
  assert.deepEqual([none.business.receptionist, none.business.broken], ["none", false]);
  assert.equal(none.google.type, null, "no listing, no kind");
  assert.equal(none.google.bookingPage, null, "no listing, no website read");
  assert.equal(none.google.phone, null, "no listing, no number to keep");
  const bare = tables();
  bare.google_listings[0].facts = {};
  assert.equal(
    (await setupDtoFor(fakeDb(bare), T, { kind: "back_office" }, new Date(NOW))).google.type,
    null,
    "a listing Google said nothing of kind about",
  );
  assert.deepEqual((await read({ sat: {} })).unsure, ["fri"], "Saturday is stated, closed: it is not asked again");
  assert.deepEqual(
    (await setupDtoFor(fakeDb({}), T, { kind: "back_office" }, new Date(NOW))).google.unsure,
    [],
    "no listing, nothing to ask",
  );
});

test("a count of who said yes that cannot be read fails Setup's read -- a zero it never counted reads as 'nobody has said yes'", async () => {
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tables = () => ({
    contacts: [
      {
        id: "c-ana",
        tenant_id: T,
        consent: "opted_in",
        marketing_consent: "opted_in",
        dnc: false,
        erased_at: null,
        phone_e164: null,
      },
    ],
  });
  /** The fake's faults, read once per query: the k-th read of contacts fails as PostgREST fails, and the rest answer. */
  const failing = (k) => {
    let n = 0;
    return new Proxy(
      {},
      {
        get: (_, key) =>
          key === "contacts.select" && ++n === k
            ? { message: "canceling statement due to statement timeout" }
            : undefined,
      },
    );
  };
  // Setup reads contacts only to count the answers: to messages, to offers, and to offers with a number.
  const seen = fakeDb(tables());
  await setupDtoFor(seen, T, { kind: "back_office" }, new Date(NOW));
  const counts = seen.seen.filter((q) => q.table === "contacts").length;
  assert.equal(counts, 3);
  for (let k = 1; k <= counts; k++) {
    await assert.rejects(
      setupDtoFor(fakeDb(tables(), failing(k)), T, { kind: "back_office" }, new Date(NOW)),
      /statement timeout/,
      `REGRESSION: count ${k} of ${counts} failed, and Setup read it as a zero`,
    );
  }
});

test("Setup asks for each source once, in one order, whichever viewer reads -- a member's roster through its door, the back office's two counts instead -- and a read that failed fails Setup by the first in that order", async () => {
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const asked = (db) => db.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`));
  // Email is off here, so no mailbox is read.
  const was = process.env.EMAIL_DOMAIN;
  delete process.env.EMAIL_DOMAIN;
  try {
    // The order the reads reach the database: those that ask at once (the config, the last message and call, the
    // calendar's zone, the listing and its facts, the Google connection, billing, the team), then the rest as they
    // are awaited, and last the calendar's own read of the settings.
    const READS = [
      "tenant_config.select",
      "messages.select",
      "calls.select",
      "tenants.select",
      "google_listings.select",
      "google_listings.select",
      "google_connections.select",
      "billing_accounts.select",
      "invitations.select",
      "lines.select",
      "tenant_channels.select",
      "templates.select",
      "contacts.select",
      "contacts.select",
      "contacts.select",
      "events.select",
      "capability_activations.select",
      "tenant_config.select",
    ];
    const member = fakeDb({}, {}, { team_roster: () => [] });
    await setupDtoFor(member, T, { kind: "member" }, new Date(NOW));
    assert.deepEqual(asked(member), ["rpc:team_roster", ...READS], "a member: the roster through its door");
    const office = fakeDb({});
    await setupDtoFor(office, T, { kind: "back_office" }, new Date(NOW));
    assert.deepEqual(
      asked(office),
      [...READS.slice(0, 8), "memberships.select", ...READS.slice(8)],
      "the back office: the members counted, and no RPC at all",
    );

    // The reads whose failure is Setup's, in the order it judges them: of two that failed, the first is the error.
    const CHECKED = [
      ["tenant_channels.select", 1],
      ["messages.select", 1],
      ["calls.select", 1],
      ["templates.select", 1],
      ["contacts.select", 1],
      ["contacts.select", 2],
      ["contacts.select", 3],
      ["events.select", 1],
      ["capability_activations.select", 1],
    ];
    /** The fake's faults, read once per query: the k-th read of a table named here fails as PostgREST fails. */
    const failing = (...which) => {
      const n = new Map();
      return new Proxy(
        {},
        {
          get: (_, key) => {
            if (typeof key !== "string") return undefined;
            const k = (n.get(key) ?? 0) + 1;
            n.set(key, k);
            return which.some(([t, nth]) => t === key && nth === k) ? { message: `${key} #${k} timed out` } : undefined;
          },
        },
      );
    };
    for (let i = 0; i < CHECKED.length; i++)
      for (let j = i + 1; j < CHECKED.length; j++)
        await assert.rejects(
          setupDtoFor(fakeDb({}, failing(CHECKED[j], CHECKED[i])), T, { kind: "back_office" }, new Date(NOW)),
          { message: `${CHECKED[i][0]} #${CHECKED[i][1]} timed out` },
          `${CHECKED[i].join(" #")} failed before ${CHECKED[j].join(" #")}`,
        );
  } finally {
    if (was === undefined) delete process.env.EMAIL_DOMAIN;
    else process.env.EMAIL_DOMAIN = was;
  }
});

test("calls only: the sentence says what is missing, and WhatsApp can now wait for later", () => {
  const dto = live({
    channels: {
      ...live().channels,
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    },
    later: ["keep"],
  });
  const vm = setupSteps(dto, NOW);
  assert.equal(
    vm.readiness.sentence,
    `Your receptionist answers calls on ${formatPhoneDisplay(VOICE)}. WhatsApp is not connected. Texting is not available yet.`,
  );
  assert.equal(row(vm, "whatsapp").required, false, "once something answers, a channel is optional");
  assert.deepEqual(vm.next, { label: "Connect", to: "admin/integrations", row: "whatsapp", title: "WhatsApp" });
  const later = setupSteps({ ...dto, later: ["whatsapp", "keep"] }, NOW);
  assert.equal(row(later, "whatsapp").later, true);
  assert.equal(later.next, null, "rows put off for later leave nothing to press");
  assert.equal(later.done, 8);
});

test("WhatsApp only: no phone line yet, and the line row still asks", () => {
  const vm = setupSteps(
    live({
      channels: { ...live().channels, voice: { present: false, active: false, number: null, lastInboundAt: null } },
    }),
    NOW,
  );
  assert.equal(
    vm.readiness.sentence,
    `Your receptionist answers WhatsApp on ${formatPhoneDisplay(WA)}. No phone line yet.`,
  );
  assert.equal(row(vm, "line").required, false);
  assert.equal(row(vm, "line").state, "waiting_you", "not asked for yet");
  assert.deepEqual(vm.tryIt, { voice: null, voiceLabel: null, whatsapp: WA, whatsappLabel: formatPhoneDisplay(WA) });
});

test("later is a preference for optional rows only; a required row ignores it", () => {
  const vm = setupSteps(empty({ business: facts, later: ["whatsapp", "handoff", "calendar", "team", "yes"] }), NOW);
  assert.equal(row(vm, "whatsapp").later, false, "required until something answers");
  assert.equal(row(vm, "calendar").later, true);
  assert.deepEqual(vm.next, {
    label: "Ask for a line",
    to: "verb:request-line",
    row: "line",
    title: "A line for calls and texts",
  });
});

test("a line that was asked for waits on us and says when; one that exists but is not active says so", () => {
  const asked = setupSteps(empty({ requests: { line: "2026-09-07T13:00:00Z" } }), NOW);
  assert.equal(row(asked, "line").state, "waiting_them", "asked: now it is ours");
  assert.equal(row(asked, "line").verb, null, "asked once — no second ask");
  assert.equal(
    row(asked, "line").sentence,
    `Requested ${agoWords(Date.parse("2026-09-07T13:00:00Z"), NOW)} — a person at Chanlytics will set up your line with you and reach you by email.`,
  );
  const inactive = setupSteps(
    empty({
      channels: { ...empty().channels, voice: { present: true, active: false, number: VOICE, lastInboundAt: null } },
    }),
    NOW,
  );
  assert.equal(
    row(inactive, "line").sentence,
    `Your line ${formatPhoneDisplay(VOICE)} is switched off — the receptionist is not answering it.`,
  );
  assert.equal(row(inactive, "line").state, "waiting_you");
  assert.equal(row(inactive, "receptionist").state, "waiting_you");
  assert.equal(row(inactive, "receptionist").sentence, "Switched off with the line.");
});

test('REGRESSION (S14): a port that was asked for says so on the line row, and what to keep meanwhile -- Bring my number filed a line request and the row said "set up your line"', () => {
  const at = "2026-09-07T13:00:00Z";
  const port = setupSteps(empty({ requests: { line: null, port: at } }), NOW);
  assert.equal(row(port, "line").state, "waiting_them", "asked: now it is ours");
  assert.equal(row(port, "line").verb, null, "asked once — no second ask");
  assert.equal(
    row(port, "line").sentence,
    `Requested ${agoWords(Date.parse(at), NOW)} — a person at Chanlytics will move your number onto Chanlytics with you and reach you by email.`,
    "REGRESSION: a port read as a line",
  );
  assert.ok(
    row(port, "line").details.some((d) => d.startsWith("Keep your current phone service")),
    "and the one thing that loses a number",
  );
  // The newer ask speaks: a line asked for after a port is a line.
  const both = setupSteps(empty({ requests: { line: "2026-09-07T14:00:00Z", port: at } }), NOW);
  assert.ok(row(both, "line").sentence.includes("set up your line with you"), row(both, "line").sentence);
});

test("REGRESSION (S8): a broken configuration offers the ask for a repair, then waits on us and says when -- the owner was told Chanlytics repairs it, with no way to ask", () => {
  const broken = { ...empty().business, broken: true };
  const ask = setupSteps(empty({ business: broken }), NOW);
  assert.equal(row(ask, "facts").state, "waiting_you");
  assert.deepEqual(
    row(ask, "facts").verb,
    { label: "Ask for a repair", to: "verb:request-repair" },
    "REGRESSION: the row's only verb opened Business, which cannot repair it",
  );
  const at = "2026-09-07T13:00:00Z";
  const asked = setupSteps(empty({ business: broken, requests: { line: null, repair: at } }), NOW);
  assert.equal(row(asked, "facts").state, "waiting_them");
  assert.ok(
    row(asked, "facts").sentence.endsWith(
      `Requested ${agoWords(Date.parse(at), NOW)} — a person at Chanlytics will repair them and reach you by email.`,
    ),
    row(asked, "facts").sentence,
  );
  assert.deepEqual(
    row(asked, "facts").verb,
    { label: "Open Business", to: "admin/workspace" },
    "where the problems are listed",
  );
});

test("WhatsApp waits on Meta while the first messages are with them, or while the number is not active", () => {
  const meta = setupSteps(live({ templates: { approved: 0, pending: 3, startersApproved: 0 } }), NOW);
  assert.equal(row(meta, "whatsapp").state, "waiting_them");
  assert.equal(row(meta, "whatsapp").stateWords, "Waiting on Meta");
  assert.equal(
    row(meta, "whatsapp").sentence,
    `Connected on ${formatPhoneDisplay(WA)} — your first messages are with Meta for approval.`,
  );
  assert.ok(row(meta, "whatsapp").details.includes("3 messages with Meta for approval"));
  assert.equal(meta.readiness.answering, true, "the number answers even while a template waits");
  const inactive = setupSteps(
    empty({
      channels: {
        ...empty().channels,
        whatsapp: { present: true, active: false, number: WA, quality: null, lastInboundAt: null },
      },
    }),
    NOW,
  );
  assert.equal(row(inactive, "whatsapp").stateWords, "Waiting on you");
  assert.equal(row(inactive, "whatsapp").sentence, `${formatPhoneDisplay(WA)} is connected but switched off.`);
  // The label is Connections; the ROUTE stays admin/integrations, because
  // notification rows already written in production carry it.
  assert.deepEqual(row(inactive, "whatsapp").verb, { label: "Open Connections", to: "admin/integrations" });
  const few = setupSteps(live({ templates: { approved: 2, pending: 0, startersApproved: 2 } }), NOW);
  assert.deepEqual(row(few, "whatsapp").verb, { label: "Add the starters", to: "outbound" });
  assert.ok(row(few, "whatsapp").details.includes("Add the starter messages: welcome, win-back, the month's offer"));
});

test("business facts: partly there says what is missing; a broken config is its own state", () => {
  const part = setupSteps(empty({ business: { ...facts, hours: false, services: 0 } }), NOW);
  assert.equal(row(part, "facts").state, "waiting_you");
  assert.equal(row(part, "facts").sentence, "Still missing: hours and services.");
  assert.deepEqual(row(part, "facts").verb, { label: "Finish in Business", to: "admin/workspace" });
  const broken = setupSteps(empty({ business: { ...empty().business, broken: true } }), NOW);
  assert.equal(row(broken, "facts").state, "waiting_you");
  assert.match(row(broken, "facts").sentence, /could not be read/);
  const noLink = setupSteps(empty({ business: { ...facts, bookingLink: false } }), NOW);
  assert.ok(row(noLink, "facts").details.includes("No booking link — the receptionist answers, but cannot send one"));
});

test("team and alerts: the verb goes to whichever half is missing; calendar: unreadable is waiting on you", () => {
  const noAlerts = setupSteps(empty({ team: { members: 2, invitesOpen: 0, alertEmails: 0 } }), NOW);
  assert.equal(row(noAlerts, "team").state, "waiting_you");
  assert.deepEqual(row(noAlerts, "team").verb, { label: "Set alerts", to: "admin/notifications" });
  const alone = setupSteps(empty({ team: { members: 1, invitesOpen: 0, alertEmails: 1 } }), NOW);
  assert.equal(row(alone, "team").sentence, "Only you so far · alerts go to 1 address.");
  assert.deepEqual(
    row(alone, "team").verb,
    { label: "Invite", to: "admin/team" },
    "the roster lives on Team since it left the Business pane",
  );
  const invited = setupSteps(empty({ team: { members: 1, invitesOpen: 1, alertEmails: 2 } }), NOW);
  assert.equal(row(invited, "team").state, "ready");
  assert.equal(row(invited, "team").sentence, "1 person · 1 invite open · alerts go to 2 addresses.");
  // The partner who brought the workspace sits on its team, and the owner is told who they are (0012).
  const brought = setupSteps(
    empty({ team: { members: 2, invitesOpen: 0, alertEmails: 1, partner: "Ada Lovelace" } }),
    NOW,
  );
  assert.equal(row(brought, "team").sentence, "2 people · Ada Lovelace is your partner · alerts go to 1 address.");
  const feed = setupSteps(empty({ calendar: { state: "unavailable" } }), NOW);
  assert.equal(row(feed, "calendar").state, "waiting_you");
  assert.deepEqual(row(feed, "calendar").verb, { label: "Check the address", to: "admin/workspace" });
  assert.deepEqual(row(setupSteps(empty(), NOW), "calendar").verb, {
    label: "Paste the address",
    to: "admin/workspace",
  });
  assert.equal(
    row(setupSteps(empty({ calendar: { state: "ok" } }), NOW), "calendar").sentence,
    "Readable — the receptionist offers times from it.",
  );
  assert.equal(
    row(feed, "calendar").sentence,
    "Your calendar could not be read. Check the address in Settings › Business.",
  );
  const why = setupSteps(
    empty({
      calendar: {
        state: "unavailable",
        problem: "The calendar answered 404. It is usually the private iCal link, not the calendar's web page.",
      },
    }),
    NOW,
  );
  assert.equal(
    row(why, "calendar").sentence,
    "Your calendar could not be read. The calendar answered 404. It is usually the private iCal link, not the calendar's web page. Check the address in Settings › Business.",
    "the row says why, in the words the board and the preview use",
  );
});

test("a channel row without a number never reads a null aloud", () => {
  const vm = setupSteps(
    live({
      channels: {
        whatsapp: { present: true, active: true, number: null, quality: null, lastInboundAt: null },
        voice: { present: true, active: true, number: null, lastInboundAt: null },
      },
    }),
    NOW,
  );
  assert.equal(
    vm.readiness.sentence,
    "Your receptionist answers calls on your line and WhatsApp on your number. Texting is not available yet.",
  );
  assert.equal(row(vm, "whatsapp").sentence, "Connected on your number.");
  assert.equal(row(vm, "receptionist").sentence, "Answering on your line.");
  assert.equal(row(vm, "receptionist").verb, null, "nothing to dial");
  assert.ok(!JSON.stringify(vm).includes("null."), "no null read aloud");
});

test("the bell's verb follows the row's route: a setup row opens Setup, an unrouted alert still opens Today", () => {
  const rows = serverNotificationRows({
    seen_at: null,
    notifications: [
      {
        id: "1",
        kind: "alert",
        title: "We got your request for a phone line",
        body: "A person at Chanlytics…",
        route: "admin/setup",
        subject_type: "setup",
        subject_id: null,
        created_at: "2026-09-07T12:00:00Z",
        read: false,
        dismissed: false,
      },
      {
        id: "2",
        kind: "alert",
        title: "Plain",
        body: "x",
        route: null,
        subject_type: null,
        subject_id: null,
        created_at: "2026-09-07T12:00:00Z",
        read: false,
        dismissed: false,
      },
      {
        id: "3",
        kind: "number",
        title: "Your phone line is ready",
        body: "x",
        route: "admin/setup",
        subject_type: "setup",
        subject_id: "c1",
        created_at: "2026-09-07T12:00:00Z",
        read: false,
        dismissed: false,
      },
    ],
  });
  assert.deepEqual(
    rows.map((r) => [r.to, r.action]),
    [
      ["admin/setup", "Finish setting up"],
      ["today", "Open Today"],
      ["admin/setup", "Finish setting up"],
    ],
  );
  assert.equal(verbForRoute("inbox/th-1"), "Open the Inbox");
  assert.equal(verbForRoute("somewhere/new"), null);
});

test("a first ask reaches the platform mailbox through the edge; a repeat does not; a failure is never the owner's problem", () => {
  const route = readCode("apps/dashboard/app/api/v1/setup/request/route.ts");
  assert.ok(route.includes("const told = already"));
  assert.ok(
    route.includes("await tellPlatformOfSetupRequest(member.tenantId, what, ctx.email ?? null, ctx.userId)"),
    "the mail names the workspace, who asked and the person who pressed",
  );
  assert.ok(route.includes("return { request: data, told };"));
  const service = readCode("apps/dashboard/src/server/workspace/tell.ts");
  assert.ok(service.includes("if (!deployment.providersLive || !edgeConfigured()) return false;"), "production only");
  assert.ok(service.includes('"/api/admin/setup-request"'));
  assert.ok(service.includes('"setup_request_tell_failed"'), "logged, not thrown");
  // The edge door -- the knock, the mail to the platform's own mailbox with
  // how to set the line up, the workspace's row the only thing read -- runs
  // in mail-doors.test.mjs.
});

// Which row's verb is the one coral button is the caller's to name, and setup-page-activate.test.mjs presses it.
// The sections on a phone keep their words: they are every page's strip since 25 Sep, drawn and read in
// settings-editor.test.mjs ("on a phone the sections are every page's strip").
test("a Settings card keeps its height, and a row's sentence wraps on a phone", () => {
  const mobile = readRaw("apps/dashboard/src/legacy/styles/mobile.css");
  assert.ok(
    mobile.includes(".set-pane > * { flex: 0 0 auto; }"),
    "a Settings card never shrinks to fit the pane on a phone",
  );
  assert.ok(
    mobile.includes(".setup-rows .cl-attn-sentence { white-space: normal; }"),
    "a row's sentence wraps on a phone",
  );
});

const lineRow = (over = {}) => ({
  id: "0f3c2a1e-1111-4222-8333-444455556666",
  e164: "+13055550100",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 305,
  voice_state: "provisioning",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: "trunk",
  last_error: null,
  state_since: "2026-09-07T14:58:00Z",
  created_at: "2026-09-07T14:57:00Z",
  ...over,
});
const withLines = (rows, ready = true) => ({
  rows,
  ready,
  provider: ready ? "twilio" : null,
  costs: { local_number_month_usd: 1.15 },
});

test("the line row over the product's own line: get one when this deployment can, watch it being set up, retry when it stopped", () => {
  const can = setupSteps(empty({ lines: withLines([]) }), NOW);
  assert.equal(row(can, "line").state, "waiting_you");
  assert.equal(row(can, "line").sentence, "Get a number for calls, or keep the one you have.");
  // The number is part of the plan (Ruben, 24 Sep 2026; the first run's spec): nothing bills a number fee, so nothing quotes one.
  assert.deepEqual(row(can, "line").details, [
    "A local number, included in your plan · your receptionist answers it · texting arrives when the carriers register it",
  ]);
  assert.ok(
    !JSON.stringify(setupSteps(empty({ lines: withLines([]) }), NOW)).includes("$"),
    "no row quotes a price for a number",
  );
  assert.deepEqual(row(can, "line").verb, { label: "Get a line", to: "verb:choose-line" });
  const cannot = setupSteps(empty({ lines: withLines([], false) }), NOW);
  assert.deepEqual(
    row(cannot, "line").verb,
    { label: "Ask for a line", to: "verb:request-line" },
    "no provider here: a person at Chanlytics",
  );
  const busy = setupSteps(empty({ lines: withLines([lineRow()]) }), NOW);
  assert.equal(row(busy, "line").state, "waiting_them");
  assert.equal(
    row(busy, "line").sentence,
    `Setting up ${formatPhoneDisplay("+13055550100")} — ${LINE_STEP_WORDS.trunk}, since ${agoWords(Date.parse("2026-09-07T14:58:00Z"), NOW)}.`,
  );
  assert.equal(row(busy, "line").verb, null);
  assert.equal(
    row(busy, "receptionist").sentence,
    "Being created with your line — it answers the moment the line does.",
  );
  const failed = setupSteps(
    empty({
      lines: withLines([lineRow({ voice_state: "failed", step: "import", last_error: "Retell import: HTTP 422" })]),
    }),
    NOW,
  );
  assert.equal(row(failed, "line").state, "waiting_them");
  assert.equal(
    row(failed, "line").sentence,
    `Setting up ${formatPhoneDisplay("+13055550100")} stopped while ${LINE_STEP_WORDS.import}. A person at Chanlytics has it.`,
  );
  assert.deepEqual(row(failed, "line").verb, {
    label: "Retry",
    to: "verb:retry-line:0f3c2a1e-1111-4222-8333-444455556666",
  });
  assert.ok(!JSON.stringify(failed).includes("HTTP 422"), "the provider's words stay off the page");
  const own = setupSteps(live({ lines: withLines([lineRow({ voice_state: "answering", step: null })]) }), NOW);
  assert.equal(row(own, "line").state, "ready");
  assert.ok(row(own, "line").details.includes("Your own number through Chanlytics"));
  assert.equal(
    setupSteps(empty({ lines: withLines([lineRow({ voice_state: "failed" })], false) }), NOW).next.row,
    "facts",
    "a stopped line is ours to fix, not the next thing to press",
  );
});

test("Setup says what texting actually is, and names a mock filing as a mock filing", () => {
  // The one that matters. A brand filed with Mock: true against Twilio's free
  // test registry shows four green ticks in the console, says "Approved", and
  // delivers nothing -- it expires in thirty days. Setup used to say the same
  // words about it as about a line that had never been filed at all, and the
  // same words about a line the carriers had genuinely approved.
  const withState = (over) =>
    setupSteps(live({ lines: withLines([lineRow({ voice_state: "answering", step: null, ...over })]) }), NOW);

  const mock = withState({ sms_state: "approved", reg_mock: true, registered: true });
  assert.match(row(mock, "line").sentence, /test registry, so nothing is delivered/);
  assert.match(mock.readiness.sentence, /test registry, so nothing is delivered/);
  assert.ok(!/Texting is on/.test(JSON.stringify(mock)), "a rehearsal is never reported as working texting");

  const on = withState({ sms_state: "active" });
  assert.ok(row(on, "line").sentence.endsWith("Texting is on."));
  assert.ok(
    !row(on, "line").details.some((d) => /Texting arrives with lines/.test(d)),
    "nothing still to wait for once it is on",
  );

  const filed = withState({ sms_state: "registering" });
  assert.ok(row(filed, "line").sentence.endsWith("Texting is with the carriers."));
  const refused = withState({ sms_state: "rejected" });
  assert.match(row(refused, "line").sentence, /refused the texting registration/);
  // Unfiled, on a line that answers calls: texting waits on the business record, as Connections' row says (S7).
  assert.ok(
    row(withState({}), "line").sentence.endsWith(
      "Texting needs your business on record for the carriers — two minutes, once, on Connections.",
    ),
  );
});

test("the wiring for lines: routes owner-only and rate-limited, the setup route carries them, the bridge repaints on a step, the page has the chooser", () => {
  for (const [file, bucket] of [
    ["search", "lines_search"],
    ["buy", "lines_buy"],
    ["retry", "lines_retry"],
  ]) {
    const src = readCode(`apps/dashboard/app/api/v1/lines/${file}/route.ts`);
    // buy declares its policy on the export (route()); search and retry still perform it by hand.
    assert.ok(
      src.includes('requireRole(member, "partner")') || src.includes('role: "partner",'),
      `${file}: owners and the partner only`,
    );
    assert.ok(
      src.includes(`takeRate(ctx.userId, "${bucket}")`) || src.includes(`rate: "${bucket}",`),
      `${file}: ${bucket}`,
    );
    assert.ok(src.includes('op: "' + file + '"'), `${file}: the edge op`);
  }
  const server = readCode("apps/dashboard/src/server/connections/lines.ts");
  assert.ok(server.includes('callEdge("/api/admin/lines"'));
  assert.ok(
    !/_sid/.test(server.slice(server.indexOf("LINE_COLUMNS"), server.indexOf("export async function linesFor"))),
    "no provider id is selected for the page",
  );
  // Two hand-kept copies of one mapper: the edge builds a LineDto from the full
  // row, the dashboard from the columns a member may read. A field added to the
  // contract and forgotten on this side compiles cleanly and arrives undefined
  // -- which is how Setup would have called a mock filing "approved".
  for (const field of ["reg_mock", "reg_step"]) {
    assert.ok(server.includes(`${field},`) || server.includes(`${field} `), `${field} is selected`);
    assert.ok(server.includes(`${field}: r.${field},`), `${field} reaches the page`);
  }
  assert.ok(
    /lines: \{\s*rows: lineRows,\s*ready: lineStatus\.ready,\s*provider: lineStatus\.provider,\s*costs: \{ local_number_month_usd: lineStatus\.costs\.local_number_month_usd \},?\s*\},/.test(
      readCode("apps/dashboard/src/server/workspace/setup.ts"),
    ),
  );
  const bridge = readCode("apps/dashboard/src/legacy-bridge/setup.ts");
  assert.ok(
    /refreshOnTables: \[\s*"lines",\s*"notifications",\s*"tenant_channels",\s*"capability_activations",\s*"business_records",\s*"billing_accounts",\s*"google_connections",\s*"calls",\s*(\/\/[^\n]*\s*)?"sending_domains",?\s*\]/.test(
      bridge,
    ),
    "every table a row derives from repaints the page",
  );
  for (const pin of ['"POST lines/search"', '"POST lines/buy"', '"POST lines/retry"'])
    assert.ok(bridge.includes(pin), pin);
  const page = readCode("apps/dashboard/src/legacy/pages/setup.jsx");
  for (const pin of [
    'verb.to === "verb:choose-line"',
    'verb.to.startsWith("verb:retry-line:")',
    'data-testid="setup-chooser"',
    'data-testid="setup-buy"',
    "Get this number",
    'window.canDo("team")',
  ])
    assert.ok(page.includes(pin), pin);
  assert.ok(
    readCode("apps/edge/lib/lines/lines.ts").includes('export { LINE_STEP_WORDS } from "../packages/contracts.js";'),
    "one list of step words",
  );
});

// The landing rule itself moved with the page it lands on: first-run.test.mjs, shouldLandOnFirstRun. The route it
// reads is the address's (shell/address.ts), tested in shell/address/address.test.mjs.

test("the words: four states, no jargon, no trade", () => {
  assert.deepEqual(SETUP_STATE_WORDS, {
    not_started: "Not started",
    waiting_you: "Waiting on you",
    waiting_them: "Waiting on us",
    ready: "Ready",
  });
  // Only what the owner can read: the string literals, not our identifiers.
  const src =
    [
      "packages/contracts/src/setup/setup.ts",
      "packages/contracts/src/setup/setup-rows.ts",
      "packages/contracts/src/setup/setup-rows-phone.ts",
    ]
      .map((f) => readCode(f))
      .join("\n") + readCode("apps/dashboard/src/legacy/pages/setup.jsx");
  const words = [...src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]).join("\n");
  assert.doesNotMatch(
    words,
    /\b(tenant|onboard|provision|SIP|E\.?164|webhook|toggle)\b/i,
    "the owner's words, not ours",
  );
  assert.doesNotMatch(words, /\$\d/, "no invented prices");
});

// Setup left Settings for the first run (#/start): surface-registry.test.mjs holds its route and the old address's
// move, and first-run-page.test.mjs draws it.
test("wiring: manifest, bridge, routes, rate bucket, event kind, migration", () => {
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/pages/setup.jsx";'));
  const app = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(
    app.includes("installSetup();") &&
      /notificationsOverride,\s*setupOverride,\s*googleOverride,\s*billingOverride,?\s*\];/.test(app),
    "the surface boots with the rest",
  );
  assert.ok(
    readCode("apps/dashboard/src/server/rate-limit.ts").includes(
      'setup_request: { limit: 5, windowMs: HOUR_MS, noun: "setup requests" },',
    ),
  );
  assert.ok(EVENT_KINDS.includes("setup.requested"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/setup.ts");
  assert.ok(
    bridge.includes('key: "setup"') &&
      bridge.includes('globals: ["__SETUP"]') &&
      bridge.includes('events: ["surface:setup"]'),
  );
  // A row put off is the member's, and the landing is once a session: setup-later.test.mjs runs both.
  // One assembly, two callers: the workspace reads its own on the session
  // client, the back office reads another's on the service client. The route
  // is now four lines and the pins live where the work does.
  const get = readCode("apps/dashboard/src/server/workspace/setup.ts");
  for (const pin of [
    "parseTenantConfigResult(cfgRow.config)",
    "starterByName(t.name)",
    "calendarWeek({ supabase }, tenantId, { from: null, days: 7 }",
    'viewer.kind === "member" ? teamRoster(supabase, tenantId) : teamCounts(supabase, tenantId)',
    '.eq("consent", "opted_in")',
    '.eq("kind", "setup.requested")',
  ])
    assert.ok(get.includes(pin), pin);
  assert.ok(
    readCode("apps/dashboard/src/server/readers/connections.ts").includes(
      'setupDtoFor(rc.ctx.supabase, rc.tenantId, { kind: "member" }, rc.now)',
    ),
    "and the route is its first caller, through its reader",
  );
  const post = readCode("apps/dashboard/app/api/v1/setup/request/route.ts");
  for (const pin of [
    'role: "operator",',
    'rate: "setup_request",',
    'rpc("setup_request", { p_tenant_id: member.tenantId, p_what: what })',
  ])
    assert.ok(post.includes(pin), pin);
  const mig = readRaw("supabase/migrations/00065_setup_request.sql");
  for (const pin of [
    "create or replace function public.setup_request(p_tenant_id uuid, p_what text)",
    "security definer",
    "public.is_acting_member(p_tenant_id)",
    "kind = 'setup.requested'",
    "interval '1 day'",
    "'admin/setup', 'setup'",
    "grant execute on function public.setup_request(uuid, text) to authenticated",
  ])
    assert.ok(mig.includes(pin), pin);
  const page = readCode("apps/dashboard/src/legacy/pages/setup.jsx");
  for (const pin of [
    "<window.AttnRow",
    "status={[r.stateWords]}",
    'note={r.details.join(" · ")}',
    "testid={`setup-row-${r.id}`}",
    'ctaTestid="setup-verb"',
    "testid: `setup-later-${r.id}`",
    'window.canDo("approve")',
    "window.SetupRows = SetupRows;",
  ])
    assert.ok(page.includes(pin), pin);
  // Today's card of what is left to set up is drawn and pressed in today-doors.test.mjs.
  assert.ok(readCode("packages/contracts/src/index.ts").includes('export * from "./setup";'));
});

test("a workspace that cannot spend AND has no card door is offered the thing that is true", () => {
  // THE GATE-9 WALL. `provision_tenant` gives every new workspace
  // `billing_accounts(mode='stripe', status='none')`. With the Stripe keys unset
  // on a deployment, `billingReadiness()` is false and the Billing page returns
  // every action false — so the line row's "Add a card, then get a number" sent a
  // brand-new self-serve owner to a page with nothing on it, and NOTHING in the
  // product could put the workspace on a direct arrangement. The only escape was
  // a hand-written SQL UPDATE by somebody holding the service role.
  //
  // Setup's BILLING row already knew this and drew nothing ("a closed door draws
  // nothing"); the LINE row read `canSpend` alone and did not. Two rows deciding
  // one thing from one fact, disagreeing.
  // A workspace with NO channel answering yet and no line: the state a brand-new
  // self-serve signup is actually in, which is the whole point. `live()` has a
  // voice channel, so its line row takes the "Open Connections" branch and never
  // reaches the spend decision this test is about.
  const withBilling = (billing) =>
    setupSteps(
      empty({
        business: facts,
        billing,
        lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
      }),
      NOW,
    );
  const lineRow = (vm) => vm.rows.find((r) => r.id === "line");
  const billingRow = (vm) => vm.rows.find((r) => r.id === "billing");

  // 1. CAN SPEND: the number is the next step.
  const paying = withBilling({ mode: "stripe", status: "active", ready: true, trial_days: 14 });
  assert.equal(lineRow(paying).verb.to, "verb:choose-line");

  // 2. CANNOT SPEND, but a door exists: no plan yet, or a free trial, which covers no number -- the number starts the
  // plan, on the first run's phone step, which takes it.
  for (const status of ["none", "trialing"]) {
    const w = withBilling({ mode: "stripe", status, ready: true, trial_days: 14 });
    assert.match(lineRow(w).sentence, /it starts your plan/, status);
    assert.equal(lineRow(w).verb.to, "start/phone", status);
    assert.ok(billingRow(w), `${status}: and the billing row is drawn`);
  }

  // 3. CANNOT SPEND AND NO DOOR: neither row may send anybody to Billing.
  const closed = withBilling({ mode: "stripe", status: "none", ready: false, trial_days: 14 });
  assert.equal(billingRow(closed), undefined, "a closed door draws nothing — unchanged");
  assert.doesNotMatch(lineRow(closed).sentence, /Add a card/, "REGRESSION: sent to a page with no buttons");
  assert.notEqual(lineRow(closed).verb.to, "admin/billing", "REGRESSION: the dead end");
  assert.equal(lineRow(closed).verb.to, "verb:request-line");
  assert.match(lineRow(closed).sentence, /We set up your phone line with you/);
  assert.ok(
    lineRow(closed).details.some((d) => /Billing is not open on this deployment/.test(d)),
    "and it says why, so the owner is not left wondering where the card went",
  );

  // THE INVARIANT the two rows now share: whenever the billing row is absent, no
  // row may point at Billing. Walked across every status rather than asserted for
  // the one that broke.
  for (const status of ["none", "trialing", "active", "past_due", "paused", "unpaid", "incomplete"]) {
    for (const ready of [true, false]) {
      const vm = withBilling({ mode: "stripe", status, ready, trial_days: 14 });
      if (billingRow(vm)) continue;
      const to = lineRow(vm).verb?.to ?? "";
      assert.ok(!/billing/i.test(to), `${status}/ready=${ready}: line row points at ${to} with no billing row drawn`);
    }
  }

  // A direct arrangement is unaffected: it has no billing row by design and has
  // always been allowed to spend.
  const direct = withBilling({ mode: "direct", status: "active", ready: false, trial_days: 0 });
  assert.equal(billingRow(direct), undefined);
  assert.equal(lineRow(direct).verb.to, "verb:choose-line");
});

test("texting on Setup: the sole proprietor waiting on the carriers' text reads that, hosting reads as with the carriers", () => {
  const l = (sms_state) => ({ sms_state, reg_mock: false, reg_sole_prop: true });
  assert.equal(
    textingWords(l("otp_waiting")).sentence,
    "The carriers texted your mobile — reply to that message from the handset itself and texting switches on; the code lasts a day.",
  );
  assert.equal(textingWords(l("hosting")).sentence, "Texting is with the carriers.");
  assert.equal(textingWords(l("otp_waiting")).done, false);
});

test("an activated capability offers to withdraw its activation from its row, and only then", () => {
  const on = setupSteps(live(), NOW);
  assert.deepEqual(row(on, "receptionist").undo, { label: "Withdraw activation", to: "verb:deactivate:voice" });
  assert.deepEqual(row(on, "whatsapp").undo, { label: "Withdraw activation", to: "verb:deactivate:whatsapp" });
  const off = setupSteps({ ...live(), activations: [] }, NOW);
  assert.equal(row(off, "receptionist").undo, null, "nothing to withdraw before it is active");
  assert.equal(row(off, "whatsapp").undo, null);
  assert.equal(
    row(setupSteps(empty(), NOW), "receptionist").undo,
    undefined,
    "a row that is not ready has no second act",
  );
});

test("a save in Workspace and a WhatsApp connect repaint Setup too", async () => {
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  assert.deepEqual(
    AFTER["PUT settings"]().map((o) => o.key),
    ["settings", "today", "calendar", "setup"],
  );
  assert.deepEqual(
    AFTER["POST channels/whatsapp/connect"]().map((o) => o.key),
    ["settings", "setup"],
  );
});

test("a line stopped at the vault reads as ours on the row, offers no Retry, and says so on the capability", () => {
  const stopped = (last_error) =>
    empty({
      channels: {
        ...empty().channels,
        voice: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      },
      lines: {
        rows: [
          {
            id: "l1",
            e164: "+13055550101",
            kind: "chanlytics",
            provider: "twilio",
            area_code: 305,
            voice_state: "failed",
            sms_state: "none",
            reg_mock: false,
            whatsapp_state: "none",
            port_state: "none",
            forwarding_state: "none",
            step: "trunk",
            last_error,
            state_since: "2026-09-07T14:00:00Z",
            created_at: "2026-09-07T13:00:00Z",
          },
        ],
        ready: true,
        provider: "twilio",
        costs: { local_number_month_usd: 1.15 },
      },
    });
  const ours = setupSteps(stopped("keeping the line's credentials: permission denied for schema vault"), NOW);
  assert.equal(
    row(ours, "line").sentence,
    "Setting up +1 (305) 555-0101 stopped at the vault that keeps the line's credentials. A person at Chanlytics has it.",
  );
  assert.equal(row(ours, "line").verb, null, "no Retry that cannot help");
  assert.deepEqual(row(ours, "line").details, [
    "A retry cannot help until the credentials are restored; we have been told and will finish it with you",
  ]);
  const theirs = setupSteps(stopped("Twilio 21422: number not available"), NOW);
  assert.deepEqual(
    row(theirs, "line").verb,
    { label: "Retry", to: "verb:retry-line:l1" },
    "a carrier failure keeps its Retry",
  );
});
