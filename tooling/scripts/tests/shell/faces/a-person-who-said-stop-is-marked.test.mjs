/**
 * A person who asked to stop is marked wherever they are offered as someone to answer or contact (the wiring plan's task
 * 4.3; D1-stop-unseen).
 *
 * The rule for "asked to stop, or on do-not-contact" is one function (isOptedOutContact), and the reply box turned into a
 * banner, People's State pill read "Opted out" and a run's sheet said "Asked to stop". The Inbox's row and header,
 * Conversations' row, Live's row, the Pipeline's card, peek and picker, and the Calendar's person line named the same
 * person with nothing about it, so the owner learned it when the box would not take a reply. And on People, "Needs you"
 * outranks "Opted out", so a person who texted STOP on a thread that still waited on you read as someone to answer.
 *
 * What is held here, by executing the code:
 *  - the flag is the one predicate's, carried on each view model the lists draw: the chat's, the call's, Live's, the
 *    Calendar's block and the Pipeline's peek (the Inbox thread's `optedOut` and People's `stopped` were there already);
 *  - the mark is the kit's pill in the stop words, in the one tone a STOP has, with the fact whole for its hover;
 *  - People says it beside the pill only where the pill says something else; the Pipeline's table and phone card, the
 *    Inbox's row and Live's row draw it for a person who stopped, and for no one else.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STOP_WORDS,
  isOptedOutContact,
  pipelineOf,
  pipelinePeekOf,
  shiftKey,
  stopToldBesideState,
  toCalendarVM,
  toCallVM,
  toConversationVM,
  toInboxThreadVM,
  toLiveCallVM,
  toPersonRowVM,
} from "@chanlytics/contracts";
import { installLegacyReact, fresh, find, all, byTestId, classes, textOf } from "../../_legacy-react.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
const S = "../../../../../apps/dashboard/src";
const { Face } = await import(`${S}/surfaces/kit/face/face.tsx`);
const { Icon } = await import(`${S}/surfaces/kit/icon/icon.tsx`);
const { StoppedMark } = await import(`${S}/surfaces/kit/pill/stopped-mark.tsx`);
const { PL_COLUMNS, PL_PHONE_COLUMNS } = await import(`${S}/surfaces/people/cells/columns.tsx`);
const { pipeGlassColumns, pipePhoneColumns } = await import(`${S}/surfaces/people/pipeline/columns.tsx`);
const { threadRow } = await import(`${S}/surfaces/inbox/pages/list-rows.tsx`);
const { IxWho } = await import(`${S}/surfaces/inbox/thread/who.tsx`);
const { LrList } = await import(`${S}/surfaces/live/list.tsx`);
const { cvStopped } = await import(`${S}/surfaces/inbox/cv-rules.ts`);

const h = (type, props, ...kids) => globalThis.React.createElement(type, props, ...kids);

const ZONE = "America/New_York";
const H = 3_600_000;
const DAY = 24 * H;
/** Wednesday, Sep 23, 2026, noon in New York. */
const NOW_MS = Date.parse("2026-09-23T16:00:00Z");
const NOW = new Date(NOW_MS);
const iso = (ms) => new Date(ms).toISOString();

const hasMark = (tree) => !!find(tree, (n) => n.type === StoppedMark);
const glyphIn = (tree) => find(tree, (n) => n.type === Icon)?.props.name ?? null;

/** A person's consent, as a contact row carries it. */
const STOPPED = { consent: "opted_out", dnc: false };
const ON_DNC = { consent: "opted_in", dnc: true };
const FINE = { consent: "opted_in", dnc: false };

/* ------------------------------------------ the words ------------------------------------------ */

test("the stop words have one mark, in the one tone a STOP has, and its hover is the fact whole", () => {
  assert.equal(STOP_WORDS.mark, "Stopped");
  assert.equal(STOP_WORDS.tone, "plain", "a STOP is news and no wait: never the amber of Needs you");
  assert.equal(STOP_WORDS.said(), "Asked to stop receiving messages");
  fresh();
  const mark = h(StoppedMark, {});
  const pill = find(mark, (n) => n.type === "span" && classes(n).includes("pill"));
  assert.ok(pill, "the kit's one pill");
  assert.equal(pill.props.className, "pill", "at rest, neutral: no tone's ground");
  assert.equal(textOf(mark), "Stopped");
  assert.equal(pill.props.title, "Asked to stop receiving messages");
  assert.equal(pill.props["data-testid"], "stopped-mark");
  assert.equal(
    h(StoppedMark, { className: "cl-row-stopped", testid: "mine" }).rendered.rendered.props["data-testid"],
    "mine",
  );
  assert.ok(classes(h(StoppedMark, { className: "cl-row-stopped" }).rendered.rendered).includes("cl-row-stopped"));
});

