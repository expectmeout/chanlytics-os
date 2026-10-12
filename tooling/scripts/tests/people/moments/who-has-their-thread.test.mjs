/**
 * A person's page says who has their thread in the Inbox's own words, for the member looking.
 *
 * `isOwned` said a person had the thread whenever anyone was named on it, whoever was looking, so a TEAMMATE's thread
 * read on the page as "Held for you" and "a person owns this thread" where the Inbox says "A teammate has it" (its
 * standing rule, standing.ts, with `assignee_is_me`). A name left on a thread nobody is working is not a claim either:
 * the assignee is never cleared, and the receptionist answers it. The page now asks the one rule (standingOf) for the
 * member looking and says what the Inbox says: the pill's words and the pane's sentence. With no member looking it
 * cannot say whose, and keeps its own words for a person it does not name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateLabel, stateOf, toInboxThreadVM, toPersonRowVM, toPersonVM } from "@chanlytics/contracts";
import { toConversationDto } from "../../../../../apps/dashboard/src/server/dto.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-09-18T02:45:00Z");
const ME = "u1";
const TEAMMATE = "u2";

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
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "c1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: "2026-09-18T02:42:00Z",
  last_message_at: "2026-09-18T02:42:00Z",
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can you move Saturday?",
  last_inbound_at: "2026-09-18T02:42:00Z",
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: "2026-09-10T02:05:16Z",
  earliest_row_at: "2026-09-10T02:05:16Z",
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
  body: "Can you move Saturday?",
  media: null,
  meta: null,
  status: "received",
  created_at: "2026-09-18T02:42:00Z",
  channel_ts: "2026-09-18T02:42:00Z",
};

/** What a thread looks like once something asks for a person: the state the receptionist leaves, and who has it. */
const FLAGGED = { state: "needs_human", assignee: TEAMMATE, paused_until: null };

const conversation = ({ state = "open", assignee = null, paused_until = null }, viewer) =>
  toConversationDto(
    {
      id: "c1",
      state,
      paused_until,
      snooze_until: null,
      assignee_user_id: assignee,
      last_wa_inbound_at: "2026-09-18T02:42:00Z",
      last_message_at: "2026-09-18T02:42:00Z",
      contacts: { id: "p1", display_name: "Ana Reyes", wa_profile_name: null, phone_e164: "+17865550181", email: null },
    },
    [MESSAGE],
    viewer,
  );

/** The row people_list reads for the same thread: the Inbox's `state` and `paused_until`, as the row carries them. */
const rowFor = ({ state, assignee, paused_until }) => ({
  ...ROW,
  needs_human: state === "needs_human",
  latest_state: state,
  latest_assignee_user_id: assignee,
  latest_paused_until: paused_until,
});

/** The person's page for that row, as the contract maps it, for the member looking (or no one). */
const personFor = (thread, viewer) =>
  toPersonVM(
    {
      row: rowFor(thread),
      identities: [],
      conversations: [conversation(thread, viewer ?? "nobody")],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
    },
    TZ,
    NOW,
    viewer,
  );

/** What the Inbox itself says of the same thread, for the same member. */
const inboxFor = (thread, viewer) => toInboxThreadVM(conversation(thread, viewer ?? "nobody"), null, TZ, NOW);

const receptionistFact = (p) => p.facts.find((f) => f.label === "Receptionist");

test("a thread a teammate has reads, on the person's page, as the Inbox says it: A teammate has it", () => {
  const p = personFor(FLAGGED, ME);
  const inbox = inboxFor(FLAGGED, ME);
  assert.equal(inbox.claimedByOther, true, "the Inbox's own verdict, for the same thread and the same member");

  assert.equal(p.rightNow.tone, "theirs");
  assert.equal(p.rightNow.title, stateLabel("thread", "theirs"), "was 'Paused, a person owns this thread'");
  assert.equal(p.rightNow.title, "A teammate has it");
  assert.equal(p.rightNow.detail, inbox.summary, "the Inbox's own sentence for the thread a teammate is answering");
  assert.equal(p.receptionist.tone, "theirs");
  assert.equal(p.receptionist.label, "A teammate has it");
  assert.equal(stateOf("standing", p.rightNow.tone).label, "A teammate has it", "the head pill says it too");

  const fact = receptionistFact(p);
  assert.notEqual(fact.value, "Held for you", "it is held for them, not for the member looking");
  assert.equal(fact.meta, "a teammate has it");
});

