/**
 * Ask's first skill, the customer message writer (contracts ask-skills): its format (the craft call's system prompt holds
 * every part of the skill, its guide is short, a question's words ask for it), its brief (the business, the message, the
 * values, the opt-out line, a text's room, the draft fenced), its checks (each rule a card's words are held to, one case
 * each, and a clean rewrite passes), its rubric (a verdict needs every check and every hard criterion), and its eval's
 * cases and pure parts (tooling/scripts/evals/customer-message.mjs), so the set can be asked when Ruben says.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";
import { briefOf, loadCases, patternFailures, validateCases } from "../../../evals/customer-message.mjs";

const SKILL = C.CUSTOMER_MESSAGE_SKILL;

/** A brief as the card makes one: Harbor Studio, an offer on WhatsApp and email, its three values. */
const brief = (over = {}) => ({
  business: {
    name: "Harbor Studio",
    tone: "Warm and brief.",
    services: ["Consultation", "Follow-up"],
    notes: ["Holiday hours: closed November 27."],
    word: "appointment",
    ...over.business,
  },
  message: {
    name: "autumn_offer",
    category: "marketing",
    language: "en",
    values: [
      { position: 1, label: "First name", kind: "first_name" },
      { position: 2, label: "Business name", kind: "business_name" },
      { position: 3, label: "Booking link", kind: "booking_link" },
    ],
    reused: false,
    draft: {
      whatsapp: { body: "Hi {{1}}, 15% off at {{2}} this October. Book: {{3}}\n\nReply STOP to opt out" },
      email: { subject: "15% off this October", body: "Hi {{1}},\n\n15% off at {{2}} this October.\n\nBook: {{3}}" },
    },
    ...over.message,
  },
});

/** A rewrite that keeps every rule. */
const GOOD = {
  whatsapp: {
    body: "Hi {{1}}, a little something from {{2}}: 15% off this October.\n\nPick a time that suits you here: {{3}}\n\nReply STOP to opt out",
  },
  email: {
    subject: "15% off at {{2}} this October",
    body: "Hi {{1}},\n\nA little something from us: 15% off this October.\n\nPick a time that suits you:\n{{3}}\n\nSee you soon,\n{{2}}",
  },
};

const codes = (v, b = brief(), missing = []) =>
  C.messageCraftIssues(v, b, missing).map((i) => `${i.channel} ${i.code}`);

test("the craft call's system prompt holds the whole skill: its role, jobs, every rule, what it never does, its examples, the data rule", () => {
  const system = C.craftSystem(SKILL);
  assert.ok(system.startsWith(SKILL.role));
  for (const job of SKILL.when.jobs) assert.ok(system.includes(job), job);
  for (const s of SKILL.rules) {
    assert.ok(system.includes(`${s.title}:`), s.title);
    for (const line of s.lines) assert.ok(system.includes(line), line);
  }
  for (const n of SKILL.never) assert.ok(system.includes(n), n);
  SKILL.examples.forEach((e, i) => assert.ok(system.includes(`Example ${i + 1}, ${e.title}.`), e.title));
  assert.ok(system.includes(C.DATA_NOT_INSTRUCTIONS));
  assert.equal(SKILL.craft.effort, "high", "words a customer reads are written at high effort");
  assert.ok(SKILL.craft.maxTokens <= C.SKILL_CRAFT_MAX_TOKENS, "within the edge's ceiling for a craft call");
  assert.ok(C.SKILL_CRAFT_PURPOSES.includes(SKILL.craft.purpose));
});

test("every example's answer keeps the rules it teaches: its values, its opt-out line where it is an offer", () => {
  const [invite, reminder, shell] = SKILL.examples;
  assert.match(
    invite.answer,
    /\\n\\nReply STOP to opt out\nEmail subject/,
    "an offer's WhatsApp ends on its opt-out line",
  );
  assert.doesNotMatch(reminder.answer, /STOP/, "a reminder is utility: no opt-out line, and a text never writes STOP");
  assert.match(reminder.answer, /could_not: \S/, "what it left out of a utility message is said");
  assert.match(shell.answer, /\{\{3\}\}/, "the reused shell keeps the offer's value");
});

