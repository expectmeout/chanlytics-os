/**
 * The composed prompt, section by section, word for word.
 *
 * composeSystemPrompt builds the receptionist's instructions from a table of sections (PROMPT_SECTIONS in
 * contracts' config/workspace-config/compose.ts), each a builder over the same facts. The other prompt tests pin what
 * a section says about one fact, and prompt-blocks.test.mjs pins the sections' order and how each opens; these pin
 * every word of two representative workspaces' prompts on both channels, one section at a time, so a word changed in
 * any section, or a section moved, fails here by the section's name. Between them the two reach every section: a
 * salon that sends a booking link and has a line to transfer to, and a mover that quotes each job and has neither.
 *
 * A failure here is a changed prompt: the live receptionist reads these words. Change the expectation in the same
 * change as the words, on purpose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSystemPrompt, DATA_NOT_INSTRUCTIONS, PROMPT_OPENINGS } from "@chanlytics/contracts";

/** A Monday: the salon's September closure has passed and is not said; its December one is ahead and is. */
const NOW = new Date("2026-09-28T15:00:00Z");

const shifts = {
  intervals: [
    { open: "09:30", close: "13:00" },
    { open: "15:00", close: "19:00" },
  ],
};

/** Every section: a booking link, a line to transfer to, the owner's own words, and Booking under "ask". */
const SALON = {
  base: {
    business_name: "Example Salon",
    phone_display: "(555) 010-0142",
    booking_link: "https://book.example.com/salon",
    // A WhatsApp number: only a workspace with one is told to ask for the yes to offers (offers-ask.ts), and only on WhatsApp.
    whatsapp_line: "+15550100145",
  },
  profile: {
    address: "12 Example St, Springfield",
    website: "https://salon.example.com",
    tone: "Warm and unhurried.",
    languages: ["English", "Spanish"],
    hours: {
      mon: {},
      tue: shifts,
      wed: shifts,
      thu: shifts,
      fri: { open: "09:00", close: "19:00" },
      sat: { open: "09:00", close: "15:00" },
      sun: {},
    },
    closures: [
      { date: "2026-09-01", note: "Staff training" },
      { date: "2026-12-24", until: "2026-12-26", note: "Holidays" },
    ],
    services: [
      { name: "Cut and style", duration_min: 60, price_note: "from $45" },
      { name: "Colour", duration_min: 120, price_note: "quoted at a consult" },
    ],
    notes: [{ title: "Parking", text: "Free parking behind the building." }],
    booking_rules: {
      lead_hours: 2,
      consult_first: ["Colour"],
      party_max: 4,
      ask_email: true,
      notes: ["A deposit holds a colour appointment."],
    },
    escalate_when: ["They ask for the owner by name", "They mention a reaction to a product"],
    handoff_number: "+15550100143",
    guardrails: { no_health_advice: true },
    extra_instructions: "Greet returning clients by name when you know it.",
  },
  tz: "America/Chicago",
  policy: { booking: { mode: "ask" }, faq: { mode: "auto" } },
};

const weekday = { open: "08:00", close: "17:00" };

/** A business that quotes each job: no booking link, no phone number, no line to transfer to, no zone, no policy, no WhatsApp number. */
const MOVER = {
  base: { business_name: "Example Movers", phone_display: null, booking_link: null, whatsapp_line: null },
  profile: {
    hours: {
      mon: weekday,
      tue: weekday,
      wed: weekday,
      thu: weekday,
      fri: weekday,
      sat: { open: "09:00", close: "12:00" },
    },
    services: [
      { name: "Local move", price_note: "quoted after a walk-through" },
      { name: "Packing", duration_min: 240 },
    ],
  },
  tz: null,
  policy: null,
};

