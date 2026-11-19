/**
 * A call can send one thing, the booking link, and promises no time for a call back; it is told both (19 Nov 2026).
 *
 * On a scripted call to the test line a caller asked for the price list by email and spelled out his address; AI said
 * "the full list is on its way to your inbox". Nothing on a call can email: its tools put a caller through, send the
 * booking link, read the calendar and end the call. Nothing told it so, and asked for anything else it said yes. Every
 * call is now told that the booking link is the only thing it sends, to pass any other ask on, and never to say a thing
 * is sent unless a tool said so: a prompt composed from the details and a hand-written one alike, since a call's
 * standing rules close both (compose.ts standingRules). A chat answers in the thread it is asked in, and a draft is the
 * owner's to send, so neither is told it.
 *
 * The same calls showed a second promise: asked to have someone call back "this afternoon", AI said the team would, and
 * nobody there had said so. Said as the tail of the rule above it held one time in four, so it is a line of its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSystemPrompt, NO_WAY_TO_SEND_LINK, resolveSystemPrompt } from "@chanlytics/contracts";
import { NO_TIME_PROMISED_LINE, NOTHING_ELSE_SENT_LINE, SELLING_CALL_LINE } from "../_prompt-rules.mjs";

const LINE = `- ${NOTHING_ELSE_SENT_LINE}`;
const NO_TIME = `- ${NO_TIME_PROMISED_LINE}`;
const NOW = new Date("2026-11-19T15:00:00Z");

/** A shop that wrote its details, with a booking link and a WhatsApp line to send it by. */
const COMPOSED = {
  business_name: "Example Barbers",
  system_prompt: "You answer for Example Barbers.",
  booking_link: "https://book.example.com/barbers",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: {
    address: "12 Example St, Springfield",
    hours: { mon: { open: "09:00", close: "18:00" } },
    services: [{ name: "Haircut", duration_min: 30 }],
  },
};
/** The same shop before it wrote any details: its own prompt, read as it stands. */
const HAND_WRITTEN = { ...COMPOSED, profile: undefined };
/** A shop that quotes each job: no link at all. */
const NO_LINK = { ...COMPOSED, booking_link: undefined };
const WITH_WHATSAPP = { channels: [{ kind: "whatsapp", number_e164: "+15550100145", status: "active" }] };

const voice = (brain, known = WITH_WHATSAPP) =>
  resolveSystemPrompt(brain, "voice", "America/New_York", NOW, null, known);
const rulesOf = (prompt) => prompt.slice(prompt.indexOf("Rules you must follow:")).split("\n");

test("every call is told the booking link is the only thing it sends, and to promise no time: composed or hand-written, with a link or none", () => {
  for (const [name, prompt] of [
    ["composed from the details", voice(COMPOSED)],
    ["hand-written", voice(HAND_WRITTEN)],
    ["with no booking link", voice(NO_LINK)],
    ["with a link and no way to send it", voice(COMPOSED, null)],
  ]) {
    const rules = rulesOf(prompt);
    assert.equal(rules.filter((l) => l === LINE).length, 1, `${name}: said once, among the rules`);
    assert.equal(
      rules.indexOf(LINE),
      rules.indexOf(`- ${SELLING_CALL_LINE}`) + 1,
      `${name}: beside the other standing line a call alone is told`,
    );
    assert.equal(rules.filter((l) => l === NO_TIME).length, 1, `${name}: no time promised, said once`);
    assert.equal(rules.indexOf(NO_TIME), rules.indexOf(LINE) + 1, `${name}: a line of its own, after what is sent`);
  }
  assert.ok(
    voice(COMPOSED, null).includes(NO_WAY_TO_SEND_LINK),
    "a line with no way to send the link is still told so in its booking line, which the new rule leans on",
  );
});

test("a chat and a draft are not told either: a chat answers in its own thread, a draft is the owner's to send", () => {
  for (const line of [LINE, NO_TIME]) {
    assert.ok(!resolveSystemPrompt(COMPOSED, "whatsapp", "America/New_York", NOW, null, WITH_WHATSAPP).includes(line));
    assert.ok(!resolveSystemPrompt(HAND_WRITTEN, "sms", "America/New_York", NOW, null, WITH_WHATSAPP).includes(line));
  }
  const draft = composeSystemPrompt(
    { business_name: "Example Barbers", phone_display: null, booking_link: null, whatsapp_line: null },
    COMPOSED.profile,
    "voice",
    "America/New_York",
    NOW,
    null,
    "draft",
  );
  assert.ok(!draft.includes(LINE) && !draft.includes(NO_TIME));
});
