/**
 * The notes a Connections row carries beside its sentence (contracts setup/connections.ts, ConnectionRow.notes): what
 * Meta will ask and what WhatsApp costs, said before its sign-up window opens, on the WhatsApp row that offers Connect and nowhere
 * else; a sign-up that was started on the page and did not come back (a reload takes the window's listener with it), said while the
 * mark it left is under an hour old; and the one-time codes sent to the workspace's own line on the Texting row
 * (lines/line-codes.ts), newest first, each said with who sent it and how long ago, and what happens to a code sent to this
 * line, said once under them. A note is its words and, where there is somewhere to go, one link after them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionRows, toChannelVM } from "@chanlytics/contracts";

const NOW = Date.parse("2026-10-06T15:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const ago = (ms) => new Date(NOW - ms).toISOString();

const base = () => ({
  channels: [],
  whatsapp: { ready: true, reason: null },
  lines: { rows: [], ready: false },
  lineRequestedAt: null,
  google: null,
  calendar: null,
});
const own = (over = {}) => ({
  id: "l1",
  e164: "+16465550100",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 646,
  voice_state: "answering",
  sms_state: "active",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: null,
  last_error: null,
  state_since: ago(3 * 24 * 60 * MIN),
  created_at: ago(3 * 24 * 60 * MIN),
  ...over,
});
const by = (rows) => Object.fromEntries(rows.map((r) => [r.kind, r]));
const rowsOf = (inputs) => by(connectionRows({ ...base(), ...inputs }, NOW));

/** What WhatsApp costs: who bills it, what is free, what is charged, and Meta's own page for the prices (no rate is written here). */
const COST = [
  { text: "WhatsApp is billed by Meta, straight to the card on your WhatsApp account — not on your Chanlytics bill." },
  { text: "Free: replies to a customer within 24 hours of their last message — the receptionist's and yours." },
  {
    text: "Charged by Meta for each one delivered: reminders and notices sent after those 24 hours, and every campaign or offer.",
  },
  {
    text: "Prices depend on the customer's country.",
    link: { label: "Meta's current prices", href: "https://business.whatsapp.com/products/platform-pricing#rates" },
  },
];
/** The notes the Connect row says before Meta's window opens: what it asks, in the order it asks, what it costs, and the one thing to do while it is open. */
const PREFLIGHT = [
  { text: "Meta asks you to sign in with Facebook and choose or create your business." },
  {
    text: "Meta texts a code to the number. On a Chanlytics number it shows on the Texting row here, so choose Text message, not Phone call (a call would be answered by the receptionist). Without a Chanlytics line: have the phone at hand.",
  },
  ...COST,
  {
    text: "Add a payment method when Meta asks for one: without it, replies still go out, and the messages your business starts, like reminders and campaigns, are not delivered.",
  },
  {
    text: "A new business on Meta can start conversations with 250 people a day until it is verified with Meta; replies to customers who write first are not limited.",
  },
  { text: "Keep this page open until Meta's window closes." },
];
/** What the row says of a sign-up that was started here and did not come back. */
const LEFT_OPEN = {
  text: "A WhatsApp sign-up was started here and did not come back to Chanlytics — if you finished it in Meta's window, press Connect WhatsApp again and choose the WhatsApp account Meta already made.",
};

test("the WhatsApp row that offers Connect says what Meta will ask and what WhatsApp costs, in the order the owner meets them, and to keep the page open until the window closes; the limit it names is the one the product knows", () => {
  const r = rowsOf({}).whatsapp;
  assert.equal(r.verb.to, "verb:whatsapp-connect");
  assert.deepEqual(r.notes, PREFLIGHT);
  assert.deepEqual(
    r.notes.filter((n) => n.link).map((n) => n.link.href),
    [COST[3].link.href],
    "one link: Meta's rates",
  );
});