/** The salon's facts, which both channels say alike. */
const SALON_FACTS = [
  [
    "contact",
    [
      "Address: 12 Example St, Springfield",
      "Phone: (555) 010-0142",
      "Booking link: https://book.example.com/salon",
      "Website: https://salon.example.com",
    ],
  ],
  [
    "hours",
    [
      "Opening hours (all times America/Chicago):",
      "- Monday: Closed",
      "- Tuesday–Thursday: 09:30–13:00 and 15:00–19:00 (closed 13:00–15:00)",
      "- Friday: 09:00–19:00",
      "- Saturday: 09:00–15:00",
      "- Sunday: Closed",
    ],
  ],
  [
    "closures",
    [
      "Closed on these dates, whatever the opening hours above say:",
      "- December 24, 2026 – December 26, 2026 — Holidays",
      "If someone asks about one of these dates, say the business is closed that day and offer the next day it is open.",
    ],
  ],
  [
    "services",
    [
      "Services:",
      "- Cut and style — about 60 minutes — from $45",
      "- Colour — about 120 minutes — quoted at a consult",
    ],
  ],
  ["notes", ["Other things to know:", "- Parking: Free parking behind the building."]],
  [
    "bookingRules",
    [
      "Booking rules:",
      "- At least 2 hours' notice for any appointment.",
      "- These need a consultation before they can be booked: Colour.",
      "- Up to 4 people per booking; larger groups go to a person.",
      "- When you send the booking link and no email address is on file for them, ask once for the best email for their booking confirmation, then move on. Never insist; thank them if they give one.",
      "- A deposit holds a colour appointment.",
    ],
  ],
];

const SALON_WHATSAPP = [
  [
    "identity",
    [
      "You are the assistant for Example Salon, answering customers over WhatsApp.",
      "Tone: Warm and unhurried.",
      "You speak: English, Spanish.",
    ],
  ],
  ...SALON_FACTS,
  [
    "handoff",
    [
      "Handing the conversation to a person:",
      "Put the exact token [[HUMAN]] at the very end of your reply. It is removed before the customer sees it, and it is the only thing that alerts a human — saying you will fetch someone does nothing on its own. Write the reply you would normally send, then add the token.",
      "Do this whenever the customer asks for a person, is upset, or asks something these instructions do not cover, and whenever:",
      "- They ask for the owner by name",
      "- They mention a reaction to a product",
    ],
  ],
  [
    "ownWords",
    [
      "Further instructions from the business. Where these disagree with the address, hours, closed dates and services above, the details above are current and correct.",
      "Greet returning clients by name when you know it.",
    ],
  ],
  [
    "medium",
    ["Keep replies short enough to read on a phone. Send the booking link rather than describing how to book."],
  ],
  [
    "openTimes",
    [
      "If open times are listed after these instructions, offer up to three that fit what the customer wants, then send the booking link — the calendar decides, never you. If none are listed, do not guess at open times; send the link.",
    ],
  ],
  [
    "rules",
    [
      "Rules you must follow:",
      "- Never quote or confirm a price. Say it is quoted in person or at a consult, and offer the booking link.",
      "- Never promise or confirm an appointment yourself. Booking happens on the booking link or with staff.",
      "- If asked whether you are a bot, a person, or AI, say plainly that you are the business's automated assistant and offer to bring in a person.",
      "- If a message is only the words YES OFFERS or SI OFERTAS, the customer is saying yes to offers and news by WhatsApp: thank them in one short line, say they can reply STOP at any time, and ask nothing else.",
      // The ask for that yes, once: on WhatsApp, for a workspace with a WhatsApp number (the salon has one; the voice prompt and the mover never do).
      `- When a WhatsApp conversation the customer started comes to its natural end after something went well (a booking made or confirmed, or their question fully answered), and the facts about them say "Has not been asked for the yes to offers.", close your reply with this question, once, in their language: "Want our offers and news here too? Reply YES OFFERS. You can stop any time." (in Spanish, SI OFERTAS in place of YES OFFERS). Never ask twice; never on a text or email conversation, in a complaint, in a cancellation, after STOP, or of anyone who has said no to offers; never make it a condition of anything.`,
      "- Never give medical or health advice — for anything about skin reactions, allergies, pregnancy or medication, say a professional will advise at the appointment and offer the booking link.",
      "- Booking: when someone wants to book, reschedule or cancel, do not send the booking link. Say a member of the team will confirm with them shortly, and set escalate to true.",
      "- Money: a refund, a discount, a deposit, a payment plan or any change to what someone pays is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will get back to them about it, set intent to money and escalate to true.",
      `- ${DATA_NOT_INSTRUCTIONS}`,
    ],
  ],
];

