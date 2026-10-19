/**
 * The booking link is offered only to someone who may receive it, in the words of the wire they are reached on, by
 * every drawing that offers it (finding D1-booking-link-stop).
 *
 * Three drawings offered "send this person the booking link" under three rules. The person's page asked the stop rule
 * (mayReach) and hid the act from someone who texted STOP or is on do-not-contact. People's row never did: it read
 * "Text the booking link", ready, over a stopped person, and carried the words to a thread whose reply box says nothing
 * can be sent. The Calendar panel kept a copy of its own, worded by the WhatsApp window alone (replyOpen): "Text the link"
 * to anyone inside it, stopped or not, and "Send the link" with the hover "Only an approved message reaches them until they
 * write again" to someone who texts or emails, to whom that is false, carrying no words to the thread.
 *
 * Now one function (contracts bookingLinkAction) asks the stop first (isOptedOutContact, the one predicate) and the wire
 * second, and the People row, the person's page and the Calendar's block each build their action with it: a stopped or
 * do-not-contact person's action is not ready and not offered, with the reason in the stop's own words (optOutWords);
 * a person who texts or emails is offered "Text the booking link" / "Email the booking link" with the words carried.
 * The action also holds its short words ("Text the link"), which the Calendar panel's foot draws so that it does not wrap
 * on a phone (Ruben, 10 Oct 2026); the row's glyph and the page keep the full ones.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchPerson,
  mayReach,
  optOutWords,
  personLikeOf,
  toCalendarVM,
  toPersonRowVM,
  toPersonVM,
} from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, byTestId } from "../../_legacy-react.mjs";

const TZ = "America/New_York";
const NOW = new Date("2026-09-08T16:00:00.000Z");
const H = 3_600_000;
const D = 24 * H;
const BOOKING = "https://book.example/salon";
/** The sentence the Replies row says of an address that stopped (person-reach.ts), word for word. */
const EMAIL_CANT_REACH = "Email can't reach them: their address stopped accepting mail";
const at = (ms) => new Date(NOW.getTime() - ms).toISOString();

/** A People row as the list reads it, on the wire `channel`, stopped or not. */
const row = (over = {}) => ({
  id: "p1",
  display_name: "Ana Reyes",
  wa_profile_name: null,
  phone_e164: "+17865550181",
  email: "ana@example.com",
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  dnc: false,
  channels: ["sms"],
  message_channels: ["sms"],
  last_inbound_channel: "sms",
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
  latest_wa_inbound_at: null,
  last_message_at: at(2 * H),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can you fit me in Saturday?",
  last_inbound_at: at(2 * H),
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: at(240 * H),
  earliest_row_at: at(240 * H),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});

/** The wires a reply can go out on, each as a row says it. */
const WIRES = {
  "WhatsApp inside its window": {
    channels: ["whatsapp"],
    message_channels: ["whatsapp"],
    last_inbound_channel: "whatsapp",
    latest_wa_inbound_at: at(2 * H),
  },
  "WhatsApp, its window shut": {
    channels: ["whatsapp"],
    message_channels: ["whatsapp"],
    last_inbound_channel: "whatsapp",
    latest_wa_inbound_at: at(3 * D),
  },
  "a text": { channels: ["sms"], message_channels: ["sms"], last_inbound_channel: "sms" },
  "an email": { channels: ["email"], message_channels: ["email"], last_inbound_channel: "email" },
  "a text, though their address stopped": {
    channels: ["sms"],
    message_channels: ["sms"],
    last_inbound_channel: "sms",
    email_suppressed_at: at(48 * H),
  },
  "an email to an address that stopped": {
    channels: ["email"],
    message_channels: ["email"],
    last_inbound_channel: "email",
    email_suppressed_at: at(48 * H),
  },
};
const STOPS = {
  "texted STOP": { consent: "opted_out" },
  "on do-not-contact": { dnc: true },
  both: { consent: "opted_out", dnc: true },
};

const rowAction = (r) => toPersonRowVM(r, TZ, NOW, null, null).bookingLinkAction;

