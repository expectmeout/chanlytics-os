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
  MOMENT_TRIGGERS,
  STARTER_LANGUAGES,
  STARTER_TEMPLATES,
  compareTemplates,
  defaultParamSpecs,
  defaultSlotKinds,
  defaultTemplate,
  guessSlotKind,
  slotLabels,
  starterByKey,
  starterByName,
  starterDraft,
  starterForTrigger,
  starterIndex,
  starterPreview,
  startersOffered,
  templateTitle,
  validateTemplateDraft,
} from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "../_source.mjs";

test("nine starters, each in English and Spanish, each passing the hand-written check with no warnings", () => {
  assert.deepEqual(
    STARTER_TEMPLATES.map((s) => s.key),
    [
      "winback_offer",
      "welcome_new",
      "save_our_number",
      "monthly_offer",
      "visit_reminder",
      "after_visit",
      "quick_note",
      "proposal_follow_up",
      "booking_link",
    ],
    "booking_link is LAST on purpose: the order is what a composer opens on, and this is the one a caller asks for out loud rather than one anybody broadcasts",
  );
  assert.deepEqual(
    STARTER_LANGUAGES.map((l) => l.id),
    ["en_US", "es"],
  );
  for (const s of STARTER_TEMPLATES) {
    assert.equal(s.name, s.key, "the name is the key");
    assert.ok(/^[a-z0-9_]+$/.test(s.name), "a name Meta accepts");
    for (const l of STARTER_LANGUAGES) {
      const check = validateTemplateDraft(starterDraft(s, l.id));
      assert.equal(check.ok, true, `${s.key}/${l.id}: ${check.ok ? "" : check.error}`);
      assert.deepEqual(check.warnings, [], `${s.key}/${l.id} warns: ${check.warnings.join(" | ")}`);
      assert.equal(check.value.name, s.name);
      // A marketing starter says how to stop; a utility one (a reminder of their own appointment) carries no offer to stop.
      if (s.category === "marketing")
        assert.ok(check.value.footer && /STOP/.test(check.value.footer), "every marketing starter says how to stop");
      else assert.equal(check.value.footer, null, "a utility starter has no opt-out line");
      const t = s.texts[l.id];
      assert.equal(t.slots.length, check.value.examples.length);
      assert.ok(
        t.slots.some((x) => x.kind === "first_name") && t.slots.some((x) => x.kind === "business_name"),
        "a first name and the business's name, every time",
      );
    }
    const en = s.texts.en_US.slots.map((x) => x.kind);
    const es = s.texts.es.slots.map((x) => x.kind);
    assert.deepEqual(en, es, `${s.key}: the same slots in both languages, in the same order`);
  }
});

test("one starter per moment, one for any broadcast; titles for people, names for the wire", () => {
  for (const t of MOMENT_TRIGGERS) {
    const s = starterForTrigger(t.id);
    // One of the workspace's own lists sends what the owner picks; Lapsed sends the win-back, already about a visit.
    if (t.kind === "saved") {
      assert.equal(s, null, `${t.id} has no starter of its own`);
      continue;
    }
    assert.ok(s, `${t.id} has a starter`);
    assert.equal(s.trigger, t.id === "lapsed" ? "quiet_30" : t.id);
  }
  // A reach-out's words are its own email (Part 4), never a WhatsApp starter.
  for (const id of ["lead_first", "after_step"]) assert.equal(starterForTrigger(id), null, id);
  assert.equal(starterForTrigger(null)?.key, undefined, "the quick note is for broadcasts, not a trigger");
  assert.equal(starterByKey("quick_note").trigger, null);
  assert.equal(starterByName("winback_offer").title, "Win-back");
  assert.equal(starterByName("nope"), null);
  assert.equal(templateTitle("winback_offer"), "Win-back");
  assert.equal(templateTitle("approval_confirmation"), "Approval confirmation");
  assert.equal(templateTitle("booking_link"), "Booking link", "the starter's own title");
  assert.equal(templateTitle("spring_offer_v2"), "Spring offer", "a version suffix is not a word");
  assert.equal(
    templateTitle("booking_link", "Thanks for reaching out"),
    "Thanks for reaching out",
    "the workspace's own words win",
  );
  assert.equal(templateTitle("winback_offer", "   "), "Win-back", "an empty title is no title");
  assert.equal(templateTitle(""), "");
  assert.equal(
    starterPreview(starterByKey("winback_offer"), "en_US", "Marisa's Beauty Salon", "https://book.example.com/marisa"),
    "Hi Dani, it's been a while since we last saw you at Marisa's Beauty Salon. We'd love to have you back — pick a time that suits you here: https://book.example.com/marisa and we'll take care of the rest.",
    "the business's own name and booking link",
  );
  // A fact the business has not given yet is a blank to fill, never the sample filed with Meta: "Luna Studio" and its
  // booksy link read as a real business's real link. The customer's name stays a sample -- no one customer is shown.
  assert.equal(
    starterPreview(starterByKey("winback_offer"), "en_US", "Marisa's Beauty Salon"),
    "Hi Dani, it's been a while since we last saw you at Marisa's Beauty Salon. We'd love to have you back — pick a time that suits you here: [Booking link] and we'll take care of the rest.",
  );
  assert.ok(
    starterPreview(starterByKey("quick_note"), "es").startsWith("Hola Dani, una nota rápida de [Nombre del negocio]:"),
    "in the language's own words",
  );
  assert.ok(
    starterPreview(starterByKey("quick_note"), "pt_BR").startsWith("Hi Dani"),
    "a language not written falls back to English",
  );
});

