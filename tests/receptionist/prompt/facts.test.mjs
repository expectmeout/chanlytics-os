/**
 * One fact, one owner.
 *
 * The case that made this necessary is the first test, with the values it had
 * in production: a live salon whose receptionist told every WhatsApp customer
 * to call the number it TRANSFERS to, while answering on a different one, with
 * nothing in the product able to notice because the published number was free
 * text in a document nobody compared to anything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveFacts,
  factConflicts,
  knownForwarding,
  samePhone,
  sameAddress,
  sameName,
  SOURCE_WORDS,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

/** Marisa's Beauty Salon, exactly as the database held it. */
const LIVE = {
  typed: {
    business_name: "Marisa's Beauty Salon",
    phone_display: "(212) 555-0142",
    booking_link: "https://book.example.com/en-us/4471902_marisa-s-beauty-salon_hair-salon_29902_brooklyn",
    profile: {
      address: "1200 Maple Ave, Brooklyn, NY 11208",
      website: "https://marisasbeautysalon.example.com",
      handoff_number: "+12125550142",
    },
  },
  known: {
    workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York" },
    channels: [
      { kind: "whatsapp", number_e164: "+13055550188", status: "active" },
      { kind: "voice", number_e164: "+13055550123", status: "active" },
    ],
    listing: { name: "Marisa's Beauty Salon", address: "1200 Maple Ave, Brooklyn, NY 11208, USA" },
  },
};

test("the live workspace: the published number is the transfer number, and that is now sayable", () => {
  const f = resolveFacts(LIVE.typed, LIVE.known);

  // What it answers on is provisioned and never typed.
  assert.deepEqual(f.voice_line, { value: "+13055550123", source: "provisioned" });
  assert.deepEqual(f.whatsapp_line, { value: "+13055550188", source: "provisioned" });

  // What it SAYS is still what was typed — changing that silently would be a
  // worse bug than the one being fixed — but the disagreement is on the record.
  assert.equal(f.phone_display.value, "(212) 555-0142");
  assert.equal(f.phone_display.source, "typed");
  assert.deepEqual(f.phone_display.disputed, { value: "+1 (305) 555-0123", source: "provisioned" });

  const [worst] = factConflicts(f);
  assert.equal(worst.fact, "phone_display");
  assert.equal(worst.severity, "serious");
  // It knows the published number IS the transfer number, so it says the thing
  // that is actually true rather than a generic mismatch warning.
  assert.match(worst.sentence, /the number it transfers to/);
  assert.match(worst.sentence, /never AI on \+1 \(305\) 555-0123/);
  assert.equal(worst.to, "admin/workspace");
});

test("Google's country suffix is not a disagreement", () => {
  const f = resolveFacts(LIVE.typed, LIVE.known);
  // "1200 Maple Ave, Brooklyn, NY 11208" vs "…, USA". Reporting that trains
  // people to ignore the warning, which costs more than the warning is worth.
  assert.equal(f.address.source, "typed");
  assert.equal(f.address.disputed, undefined);
  assert.equal(f.business_name.disputed, undefined, "and neither is the same name from Google");
  assert.equal(factConflicts(f).length, 1, "one conflict on this workspace, and it is the phone");
});

test("a mismatch that is NOT the transfer number reads as the plain error it is", () => {
  const f = resolveFacts(
    { ...LIVE.typed, profile: { ...LIVE.typed.profile, handoff_number: "+15551230000" } },
    LIVE.known,
  );
  const [c] = factConflicts(f);
  assert.match(c.sentence, /Anyone who calls the published number does not reach it/);
});

/**
 * A made-up workspace for the forwarding cases (F1): every number is in 555-01xx, the range kept for fiction. It
 * answers on its line, publishes the number customers already know, and puts callers through to a mobile.
 */
const HARBOR = {
  typed: {
    business_name: "Harbor Moving",
    phone_display: "(212) 555-0142",
    profile: { handoff_number: "+19175550100" },
  },
  known: {
    workspace: { name: "Harbor Moving", timezone: "America/New_York" },
    channels: [{ kind: "voice", number_e164: "+13055550123", status: "active" }],
    listing: null,
  },
};
const KEPT = "+12125550142";
const LINE = "+13055550123";

test("F1: the number the business keeps and forwards to its line is what it publishes, not a disagreement", () => {
  // The first run's default: keep the number customers know, forward the calls nobody picks up to the line.
  const f = resolveFacts(HARBOR.typed, { ...HARBOR.known, forwarding: [{ from_e164: KEPT, to_e164: LINE }] });
  assert.deepEqual(f.kept_line, { value: KEPT, source: "provisioned" });
  assert.deepEqual(
    f.phone_display,
    { value: "(212) 555-0142", source: "typed" },
    "no dispute: a call to it that nobody picks up reaches the line",
  );
  assert.deepEqual(factConflicts(f), []);
});

