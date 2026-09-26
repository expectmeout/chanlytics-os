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
import { importSrc, readCode, readRaw } from "./_source.mjs";

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
  assert.match(worst.sentence, /never the receptionist answering on \+1 \(305\) 555-0123/);
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

test("F1: a transfer number that forwards back to the receptionist is a loop, said on the transfer row", () => {
  // Stored before the transfer row refused it (phone.ts whyNotAHandoff): the kept number as the transfer number too.
  const f = resolveFacts(
    { ...HARBOR.typed, profile: { handoff_number: KEPT } },
    { ...HARBOR.known, forwarding: [{ from_e164: KEPT, to_e164: LINE }] },
  );
  assert.equal(f.phone_display.disputed, undefined, "publishing the kept number is still right");
  const conflicts = factConflicts(f);
  assert.deepEqual(
    conflicts.map((c) => [c.fact, c.severity, c.known, c.knownSource, c.to]),
    [["handoff_number", "serious", "+1 (212) 555-0142", "provisioned", "admin/workspace"]],
  );
  assert.match(conflicts[0].sentence, /through to \+1 \(212\) 555-0142, which forwards the calls nobody picks up back/);
  assert.match(conflicts[0].sentence, /they would come straight back/);

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

test("the resolver is the ONE place facts are decided, on every surface that states them", () => {
  // A resolver nothing calls is a comment. These are the four places a fact
  // reaches a customer or an owner, and each has to go through it.
  const cfg = readRaw("packages/contracts/src/config.ts");
  assert.ok(cfg.includes("const facts = resolveFacts(brain, known);"), "the prompt resolves before it speaks");
  assert.ok(
    cfg.includes("return composeSystemPrompt(resolved, carried, channel, tz, now, policy);"),
    "and composes from the resolved values, not the raw document",
  );

  const rt = readCode("apps/edge/lib/tenant-runtime.ts");
  assert.ok(rt.includes("known: KnownFacts;"), "the edge runtime carries what the platform knows");
  assert.ok(
    rt.includes('db.from("tenant_channels").select("kind, number_e164, status")'),
    "loaded with the config, behind the same stamp",
  );
  assert.ok(
    rt.includes("known: { workspace: null, channels: [], listing: null },"),
    "and a failed load is empty, never a guess",
  );

  // The eval and the steer doors passing what the platform knows -- the
  // provisioned line spoken in their prompts -- are run in eval-door.test.mjs
  // and steer-door.test.mjs.
  for (const [file, call] of [
    ["packages/core/src/inbound/answer.ts", "rt?.known"],
    ["apps/edge/lib/voice/call-start.ts", "rt.known"],
  ]) {
    const src = readCode(file);
    assert.ok(src.includes(call + ")"), `${file} passes what the platform knows`);
  }

  // The server resolves, because it is where the channel rows and the listing
  // are; the browser only ever had a listing DTO with no address on it.
  const route = readCode("apps/dashboard/app/api/v1/settings/route.ts");
  assert.ok(
    route.includes("resolveFacts(cfg.brain ?? null, known)") && route.includes("conflicts: factConflicts(facts)"),
    "the settings read carries both",
  );
  assert.ok(
    readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes(
      "w.__FACTS = cfg.configBroken ? null : { facts: cfg.facts, conflicts: cfg.conflicts };",
    ),
    "and publishes them once",
  );
});

test("the field that caused this says what it is", () => {
  // Task 3.7 deleted the form. The three numbers are three rows of the Business page, each edited where it is stated
  // (business-tab-who.jsx); business-tab-page.test.mjs draws and presses every one of them.
  const pane = readRaw("apps/dashboard/src/legacy/pages/business-tab-who.jsx");
  assert.ok(!/label="Phone line"/.test(pane), "REGRESSION: the editor called it the same thing as the line it answers");
  assert.ok(pane.includes('label="Tells customers to call"'), "it is what goes in the words");
  // And not a text box at all any more: the line is the default, and publishing
  // anything else is a deliberate act with a reason shown under it.
  assert.ok(
    pane.includes('{ value: "line", label: "Your line" }, { value: "other", label: "A different number" }'),
    "two options, the line first",
  );

  // Three numbers, three names, and only the provisioned one links away. The
  // two the receptionist DECIDES are edited in the row that states them: they
  // were sections nine and thirteen of a fourteen-section form, a page apart
  // from each other and from the card that reads them.
  assert.ok(
    pane.includes('window.CHANLY.nav("admin/integrations")') && pane.includes('label="Answers on"'),
    "the line is Connections' to own",
  );
  assert.ok(
    pane.includes('id="phone_display"') && pane.includes('id="handoff_number"'),
    "and the two the receptionist decides are rows of their own",
  );
  // One key, on top of what is stored -- PUT /settings is a whole-config CAS,
  // and a fragment would delete the rest. The save itself moved to
  // pages/business-tab-save.jsx with the Business tab (Task 3.2); these rows
  // take it from window, settings-honest.test.mjs presses them, and
  // business-tab-page.test.mjs runs the save when it fails.
  // Absent means the line, so clearing the box removes the key: the row's patch, run in business-tab-page.test.mjs.
  assert.ok(
    pane.includes('btDispute(pub, btConflictOn("phone_display")'),
    "and a serious disagreement is said out loud, on the row it is about",
  );
});

test("Setup stops saying ready while a customer-facing fact is wrong", async () => {
  const { setupSteps } = await import("@chanlytics/contracts");
  const base = {
    business: {
      name: "Marisa's Beauty Salon",
      hours: true,
      services: 33,
      bookingLink: true,
      address: true,
      handoff: "+12125550142",
      broken: false,
    },
    channels: {
      whatsapp: { present: true, active: true, number: "+13055550188", quality: "GREEN", lastInboundAt: null },
      voice: { present: true, active: true, number: "+13055550123", lastInboundAt: null },
    },
    templates: { approved: 6, pending: 0, startersApproved: 5 },
    calendar: { state: "ok" },
    team: { members: 3, invitesOpen: 0, alertEmails: 1 },
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
  assert.match(flagged.readiness.sentence, /never the receptionist answering on \+1 \(305\) 555-0123/);
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
  const { refusalScript } = await importSrc("apps/edge/lib/receptionist/outbound-gate.ts");
  for (const none of [null, undefined]) {
    const said = refusalScript("policy_hold", none);
    assert.doesNotMatch(said, /undefined|null|reach the team on/, `the script takes an absent number (${none})`);
    assert.match(said, /book online, and take their name\.$/, "and says something true instead");
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

  const mig = readRaw("supabase/migrations/00085_config_audit.sql");
  assert.ok(
    mig.includes("add column if not exists updated_by uuid references auth.users (id) on delete set null"),
    "nullable, because rows written before this had no author to record",
  );
  assert.ok(
    mig.includes("grant update (updated_by) on public.tenant_config to authenticated"),
    "and the column needs its own door, or the UPDATE writes nothing",
  );
});

test("the editor is four steps, and the days sit beside the hours they qualify", () => {
  // Fourteen headings in a row, in an order nobody chose: the weekly grid was four sections above the days it does
  // not apply to, with the services and the calendar feed in between. Task 3.7 deleted that form; the four steps are
  // the four cards of the Business page, in this order, and what each one draws is EXECUTED in its own test file
  // (business-tab-open.test.mjs asserts the cards in order, and the four rows of When you are open in theirs).
  const page = readRaw("apps/dashboard/src/legacy/pages/business-tab.jsx");
  const cards = [...page.matchAll(/window\.(Bt(?:Who|Open|Offer|Answers))Card \?/g)].map((m) => m[1]);
  assert.deepEqual(cards, ["BtWho", "BtOpen", "BtOffer", "BtAnswers"]);
});

test("languages is one control, not a grid plus a second control", () => {
  // The fourteen languages shouting, two of them chosen, went with the form (Task 3.7). The languages are one fold of
  // the Business page: the chosen ones as tokens, each with its remove, and ONE box to add another, over the common
  // ones as an offer rather than a wall. business-tab-answers.test.mjs draws it and adds, removes and caps it.
  const pane = readRaw("apps/dashboard/src/legacy/pages/business-tab-answers.jsx");
  assert.ok(pane.includes('data-testid="rec-languages"') && pane.includes("window.RecordCombobox"), "a token field");
  assert.ok(!/set-chip/.test(pane), "REGRESSION: fourteen languages shouting, two of them chosen");
  assert.ok(!pane.includes('placeholder="Another language"'), "and no second field underneath to add a fifteenth");
  assert.ok(
    pane.includes('e.key === "Backspace" && e.target && e.target.value === "" && chosen.length'),
    "backspace takes the last one back, as every token field does",
  );
});