/* ----------------------------------- the flag on each view model ----------------------------------- */

const wrote = (id, body, at) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at: at,
  channel_ts: at,
});
const contact = (name, consent = FINE, over = {}) => ({
  id: "k-1",
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+13055550100",
  ...consent,
  ...over,
});
const conv = (name, consent, over = {}) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: iso(NOW_MS - 40 * 60_000),
  last_message_at: iso(NOW_MS - 20 * 60_000),
  last_inbound_at: iso(NOW_MS - 40 * 60_000),
  contact: contact(name, consent),
  messages: [wrote("m-1", "Do you have Friday?", iso(NOW_MS - 40 * 60_000))],
  ...over,
});
const callDto = (consentOf, over = {}) => ({
  id: "k9",
  retell_call_id: "r-k9",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+13055550100",
  from_raw: null,
  to_e164: "+13055550123",
  started_at: iso(NOW_MS - 3 * H),
  ended_at: iso(NOW_MS - 3 * H + 190_000),
  updated_at: iso(NOW_MS - 3 * H + 190_000),
  duration_ms: 190_000,
  disconnection_reason: "agent_hangup",
  sentiment: "Positive",
  call_successful: true,
  in_voicemail: false,
  summary: "The caller asked about a bridal trial.",
  transcript_object: null,
  recording: null,
  conversation_id: "c1",
  contact_id: "k-1",
  message_id: "m-1",
  contact:
    consentOf === null
      ? null
      : { display_name: "Dana Cole", wa_profile_name: null, phone_e164: "+13055550100", ...consentOf },
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: null,
  ...over,
});

test("a chat row, the Inbox's thread and a call row carry the one flag: opted out, or on do-not-contact", () => {
  for (const [label, consent, says] of [
    ["opted out", STOPPED, true],
    ["on do-not-contact", ON_DNC, true],
    ["a person who can be answered", FINE, false],
    ["a read that carried neither column", {}, false],
  ]) {
    assert.equal(isOptedOutContact(consent), says, label);
    assert.equal(
      toConversationVM(conv("Dana Cole", consent), null, ZONE, NOW).stopped,
      says,
      `Conversations' row: ${label}`,
    );
    assert.equal(
      toInboxThreadVM(conv("Dana Cole", consent), null, ZONE, NOW).optedOut,
      says,
      `the Inbox's thread: ${label}`,
    );
    assert.equal(toCallVM(callDto(consent), ZONE, NOW).stopped, says, `a call's row: ${label}`);
    assert.equal(toLiveCallVM(callDto(consent), ZONE, NOW).stopped, says, `Live's row: ${label}`);
  }
  // A caller nobody knows, and one who withheld their number, are not someone who asked to stop.
  assert.equal(toCallVM(callDto(null), ZONE, NOW).stopped, false);
  assert.equal(toLiveCallVM(callDto(null), ZONE, NOW).stopped, false);
  const withheld = callDto(null, { from_e164: null, from_raw: null });
  assert.deepEqual([toCallVM(withheld, ZONE, NOW).stopped, toLiveCallVM(withheld, ZONE, NOW).stopped], [false, false]);
});

test("a person's one row in Conversations says it when any row it stands for does", () => {
  const chat = { stopped: false, parts: undefined };
  const call = { stopped: true };
  assert.equal(cvStopped({ ...chat }), false);
  assert.equal(cvStopped({ stopped: undefined }), false, "a row read before the flag existed says nothing");
  assert.equal(cvStopped({ ...chat, parts: [chat, call] }), true, "a call of theirs is theirs");
  assert.equal(cvStopped({ ...chat, parts: [chat, { stopped: false }] }), false);
});

const week = (person) => {
  const from = "2026-09-21";
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: shiftKey(from, i), items: [], windows: [] });
  days[2].items.push({
    id: "e1",
    start: "2026-09-23T18:00:00.000Z",
    end: "2026-09-23T19:00:00.000Z",
    title: "Gloss",
    all_day: false,
    person,
  });
  return {
    timezone: ZONE,
    from,
    to: "2026-09-27",
    feed: {
      present: true,
      state: "ok",
      read_at: iso(NOW_MS - 2 * 60_000),
      events: 1,
      recurring_expanded: 0,
      skipped_recurring: 0,
    },
    hours: {
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "09:00", close: "18:00" },
      wed: { open: "09:00", close: "18:00" },
      thu: { open: "09:00", close: "18:00" },
      fri: { open: "09:00", close: "18:00" },
      sat: {},
      sun: {},
    },
    closures: [],
    rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
    booking_link: "https://book.example.com/studio",
    next_opening: null,
    days,
  };
};

