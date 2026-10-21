/**
 * The starter set (2 Oct 2026, the lifecycle set): eight messages written for the moments Chanlytics acts on (the review
 * ask the eighth, 10 Oct 2026, offered where the Google listing keeps a review link), in English and Spanish, each a name with a version per channel (One message, every channel): WhatsApp's, an email's and
 * a text's where the channel means something for it. Every WhatsApp version passes the check a template written by
 * hand passes, with no warnings, so what a new workspace gets is a set WhatsApp is expected to approve; every email
 * and text version passes its own channel's check the same way. Titles for people, names for the wire; the slots
 * known, the playbooks matched; one idempotent door adds the set, and files the email and text versions beside each
 * WhatsApp one (template-versions.test.mjs runs it).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOMENT_TRIGGERS,
  PLAYBOOK_PATCH_WORDS,
  STARTER_LANGUAGES,
  STARTER_TEMPLATES,
  bookingTemplate,
  compareTemplates,
  defaultParamSpecs,
  defaultSlotKinds,
  defaultTemplate,
  guessSlotKind,
  isLibrarySample,
  paramSaid,
  slotLabels,
  starterByKey,
  starterByName,
  starterDraft,
  starterEmailText,
  starterForTrigger,
  starterIndex,
  starterPreview,
  starterSmsText,
  starterText,
  startersForTrigger,
  startersOffered,
  templateTitle,
  validateOwnVersion,
  validateTemplateDraft,
} from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "../_source.mjs";

/** The set a workspace with deals on and a review link on its Google listing is offered, in the order a composer opens on. */
const OFFERED = [
  "winback_reply",
  "this_months_offer",
  "visit_reminder",
  "after_visit_check",
  "after_visit_review",
  "proposal_follow_up",
  "quick_note",
  "call_text",
];
/** What it replaced: never offered again, found by name for a workspace that added one. */
const RETIRED = ["winback_offer", "welcome_new", "save_our_number", "monthly_offer", "after_visit", "booking_link"];
/** A workspace's shape as the set is offered by it: deals on, and its Google listing keeping a review link. */
const ALL = { reviewLink: true };

test("eight starters are offered in the library's order, six are retired and still found by name; each in English and Spanish", () => {
  assert.deepEqual(
    startersOffered(ALL).map((s) => s.key),
    OFFERED,
  );
  assert.deepEqual(
    STARTER_TEMPLATES.map((s) => s.key),
    [...OFFERED, ...RETIRED],
    "the offered set first, the order a composer opens on, then what it replaced",
  );
  assert.deepEqual(
    STARTER_LANGUAGES.map((l) => l.id),
    ["en_US", "es"],
  );
  for (const key of RETIRED) {
    const s = starterByName(key);
    assert.ok(s?.retired, `${key} is retired and still found by its name`);
    assert.equal(typeof s.retired.why, "string");
    assert.ok(
      s.retired.by === null || OFFERED.includes(s.retired.by),
      `${key} is replaced by a starter still offered, or by none`,
    );
    assert.ok(!startersOffered(ALL).includes(s), `${key} is never offered`);
  }
  for (const key of OFFERED) assert.equal(starterByName(key)?.retired, undefined, key);
  assert.deepEqual(
    startersOffered(ALL)
      .filter((s) => s.trigger === null)
      .map((s) => s.key),
    ["quick_note", "call_text"],
    "the two that no moment sends: a note for any broadcast, and the call's text",
  );
});

