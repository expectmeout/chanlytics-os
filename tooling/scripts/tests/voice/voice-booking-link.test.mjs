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

/** Where the voice tools post in these fixtures: the address an edge off production gives them (dashboard-origin.ts). */
const FN_URL = "https://chanlytics-messaging.vercel.app/api/retell-fn";
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
  // The link goes by WhatsApp alone, so these are a workspace with a WhatsApp line (contracts offersLinkOn).
  whatsapp_line: "+13055550199",
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
  // A number with no WhatsApp receives nothing (decision 0073, R14): asked first, and told whether it arrived.
  assert.ok(booking.includes('first ask "Do you use WhatsApp on this number?"'), booking);
  assert.ok(
    booking.includes("it waits a moment for WhatsApp's own answer, so it tells you whether it arrived"),
    booking,
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
      "If they do not use WhatsApp there, or it fails, take their name, what they need, and where and when, give the phone number above, and offer to have someone follow up.",
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

test("a call with a booking link and no WhatsApp line never offers it: it takes the details, and points at the website", () => {
  // 11 Oct 2026: the live salon has no WhatsApp, and its calls were told to send the link to the caller's WhatsApp.
  const without = composeSystemPrompt(
    { ...brain, whatsapp_line: null },
    { ...profile, website: "harbor.example" },
    "voice",
  );
  const line = without.split("\n").find((l) => l.startsWith("Booking:")) ?? "";
  assert.ok(line.includes("never use send_booking_link and never promise a link or a message"), line);
  assert.ok(
    line.includes("take their name, what they need, and where and when, and say the team will follow up"),
    line,
  );
  assert.ok(line.includes("a website is listed above, they can book there"), line);
  assert.ok(!/caller's WhatsApp/.test(without), "nothing on the call offers WhatsApp");
  assert.ok(without.includes("Booking link: https://book.example/harbor"), "the link is still a fact of the business");
  assert.ok(
    without.includes("Keep answers to one or two sentences, and never read a URL out character by character."),
    "speaking aloud, nothing is offered in its place",
  );
});

test("with no facts to read, the shell's fallback offers nothing it may not have; the tool says where the link goes, and promises nothing while it runs", () => {
  // 11 Oct 2026: with no details there is no knowing whether there is a link, or a WhatsApp line to send it by.
  assert.doesNotMatch(FACTS_UNAVAILABLE, TEXTS_THE_LINK, "REGRESSION: the fallback offered to text the link");
  assert.doesNotMatch(FACTS_UNAVAILABLE, /booking link|WhatsApp/, FACTS_UNAVAILABLE);
  assert.match(FACTS_UNAVAILABLE, /take their name and a message so the team can call them back/);
  const tool = desiredVoiceShell(FN_URL).general_tools.find((t) => t.name === "send_booking_link");
  // Used when the caller wants to book unless the call's instructions say otherwise: a stored prompt names no tool, and
  // must keep it (the review of 11 Oct 2026).
  assert.match(
    tool.description,
    /^Send the booking link to the caller's WhatsApp when the caller wants to book, unless your instructions say there is no link or no way to send it\./,
  );
  assert.doesNotMatch(tool.description, TEXTS_THE_LINK, "REGRESSION: the tool said it texts the link");
  const availability = desiredVoiceShell(FN_URL).general_tools.find((t) => t.name === "check_availability");
  assert.doesNotMatch(availability.description, /booking link/, "what follows the times is the answer's to say");
  // Said before the tool has answered, so before anyone knows whether it went: nothing is promised.
  assert.equal(tool.execution_message_description, "Say one moment, please.");
});

test("the availability tool offers the link on WhatsApp when there is no calendar, and when it cannot see one", async () => {
  const T = "dddddddd-0000-4000-8000-000000000001";
  const AGENT = "agent_voice_booking_link";
  setPg(
    fakeDb(
      {
        tenants: [{ id: T, name: "Harbor Nails", timezone: "America/New_York", status: "active" }],
        tenant_channels: [
          // The WhatsApp line the link would go by (contracts offersLinkOn).
          { id: "wa-1", tenant_id: T, kind: "whatsapp", number_e164: "+13055550199", status: "active" },
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
        // The message that carries the link on a call, approved by Meta (decision 0073, R14): a call sends it only then.
        templates: [
          {
            id: "tpl-1",
            tenant_id: T,
            channel: "whatsapp",
            name: "booking_link",
            language: "en_US",
            category: "utility",
            meta_status: "approved",
            body_preview: "Here is the link to book.",
            title: null,
            variables: [{ position: 1 }, { position: 2 }, { position: 3 }],
            components: null,
          },
        ],
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
    assert.doesNotMatch(none, TEXTS_THE_LINK, "REGRESSION: it offered to text the link");
    assert.ok(none.includes("send the booking link to the caller's WhatsApp"), none);
    // A line nobody routes is nobody's business: nothing it could send is offered, only a call back.
    assert.equal(blind, "I can't see the calendar right now. Offer to have someone call back.");
  } finally {
    setPg(null);
  }
});
