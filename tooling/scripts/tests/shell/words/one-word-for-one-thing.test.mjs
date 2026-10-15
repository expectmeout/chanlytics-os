/**
 * One word per state, continued (the wiring plan's rule 3, task 4.2b): a message that did not send, a call that ended, a
 * teammate, a group of lists, a lead's class, a reading of a reply, a count of reviews and an appointment each have one set
 * of words in contracts, and a page that says them says those.
 *
 * What the owner read before: the same failed reply was "Didn't send" in the thread and "Not delivered" on the person's
 * page, and a canceled one was missing there; a teammate's reply was "You replied" in People and "Your team" in the thread;
 * a call handled by the receptionist was "Ended" on Live, "Receptionist handled it" in Conversations and nothing on its card;
 * a member with no name was their address, "A member", "A teammate" or "ana"; an invitation that had run out was "pending"
 * on the bell and "Expired" on Team; the lists were "Smart lists" and "Saved", "People's lists" and "Your lists"; Leads' band
 * said "need a look" over a pill that said "Needs review"; every reach-out reading was the same grey pill; and a place with one
 * review read "1 reviews".
 *
 * Run on the contracts' view models (the person's page, the bell, the Leads band) and on the table's choke point, over the same
 * fixtures the neighbouring tests use.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_PAGE_WORDS,
  LEAD_WORDS,
  LIST_GROUP_WORDS,
  appointmentWordWhere,
  appointmentWords,
  buildNotificationFeed,
  invitationWords,
  leadBand,
  memberWords,
  messageStatusLabel,
  messagesSummaryOf,
  personTabWord,
  replyChipOf,
  replyChipStateOf,
  reviewsWords,
  stateLabel,
  stateOf,
  stateTone,
  TIMELINE_FILTERS,
  timelineFilterLabel,
  toPersonRowVM,
  toPersonVM,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { CALL_OUTCOME_WORDS } = await importSrc("packages/contracts/src/conversations/call-dto.ts");
const { invitationExpired } = await importSrc("packages/contracts/src/shell/identity.ts");
const { plShownColumns, plColumnOptions } = await importSrc("apps/dashboard/src/surfaces/people/table/columns.ts");
const { plSortedBy } = await importSrc("apps/dashboard/src/surfaces/people/words.ts");
const { peopleSortItems } = await importSrc("apps/dashboard/src/surfaces/people/page/phone-menu.ts");

const TZ = "America/New_York";
const NOW = new Date("2026-09-18T18:00:00Z");
const ME = "u1";
const at = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

/* ------------------------------------------------------------- a person's page -- */

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
  latest_wa_inbound_at: at(600),
  last_message_at: at(10),
  last_message_direction: "outbound",
  last_message_sender: "human",
  last_inbound_text: "Can I move Saturday?",
  last_inbound_at: at(600),
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: at(60 * 24 * 30),
  earliest_row_at: at(60 * 24 * 30),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
};

const message = (id, minutesAgo, over = {}) => ({
  id,
  direction: "outbound",
  sender: "human",
  type: "text",
  channel: "whatsapp",
  body: `Words of ${id}`,
  media: null,
  meta: null,
  status: "delivered",
  created_at: at(minutesAgo),
  channel_ts: at(minutesAgo),
  ...over,
});

const decision = (id, verb, minutesAgo, over = {}) => ({
  id,
  verb,
  subject_type: "conversation",
  subject_id: "c1",
  actor_type: "user",
  actor_user_id: ME,
  created_at: at(minutesAgo),
  payload: null,
  ...over,
});

const call = (over = {}) => ({
  id: "k1",
  retell_call_id: "r1",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+17865550181",
  from_raw: null,
  to_e164: null,
  started_at: at(300),
  ended_at: at(298),
  duration_ms: 112_000,
  disconnection_reason: "agent_hangup",
  sentiment: null,
  call_successful: true,
  in_voicemail: false,
  summary: "Asked about balayage pricing.",
  transcript_object: null,
  recording: { fetch_state: "stored" },
  conversation_id: "c1",
  contact_id: "p1",
  message_id: null,
  contact: null,
  ...over,
});

