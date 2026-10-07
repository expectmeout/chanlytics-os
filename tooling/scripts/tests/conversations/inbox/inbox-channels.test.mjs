/**
 * The Inbox by channel and by reason: a caller with no WhatsApp thread gets
 * phone verbs, the banner says the reason's own sentence, and Conversations'
 * pills say what they mean. The thread and the pills are the TSX surface's (surfaces/inbox), drawn on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, contactMeta, emailLeftOutOf, stateOf, memberWords } from "@chanlytics/contracts";
import { readCode } from "../../_source.mjs";
import { installLegacyReact, fresh, find, textOf } from "../../_legacy-react.mjs";

installLegacyReact({
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
});
Object.assign(globalThis, { CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } } });
const S = "../../../../../apps/dashboard/src";
const { InboxThread } = await import(`${S}/surfaces/inbox/thread/thread.tsx`);
const { OutcomePill } = await import(`${S}/surfaces/inbox/pages/conversations-page.tsx`);
const { StatePill } = await import(`${S}/surfaces/kit/pill/state-pill.tsx`);

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const NOW = new Date("2026-09-06T23:00:00Z");
const conv = (over = {}) => ({
  id: "c1",
  state: "needs_human",
  paused_until: "2026-09-07T19:00:00Z",
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: undefined,
  last_wa_inbound_at: null,
  last_message_at: "2026-09-06T22:03:00Z",
  contact: {
    id: "k1",
    display_name: "Emily Chen",
    wa_profile_name: null,
    phone_e164: "+19175550106",
    consent: "unknown",
    dnc: false,
  },
  messages: [
    {
      id: "m1",
      direction: "inbound",
      sender: "system",
      type: "call_summary",
      body: "Inbound call · 3 min — arranged a bridal trial",
      media: null,
      meta: {},
      status: "received",
      created_at: "2026-09-06T22:03:00Z",
    },
  ],
  ...over,
});
const callback = {
  id: "e1",
  reason: "callback",
  state: "open",
  created_at: "2026-09-06T22:04:00Z",
  details: "Call Emily back to confirm the bridal trial on Oct 3",
};

test("a caller with no WhatsApp thread: phone is the channel, no reply window, the number to call, the reason's own sentence", () => {
  const vm = toInboxThreadVM(conv(), callback, ZONE, NOW);
  assert.deepEqual([vm.channels, vm.primaryChannel, vm.hasChat, vm.phone], [["phone"], "phone", false, "+19175550106"]);
  assert.equal(vm.whoMeta, "Phone · +1 (917) 555-0106");
  // The to-do is the band's one sentence: it said "They phoned and the receptionist couldn't finish it." beneath the call
  // it describes, over "From the call: <the to-do>", and the flag in the timeline quoted the to-do a third time.
  assert.equal(
    vm.summary,
    "Call Emily back to confirm the bridal trial on Oct 3",
    "REGRESSION: the call back's to-do was said three times",
  );
  assert.equal(
    toInboxThreadVM(conv(), { ...callback, details: null }, ZONE, NOW).summary,
    "They phoned and the receptionist couldn't finish it.",
    "no to-do: the reason's sentence",
  );
  assert.equal(
    vm.timeline.find((e) => e.type === "event").body,
    "Flagged for a human — Needs a call back — the phone receptionist could not finish it",
    "the flag says why, not the to-do again",
  );
  assert.equal(vm.waited, "56m");
});

test("a WhatsApp thread keeps its window, and a thread with both keeps both channels", () => {
  const chat = toInboxThreadVM(
    conv({
      last_wa_inbound_at: "2026-09-06T22:00:00Z",
      messages: [
        {
          id: "m2",
          direction: "inbound",
          sender: "customer",
          type: "text",
          body: "hi",
          media: null,
          meta: {},
          status: "received",
          created_at: "2026-09-06T22:00:00Z",
        },
      ],
    }),
    null,
    ZONE,
    NOW,
  );
  assert.deepEqual(
    [chat.channels, chat.primaryChannel, chat.hasChat, chat.replyVia],
    [["whatsapp"], "whatsapp", true, "WhatsApp"],
  );
  assert.equal(chat.windowOpen, true, "they wrote an hour ago: the window is open");
  const both = toInboxThreadVM(
    conv({
      last_wa_inbound_at: "2026-09-06T22:00:00Z",
      messages: [
        ...conv().messages,
        {
          id: "m2",
          direction: "inbound",
          sender: "customer",
          type: "text",
          body: "hi",
          media: null,
          meta: {},
          status: "received",
          created_at: "2026-09-06T22:10:00Z",
        },
      ],
    }),
    null,
    ZONE,
    NOW,
  );
  assert.deepEqual([both.channels, both.primaryChannel], [["whatsapp", "phone"], "whatsapp"]);
  assert.equal(contactMeta(conv()), "WhatsApp · +1 (917) 555-0106", "the default stays what Today's rows print");
});

test("an email thread: email is the channel, its words carry their subject line, no reply window applies, and the line under the name says the address", () => {
  const emailed = (over = {}) => ({
    id: "m3",
    direction: "inbound",
    sender: "customer",
    channel: "email",
    type: "text",
    body: "Can you do Saturday at 9?",
    media: null,
    status: "received",
    created_at: "2026-09-06T22:30:00Z",
    meta: { email: { subject: "  Quote for Saturday ", message_id: "<q1@customer.example>" } },
    ...over,
  });
  const person = {
    id: "k2",
    display_name: null,
    wa_profile_name: null,
    phone_e164: null,
    email: "ana@example.com",
    consent: "unknown",
    dnc: false,
  };
  const vm = toInboxThreadVM(
    conv({ contact: person, messages: [emailed()] }),
    {
      id: "e2",
      reason: "email_review",
      state: "open",
      created_at: "2026-09-06T22:30:05Z",
      details: "An email arrived.",
    },
    ZONE,
    NOW,
  );
  assert.deepEqual(
    [vm.channels, vm.primaryChannel, vm.hasChat],
    [["email"], "email", true],
    "REGRESSION guard: every written message that was not a text read as WhatsApp",
  );
  assert.equal(vm.replyVia, "Email", "the reply box names the wire it sends on");
  assert.equal(vm.who, "ana@example.com");
  assert.equal(
    vm.whoMeta,
    "Email · no name saved",
    "the address IS the name, so the line says that instead of repeating it",
  );
  assert.equal(vm.windowOpen, true, "only WhatsApp has a window");
  const bubble = vm.timeline.find((e) => e.type === "msg");
  assert.deepEqual(
    [bubble.channel, bubble.subject, bubble.body],
    ["email", "Quote for Saturday", "Can you do Saturday at 9?"],
  );
  assert.equal(
    vm.summary,
    "They wrote by email. The receptionist does not answer email yet, so nothing was sent. Read it and reply from here.",
  );
  assert.equal(
    contactMeta(conv({ contact: { ...person, display_name: "Ana Reyes" } }), "Email"),
    "Email · ana@example.com",
  );

  const mixed = toInboxThreadVM(
    conv({
      last_wa_inbound_at: "2026-09-06T21:00:00Z",
      messages: [emailed({ id: "m4", channel: "whatsapp", meta: {}, created_at: "2026-09-06T21:00:00Z" }), emailed()],
    }),
    null,
    ZONE,
    NOW,
  );
  assert.equal(mixed.primaryChannel, "email", "a reply goes where they last wrote");
  assert.equal(
    "subject" in mixed.timeline.find((e) => e.type === "msg" && e.channel === "whatsapp"),
    false,
    "a subject is an email's",
  );
  assert.equal(
    "subject" in
      toInboxThreadVM(
        conv({ contact: person, messages: [emailed({ meta: { email: { subject: "   " } } })] }),
        null,
        ZONE,
        NOW,
      ).timeline[0],
    false,
    "an empty subject is no subject",
  );
});

test("the wiring: the page branches on the channel and reads the reason's sentence; the pills say what they mean", () => {
  const labels = { whatsapp: "WhatsApp", phone: "Phone" };
  const said = (node) => textOf(node);
  const withClass = (name) => (n) =>
    String(n.props?.className || "")
      .split(/\s+/)
      .includes(name);
  // A caller with no WhatsApp thread, waiting on a call back: the page draws the reason's sentence and the call, and no reply box.
  fresh();
  const phone = InboxThread({ thread: toInboxThreadVM(conv(), callback, ZONE, NOW), channelLabels: labels });
  assert.ok(
    find(phone, (n) => n.type === StatePill && n.props.kind === "thread" && n.props.value === "escalated"),
    "the escalated pill",
  );
  assert.ok(said(phone).includes(callback.details), "the reason's own sentence (thread.summary)");
  assert.ok(said(phone).includes("Call back"), "the call back");
  assert.ok(
    find(phone, (n) => n.props?.["data-testid"] === "ix-call-back"),
    "the call back is a door",
  );
  assert.ok(
    find(phone, (n) => n.props?.["aria-label"] === "Nothing needed — hand it back to the receptionist"),
    "the hand back says its whole sentence to a screen reader",
  );
  const box = find(phone, withClass("ix-composer"));
  assert.ok(box, "the thread has its send row");
  assert.equal(
    find(box, (n) => n.type === "textarea"),
    null,
    "no WhatsApp thread (thread.hasChat === false): no free-form reply box",
  );
  // A thread that has a chat: the reply box names the wire it sends on and who it is to.
  const person = { id: "k2", display_name: null, wa_profile_name: null, phone_e164: null, email: "ana@example.com" };
  const emailed = conv({
    contact: { ...person, consent: "unknown", dnc: false },
    messages: [
      {
        id: "m3",
        direction: "inbound",
        sender: "customer",
        channel: "email",
        type: "text",
        body: "Can you do Saturday at 9?",
        media: null,
        status: "received",
        created_at: "2026-09-06T22:30:00Z",
        meta: { email: { subject: "Quote for Saturday", message_id: "<q1@customer.example>" } },
      },
    ],
  });
  fresh();
  const mail = InboxThread({
    thread: toInboxThreadVM(emailed, null, ZONE, NOW),
    channelLabels: { ...labels, email: "Email" },
  });
  assert.ok(
    find(mail, (n) => n.type === "textarea" && n.props.placeholder === "Email to ana@example.com…"),
    "the reply box's placeholder is the wire and the person",
  );
  for (const gone of [
    "already sent a holding reply",
    "let the AI resume",
    "Reply as the salon",
    "Waiting on you",
    "They have only phoned",
    "Call them back",
  ]) {
    assert.ok(!said(phone).includes(gone) && !said(mail).includes(gone), `${gone} is gone`);
  }
  // The pills: the words and the tones are the one pill's now (contracts/tone.ts, run in state-pill.test.mjs); the page names the states.
  const pill = (outcome) => OutcomePill({ outcome, channel: "whatsapp" });
  assert.ok(
    pill("open").type === StatePill &&
      pill("open").props.kind === "thread" &&
      pill("open").props.value === "open" &&
      pill("escalated").type === StatePill &&
      pill("escalated").props.kind === "thread" &&
      pill("escalated").props.value === "escalated" &&
      !said(pill("open")).includes("Customer's turn"),
  );
  assert.ok(
    /whatsapp: "WhatsApp",\s*phone: "Phone"/.test(readCode("apps/dashboard/src/surfaces/inbox/surface.ts")),
    "the phone chip has a label",
  );
});

test("an email says what it carried that the thread does not show: files by name and count, words past the bound; and nothing when it was kept whole", () => {
  const file = (filename) => ({ filename, contentType: "application/pdf", size: 1000 });
  const said = (email) => emailLeftOutOf({ email });
  assert.equal(said({ subject: "Quote", attachments: [], more_attachments: 0, truncated: false }), null);
  assert.equal(emailLeftOutOf(null), null);
  assert.equal(emailLeftOutOf({ source: "broadcast" }), null, "a row that is not an email says nothing");
  assert.equal(said({ attachments: [file("floorplan.pdf")] }), "1 attachment was not kept: floorplan.pdf.");
  assert.equal(
    said({ attachments: [file("a.pdf"), file("b.jpg")], more_attachments: 3 }),
    "5 attachments were not kept: a.pdf, b.jpg and 3 more.",
    "the intake names five at most and counts the rest",
  );
  assert.equal(
    said({ attachments: [file(null), file("  ")] }),
    "2 attachments were not kept.",
    "a file with no name is still a file",
  );
  assert.equal(said({ attachments: [file("a.pdf"), file(null)] }), "2 attachments were not kept: a.pdf and 1 more.");
  assert.equal(
    said({ attachments: [], truncated: true }),
    "This email was longer than Chanlytics keeps; the rest was left out.",
  );
  assert.equal(
    said({ attachments: [file("a.pdf")], truncated: true }),
    "1 attachment was not kept: a.pdf. This email was longer than Chanlytics keeps; the rest was left out.",
  );
  assert.equal(
    said({ attachments: "nonsense", more_attachments: -2, truncated: "yes" }),
    null,
    "meta is JSON: a shape that is not the intake's says nothing rather than something wrong",
  );
});
