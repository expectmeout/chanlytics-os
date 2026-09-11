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
  compareTemplates, defaultParamSpecs, defaultSlotKinds, defaultTemplate, guessSlotKind, slotLabels, starterByKey, starterByName, starterDraft, starterForTrigger, starterIndex, starterPreview, templateTitle, validateTemplateDraft,
} from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "./_source.mjs";

test("seven starters, each in English and Spanish, each passing the hand-written check with no warnings", () => {
  assert.deepEqual(STARTER_TEMPLATES.map((s) => s.key), ["winback_offer", "welcome_new", "save_our_number", "monthly_offer", "visit_reminder", "after_visit", "quick_note"]);
  assert.deepEqual(STARTER_LANGUAGES.map((l) => l.id), ["en_US", "es"]);
  for (const s of STARTER_TEMPLATES) {
    assert.equal(s.name, s.key, "the name is the key");
    assert.ok(/^[a-z0-9_]+$/.test(s.name), "a name Meta accepts");
    for (const l of STARTER_LANGUAGES) {
      const check = validateTemplateDraft(starterDraft(s, l.id));
      assert.equal(check.ok, true, `${s.key}/${l.id}: ${check.ok ? "" : check.error}`);
      assert.deepEqual(check.warnings, [], `${s.key}/${l.id} warns: ${check.warnings.join(" | ")}`);
      assert.equal(check.value.name, s.name);
      // A marketing starter says how to stop; a utility one (a reminder of their own appointment) carries no offer to stop.
      if (s.category === "marketing") assert.ok(check.value.footer && /STOP/.test(check.value.footer), "every marketing starter says how to stop");
      else assert.equal(check.value.footer, null, "a utility starter has no opt-out line");
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
  assert.equal(templateTitle("booking_link_v1"), "Booking link", "a version suffix is not a word");
  assert.equal(templateTitle("booking_link_v1", "Thanks for reaching out"), "Thanks for reaching out", "the workspace's own words win");
  assert.equal(templateTitle("winback_offer", "   "), "Win-back", "an empty title is no title");
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

test("the door: idempotent, one language at a time, synced in when the number's account already holds it, Meta's own words when it refuses", async () => {
  const r = readCode("apps/dashboard/app/api/v1/templates/starter/route.ts");
  assert.ok(r.includes('role: "operator",') && r.includes('rate: "settings",'));
  assert.ok(r.includes('results.push({ ...base, status: "exists", meta_status: have.meta_status });'), "already on file is left alone");
  assert.ok(r.includes("const check = validateTemplateDraft(starterDraft(s, l));"), "the same check a hand-written template passes");
  assert.ok(r.includes('if (r.reason === "meta_refused" && ALREADY_AT_META.test(r.detail ?? "")) {') && r.includes("await syncTemplates(member.tenantId);"), "a shared account's copy is synced in, not refused");
  assert.ok(r.includes('results.push({ ...base, status: "submitted", meta_status: r.metaStatus });'));
  assert.ok(r.includes("Pick at least one starter template, in English or Spanish."));
  const b = readCode("apps/dashboard/src/legacy-bridge/templates.ts");
  assert.ok(b.includes('addStarters: (body: StarterBody) => api()("POST templates/starter", { body })'), "the verb goes through the client; the map refreshes every surface that shows templates");
  assert.ok(b.includes("window.__starters = {") && b.includes("title: titleOf") && b.includes("slotKinds: defaultSlotKinds"), "the library reaches the pages");
  assert.ok((await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts")).HOOKS["POST templates/starter"].includes("__refreshPlaybooks"), "the playbook composer learns of a newly added starter");
});

test("the pages: titles not names, the starter set in Settings, one click on Broadcasts, the trigger's starter picked for a playbook, the message as the customer sees it", () => {
  const s = readCode("apps/dashboard/src/legacy/pages/messages.jsx");
  for (const id of ["starters", "starter-add", "starter-add-all", "template-lang", "template-menu"]) assert.ok(s.includes(`data-testid="${id}"`), id);
  assert.ok(s.includes('data-testid={g.starter ? "starter-row" : "custom-row"}'), "one card per message: the starters, then what the workspace wrote");
  assert.ok(s.includes('const TPL_SAMPLES = new Set(["hello_world"]);') && s.includes("!TPL_SAMPLES.has(t.name)"), "Meta's sample is never shown");
  assert.ok(s.includes("<window.WaBubble from={bizName || \"Your business\"} body={body} footer={footer} />"), "the card is the message as the customer sees it");
  assert.ok(readCode("apps/dashboard/src/legacy/pages/app-shell.jsx").includes('page === "messages"') && readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/pages/messages.jsx";'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/integrations-real.jsx").includes('messages: "channel-messages"') && !readCode("apps/dashboard/src/legacy/pages/integrations-real.jsx").includes("TemplatesCard"), "Integrations points at Messages (the WhatsApp row's verb) and lists no template");
  const tabs = readCode("apps/dashboard/src/legacy/components/surface-tabs.jsx");
  assert.ok(tabs.includes('match: ["outbound", "broadcasts", "messages", "content"]') && tabs.includes('{ id: "messages", label: "Messages", to: "messages"') && tabs.includes('to: "content", demoOnly: true'), "Messages is the third door of the shell's own Campaigns strip; Content stays seed-only");
  for (const f of ["outbound-real", "broadcasts-real", "messages"]) assert.ok(!readCode(`apps/dashboard/src/legacy/pages/${f}.jsx`).includes("CampaignsTabs"), `${f}: one strip, the shell's`);
  assert.ok(s.includes("{tplTitle(t)}") && s.includes('" · made here"'), "a title, with the raw name beside it");
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

test("the library's order, what a composer opens on, and each slot's words", () => {
  const rows = [
    { name: "hello_world", category: "utility", source: "meta" },
    { name: "booking_link_v1", category: "marketing", source: "meta" },
    { name: "quick_note", category: "marketing", source: "chanlytics" },
    { name: "approval_request", category: "marketing", source: "meta" },
    { name: "spring_offer", category: "marketing", source: "chanlytics" },
    { name: "winback_offer", category: "marketing", source: "chanlytics" },
  ];
  assert.deepEqual(rows.slice().sort(compareTemplates).map((r) => r.name), ["winback_offer", "quick_note", "spring_offer", "approval_request", "booking_link_v1", "hello_world"], "starters in the library's order, then written here, then the rest — marketing before utility");
  assert.equal(defaultTemplate(rows, null).name, "quick_note", "a broadcast opens on the quick note");
  assert.equal(defaultTemplate(rows, "quiet_30").name, "winback_offer", "a playbook opens on its trigger's starter");
  assert.equal(defaultTemplate(rows, "new_week").name, "winback_offer", "without the trigger's starter, the first in order");
  assert.equal(defaultTemplate([], null), null);
  assert.deepEqual(slotLabels({ name: "monthly_offer", language: "en_US", variables: [{ position: 1 }, { position: 2 }, { position: 3 }, { position: 4 }] }), ["First name", "Business name", "The offer", "Booking link"]);
  assert.deepEqual(slotLabels({ name: "monthly_offer", language: "es", variables: [] }), ["Nombre", "Nombre del negocio", "La oferta", "Enlace de reservas"]);
  assert.deepEqual(slotLabels({ name: "booking_link_v1", variables: [{ position: 1, label: "Business name" }, { position: 2, label: "Value 2" }] }), ["Business name", "Value 2"]);
  assert.equal(starterIndex("welcome_new"), 1);
  assert.equal(starterIndex("nope"), 7);
});

test("hidden from the composers: the door, the routes, the sync's first sight, the card", () => {
  const m = readRaw("supabase/migrations/00049_template_hidden.sql");
  assert.ok(m.includes("alter table public.templates add column if not exists hidden_at timestamptz;"));
  assert.ok(m.includes("update public.templates set hidden_at = now() where name = 'hello_world' and hidden_at is null;"), "Meta's sample is hidden on the day");
  assert.ok(m.includes("if v_tenant is null or not public.is_acting_member(v_tenant) then"), "owner or operator, never a viewer, and a stranger reads not found");
  assert.ok(m.includes("grant execute on function public.set_template_hidden(uuid, boolean) to authenticated;"));
  const r = readCode("apps/dashboard/app/api/v1/templates/route.ts");
  assert.ok(r.includes('if (!all) q = q.eq("meta_status", "approved").is("hidden_at", null);'), "the composers never see a hidden template; Settings sees everything");
  const one = readCode("apps/dashboard/app/api/v1/templates/[id]/route.ts");
  assert.ok(one.includes('ctx.supabase.rpc("set_template_hidden", { p_template_id: id, p_hidden: input.hidden === true })') && one.includes('role: "operator",'));
  const sync = readCode("apps/edge/api/admin/whatsapp/templates-sync.ts");
  assert.ok(sync.includes('const SAMPLE_TEMPLATES = new Set(["hello_world"]);') && sync.includes("hidden_at: now.toISOString()"), "the sample is hidden on first sight");
  assert.ok(sync.includes("const fresh = rows.filter((r) => !keep.has(`${r.name}|${r.language}`) && SAMPLE_TEMPLATES.has(r.name));"), "and only on first sight — a row on file keeps what the workspace decided");
  const create = readCode("apps/edge/api/admin/whatsapp/templates-create.ts");
  assert.ok(create.includes("label: labels[n - 1] || `Value ${n}`"), "the words a person gave each slot are kept");
  const s = readCode("apps/dashboard/src/legacy/pages/messages.jsx");
  assert.ok(s.includes('data-testid="template-hide"') && s.includes('data-testid="templates-hidden"'));
  const b = readCode("apps/dashboard/src/legacy-bridge/templates.ts");
  assert.ok(b.includes("body: { hidden: true } })") && b.includes("body: { hidden: false } })"));
  const queue = readCode("apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");
  assert.ok(queue.includes('testid="brief-run-soon"') && queue.includes("Date.parse(r.scheduled_for) > Date.now()"), "a run under the veto window is on Today's queue with a Stop");
  const top = readCode("apps/dashboard/src/legacy/components/topbar.jsx");
  assert.ok(top.includes('className="btn btn-ghost btn-icon btn-sm tb-theme"'), "presence, the bell and the theme are one group");
  assert.ok(readCode("apps/dashboard/src/legacy/styles/components.css").includes(".tbn-wrap { position: relative; display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; }"));
});

test("a template's title: the workspace's own words, set through its door, shown everywhere a template is named", () => {
  const m = readRaw("supabase/migrations/00050_template_title.sql");
  assert.ok(m.includes("alter table public.templates add column if not exists title text;"));
  assert.ok(m.includes("check (title is null or char_length(title) between 1 and 60);"));
  assert.ok(m.includes("if v_tenant is null or not public.is_acting_member(v_tenant) then"), "owner or operator, never a viewer");
  assert.ok(m.includes("grant execute on function public.set_template_title(uuid, text) to authenticated;"));
  const one = readCode("apps/dashboard/app/api/v1/templates/[id]/route.ts");
  assert.ok(one.includes('ctx.supabase.rpc("set_template_title", { p_template_id: id, p_title: title || "" })'), "empty is no title — the door clears it");
  assert.ok(one.includes('"Say what changes: whether it is hidden, or its title."'));
  const b = readCode("apps/dashboard/src/legacy-bridge/templates.ts");
  assert.ok(b.includes("body: { title } })") && b.includes("return templateTitle(t, row?.title ?? null);"), "a name is looked up among the workspace's rows");
  const s = readCode("apps/dashboard/src/legacy/pages/messages.jsx");
  for (const id of ["template-rename", "template-title", "template-title-save"]) assert.ok(s.includes(`data-testid="${id}"`), id);
  assert.ok(readCode("apps/dashboard/app/api/v1/broadcasts/route.ts").includes("broadcastName(tpl.name, now, tpl.title)"), "a broadcast's default name uses the title");
  assert.ok(readCode("apps/dashboard/src/server/playbooks.ts").includes("templateTitle(tpl.name, tpl.title)"), "a playbook's default name uses the title");
  assert.ok(readCode("apps/dashboard/app/api/v1/templates/route.ts").includes("source, hidden_at, title"), "the composers read it");
});