const personFor = (
  { messages = [], decisions = [], calls = [], row = {}, dealsOn = false, visits } = {},
  viewer = ME,
  names = null,
) =>
  toPersonVM(
    {
      row: { ...ROW, ...row },
      identities: [],
      conversations: [
        {
          id: "c1",
          state: "open",
          paused_until: null,
          snooze_until: null,
          assignee_user_id: null,
          assignee_is_me: false,
          last_wa_inbound_at: at(600),
          last_message_at: at(10),
          contact: {
            id: "p1",
            display_name: "Ana Reyes",
            wa_profile_name: null,
            phone_e164: "+17865550181",
            email: null,
          },
          messages,
        },
      ],
      calls,
      escalations: [],
      decisions,
      receptionist_mode: null,
      workspace_reply_mode: "auto",
      ...(dealsOn ? { deals_on: true } : {}),
      ...(visits ? { visits } : {}),
    },
    TZ,
    NOW,
    viewer,
    { names },
  );

test("D1-message-status: History says a reply that did not reach them in the thread's words, and keeps a canceled one as a line", () => {
  const p = personFor({
    messages: [
      message("fail", 50, { status: "failed" }),
      message("wait", 40, { status: "queued" }),
      message("gone", 30, { status: "canceled" }),
      message("ok", 20, { status: "delivered" }),
    ],
  });
  const line = (id) => p.timeline.find((i) => i.id === `m-${id}`);
  assert.equal(messageStatusLabel("failed"), "Didn't send", "the thread's own words");
  assert.equal(line("fail").sub, "Didn't send", "was Not delivered");
  assert.equal(line("wait").sub, "Sending…", "was Sending");
  assert.equal(line("gone").sub, "Canceled before sending", "was left out of History altogether");
  assert.equal(line("gone").text, "Words of gone");
  assert.equal(line("ok").sub, undefined, "a delivered one has no receipt line: the row is the record");
  // The readers that tell what was said can tell what was never heard.
  assert.deepEqual(
    p.timeline.filter((i) => i.unsent).map((i) => i.id),
    ["m-gone", "m-wait", "m-fail"],
    "newest first",
  );
});

test("D1-member-name: a teammate's reply is the team's on People and in History, and You is only the member looking", () => {
  const row = toPersonRowVM(ROW, TZ, NOW, ME, null);
  assert.equal(row.lastContact.who, "team");
  assert.equal(row.lastContact.by, "Your team replied", "was You replied");
  const p = personFor({ messages: [message("m1", 20)] });
  const reply = p.timeline.find((i) => i.id === "m-m1");
  assert.deepEqual([reply.kind, reply.who], ["team", "Your team"], "the mark is the team's glyph, not the word You");
  assert.equal(p.facts.find((f) => f.label === "Last contact").meta, "your team replied");
});

test("D1-member-name: a decision says You for the member looking, a teammate by the roster, and the team where it cannot name them", () => {
  const names = (id) => (id === "u2" ? "Ruben" : null);
  const p = personFor(
    {
      decisions: [
        decision("d1", "snooze", 60),
        decision("d2", "snooze", 50, { actor_user_id: "u2" }),
        decision("d3", "snooze", 40, { actor_user_id: "u3" }),
        decision("d4", "wake", 30, { actor_type: "system", actor_user_id: null }),
        decision("d5", "snooze", 20, { actor_type: "ai", actor_user_id: null }),
      ],
    },
    ME,
    names,
  );
  const said = (id) => p.timeline.find((i) => i.id === `d-${id}`).text;
  assert.equal(said("d1"), "You snoozed the thread");
  assert.equal(said("d2"), "Ruben snoozed the thread", "a teammate the roster names");
  assert.equal(said("d3"), "Your team snoozed the thread", "a member the roster does not know is not You");
  assert.equal(said("d4"), "The system brought the thread back");
  assert.equal(said("d5"), "The receptionist snoozed the thread");
  // Where nobody is looking (no viewer), no decision is anyone's You.
  const nobody = personFor({ decisions: [decision("d1", "snooze", 60)] }, null, null);
  assert.equal(nobody.timeline.find((i) => i.id === "d-d1").text, "Your team snoozed the thread");
});

