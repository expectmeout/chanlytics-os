/**
 * Where it answers' view model (decision 0073, canvas 4; contracts first-run-channels.ts): the line lookup read as the
 * step says it (R11), WhatsApp's question and its three ways (keeping the app only where this deployment can, R12), the
 * bookings tile with its tool, link and clients' file or how people book, the mailbox, the dashboard filling in, and the
 * count of what is on. The page draws it (first-run-channels-page.test.mjs); this holds the words and the rules.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_HELPERS, lineLookupOf, setupSteps } from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const CW = FIRST_RUN_HELPERS.channelsWords;
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
  ...over,
});
/** Where it answers as the page asks for it: the phone at `channels`, then the tiles. */
function channels(dto, o = {}) {
  const vm = setupSteps({ ...dto, later: [], want: null, choices: { whatsapp: o.whatsapp ?? null } }, NOW);
  const phone = FIRST_RUN_HELPERS.phone({
    dto,
    vm,
    choice: o.choice ?? null,
    returned: false,
    nowMs: NOW,
    at: "channels",
  });
  return FIRST_RUN_HELPERS.channels({
    dto,
    vm,
    phone,
    whatsapp: o.whatsapp ?? null,
    onWhatsapp: o.onWhatsapp ?? null,
    coexistence: o.coexistence ?? true,
    bookingLink: o.bookingLink ?? null,
    website: o.website ?? null,
    people: o.people ?? null,
  });
}

test("the line lookup (R11), read as the step says it: a mobile and whose codes it takes, a landline, an office phone system", () => {
  assert.deepEqual(lineLookupOf({ type: "mobile", carrier: "Verizon Wireless" }), {
    type: "mobile",
    carrier: "verizon",
    name: "Verizon Wireless",
  });
  assert.equal(lineLookupOf({ type: "mobile", carrier: "AT&T Wireless" }).carrier, "att");
  assert.equal(lineLookupOf({ type: "mobile", carrier: "Metro by T-Mobile" }).carrier, "tmobile");
  assert.equal(
    lineLookupOf({ type: "mobile", carrier: "Visible" }).carrier,
    "other",
    "another company's codes are the general ones",
  );
  assert.equal(lineLookupOf({ type: "mobile", carrier: null }).carrier, null, "no name: not known");
  assert.deepEqual(lineLookupOf({ type: "landline", carrier: "Lumen" }), {
    type: "landline",
    carrier: "other",
    name: "Lumen",
  });
  assert.deepEqual(lineLookupOf({ type: "nonFixedVoip", carrier: "RingCentral" }), {
    type: "voip",
    carrier: "office",
    name: "RingCentral",
  });
  assert.equal(lineLookupOf({ type: "tollFree", carrier: null }).type, "unknown");
  assert.equal(lineLookupOf(null), null);
  const said = (raw) => CW.calls.lookup(lineLookupOf(raw));
  assert.equal(said({ type: "mobile", carrier: "Verizon Wireless" }), "a Verizon mobile, we checked");
  assert.equal(said({ type: "mobile", carrier: "Visible" }), "a mobile, we checked");
  assert.equal(said({ type: "landline", carrier: "Lumen" }), "a landline, we checked");
  assert.equal(said({ type: "fixedVoip", carrier: "RingCentral" }), "an office phone system (RingCentral), we checked");
  assert.equal(said({ type: "unknown", carrier: null }), null);
});