test("every WhatsApp version passes the hand-written check with no warnings, and the slots are the same in both languages", () => {
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

test("every email and text version passes its channel's check with no warnings, fills only its message's slots, and is written where the channel means something", () => {
  for (const s of STARTER_TEMPLATES) {
    for (const l of STARTER_LANGUAGES) {
      const slots = starterText(s, l.id).slots.length;
      const email = s.email?.[l.id];
      if (email) {
        const check = validateOwnVersion("email", email, slots, l.id);
        assert.equal(check.ok, true, `${s.key}/${l.id} email: ${check.ok ? "" : check.error}`);
        assert.deepEqual(check.warnings, [], `${s.key}/${l.id} email warns: ${check.warnings.join(" | ")}`);
        assert.equal(starterEmailText(s, l.id), email, "read back in its own language");
      }
      const sms = s.sms?.[l.id];
      if (sms) {
        const check = validateOwnVersion("sms", sms, slots, l.id);
        assert.equal(check.ok, true, `${s.key}/${l.id} text: ${check.ok ? "" : check.error}`);
        assert.deepEqual(check.warnings, [], `${s.key}/${l.id} text warns: ${check.warnings.join(" | ")}`);
        assert.equal(starterSmsText(s, l.id), sms);
      }
    }
    // A version is in both languages or neither: a person never meets half a channel.
    for (const channel of ["email", "sms"])
      assert.deepEqual(
        Object.keys(s[channel] ?? {}).sort(),
        s[channel] ? ["en_US", "es"] : [],
        `${s.key}: its ${channel} version is in both languages or absent`,
      );
  }
  for (const s of startersOffered(ALL)) {
    // Texts carry no offers (deliver.ts): a marketing message has no text version, and a utility one has.
    assert.equal(
      !!s.sms,
      s.category === "utility",
      `${s.key}: ${s.category} ${s.sms ? "has" : "has no"} a text version`,
    );
    // A caller has a phone and no address: the call's text is the one message with no email.
    assert.equal(!!s.email, s.key !== "call_text", `${s.key}: its email version`);
  }
  assert.ok(starterByKey("call_text").sms && !starterByKey("call_text").email);
  assert.deepEqual(
    startersOffered(ALL)
      .filter((s) => s.email && s.sms)
      .map((s) => s.key),
    ["visit_reminder", "after_visit_check", "after_visit_review", "proposal_follow_up"],
    "the four about a person's own appointment or proposal go by every channel",
  );
});

test("a version never fills a slot its message does not have, and a text without its message's slots is refused", () => {
  const visit = starterByKey("visit_reminder");
  const slots = starterText(visit, "en_US").slots.length;
  assert.equal(validateOwnVersion("email", { subject: "Hi {{5}}", body: "Hello" }, slots, "en_US").ok, false);
  const refused = validateOwnVersion("sms", { body: `See you {{${slots + 1}}}` }, slots, "en_US");
  assert.equal(refused.ok, false);
  assert.match(refused.error, /is not one of this message's values/);
});

test("the call's text: bookingTemplate prefers call_text, then booking_link, then any approved template that fills with the booking link", () => {
  const slots = [{ position: 1 }, { position: 2 }, { position: 3 }];
  const row = (name, over = {}) => ({ name, language: "en_US", meta_status: "approved", variables: slots, ...over });
  const custom = row("reservar_ahora", {
    variables: [{ position: 1, label: "Booking link", example: "https://booksy.example.com/x" }],
  });
  assert.equal(bookingTemplate([custom, row("booking_link"), row("call_text")])?.name, "call_text");
  assert.equal(bookingTemplate([custom, row("booking_link")])?.name, "booking_link", "the one it replaced still works");
  assert.equal(bookingTemplate([custom])?.name, "reservar_ahora", "or the workspace's own");
  assert.equal(
    bookingTemplate([row("call_text", { meta_status: "pending" }), row("booking_link")])?.name,
    "booking_link",
    "a call's text Meta has not approved is not one to send",
  );
  assert.equal(
    bookingTemplate([row("quick_note")]),
    null,
    "a message with no booking link is not the booking template",
  );
  assert.equal(bookingTemplate([]), null);
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
  // The set's own starter for each moment; a moment no longer offered for a new playbook still finds the one it was made with.
  assert.deepEqual(
    Object.fromEntries(
      [
        "quiet_30",
        "lapsed",
        "everyone_monthly",
        "visit_tomorrow",
        "visited",
        "proposal_waiting",
        "new_week",
        "phoned_only",
      ].map((id) => [id, starterForTrigger(id)?.key]),
    ),
    {
      quiet_30: "winback_reply",
      lapsed: "winback_reply",
      everyone_monthly: "this_months_offer",
      visit_tomorrow: "visit_reminder",
      visited: "after_visit_check",
      proposal_waiting: "proposal_follow_up",
      new_week: "welcome_new",
      phoned_only: "save_our_number",
    },
  );
  // A reach-out's words are its own email (Part 4), never a WhatsApp starter.
  for (const id of ["lead_first", "after_step"]) assert.equal(starterForTrigger(id), null, id);
  assert.equal(starterForTrigger(null)?.key, undefined, "the quick note is for broadcasts, not a trigger");
  assert.equal(starterByKey("quick_note").trigger, null);
  // A workspace that holds the retired win-back sees it listed beside the set's own, so the two are called apart.
  assert.equal(starterByName("winback_offer").title, "Win-back (earlier)");
  assert.equal(starterByName("winback_reply").title, "Win-back", "the one that took its place keeps the name");
  assert.equal(starterByName("monthly_offer").title, "This month's offer (earlier)");
  assert.equal(starterByName("nope"), null);
  assert.equal(templateTitle("winback_offer"), "Win-back (earlier)");
  assert.equal(templateTitle("approval_confirmation"), "Approval confirmation");
  assert.equal(templateTitle("booking_link"), "Booking link", "the starter's own title");
  assert.equal(templateTitle("spring_offer_v2"), "Spring offer", "a version suffix is not a word");
  assert.equal(
    templateTitle("booking_link", "Thanks for reaching out"),
    "Thanks for reaching out",
    "the workspace's own words win",
  );
  assert.equal(templateTitle("winback_offer", "   "), "Win-back (earlier)", "an empty title is no title");
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
  // A review's link is a link too, and the drafter labels it so: the review link, never the booking link (00415).
  assert.equal(guessSlotKind("Review link", null), "review_link");
  assert.equal(guessSlotKind("Reviews link", null), "review_link");
  assert.equal(guessSlotKind("Enlace para la reseña", null), "review_link");
  assert.equal(guessSlotKind("Value 3", "https://search.google.com/local/writereview?placeid=x"), "review_link");
  // The word, never the letters inside another: a preview, a service reviewed or a reviewer is typed text.
  for (const label of ["Preview", "Service reviewed", "Reviewer"])
    assert.equal(guessSlotKind(label, null), "text", label);
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

test("a slot's value as a card quotes it, the one rule every card says it by: typed words in quotes, a value a run fills by its name", () => {
  assert.equal(paramSaid({ kind: "text", value: "15% off a colour" }), "“15% off a colour”");
  assert.equal(paramSaid({ kind: "first_name" }), "their first name");
  assert.equal(paramSaid({ kind: "review_link" }), "the review link");
  assert.equal(
    PLAYBOOK_PATCH_WORDS.params([{ kind: "first_name" }, { kind: "text", value: "15% off a colour" }]),
    `Its words changed: ${paramSaid({ kind: "first_name" })}, ${paramSaid({ kind: "text", value: "15% off a colour" })}`,
    "a campaign's change card says its words by the same rule",
  );
});

test("the door: idempotent, one language at a time, synced in when the number's account already holds it, Meta's own words when it refuses", async () => {
  const r = readCode(
    "apps/dashboard/app/api/v1/templates/starter/route.ts",
    "apps/dashboard/src/server/campaigns/starter-templates.ts",
  );
  assert.ok(r.includes('role: "operator",') && r.includes('rate: "settings",'));
  assert.ok(
    /status: "exists",\s*meta_status: have\.meta_status,\s*versions: await versionsOf\(s, l\)/.test(r),
    "already on file is left alone, and its email and text versions are filed beside it (run in template-versions.test.mjs)",
  );
  assert.ok(
    r.includes("const check = validateTemplateDraft(starterDraft(s, l));"),
    "the same check a hand-written template passes",
  );
  assert.ok(
    r.includes('if (r.reason === "meta_refused" && ALREADY_AT_META.test(r.detail ?? "")) {') &&
      r.includes("await syncTemplates(tenantId, ctx.userId);"),
    "a shared account's copy is synced in, not refused",
  );
  assert.ok(
    /status: "submitted",\s*meta_status: r\.metaStatus,\s*versions: await versionsOf\(s, l\)/.test(r),
    "a submission is followed by its versions",
  );
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
  const refreshMap = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  assert.deepEqual(
    refreshMap.AFTER["POST templates/starter"]().map((o) => o.key),
    ["settings"],
    "the playbook composer learns of a newly added starter from the settings read it is made of, with no hook of its own",
  );
  assert.equal(Object.hasOwn(refreshMap, "HOOKS"), false, "no window hook is called behind a write any more");
});

test("the pages: titles not names, the starter set in Settings, the message as the customer sees it", () => {
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
    isLibrarySample("hello_world") && s.includes("!isLibrarySample(t.name)"),
    "Meta's sample is never shown, nor counted (contracts library-count.ts: the one list)",
  );
  assert.ok(
    s.includes("<MessagePreview") &&
      s.includes("header={row ? row.header : null}") &&
      s.includes("buttons={row ? row.buttons : null}"),
    "the card is the WHOLE message as the customer sees it: its heading and its buttons too",
  );
  assert.ok(
    // Messages is the view of Campaigns it is (19 Oct 2026, `campaigns/messages`): its page a chunk of Campaigns' own.
    readCode("apps/dashboard/src/surfaces/campaigns/home/campaigns-code.tsx").includes('"TemplatesPage"'),
  );
  // Integrations is Settings › Connections' TSX now (moved from integrations-real.jsx): the pane and its row.
  const integrations = ["pane", "row"]
    .map((f) => readCode(`apps/dashboard/src/surfaces/settings/connections/${f}.tsx`))
    .join(" ");
  assert.ok(
    integrations.includes('messages: "channel-messages"') && !integrations.includes("TemplatesCard"),
    "Integrations points at Messages (the WhatsApp row's verb) and lists no template",
  );
  assert.ok(s.includes("tplTitle(") && s.includes('"Made here"'), "a title, with where it was made under it");
  // Broadcasts' slot choices (moved from broadcasts.jsx), which the run's hook still works out. The send screen that drew
  // them, with its starter set's button and its preview, went with decision 0065's step 7: New writes a first message.
  const b = readCode("apps/dashboard/src/surfaces/campaigns/broadcasts/page/reach.ts");
  assert.ok(
    b.includes("const c = choices[i] || BC_TEXT;") &&
      b.includes("const s = (sources[tplId] || BC_NONE)[i];") &&
      b.includes("return c.includes(s) ? s : c[0];"),
    "a starter's slots come filled in, each with what it may take",
  );
  // The Templates composer (moved from templates-real.jsx): its form and its module, read as one.
  const t = ["composer-forms.tsx", "composer.tsx"]
    .map((f) => readCode(`apps/dashboard/src/surfaces/campaigns/templates/${f}`))
    .join(" ");
  assert.ok(
    t.includes('data-testid="tpl-start-from"') && t.includes("export const starterWords = ") && !t.includes("WaBubble"),
  );
  // Campaigns' rules live in their own sheet; the starter list's own rows (.tpl-starter-*) went with the list.
  const css = readCode("apps/dashboard/src/surfaces/campaigns/campaigns.css");
  assert.ok(css.includes(".mp-bubble {") && !css.includes(".tpl-starter-row"));
});

test("the library's order, what a composer opens on, and each slot's words", () => {
  const rows = [
    { name: "hello_world", category: "utility", source: "meta" },
    { name: "booking_link", category: "marketing", source: "meta" },
    { name: "quick_note", category: "marketing", source: "chanlytics" },
    { name: "approval_request", category: "marketing", source: "meta" },
    { name: "spring_offer", category: "marketing", source: "chanlytics" },
    { name: "winback_offer", category: "marketing", source: "chanlytics" },
    { name: "winback_reply", category: "marketing", source: "chanlytics" },
    { name: "call_text", category: "utility", source: "chanlytics" },
  ];
  assert.deepEqual(
    rows
      .slice()
      .sort(compareTemplates)
      .map((r) => r.name),
    [
      "winback_reply",
      "quick_note",
      "call_text",
      "winback_offer",
      "booking_link",
      "spring_offer",
      "approval_request",
      "hello_world",
    ],
    "the set's starters in the library's order, then the ones it replaced, then written here, then the rest — marketing before utility",
  );
  assert.equal(
    defaultTemplate(
      rows.filter((r) => r.name !== "winback_reply"),
      null,
    ).name,
    "quick_note",
    "a broadcast opens on the quick note",
  );
  assert.equal(defaultTemplate(rows, "quiet_30").name, "winback_reply", "a playbook opens on its trigger's starter");
  assert.equal(
    defaultTemplate(rows, "new_week").name,
    "winback_reply",
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
  assert.equal(starterIndex("winback_reply"), 0, "the library opens on the win-back");
  assert.ok(
    starterIndex("call_text") < starterIndex("winback_offer") &&
      starterIndex("winback_offer") < starterIndex("welcome_new"),
    "what the set replaced sorts after every starter it offers",
  );
  assert.equal(starterIndex("nope"), STARTER_TEMPLATES.length, "a name we did not write sorts after every one we did");
  assert.deepEqual(
    slotLabels({
      name: "this_months_offer",
      language: "es",
      variables: [{ position: 1 }, { position: 2 }, { position: 3 }, { position: 4 }],
    }),
    ["Nombre", "Nombre del negocio", "La oferta", "Enlace de reservas"],
    "the new offer reads its slots the way the one it replaced did",
  );
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
  const one = readCode(
    "apps/dashboard/app/api/v1/templates/[id]/route.ts",
    "apps/dashboard/src/server/campaigns/template-row.ts",
  );
  assert.ok(
    /ctx\.supabase\.rpc\("set_template_hidden", \{\s*p_template_id: id,\s*p_hidden: input\.hidden === true,?\s*\}\)/.test(
      one,
    ) && one.includes('role: "operator",'),
  );
  // The sync hiding Meta's sample on first sight only, and the create door
  // keeping the words a person gave each slot, are run in templates-doors.test.mjs.
  const s = ["page-parts", "message-row-parts"]
    .map((f) => readCode(`apps/dashboard/src/surfaces/campaigns/templates/${f}.tsx`))
    .join(" ");
  // Hide is an item of the pane's kit Menu, which takes no test id of its own: it is among the props its `gate` hands the item's button.
  assert.ok(s.includes('"data-testid": "template-hide"') && s.includes('data-testid="templates-hidden"'));
  const b = readCode("apps/dashboard/src/surfaces/campaigns/templates/verbs.ts");
  assert.ok(b.includes("body: { hidden: true } })") && b.includes("body: { hidden: false } })"));
  const going = readCode("apps/dashboard/src/surfaces/today/pages/going-today.tsx");
  assert.ok(
    going.includes('testid="today-going-row"') && going.includes("GOING_TODAY_WORDS.stop"),
    "a run under the veto window is Today's Going today row, with its Stop (decision 0064)",
  );
  const top = readCode("apps/dashboard/src/surfaces/frame/topbar/topbar.tsx");
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
  const one = readCode(
    "apps/dashboard/app/api/v1/templates/[id]/route.ts",
    "apps/dashboard/src/server/campaigns/template-row.ts",
  );
  assert.ok(
    one.includes('ctx.supabase.rpc("set_template_title", { p_template_id: id, p_title: title || "" })'),
    "empty is no title — the door clears it",
  );
  assert.ok(one.includes('"Say what changes: whether it is hidden, or its title."'));
  const b = readCode("apps/dashboard/src/surfaces/campaigns/templates/verbs.ts");
  assert.ok(
    b.includes("body: { title } })") && b.includes("return templateTitle(t, row?.title ?? null);"),
    "a name is looked up among the workspace's rows",
  );
  const s = readCode("apps/dashboard/src/surfaces/campaigns/templates/message-row-parts.tsx");
  for (const id of ["template-title", "template-title-save"]) assert.ok(s.includes(`data-testid="${id}"`), id);
  // Rename, like Hide, is an item of the pane's kit Menu: its test id rides the item's `gate`.
  assert.ok(s.includes('"data-testid": "template-rename"'), "template-rename");
  // The default names of a broadcast and a playbook use the title: run in core-campaigns.test.mjs.
  assert.ok(
    readCode("apps/dashboard/src/server/readers/templates.ts").includes("source, hidden_at, title"),
    "the composers read it",
  );
});

test("the set a workspace is offered (0006): the proposal follow-up in every workspace (0008, amended 18 Oct 2026), a utility with no figure in it", () => {
  assert.ok(
    startersOffered(ALL).some((s) => s.key === "proposal_follow_up"),
    "offered to every workspace",
  );
  assert.deepEqual(
    startersOffered(ALL).map((s) => s.key),
    OFFERED,
    "and no workspace is offered a starter the set replaced",
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

/** repo/trade-neutral.test.mjs's two predicates, as it writes them: one trade's words, and a visit where an appointment is. */
const BANNED = /\b(salons?|stylists?|balayage|therapists?|chair rental|haircuts?|keratin|blowouts?|lash(?:es)?)\b/i;
const VISIT = /(?<![\w-])visit(?:a)?s?(?![\w-])/i;

test("the day after an appointment has two starters: how did it go, which a composer opens on, and the review ask beside it", () => {
  assert.deepEqual(
    startersForTrigger("visited")
      .filter((s) => !s.retired)
      .map((s) => s.key),
    ["after_visit_check", "after_visit_review"],
    "the set's own, in the library's order",
  );
  assert.deepEqual(
    startersForTrigger("visited").map((s) => s.key),
    ["after_visit_check", "after_visit_review", "after_visit"],
    "then the one the set replaced",
  );
  assert.equal(starterForTrigger("visited").key, "after_visit_check", "nothing picked: how did it go");
});

test("the review ask: a utility message about the appointment they just had, its third slot the review link the Google listing keeps, in every version and both languages", () => {
  const s = starterByKey("after_visit_review");
  assert.deepEqual(
    [s.name, s.title, s.category, s.trigger, s.retired],
    ["after_visit_review", "After the appointment, with a review ask", "utility", "visited", undefined],
  );
  assert.deepEqual(
    STARTER_LANGUAGES.map((l) => starterText(s, l.id).slots),
    [
      [
        { kind: "first_name", label: "First name", example: "Dani" },
        { kind: "business_name", label: "Business name", example: "Luna Studio" },
        { kind: "review_link", label: "Review link", example: "https://g.page/r/example/review" },
      ],
      [
        { kind: "first_name", label: "Nombre", example: "Dani" },
        { kind: "business_name", label: "Nombre del negocio", example: "Luna Studio" },
        { kind: "review_link", label: "Enlace de reseñas", example: "https://g.page/r/example/review" },
      ],
    ],
  );
  // A run and a card fill it from the starter's own sources: the review link is the listing's, never typed.
  assert.deepEqual(defaultParamSpecs({ name: s.name, variables: [] }), [
    { kind: "first_name" },
    { kind: "business_name" },
    { kind: "review_link" },
  ]);
  for (const l of STARTER_LANGUAGES) {
    const sms = starterSmsText(s, l.id);
    const email = starterEmailText(s, l.id);
    assert.ok(sms && sms.body.trim(), `${l.id}: a text version`);
    assert.ok(email && email.subject.trim(), `${l.id}: an email version`);
    // The review link is in each version a customer reads: WhatsApp's, the email's and the text's.
    for (const [channel, body] of [
      ["whatsapp", starterText(s, l.id).body],
      ["email", email.body],
      ["sms", sms.body],
    ])
      assert.ok(body.includes("{{3}}"), `${l.id} ${channel} holds the review link: ${body}`);
    // Any trade's words: an appointment's, never one trade's, and never a visit.
    for (const said of [starterText(s, l.id).body, email.subject, email.body, sms.body]) {
      assert.equal(BANNED.exec(said), null, `a trade's word: ${said}`);
      assert.equal(VISIT.test(said), false, `a visit: ${said}`);
    }
  }
  assert.equal(VISIT.test(`${s.title} ${s.purpose}`), false, "its title and purpose say appointment");
  // As a person picks it: the slot a business has not given is a blank, never the sample filed with Meta.
  assert.ok(starterPreview(s, "en_US", "Harbor Studio").includes("[Review link]"));
});

test("the review ask is offered only where the workspace's Google listing keeps a review link, which its slot is filled from; the rest of the set either way", () => {
  const withLink = startersOffered({ reviewLink: true }).map((s) => s.key);
  const without = startersOffered({ reviewLink: false }).map((s) => s.key);
  assert.ok(withLink.includes("after_visit_review"), "offered with a link");
  assert.deepEqual(
    without,
    withLink.filter((k) => k !== "after_visit_review"),
    "without one, the set less the review ask",
  );
});