test("D1-call-ended-words: a finished call has one outcome word, the registry's, on Live, Conversations, the call card and History", () => {
  // One map: the registry's call words are the ladder's, and only the provider's silence is added beside them.
  for (const [outcome, word] of Object.entries(CALL_OUTCOME_WORDS))
    assert.equal(stateLabel("call", outcome), word, outcome);
  assert.equal(
    stateLabel("call", "handled"),
    "Handled",
    "was Ended on Live and Receptionist handled it in Conversations",
  );
  assert.equal(
    stateLabel("call", "ended"),
    "ended",
    "no pill says Ended of a call any more: it is a value nobody wrote words for",
  );
  assert.equal(stateLabel("call", "stale"), "No word from the provider");
  // History: the outcome's word, then where the call is kept.
  const handled = personFor({ calls: [call()] }).timeline.find((i) => i.kind === "call");
  assert.equal(handled.sub, `${CALL_OUTCOME_WORDS.handled} · Recording and transcript in Conversations`);
  const back = personFor({ calls: [call({ outcome: "callback_needed" })] }).timeline.find((i) => i.kind === "call");
  assert.equal(back.sub, `${CALL_OUTCOME_WORDS.callback} · Recording and transcript in Conversations`);
  const never = personFor({
    calls: [call({ status: "not_connected", duration_ms: 0, disconnection_reason: "dial_no_answer" })],
  }).timeline.find((i) => i.kind === "call");
  assert.equal(never.sub, CALL_OUTCOME_WORDS.missed, "a dial that never connected keeps its one word");
});

/* ------------------------------------------------------------------ members -- */

test("D1-member-fallbacks: a member without a name is their address, and without that Someone -- one word, on every page", () => {
  assert.equal(
    memberWords({ email: "ana@x.example", display_name: "" }).name,
    "ana@x.example",
    "never the front of the address",
  );
  assert.equal(memberWords({ email: "ana@x.example", display_name: "Ana" }).name, "Ana");
  assert.equal(memberWords({ email: null }).name, "Someone");
  assert.equal(memberWords({ email: "  " }).name, "Someone", "an empty address is none");
  assert.equal(ACTIVITY_PAGE_WORDS.member, memberWords({ email: null }).name, "the Activity log said A member");
});

test("D1-member-fallbacks: the bell says Expired of an invitation when Team does", () => {
  const open = { id: "i1", email: "ana@x.example", created_at: at(60 * 24 * 2), expires_at: at(-60 * 24 * 5) };
  const spent = { id: "i2", email: "bo@x.example", created_at: at(60 * 24 * 9), expires_at: at(60 * 24 * 2) };
  const rows = buildNotificationFeed({ invites: [open, spent], now: NOW.getTime() }).filter((r) => r.kind === "invite");
  const title = (id) => rows.find((r) => r.key === `invite:${id}`).title;
  assert.equal(title("i1"), "Invitation pending · ana@x.example");
  assert.equal(title("i2"), "Invitation expired · bo@x.example");
  // Team's card and the bell read one answer.
  for (const inv of [open, spent]) {
    const team = invitationWords({ createdAt: inv.created_at, expiresAt: inv.expires_at }, TZ, NOW.getTime());
    assert.equal(team.expired, invitationExpired({ expiresAt: inv.expires_at }, NOW.getTime()), inv.id);
  }
  // An answer that does not say when it closes is not expired: the bell never says what the roster did not.
  assert.equal(invitationExpired({ expiresAt: null }, NOW.getTime()), false);
  assert.equal(
    buildNotificationFeed({ invites: [{ id: "i3", email: "cy@x.example", created_at: at(60) }], now: NOW.getTime() })[0]
      .title,
    "Invitation pending · cy@x.example",
  );
});