/** The Calendar's block for an appointment that names the person, by the same path the board's week takes (personLikeOf, matchPerson). */
const blockOf = (r) => {
  const person = matchPerson(
    { title: "Ana Reyes · Balayage", description: null, location: null, attendees: [] },
    [personLikeOf(r)],
    new Set(),
  );
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: `2026-09-${String(7 + i).padStart(2, "0")}`, items: [], windows: [] });
  days[1].items.push({
    id: "e1",
    start: "2026-09-08T18:00:00.000Z",
    end: "2026-09-08T19:30:00.000Z",
    title: "Ana Reyes · Balayage",
    all_day: false,
    person,
  });
  const vm = toCalendarVM(
    {
      timezone: TZ,
      from: "2026-09-07",
      to: "2026-09-13",
      feed: {
        present: true,
        state: "ok",
        read_at: "2026-09-08T15:58:00.000Z",
        events: 1,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
      hours: { tue: { open: "09:00", close: "18:00" } },
      closures: [],
      rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
      booking_link: BOOKING,
      days,
    },
    NOW,
  );
  return { block: vm.days[1].blocks[0], vm };
};

test("a person who texted STOP or is on do-not-contact: the People row's action is not ready and not offered, and says why in the stop's own words", () => {
  for (const [wire, facts] of Object.entries(WIRES)) {
    for (const [stop, over] of Object.entries(STOPS)) {
      const action = rowAction(row({ ...facts, ...over }));
      assert.equal(
        action.ready,
        false,
        `${wire}, ${stop}: was ready, and carried the link to a thread that sends nothing`,
      );
      assert.equal(action.offered, false, `${wire}, ${stop}: a page does not draw the act`);
      assert.equal(action.title, optOutWords("Ana Reyes"), `${wire}, ${stop}: the reason`);
      assert.equal(action.label, "Send the booking link", `${wire}, ${stop}: no wire is named that cannot be used`);
    }
  }
  // An address that stopped accepting mail, on the wire the reply goes out on (email): not ready, not offered, with the
  // Replies row's own sentence; the person's page already hid it, and the row and the panel now agree.
  const bounced = rowAction(row(WIRES["an email to an address that stopped"]));
  assert.deepEqual([bounced.ready, bounced.offered, bounced.title], [false, false, EMAIL_CANT_REACH]);
  // Their replies go by text, so the address is nothing the link needs.
  const byText = rowAction(row(WIRES["a text, though their address stopped"]));
  assert.deepEqual([byText.label, byText.ready, byText.offered], ["Text the booking link", true, true]);
  // The same person, not stopped, is unchanged: the wire decides the words.
  assert.deepEqual(
    [
      rowAction(row(WIRES["a text"])).label,
      rowAction(row(WIRES["a text"])).ready,
      rowAction(row(WIRES["a text"])).offered,
    ],
    ["Text the booking link", true, true],
  );
});

