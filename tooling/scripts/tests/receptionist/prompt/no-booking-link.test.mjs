/**
 * A receptionist with no booking link: the first run's decision 2, its reading half (24 Sep 2026).
 *
 * A business that quotes each job -- a mover, a caterer, a contractor -- has no booking link to send, and its
 * receptionist takes the customer's details for the team instead. Until this, a config with no link failed to parse,
 * and a config that fails to parse is configBroken: the receptionist is silent and staff are told the settings could
 * not be read. So the reading half ships first. Every reader takes a receptionist with no link and says what it does
 * instead, and every save still requires one until the first run's Check asks how customers buy (3c).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { withStanding } from "../_prompt-rules.mjs";
import {
  bookingLinkOptional,
  composeSystemPrompt,
  describeOpenings,
  describeVisits,
  fallbackMessages,
  FALLBACK_DEFAULTS,
  frameGuardrail,
  NO_LINK_DETAILS,
  offersBookingLink,
  parseTenantConfigResult,
  resolveSystemPrompt,
  businessGap,
  TenantConfigWriteSchema,
} from "@chanlytics/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const { loadTenantRuntime } = await import(
  pathToFileURL(path.join(here, "../../../../../apps/edge/lib/tenant-runtime.ts")).href
);

/** A business that quotes each job: no link. */
const QUOTES = {
  business_name: "Harbor Moving",
  system_prompt: "You answer for Harbor Moving, a moving company that quotes each job before it is booked.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};
const BOOKS = { ...QUOTES, booking_link: "https://book.example/harbor" };
const PROFILE = {
  address: "12 Pier Rd, Brooklyn",
  hours: { mon: { open: "08:00", close: "18:00" } },
  services: [{ name: "Local move", price_note: "quoted per job" }],
  guardrails: { never_quote_prices: true, never_confirm_booking: true, no_health_advice: true },
};

test("the read and the save both take a receptionist with no booking link; who is asked for one is the pages', by how customers buy", () => {
  const read = parseTenantConfigResult({ brain: QUOTES });
  assert.equal(read.ok, true, read.ok ? "" : read.issues.join("; "));
  assert.equal(read.config.brain.booking_link, undefined);
  assert.equal(
    TenantConfigWriteSchema.safeParse({ brain: QUOTES }).success,
    true,
    "a business that quotes saves one (decision 2), and the save cannot see how customers buy",
  );
  assert.equal(TenantConfigWriteSchema.safeParse({ brain: BOOKS }).success, true, "one with a link saves as before");
  assert.equal(TenantConfigWriteSchema.safeParse({}).success, true, "and a config with no receptionist yet");
  assert.equal(
    parseTenantConfigResult({ brain: { ...BOOKS, booking_link: "not-a-url" } }).ok,
    false,
    "a link that is there is still read as a link",
  );
  assert.equal(
    TenantConfigWriteSchema.safeParse({ brain: { ...QUOTES, booking_link: "" } }).success,
    false,
    "and an empty one is not no link: the pages remove the key rather than store it empty",
  );
  assert.deepEqual(
    ["proposal", "booking", null, undefined].map((answer) => bookingLinkOptional(answer)),
    [true, false, false, false],
    "asked of a business that books or has not said; never of one that quotes",
  );
});

test("the edge reads it as a receptionist to answer with, not a broken config", async () => {
  const T = "dddddddd-0000-4000-8000-00000000b3b1";
  const db = fakeDb(
    {
      tenants: [{ id: T, name: "Harbor Moving", timezone: "America/New_York", status: "active" }],
      tenant_channels: [],
      tenant_config: [{ tenant_id: T, config: { brain: QUOTES } }],
      policies: [],
      google_listings: [],
    },
    {},
    { runtime_stamp: () => "stamp-no-link" },
  );
  const rt = await loadTenantRuntime(db, { tenantId: T, channelId: "wa-1", kind: "whatsapp", credentialsRef: null });
  assert.equal(
    rt.configBroken,
    false,
    "it was: the receptionist silent, and staff told the settings could not be read",
  );
  assert.equal(rt.brain?.business_name, "Harbor Moving");
});

test("the prompt says what it does instead, on both channels, wherever it would have offered the link", () => {
  const base = { business_name: "Harbor Moving", booking_link: null };
  const chat = composeSystemPrompt(base, PROFILE, "whatsapp");
  const call = composeSystemPrompt(base, PROFILE, "voice");
  for (const p of [chat, call]) {
    assert.doesNotMatch(p, /Booking link:/, "no line for a link there is not");
    assert.doesNotMatch(p, /offer the booking link|send the booking link|send the link/);
    assert.ok(
      p.includes(`then take ${NO_LINK_DETAILS} so the team can confirm one — the calendar decides, never you.`),
      "an opening offered, then the details",
    );
    assert.ok(p.includes(`Say it is quoted in person or at a consult, and take ${NO_LINK_DETAILS}.`), "a price asked");
    assert.ok(p.includes("Booking happens with staff."));
    assert.ok(p.includes("say a professional will advise at the appointment."));
  }
  assert.ok(
    chat.includes(
      `There is no booking link to send. When someone wants to book, change or cancel a booking, or get a quote, take ${NO_LINK_DETAILS}; once they have told you, say the team will follow up and set escalate to true.`,
    ),
    "in chat, escalating is what tells the team",
  );
  assert.ok(
    call.includes(
      `Booking: there is no booking link, so never use send_booking_link. When the caller wants to book, change or cancel a booking, or get a quote, take ${NO_LINK_DETAILS}, and say the team will follow up.`,
    ),
    "the tool is on the shell every workspace shares, so it is named to be left alone",
  );
  assert.ok(call.includes("Keep answers to one or two sentences, and never read a URL out character by character."));
  const resolved = resolveSystemPrompt({ ...QUOTES, profile: PROFILE }, "voice");
  assert.ok(resolved.includes("Booking: there is no booking link, so never use send_booking_link."));
  assert.doesNotMatch(resolved, /Booking link:|undefined|null/, "the resolver hands the composer no link, not a hole");
  // Booking held on the Autonomy tab as well: both say the team follows up, and neither offers a link.
  const held = composeSystemPrompt(base, PROFILE, "voice", null, new Date(), { booking: { mode: "ask" } });
  assert.ok(held.includes("Booking: there is no booking link, so never use send_booking_link."));
  assert.ok(held.includes("Say a member of the team will call or text them to confirm, and take their name."));
});

test("a receptionist answered from its own stored prompt is told there is no link too, first among the rules after it; one with a link keeps its own words byte for byte, and only the standing rules follow", () => {
  for (const channel of ["whatsapp", "voice"]) {
    const told = resolveSystemPrompt(QUOTES, channel);
    assert.ok(told.startsWith(`${QUOTES.system_prompt}\n\nRules you must follow:\n- `), told);
    assert.ok(told.includes("no booking link"), channel);
    assert.equal(resolveSystemPrompt(BOOKS, channel), withStanding(BOOKS.system_prompt, channel), channel);
  }
  assert.ok(
    resolveSystemPrompt(QUOTES, "voice").includes("never use send_booking_link"),
    "the shell's tool, named to be left alone on a stored prompt as on a composed one",
  );
});

test("the messages sent in its name leave out the link's sentence, and nothing else", () => {
  const f = fallbackMessages({ ...QUOTES, fallbacks: { ...FALLBACK_DEFAULTS } });
  for (const m of Object.values(f)) assert.doesNotMatch(m, /\{|booking link|Book anytime/i);
  assert.ok(f.greeting.startsWith("Hi! Thanks for reaching out to Harbor Moving."));
  assert.ok(f.error.startsWith("Thanks for reaching out to Harbor Moving!"));
});

test("the openings, a caller's appointment and a correction on a call each end in the details, not the link", () => {
  const TZ = "America/New_York";
  const monday = Date.UTC(2026, 8, 28, 13);
  const openings = [
    {
      key: "2026-09-28",
      weekday: "mon",
      label: "Monday, September 28",
      windows: [{ start: monday, end: monday + 2 * 3_600_000 }],
    },
  ];
  assert.ok(
    describeOpenings(openings, TZ, { daysAhead: 14, hasBookingLink: false }).endsWith(
      `Offer up to three of these that fit what they want, then take ${NO_LINK_DETAILS} so the team can confirm one. Never confirm a slot yourself; the calendar decides.`,
    ),
  );
  assert.equal(
    describeOpenings([], TZ, { daysAhead: 14, hasBookingLink: false }),
    "Open times (from the calendar): nothing is open in the next 14 days. Offer to have someone call back.",
  );
  const visits = {
    next: { id: "v1", start: monday, end: monday + 3_600_000, title: "Estimate visit", allDay: false, via: "phone" },
    last: null,
  };
  const said = describeVisits(visits, TZ, monday - 86_400_000, { hasBookingLink: false });
  assert.ok(said.includes("to change or cancel it, say the team will follow up — nothing is changed from here."));
  assert.doesNotMatch(said, /booking link/);
  const corrected = frameGuardrail("price", { hasBookingLink: false });
  assert.ok(
    corrected.includes(
      `say you cannot confirm pricing yourself, that the team confirms it, and take ${NO_LINK_DETAILS}.`,
    ),
  );
  assert.doesNotMatch(corrected, /booking link/);
});

test("the Business tab says so: the one gap it names first is the link", () => {
  const read = parseTenantConfigResult({ brain: { ...QUOTES, profile: PROFILE } });
  assert.deepEqual(businessGap(read.config.brain, null), {
    sentence: "It has no booking link to send anyone.",
    row: "booking_link",
  });
});

test("the link is offered unless the config is known to hold none: with no receptionist config, a call is told to offer it", () => {
  assert.equal(offersBookingLink(QUOTES), false);
  assert.equal(offersBookingLink(BOOKS), true);
  assert.equal(
    offersBookingLink(null),
    true,
    "nothing known: FACTS_UNAVAILABLE offers the link, and so does all said beside it",
  );
});