/* -------------------------------------------------------------------- lists -- */

test("D1-list-names: the two groups of lists are Ready-made and Your lists wherever lists are grouped, and Leads' stage views are Views", () => {
  assert.deepEqual(LIST_GROUP_WORDS, { builtin: "Ready-made lists", own: "Your lists", pinned: "Pinned lists" });
  assert.notEqual(LIST_GROUP_WORDS.pinned, LIST_GROUP_WORDS.own, "Today's pins hold ready-made lists too");
  assert.equal(LEAD_WORDS.viewsHeading, "Views", "six views of a lead's stage are not lists");
  assert.equal(LEAD_WORDS.searchesHeading, "Searches");
});

/* -------------------------------------------------------------- Leads' class -- */

const SEARCH = (round) => ({ id: "s1", name: "Trainers", round });

test("D1-lead-class-words: the band's tabs say the pills' three words, with the count in front, in the pills' tones", () => {
  const band = leadBand(SEARCH({ qualified: 12, review: 3, excluded: 2, fits: { strong: 5, look: 4, long: 3 } }));
  assert.deepEqual(
    band.classes.map((c) => [c.id, c.label]),
    [
      ["qualified", "12 Qualified"],
      ["review", "3 Needs review"],
      ["excluded", "2 Left out"],
    ],
  );
  for (const c of band.classes) assert.equal(c.label, `${c.count} ${stateLabel("lead_class", c.id)}`, c.id);
  assert.equal(
    leadBand(SEARCH({ qualified: 0, review: 1, excluded: 0 })).classes[1].label,
    "1 Needs review",
    "no plural to get wrong",
  );
  // Qualified was green on the tab and plain in the pill: one map.
  assert.equal(stateTone("lead_class", "qualified"), "plain");
  assert.equal(stateTone("lead_class", "review"), "warn");
});

/* ------------------------------------------------------------ a reach-out reply -- */

test("D1-reply-chip-tone: each reading of a reply to a reach-out is a pill with its own tone, and the chip says the reading", () => {
  const tones = Object.fromEntries(
    ["interested", "question", "not_now", "no", "wrong_person", "away", "other"].map((i) => [i, stateTone("reply", i)]),
  );
  assert.deepEqual(tones, {
    interested: "ok",
    question: "warn",
    not_now: "info",
    no: "plain",
    wrong_person: "plain",
    away: "info",
    other: "plain",
  });
  assert.notEqual(tones.interested, tones.no, "an Interested reply and a Said no were the same grey pill");
  // The pill's words are the chip's, whatever the page draws.
  for (const intent of Object.keys(tones)) {
    assert.equal(stateLabel("reply", intent), replyChipOf({ intent, unread: null, undone: false }), intent);
    assert.deepEqual(
      stateOf("reply", replyChipStateOf({ intent, unread: null, undone: false })),
      stateOf("reply", intent),
    );
  }
  // A reading that was not made, or was undone, is the plain "Wrote back".
  assert.equal(replyChipStateOf({ intent: "no", unread: null, undone: true }), "other");
  assert.equal(replyChipStateOf({ intent: "interested", unread: "day_spent", undone: false }), "other");
  assert.equal(stateLabel("reply", "other"), "Wrote back");
});

/* ------------------------------------------------------------------- reviews -- */

test("D1-lead-one-reviews: a count of reviews is one phrase everywhere: 1 review, 2 reviews, and thousands grouped", () => {
  assert.equal(reviewsWords(1), "1 review");
  assert.equal(reviewsWords(2), "2 reviews");
  assert.equal(reviewsWords(1284), "1,284 reviews");
  assert.equal(reviewsWords(0), "0 reviews");
  assert.equal(reviewsWords(null), "reviews not counted yet");
});

/* --------------------------------------------------------- an appointment's word -- */

