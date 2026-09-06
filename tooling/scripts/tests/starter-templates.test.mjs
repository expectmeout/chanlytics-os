/**
 * The starter set: five templates written for the moments Chanlytics acts
 * on, in English and Spanish. Every one passes the check a template written
 * by hand passes, with no warnings, so what a new workspace gets is a set
 * WhatsApp is expected to approve. Titles for people, names for the wire;
 * the slots known, the playbooks matched; one idempotent door adds the set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAYBOOK_TRIGGERS, STARTER_LANGUAGES, STARTER_TEMPLATES,
  defaultParamSpecs, defaultSlotKinds, guessSlotKind, starterByKey, starterByName, starterDraft, starterForTrigger, starterPreview, templateTitle, validateTemplateDraft,
} from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

test("five starters, each in English and Spanish, each passing the hand-written check with no warnings", () => {
  assert.deepEqual(STARTER_TEMPLATES.map((s) => s.key), ["winback_offer", "welcome_new", "save_our_number", "monthly_offer", "quick_note"]);
  assert.deepEqual(STARTER_LANGUAGES.map((l) => l.id), ["en_US", "es"]);
  for (const s of STARTER_TEMPLATES) {
    assert.equal(s.name, s.key, "the name is the key");
    assert.ok(/^[a-z0-9_]+$/.test(s.name), "a name Meta accepts");
    for (const l of STARTER_LANGUAGES) {
      const check = validateTemplateDraft(starterDraft(s, l.id));
      assert.equal(check.ok, true, `${s.key}/${l.id}: ${check.ok ? "" : check.error}`);
      assert.deepEqual(check.warnings, [], `${s.key}/${l.id} warns: ${check.warnings.join(" | ")}`);
      assert.equal(check.value.name, s.name);
      assert.ok(check.value.footer && /STOP/.test(check.value.footer), "every starter says how to stop");
      const t = s.texts[l.id];
      assert.equal(t.slots.length, check.value.examples.length);
      assert.ok(t.slots.some((x) => x.kind === "first_name") && t.slots.some((x) => x.kind === "business_name"), "a first name and the business's name, every time");
    }
    const en = s.texts.en_US.slots.map((x) => x.kind);
    const es = s.texts.es.slots.map((x) => x.kind);
    assert.deepEqual(en, es, `${s.key}: the same slots in both languages, in the same order`);
  }
});

test("one starter per playbook trigger, one for any broadcast; titles for people, names for the wire", () => {
  for (const t of PLAYBOOK_TRIGGERS) {
    const s = starterForTrigger(t.id);
    assert.ok(s, `${t.id} has a starter`);
    assert.equal(s.trigger, t.id);
  }
  assert.equal(starterForTrigger(null)?.key, undefined, "the quick note is for broadcasts, not a trigger");
  assert.equal(starterByKey("quick_note").trigger, null);
  assert.equal(starterByName("winback_offer").title, "Win-back");
  assert.equal(starterByName("nope"), null);
  assert.equal(templateTitle("winback_offer"), "Win-back");
  assert.equal(templateTitle("approval_confirmation"), "Approval confirmation");
  assert.equal(templateTitle("booking_link_v1"), "Booking link v1");
  assert.equal(templateTitle(""), "");
  assert.equal(starterPreview(starterByKey("winback_offer"), "en_US", "Melany's Beauty Salon"), "Hi Dani, it's been a while since we last saw you at Melany's Beauty Salon. We'd love to have you back — pick a time that suits you here: https://booksy.com/luna-studio and we'll take care of the rest.");
  assert.ok(starterPreview(starterByKey("quick_note"), "es").startsWith("Hola Dani, una nota rápida de Luna Studio:"));
  assert.ok(starterPreview(starterByKey("quick_note"), "pt_BR").startsWith("Hi Dani"), "a language not written falls back to English");
});

test("a slot's source: a starter's own, or a guess from the label and the example a template written elsewhere carries", () => {
  assert.equal(guessSlotKind("Booking link", null), "booking_link");
  assert.equal(guessSlotKind("Value 2", "https://booksy.com/x"), "booking_link");
  assert.equal(guessSlotKind("Business name", null), "business_name");
  assert.equal(guessSlotKind("First name", null), "first_name");
  assert.equal(guessSlotKind("Name", null), "first_name");
  assert.equal(guessSlotKind("Value 1", "Dani"), "text", "a bare value with a name-like example is still a guess we do not make");
  assert.equal(guessSlotKind("The offer", "20% off"), "text");
  assert.deepEqual(defaultSlotKinds({ name: "monthly_offer", variables: [{ position: 1 }, { position: 2 }, { position: 3 }, { position: 4 }] }), ["first_name", "business_name", "text", "booking_link"]);
  assert.deepEqual(defaultSlotKinds({ name: "booking_link_v1", variables: [{ position: 1, label: "Business name", example: "Melany's" }, { position: 2, label: "Booking link", example: "booksy.com/melanys" }] }), ["business_name", "booking_link"]);
  assert.deepEqual(defaultSlotKinds({ name: "hello_world", variables: [] }), []);
  assert.deepEqual(defaultParamSpecs({ name: "quick_note", variables: [1, 2, 3] }), [{ kind: "first_name" }, { kind: "business_name" }, { kind: "text", value: "" }]);
});

test("the door: idempotent, one language at a time, synced in when the number's account already holds it, Meta's own words when it refuses", () => {
  const r = readCode("apps/dashboard/app/api/v1/templates/starter/route.ts");
  assert.ok(r.includes('requireRole(member, "operator")') && r.includes('takeRate(ctx.userId, "settings")'));
  assert.ok(r.includes('results.push({ ...base, status: "exists", meta_status: have.meta_status });'), "already on file is left alone");
  assert.ok(r.includes("const check = validateTemplateDraft(starterDraft(s, l));"), "the same check a hand-written template passes");
  assert.ok(r.includes('if (r.reason === "meta_refused" && ALREADY_AT_META.test(r.detail ?? "")) {') && r.includes("await syncTemplates(member.tenantId);"), "a shared account's copy is synced in, not refused");
  assert.ok(r.includes('results.push({ ...base, status: "submitted", meta_status: r.metaStatus });'));
  assert.ok(r.includes("Pick at least one starter template, in English or Spanish."));
  const b = readCode("apps/dashboard/src/legacy-bridge/templates.ts");
  assert.ok(b.includes('addStarters: (body: StarterBody) => call<StarterData>("/api/v1/templates/starter", "POST", body, true)'), "the verb refreshes every surface that shows templates");
  assert.ok(b.includes("window.__starters = {") && b.includes("title: templateTitle") && b.includes("slotKinds: defaultSlotKinds"), "the library reaches the pages");
  assert.ok(b.includes("__refreshPlaybooks"), "the playbook composer learns of a newly added starter");
});

test("the pages: titles not names, the starter set in Settings, one click on Broadcasts, the trigger's starter picked for a playbook, the message as the customer sees it", () => {
  const s = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  for (const id of ["starters", "starter-row", "starter-add", "starter-add-all"]) assert.ok(s.includes(`data-testid="${id}"`), id);
  assert.ok(s.includes("{tplTitle(t.name)}") && s.includes('" · made here"'), "a title, with the raw name beside it");
  const b = readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
  assert.ok(b.includes('data-testid="bc-add-starters"') && b.includes("{bcTitle(t.name)}"));
  assert.ok(b.includes("const srcOf = (i) => ((sources[tplId] || defaults)[i] || \"text\");"), "a starter's slots come filled in");
  assert.ok(b.includes("<window.WaBubble") && b.includes('data-testid="bc-preview"'), "the preview is the message as the customer sees it");
  assert.ok(!b.includes('<span className="bc-row-label">Template</span>'), "the row label fits");
  const p = readCode("apps/dashboard/src/legacy/pages/outbound-real.jsx");
  assert.ok(p.includes('data-testid="pb-starter"') && p.includes('data-testid="pb-add-starter"'));
  assert.ok(p.includes("window.__starters.forTrigger(trigger)") && p.includes("if (starterRow) setTplId(starterRow.id);"), "the trigger's starter is picked for you");
  assert.ok(p.includes("{pbTitle(t.name)}") && p.includes("<window.WaBubble"));
  const t = readCode("apps/dashboard/src/legacy/pages/templates-real.jsx");
  assert.ok(t.includes('data-testid="tpl-start-from"') && t.includes("window.WaBubble = WaBubble;") && t.includes("window.starterWords = starterWords;"));
  const css = readCode("apps/dashboard/src/legacy/styles/components.css");
  assert.ok(css.includes(".wa-bubble {") && css.includes(".tpl-starter-row {"));
});
