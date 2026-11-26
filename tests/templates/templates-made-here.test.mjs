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
import { ROOT, readCode } from "../_source.mjs";

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
    body: "This week {{1}} is on sale at the studio",
    examples: ["Balayage"],
  });
  assert.equal(warn.ok, true);
  assert.ok(
    warn.warnings.some((w) => w.includes("STOP")),
    "a warning, not a refusal, for what reviewers only frown on",
  );
  // What WhatsApp's review refuses is refused here first, so nothing is sent to be refused (Ruben, 12 Nov 2026).
  const refused = (body, examples = ["Balayage"]) =>
    validateTemplateDraft({ name: "x", language: "en_US", category: "utility", body, examples }).error ?? null;
  assert.match(refused("{{1}} is on sale this week"), /starts or ends with a value/);
  assert.match(refused("This week on sale: {{1}}"), /starts or ends with a value/);
  assert.equal(refused("This week on sale: {{1}}."), null, "a full stop after it is words after it");
  assert.match(refused("Hi {{1}}."), /so few words/, "too many values for its length");
  assert.equal(refused("Hi {{1}}, thanks for coming."), null);
  assert.match(refused("Hi {1}, thanks for coming in today.", []), /two braces each side/);
  assert.match(refused("Hi {{name}}, thanks for coming in today.", []), /two braces each side/);
  assert.match(refused("Book at bit.ly/luna before Friday.", []), /shortened links/);
  assert.match(refused("Book at https://tinyurl.com/luna before Friday.", []), /shortened links/);
  assert.equal(refused("Book at https://booksy.com/luna-studio before Friday.", []), null, "a full address passes");
  assert.equal(refused("We moved to habit.co/studio, come see us.", []), null, "t.co is not every address ending so");
  // More than one blank line in a row, which its review refuses, is mended: no owner means the difference.
  const spaced = validateTemplateDraft({
    name: "x",
    language: "en_US",
    category: "utility",
    body: "See you soon.\n\n\n\nThe studio",
    examples: [],
  });
  assert.equal(spaced.value.body, "See you soon.\n\nThe studio");
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
      "freed_when",
    ],
  );
  assert.deepEqual(parseParamSpec("@proposal_link"), { kind: "proposal_link" }, "the follow-up's link (0006)");
  assert.deepEqual(parseParamSpec({ kind: "freed_when" }), { kind: "freed_when" }, "the freed time (0082)");
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

test("the table says where a template came from: Meta or written here, and nothing else", async () => {
  // The database in memory refuses what Postgres refuses (_schema.mjs, held to the replayed migrations by the Database
  // workflow). Pinned as 00047's text until 26 Nov 2026.
  const db = fakeDb({ templates: [] });
  const put = (source, name) =>
    db
      .from("templates")
      .insert({
        tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        channel: "whatsapp",
        name,
        language: "en_US",
        source,
      })
      .select("id")
      .single();
  assert.equal((await put("meta", "a")).error, null);
  assert.equal((await put("chanlytics", "b")).error, null);
  assert.equal((await put("ask", "c")).error?.code, "23514", "a third origin is refused");
});

// The graph module's three promises -- Meta may recategorise instead of rejecting (allow_category_change), Meta's own
// words come back (error_user_msg over the generic message), and one language goes by name AND its own id, never every
// language of that name -- are run through the edge's doors in templates-doors.test.mjs; that no caller can omit the id
// is the typecheck's (`hsmId: string`). The create and delete doors themselves -- the number's own credentials, the row
// made here and by whom, Meta's words back on a refusal, no call to Meta for a row with no id and the row still
// removed -- are run there too. Pinned as meta-templates.ts's and 00047's text until 26 Nov 2026.

