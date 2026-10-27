/**
 * The receptionist promises only what the workspace can do (the engine review's second pass, 11 Oct 2026, Lane 2).
 *
 * The live salon has no WhatsApp line and answers texts and calls. Its text prompt said it answered "over WhatsApp",
 * its calls were told to send the booking link "to the caller's WhatsApp", and the rule for YES OFFERS promised offers
 * by WhatsApp. One call ended with the record saying a link went out that never could. Every combination of what a
 * workspace has, composed by the product's own resolver, on every wire: nothing it lacks is offered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_WAY_TO_SEND_LINK, offersLinkOn, resolveSystemPrompt } from "@chanlytics/contracts";

const WHATSAPP = { kind: "whatsapp", number_e164: "+13055550199", status: "active" };
const VOICE = { kind: "voice", number_e164: "+13055550100", status: "active" };
const SMS = { kind: "sms", number_e164: "+13055550100", status: "active" };

const brainOf = (link) => ({
  business_name: "Harbor Nails",
  ...(link ? { booking_link: "https://book.example/harbor" } : {}),
  system_prompt: "x".repeat(50),
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: {
    hours: { mon: { open: "09:00", close: "17:00" } },
    services: [{ name: "Gel manicure", duration_min: 45 }],
    website: "harbor.example",
    guardrails: { never_quote_prices: true, no_health_advice: true },
  },
});

/** Every workspace the matrix composes: with or without a WhatsApp line, with or without a link, on each wire it has. */
const cases = [];
for (const whatsapp of [true, false])
  for (const link of [true, false])
    for (const wire of ["whatsapp", "sms", "instagram", "voice"]) {
      if (wire === "whatsapp" && !whatsapp) continue; // a message on WhatsApp came in on a line
      const known = { channels: [VOICE, SMS, ...(whatsapp ? [WHATSAPP] : [])] };
      cases.push({
        whatsapp,
        link,
        wire,
        prompt: resolveSystemPrompt(
          brainOf(link),
          wire,
          "America/New_York",
          new Date("2026-10-12T15:00:00Z"),
          null,
          known,
        ),
      });
    }

test("a workspace with no WhatsApp line is offered nothing by WhatsApp, on any wire", () => {
  for (const c of cases.filter((c) => !c.whatsapp)) {
    // The one sentence that names WhatsApp to say it cannot be used is not an offer.
    const said = c.prompt.split(NO_WAY_TO_SEND_LINK).join("");
    assert.doesNotMatch(said, /WhatsApp/, `${c.wire}, link ${c.link}: ${said}`);
  }
});

test("a call offers the booking link only where there is one and a WhatsApp line to send it by", () => {
  for (const c of cases.filter((c) => c.wire === "voice")) {
    const offers = c.prompt.includes("use send_booking_link —");
    assert.equal(offers, c.link && c.whatsapp, `link ${c.link}, WhatsApp ${c.whatsapp}`);
    assert.equal(offers, offersLinkOn("call", brainOf(c.link), c.whatsapp ? WHATSAPP.number_e164 : null));
    if (c.link && !c.whatsapp) assert.ok(c.prompt.includes(NO_WAY_TO_SEND_LINK), "it is told it cannot send it");
    if (!c.link) assert.ok(c.prompt.includes("there is no booking link, so never use send_booking_link"));
  }
});

test("in chat the link is sent in the thread wherever there is one, whatever the wire", () => {
  for (const c of cases.filter((c) => c.wire !== "voice")) {
    assert.equal(c.prompt.includes("Send the booking link rather than describing how to book."), c.link, c.wire);
  }
});

test("each prompt says the wire it answers on: a text by text message, a DM in Instagram direct messages, never over WhatsApp", () => {
  for (const c of cases) {
    const said = {
      whatsapp: "over WhatsApp",
      sms: "by text message",
      instagram: "in Instagram direct messages",
      voice: "on the phone",
    }[c.wire];
    assert.ok(c.prompt.startsWith(`You are the assistant for Harbor Nails, answering customers ${said}.`), c.prompt);
  }
});

test("a yes to offers is one to WhatsApp offers only where a WhatsApp line answers; elsewhere nothing is promised", () => {
  for (const c of cases) {
    assert.equal(
      c.prompt.includes("the customer is saying yes to offers and news by WhatsApp"),
      c.whatsapp,
      `${c.wire}, WhatsApp ${c.whatsapp}`,
    );
    if (!c.whatsapp) assert.ok(c.prompt.includes("thank them in one short line and promise nothing"), c.wire);
  }
});

test("a call is never given the line it is on as the number to call; a chat is, and a call keeps a number of its own", () => {
  // 11 Oct 2026: the live salon typed no number, so its calls were given their own line as the one to ring back.
  for (const c of cases) {
    if (c.wire === "voice") {
      assert.ok(!c.prompt.includes("Phone:"), "the line the caller is ringing is no number to give them");
      assert.ok(!c.prompt.includes("give the phone number above"), "and nothing points at a number it was not given");
    } else assert.ok(c.prompt.includes("Phone: +1 (305) 555-0100"), `${c.wire}: in a chat it is the number to call`);
  }
  const typed = resolveSystemPrompt(
    { ...brainOf(true), phone_display: "(212) 555-0142" },
    "voice",
    "America/New_York",
    new Date("2026-10-12T15:00:00Z"),
    null,
    { channels: [VOICE, SMS, WHATSAPP] },
  );
  assert.ok(typed.includes("Phone: (212) 555-0142"), "a number of its own the owner typed is still said on a call");
  assert.ok(typed.includes("give the phone number above"), typed);
});