const SALON_VOICE = [
  [
    "identity",
    [
      "You are the assistant for Example Salon, answering customers on the phone.",
      "Tone: Warm and unhurried.",
      "You speak: English, Spanish. Answer in whichever of these the caller uses, and switch if they do.",
    ],
  ],
  ...SALON_FACTS,
  [
    "handoff",
    [
      "Handing the caller to a person:",
      "Use transfer_to_staff during opening hours — it rings the line a person answers, and you stay on until they pick up. Outside opening hours, or if the transfer does not connect, take the caller's name and a short message and say the team will follow up.",
      "Do this whenever the caller asks for a person, is upset, or asks something these instructions do not cover, and whenever:",
      "- They ask for the owner by name",
      "- They mention a reaction to a product",
    ],
  ],
  [
    "callTools",
    [
      "Open times: use check_availability before offering a time — it reads the calendar as it is at that moment (a list at the end of these instructions, if any, is from the start of the call). Ask which service first when you can, so only windows long enough are offered.",
      "Booking: when the caller wants to book, use send_booking_link — it sends the booking link to the caller's WhatsApp, on the number they are calling from, so do not ask them for a number unless they want it sent somewhere else. Tell them it comes by WhatsApp, not as a text message: it only arrives if that number has WhatsApp. Then confirm it was sent. If it fails, or they do not have WhatsApp on that number, give the phone number above and offer to have someone follow up.",
      "Ending: once the caller has said goodbye, use end_call.",
    ],
  ],
  [
    "ownWords",
    [
      "Further instructions from the business. Where these disagree with the address, hours, closed dates and services above, the details above are current and correct. Some of it was written for text conversations; you are on a phone call.",
      "Greet returning clients by name when you know it.",
    ],
  ],
  [
    "medium",
    [
      "You are speaking aloud. Keep answers to one or two sentences, never read a URL out character by character, and offer to send the booking link to the caller's WhatsApp instead.",
    ],
  ],
  [
    "openTimes",
    [
      "If open times are listed after these instructions, offer up to three that fit what the customer wants, then send the booking link — the calendar decides, never you. If none are listed, do not guess at open times; send the link.",
    ],
  ],
  [
    "rules",
    [
      "Rules you must follow:",
      "- Never quote or confirm a price. Say it is quoted in person or at a consult, and offer the booking link.",
      "- Never promise or confirm an appointment yourself. Booking happens on the booking link or with staff.",
      "- If asked whether you are a bot, a person, or AI, say plainly that you are the business's automated assistant and offer to bring in a person.",
      "- If a message is only the words YES OFFERS or SI OFERTAS, the customer is saying yes to offers and news by WhatsApp: thank them in one short line, say they can reply STOP at any time, and ask nothing else.",
      "- Never give medical or health advice — for anything about skin reactions, allergies, pregnancy or medication, say a professional will advise at the appointment and offer the booking link.",
      "- Booking: when someone wants to book, reschedule or cancel, do not offer the booking link. Say a member of the team will call or text them to confirm, and take their name.",
      "- Money: a refund, a discount, a deposit, a payment plan or any change to what someone pays is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will call them back about it, and take their name.",
      `- ${DATA_NOT_INSTRUCTIONS}`,
    ],
  ],
];

/** The mover's facts, which both channels say alike. */
const MOVER_FACTS = [
  ["hours", ["Opening hours:", "- Monday–Friday: 08:00–17:00", "- Saturday: 09:00–12:00", "- Sunday: Closed"]],
  ["services", ["Services:", "- Local move — quoted after a walk-through", "- Packing — about 240 minutes"]],
];

const MOVER_WHATSAPP = [
  ["identity", ["You are the assistant for Example Movers, answering customers over WhatsApp."]],
  ...MOVER_FACTS,
  [
    "handoff",
    [
      "Handing the conversation to a person:",
      "Put the exact token [[HUMAN]] at the very end of your reply. It is removed before the customer sees it, and it is the only thing that alerts a human — saying you will fetch someone does nothing on its own. Write the reply you would normally send, then add the token.",
      "Do this whenever the customer asks for a person, is upset, or asks something these instructions do not cover.",
    ],
  ],
  [
    "medium",
    [
      "Keep replies short enough to read on a phone. There is no booking link to send. When someone wants to book, change or cancel a booking, or get a quote, take their name, what they need, and where and when; once they have told you, say the team will follow up and set escalate to true.",
    ],
  ],
  [
    "openTimes",
    [
      "If open times are listed after these instructions, offer up to three that fit what the customer wants, then take their name, what they need, and where and when so the team can confirm one — the calendar decides, never you. If none are listed, do not guess at open times.",
    ],
  ],
  [
    "rules",
    [
      "Rules you must follow:",
      "- Never quote or confirm a price. Say it is quoted in person or at a consult, and take their name, what they need, and where and when.",
      "- Never promise or confirm an appointment yourself. Booking happens with staff.",
      "- If asked whether you are a bot, a person, or AI, say plainly that you are the business's automated assistant and offer to bring in a person.",
      "- If a message is only the words YES OFFERS or SI OFERTAS, the customer is saying yes to offers and news by WhatsApp: thank them in one short line, say they can reply STOP at any time, and ask nothing else.",
      "- Money: a refund, a discount, a deposit, a payment plan or any change to what someone pays is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will get back to them about it, set intent to money and escalate to true.",
      `- ${DATA_NOT_INSTRUCTIONS}`,
    ],
  ],
];