test("WhatsApp: on the number kept, asked whether it is on WhatsApp Business; keeping the app only where this deployment connects that way", () => {
  const wa = channels(dtoOf()).whatsapp;
  assert.deepEqual(wa.question, {
    label: "Is +1 (305) 555-0100 on WhatsApp Business?",
    yes: "It's on WhatsApp Business",
    notYet: "Not yet",
    value: null,
  });
  assert.deepEqual(
    wa.options.map((o) => [o.key, o.label, o.says]),
    [
      ["same", "WhatsApp on +1 (305) 555-0100", CW.whatsapp.sameSays],
      ["own", "On its own number", CW.whatsapp.ownSays],
      ["later", "Later", CW.whatsapp.laterSays],
    ],
  );
  assert.equal(channels(dtoOf(), { coexistence: false }).whatsapp.options[0].says, CW.whatsapp.sameMoves);
  assert.deepEqual(
    channels(dtoOf(), { onWhatsapp: false }).whatsapp.options.map((o) => o.key),
    ["own", "later"],
    "not on WhatsApp Business: nothing to keep",
  );
  const picked = channels(dtoOf(), { whatsapp: "same" }).whatsapp;
  assert.deepEqual([picked.value, picked.after], ["same", "Approve on your phone at Go live"]);
  assert.deepEqual(channels(dtoOf(), { whatsapp: "later" }).whatsapp.after, null);
  // A new number: there is no number kept to keep WhatsApp on, and its own is the one picked.
  const fresh = channels(dtoOf(), {
    choice: { way: "new", number: null, pick: { e164: "+13055550177", friendly: "(305) 555-0177" }, pending: false },
  }).whatsapp;
  assert.equal(fresh.question, null);
  assert.deepEqual(
    fresh.options.map((o) => o.key),
    ["own", "later"],
  );
  const connected = channels(
    dtoOf({
      channels: {
        ...dtoOf().channels,
        whatsapp: { present: true, active: true, number: "+13055550100", quality: null, lastInboundAt: null },
      },
    }),
  ).whatsapp;
  assert.deepEqual(
    [connected.connected, connected.options, connected.question],
    ["Connected on +1 (305) 555-0100", [], null],
  );
});

test("bookings: the tool found and where, its link read with how far back, its clients' file with the tool's own steps; or how people book", () => {
  const calendar = {
    source: "calendar",
    state: "done",
    counts: { past: 412, coming: 9 },
    parts_done: 1,
    parts_total: 1,
    oldest: null,
    started_at: null,
    finished_at: null,
    last_error: null,
    via: "vagaro",
  };
  const clients = { ...calendar, source: "clients_file", counts: { people: 640 } };
  const vm = channels(dtoOf({ calendar: { state: "ok", tool: "vagaro" }, imports: [calendar, clients] }), {
    website: "https://www.harbor.example/book",
  });
  assert.deepEqual(
    [vm.bookings.title, vm.bookings.found, vm.bookings.link, vm.bookings.how],
    ["Bookings · Vagaro", "Vagaro found on harbor.example", "Link read · 412 before today, 9 coming up", null],
  );
  assert.equal(vm.bookings.clients.done, "640 clients in from Vagaro");
  assert.deepEqual(vm.clients, {
    heading: "Bring your clients from Vagaro",
    steps: [
      "In Vagaro, open Reports › Customers › Customer List. It takes the account owner.",
      "Select all, then Export › Excel.",
      "Drop the file here, as it is.",
    ],
    file: "Excel",
    noYes: CW.clients.noYes,
  });
  // A tool from the booking link alone, and one whose export we do not know: the general steps.
  const fromLink = channels(dtoOf(), { bookingLink: "https://squareup.com/appointments/book/abc" });
  assert.equal(fromLink.bookings.toolName, "Square");
  assert.deepEqual(fromLink.clients.steps, CW.clients.steps("Square"));
  assert.equal(fromLink.clients.file, null);
  // A link that did not read says so.
  assert.equal(
    channels(dtoOf({ calendar: { state: "unavailable", tool: "vagaro" } })).bookings.link,
    CW.bookings.linkBroken,
  );
  // No tool: how people book, three answers.
  const none = channels(dtoOf()).bookings;
  assert.deepEqual([none.title, none.found, none.link], ["Bookings", null, null]);
  assert.deepEqual(
    none.how.options.map((o) => o.label),
    ["They call or walk in", "A booking site", "By message"],
  );
});