test("the Calendar's person carries it from the match: a stop is a stop whether or not there is a thread", () => {
  const blockOf = (person) => toCalendarVM(week(person), NOW).days[2].blocks[0].person;
  assert.equal(blockOf({ id: "p1", name: "Dana Cole", opted_out: true }).stopped, true);
  assert.equal(
    blockOf({ id: "p1", name: "Dana Cole", thread: "c-1", wa_inbound_at: iso(NOW_MS - H), opted_out: true }).stopped,
    true,
  );
  assert.equal(blockOf({ id: "p1", name: "Dana Cole", opted_out: false }).stopped, false);
  assert.equal(
    blockOf({ id: "p1", name: "Dana Cole" }).stopped,
    false,
    "a read whose match carries no reach says nothing",
  );
});

/* ----------------------------------------- People and the Pipeline ----------------------------------------- */

const personRow = (id, name, over = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+13055550100",
  email: null,
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: iso(NOW_MS - 60 * DAY),
  marketing_consent: null,
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: `cv-${id}`,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: iso(NOW_MS - 40 * DAY),
  last_message_at: iso(NOW_MS - 40 * DAY),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Thanks",
  last_inbound_at: iso(NOW_MS - 40 * DAY),
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(NOW_MS - 90 * DAY),
  earliest_row_at: iso(NOW_MS - 90 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});
const proposal = {
  deal_id: "d-1",
  deal_stage: "proposed",
  deal_service: "Color correction",
  deal_proposed_at: iso(NOW_MS - 2 * DAY),
  deal_decided_at: null,
  deal_ended_at: null,
  deal_amount_cents: null,
  deal_per: null,
  deal_proposal_url: "https://docs.example.com/proposal",
  deal_valid_until: null,
  deal_lost_reason: null,
};
const vmOf = (id, name, over = {}) => toPersonRowVM(personRow(id, name, over), ZONE, NOW);
const CTX = { attention: {}, onOpen() {}, onWarm() {}, shows: {}, bookingLink: null, drop: null, listsOf: {} };

test("People says a stop beside its pill only where the pill says something else", () => {
  fresh();
  const quietStop = vmOf("p-quiet", "Dana Cole", STOPPED);
  const busyStop = vmOf("p-busy", "Dana Cole", { ...STOPPED, latest_state: "needs_human", needs_human: true });
  const busyFine = vmOf("p-fine", "Dana Cole", { latest_state: "needs_human", needs_human: true });
  assert.deepEqual([quietStop.state, quietStop.stopped], ["opted_out", true], "the pill is the stop already");
  assert.deepEqual([busyStop.state, busyStop.stopped], ["needs_you", true], "attention outranks the stop in the pill");
  assert.deepEqual([busyFine.state, busyFine.stopped], ["needs_you", false]);
  assert.deepEqual(
    [quietStop, busyStop, busyFine].map(stopToldBesideState),
    [false, true, false],
    "said once: by the pill, else beside it, else not at all",
  );

  const state = PL_COLUMNS.find((c) => c.key === "state");
  assert.equal(hasMark(state.cell(busyStop, CTX)), true, "the table's State cell");
  assert.equal(hasMark(state.cell(quietStop, CTX)), false, "its pill says Opted out");
  assert.equal(hasMark(state.cell(busyFine, CTX)), false);
  const card = PL_PHONE_COLUMNS[0];
  assert.equal(hasMark(card.cell(busyStop, CTX)), true, "the phone's card, among its facts");
  assert.equal(hasMark(card.cell(quietStop, CTX)), false);
  assert.equal(hasMark(card.cell(busyFine, CTX)), false);
});

test("the Pipeline says a stop on its table's person cell and on its phone card, and not for anyone who can be answered", () => {
  fresh();
  const [tableName] = pipeGlassColumns();
  const [phoneCard] = pipePhoneColumns();
  const ctx = { ...CTX, attention: null };
  const stopped = pipelineOf(
    [vmOf("p-1", "Dana Cole", { ...STOPPED, ...proposal })],
    NOW_MS,
    ZONE,
    null,
  ).groups.flatMap((g) => g.rows)[0];
  const fine = pipelineOf([vmOf("p-2", "Rosa Example", proposal)], NOW_MS, ZONE, null).groups.flatMap((g) => g.rows)[0];
  assert.equal(hasMark(tableName.cell(stopped, ctx)), true);
  assert.equal(hasMark(phoneCard.cell(stopped, ctx)), true);
  assert.equal(hasMark(tableName.cell(fine, ctx)), false);
  assert.equal(hasMark(phoneCard.cell(fine, ctx)), false);
  // And People's own table cell is not the Pipeline's: its State pill says it there.
  assert.equal(hasMark(PL_COLUMNS.find((c) => c.key === "name").cell(vmOf("p-1", "Dana Cole", STOPPED), CTX)), false);
  // The peek's head reads it from the row too.
  assert.equal(pipelinePeekOf(stopped, "proposals").stopped, true);
  assert.equal(pipelinePeekOf(fine, "proposals").stopped, false);
});