test("the guide is a short block, and a question's words ask for the skill in English and Spanish, and only then", () => {
  const block = C.skillGuide("customer_message");
  assert.equal(block, C.guideBlock(SKILL), "a skill's guide by its id is its own guide block");
  assert.ok(block.length <= C.SKILL_GUIDE_MAX, `${block.length} characters`);
  assert.ok(block.startsWith("Skill: Customer message writer."));
  for (const g of SKILL.guide) assert.ok(block.includes(g));
  for (const q of [
    "Write a win-back for people who haven't been in since summer, in Spanish too",
    "draft a text reminding people of tomorrow",
    "Can you make an offer message for November?",
    "Escríbeme un mensaje para los clientes que no vienen hace meses",
    "redacta una oferta 2x1 para el fin de semana",
  ])
    assert.deepEqual(C.skillsAsked(q), ["customer_message"], q);
  for (const q of [
    "who wrote this week?",
    "¿quién me mandó un mensaje hoy?",
    "how many messages failed to deliver?",
    "What did the second one want?",
  ])
    assert.deepEqual(C.skillsAsked(q), [], q);
  assert.ok(C.isAskSkillId("customer_message"));
  assert.ok(!C.isAskSkillId("toString"));
  assert.deepEqual(C.ASK_SKILL_IDS, ["customer_message"]);
});