const MOVER_VOICE = [
  ["identity", ["You are the assistant for Example Movers, answering customers on the phone."]],
  ...MOVER_FACTS,
  [
    "handoff",
    [
      "Handing the caller to a person:",
      "There is no line to transfer to. Take the caller's name and a short message and say the team will follow up.",
      "Do this whenever the caller asks for a person, is upset, or asks something these instructions do not cover.",
    ],
  ],
  [
    "callTools",
    [
      "Open times: use check_availability before offering a time — it reads the calendar as it is at that moment (a list at the end of these instructions, if any, is from the start of the call). Ask which service first when you can, so only windows long enough are offered.",
      "Booking: there is no booking link, so never use send_booking_link. When the caller wants to book, change or cancel a booking, or get a quote, take their name, what they need, and where and when, and say the team will follow up.",
      "Ending: once the caller has said goodbye, use end_call.",
    ],
  ],
  [
    "medium",
    ["You are speaking aloud. Keep answers to one or two sentences, and never read a URL out character by character."],
  ],
  [
    "openTimes",
    [
      "If open times are listed after these instructions, offer up to three that fit what the customer wants, then take their name, what they need, and where and when so the team can confirm one — the calendar decides, never you. If none are listed, do not guess at open times.",
    ],
  ],
  [
    "rules",
    [
      "Rules you must follow:",
      "- Never quote or confirm a price. Say it is quoted in person or at a consult, and take their name, what they need, and where and when.",
      "- Never promise or confirm an appointment yourself. Booking happens with staff.",
      "- If asked whether you are a bot, a person, or AI, say plainly that you are the business's automated assistant and offer to bring in a person.",
      "- If a message is only the words YES OFFERS or SI OFERTAS, the customer is saying yes to offers and news by WhatsApp: thank them in one short line, say they can reply STOP at any time, and ask nothing else.",
      "- Money: a refund, a discount, a deposit, a payment plan or any change to what someone pays is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will call them back about it, and take their name.",
      `- ${DATA_NOT_INSTRUCTIONS}`,
    ],
  ],
];

const WORKSPACES = {
  salon: { ...SALON, want: { whatsapp: SALON_WHATSAPP, voice: SALON_VOICE } },
  mover: { ...MOVER, want: { whatsapp: MOVER_WHATSAPP, voice: MOVER_VOICE } },
};

for (const [name, w] of Object.entries(WORKSPACES))
  for (const channel of ["whatsapp", "voice"])
    test(`the ${name}'s prompt on ${channel}: every section, word for word, in order`, () => {
      const got = composeSystemPrompt(w.base, w.profile, channel, w.tz, NOW, w.policy).split("\n\n");
      const want = w.want[channel];
      want.forEach(([section, lines], i) =>
        assert.deepEqual(got[i]?.split("\n"), lines, `the ${name}, ${channel}: the ${section} section`),
      );
      assert.equal(got.length, want.length, `the ${name}, ${channel}: nothing after the ${want.at(-1)[0]} section`);
    });

/* ------------------------------------ a note that ends ------------------------------------ */

/** The salon's prompt on WhatsApp with these notes, at this clock, in this zone. */
const withNotes = (notes, at = NOW, tz = SALON.tz) =>
  composeSystemPrompt(SALON.base, { ...SALON.profile, notes }, "whatsapp", tz, at, SALON.policy);
/** The notes section's lines, or null when the prompt has none. */
const notesOf = (prompt) =>
  prompt
    .split("\n\n")
    .find((s) => s.startsWith("Other things to know:"))
    ?.split("\n") ?? null;