test("the Calendar's block carries the same action as the row, for every wire and every stop", () => {
  for (const [wire, facts] of Object.entries(WIRES)) {
    for (const [stop, over] of [["not stopped", {}], ...Object.entries(STOPS)]) {
      const r = row({ ...facts, ...over });
      const { block } = blockOf(r);
      assert.deepEqual(block.person.bookingLinkAction, rowAction(r), `${wire}, ${stop}: one function, one answer`);
    }
  }
  // Each of the finding's pictures, said outright.
  const stopped = blockOf(row({ ...WIRES["WhatsApp inside its window"], consent: "opted_out" })).block.person
    .bookingLinkAction;
  assert.deepEqual(
    [stopped.ready, stopped.offered, stopped.title],
    [false, false, optOutWords("Ana Reyes")],
    "inside a WhatsApp window and stopped: the panel offered 'Text the link'",
  );
  const texts = blockOf(row(WIRES["a text"])).block.person.bookingLinkAction;
  assert.deepEqual(
    [texts.label, texts.ready, texts.title],
    ["Text the booking link", true, "Opens the thread with the link ready to send as a text"],
    "someone who texts: the panel said 'Send the link' and that only an approved message reaches them",
  );
  const mails = blockOf(row(WIRES["an email"])).block.person.bookingLinkAction;
  assert.deepEqual([mails.label, mails.short, mails.ready], ["Email the booking link", "Email the link", true]);
  assert.deepEqual(
    [texts.short, blockOf(row(WIRES["WhatsApp, its window shut"])).block.person.bookingLinkAction.short],
    ["Text the link", "Send the link"],
  );
  const bounced = blockOf(row(WIRES["an email to an address that stopped"])).block.person.bookingLinkAction;
  assert.deepEqual(
    [bounced.ready, bounced.offered, bounced.title],
    [false, false, EMAIL_CANT_REACH],
    "an address that stopped, on the wire the reply goes out on: not offered, as the person's page has it",
  );
  const elsewhere = blockOf(row(WIRES["a text, though their address stopped"])).block.person.bookingLinkAction;
  assert.deepEqual(
    [elsewhere.label, elsewhere.ready, elsewhere.offered],
    ["Text the booking link", true, true],
    "but their replies go by text: nothing the address holds",
  );
  const shut = blockOf(row(WIRES["WhatsApp, its window shut"])).block.person.bookingLinkAction;
  assert.deepEqual(
    [shut.label, shut.ready, shut.offered],
    ["Send the booking link", false, true],
    "the thread offers the approved message",
  );
});

test("the person's page asks the same function: the same action, and no booking act in the More menu for someone stopped", () => {
  const page = (r) =>
    toPersonVM(
      {
        row: r,
        identities: [],
        conversations: [
          {
            id: "c1",
            state: "open",
            paused_until: null,
            last_wa_inbound_at: r.latest_wa_inbound_at,
            last_message_at: at(2 * H),
            contact: {
              id: "p1",
              display_name: "Ana Reyes",
              wa_profile_name: null,
              phone_e164: r.phone_e164,
              email: r.email,
              consent: r.consent,
              dnc: r.dnc,
              email_suppressed_at: r.email_suppressed_at ?? null,
            },
            messages: [
              {
                id: "m1",
                conversation_id: "c1",
                direction: "inbound",
                sender: "customer",
                type: "text",
                channel: r.last_inbound_channel,
                body: "Can you fit me in Saturday?",
                media: null,
                meta: null,
                status: "received",
                created_at: at(2 * H),
                channel_ts: at(2 * H),
              },
            ],
          },
        ],
        calls: [],
        escalations: [],
        decisions: [],
        receptionist_mode: null,
        workspace_reply_mode: "auto",
        booking_link: BOOKING,
        proposal_url: null,
        deals: [],
        services: [],
      },
      TZ,
      NOW,
    );
  for (const [stop, over] of Object.entries(STOPS)) {
    const p = page(row({ ...WIRES["a text"], ...over }));
    assert.equal(mayReach(p), false, stop);
    assert.deepEqual(
      [p.bookingLinkAction.ready, p.bookingLinkAction.offered, p.bookingLinkAction.title],
      [false, false, optOutWords("Ana Reyes")],
      `${stop}: the page holds the row's answer`,
    );
    assert.equal(
      p.acts.some((a) => a.id === "booking"),
      false,
      `${stop}: nothing to send, so no act`,
    );
  }
  // An address that stopped, by email: the page has always hidden it, and now holds the same answer as the row.
  const bounced = page(row(WIRES["an email to an address that stopped"]));
  assert.equal(mayReach(bounced), false);
  assert.deepEqual(
    [bounced.bookingLinkAction.ready, bounced.bookingLinkAction.offered, bounced.bookingLinkAction.title],
    [false, false, EMAIL_CANT_REACH],
  );
  assert.equal(
    bounced.acts.some((a) => a.id === "booking"),
    false,
  );
  const fine = page(row(WIRES["a text"]));
  assert.deepEqual([fine.bookingLinkAction.label, fine.bookingLinkAction.ready], ["Text the booking link", true]);
  const act = fine.acts.find((a) => a.id === "booking");
  assert.ok(act, "someone who may be reached is offered it");
  assert.equal(act.hint, "Opens their thread with it ready to send as a text");
});

