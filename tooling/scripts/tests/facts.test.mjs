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
import { resolveFacts, factConflicts, samePhone, sameAddress, sameName, SOURCE_WORDS } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

/** Melany's Beauty Salon, exactly as the database held it. */
const LIVE = {
  typed: {
    business_name: "Melany's Beauty Salon",
    phone_display: "(646) 932-5775",
    booking_link: "https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn",
    profile: {
      address: "2581 Pitkin Ave, Brooklyn, NY 11208",
      website: "https://melanysbeautysalon.com",
      handoff_number: "+16469325775",
    },
  },
  known: {
    workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York" },
    channels: [
      { kind: "whatsapp", number_e164: "+19177724072", status: "active" },
      { kind: "voice", number_e164: "+13083368109", status: "active" },
    ],
    listing: { name: "Melany's Beauty Salon", address: "2581 Pitkin Ave, Brooklyn, NY 11208, USA" },
  },
};

test("the live workspace: the published number is the transfer number, and that is now sayable", () => {
  const f = resolveFacts(LIVE.typed, LIVE.known);

  // What it answers on is provisioned and never typed.
  assert.deepEqual(f.voice_line, { value: "+13083368109", source: "provisioned" });
  assert.deepEqual(f.whatsapp_line, { value: "+19177724072", source: "provisioned" });

  // What it SAYS is still what was typed — changing that silently would be a
  // worse bug than the one being fixed — but the disagreement is on the record.
  assert.equal(f.phone_display.value, "(646) 932-5775");
  assert.equal(f.phone_display.source, "typed");
  assert.deepEqual(f.phone_display.disputed, { value: "+1 (308) 336-8109", source: "provisioned" });

  const [worst] = factConflicts(f);
  assert.equal(worst.fact, "phone_display");
  assert.equal(worst.severity, "serious");
  // It knows the published number IS the transfer number, so it says the thing
  // that is actually true rather than a generic mismatch warning.
  assert.match(worst.sentence, /the number it transfers to/);
  assert.match(worst.sentence, /never the receptionist answering on \+1 \(308\) 336-8109/);
  assert.equal(worst.to, "admin/workspace");
});

