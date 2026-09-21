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
import { importSrc, readCode, readRaw } from "./_source.mjs";

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

  // The eval and the steer doors passing what the platform knows -- the
  // provisioned line spoken in their prompts -- are run in eval-door.test.mjs
  // and steer-door.test.mjs.
  for (const [file, call] of [
    ["apps/edge/lib/whatsapp/inbound.ts", "rt?.known"],
    ["apps/edge/lib/call-start.ts", "rt.known"],
  ]) {
    const src = readCode(file);
    assert.ok(src.includes(call + ")"), `${file} passes what the platform knows`);
  }

  // The server resolves, because it is where the channel rows and the listing
  // are; the browser only ever had a listing DTO with no address on it.
  const route = readCode("apps/dashboard/app/api/v1/settings/route.ts");
  assert.ok(route.includes("resolveFacts(cfg.brain ?? null, known)") && route.includes("conflicts: factConflicts(facts)"), "the settings read carries both");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes("w.__FACTS = cfg.configBroken ? null : { facts: cfg.facts, conflicts: cfg.conflicts };"), "and publishes them once");
});

test("the field that caused this says what it is", () => {
  const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(!/set-ident-key">Phone line</.test(pane), "REGRESSION: the editor called it the same thing as the line it answers");
  assert.ok(pane.includes('<span className="set-ident-key">Tell customers to call</span>'), "it is what goes in the words");
  // And not a text box at all any more: the line is the default, and publishing
  // anything else is a deliberate act with a reason shown under it.
  assert.ok(pane.includes('data-testid="set-pub-line"') && pane.includes('data-testid="set-pub-other"'), "two options, the line first");
  assert.ok(pane.includes('phone_display: phone || undefined,'), "and choosing the line writes nothing, so it follows the line");

  // Three numbers, three names, and only the provisioned one links away. The
  // two the receptionist DECIDES are edited in the row that states them: they
  // were sections nine and thirteen of a fourteen-section form, a page apart
  // from each other and from the card that reads them.
  assert.ok(pane.includes('<FactRow label="Answers on" fact={F.voice_line} to="admin/integrations"'), "the line is Connections' to own");
  assert.ok(pane.includes('<PublishedNumberRow fact={F.phone_display} flash={flash} />'));
  assert.ok(pane.includes('<HandoffRow fact={F.handoff_number} flash={flash} />'));
  // One key, on top of what is stored -- PUT /settings is a whole-config CAS,
  // and a fragment would delete the rest.
  assert.ok(pane.includes("function useFieldSave(flash)") && pane.includes("window.__saveSettings(next, settings.version"));
  assert.ok(pane.includes("if (value) brain.phone_display = value; else delete brain.phone_display;"), "absent means the line, so clearing it removes the key");
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
  const { refusalScript } = await importSrc("apps/edge/lib/outbound-gate.ts");
  for (const none of [null, undefined]) {
    const said = refusalScript("policy_hold", none);
    assert.doesNotMatch(said, /undefined|null|reach the team on/, `the script takes an absent number (${none})`);
    assert.match(said, /book online, and take their name\.$/, "and says something true instead");
  }
});

test("a config change records who and what, and neither is the values", async () => {
  const { changedConfigFields } = await import("@chanlytics/contracts");
  const before = { brain: { business_name: "A", booking_link: "https://x", profile: { address: "1 St", services: [{ name: "Cut" }], hours: { mon: {} } } } };
  const after = { brain: { business_name: "A", booking_link: "https://y", profile: { address: "2 Ave", services: [{ name: "Cut" }], hours: { mon: {} } } } };

  // Profile keys are named individually: "profile changed" is true of nearly
  // every save and tells nobody anything.
  assert.deepEqual(changedConfigFields(before, after), ["address", "booking_link"]);
  assert.deepEqual(changedConfigFields(before, before), [], "a save that changed nothing writes no event");
  assert.deepEqual(changedConfigFields(null, after).sort(), ["address", "booking_link", "business_name", "hours", "services"], "a first write names everything it set");
  // The other sections are one key each: the feed address and the alert
  // addresses are values, so only the section is named.
  const withFeed = { ...after, calendar: { ical_url: "https://cal.example/private/abc.ics" } };
  assert.deepEqual(changedConfigFields(after, withFeed), ["calendar"], "swapping the calendar feed leaves a trace, without the address");
  assert.deepEqual(changedConfigFields(withFeed, { ...withFeed, notifications: { escalation_emails: ["owner@example.com"] }, features: { reviews: true } }).sort(), ["features", "notifications"]);
  assert.deepEqual(changedConfigFields(withFeed, withFeed), []);
  const { lastChangedWords, agoWords } = await import("@chanlytics/contracts");
  const now = Date.parse("2026-09-11T12:00:00Z");
  const at = "2026-09-09T12:00:00Z";
  assert.equal(lastChangedWords(at, "Ada", now), `Last changed by Ada, ${agoWords(Date.parse(at), now)}`);
  assert.equal(lastChangedWords(at, null, now), `Last changed ${agoWords(Date.parse(at), now)}, before we kept track of who`);
  assert.equal(lastChangedWords(null, "Ada", now), "", "no stamp, nothing said");

  const route = readCode("apps/dashboard/app/api/v1/settings/route.ts");
  assert.ok(route.includes('kind: "settings.changed"'), "the change lands in the ledger every other consequential act does");
  assert.ok(route.includes("data: { fields, by: ctx.userId, version: result.row.version, ...(ctx.via ? { via: ctx.via } : {}) },"), "fields and author, never the values; a card's mark when a card was tapped");
  assert.ok(!/data: \{[^}]*config/.test(route), "REGRESSION: an audit row must not copy the business's own words into a second place");
  assert.ok(route.includes("putTenantConfig(ctx.supabase, member.tenantId, parsed.data as Json, body.version, ctx.userId)"), "and the row itself records its author");

  const mig = readRaw("supabase/migrations/00085_config_audit.sql");
  assert.ok(mig.includes("add column if not exists updated_by uuid references auth.users (id) on delete set null"), "nullable, because rows written before this had no author to record");
  assert.ok(mig.includes("grant update (updated_by) on public.tenant_config to authenticated"), "and the column needs its own door, or the UPDATE writes nothing");
});

test("the editor is four steps, and the days sit beside the hours they qualify", () => {
  const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  const groups = [...pane.matchAll(/className="set-group-name">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(groups, ["Your business", "When you are open", "What you offer", "How it answers"]);

  // Fourteen headings in a row, in an order nobody chose: the weekly grid was
  // four sections above the days it does not apply to, with the services and
  // the calendar feed in between.
  const order = [...pane.matchAll(/title="([^"]+)"/g)].map((m) => m[1]);
  const at = (t) => order.indexOf(t);
  assert.equal(at("Days you are closed"), at("When you are open") + 1, "the closures follow the hours");
  assert.ok(at("Where you are") < at("When you are open"), "who and where, then when");
  assert.ok(at("Languages") > at("Booking rules"), "and how it answers comes last, after what it answers about");
});

test("languages is one control, not a grid plus a second control", () => {
  const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(pane.includes('data-testid="set-langs"') && pane.includes("set-token-input"), "a token field");
  assert.ok(!/className={`set-chip \$\{langs\.includes/.test(pane), "REGRESSION: fourteen languages shouting, two of them chosen");
  assert.ok(!pane.includes('placeholder="Another language"'), "and no second field underneath to add a fifteenth");
  // The common ones are an OFFER, shown only while there is room to consider
  // them — not a wall that has to be read before the field can be used.
  assert.ok(pane.includes("SET_LANGS.filter((l) => !langs.includes(l)).slice(0, 6)"), "at most six suggestions, and only unchosen ones");
  assert.ok(pane.includes('ev.key === "Backspace" && !langAdd && langs.length'), "backspace takes the last one back, as every token field does");
});
