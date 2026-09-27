/**
 * The phone receptionist says where the booking link goes: to the caller's
 * WhatsApp, never "a text".
 *
 * send_booking_link has only ever sent one thing, a WhatsApp template to the
 * WhatsApp on the number the caller is ringing from: retell-fn.ts delivers on
 * channel "whatsapp", and texting is not sold until the carriers approve a line
 * (capabilities.ts). The composed prompt told the agent the tool "texts the
 * booking link to the number they are calling from", and three other things it
 * is handed said "offer to text the booking link": the prompt's own line about
 * speaking aloud, the shell's fallback when the facts cannot be read, and the
 * availability tool's answer when the calendar cannot. So a caller could be
 * promised a text and receive a WhatsApp message instead -- or, on a number
 * with no WhatsApp, nothing at all.
 *
 * Run, not read: each of these is the text the agent is actually given.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { composeSystemPrompt } from "@chanlytics/contracts";
import { FACTS_UNAVAILABLE, desiredVoiceShell } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.RETELL_FN_SECRET = "voice-booking-link-secret-for-this-file";
const { setPg } = await import(pathToFileURL(path.join(here, "../../../../apps/edge/lib/pg.ts")).href);
const availability = await import(
  pathToFileURL(path.join(here, "../../../../apps/edge/api/retell-availability.ts")).href
);

/** A promise that the link travels as a text: "texts the booking link", "offer to text", "by text". */
const TEXTS_THE_LINK = /\btext(s|ing)? (it|the (booking )?link)\b|\boffer to text\b|\bby text\b/i;

const brain = {
  business_name: "Harbor Nails",
  phone_display: "(305) 555-0100",
  booking_link: "https://book.example/harbor",
  system_prompt: "x".repeat(50),
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};
const profile = {
  hours: { mon: { open: "09:00", close: "17:00" } },
  services: [{ name: "Gel manicure", duration_min: 45 }],
};
const voice = composeSystemPrompt(brain, profile, "voice");
const booking = voice.split("\n").find((l) => l.startsWith("Booking:")) ?? "";

test("on the phone the booking link goes to the caller's WhatsApp, on the number they are calling from, and is never promised as a text", () => {
  assert.ok(booking.includes("use send_booking_link"), voice);
  assert.ok(booking.includes("to the caller's WhatsApp, on the number they are calling from"), booking);
  assert.ok(
    booking.includes("do not ask them for a number unless they want it sent somewhere else"),
    "the number they are calling from is still the default",
  );
  assert.ok(
    booking.includes("only arrives if that number has WhatsApp"),
    "a number with no WhatsApp receives nothing, and the agent knows it",
  );
  assert.doesNotMatch(
    voice,
    TEXTS_THE_LINK,
    "REGRESSION: the prompt said the tool texts the link; it sends a WhatsApp message",
  );
});

test("a caller the link cannot reach -- the send failed, or there is no WhatsApp on their number -- is given the business's number and a follow-up", () => {
  assert.ok(
    booking.includes(
      "If it fails, or they do not have WhatsApp on that number, give the phone number above and offer to have someone follow up.",
    ),
    booking,
  );
  assert.ok(voice.includes("Phone: (305) 555-0100"), "the number it is told to give is in the prompt");
});

test("speaking aloud, the agent offers to send the link to the caller's WhatsApp rather than reading the URL", () => {
  assert.ok(
    voice.includes(
      "never read a URL out character by character, and offer to send the booking link to the caller's WhatsApp instead.",
    ),
    voice,
  );
});

test("with no facts to read, the shell's fallback offers the link on WhatsApp, as the tool it offers says", () => {
  assert.doesNotMatch(FACTS_UNAVAILABLE, TEXTS_THE_LINK, "REGRESSION: the fallback offered to text the link");
  assert.ok(FACTS_UNAVAILABLE.includes("offer to send the booking link to the caller's WhatsApp"), FACTS_UNAVAILABLE);
  const tool = desiredVoiceShell().general_tools.find((t) => t.name === "send_booking_link");
  assert.match(tool.description, /to the caller's WhatsApp/);
  assert.match(tool.execution_message_description, /to their WhatsApp/);
});

test("the availability tool offers the link on WhatsApp when there is no calendar, and when it cannot see one", async () => {
  const T = "dddddddd-0000-4000-8000-000000000001";
  const AGENT = "agent_voice_booking_link";
  setPg(
    fakeDb(
      {
        tenants: [{ id: T, name: "Harbor Nails", timezone: "America/New_York", status: "active" }],
        tenant_channels: [
          {
            id: "voice-1",
            tenant_id: T,
            kind: "voice",
            external_id: AGENT,
            number_e164: "+13055550100",
            status: "active",
            credentials_ref: null,
            config: {},
          },
        ],
        tenant_config: [{ tenant_id: T, config: {} }],
        policies: [],
        google_listings: [],
      },
      {},
      { runtime_stamp: () => "stamp-1" },
    ),
  );
  const ask = async (agentId) => {
    const res = await availability.POST(
      new Request("https://chanlytics-messaging.vercel.app/api/retell-availability", {
        method: "POST",
        headers: { "content-type": "application/json", "x-fn-secret": process.env.RETELL_FN_SECRET },
        body: JSON.stringify({ call: { call_id: "call_1", agent_id: agentId }, args: {} }),
      }),
    );
    assert.equal(res.status, 200, "the agent speaks the result, so a refusal is still a 200");
    return (await res.json()).result;
  };
  try {
    // A workspace with no feed; and a line nobody routes, whose calendar nothing can see.
    const none = await ask(AGENT);
    const blind = await ask("agent_nobody_routes");
    assert.match(none, /no calendar to check/i, "the world is the one intended");
    assert.match(blind, /can't see the calendar/i, "the world is the one intended");
    for (const [why, said] of [
      ["no calendar", none],
      ["cannot see it", blind],
    ]) {
      assert.doesNotMatch(said, TEXTS_THE_LINK, `${why} -- REGRESSION: it offered to text the link`);
      assert.ok(said.includes("send the booking link to the caller's WhatsApp"), `${why}: ${said}`);
    }
  } finally {
    setPg(null);
  }
});