test("Google's country suffix is not a disagreement", () => {
  const f = resolveFacts(LIVE.typed, LIVE.known);
  // "2581 Pitkin Ave, Brooklyn, NY 11208" vs "…, USA". Reporting that trains
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

test("no typed value falls back to what the platform knows", () => {
  const f = resolveFacts({ business_name: "Melany’s Beauty Salon", profile: {} }, LIVE.known);
  assert.deepEqual(f.phone_display, { value: "+1 (308) 336-8109", source: "provisioned" }, "formatted for speech: a prompt saying +13083368109 is a receptionist reading digits aloud");
  assert.equal(f.address.value, "2581 Pitkin Ave, Brooklyn, NY 11208, USA");
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
  const f = resolveFacts({ profile: {} }, { channels: [{ kind: "voice", number_e164: "+13083368109", status: "disabled" }] });
  assert.equal(f.voice_line.value, null, "a switched-off line answers nothing, so it claims nothing");
  assert.equal(f.phone_display.source, "absent");
});

test("the same number written two ways is one fact", () => {
  assert.ok(samePhone("(646) 932-5775", "+16469325775"));
  assert.ok(samePhone("646-932-5775", "16469325775"));
  assert.ok(!samePhone("+16469325775", "+13083368109"));
  assert.ok(!samePhone("", "+16469325775"), "nothing is not a match");
  // Resolution uses it, so a workspace that typed its own line in a friendly
  // format must not be accused of a conflict.
  const f = resolveFacts({ phone_display: "(308) 336-8109", profile: {} }, LIVE.known);
  assert.equal(f.phone_display.disputed, undefined);
  assert.deepEqual(factConflicts(f), []);
});

test("addresses and names compare on what they mean, not how they are punctuated", () => {
  assert.ok(sameAddress("2581 Pitkin Ave, Brooklyn, NY 11208", "2581 Pitkin Ave, Brooklyn, NY 11208, USA"));
  assert.ok(!sameAddress("2581 Pitkin Ave", "99 Nowhere Rd"));
  assert.ok(sameName("Melany's Beauty Salon", "Melanys Beauty Salon"));
  assert.ok(!sameName("Melany's", "Someone Else"));
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
  assert.ok(cfg.includes("return composeSystemPrompt(resolved, carried, channel, tz, now, policy);"), "and composes from the resolved values, not the raw document");

  const rt = readCode("apps/edge/lib/tenant-runtime.ts");
  assert.ok(rt.includes("known: KnownFacts;"), "the edge runtime carries what the platform knows");
  assert.ok(rt.includes('db.from("tenant_channels").select("kind, number_e164, status")'), "loaded with the config, behind the same stamp");
  assert.ok(rt.includes("known: { workspace: null, channels: [], listing: null },"), "and a failed load is empty, never a guess");

  for (const [file, call] of [
    ["apps/edge/lib/whatsapp/inbound.ts", "rt?.known"],
    ["apps/edge/api/retell-inbound.ts", "rt.known"],
    ["apps/edge/api/admin/eval.ts", "rt.known"],
    ["apps/edge/api/admin/steer.ts", "rt.known"],
  ]) {
    const src = readCode(file);
    assert.ok(src.includes(call + ")"), `${file} passes what the platform knows`);
  }

  // The server resolves, because it is where the channel rows and the listing
  // are; the browser only ever had a listing DTO with no address on it.
  const route = readCode("apps/dashboard/app/api/v1/settings/route.ts");
  assert.ok(route.includes("resolveFacts(cfg.brain ?? null, known)") && route.includes("conflicts: factConflicts(facts)"), "the settings read carries both");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes("w.__FACTS = cfg.facts"), "and publishes them once");
});

test("the field that caused this says what it is", () => {
  const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(!/set-ident-key">Phone line</.test(pane), "REGRESSION: the editor called it the same thing as the line it answers");
  assert.ok(pane.includes('<span className="set-ident-key">Tell customers to call</span>'), "it is what goes in the words");
  // And not a text box at all any more: the line is the default, and publishing
  // anything else is a deliberate act with a reason shown under it.
  assert.ok(pane.includes('data-testid="set-pub-line"') && pane.includes('data-testid="set-pub-other"'), "two options, the line first");
  assert.ok(pane.includes('phone_display: phone || undefined,'), "and choosing the line writes nothing, so it follows the line");

  // Three numbers, three names, and only the provisioned one links away.
  assert.ok(pane.includes('<FactRow label="Answers on" fact={F.voice_line} to="admin/integrations"'), "the line is Integrations' to own");
  assert.ok(pane.includes('<FactRow label="Tells customers to call" fact={F.phone_display} />'));
  assert.ok(pane.includes('<FactRow label="Transfers a caller to" fact={F.handoff_number}'));
  assert.ok(pane.includes("<FactConflicts />"), "and a serious disagreement is said out loud, not left in a document");
});

test("Setup stops saying ready while a customer-facing fact is wrong", async () => {
  const { setupSteps } = await import("@chanlytics/contracts");
  const base = {
    business: { name: "Melany's Beauty Salon", hours: true, services: 33, bookingLink: true, address: true, handoff: "+16469325775", broken: false },
    channels: {
      whatsapp: { present: true, active: true, number: "+19177724072", quality: "GREEN", lastInboundAt: null },
      voice: { present: true, active: true, number: "+13083368109", lastInboundAt: null },
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
  const conflicts = factConflicts(resolveFacts(
    { business_name: "Melany's Beauty Salon", phone_display: "(646) 932-5775", profile: { handoff_number: "+16469325775" } },
    { channels: [{ kind: "voice", number_e164: "+13083368109", status: "active" }] },
  ));
  assert.equal(conflicts.length, 1);

  const flagged = setupSteps({ ...base, conflicts });
  const factsRow = flagged.rows.find((r) => r.id === "facts");
  assert.equal(factsRow.state, "waiting_you", "filled in is not the same as right");
  assert.match(factsRow.sentence, /the number it transfers to/, "and it borrows the resolver's sentence, which knows why");
  assert.equal(factsRow.verb.label, "Fix it in Business");
  // "Answering" and "answering correctly" are different claims.
  assert.match(flagged.readiness.sentence, /never the receptionist answering on \+1 \(308\) 336-8109/);
  assert.ok(flagged.done < clean.done, "and the count of what is ready goes down, which is the point");
});