test("the mailbox: connected, the providers this deployment connects, or coming soon; and the count of what is on", () => {
  const sending = (providers, mailboxes = []) => ({ email: { sending: { providers, mailboxes } } });
  assert.deepEqual(channels(dtoOf(sending(["google", "microsoft"]))).email.providers, [
    { key: "google", label: "Connect Gmail" },
    { key: "microsoft", label: "Connect Outlook" },
  ]);
  const on = channels(dtoOf(sending(["google"], [{ address: "owner@harbor.example" }]))).email;
  assert.deepEqual([on.state, on.says, on.providers], ["connected", "owner@harbor.example is connected", []]);
  // Google's app unverified: its warning is said before Connect Gmail, and only where Gmail is offered.
  const warned = channels(
    dtoOf({ email: { sending: { providers: ["google"], mailboxes: [], google_audience: "unverified" } } }),
  ).email;
  assert.equal(warned.state, "connect");
  assert.ok(warned.says.startsWith(CW.email.says), "the tile's own sentence first");
  assert.match(warned.says, /choose Advanced, then Go to Chanlytics\.$/);
  const verified = channels(
    dtoOf({ email: { sending: { providers: ["google"], mailboxes: [], google_audience: "verified" } } }),
  ).email;
  assert.equal(verified.says, CW.email.says, "a verified app warns of nothing");
  const outlookOnly = channels(
    dtoOf({ email: { sending: { providers: ["microsoft"], mailboxes: [], google_audience: "unverified" } } }),
  ).email;
  assert.equal(outlookOnly.says, CW.email.says);
  const soon = channels(dtoOf()).email;
  assert.deepEqual([soon.state, soon.says], ["soon", CW.email.soonSays]);
  assert.equal(soon.note, CW.email.notAnswered, "the receptionist never answers email, said once on the tile");
  // On: a calls choice the page can keep, WhatsApp chosen, bookings read, the mailbox connected.
  assert.equal(channels(dtoOf()).foot, "1 on · nothing is charged yet");
  assert.equal(
    channels(
      dtoOf({ calendar: { state: "ok", tool: "vagaro" }, ...sending(["google"], [{ address: "a@harbor.example" }]) }),
      {
        whatsapp: "own",
      },
    ).foot,
    "4 on · nothing is charged yet",
  );
  const held = channels(dtoOf(), { choice: { way: "new", number: null, pick: null, pending: false } });
  assert.equal(held.foot, "0 on · nothing is charged yet", "a new number not picked yet is not on");
  // No number to be had here (no lines provider): calls are not on; a line already on its way is.
  const noLines = dtoOf({ lines: { ...dtoOf().lines, ready: false } });
  assert.equal(channels(noLines).foot, "0 on · nothing is charged yet", "nothing can answer calls here yet");
  assert.equal(
    channels({ ...noLines, requests: { line: "2026-10-24T12:00:00Z" } }).foot,
    "1 on · nothing is charged yet",
    "a person asked for the line: calls are coming",
  );
});

test("your dashboard filling in: people, email and chats together, the calendar coming up, the reviews; and what is coming in", () => {
  const row = (source, state, counts) => ({
    source,
    state,
    counts,
    parts_done: 0,
    parts_total: 1,
    oldest: null,
    started_at: null,
    finished_at: null,
    last_error: null,
    via: null,
  });
  const vm = channels(
    dtoOf({
      imports: [
        row("mailbox", "running", { messages: 300 }),
        row("whatsapp_history", "done", { messages: 120 }),
        row("calendar", "done", { past: 412, coming: 9 }),
      ],
    }),
    { people: 1640 },
  );
  assert.deepEqual(
    vm.filling.rows.map((r) => [r.key, r.value, r.sub]),
    [
      ["people", "1,640", "your clients, contacts, WhatsApp"],
      ["inbox", "420", "email and chats"],
      ["calendar", "9", "coming up · 412 back"],
      ["reviews", "—", "all of them, from your profile"],
    ],
  );
  assert.deepEqual(vm.filling.bringing, { done: 2, of: 3 });
  assert.equal(channels(dtoOf()).filling.bringing, null, "nothing coming in: no press to it");
  assert.equal(
    channels(dtoOf(), { whatsapp: "same" }).filling.bringing?.of,
    1,
    "WhatsApp chosen: its chats wait for Go live",
  );
});