test("a saved template reads as this business's message: its own name and booking link in the slots that name it, whatever the row calls them", async () => {
  const { templatePreview } = await import("@chanlytics/contracts");
  // As the sync stores a row: a position, a label ("Value n" from Meta), the example filed -- no kind.
  const filed = [
    { label: "Value 1", example: "Dani", position: 1 },
    { label: "Value 2", example: "Luna Studio", position: 2 },
    { label: "Value 3", example: "https://booksy.com/luna-studio", position: 3 },
  ];
  const body = "Hi {{1}}, thanks for calling {{2}}. Book any time: {{3}} or just write to us here.";
  const own = { business_name: "Marisa's Beauty Salon", booking_link: "https://book.example.com/marisa" };
  assert.equal(
    templatePreview({ name: "save_our_number", body_preview: body, variables: filed }, own),
    "Hi Dani, thanks for calling Marisa's Beauty Salon. Book any time: https://book.example.com/marisa or just write to us here.",
    "a starter's slots are known by its name",
  );
  assert.equal(
    templatePreview({ name: "save_our_number", language: "es", body_preview: body, variables: filed }, {}),
    "Hi Dani, thanks for calling [Nombre del negocio]. Book any time: [Enlace de reservas] or just write to us here.",
    "not given yet: a blank in the row's language",
  );
  // Written in WhatsApp Manager: a slot is guessed from its label and example; one nothing names keeps the example that business filed.
  assert.equal(
    templatePreview(
      {
        name: "front_desk_note",
        body_preview: "A note from {{1}}.",
        variables: [{ label: "Value 1", example: "the front desk", position: 1 }],
      },
      own,
    ),
    "A note from the front desk.",
  );
  assert.equal(
    templatePreview(
      {
        name: "book_again",
        body_preview: "Book again: {{1}}",
        variables: [{ label: "Value 1", example: "https://calendly.com/someone-else", position: 1 }],
      },
      own,
    ),
    "Book again: https://book.example.com/marisa",
    "a link slot is this business's link",
  );
  assert.equal(
    templatePreview(
      {
        name: "book_again",
        body_preview: "Book again: {{1}}",
        variables: [{ label: "Value 1", example: "https://calendly.com/someone-else", position: 1 }],
      },
      {},
    ),
    "Book again: [Booking link]",
  );
  // The slot follows its position, and a slot with nothing to show stays a slot.
  assert.equal(
    templatePreview(
      {
        name: "odd_order",
        body_preview: "{{1}} and {{2}}",
        variables: [
          { label: "Value 2", example: "second", position: 2 },
          { label: "Value 1", example: "first", position: 1 },
        ],
      },
      own,
    ),
    "first and second",
  );
  assert.equal(templatePreview({ name: "bare", body_preview: "Hello {{1}}", variables: [] }, own), "Hello {{1}}");
  assert.equal(templatePreview({ name: "empty", body_preview: null, variables: null }, own), "");
});

