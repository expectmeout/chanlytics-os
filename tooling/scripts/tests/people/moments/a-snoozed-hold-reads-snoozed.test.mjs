/**
 * A thread that asked for a person and was snoozed reads Snoozed on every page, as the Inbox files it (D1-snoozed-hold).
 *
 * "Snoozed wins over escalated, and that ordering is the whole point" (standing.ts). The Inbox and Conversations filed such a
 * thread as Snoozed, and Today and Reports left it out of what needs the owner; People's State cell read Active (or New,
 * or Quiet) with a small "escalated" beside it, and the person's own page showed the "Needs you" pill with "Escalated ·
 * asked for a person · Since 2:14 PM" and an Open the thread button. Both tested the open escalation before the snooze,
 * each in its own order. They read one verdict now (standingOf's, through personStanding) and say Snoozed, with when it
 * wakes and that the request still waits. Run against the contracts, over the row and the profile of the same thread.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, toPersonRowVM, toPersonVM, personStanding, stateOf } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { plReceptMark, PL_TAB_LABEL } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");

const TZ = "America/New_York";
const NOW = new Date("2026-09-18T18:00:00Z");
const WAKES = "2026-09-19T14:00:00Z";
const ME = "u1";

const ROW = {
  id: "p1",
  display_name: "Ana Reyes",
  wa_profile_name: null,
  phone_e164: "+17865550181",
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  message_channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 1,
  needs_human: false,
  open_escalation_reason: "human_token",
  open_escalation_since: "2026-09-18T17:14:00Z",
  latest_conversation_id: "c1",
  latest_state: "snoozed",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: WAKES,
  latest_wa_inbound_at: "2026-09-18T17:10:00Z",
  last_message_at: "2026-09-18T17:10:00Z",
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can I talk to someone about Saturday?",
  last_inbound_at: "2026-09-18T17:10:00Z",
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: "2026-08-10T02:05:16Z",
  earliest_row_at: "2026-08-10T02:05:16Z",
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
};

const MESSAGE = {
  id: "m1",
  direction: "inbound",
  sender: "customer",
  type: "text",
  channel: "whatsapp",
  body: "Can I talk to someone about Saturday?",
  media: null,
  meta: null,
  status: "received",
  created_at: "2026-09-18T17:10:00Z",
  channel_ts: "2026-09-18T17:10:00Z",
};

const ASKED = { id: "e1", reason: "human_token", details: null, state: "open", created_at: "2026-09-18T17:14:00Z" };

const conversation = (state) => ({
  id: "c1",
  state,
  paused_until: null,
  snooze_until: state === "snoozed" ? WAKES : null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: "2026-09-18T17:10:00Z",
  last_message_at: "2026-09-18T17:10:00Z",
  contact: { id: "p1", display_name: "Ana Reyes", wa_profile_name: null, phone_e164: "+17865550181", email: null },
  messages: [MESSAGE],
});

const personFor = (row, escalations = [ASKED]) =>
  toPersonVM(
    {
      row,
      identities: [],
      conversations: [conversation(row.latest_state)],
      calls: [],
      escalations,
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
    },
    TZ,
    NOW,
    ME,
  );

const receptionistFact = (p) => p.facts.find((f) => f.label === "Receptionist");

test("the Inbox files a snoozed hold as Snoozed, and the open request stays open", () => {
  const inbox = toInboxThreadVM(conversation("snoozed"), ASKED, TZ, NOW);
  assert.equal(inbox.state, "snoozed", "the verdict People and the person's page now follow");
  assert.equal(inbox.needsYou, false);
  assert.equal(personStanding(ROW, NOW.getTime(), ME).standing, "snoozed", "one rule, over the row's columns");
});

test("People's State cell: the thread reads Snoozed, with when it wakes and that it still asks, not escalated", () => {
  const row = toPersonRowVM(ROW, TZ, NOW, ME, null);
  // The pill is the person's, not the thread's: nobody needs the owner while the hold is put aside.
  assert.notEqual(row.state, "needs_you");
  assert.equal(row.receptionist.tone, "snoozed", "was escalated");
  assert.ok(row.receptionist.wakes, "when it wakes rides the mark");
  assert.match(row.receptionist.label, /^Snoozed until .+ · still waiting for you \(asked for a person\)$/);
  assert.ok(row.receptionist.label.includes(row.receptionist.wakes));
});

test("the person's page: Right now and the Receptionist fact say Snoozed, and not the Needs you of an escalation", () => {
  const p = personFor(ROW);
  assert.equal(p.rightNow.tone, "snoozed");
  assert.equal(p.rightNow.title, "Snoozed", "was Escalated · asked for a person");
  assert.match(p.rightNow.detail, /^Wakes .+\. Customer asked for a person — that is still waiting for you\.$/);
  assert.equal(stateOf("standing", p.rightNow.tone).label, "Snoozed", "the head pill says it too");
  assert.equal(p.rightNow.cta.to, "inbox/th-c1", "and the thread is a press away");
  const fact = receptionistFact(p);
  assert.equal(fact.value, "Snoozed");
  assert.match(fact.meta, /^until .+ · still waiting for you \(asked for a person\)$/);
  assert.equal(p.receptionist.tone, "snoozed");
});

test("a snooze with nothing open on it just says when it wakes, and the same hold awake is Needs you again", () => {
  const quiet = personFor({ ...ROW, open_escalation_reason: null, open_escalation_since: null }, []);
  assert.equal(quiet.rightNow.title, "Snoozed");
  assert.match(quiet.rightNow.detail, /^Wakes .+\.$/);
  assert.match(quiet.receptionist.label, /^Snoozed until [^·]+$/, "nothing is still waiting");

  // The thread wakes: the state column leaves snoozed and the request that was open all along is the owner's again.
  const awake = personFor({ ...ROW, latest_state: "needs_human", needs_human: true, latest_snooze_until: null });
  assert.equal(awake.rightNow.tone, "escalated");
  assert.match(awake.rightNow.title, /^Escalated · asked for a person$/);
  assert.equal(
    toPersonRowVM({ ...ROW, latest_state: "open", latest_snooze_until: null }, TZ, NOW, ME, null).state,
    "needs_you",
  );
});

test("a reply counting down on a snoozed thread is still what it is doing: Reply queued, as it is counted in Needs you", () => {
  const queued = { ...ROW, queued_reply_at: "2026-09-18T17:59:30Z" };
  assert.equal(toPersonRowVM(queued, TZ, NOW, ME, null).receptionist.tone, "queued");
  assert.equal(personFor(queued).rightNow.tone, "queued");
});

test("a snoozed hold held by a teammate is still Snoozed: the snooze wins over whose it is, as the Inbox's rule says", () => {
  const theirs = { ...ROW, latest_assignee_user_id: "u2", latest_state: "snoozed" };
  assert.equal(personStanding(theirs, NOW.getTime(), ME).standing, "snoozed");
  assert.equal(toPersonRowVM(theirs, TZ, NOW, ME, null).receptionist.tone, "snoozed");
});

test("People's State cell: the mark beside the pill says when a snoozed thread wakes, and whose a teammate's thread is", () => {
  const snoozed = toPersonRowVM(ROW, TZ, NOW, ME, null);
  assert.equal(plReceptMark(snoozed), `snoozed until ${snoozed.receptionist.wakes}`, "was 'escalated'");
  const theirs = {
    ...ROW,
    latest_state: "needs_human",
    needs_human: true,
    latest_snooze_until: null,
    latest_assignee_user_id: "u2",
  };
  const named = toPersonRowVM(theirs, TZ, NOW, ME, null, (id) => (id === "u2" ? "Ruben" : null));
  assert.equal(plReceptMark(named), "Ruben has it", "the Inbox's own words, with the name where the roster gave it");
  assert.equal(
    plReceptMark(toPersonRowVM(theirs, TZ, NOW, ME, null)),
    "A teammate has it",
    "and without: never a name made up",
  );
  // The tabs and the crumbs say what the pill says: You have it, not Waiting on you.
  assert.equal(PL_TAB_LABEL.waiting_on_you, "You have it");
  assert.equal(PL_TAB_LABEL.needs_you, "Needs you");
});