const VISITS = {
  timezone: TZ,
  source: "Google Calendar",
  state: "ok",
  next: {
    id: "b1:1",
    start: at(-60 * 24 * 3),
    end: at(-60 * 24 * 3 - 60),
    title: "Balayage",
    all_day: false,
    via: "phone",
  },
  last: {
    id: "b0:1",
    start: at(60 * 24 * 9),
    end: at(60 * 24 * 9 - 60),
    title: "Colour",
    all_day: false,
    via: "phone",
  },
  all: [],
};

test("D1-visit-words: the person's page says the workspace's word for an appointment, as Campaigns does", () => {
  const labels = (p) => [
    p.facts.map((f) => f.label).filter((l) => /^Next/.test(l)),
    p.about.map((a) => a.k).filter((k) => /^(Next|Last)/.test(k)),
  ];
  assert.deepEqual(labels(personFor({ visits: VISITS })), [
    ["Next appointment"],
    ["Next appointment", "Last appointment"],
  ]);
  assert.deepEqual(labels(personFor({ visits: VISITS, dealsOn: true })), [
    ["Next meeting"],
    ["Next meeting", "Last meeting"],
  ]);
  assert.equal(appointmentWordWhere(false), "appointment");
  assert.equal(
    appointmentWordWhere(true),
    "meeting",
    "where some customers get a proposal first, as GET playbooks derives it",
  );
  // The History's filter for them is headed in the same word; the other filters keep their own.
  const filter = (id) => TIMELINE_FILTERS.find((f) => f.id === id);
  assert.equal(timelineFilterLabel(filter("visits"), false), "Appointments");
  assert.equal(timelineFilterLabel(filter("visits"), true), "Meetings");
  assert.equal(timelineFilterLabel(filter("calls"), true), "Calls");
  const W = appointmentWords("meeting");
  assert.deepEqual(
    [W.Many, W.next, W.last, W.today(1), W.today(3)],
    ["Meetings", "Next meeting", "Last meeting", "1 meeting today", "3 meetings today"],
  );
  // "Past" is one word for a visit that has ended and nobody has marked, said by the visit line (D1-visit-match-words), not a phrase of the workspace's.
  assert.equal("past" in W, false);
});

test("D1-visit-words: the person's tab for them, its figure and an untitled one's row say the workspace's word; Up next's yes says the Messages summary's", () => {
  // Ten messages, so the record is not thin and draws its tabs and figures; one past visit the calendar names nothing for.
  const messages = Array.from({ length: 10 }, (_, i) => message(`m${i}`, 100 + i * 10));
  const visits = { ...VISITS, all: [VISITS.next, { ...VISITS.last, title: "" }] };
  for (const [dealsOn, Many, Title] of [
    [false, "Appointments", "Appointment"],
    [true, "Meetings", "Meeting"],
  ]) {
    const p = personFor({ messages, visits, dealsOn });
    const tab = (tabs) => tabs.find((t) => t.id === "visits")?.label;
    assert.deepEqual([tab(p.tabs.desk), tab(p.tabs.phone)], [Many, Many], "the tab, on a desk and a phone");
    assert.equal(p.figures.find((f) => f.id === "visits")?.label, Many, "the figure that opens it");
    assert.equal(personTabWord("visits", dealsOn), Many, "and the tab's heading");
    const rows = [...p.visitTab.toMark, ...p.visitTab.ahead, ...p.visitTab.past];
    assert.deepEqual(rows.map((r) => r.title).sort(), [Title, VISITS.next.title].sort(), "an untitled one is the word");
  }
  assert.equal(personTabWord("history", true), "History", "the other tabs keep their own");
  // Not asked, with one ahead and a number: Up next asks the yes in the folded summary's words.
  const p = personFor({ messages, visits });
  const rung = p.next.rows.find((r) => r.id === "consent:visit");
  const [lead] = messagesSummaryOf({ label: "Not asked", unknown: true }, { label: "Not asked", unknown: true }, "");
  assert.equal(rung?.title, `${lead.lead} not asked`);
  assert.equal(rung.title, "Messages not asked");
});

