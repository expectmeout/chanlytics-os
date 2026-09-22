/**
 * Templates written here, and the values a broadcast fills them with.
 *
 * Meta approves the words; Chanlytics helps write them and sends them for
 * review. What Meta refuses at the wire is refused here first, in the
 * person's words; what fills a numbered slot is decided once and resolved
 * per recipient by the job with the same function the page previews with.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARAM_SOURCES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  exampleParams,
  firstNameOf,
  paramLabel,
  parseParamSpec,
  placeholdersOf,
  placeholdersSequential,
  resolveParams,
  slugTemplateName,
  templateComponents,
  validateTemplateDraft,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

test("names Meta accepts, slots in order, one example each: what is refused is refused in the person's words", () => {
  assert.equal(slugTemplateName("Spring Offer 2026!"), "spring_offer_2026");
  assert.equal(slugTemplateName("  Café Día  "), "cafe_dia");
  assert.deepEqual(placeholdersOf("Hi {{1}}, {{3}} and {{1}}"), [1, 3]);
  assert.equal(placeholdersSequential([1, 2, 3]), true);
  assert.equal(placeholdersSequential([1, 3]), false);
  const ok = validateTemplateDraft({
    name: "Spring offer",
    language: "en_US",
    category: "marketing",
    body: "Hi {{1}}, {{2}} is 20% off this week at {{3}}.",
    footer: "Reply STOP to opt out",
    examples: ["Dani", "Balayage", "Melany's"],
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.name, "spring_offer");
  assert.deepEqual(ok.warnings, []);
  assert.deepEqual(templateComponents(ok.value), [
    {
      type: "BODY",
      text: "Hi {{1}}, {{2}} is 20% off this week at {{3}}.",
      example: { body_text: [["Dani", "Balayage", "Melany's"]] },
    },
    { type: "FOOTER", text: "Reply STOP to opt out" },
  ]);
  const gap = validateTemplateDraft({
    name: "x",
    language: "en_US",
    category: "marketing",
    body: "Hi {{1}} and {{3}}",
    examples: ["a", "b"],
  });
  assert.equal(gap.ok, false);
  assert.ok(gap.error.includes("in order"));
  const noEx = validateTemplateDraft({
    name: "x",
    language: "en_US",
    category: "utility",
    body: "Hi {{1}}",
    examples: [],
  });
  assert.equal(noEx.ok, false);
  assert.ok(noEx.error.includes("one example"), "reviewers read the examples");
  assert.equal(
    validateTemplateDraft({ name: "x", language: "xx", category: "utility", body: "Hi", examples: [] }).ok,
    false,
  );
  assert.equal(
    validateTemplateDraft({ name: "x", language: "en_US", category: "authentication", body: "Hi", examples: [] }).ok,
    false,
  );
  assert.equal(
    validateTemplateDraft({ name: "x", language: "en_US", category: "utility", body: "x".repeat(1025), examples: [] })
      .ok,
    false,
  );
  const warn = validateTemplateDraft({
    name: "x",
    language: "en_US",
    category: "marketing",
    body: "{{1}} is on sale",
    examples: ["Balayage"],
  });
  assert.equal(warn.ok, true);
  assert.ok(
    warn.warnings.some((w) => w.includes("starts or ends")) && warn.warnings.some((w) => w.includes("STOP")),
    "warnings, not refusals, for what reviewers frown on",
  );
  assert.ok(
    TEMPLATE_LANGUAGES.some((l) => l.id === "es_MX") &&
      TEMPLATE_CATEGORIES.includes("marketing") &&
      !TEMPLATE_CATEGORIES.includes("authentication"),
  );
});

test("what fills a slot: typed text once, or the person's first name, the business's name, the booking link — per recipient, with the same words the page previews", () => {
  assert.deepEqual(
    [...PARAM_SOURCES],
    ["text", "first_name", "business_name", "booking_link", "visit_when", "visit_service"],
  );
  assert.deepEqual(parseParamSpec("20%"), { kind: "text", value: "20%" });
  assert.deepEqual(parseParamSpec("@first_name"), { kind: "first_name" });
  assert.deepEqual(parseParamSpec({ kind: "booking_link" }), { kind: "booking_link" });
  assert.deepEqual(parseParamSpec({ kind: "text", value: "x" }), { kind: "text", value: "x" });
  assert.equal(parseParamSpec({ kind: "weird" }), null);
  assert.equal(parseParamSpec(42), null);
  assert.equal(firstNameOf("Daniela Ruiz", null), "Daniela");
  assert.equal(firstNameOf(null, "Dani ✨"), "Dani");
  assert.equal(firstNameOf("+1 917 555 0100", null), null, "a number is not a name");
  assert.equal(firstNameOf("", ""), null);
  const specs = [
    { kind: "first_name" },
    { kind: "text", value: "Balayage" },
    { kind: "business_name" },
    { kind: "booking_link" },
  ];
  assert.deepEqual(
    resolveParams(specs, { firstName: "Dani", businessName: "Melany's", bookingLink: "https://b.example" }),
    ["Dani", "Balayage", "Melany's", "https://b.example"],
  );
  assert.deepEqual(
    resolveParams(specs, { firstName: null, businessName: "Melany's", bookingLink: null }),
    ["there", "Balayage", "Melany's", ""],
    "no name reads 'there'; no link is empty, which the route refuses and the job holds",
  );
  assert.deepEqual(exampleParams(specs, "Melany's"), ["Dani", "Balayage", "Melany's", "your booking link"]);
  assert.equal(paramLabel({ kind: "first_name" }), "their first name");
  assert.equal(paramLabel({ kind: "text", value: "20%" }), "20%");
});

test("the migration says where a template came from; the graph module lets Meta recategorise, hands back Meta's own words, and deletes one language by its id", () => {
  // The create and delete doors themselves -- the number's own credentials,
  // the row made here and by whom, Meta's words back on a refusal, no call to
  // Meta for a row with no id and the row still removed -- are run in
  // templates-doors.test.mjs.
  const m = readRaw("supabase/migrations/00047_templates_made_here.sql");
  assert.ok(m.includes("add column source     text not null default 'meta' check (source in ('meta', 'chanlytics'))"));
  const g = readCode("apps/edge/lib/meta-templates.ts");
  assert.ok(g.includes("allow_category_change: true"), "Meta may recategorise instead of rejecting");
  assert.ok(g.includes("body?.error?.error_user_msg ?? body?.error?.message"), "Meta's own words");
  // The id is REQUIRED, not conditional: `?name=` alone is every language of
  // that name, gone, with the name locked for thirty days.
  assert.ok(
    g.includes("const qs = new URLSearchParams({ name, hsm_id: hsmId });"),
    "one language goes, not every language of that name",
  );
  assert.ok(g.includes("  hsmId: string,\n"), "and no caller can omit it");
});

test("the routes: what Meta refuses is refused first; a duplicate name is a conflict; a template a broadcast still uses cannot go; the draft is a draft", () => {
  const r = readCode("apps/dashboard/app/api/v1/templates/route.ts");
  assert.ok(
    r.includes("const check = validateTemplateDraft({") &&
      r.includes('if (!check.ok) throw new AppError("validation", check.error);'),
  );
  assert.ok(r.includes('"A template with that name and language already exists. Pick another name."'));
  assert.ok(r.includes("WhatsApp did not accept it: ${r.detail"), "Meta's words reach the person");
  const del = readCode("apps/dashboard/app/api/v1/templates/[id]/route.ts");
  assert.ok(
    del.includes('.in("state", ["scheduled", "sending"]);') &&
      del.includes('"A broadcast is still using this template. Cancel it first."'),
  );
  const dr = readCode("apps/dashboard/app/api/v1/templates/draft/route.ts");
  assert.ok(dr.includes('rate: "ask",'), "a draft costs an assistant turn");
  const svc = readCode("apps/dashboard/src/server/templates.ts");
  assert.ok(svc.includes('export const DRAFT_MODEL = "claude-sonnet-5";'));
  assert.ok(svc.includes("Answer with one JSON object and nothing else"));
  assert.ok(svc.includes("The footer must say how to opt out"), "a marketing draft carries the opt-out line");
  assert.ok(
    /const check = validateTemplateDraft\(\{\s*name: d\.data\.name/.test(svc),
    "the draft passes the same check a submission does",
  );
  assert.ok(svc.includes("do not use a booking_link slot"), "no slot the workspace cannot fill");
  assert.ok(
    readCode("apps/dashboard/src/server/service.ts").includes("`${edgeUrl()}/api/admin/whatsapp/templates-create`") &&
      readCode("apps/dashboard/src/server/service.ts").includes("`${edgeUrl()}/api/admin/whatsapp/templates-delete`"),
  );
});

test("the job fills the slots per person and holds anyone a slot cannot be filled for; the send route takes specs and refuses a booking-link slot with no link on file", () => {
  const h = readCode("packages/jobs/src/handlers.ts");
  // The slots per person and the hold on an unfillable one are run: core-broadcast.test.mjs.
  assert.ok(h.includes('const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";'));
  // The specs and the booking-link refusal are run: core-campaigns.test.mjs.
  const p = readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
  assert.ok(p.includes('data-testid="bc-var-source"') && p.includes('data-testid="bc-new-template"'));
  assert.ok(p.includes("<window.TemplateComposer"), "one composer, mounted where a template is needed");
  const s = readCode("apps/dashboard/src/legacy/pages/messages.jsx");
  assert.ok(
    s.includes('data-testid="template-new"') &&
      s.includes('data-testid="template-delete"') &&
      s.includes('" · made here"'),
  );
  const tc = readCode("apps/dashboard/src/legacy/pages/templates-real.jsx");
  for (const id of [
    "tpl-composer",
    "tpl-brief",
    "tpl-draft",
    "tpl-name",
    "tpl-body",
    "tpl-examples",
    "tpl-preview",
    "tpl-submit",
  ])
    assert.ok(tc.includes(`data-testid="${id}"`), id);
  assert.ok(
    readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/pages/templates-real.jsx";'),
  );
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/templates.ts").includes("window.__templates = templates;"));
  assert.ok(
    /It can be sent now — from a broadcast, or from the Inbox outside the 24-hour window\.`,\s*alert: true,?\s*\}/.test(
      readCode("apps/edge/lib/waba-events.ts"),
    ),
    "an approval is news the owner waits for",
  );
});
