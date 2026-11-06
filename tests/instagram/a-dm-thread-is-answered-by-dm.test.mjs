/**
 * A DM thread is answered by DM, inside Instagram's day, and every page says so (decision 0001, step 8).
 *
 * A member's reply (core conversations/reply.ts) on a thread whose person last wrote by DM goes to their Instagram-scoped
 * id, never a number, while Instagram's 24-hour window is open by the DM's own clock (a WhatsApp message does not open
 * it); past it nothing is queued and the member is told why, since Instagram has no approved message to send instead. The
 * pages read the same facts through contracts: the thread's wire and its words, its window, the People row's reply and
 * booking-link act, where a person came from, Connections' row, the receptionist's prompt and the words of a START.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { replyToConversation, DM_WINDOW_CLOSED_REFUSAL } = await importSrc("packages/core/src/conversations/reply.ts");
const { DM_CLOSED } = await importSrc("packages/contracts/src/people/person-reach.ts");
const { igClockOfRow, replyChannelOfRow } = await importSrc("packages/contracts/src/people/person-row.ts");
const {
  windowClockOf,
  replyWindow,
  writtenChannelOf,
  threadChannelWords,
  answerWireOf,
  agentFor,
  toInboxThreadVM,
  THREAD_PANE_WORDS,
  repliesWords,
  bookingLinkAction,
  cameFromOf,
  connectionRows,
  toChannelVM,
  offersFacts,
  dmBackOnConfirmation,
  optInConfirmation,
  REPLY_LIMITS,
} = contracts;

const NOW = Date.parse("2026-10-27T12:00:00Z");
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const IGSID = "6100000000000001";

/* ------------------------------------------------------------ the reply */