test("D1-visit-words: People's table heads the column in the workspace's word, in the table and in the Columns menu", () => {
  const column = {
    key: "visits",
    label: "Appointments",
    labelOf: (x) => appointmentWords(appointmentWordWhere(!!x.dealsOn)).Many,
    sortable: true,
    needs: (x) => !!x.withCalendar,
    cell: () => null,
  };
  const heads = (x) => plShownColumns([column], {}, x).map((c) => c.label);
  assert.deepEqual(heads({ withCalendar: true }), ["Appointments"]);
  assert.deepEqual(heads({ withCalendar: true, dealsOn: true }), ["Meetings"]);
  assert.deepEqual(heads({ withCalendar: false }), [], "needs a calendar, as it did");
  assert.deepEqual(
    plColumnOptions([column], {}, { withCalendar: true, dealsOn: true }).map((o) => o.label),
    ["Meetings"],
  );
  // A column with no word of its own keeps its label.
  assert.deepEqual(
    plShownColumns([{ key: "last", label: "Last contact", sortable: true, cell: () => null }], {}, {}).map(
      (c) => c.label,
    ),
    ["Last contact"],
  );
  // How the list is ordered, and a phone's sort that orders it so, say the same word as the column.
  assert.deepEqual(
    [plSortedBy("visits", false), plSortedBy("visits", true), plSortedBy("last", true)],
    ["Sorted by appointments", "Sorted by meetings", "Sorted by last contact"],
  );
  const sorts = (dealsOn) =>
    peopleSortItems({ withCalendar: true, dealsOn, sortBy: "", sortDir: "", pickSort: () => {} }).map((i) => i.label);
  assert.equal(sorts(false).at(-1), "Soonest appointment first");
  assert.equal(sorts(true).at(-1), "Soonest meeting first");
});

test("REGRESSION (S9-9): a deal's stage is said in its stage's word on the sheet's receipt and its list; a thread moved says its tab's word", async () => {
  const { BUILTIN_LISTS, DEAL_SHEET_WORDS, DEAL_STAGE_WORDS, INBOX_BUCKET_WORDS, NEEDS_YOU_WORD, inboxBucketWord } =
    await import("@chanlytics/contracts");
  // The sheet typed its own copy of the stages' words, and so did People's lists.
  const moves = { propose: "proposed", again: "proposed", won: "won", lost: "lost", ended: "ended" };
  for (const [move, stage] of Object.entries(moves))
    assert.equal(DEAL_SHEET_WORDS.done[move], DEAL_STAGE_WORDS[stage], move);
  assert.equal(DEAL_SHEET_WORDS.done.edit, "Proposal saved", "an edit moves no stage, and says what it did");
  const label = (id) => BUILTIN_LISTS.find((l) => l.id === id).label;
  assert.equal(label("proposal_out"), DEAL_STAGE_WORDS.proposed);
  assert.equal(label("deal_passed"), DEAL_STAGE_WORDS.lost);
  assert.equal(label("deal_ended"), DEAL_STAGE_WORDS.ended);
  assert.equal(label("clients"), "Clients", "a list of people names the people, not the stage");
  // The thread pane said "Moved to" in words of its own beside the tabs' (inbox/thread/thread-pane.tsx).
  for (const state of ["escalated", "done", "snoozed"]) assert.equal(inboxBucketWord(state), INBOX_BUCKET_WORDS[state]);
  assert.equal(inboxBucketWord("escalated"), NEEDS_YOU_WORD, "the tab of threads nobody has is Needs you");
  assert.equal(inboxBucketWord("open"), null, "no tab lists an open thread");
  const { REAL_BUCKETS } = await importSrc("apps/dashboard/src/surfaces/inbox/store.ts");
  assert.deepEqual(
    REAL_BUCKETS.map((b) => [b.id, b.label]),
    Object.entries(INBOX_BUCKET_WORDS),
    "the tabs say the same words, in the same order",
  );
});