test("a thread the member looking has reads as You have it, in the Inbox's own pill and sentence", () => {
  const mine = { ...FLAGGED, assignee: ME };
  const p = personFor(mine, ME);
  const inbox = inboxFor(mine, ME);
  assert.equal(inbox.takenOver, true);

  assert.equal(p.rightNow.tone, "yours");
  assert.equal(p.rightNow.title, stateLabel("thread", "yours"));
  assert.equal(p.rightNow.title, "You have it");
  assert.equal(p.rightNow.detail, inbox.summary);
  assert.equal(p.receptionist.label, "You have it");
  assert.equal(stateOf("standing", p.rightNow.tone).label, "You have it");
  assert.equal(receptionistFact(p).value, "Held for you");
  assert.equal(receptionistFact(p).meta, "you have it");

  // A person's own reply pauses the receptionist for a day and names nobody on the thread: still the reader's, as the
  // Inbox counts it.
  const paused = { state: "open", assignee: null, paused_until: "2026-09-19T02:00:00Z" };
  assert.equal(inboxFor(paused, ME).takenOver, true);
  assert.equal(personFor(paused, ME).rightNow.title, "You have it");
});

test("with no member looking the page cannot say whose, and says only that a person has it", () => {
  for (const thread of [FLAGGED, { state: "open", assignee: null, paused_until: "2026-09-19T02:00:00Z" }]) {
    const p = personFor(thread, null);
    assert.equal(p.rightNow.tone, "paused");
    assert.equal(p.rightNow.title, "Paused, a person owns this thread");
    assert.equal(p.rightNow.detail, "A person owns this thread; automatic replies resume when it is handed back.");
    assert.equal(p.receptionist.label, "Paused, a person owns the thread");
    assert.equal(receptionistFact(p).meta, "a person owns the thread");
  }
});

test("a name left on a thread nobody is working is not a claim: the receptionist is answering, as the Inbox says", () => {
  for (const viewer of [ME, null]) {
    for (const assignee of [ME, TEAMMATE]) {
      const quiet = { state: "open", assignee, paused_until: null };
      const inbox = inboxFor(quiet, viewer);
      assert.deepEqual([inbox.takenOver, inbox.claimedByOther], [false, false], "the Inbox: nobody has it");
      const p = personFor(quiet, viewer);
      assert.equal(p.rightNow.tone, "answering", `${assignee} seen by ${viewer}: was a person owning it`);
      assert.equal(p.receptionist.tone, "answering");
      assert.equal(receptionistFact(p).value, "Answering");
    }
  }
});

test("the People row says the same as the page: its receptionist is one answer for the member looking", () => {
  const row = (thread) => toPersonRowVM(rowFor(thread), TZ, NOW, ME, null).receptionist;
  assert.deepEqual(row(FLAGGED), { tone: "theirs", label: "A teammate has it" });
  assert.deepEqual(row({ ...FLAGGED, assignee: ME }), { tone: "yours", label: "You have it" });
  assert.equal(toPersonRowVM(rowFor(FLAGGED), TZ, NOW, null, null).receptionist.tone, "paused");
  for (const viewer of [ME, TEAMMATE, null]) {
    const p = personFor({ ...FLAGGED, assignee: ME }, viewer);
    assert.equal(p.rightNow.tone, p.receptionist.tone, `the card and the Receptionist fact agree for ${viewer}`);
  }
});

test("a teammate's thread says whose it is where the roster is read, as the Inbox's row does, and A teammate where it is not (D1-hold-words)", () => {
  const names = (id) => (id === TEAMMATE ? "Ruben" : null);
  const detail = (viewer, roster) =>
    toPersonVM(
      {
        row: rowFor(FLAGGED),
        identities: [],
        conversations: [conversation(FLAGGED, viewer)],
        calls: [],
        escalations: [],
        decisions: [],
        receptionist_mode: null,
        workspace_reply_mode: "auto",
      },
      TZ,
      NOW,
      viewer,
      roster,
    );
  // The row, the card and the fact all say the name; the sentence is the Inbox's with the name in it.
  assert.deepEqual(toPersonRowVM(rowFor(FLAGGED), TZ, NOW, ME, null, names).receptionist, {
    tone: "theirs",
    label: "Ruben has it",
  });
  const named = detail(ME, names);
  assert.equal(named.rightNow.title, "Ruben has it");
  assert.equal(named.rightNow.detail, "Ruben is answering this. The receptionist stays quiet until they hand it back.");
  assert.equal(named.receptionist.label, "Ruben has it");
  assert.equal(receptionistFact(named).meta, "Ruben has it", "a name keeps its capital");
  // A roster that does not know them, or none: the words the Inbox falls back to. A name is never invented.
  for (const roster of [() => null, () => undefined, null]) {
    const unnamed = detail(ME, roster);
    assert.equal(unnamed.rightNow.title, "A teammate has it");
    assert.equal(unnamed.rightNow.detail, inboxFor(FLAGGED, ME).summary);
    assert.equal(receptionistFact(unnamed).meta, "a teammate has it");
  }
  // The member looking is not named to themselves, whatever the roster says of them.
  const mine = { ...FLAGGED, assignee: ME };
  const own = toPersonRowVM(rowFor(mine), TZ, NOW, ME, null, () => "Ruben").receptionist;
  assert.deepEqual(own, { tone: "yours", label: "You have it" });
});