/* ------------------------------------ the Inbox's row and Live's row ------------------------------------ */

const LIST = {
  activeBucket: "all",
  inNeedsBucket: false,
  searching: false,
  multipleAgents: false,
  activeThreadId: null,
  selected: [],
  tabStopId: undefined,
  sendingIn: () => null,
  onSelectThread() {},
  onToggleSelect() {},
  onRowKey() {},
};

test("the Inbox's row draws one face for the person, with the wire's badge, and says a stop beside the name", () => {
  fresh();
  const rowOf = (name, consent, over = {}) =>
    threadRow(LIST, toInboxThreadVM(conv(name, consent, over), null, ZONE, NOW), 0);
  const stopped = rowOf("Dana Cole", STOPPED);
  assert.ok(byTestId(stopped, "thread-stopped"), "a person who asked to stop");
  assert.equal(textOf(byTestId(stopped, "thread-stopped")), "Stopped");
  assert.equal(byTestId(rowOf("Dana Cole", FINE), "thread-stopped"), null, "no mark for anyone who can be answered");

  const lead = find(stopped, (n) => classes(n).includes("ix-thread-lead"));
  assert.ok(lead, "the face and its badge are one part of the row");
  const face = find(lead, (n) => n.type === Face);
  assert.deepEqual(face.props.person, { name: "Dana Cole", initials: "DC" });
  assert.ok(classes(face.rendered).includes("ix-thread-pic"));
  assert.ok(
    find(lead, (n) => classes(n).includes("ix-thread-wire")),
    "the wire's badge stays at the face's foot",
  );

  // A number is the glyph here as on every page, never its last two digits; an address is the mail.
  const byNumber = rowOf("+1 (305) 555-0100", FINE);
  assert.equal(glyphIn(find(byNumber, (n) => n.type === Face)), "phone");
  assert.equal(glyphIn(find(rowOf("ana@example.com", FINE), (n) => n.type === Face)), "mail");
  assert.equal(glyphIn(find(rowOf("Dana Cole", FINE), (n) => n.type === Face)), null);
});

test("a thread's header and a call's draw the same face the row does", () => {
  fresh();
  const header = (who, avatar) => h(IxWho, { who, avatar }, h("div", {}, who));
  assert.equal(glyphIn(find(header("+1 (305) 555-0100", "00"), (n) => n.type === Face)), "phone");
  assert.equal(glyphIn(find(header("ana@example.com", "AN"), (n) => n.type === Face)), "mail");
  const named = find(header("Dana Cole", "DC"), (n) => n.type === Face);
  assert.equal(textOf(named), "DC");
  assert.ok(classes(named.rendered).includes("face-lg"), "the header's size");
});

test("Live's row draws the caller's face by the same rule and says a stop beside their name", () => {
  fresh();
  const live = (consent, over = {}) =>
    toLiveCallVM(
      callDto(consent, {
        status: "ongoing",
        ended_at: null,
        updated_at: iso(NOW_MS - 5_000),
        started_at: iso(NOW_MS - 60_000),
        duration_ms: null,
        ...over,
      }),
      ZONE,
      NOW,
    );
  const list = (calls) =>
    LrList({ live: calls, line: null, lineRead: true, activeId: null, elapsedOf: () => 5, onSelect() {} });
  const stopped = live(STOPPED);
  assert.equal(stopped.live, true, "the fixture is a call on the line");
  const rows = all(list([stopped, live(FINE, { id: "k10" })]), (n) => n.props?.["data-testid"] === "live-row");
  assert.equal(rows.length, 2);
  assert.ok(byTestId(rows[0], "live-row-stopped"), "the caller who asked to stop");
  assert.equal(byTestId(rows[1], "live-row-stopped"), null);
  const face = find(rows[0], (n) => n.type === Face);
  assert.deepEqual(face.props.person, { name: "Dana Cole", initials: stopped.initials });
  // A caller known only by a number is the phone glyph, not two digits.
  const unnamed = live(null, { from_e164: "+13055550199" });
  assert.equal(unnamed.who, "+1 (305) 555-0199");
  const unnamedRow = find(list([unnamed]), (n) => n.props?.["data-testid"] === "live-row");
  assert.equal(glyphIn(find(unnamedRow, (n) => n.type === Face)), "phone");
});
