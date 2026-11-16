/**
 * A follow-up WhatsApp approved as an offer goes in the open chat (decision 0135): the hour, its step 2.
 *
 * The follow-up to someone sent the booking link goes the next day at the sequence's hour. In the open chat it can go only
 * while the person's 24 hours since they last wrote on WhatsApp last, so where that closes before the sequence's hour it
 * goes earlier that day, leaving the half hour a sequence may hold its batch for an OK (PLAYBOOK_VETO_DELAY_MS) and a
 * quarter of an hour to spare. Never the same day, never before the first sending hour, and where no such time is left,
 * at the sequence's hour, going as it would without the chat (its fourth answer). Only in a workspace whose switch is on
 * (`features.reply_in_chat`): elsewhere the hour is the sequence's, as before. The rule (contracts askFollowUpAt), then
 * the door that asks it when the link goes (apps/edge/lib/campaigns/occasions/enrol.ts), over the fake database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { askFollowUpAt, askOccasion } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

const { enrolOccasions } = await importSrc("apps/edge/lib/campaigns/occasions/enrol.ts");

const TZ = "America/New_York";
const MIN = 60_000;
const at = (iso) => Date.parse(iso);
const iso = (ms) => new Date(ms).toISOString();
/** Tuesday 17 November 2026 at an hour by New York's clock (five hours behind UTC in November). */
const tuesday = (hour, minute = 0) =>
  iso(at(`2026-11-17T${String(hour + 5).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`));
/** When their chat closes: 24 hours after they last wrote on WhatsApp. */
const closesAfter = (wroteIso) => at(wroteIso) + 24 * 60 * MIN;
/** The follow-up's hour for a link sent on Monday 16 November, an hour of the sequence, and the chat's close. */
const due = (askedIso, runHour, chatClosesAt) =>
  iso(askFollowUpAt({ askedAt: at(askedIso), tz: TZ, runHour, chatClosesAt }));

test("without a chat to keep inside, the next day at the sequence's hour, as before", () => {
  assert.equal(due("2026-11-16T16:25:00Z", 14, null), tuesday(14));
});

test("inside the 24 hours at the sequence's hour, it goes at the sequence's hour", () => {
  // Wrote Monday at 3:00 PM: the chat is open until Tuesday 3:00 PM, and 10:00 AM is inside it.
  assert.equal(due("2026-11-16T20:05:00Z", 10, closesAfter("2026-11-16T20:00:00Z")), tuesday(10));
});

test("past the 24 hours at the sequence's hour, earlier that day, with room for the batch to wait for an OK", () => {
  // Wrote Monday at 11:20:30 AM: the chat closes Tuesday at 11:20:30 AM, before the sequence's 2:00 PM.
  const closes = closesAfter("2026-11-16T16:20:30Z");
  const goes = due("2026-11-16T16:25:00Z", 14, closes);
  assert.equal(goes, tuesday(10, 35), "forty-five minutes before it closes, to the minute");
  assert.ok(closes - at(goes) >= 45 * MIN, "the half hour a batch may wait, and a quarter of an hour to spare");
  // At the first sending hour exactly, it still goes then.
  assert.equal(due("2026-11-16T15:00:00Z", 10, closesAfter("2026-11-16T14:45:00Z")), tuesday(9));
});

test("never before the first sending hour: someone who last wrote early in the morning goes at the sequence's hour", () => {
  // Wrote Monday at 9:40 AM: inside the chat means 8:55 AM on Tuesday, before nine. No time fits; as without the chat.
  assert.equal(due("2026-11-16T14:45:00Z", 10, closesAfter("2026-11-16T14:40:00Z")), tuesday(10));
});

test("never the same day: a chat that closes tonight leaves tomorrow at the sequence's hour", () => {
  // Wrote Sunday at 9:00 PM, sent the link Monday at 9:00 AM: the chat closes Monday at 9:00 PM.
  assert.equal(due("2026-11-16T14:00:00Z", 10, closesAfter("2026-11-16T02:00:00Z")), tuesday(10));
});

/* ------------------------------ the door, when the link goes ------------------------------ */

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEQUENCE = "5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e";
const PERSON = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
const THREAD = "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0";
const MESSAGE = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
/** The AI sent the booking link on Monday at 11:25 AM, five minutes after they wrote on WhatsApp. */
const SENT = "2026-11-16T16:25:00.000Z";

function world({ switchOn, wroteAt }) {
  const enrolled = [];
  const db = fakeDb(
    {
      sequence_steps: [
        {
          id: SEQUENCE,
          sequence_id: SEQUENCE,
          tenant_id: TENANT,
          state: "running",
          trigger: "asked_no_booking",
          run_hour: 14,
          words_ok_at: null,
          last_run_for: null,
        },
      ],
      sequences: [{ id: SEQUENCE, tenant_id: TENANT, state: "on", name: "Asked, didn't book", mode: null }],
      messages: [
        {
          id: MESSAGE,
          tenant_id: TENANT,
          contact_id: PERSON,
          conversation_id: THREAD,
          created_at: SENT,
          channel_ts: SENT,
          type: "text",
          sender: "ai",
        },
      ],
      sequence_sends: [],
      appointments: [],
      tenants: [{ id: TENANT, timezone: TZ, status: "active" }],
      tenant_config: [{ tenant_id: TENANT, config: switchOn ? { features: { reply_in_chat: true } } : {} }],
      conversations: [{ id: THREAD, tenant_id: TENANT, contact_id: PERSON, last_inbound_on_whatsapp: wroteAt }],
    },
    {},
    {
      sequence_occasion_enrol: (args) => {
        enrolled.push(args);
        return "enrolled";
      },
    },
  );
  return { db, enrolled };
}

const enrolNow = async (w) =>
  enrolOccasions(w.db, TENANT, { about: "ask", messageId: MESSAGE }, new Date(at(SENT) + MIN));

test("with the switch on, the follow-up is due while their chat is open: 10:35 AM, not the sequence's 2:00 PM", async () => {
  const w = world({ switchOn: true, wroteAt: "2026-11-16T16:20:00Z" });
  assert.deepEqual(await enrolNow(w), { enrolled: 1, left: 0 });
  assert.deepEqual(
    w.enrolled.map((e) => [e.p_occasion, e.p_due_at]),
    [[askOccasion(MESSAGE), tuesday(10, 35)]],
  );
});

test("with the switch off, or no chat at all, it is due at the sequence's hour, as before", async () => {
  const off = world({ switchOn: false, wroteAt: "2026-11-16T16:20:00Z" });
  await enrolNow(off);
  assert.deepEqual(
    off.enrolled.map((e) => e.p_due_at),
    [tuesday(14)],
    "the switch is off",
  );
  const never = world({ switchOn: true, wroteAt: null });
  await enrolNow(never);
  assert.deepEqual(
    never.enrolled.map((e) => e.p_due_at),
    [tuesday(14)],
    "they never wrote on WhatsApp",
  );
});