test("F1: forwarding that points at a line the workspace no longer answers on keeps nothing, and the conflict stands", () => {
  const f = resolveFacts(HARBOR.typed, { ...HARBOR.known, forwarding: [{ from_e164: KEPT, to_e164: "+13055550199" }] });
  assert.deepEqual(f.kept_line, { value: null, source: "absent" }, "it forwards somewhere this workspace is not");
  const [c] = factConflicts(f);
  assert.equal(c.fact, "phone_display");
  assert.equal(c.severity, "serious");
  assert.match(c.sentence, /Anyone who calls the published number does not reach it/);
});

test("F1: a transfer number that forwards back to AI is a loop, said on the transfer row", () => {
  // Stored before the transfer row refused it (phone.ts whyNotAHandoff): the kept number as the transfer number too.
  const f = resolveFacts(
    { ...HARBOR.typed, profile: { handoff_number: KEPT } },
    { ...HARBOR.known, forwarding: [{ from_e164: KEPT, to_e164: LINE }] },
  );
  assert.equal(f.phone_display.disputed, undefined, "publishing the kept number is still right");
  const conflicts = factConflicts(f);
  assert.deepEqual(
    conflicts.map((c) => [c.fact, c.severity, c.known, c.known_source, c.to]),
    [["handoff_number", "serious", "+1 (212) 555-0142", "provisioned", "admin/workspace/handoff_number"]],
  );
  assert.match(conflicts[0].sentence, /go to \+1 \(212\) 555-0142, which sends unanswered calls back to AI/);

  // A transfer number that is not the kept one is no loop, and forwarding that reaches another line keeps nothing.
  const elsewhere = resolveFacts(
    { ...HARBOR.typed, profile: { handoff_number: KEPT } },
    { ...HARBOR.known, forwarding: [{ from_e164: KEPT, to_e164: "+13055550199" }] },
  );
  assert.equal(
    factConflicts(elsewhere).some((c) => c.fact === "handoff_number"),
    false,
    "the kept number reaches another line, so a transfer to it rings a person",
  );
});

test("F1: knownForwarding reads Setup's lines -- forwarded rows with a number, and where each one goes", () => {
  assert.deepEqual(
    knownForwarding([
      { kind: "own", e164: LINE, forwarding: null },
      { kind: "forwarded", e164: KEPT, forwarding: { destination_e164: LINE } },
      { kind: "forwarded", e164: null, forwarding: { destination_e164: LINE } },
      { kind: "forwarded", e164: "+17185550100" },
    ]),
    [
      { from_e164: KEPT, to_e164: LINE },
      { from_e164: "+17185550100", to_e164: null },
    ],
  );
  assert.deepEqual(knownForwarding([]), []);
});

test("no typed value falls back to what the platform knows", () => {
  const f = resolveFacts({ business_name: "Marisa’s Beauty Salon", profile: {} }, LIVE.known);
  assert.deepEqual(
    f.phone_display,
    { value: "+1 (305) 555-0123", source: "provisioned" },
    "formatted for speech: a prompt saying +13055550123 is a receptionist reading digits aloud",
  );
  assert.equal(f.address.value, "1200 Maple Ave, Brooklyn, NY 11208, USA");
  assert.equal(f.address.source, "verified");
  assert.deepEqual(factConflicts(f), [], "agreeing with the only source there is is not a conflict");
});

test("nothing known and nothing typed is 'absent', not an empty string", () => {
  const f = resolveFacts(null, null);
  for (const k of Object.keys(f)) {
    assert.equal(f[k].value, null, `${k} has no value`);
    assert.equal(f[k].source, "absent", `${k} says so`);
  }
  assert.deepEqual(factConflicts(f), []);
});

test("a disabled channel is not a line", () => {
  const f = resolveFacts(
    { profile: {} },
    { channels: [{ kind: "voice", number_e164: "+13055550123", status: "disabled" }] },
  );
  assert.equal(f.voice_line.value, null, "a switched-off line answers nothing, so it claims nothing");
  assert.equal(f.phone_display.source, "absent");
});

test("the same number written two ways is one fact", () => {
  assert.ok(samePhone("(212) 555-0142", "+12125550142"));
  assert.ok(samePhone("212-555-0142", "12125550142"));
  assert.ok(!samePhone("+12125550142", "+13055550123"));
  assert.ok(!samePhone("", "+12125550142"), "nothing is not a match");
  // Resolution uses it, so a workspace that typed its own line in a friendly
  // format must not be accused of a conflict.
  const f = resolveFacts({ phone_display: "(305) 555-0123", profile: {} }, LIVE.known);
  assert.equal(f.phone_display.disputed, undefined);
  assert.deepEqual(factConflicts(f), []);
});