const PARKING = { title: "Parking", text: "Free parking behind the building." };
const note = (title, until) => ({ title, text: `${title} is said.`, until });

test("a note with a last day is said with it while it lasts, by the date the closures spell a single day in, and one without is said as it always was", () => {
  // NOW is Monday 28 September in Chicago: the 29th is tomorrow, the 27th yesterday.
  assert.deepEqual(
    notesOf(withNotes([PARKING, note("Holiday hours", "2026-09-29"), note("Summer offer", "2026-09-27")])),
    [
      "Other things to know:",
      "- Parking: Free parking behind the building.",
      "- Holiday hours (until Tuesday, September 29, 2026): Holiday hours is said.",
    ],
  );
  // Its last day is today, on the business's clock: still said.
  assert.deepEqual(notesOf(withNotes([note("Holiday hours", "2026-09-28")])), [
    "Other things to know:",
    "- Holiday hours (until Monday, September 28, 2026): Holiday hours is said.",
  ]);
  // A note with no end is the line it always was, at any clock: the salon's own prompt above pins it word for word.
  for (const at of [NOW, new Date("2031-01-01T12:00:00Z")])
    assert.deepEqual(notesOf(withNotes([PARKING], at)), [
      "Other things to know:",
      "- Parking: Free parking behind the building.",
    ]);
});

test("a note's last day is the business's own day: at 23:30 in New York it is still said, and once New York's day has passed it is not, though UTC's has turned at 20:00", () => {
  const ny = "America/New_York";
  const lastDay = [PARKING, note("Holiday hours", "2026-10-10")];
  // 03:30 UTC on the 11th is 23:30 on the 10th in New York (EDT): the note's last day, so it is said.
  assert.deepEqual(notesOf(withNotes(lastDay, new Date("2026-10-11T03:30:00Z"), ny)), [
    "Other things to know:",
    "- Parking: Free parking behind the building.",
    "- Holiday hours (until Saturday, October 10, 2026): Holiday hours is said.",
  ]);
  // 04:30 UTC on the 11th is 00:30 on the 11th in New York: its day has passed, and it is no longer said.
  assert.deepEqual(notesOf(withNotes(lastDay, new Date("2026-10-11T04:30:00Z"), ny)), [
    "Other things to know:",
    "- Parking: Free parking behind the building.",
  ]);
  // In winter New York is five hours behind (EST): 04:30 UTC is 23:30 on the note's last day, still said, and 05:30 UTC
  // is 00:30 the next day, when it is not. The instant that ended the October note keeps the December one.
  const winter = [PARKING, note("Holiday hours", "2026-12-10")];
  assert.deepEqual(notesOf(withNotes(winter, new Date("2026-12-11T04:30:00Z"), ny)), [
    "Other things to know:",
    "- Parking: Free parking behind the building.",
    "- Holiday hours (until Thursday, December 10, 2026): Holiday hours is said.",
  ]);
  assert.deepEqual(notesOf(withNotes(winter, new Date("2026-12-11T05:30:00Z"), ny)), [
    "Other things to know:",
    "- Parking: Free parking behind the building.",
  ]);
});

test("with no zone a note keeps the closures' fallback: a day longer rather than hiding one that lasts, and the two agree", () => {
  // NOW is 15:00 UTC on the 28th; with no zone the day is read as the 27th (UTC, a day back), for a closure and a note alike.
  const profile = {
    ...SALON.profile,
    closures: [{ date: "2026-09-27", note: "Staff day" }],
    notes: [note("Yesterday's note", "2026-09-27"), note("Older note", "2026-09-26")],
  };
  const prompt = composeSystemPrompt(SALON.base, profile, "whatsapp", null, NOW, SALON.policy);
  assert.ok(prompt.includes("- Sunday, September 27, 2026 — Staff day"), "the closure on the 27th is still said");
  assert.deepEqual(notesOf(prompt), [
    "Other things to know:",
    "- Yesterday's note (until Sunday, September 27, 2026): Yesterday's note is said.",
  ]);
});

test("when every note has ended the prompt says nothing of them: no heading over an empty list", () => {
  const ended = withNotes([note("Summer offer", "2026-09-27"), note("Spring offer", "2026-04-30")]);
  assert.equal(notesOf(ended), null);
  assert.ok(!ended.includes(PROMPT_OPENINGS.notes));
  assert.equal(ended, withNotes(undefined), "the prompt of a profile with no notes at all");
});