// The routes: what Meta refuses is refused first, in the person's words, and a duplicate name is a conflict
// (TEMPLATE_SAME_NAME_WORDS) -- run through POST templates in playbooks/routes/ and, with the guard open, in
// routes/what-meta-holds-is-asked-of-the-edge.test.mjs, where Meta's own reason reaches the person and the create door is asked
// with the words; a template a send or a running playbook still uses cannot go (playbooks/routes/), and one nothing uses
// goes through the edge's delete door by its own id (routes/what-meta-holds-is-asked-of-the-edge.test.mjs); the draft is a
// draft, counted against the assistant's bucket (its policy, playbooks/routes/), its words and their check run below.
// Pinned as the routes' and the services' text until 26 Nov 2026.
test("the duplicate's sentence is contracts', since Ask's message card says it too", () => {
  assert.equal(TEMPLATE_SAME_NAME_WORDS, "A message with that name and language already exists. Pick another name.");
  assert.equal(MODEL_ROUTES.template_draft.model, MODELS.SONNET_5_5, "the draft asks the registry's model for it");
});

test("the job fills the slots per person and holds anyone a slot cannot be filled for; the send route takes specs and refuses a booking-link slot with no link on file", () => {
  const h = readCode("packages/jobs/src/handlers/broadcast-send.ts");
  // The slots per person and the hold on an unfillable one are run: broadcasts/core-broadcast/.
  assert.ok(h.includes('const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";'));
  // The specs and the booking-link refusal are run: broadcasts/core-campaigns/. Delete is the last item of a message's
  // name menu, drawn whole in templates/sheet/message-versions-page.test.mjs; the composer is drawn and typed into, its
  // brief drafted, its name, body and examples set and submitted, in broadcasts/page/a-broadcast-s-state.test.mjs; the
  // verbs it presses are imported, not published, and ask their routes (routes/the-library-s-verbs-ask-their-routes.test.mjs).
  // The business name a slot is filled with falls back to the workspace's name: the one read left here, since only a
  // whole run of the job reaches it (workspaceFacts is the handler's own).
  // An approval is news the owner waits for, told with what it was approved as: run, by value, in
  // whatsapp/a-template-s-verdict-reaches-its-row.test.mjs.
});

test("a template draft asks the registry's model with its thinking off, and what it writes is the draft", async () => {
  // The 30 Oct 2026 replay: a model that thinks by default ran out of the draft's 900 tokens on 3 drafts in 12.
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const { draftTemplate } = await import(at("apps/dashboard/src/server/drafts/template/draft.ts"));
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

test("a draft is told the rules its kind and its workspace hold it to, and what it writes passes the check a submission does", async () => {
  // (draft.ts's text was pinned for these until 26 Nov 2026.)
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const { draftTemplate } = await import(at("apps/dashboard/src/server/drafts/template/draft.ts"));
  const real = globalThis.fetch;
  const draftOf = async (written, input) => {
    const frames = [
      { type: "message_start", message: { id: "msg_1", model: MODELS.SONNET_5_5, usage: { input_tokens: 900 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify(written) } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 60 } },
      { type: "message_stop" },
    ]
      .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join("");
    const sent = [];
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
        brief: "Twenty percent off colour this week",
        language: "en",
        ...input,
      });
      return { out, system: JSON.stringify(sent[0]?.request?.system ?? "") };
    } finally {
      globalThis.fetch = real;
    }
  };
  const offer = {
    name: "colour_offer",
    body: "Hi {{1}}, twenty percent off any colour at Harbor Studio this week.",
    footer: "Reply STOP to opt out",
    examples: ["Ana"],
    variables: [{ position: 1, label: "First name", source: "first_name" }],
  };
  const marketing = await draftOf(offer, { category: "marketing" });
  assert.equal(marketing.out.ok, true, marketing.out.message);
  assert.match(marketing.system, /Answer with one JSON object and nothing else/);
  assert.match(marketing.system, /The footer must say how to opt out/, "a marketing draft carries the opt-out line");
  assert.match(marketing.system, /do not use a booking_link slot/, "no slot the workspace cannot fill");
  const utility = await draftOf({ ...offer, footer: null }, { category: "utility" });
  assert.doesNotMatch(utility.system, /The footer must say how to opt out/, "a notice needs no opt-out line");
  // What the model writes is held to the same check a submission is: a body that opens on a value is refused.
  const broken = await draftOf(
    { ...offer, body: "{{1}}, twenty percent off any colour this week." },
    { category: "marketing" },
  );
  assert.equal(broken.out.ok, false);
  assert.equal(broken.out.reason, "invalid");
  assert.match(broken.out.message, /^The draft broke a WhatsApp rule/);
});