test("addresses and names compare on what they mean, not how they are punctuated", () => {
  assert.ok(sameAddress("1200 Maple Ave, Brooklyn, NY 11208", "1200 Maple Ave, Brooklyn, NY 11208, USA"));
  assert.ok(!sameAddress("1200 Maple Ave", "99 Nowhere Rd"));
  assert.ok(sameName("Marisa's Beauty Salon", "Marisas Beauty Salon"));
  assert.ok(!sameName("Marisa's", "Someone Else"));
});

test("every source has words a person can read", () => {
  for (const s of ["provisioned", "verified", "workspace", "typed", "absent"]) {
    assert.equal(typeof SOURCE_WORDS[s], "string");
    assert.ok(SOURCE_WORDS[s].length > 3, `${s} says something`);
  }
});

// The resolver is the ONE place facts are decided, on every surface that states them. A resolver nothing calls is a
// comment, so each place a fact reaches a customer is run: the runtime carries what the platform knows, loaded with the
// config from the workspace's routing rows and its listing, and a failed load is empty, never a guess; a text's model
// turn is told the line the platform provisioned, formatted as a person says it; a call is never told the number it is
// ringing on, which only the routing row can say (receptionist/prompt/what-it-knows-and-how-sure-it-was.test.mjs). The eval and the steer
// doors passing what the platform knows are run in eval-door.test.mjs and steer-door.test.mjs; the settings read carrying
// each fact and its conflicts through the route in settings-routes.test.mjs ("F1") and its reader in ask/readers/, and
// landing once on the settings surface in the-settings-read-lands-the-facts.test.mjs. Pinned as resolve.ts's,
// tenant-runtime.ts's, the routing read's, model-turn's and call-start's text until 26 Nov 2026.

// The field that caused this says what it is. Task 3.7 deleted the form. The three numbers are three rows of the Business
// page, each edited where it is stated, drawn and pressed in
// receptionist/business-tab/page/the-facts-and-one-value-edited-where-stated.test.mjs: the number customers are told to
// call, a choice of "Your number" or "A different number" with the line first; the line AI answers on, Connections' to
// own (its press goes to admin/integrations); the handoff number, a row of its own; and a serious disagreement said on
// the row it is about, with no banner. Absent means the line, so clearing the box removes the key: the row's patch, run
// there too. Pinned as who.tsx's text until 26 Nov 2026.

test("Setup stops saying ready while a customer-facing fact is wrong", async () => {
  const { setupSteps } = await import("@chanlytics/contracts");
  const base = {
    business: {
      name: "Marisa's Beauty Salon",
      hours: true,
      services: 33,
      booking_link: true,
      address: true,
      handoff: "+12125550142",
      broken: false,
    },
    channels: {
      whatsapp: { present: true, active: true, number: "+13055550188", quality: "GREEN", last_inbound_at: null },
      voice: { present: true, active: true, number: "+13055550123", last_inbound_at: null },
    },
    templates: { approved: 6, pending: 0, starters_approved: 5 },
    calendar: { state: "ok" },
    team: { members: 3, invites_open: 0, alert_emails: 1 },
    consent: { yes: 0 },
    requests: { line: null },
    lines: { rows: [], costs: { local_number_month_usd: 1.15 }, ready: true },
    later: [],
  };

  // Every field filled in. Before this, that was the whole test of "ready".
  const clean = setupSteps({ ...base, conflicts: [] });
  const cleanFacts = clean.rows.find((r) => r.id === "facts");
  assert.equal(cleanFacts.state, "ready");
  assert.match(clean.readiness.sentence, /answers calls on/);

  // The same workspace, with the disagreement the resolver finds on it.
  const conflicts = factConflicts(
    resolveFacts(
      {
        business_name: "Marisa's Beauty Salon",
        phone_display: "(212) 555-0142",
        profile: { handoff_number: "+12125550142" },
      },
      { channels: [{ kind: "voice", number_e164: "+13055550123", status: "active" }] },
    ),
  );
  assert.equal(conflicts.length, 1);

  const flagged = setupSteps({ ...base, conflicts });
  const factsRow = flagged.rows.find((r) => r.id === "facts");
  assert.equal(factsRow.state, "waiting_you", "filled in is not the same as right");
  assert.match(
    factsRow.sentence,
    /the number it transfers to/,
    "and it borrows the resolver's sentence, which knows why",
  );
  assert.equal(factsRow.verb.label, "Fix it in Business");
  // "Answering" and "answering correctly" are different claims.
  assert.match(flagged.readiness.sentence, /never AI on \+1 \(305\) 555-0123/);
  assert.ok(flagged.done < clean.done, "and the count of what is ready goes down, which is the point");
});