test("a slot's source: a starter's own, or a guess from the label and the example a template written elsewhere carries", () => {
  assert.equal(guessSlotKind("Booking link", null), "booking_link");
  assert.equal(guessSlotKind("Value 2", "https://booksy.com/x"), "booking_link");
  assert.equal(guessSlotKind("Business name", null), "business_name");
  assert.equal(guessSlotKind("First name", null), "first_name");
  assert.equal(guessSlotKind("Name", null), "first_name");
  assert.equal(
    guessSlotKind("Value 1", "Dani"),
    "text",
    "a bare value with a name-like example is still a guess we do not make",
  );
  assert.equal(guessSlotKind("The offer", "20% off"), "text");
  assert.deepEqual(
    defaultSlotKinds({
      name: "monthly_offer",
      variables: [{ position: 1 }, { position: 2 }, { position: 3 }, { position: 4 }],
    }),
    ["first_name", "business_name", "text", "booking_link"],
  );
  assert.deepEqual(
    defaultSlotKinds({
      name: "reservar_ahora",
      variables: [
        { position: 1, label: "Business name", example: "Marisa's" },
        { position: 2, label: "Booking link", example: "book.example.com/marisas" },
      ],
    }),
    ["business_name", "booking_link"],
    "a name we did not write is read off its own labels",
  );
  assert.deepEqual(
    defaultSlotKinds({ name: "booking_link", variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
    ["first_name", "business_name", "booking_link"],
    "and one we did carries the shape we wrote",
  );
  assert.deepEqual(defaultSlotKinds({ name: "hello_world", variables: [] }), []);
  assert.deepEqual(defaultParamSpecs({ name: "quick_note", variables: [1, 2, 3] }), [
    { kind: "first_name" },
    { kind: "business_name" },
    { kind: "text", value: "" },
  ]);
});

test("the door: idempotent, one language at a time, synced in when the number's account already holds it, Meta's own words when it refuses", async () => {
  const r = readCode("apps/dashboard/app/api/v1/templates/starter/route.ts");
  assert.ok(r.includes('role: "operator",') && r.includes('rate: "settings",'));
  assert.ok(
    r.includes('results.push({ ...base, status: "exists", meta_status: have.meta_status });'),
    "already on file is left alone",
  );
  assert.ok(
    r.includes("const check = validateTemplateDraft(starterDraft(s, l));"),
    "the same check a hand-written template passes",
  );
  assert.ok(
    r.includes('if (r.reason === "meta_refused" && ALREADY_AT_META.test(r.detail ?? "")) {') &&
      r.includes("await syncTemplates(member.tenantId, ctx.userId);"),
    "a shared account's copy is synced in, not refused",
  );
  assert.ok(r.includes('results.push({ ...base, status: "submitted", meta_status: r.metaStatus });'));
  assert.ok(r.includes("Pick at least one starter template, in English or Spanish."));
  const b = readCode("apps/dashboard/src/surfaces/campaigns/templates/verbs.ts");
  assert.ok(
    b.includes('addStarters: (body: StarterBody) => api()("POST templates/starter", { body })'),
    "the verb goes through the client; the map refreshes every surface that shows templates",
  );
  assert.ok(
    b.includes("export const starters: StarterLibrary = {") &&
      b.includes("title: titleOf") &&
      b.includes("slotKinds: defaultSlotKinds"),
    "the library reaches the pages (imported by them since decision 0015, no longer published on window)",
  );
  assert.ok(
    (await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts")).HOOKS["POST templates/starter"].includes(
      "__refreshPlaybooks",
    ),
    "the playbook composer learns of a newly added starter",
  );
});

test("the pages: titles not names, the starter set in Settings, one click on Broadcasts, the trigger's starter picked for a playbook, the message as the customer sees it", () => {
  // The Templates page is a folder of modules (moved from messages.jsx, decision 0015): its source is read as one.
  const s = ["page-parts", "message-row-parts", "message-row", "group", "words"]
    .map((f) =>
      readCode(`apps/dashboard/src/surfaces/campaigns/templates/${f}.ts${f === "group" || f === "words" ? "" : "x"}`),
    )
    .join(" ");
  for (const id of ["starters", "starter-add", "starter-add-all", "template-menu"])
    assert.ok(s.includes(`data-testid="${id}"`), id);
  assert.ok(s.includes('testid="template-lang"'), "one language control per message, the picker's");
  assert.ok(
    s.includes('data-testid={g.starter ? "starter-row" : "custom-row"}'),
    "one card per message: the starters, then what the workspace wrote",
  );
  assert.ok(
    s.includes('export const TPL_SAMPLES = new Set(["hello_world"]);') && s.includes("!TPL_SAMPLES.has(t.name)"),
    "Meta's sample is never shown",
  );
  assert.ok(
    s.includes("<MessagePreview") &&
      s.includes("header={row ? row.header : null}") &&
      s.includes("buttons={row ? row.buttons : null}"),
    "the card is the WHOLE message as the customer sees it: its heading and its buttons too",
  );
  assert.ok(
    // The route is an App Router page since decision 0015 (its row left app-routes.jsx), on the route `messages`.
    readCode("apps/dashboard/app/(os)/w/[workspace]/templates/page.tsx").includes("TemplatesPage"),
  );
  assert.ok(
    readCode("apps/dashboard/src/legacy/pages/integrations-real.jsx").includes('messages: "channel-messages"') &&
      !readCode("apps/dashboard/src/legacy/pages/integrations-real.jsx").includes("TemplatesCard"),
    "Integrations points at Messages (the WhatsApp row's verb) and lists no template",
  );
  const tabs = readCode("apps/dashboard/src/legacy/components/surface-tabs.jsx");
  assert.ok(
    tabs.includes('match: ["outbound", "broadcasts", "messages", "content"]') &&
      tabs.includes('{ id: "messages", label: "Templates", to: "messages"') &&
      tabs.includes('to: "content", demoOnly: true'),
    "Templates is the third door of the shell's own Campaigns strip, on the route that is still `messages`; Content stays seed-only",
  );
  for (const f of ["playbooks/playbooks-page", "broadcasts/broadcasts-page", "templates/templates-page"])
    assert.ok(
      !readCode(`apps/dashboard/src/surfaces/campaigns/${f}.tsx`).includes("CampaignsTabs"),
      `${f}: one strip, the shell's`,
    );
  assert.ok(s.includes("tplTitle(") && s.includes('" · made here"'), "a title, with the raw name beside it");
  // Broadcasts' send screen and its slot choices (moved from broadcasts.jsx), read as one.
  const b = ["page/send-screen.tsx", "page/reach.ts"]
    .map((f) => readCode(`apps/dashboard/src/surfaces/campaigns/broadcasts/${f}`))
    .join(" ");
  assert.ok(b.includes('data-testid="bc-add-starters"'));
  assert.ok(
    b.includes(
      "const srcOf = (i) => { const c = choices[i] || BC_TEXT; const s = (sources[tplId] || BC_NONE)[i]; return c.includes(s) ? s : c[0]; };",
    ),
    "a starter's slots come filled in, each with what it may take",
  );
  assert.ok(
    b.includes("<window.MessagePreview") && b.includes('data-testid="bc-preview"'),
    "the preview is the message as the customer sees it",
  );
  assert.ok(
    b.includes("<window.PreviewStepper"),
    "and it walks the real people the count is a length of, not an example",
  );
  assert.ok(!b.includes('<span className="bc-row-label">Template</span>'), "the row label fits");
  // The composer is playbook-composer.jsx (moved whole from outbound-real.jsx, Reach out Part 2.5).
  const p = readCode("apps/dashboard/src/legacy/pages/playbook-composer.jsx");
  assert.ok(p.includes('data-testid="pb-starter"') && p.includes('data-testid="pb-add-starter"'));
  assert.ok(
    p.includes("window.__starters.forTrigger(trigger)") &&
      p.includes("const tpl = picked ? usable.find((t) => t.id === tplId) || null : rowIn(starterGroup, null);"),
    "the trigger's starter is picked for you",
  );
  assert.ok(p.includes("<window.CmPicker") && p.includes("<window.MessagePreview"));
  const t = readCode("apps/dashboard/src/legacy/pages/templates-real.jsx");
  assert.ok(
    t.includes('data-testid="tpl-start-from"') &&
      t.includes("window.starterWords = starterWords;") &&
      !t.includes("WaBubble"),
  );
  const css = readCode("apps/dashboard/src/legacy/styles/components.css");
  assert.ok(css.includes(".mp-bubble {") && css.includes(".tpl-starter-row {"));
});

test("the library's order, what a composer opens on, and each slot's words", () => {
  const rows = [
    { name: "hello_world", category: "utility", source: "meta" },
    { name: "booking_link", category: "marketing", source: "meta" },
    { name: "quick_note", category: "marketing", source: "chanlytics" },
    { name: "approval_request", category: "marketing", source: "meta" },
    { name: "spring_offer", category: "marketing", source: "chanlytics" },
    { name: "winback_offer", category: "marketing", source: "chanlytics" },
  ];
  assert.deepEqual(
    rows
      .slice()
      .sort(compareTemplates)
      .map((r) => r.name),
    ["winback_offer", "quick_note", "booking_link", "spring_offer", "approval_request", "hello_world"],
    "starters in the library's order, then written here, then the rest — marketing before utility",
  );
  assert.equal(defaultTemplate(rows, null).name, "quick_note", "a broadcast opens on the quick note");
  assert.equal(defaultTemplate(rows, "quiet_30").name, "winback_offer", "a playbook opens on its trigger's starter");
  assert.equal(
    defaultTemplate(rows, "new_week").name,
    "winback_offer",
    "without the trigger's starter, the first in order",
  );
  assert.equal(defaultTemplate([], null), null);
  assert.deepEqual(
    slotLabels({
      name: "monthly_offer",
      language: "en_US",
      variables: [{ position: 1 }, { position: 2 }, { position: 3 }, { position: 4 }],
    }),
    ["First name", "Business name", "The offer", "Booking link"],
  );
  assert.deepEqual(slotLabels({ name: "monthly_offer", language: "es", variables: [] }), [
    "Nombre",
    "Nombre del negocio",
    "La oferta",
    "Enlace de reservas",
  ]);
  assert.deepEqual(
    slotLabels({
      name: "booking_link",
      variables: [
        { position: 1, label: "Business name" },
        { position: 2, label: "Value 2" },
      ],
    }),
    ["Business name", "Value 2"],
  );
  assert.equal(starterIndex("welcome_new"), 1);
  assert.equal(starterIndex("nope"), STARTER_TEMPLATES.length, "a name we did not write sorts after every one we did");
});

test("hidden from the composers: the door, the routes, the sync's first sight, the card", () => {
  const m = readRaw("supabase/migrations/00049_template_hidden.sql");
  assert.ok(m.includes("alter table public.templates add column if not exists hidden_at timestamptz;"));
  assert.ok(
    m.includes("update public.templates set hidden_at = now() where name = 'hello_world' and hidden_at is null;"),
    "Meta's sample is hidden on the day",
  );
  assert.ok(
    m.includes("if v_tenant is null or not public.is_acting_member(v_tenant) then"),
    "owner or operator, never a viewer, and a stranger reads not found",
  );
  assert.ok(m.includes("grant execute on function public.set_template_hidden(uuid, boolean) to authenticated;"));
  // The composers never see a hidden template and Settings sees everything: RUN through the route in
  // outbound-routes.test.mjs ("templates: the composers see the approved and unhidden") and its reader in readers.test.mjs.
  const one = readCode("apps/dashboard/app/api/v1/templates/[id]/route.ts");
  assert.ok(
    /ctx\.supabase\.rpc\("set_template_hidden", \{\s*p_template_id: id,\s*p_hidden: input\.hidden === true,?\s*\}\)/.test(
      one,
    ) && one.includes('role: "operator",'),
  );
  // The sync hiding Meta's sample on first sight only, and the create door
  // keeping the words a person gave each slot, are run in templates-doors.test.mjs.
  const s = readCode("apps/dashboard/src/legacy/pages/messages.jsx");
  assert.ok(s.includes('data-testid="template-hide"') && s.includes('data-testid="templates-hidden"'));
  const b = readCode("apps/dashboard/src/legacy-bridge/templates.ts");
  assert.ok(b.includes("body: { hidden: true } })") && b.includes("body: { hidden: false } })"));
  const queue = readCode("apps/dashboard/src/surfaces/today/pages/queue-runs.tsx");
  assert.ok(
    queue.includes('testid="brief-run-soon"') && queue.includes("Date.parse(r.scheduled_for) > Date.now()"),
    "a run under the veto window is on Today's queue with a Stop",
  );
  const top = readCode("apps/dashboard/src/legacy/components/topbar.jsx");
  assert.ok(
    top.includes('className="btn btn-ghost btn-icon btn-sm tb-theme"'),
    "presence, the bell and the theme are one group",
  );
  assert.ok(
    readCode("apps/dashboard/src/legacy/styles/components.css").includes(
      ".tbn-wrap { position: relative; display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; }",
    ),
  );
});

test("a template's title: the workspace's own words, set through its door, shown everywhere a template is named", () => {
  const m = readRaw("supabase/migrations/00050_template_title.sql");
  assert.ok(m.includes("alter table public.templates add column if not exists title text;"));
  assert.ok(m.includes("check (title is null or char_length(title) between 1 and 60);"));
  assert.ok(
    m.includes("if v_tenant is null or not public.is_acting_member(v_tenant) then"),
    "owner or operator, never a viewer",
  );
  assert.ok(m.includes("grant execute on function public.set_template_title(uuid, text) to authenticated;"));
  const one = readCode("apps/dashboard/app/api/v1/templates/[id]/route.ts");
  assert.ok(
    one.includes('ctx.supabase.rpc("set_template_title", { p_template_id: id, p_title: title || "" })'),
    "empty is no title — the door clears it",
  );
  assert.ok(one.includes('"Say what changes: whether it is hidden, or its title."'));
  const b = readCode("apps/dashboard/src/legacy-bridge/templates.ts");
  assert.ok(
    b.includes("body: { title } })") && b.includes("return templateTitle(t, row?.title ?? null);"),
    "a name is looked up among the workspace's rows",
  );
  const s = readCode("apps/dashboard/src/legacy/pages/messages.jsx");
  for (const id of ["template-rename", "template-title", "template-title-save"])
    assert.ok(s.includes(`data-testid="${id}"`), id);
  // The default names of a broadcast and a playbook use the title: run in core-campaigns.test.mjs.
  assert.ok(
    readCode("apps/dashboard/src/server/readers/templates.ts").includes("source, hidden_at, title"),
    "the composers read it",
  );
});

test("the set a workspace is offered (0006): the proposal follow-up only where deals are on, a utility with no figure in it", () => {
  assert.deepEqual(
    startersOffered(false).map((s) => s.key),
    STARTER_TEMPLATES.filter((s) => s.key !== "proposal_follow_up").map((s) => s.key),
    "a workspace whose customers book is never offered it, nor has it filed with WhatsApp",
  );
  assert.deepEqual(
    startersOffered(true).map((s) => s.key),
    STARTER_TEMPLATES.map((s) => s.key),
  );
  const s = starterByKey("proposal_follow_up");
  assert.deepEqual(
    [s.category, s.trigger, s.texts.en_US.slots.map((x) => x.kind)],
    ["utility", "proposal_waiting", ["first_name", "business_name", "proposal_link"]],
  );
  assert.equal(
    starterPreview(s, "en_US", "Harbor Moving"),
    "Hi Dani, just making sure the proposal from Harbor Moving reached you: https://docs.example.com/proposal. Reply here with any questions.",
  );
  for (const l of STARTER_LANGUAGES)
    assert.ok(
      !/[$€£]|\d/.test(s.texts[l.id].body.replace(/\{\{\d\}\}/g, "")),
      `${l.id}: no price, date or amount in its words`,
    );
  assert.equal(guessSlotKind("Proposal link"), "proposal_link", "a label that names the proposal is its link");
});