function fakes(over = {}) {
  const log = [];
  const answers = {
    pauseMs: 2 * HOUR,
    replyChannel: "instagram",
    claimKey: { won: true },
    claimForReply: true,
    takeControl: undefined,
    withdrawDrafts: 0,
    queue: "m1",
    schedule: undefined,
    cancelOrphan: undefined,
    record: "d1",
    resolveEscalation: undefined,
    storeReceipt: true,
    template: null,
    templateFacts: null,
    ...over,
  };
  const ports = { now: () => NOW, hash: (s) => `h(${s})` };
  for (const [name, answer] of Object.entries(answers))
    ports[name] = async (...args) => {
      if (!["pauseMs", "replyChannel", "template", "templateFacts"].includes(name)) log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  return { ports, ops: () => log.map((l) => l[0]), call: (n) => log.find((l) => l[0] === n) };
}
const dmThread = (over = {}) => ({
  id: "c1",
  tenant_id: "t1",
  phone_e164: null,
  contact_id: "k1",
  last_wa_inbound_at: null,
  last_ig_inbound_at: iso(NOW - HOUR),
  instagram_id: IGSID,
  consent: "unknown",
  dnc: false,
  marketing_consent: null,
  ...over,
});
const cmd = (conv, body = { text: "Saturday at 10 works!" }) => ({ conv, userId: "u1", body, idempotencyKey: null });

test("a member's reply on a DM thread is queued for the person's Instagram id, never a number, inside Instagram's day", async () => {
  const { ports, call } = fakes();
  const receipt = await replyToConversation(ports, cmd(dmThread()));
  assert.equal(receipt.window_open, true);
  assert.equal(call("queue")[1].channel, "instagram");
  const job = call("schedule")[3];
  assert.equal(job.to_instagram, IGSID);
  assert.equal("to_phone" in job, false, "a DM's address never travels in a field read as a number");
  assert.equal(job.body, "Saturday at 10 works!");
});

test("past Instagram's day nothing is queued, a template included, and the member is told why; a WhatsApp message does not open it", async () => {
  const late = dmThread({ last_ig_inbound_at: iso(NOW - 25 * HOUR), last_wa_inbound_at: iso(NOW - HOUR) });
  for (const body of [{ text: "Hi again" }, { template: { name: "reservar_ahora", language: "en_US" } }]) {
    const { ports, ops } = fakes();
    await assert.rejects(
      replyToConversation(ports, cmd(late, body)),
      (e) => e.code === "conflict" && e.message === DM_WINDOW_CLOSED_REFUSAL,
    );
    assert.deepEqual(ops(), [], "nothing claimed, paused or queued");
  }
  const { ports } = fakes();
  await assert.rejects(
    replyToConversation(ports, cmd(dmThread({ instagram_id: null }))),
    /Instagram account is not on record/,
  );
});

test("a DM is longer than one Instagram message allows only up to the reply's own ceiling", async () => {
  assert.ok(REPLY_LIMITS.instagram.max >= 1000);
  const { ports } = fakes();
  await assert.rejects(
    replyToConversation(ports, cmd(dmThread(), { text: "x".repeat(REPLY_LIMITS.instagram.max + 1) })),
    (e) => e.message === REPLY_LIMITS.instagram.refusal,
  );
});

/* ------------------------------------------------------------ the pages */

test("each wire's window reads its own clock: a DM's from its accessor, WhatsApp's from its own, a text and an email none", () => {
  const clocks = { whatsapp: iso(NOW - HOUR), instagram: iso(NOW - 30 * HOUR) };
  assert.equal(windowClockOf("instagram", clocks), clocks.instagram);
  assert.equal(windowClockOf("whatsapp", clocks), clocks.whatsapp);
  assert.equal(windowClockOf("sms", clocks), null);
  assert.equal(windowClockOf("email", clocks), null);
  assert.equal(replyWindow("instagram", windowClockOf("instagram", clocks), new Date(NOW)).open, false);
  assert.equal(replyWindow("whatsapp", windowClockOf("whatsapp", clocks), new Date(NOW)).open, true);
});

const dmMessage = (over = {}) => ({
  id: "m1",
  channel: "instagram",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Do you have Saturday?",
  media: null,
  meta: null,
  status: "received",
  created_at: iso(NOW - HOUR),
  ...over,
});

test("a DM thread says Instagram: its wire, its receptionist, its reply box and its window, by the DM's clock", () => {
  const messages = [dmMessage()];
  assert.equal(writtenChannelOf("instagram"), "instagram");
  assert.equal(answerWireOf(messages), "instagram");
  assert.equal(threadChannelWords(messages), "Instagram");
  assert.equal(agentFor("instagram").name, "Instagram Receptionist");
  const dto = (over = {}) => ({
    id: "c1",
    state: "open",
    paused_until: null,
    last_wa_inbound_at: iso(NOW - HOUR),
    last_ig_inbound_at: iso(NOW - HOUR),
    last_message_at: iso(NOW - HOUR),
    contact: {
      id: "k1",
      display_name: "Dana Ruiz",
      wa_profile_name: null,
      phone_e164: null,
      consent: "unknown",
      dnc: false,
    },
    messages,
    ...over,
  });
  const open = toInboxThreadVM(dto(), null, "UTC", new Date(NOW));
  assert.equal(open.primaryChannel, "instagram");
  assert.equal(open.replyVia, "Instagram");
  assert.equal(open.windowOpen, true);
  // A WhatsApp clock that is open does not open a DM thread's window.
  const shut = toInboxThreadVM(dto({ last_ig_inbound_at: iso(NOW - 26 * HOUR) }), null, "UTC", new Date(NOW));
  assert.equal(shut.windowOpen, false);
  assert.match(THREAD_PANE_WORDS.dmClosedWhy, /Instagram/);
});

test("a People row of someone who last wrote by DM: replied to by DM, by its own clock, and its booking link said for a DM", () => {
  const row = {
    has_chat: true,
    last_inbound_channel: "instagram",
    message_channels: ["instagram"],
    last_wrote_at: iso(NOW - HOUR),
  };
  assert.equal(replyChannelOfRow(row), "instagram");
  assert.equal(igClockOfRow(row), row.last_wrote_at);
  assert.equal(igClockOfRow({ last_inbound_channel: "whatsapp", last_wrote_at: row.last_wrote_at }), null);
  const stop = { optedOut: false, who: "Dana" };
  const open = bookingLinkAction(
    { via: "Instagram", window: { open: true, hoursLeft: 20 }, emailStopped: false },
    stop,
  );
  assert.equal(open.label, "DM the booking link");
  assert.equal(open.ready, true);
  const shut = bookingLinkAction(
    { via: "Instagram", window: { open: false, hoursLeft: 0 }, emailStopped: false },
    stop,
  );
  assert.equal(shut.offered, false, "nothing waits in a DM thread past Instagram's day");
  assert.equal(shut.title, DM_CLOSED);
  assert.equal(repliesWords("Instagram", { open: false, hoursLeft: 0 }, { ...stop, emailStopped: false }), DM_CLOSED);
  assert.equal(
    repliesWords("Instagram", { open: true, hoursLeft: 5 }, { ...stop, emailStopped: false }),
    "Any message, for 5 more hours",
  );
  assert.deepEqual(cameFromOf({ came_from: "instagram" }), { key: "instagram", label: "Instagram" });
});

test("Connections' Instagram row: Later until the app is here, Connect once it is, the handle when connected, and a lapse asks again", () => {
  const base = {
    channels: [],
    whatsapp: null,
    lines: { rows: [], ready: false },
    lineRequestedAt: null,
    google: null,
    calendar: null,
  };
  const rowOf = (i) => connectionRows({ ...base, ...i }, NOW).find((r) => r.kind === "instagram");
  assert.equal(rowOf({}).state, "later");
  assert.equal(rowOf({ instagram: { ready: false } }).state, "later");
  const offered = rowOf({ instagram: { ready: true } });
  assert.equal(offered.state, "none");
  assert.deepEqual(offered.verb, { label: "Connect Instagram", to: "verb:instagram-connect", who: "owner" });
  const channel = (over) =>
    toChannelVM(
      {
        id: "ch1",
        kind: "instagram",
        number_e164: null,
        status: "active",
        created_at: iso(NOW - 48 * HOUR),
        last_inbound_at: iso(NOW - HOUR),
        handle: "harbor.nails",
        ...over,
      },
      new Date(NOW),
    );
  const live = rowOf({ instagram: { ready: true }, channels: [channel({})] });
  assert.equal(live.state, "connected");
  assert.equal(live.detail, "@harbor.nails");
  assert.equal(live.verb.to, "verb:instagram-disconnect");
  const lapsed = rowOf({ instagram: { ready: true }, channels: [channel({ lapsed_at: iso(NOW - HOUR) })] });
  assert.equal(lapsed.state, "attention");
  assert.equal(lapsed.verb.to, "verb:instagram-connect");
  assert.equal(lapsed.verb.label, "Connect again");
});

test("the receptionist is told it answers Instagram DMs, never asks for offers there, and a START by DM is confirmed in a DM's words", () => {
  const facts = offersFacts(
    { marketingConsent: "unknown", offersAskedAt: null, optedOut: false },
    "instagram",
    new Date(NOW),
    "UTC",
  );
  assert.ok(facts.includes("This conversation is by Instagram direct message, not WhatsApp."));
  assert.ok(!facts.includes("Has not been asked for the yes to offers."), "the ask for offers is WhatsApp's alone");
  const words = dmBackOnConfirmation("Harbor Nails");
  assert.match(words, /^Harbor Nails: /);
  assert.match(words, /STOP/);
  assert.doesNotMatch(words, /rates|HELP|texts/);
  assert.match(
    optInConfirmation("Harbor Nails", "conversational"),
    /texts/,
    "a text's START keeps the campaign's filed words",
  );
});