test("every voice line a caller hears comes through the resolver too", async () => {
  // The refusal scripts and the delivery-failure line are spoken to a caller
  // who is waiting, and both read brain.phone_display straight from the
  // document -- so on the live salon, a caller who could not be texted was
  // told to ring the transfer number instead of the receptionist. The voice
  // path is run in retell-fn-door.test.mjs: a hold and a failed delivery each
  // name the number the resolver publishes, and with none to give, each says
  // something true instead.

  // Optional means a workspace can have none, and a receptionist reading
  // "reach the team on undefined" to a caller is worse than offering nothing.
  const { refusalScript } = await importSrc("packages/core/src/messages/outbound-gate.ts");
  for (const none of [null, undefined]) {
    const said = refusalScript("policy_hold", none);
    assert.doesNotMatch(said, /undefined|null|reach the team on/, `the script takes an absent number (${none})`);
    assert.match(said, /without reading out its address, and take their name\.$/, "and says something true instead");
  }
});

test("a config change records who and what, and neither is the values", async () => {
  const { changedConfigFields } = await import("@chanlytics/contracts");
  const before = {
    brain: {
      business_name: "A",
      booking_link: "https://x",
      profile: { address: "1 St", services: [{ name: "Cut" }], hours: { mon: {} } },
    },
  };
  const after = {
    brain: {
      business_name: "A",
      booking_link: "https://y",
      profile: { address: "2 Ave", services: [{ name: "Cut" }], hours: { mon: {} } },
    },
  };

  // Profile keys are named individually: "profile changed" is true of nearly
  // every save and tells nobody anything.
  assert.deepEqual(changedConfigFields(before, after), ["address", "booking_link"]);
  assert.deepEqual(changedConfigFields(before, before), [], "a save that changed nothing writes no event");
  assert.deepEqual(
    changedConfigFields(null, after).sort(),
    ["address", "booking_link", "business_name", "hours", "services"],
    "a first write names everything it set",
  );
  // The other sections are one key each: the feed address and the alert
  // addresses are values, so only the section is named.
  const withFeed = { ...after, calendar: { ical_url: "https://cal.example/private/abc.ics" } };
  assert.deepEqual(
    changedConfigFields(after, withFeed),
    ["calendar"],
    "swapping the calendar feed leaves a trace, without the address",
  );
  assert.deepEqual(
    changedConfigFields(withFeed, {
      ...withFeed,
      notifications: { escalation_emails: ["owner@example.com"] },
      features: { reviews: true },
    }).sort(),
    ["features", "notifications"],
  );
  assert.deepEqual(changedConfigFields(withFeed, withFeed), []);
  // The change lands in the ledger every other consequential act does, and the config row records its author:
  // settings-routes.test.mjs runs the PUT and reads both rows it wrote (its fields, its author and its version, and
  // never the business's own words), and first-receptionist.test.mjs the first receptionist's.

  // A member's save is recorded as theirs on the stack (workspace/config/the-feed-address-is-the-owner-s.db.test.mjs,
  // through tenant_config_write); pinned as 00085's text until 26 Nov 2026.
});

// The editor is four steps, and the days sit beside the hours they qualify. Fourteen headings in a row, in an order
// nobody chose: the weekly grid was four sections above the days it does not apply to, with the services and the
// calendar feed in between. Task 3.7 deleted that form; since 17 Oct 2026 the record is three pages, Details (Who you
// are, What you offer), Hours & booking (When you're open, Booking) and How it answers (How it talks, What it knows).
// The cards are drawn in that order, the record's three pages in turn, and the rows of When you're open in theirs:
// receptionist/business-tab/open/hours-the-zone-and-closed-days.test.mjs, where tab.tsx's text was read here until
// 26 Nov 2026.

test("languages is one control, not a grid plus a second control", () => {
  // The fourteen languages shouting, two of them chosen, went with the form (Task 3.7). The languages are one fold of
  // the Business page: the chosen ones as tokens, each with its remove, and ONE box to add another, over the common
  // ones as an offer rather than a wall. receptionist/business-tab/answers/ draws it and adds, removes and caps it.
  // Drawn and pressed in receptionist/business-tab/answers/the-voice-the-languages-and-the-rules.test.mjs: a token field,
  // added from the list or as typed, removed with its Undo, and Backspace in the empty box gives the last one back.
  // Pinned as answers-fields.tsx's text until 26 Nov 2026.
});