test("a sign-up started on the page that did not come back is named first, while the mark it left is under an hour old and the workspace has no WhatsApp number", () => {
  const notes = (signupLeftOpenAt) => rowsOf({ signupLeftOpenAt }).whatsapp.notes;
  assert.deepEqual(
    notes(ago(5 * MIN)),
    [LEFT_OPEN, ...PREFLIGHT],
    "five minutes ago: the page was reloaded under Meta's window",
  );
  assert.deepEqual(notes(ago(HOUR - 1)), [LEFT_OPEN, ...PREFLIGHT], "a millisecond short of an hour is still under it");
  for (const stale of [ago(HOUR), ago(2 * HOUR), ago(-5_000), "last tuesday", "", null, undefined])
    assert.deepEqual(notes(stale), PREFLIGHT, `${stale}: not a sign-up anyone is waiting on`);
  // The note says to press Connect WhatsApp again, so it is said only where that button is: not while the door is being asked,
  // not where this deployment cannot connect a number, and not once a number is connected.
  const mark = ago(5 * MIN);
  assert.deepEqual(rowsOf({ signupLeftOpenAt: mark, whatsapp: undefined }).whatsapp.notes, []);
  assert.deepEqual(
    rowsOf({ signupLeftOpenAt: mark, whatsapp: { ready: false, reason: "no_config_id" } }).whatsapp.notes,
    [],
  );
  const connected = toChannelVM(
    {
      id: "ch-wa",
      kind: "whatsapp",
      number_e164: "+13055550188",
      status: "active",
      created_at: ago(30 * 24 * HOUR),
      last_inbound_at: ago(2 * MIN),
    },
    new Date(NOW),
  );
  assert.deepEqual(
    rowsOf({ signupLeftOpenAt: mark, channels: [connected] }).whatsapp.notes,
    COST,
    "a connected row says what it costs, and nothing of the sign-up",
  );
});

test("a WhatsApp row that does not offer Connect says none of the sign-up: still asking, not set up here, or a number already connected", () => {
  assert.deepEqual(rowsOf({ whatsapp: undefined }).whatsapp.notes, []);
  assert.deepEqual(rowsOf({ whatsapp: null }).whatsapp.notes, []);
  assert.deepEqual(rowsOf({ whatsapp: { ready: false, reason: "no_config_id" } }).whatsapp.notes, []);
  const connected = toChannelVM(
    {
      id: "ch-wa",
      kind: "whatsapp",
      number_e164: "+13055550188",
      status: "active",
      created_at: ago(30 * 24 * 60 * MIN),
      last_inbound_at: ago(2 * MIN),
    },
    new Date(NOW),
  );
  // (What a connected number says of what Meta holds, and of how to try it from a phone: whatsapp-standing.test.mjs.)
  assert.deepEqual(
    rowsOf({ channels: [connected] }).whatsapp.notes,
    COST,
    "nothing read yet from Meta: what WhatsApp costs, and no more",
  );
});

test("every other row has no notes", () => {
  const rows = connectionRows({ ...base(), lines: { rows: [own()], ready: true } }, NOW);
  for (const r of rows.filter((x) => x.kind !== "whatsapp")) assert.deepEqual(r.notes, [], r.kind);
});

test("the Texting row of a workspace's own line carries each code sent to it, newest first, with who sent it and when, and says once that such a code is never answered", () => {
  const codes = [
    { code: "482913", from: null, at: ago(20_000) },
    { code: "788-963", from: "WhatsApp", at: ago(2 * MIN) },
    { code: "123456", from: "Google", at: ago(9 * MIN) },
  ];
  const r = rowsOf({ lines: { rows: [own()], ready: true }, codes }).sms;
  assert.deepEqual(
    r.notes.map((n) => n.text),
    [
      "A code: 482913 · just now",
      "Code from WhatsApp: 788-963 · 2m ago",
      "Code from Google: 123456 · 9m ago",
      "Codes sent to this line are never answered and never become people.",
    ],
  );
  assert.deepEqual(
    r.notes.filter((n) => n.link),
    [],
    "no link under a code",
  );
  assert.equal(r.state, "connected", "the row's own state is untouched");
});

test("no code, no note; no line of our own, no note; a code with no time is not said", () => {
  assert.deepEqual(rowsOf({ lines: { rows: [own()], ready: true } }).sms.notes, []);
  assert.deepEqual(rowsOf({ lines: { rows: [own()], ready: true }, codes: [] }).sms.notes, []);
  const code = { code: "788-963", from: "WhatsApp", at: ago(MIN) };
  assert.deepEqual(
    rowsOf({ lines: { rows: [], ready: false }, codes: [code] }).sms.notes,
    [],
    "no line to have received it",
  );
  assert.deepEqual(
    rowsOf({ lines: { rows: [own({ provider: "carrier", kind: "forwarded" })], ready: true }, codes: [code] }).sms
      .notes,
    [],
    "a line the business kept at its carrier has no texts of ours",
  );
  assert.deepEqual(
    rowsOf({
      lines: { rows: [own()], ready: true },
      codes: [{ code: "788-963", from: "WhatsApp", at: "last tuesday" }],
    }).sms.notes,
    [],
  );
});