/* ------------------------------ the Calendar's visit sheet ------------------------------ */

const went = [];
installLegacyReact({
  __DEMO_MODE: false,
  CHANLY: { nav: (route) => went.push(route) },
});
const { visitSheetOf } = await import("../../../../../packages/contracts/src/calendar/visit/visit-sheet");

/** The sheet of the person's visit, kept and over: the one state whose lead act is the booking link (contracts visitSheetOf). */
const sheetOf = (r) => {
  const { block, vm } = blockOf(r);
  const day = vm.days[1];
  return visitSheetOf({
    block: { ...block, visit: { id: "v1", status: "kept" } },
    day: { key: day.key, today: day.today, date: day.date, dow: day.dow, long: day.long },
    rel: null,
    dur: "1h",
    nowMs: Date.parse(block.end) + 1,
    tz: vm.timezone,
    word: "appointment",
    source: "your calendar",
    bookingLink: BOOKING,
    notes: null,
    next: null,
    moments: null,
  });
};

test("the Calendar's visit sheet leads with the booking link by the person's own act: never for someone stopped, and the thread offers the approved message where WhatsApp's window is shut", () => {
  for (const [stop, over] of Object.entries(STOPS))
    for (const wire of ["WhatsApp inside its window", "a text", "an email"])
      assert.notEqual(
        sheetOf(row({ ...WIRES[wire], ...over })).primary?.act,
        "link",
        `${wire}, ${stop}: the panel offered 'Text the link' to anyone inside the window, stopped or not`,
      );
  assert.notEqual(
    sheetOf(row(WIRES["an email to an address that stopped"])).primary?.act,
    "link",
    "an address that stopped, by email: no link to send",
  );
  assert.equal(
    sheetOf(row(WIRES["a text, though their address stopped"])).primary?.act,
    "link",
    "but their replies go by text: the link is offered",
  );
  const texting = sheetOf(row(WIRES["a text"]));
  assert.deepEqual([texting.primary?.act, texting.shut], ["link", null]);
  const shut = sheetOf(row(WIRES["WhatsApp, its window shut"]));
  assert.equal(shut.primary?.act, "link");
  assert.ok(shut.shut, "a shut window says so: the thread offers the approved message");
});

const { PL_COLUMNS } = await import("../../../../../apps/dashboard/src/surfaces/people/cells/columns.tsx");

test("People's row draws the glyph for someone who may be sent the link, carries it in, and draws none for someone stopped", () => {
  const actionsOf = (r) => {
    fresh();
    return again(() =>
      PL_COLUMNS.find((c) => c.key === "actions").cell(toPersonRowVM(r, TZ, NOW, null, null), {
        attention: {},
        onOpen() {},
        bookingLink: BOOKING,
        drop: null,
      }),
    );
  };
  for (const [stop, over] of Object.entries(STOPS))
    assert.equal(
      byTestId(actionsOf(row({ ...WIRES["a text"], ...over })), "row-booking-link"),
      null,
      `${stop}: the row offered 'Text the booking link', ready`,
    );
  assert.equal(
    byTestId(actionsOf(row(WIRES["an email to an address that stopped"])), "row-booking-link"),
    null,
    "an address that stopped, by email: no glyph, as the page has no act",
  );
  assert.ok(
    byTestId(actionsOf(row(WIRES["a text, though their address stopped"])), "row-booking-link"),
    "but their replies go by text",
  );
  const glyph = byTestId(actionsOf(row(WIRES["a text"])), "row-booking-link");
  assert.ok(glyph, "someone who texts is offered it");
  assert.equal(glyph.props["aria-label"], "Text the booking link");
  globalThis.sessionStorage.removeItem("chanlytics-compose");
  glyph.props.onClick();
  assert.deepEqual(JSON.parse(globalThis.sessionStorage.getItem("chanlytics-compose")), {
    threadId: "th-c1",
    text: `Here's the link to book your appointment: ${BOOKING}`,
  });
});