test("the brief says the business, the message, each value, the opt-out line, and fences its notes and the draft", () => {
  const text = C.messageBriefText(brief());
  assert.match(text, /^The business: Harbor Studio\./);
  assert.match(text, /Its tone, in its own words: Warm and brief\./);
  assert.match(text, /It calls a booking: appointment\./);
  assert.match(text, /Its services: Consultation, Follow-up\./);
  assert.match(text, /<record>\n- Holiday hours: closed November 27\.\n<\/record>/, "notes are context, fenced");
  assert.match(text, /The message: "autumn_offer", marketing: an offer/);
  assert.match(text, /- \{\{1\}\}: their first name\n- \{\{2\}\}: the business name\n- \{\{3\}\}: the booking link/);
  assert.match(text, /The opt-out line: Reply STOP to opt out/);
  assert.match(text, /<record>\nWhatsApp:\nHi \{\{1\}\}, 15% off/);
  assert.match(text, /Write every version the draft has \(whatsapp, email\), and leave the others empty\.$/);
  assert.doesNotMatch(text, /text's room/, "no room said where the draft has no text");
  assert.doesNotMatch(text, /reused/, "a card's own message is not a shell");
});

test("the brief of a reminder in Spanish: utility, no opt-out line, the text's room, the word said in Spanish", () => {
  const b = brief({
    business: { tone: null, notes: [] },
    message: {
      category: "utility",
      language: "es",
      values: [
        { position: 1, label: "Nombre", kind: "first_name" },
        { position: 2, label: "Hora", kind: "visit_when" },
      ],
      draft: {
        whatsapp: { body: "Hola {{1}}, tu cita es el {{2}}." },
        sms: { body: "Hola {{1}}, tu cita es el {{2}}." },
      },
    },
  });
  const text = C.messageBriefText(b);
  assert.match(text, /It has no tone line\./);
  assert.match(text, /It calls a booking: appointment \(say it in Spanish\)\./);
  assert.match(text, /utility: about the person's own booking/);
  assert.match(text, /in Spanish\./);
  assert.doesNotMatch(text, /opt-out line/);
  assert.doesNotMatch(text, /notes in force/);
  // One part: 160 less the Spanish STOP line and its break (33) and the values (9 + 21).
  assert.deepEqual(C.textRoom(b), { plain: 97, unicode: 7, unicodeTwo: 71 });
  assert.match(
    text,
    /The text's room: about 97 characters besides its values .* it cannot be one part: keep it to two, about 71\./,
  );
});

test("an English text is told its one part in plain characters, with no word of a second", () => {
  const b = brief({
    message: {
      category: "utility",
      draft: { whatsapp: { body: "Hi {{1}}, see you at {{2}}: {{3}} soon." }, sms: { body: "Hi {{1}}, see you." } },
    },
  });
  // 160 less the STOP line and its break (22) and the values (9 + "Harbor Studio" 13 + a link 30).
  assert.match(
    C.messageBriefText(b),
    /The text's room: about 86 characters besides its values for one part in plain characters, so no curly quotes and no emoji\./,
  );
});

test("a plan's offer message is a shell: the writer is told to write around the offer's value", () => {
  const b = brief({
    message: {
      reused: true,
      values: [
        { position: 1, label: "First name", kind: "first_name" },
        { position: 2, label: "The offer", kind: "text" },
      ],
    },
  });
  const text = C.messageBriefText(b);
  assert.match(text, /- \{\{2\}\}: typed for each send, "The offer"/);
  assert.match(text, /reused for every later offer.*write around that value, never about one offer/);
});

test("the answer's schema has every channel and could_not; what is kept is the draft's channels, cleaned, and the empty ones said", () => {
  assert.deepEqual(C.MESSAGE_CRAFT_JSON_SCHEMA.required, ["whatsapp", "email", "sms", "could_not"]);
  assert.ok(JSON.stringify(C.MESSAGE_CRAFT_JSON_SCHEMA).length < 8_000, "within the gateway's format limit");
  const answer = C.MessageCraftAnswerSchema.parse({
    whatsapp: { body: "  Hi {{1}}\r\nthere  " },
    email: { subject: "  A   subject ", body: "" },
    sms: { body: "Not asked for" },
    could_not: " ",
  });
  const kept = C.craftedVersions(answer, brief());
  assert.deepEqual(kept.versions, { whatsapp: { body: "Hi {{1}}\nthere" } });
  assert.deepEqual(kept.missing, ["email"], "an email with no body is missing, never quietly dropped");
  assert.equal(kept.couldNot, null);
});

test("a rewrite that keeps every rule passes the checks", () => {
  assert.deepEqual(codes(GOOD), []);
  // The opt-out line may close on a full stop, as people write it.
  assert.deepEqual(codes({ ...GOOD, whatsapp: { body: GOOD.whatsapp.body + "." } }), []);
});

test("WhatsApp's own rules: every value, none at an edge or side by side, its length, its blank lines, an offer's opt-out line", () => {
  const wa = (body) =>
    codes({ whatsapp: { body } }, brief({ message: { draft: { whatsapp: brief().message.draft.whatsapp } } }));
  const stop = "\n\nReply STOP to opt out";
  assert.deepEqual(wa(`Hi {{1}}, from {{2}}: 15% off this October.${stop}`), ["whatsapp values"]);
  assert.deepEqual(wa(`{{1}}, from {{2}}: 15% off this October. Book: {{3}}${stop}`), ["whatsapp value_at_edge"]);
  assert.deepEqual(wa(`Hi {{1}} {{2}}: 15% off this October. Book: {{3}}${stop}`), ["whatsapp values_side_by_side"]);
  assert.deepEqual(wa(`Hi {{1}}, from {{2}}: 15% off this October. Book: {{3}} today`), ["whatsapp opt_out"]);
  assert.deepEqual(wa(`Hi {{1}}, from {{2}}: 15% off this October.\n\n\nBook: {{3}}${stop}`), ["whatsapp blank_lines"]);
  assert.deepEqual(wa(`Hi {{1}}, from {{2}}: 15% off this October. ${"Book soon. ".repeat(100)}{{3}}${stop}`), [
    "whatsapp too_long",
  ]);
  assert.deepEqual(wa(`Hi {name}, from {{2}}: 15% off this October. Book: {{3}}${stop}`), [
    "whatsapp braces",
    "whatsapp values",
  ]);
});

test("nothing beyond the draft: no new price, money word, freebie, number, contact or shouting", () => {
  const wa = (extra) =>
    codes({
      whatsapp: { body: `Hi {{1}}, from {{2}}: 15% off this October. ${extra} Book: {{3}}\n\nReply STOP to opt out` },
    });
  assert.deepEqual(wa("Packs from $45."), ["whatsapp new_price", "whatsapp new_number"]);
  assert.deepEqual(wa("Use the discount code at the desk."), ["whatsapp new_money"]);
  assert.deepEqual(wa("A free gift with every booking."), ["whatsapp new_money"]);
  assert.deepEqual(wa("Feel free to bring a friend."), [], "feel free is no freebie");
  assert.deepEqual(wa("Only 3 places left."), ["whatsapp new_number"]);
  assert.deepEqual(wa("See harbor.example/fall or https://harbor.example."), ["whatsapp typed_contact"]);
  assert.deepEqual(wa("Call 305 555 0100."), ["whatsapp new_number", "whatsapp typed_contact"]);
  assert.deepEqual(wa("BOOK NOW."), ["whatsapp shouting"]);
  assert.deepEqual(
    codes(
      {
        whatsapp: {
          body: `Hi {{1}}, from {{2}} and HARBOR: 15% off this October. Book: {{3}}\n\nReply STOP to opt out`,
        },
      },
      brief({ business: { name: "HARBOR Studio" } }),
    ),
    [],
    "the business's own capitals",
  );
});

test("a utility message promotes nothing, whatever its draft said", () => {
  const b = brief({
    message: {
      category: "utility",
      draft: { whatsapp: { body: "Hi {{1}}, see you at {{2}}. Ask about 10% off! {{3}} soon." } },
    },
  });
  const said = codes({ whatsapp: { body: "Hi {{1}}, see you at {{2}}. Ask about 10% off! Here: {{3}} soon." } }, b);
  assert.ok(said.includes("whatsapp promotes"), said.join(", "));
  assert.deepEqual(
    codes({ whatsapp: { body: "Hi {{1}}, see you at {{2}}. Change it here: {{3}} if you need to." } }, b),
    [],
  );
});

test("a text fits its parts with its values and the STOP line, and never writes STOP; an email has its subject and no way out of its own", () => {
  const utility = (draft, language = "en") =>
    brief({
      message: {
        category: "utility",
        language,
        values: [
          { position: 1, label: "First name", kind: "first_name" },
          { position: 2, label: "Booked time", kind: "visit_when" },
        ],
        draft,
      },
    });
  const en = utility({ sms: { body: "Harbor Studio: hi {{1}}, see you {{2}}." } });
  assert.deepEqual(
    codes({ sms: { body: "Harbor Studio: hi {{1}}, see you {{2}}. Reply here to change it." } }, en),
    [],
  );
  assert.deepEqual(
    codes({ sms: { body: `Harbor Studio: hi {{1}}, see you {{2}}. ${"Reply here to change it. ".repeat(4)}` } }, en),
    ["sms text_parts"],
  );
  assert.deepEqual(codes({ sms: { body: "Harbor Studio: hi {{1}}, see you {{2}}. Reply STOP to stop." } }, en), [
    "sms stop_written",
  ]);
  const es = utility({ sms: { body: "Harbor Studio: hola {{1}}, te esperamos el {{2}}." } }, "es");
  assert.deepEqual(
    codes({ sms: { body: "Harbor Studio: hola {{1}}, te esperamos el {{2}}. Responde aquí." } }, es),
    [],
    "two parts with an accent, in Spanish",
  );
  assert.deepEqual(
    codes(
      {
        sms: {
          body: `Harbor Studio: hola {{1}}, te esperamos el {{2}}. ${"Si necesitas cambiarla, responde aquí. ".repeat(3)}`,
        },
      },
      es,
    ),
    ["sms text_parts"],
  );
  const mail = (email) => codes({ ...GOOD, email });
  assert.deepEqual(mail({ subject: "x".repeat(61), body: GOOD.email.body }), ["email subject"]);
  assert.deepEqual(mail({ subject: "Autumn 🍂 at {{2}}", body: GOOD.email.body }), ["email subject"]);
  assert.deepEqual(mail({ subject: GOOD.email.subject, body: `${GOOD.email.body}\n\nUnsubscribe here.` }), [
    "email stop_written",
  ]);
  assert.deepEqual(mail({ subject: GOOD.email.subject, body: `${GOOD.email.body}\n\nReply STOP to stop.` }), [
    "email stop_written",
  ]);
  assert.deepEqual(
    mail({ subject: GOOD.email.subject, body: `${GOOD.email.body}\n\nDon't stop by without booking.` }),
    [],
  );
  assert.deepEqual(mail({ subject: GOOD.email.subject, body: `${GOOD.email.body} {{4}}` }), ["email values"]);
  assert.deepEqual(codes({ whatsapp: GOOD.whatsapp }, brief(), ["email"]), ["email missing"]);
});

test("the rubric: three hard criteria and four soft, each in the judge's words, and a verdict needs every check and hard pass", () => {
  assert.deepEqual(
    C.MESSAGE_RUBRIC.map((c) => [c.id, c.hard]),
    [
      ["approvable", true],
      ["category", true],
      ["facts", true],
      ["one_action", false],
      ["voice", false],
      ["language", false],
      ["channel_fit", false],
    ],
  );
  const system = C.messageJudgeSystem();
  for (const c of C.MESSAGE_RUBRIC) assert.ok(system.includes(`- ${c.id}${c.hard ? " (must pass)" : ""}: ${c.ask}`));
  const question = C.messageJudgeQuestion(brief(), GOOD, "Left out a date.");
  assert.ok(question.includes(C.messageBriefText(brief())));
  assert.match(question, /<record>\nWhatsApp:\nHi \{\{1\}\}, a little something/);
  assert.match(question, /What the writer says it left out: Left out a date\./);
  const all = (pass) => ({ verdicts: C.MESSAGE_RUBRIC.map((c) => ({ id: c.id, pass, why: pass ? "fine" : "no" })) });
  assert.deepEqual(C.messageVerdict([], all(true)), { pass: true, failed: [], soft: { passed: 4, of: 4 }, notes: [] });
  const voiceOff = {
    verdicts: all(true).verdicts.map((v) => (v.id === "voice" ? { ...v, pass: false, why: "stiff" } : v)),
  };
  assert.deepEqual(C.messageVerdict([], voiceOff), {
    pass: true,
    failed: [],
    soft: { passed: 3, of: 4 },
    notes: ["voice: stiff"],
  });
  const noFacts = { verdicts: all(true).verdicts.filter((v) => v.id !== "facts") };
  assert.deepEqual(C.messageVerdict([], noFacts).failed, ["facts: the judge gave no verdict"]);
  const issue = { channel: "sms", code: "text_parts", words: "2 parts" };
  assert.deepEqual(C.messageVerdict([issue], all(true)).failed, ["sms text_parts: 2 parts"]);
});

test("the eval's cases are well formed, each makes a brief, and its patterns read the words without their values", () => {
  const cases = loadCases();
  assert.deepEqual(validateCases(cases), []);
  assert.ok(cases.length >= 16);
  const kinds = new Set(cases.map((c) => `${c.message.category} ${c.message.language}`));
  for (const k of ["marketing en", "marketing es", "utility en", "utility es"]) assert.ok(kinds.has(k), k);
  for (const ch of C.CRAFT_CHANNELS)
    assert.ok(
      cases.some((c) => c.message.draft[ch]),
      ch,
    );
  assert.ok(
    cases.some((c) => c.message.reused),
    "a plan's shell",
  );
  for (const c of cases) {
    const text = C.messageBriefText(briefOf(c));
    assert.ok(text.startsWith(`The business: ${c.business.name}.`), c.id);
  }
  const strict = cases.find((c) => c.id === "news_without_a_price_en");
  assert.deepEqual(
    patternFailures(strict, { whatsapp: { body: "Hi {{1}}, we now install water heaters. Book: {{2}}" } }),
    [],
  );
  assert.deepEqual(patternFailures(strict, { whatsapp: { body: "Hi {{1}}, a free estimate. Book: {{2}}" } }), [
    "must not say /free/",
    "must not say /estimate/",
  ]);
  assert.deepEqual(validateCases([{ id: "x", business: {}, message: { values: [{ position: 2 }] } }]).length > 0, true);
});
