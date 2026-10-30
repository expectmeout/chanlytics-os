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
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  PARAM_SOURCES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  TEMPLATE_SAME_NAME_WORDS,
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
  MODEL_ROUTES,
  MODELS,
} from "@chanlytics/contracts";
import { ROOT, readCode, readRaw } from "../_source.mjs";

// The drafter is run below over an edge stubbed with the provider guard open, which is read as its module loads.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
delete process.env.DIAG_KEY;
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

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
    examples: ["Dani", "Balayage", "Marisa's"],
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.name, "spring_offer");
  assert.deepEqual(ok.warnings, []);
  assert.deepEqual(templateComponents(ok.value), [
    {
      type: "BODY",
      text: "Hi {{1}}, {{2}} is 20% off this week at {{3}}.",
      example: { body_text: [["Dani", "Balayage", "Marisa's"]] },
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
    [
      "text",
      "first_name",
      "business_name",
      "booking_link",
      "review_link",
      "visit_when",
      "visit_service",
      "proposal_link",
    ],
  );
  assert.deepEqual(parseParamSpec("@proposal_link"), { kind: "proposal_link" }, "the follow-up's link (0006)");
  assert.deepEqual(parseParamSpec("@review_link"), { kind: "review_link" }, "the Google listing's review link (00415)");
  assert.deepEqual(parseParamSpec({ kind: "review_link" }), { kind: "review_link" });
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
    resolveParams(specs, { firstName: "Dani", businessName: "Marisa's", bookingLink: "https://b.example" }),
    ["Dani", "Balayage", "Marisa's", "https://b.example"],
  );
  assert.deepEqual(
    resolveParams(specs, { firstName: null, businessName: "Marisa's", bookingLink: null }),
    ["there", "Balayage", "Marisa's", ""],
    "no name reads 'there'; no link is empty, which the route refuses and the job holds",
  );
  assert.deepEqual(exampleParams(specs, "Marisa's"), ["Dani", "Balayage", "Marisa's", "your booking link"]);
  const link = [{ kind: "proposal_link" }];
  assert.deepEqual(
    resolveParams(link, {
      firstName: null,
      businessName: "x",
      bookingLink: null,
      proposalLink: "https://docs.example.com/p",
    }),
    ["https://docs.example.com/p"],
    "the link frozen on the recipient when the run was made",
  );
  assert.deepEqual(
    resolveParams(link, { firstName: null, businessName: "x", bookingLink: null }),
    [""],
    "no link is empty, which the send skips as a missing value",
  );
  const review = [{ kind: "review_link" }];
  assert.deepEqual(
    resolveParams(review, {
      firstName: null,
      businessName: "x",
      bookingLink: null,
      reviewLink: "https://example.com/review/x",
    }),
    ["https://example.com/review/x"],
  );
  assert.deepEqual(
    resolveParams(review, { firstName: null, businessName: "x", bookingLink: null }),
    [""],
    "a sender that holds no review link fills none, and the send skips it as a missing value",
  );
  assert.deepEqual(exampleParams(review, "x"), ["your review link"]);
  assert.equal(paramLabel({ kind: "review_link" }), "the review link");
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
  const g = readCode("apps/edge/lib/whatsapp/meta-templates.ts");
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
  const r = readCode(
    "apps/dashboard/app/api/v1/templates/route.ts",
    "apps/dashboard/src/server/campaigns/template-submit.ts",
  );
  assert.ok(
    r.includes("const check = validateTemplateDraft({") &&
      r.includes('if (!check.ok) throw new AppError("validation", check.error);'),
  );
  // The duplicate's sentence is contracts' since Ask's message card says it too (TEMPLATE_SAME_NAME_WORDS).
  assert.ok(r.includes('throw new AppError("conflict", TEMPLATE_SAME_NAME_WORDS, 409);'));
  assert.equal(TEMPLATE_SAME_NAME_WORDS, "A template with that name and language already exists. Pick another name.");
  assert.ok(r.includes("WhatsApp did not accept it: ${r.detail"), "Meta's words reach the person");
  const del = readCode(
    "apps/dashboard/app/api/v1/templates/[id]/route.ts",
    "apps/dashboard/src/server/campaigns/template-row.ts",
  );
  assert.ok(
    del.includes('.in("state", ["scheduled", "sending"]);') &&
      del.includes('"A send is still using this message. Cancel it first."'),
  );
  const dr = readCode("apps/dashboard/app/api/v1/templates/draft/route.ts");
  assert.ok(dr.includes('rate: "ask",'), "a draft costs an assistant turn");
  const svc = readCode("apps/dashboard/src/server/campaigns/templates.ts");
  assert.equal(MODEL_ROUTES.template_draft.model, MODELS.SONNET_5_5, "the draft asks the registry's model for it");
  assert.ok(svc.includes("Answer with one JSON object and nothing else"));
  assert.ok(svc.includes("The footer must say how to opt out"), "a marketing draft carries the opt-out line");
  assert.ok(
    /const check = validateTemplateDraft\(\{\s*name: d\.data\.name/.test(svc),
    "the draft passes the same check a submission does",
  );
  assert.ok(svc.includes("do not use a booking_link slot"), "no slot the workspace cannot fill");
  assert.ok(
    readCode("apps/dashboard/src/server/campaigns/meta-templates.ts").includes(
      '"/api/admin/whatsapp/templates-create"',
    ) &&
      readCode("apps/dashboard/src/server/campaigns/meta-templates.ts").includes(
        '"/api/admin/whatsapp/templates-delete"',
      ),
  );
});

test("the job fills the slots per person and holds anyone a slot cannot be filled for; the send route takes specs and refuses a booking-link slot with no link on file", () => {
  const h = readCode("packages/jobs/src/broadcast-send.ts");
  // The slots per person and the hold on an unfillable one are run: core-broadcast.test.mjs.
  assert.ok(h.includes('const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";'));
  // The specs and the booking-link refusal are run: core-campaigns.test.mjs.
  const head = readCode("apps/dashboard/src/surfaces/campaigns/templates/page-parts.tsx");
  const s = readCode("apps/dashboard/src/surfaces/campaigns/templates/message-row-parts.tsx");
  assert.ok(
    head.includes('data-testid="template-new"') &&
      // Delete is an item of the pane's kit Menu: its test id rides the item's `gate` (the question it asks is `testid=`).
      s.includes('"data-testid": "template-delete"') &&
      s.includes('"Made here"'),
  );
  const tc = readCode("apps/dashboard/src/surfaces/campaigns/templates/composer-forms.tsx");
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
  // The composer is a module of the Templates page and the verbs it presses are imported, not published: the page draws
  // it (the Templates page test), and `templates` is the verbs' export (surfaces/campaigns/templates/verbs.ts).
  assert.ok(readCode("apps/dashboard/src/surfaces/campaigns/templates/verbs.ts").includes("export const templates"));
  assert.ok(
    /It can be sent now — from Campaigns, or from the Inbox outside the 24-hour window\.`,\s*alert: true,?\s*\}/.test(
      readCode("apps/edge/lib/whatsapp/waba-events.ts"),
    ),
    "an approval is news the owner waits for",
  );
});

test("a template draft asks the registry's model with its thinking off, and what it writes is the draft", async () => {
  // The 30 Oct 2026 replay: a model that thinks by default ran out of the draft's 900 tokens on 3 drafts in 12.
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const { draftTemplate } = await import(at("apps/dashboard/src/server/campaigns/templates.ts"));
  const draft = {
    name: "visit_reminder",
    body: "Hi {{1}}, a reminder of your visit at Harbor Studio tomorrow. Reply here to change it.",
    footer: null,
    examples: ["Ana"],
    variables: [{ position: 1, label: "First name", source: "first_name" }],
  };
  const frames = [
    { type: "message_start", message: { id: "msg_1", model: MODELS.SONNET_5_5, usage: { input_tokens: 900 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify(draft) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 60 } },
    { type: "message_stop" },
  ]
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith("/api/admin/llm")) throw new Error(`nothing else is reachable: ${url}`);
    sent.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(frames, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  try {
    const ctx = {
      userId: "u1",
      supabase: fakeDb({
        tenants: [{ id: T, name: "Harbor Studio", timezone: "America/New_York" }],
        tenant_config: [],
      }),
    };
    const out = await draftTemplate(ctx, T, {
      brief: "Remind them of tomorrow's visit",
      category: "utility",
      language: "en",
    });
    assert.equal(out.ok, true, out.message);
    assert.equal(out.draft.body, draft.body);
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(sent.length, 1);
  assert.equal(sent[0].request.model, MODEL_ROUTES.template_draft.model);
  assert.deepEqual(sent[0].request.thinking, { type: "between_tools" }, "Sonnet 5.5's least thinking");
});
