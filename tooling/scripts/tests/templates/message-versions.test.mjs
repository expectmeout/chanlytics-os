/**
 * A message and its versions (One message, every channel, step 1): an email or a text version fills its message's
 * numbered slots and no others, keeps to its channel's limits, is stored in Meta's component shape and read back the
 * same, and is filled for one person with what the sender adds and nothing else. And the moments the lifecycle set
 * offers for a new playbook, with the one rule a moment and its message agree by.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_SUBJECT_MAX,
  MESSAGE_MOMENT_WORDS,
  MOMENTS_RETIRED,
  PLAYBOOK_TRIGGERS,
  SMS_SEGMENTS_MAX,
  STARTER_LANGUAGES,
  STARTER_TEMPLATES,
  VERSION_CHANNELS,
  VERSION_CHANNEL_WORDS,
  fillSlots,
  isReachOutRow,
  messageFitsMoment,
  momentOffered,
  renderOwnVersion,
  smsSegments,
  smsStopLine,
  smsVersionSegments,
  starterText,
  triggerOffered,
  validateEmailVersion,
  validateOwnVersion,
  validateSmsVersion,
  versionComponents,
  versionSlotsRefusal,
  versionWords,
  versionsOf,
} from "@chanlytics/contracts";

test("the channels a message has versions on, in the order a page offers them, by the names a page says", () => {
  assert.deepEqual([...VERSION_CHANNELS], ["whatsapp", "email", "sms"]);
  assert.deepEqual(VERSION_CHANNEL_WORDS, { whatsapp: "WhatsApp", email: "Email", sms: "Text" });
});

test("a version fills its message's slots and no others: it may leave one out, never add one", () => {
  assert.equal(versionSlotsRefusal("Hi {{1}}, from {{3}}", 3), null, "leaving {{2}} out is fine");
  assert.equal(versionSlotsRefusal("Hi there", 3), null, "so is filling none");
  assert.equal(
    versionSlotsRefusal("Hi {{1}} {{4}}", 3),
    "{{4}} is not one of this message's values: it has {{1}} to {{3}}.",
  );
  assert.equal(versionSlotsRefusal("Hi {{2}}", 1), "{{2}} is not one of this message's values: it has {{1}}.");
  assert.equal(versionSlotsRefusal("Hi {{1}}", 0), "This message fills no values, so {{1}} has nothing to take.");
  assert.equal(versionSlotsRefusal("Hi {{0}}", 2), "{{0}} is not one of this message's values: it has {{1}} to {{2}}.");
});

test("an email version: a subject and a body, each within its limit, and the slot rule on both", () => {
  const ok = validateEmailVersion(
    { subject: "  Your   appointment {{3}} ", body: "Hi {{1}},\r\n\r\nSee you {{3}}." },
    4,
  );
  assert.equal(ok.ok, true);
  assert.deepEqual(
    ok.value,
    { subject: "Your appointment {{3}}", body: "Hi {{1}},\n\nSee you {{3}}." },
    "spaces folded, CRLF read as LF",
  );
  assert.deepEqual(ok.warnings, []);
  assert.deepEqual(validateEmailVersion({ subject: "", body: "Hi" }, 1), {
    ok: false,
    error: "Give the email a subject.",
  });
  assert.deepEqual(validateEmailVersion({ subject: "Hello", body: " " }, 1), { ok: false, error: "Write the email." });
  assert.equal(validateEmailVersion({ subject: "x".repeat(EMAIL_SUBJECT_MAX + 1), body: "Hi" }, 1).ok, false);
  assert.deepEqual(validateEmailVersion({ subject: "From {{5}}", body: "Hi" }, 2), {
    ok: false,
    error: "{{5}} is not one of this message's values: it has {{1}} to {{2}}.",
  });
  assert.deepEqual(validateEmailVersion({ subject: "{{2}}", body: "Hi\n\n\n\nthere" }, 2).warnings, [
    "A subject that is only a value reads as empty to anyone it misses.",
    "More than one blank line in a row reads as a gap in most inboxes.",
  ]);
});

test("a text version: its parts counted with the STOP line the sender adds, plain letters and accents alike", () => {
  // The carriers' GSM-7 letters go 160 to one part and 153 each when several; anything else sends the whole text as
  // UCS-2, 70 to one part and 67 each when several. é, ñ and ¿ are GSM-7; á, í, ó and ú are not.
  assert.deepEqual(smsSegments(""), { segments: 0, chars: 0, perSegment: 160, unicode: false });
  assert.deepEqual(smsSegments("x".repeat(160)), { segments: 1, chars: 160, perSegment: 160, unicode: false });
  assert.deepEqual(smsSegments("x".repeat(161)), { segments: 2, chars: 161, perSegment: 153, unicode: false });
  assert.equal(smsSegments("¿Qué tal? Mañana").unicode, false);
  assert.equal(smsSegments("Aquí").unicode, true);
  assert.deepEqual(smsSegments("í".repeat(71)), { segments: 2, chars: 71, perSegment: 67, unicode: true });
  // The GSM-7 extension table ({ } [ ] \ ^ ~ | €, the form feed) is an escape and the character: two septets each, and
  // still no reason to send the text as UCS-2. `chars` is what the carrier counts.
  for (const c of ["{", "}", "[", "]", "\\", "^", "~", "|", "€", "\f"]) {
    assert.deepEqual(
      smsSegments(c.repeat(80)),
      { segments: 1, chars: 160, perSegment: 160, unicode: false },
      `80 of ${JSON.stringify(c)} fill one segment`,
    );
    assert.deepEqual(
      smsSegments(c.repeat(81)),
      { segments: 2, chars: 162, perSegment: 153, unicode: false },
      `REGRESSION guard: 81 of ${JSON.stringify(c)} cost 162 septets, not 81 characters`,
    );
  }
  assert.deepEqual(smsSegments("x".repeat(158) + "€"), { segments: 1, chars: 160, perSegment: 160, unicode: false });
  assert.deepEqual(smsSegments("x".repeat(159) + "€"), { segments: 2, chars: 161, perSegment: 153, unicode: false });
  // Its escape pair never splits across two segments: at the 153rd septet it moves whole to the next one.
  assert.deepEqual(smsSegments("x".repeat(152) + "€" + "y".repeat(10)), {
    segments: 2,
    chars: 164,
    perSegment: 153,
    unicode: false,
  });
  assert.equal(smsSegments("x".repeat(151) + "€" + "y".repeat(153)).segments, 2, "the pair fits at the segment's end");
  assert.equal(
    smsSegments("x".repeat(152) + "€" + "y".repeat(152)).segments,
    3,
    "306 septets, but the pair moved down one",
  );
  assert.equal(smsSegments("a { b } c").unicode, false, "an extension character is not unicode");
  assert.equal(smsSegments("a { b } ñ ☺").unicode, true, "an emoji still is");
  // A text of extension characters tips a version over its limit with its STOP line sooner than its length says.
  assert.deepEqual(validateSmsVersion({ body: "{".repeat(300) }, 0, "en_US"), {
    ok: false,
    error: `With the STOP line this text takes 5 parts; keep it to ${SMS_SEGMENTS_MAX}.`,
  });
  // A slot's braces never go (what fills it does), so a version counts a slot as long as it is written, in plain
  // letters: 28 written, the line break and the 21 of the STOP line, where its four braces doubled would say 58.
  assert.deepEqual(smsVersionSegments("Hi {{1}}, hours start {{2}}.", "en_US"), {
    segments: 1,
    chars: 50,
    perSegment: 160,
    unicode: false,
  });
  assert.equal(
    smsVersionSegments("Total {€}", "en_US").chars,
    6 + 3 * 2 + 1 + 21,
    "a brace that is no slot's still doubles, as the euro does",
  );
  assert.equal(smsStopLine("en_US"), "Reply STOP to opt out");
  assert.equal(smsStopLine("es"), "Responde STOP para darte de baja");
  assert.equal(smsStopLine("es_MX"), "Responde STOP para darte de baja");

  const ok = validateSmsVersion({ body: "Hi {{1}}, see you {{2}}." }, 2, "en_US");
  assert.deepEqual(ok, { ok: true, value: { subject: null, body: "Hi {{1}}, see you {{2}}." }, warnings: [] });
  assert.deepEqual(validateSmsVersion({ body: "" }, 1, "en_US"), { ok: false, error: "Write the text." });
  const three = validateSmsVersion({ body: "x".repeat(400) }, 0, "en_US");
  assert.deepEqual(three.warnings, ["With the STOP line this text goes as 3 parts, and each part is billed."]);
  const five = validateSmsVersion({ body: "x".repeat(700) }, 0, "en_US");
  assert.deepEqual(five, {
    ok: false,
    error: `With the STOP line this text takes 5 parts; keep it to ${SMS_SEGMENTS_MAX}.`,
  });
  assert.equal(validateOwnVersion("sms", { body: "Hi {{3}}" }, 2, "en_US").ok, false, "the slot rule holds for a text");
  assert.equal(validateOwnVersion("email", { subject: "Hi", body: "Hi {{1}}" }, 1, "en_US").ok, true);
});

test("a version is stored in Meta's component shape, and read back the same", () => {
  const email = versionComponents("email", { subject: "Your appointment {{3}}", body: "Hi {{1}}" });
  assert.deepEqual(email, [
    { type: "HEADER", format: "TEXT", text: "Your appointment {{3}}" },
    { type: "BODY", text: "Hi {{1}}" },
  ]);
  assert.deepEqual(versionWords({ channel: "email", components: email }), {
    subject: "Your appointment {{3}}",
    body: "Hi {{1}}",
  });
  const sms = versionComponents("sms", { subject: "ignored", body: "Hi {{1}}" });
  assert.deepEqual(sms, [{ type: "BODY", text: "Hi {{1}}" }], "a text has no subject to store");
  assert.deepEqual(versionWords({ channel: "sms", components: sms }), { subject: null, body: "Hi {{1}}" });
  assert.deepEqual(
    versionWords({ channel: "email", components: null, body_preview: "Only the preview" }),
    { subject: null, body: "Only the preview" },
    "a row with no components still has its preview",
  );
  assert.deepEqual(
    versionWords({
      channel: "whatsapp",
      components: [
        { type: "header", text: "A heading" },
        { type: "body", text: "Hi" },
      ],
    }),
    { subject: null, body: "Hi" },
    "a WhatsApp heading is not a subject; Meta's lower-case types read the same",
  );
});

test("one person's copy: the slots filled, a text's STOP line added, an email's footer left to the sender", () => {
  assert.equal(fillSlots("Hi {{1}}, from {{2}} {{2}}", ["Dani", "Luna"]), "Hi Dani, from Luna Luna");
  assert.equal(fillSlots("Hi {{1}}, {{3}}", ["Dani"]), "Hi Dani, {{3}}", "a slot with no value shows as written");
  assert.deepEqual(
    renderOwnVersion("email", { subject: "This month at {{2}}", body: "Hi {{1}}" }, ["Dani", "Luna"], "en_US"),
    {
      subject: "This month at Luna",
      body: "Hi Dani",
    },
  );
  assert.deepEqual(renderOwnVersion("sms", { subject: null, body: "Hola {{1}}" }, ["Dani"], "es"), {
    subject: null,
    body: "Hola Dani\nResponde STOP para darte de baja",
  });
});

test("a message's versions are the rows of its name by channel; a reach-out's emails are no message's", () => {
  const rows = [
    { id: "a", name: "visit_reminder", channel: "whatsapp", language: "en_US" },
    { id: "b", name: "visit_reminder", channel: "whatsapp", language: "es" },
    { id: "c", name: "visit_reminder", channel: "email", language: "en_US" },
    { id: "d", name: "visit_reminder", channel: "sms", language: "en_US" },
    { id: "e", name: "quick_note", channel: "email", language: "en_US" },
    { id: "f", name: "visit_reminder", channel: "voice", language: "en_US" },
    { id: "g", name: "reach_out_abc", channel: "email", language: "en" },
  ];
  const v = versionsOf(rows, "visit_reminder");
  assert.deepEqual(Object.fromEntries(Object.entries(v).map(([k, list]) => [k, list.map((r) => r.id)])), {
    whatsapp: ["a", "b"],
    email: ["c"],
    sms: ["d"],
  });
  assert.deepEqual(versionsOf(rows, "reach_out_abc"), { whatsapp: [], email: [], sms: [] });
  assert.equal(isReachOutRow({ name: "reach_out_abc" }), true);
  assert.equal(isReachOutRow({ name: "winback_reply" }), false);
});

test("every starter's email and text versions keep to its slots and pass their checks with no warnings", () => {
  for (const s of STARTER_TEMPLATES) {
    for (const { id } of STARTER_LANGUAGES) {
      const slots = starterText(s, id).slots.length;
      const email = s.email?.[id];
      if (email)
        assert.deepEqual(
          validateEmailVersion(email, slots),
          { ok: true, value: email, warnings: [] },
          `${s.key} email ${id}`,
        );
      const sms = s.sms?.[id];
      if (sms) {
        assert.deepEqual(
          validateSmsVersion(sms, slots, id),
          { ok: true, value: { subject: null, body: sms.body }, warnings: [] },
          `${s.key} text ${id}`,
        );
        // A Spanish text keeps to the letters the carriers send plainly, so the STOP line never doubles its parts.
        assert.equal(
          smsSegments(`${sms.body}\n${smsStopLine(id)}`).unicode,
          false,
          `${s.key} text ${id} is plain letters`,
        );
      }
      if (s.category === "marketing") assert.equal(s.sms, undefined, `${s.key}: an offer has no text version`);
    }
  }
});

test("the moments offered for a new playbook: no retired one, and one win-back, the one the workspace can read", () => {
  const offered = (o) => PLAYBOOK_TRIGGERS.filter((t) => momentOffered(t, o)).map((t) => t.id);
  // No calendar: no appointment moment either (D44, 9 Oct 2026), since without one its run reads nothing. The proposal
  // follow-up is every workspace's (0008, amended 18 Oct 2026).
  assert.deepEqual(offered({ calendarOn: false }), ["quiet_30", "everyone_monthly", "saved_list", "proposal_waiting"]);
  assert.deepEqual(offered({ calendarOn: true }), [
    "everyone_monthly",
    "visit_tomorrow",
    "visited",
    "lapsed",
    "saved_list",
    "proposal_waiting",
    // A calendar frees times when its appointments are cancelled (decision 0081).
    "slot_opened",
  ]);
  assert.deepEqual(Object.keys(MOMENTS_RETIRED), ["new_week", "phoned_only"]);
  // A playbook already made on a retired moment keeps running: the run asks triggerOffered, which they still pass.
  for (const id of Object.keys(MOMENTS_RETIRED))
    assert.equal(triggerOffered(PLAYBOOK_TRIGGERS.find((t) => t.id === id)), true, id);
  const label = (id) => PLAYBOOK_TRIGGERS.find((t) => t.id === id).label;
  assert.equal(label("quiet_30"), "Win-back");
  assert.equal(label("lapsed"), "Win-back", "the two win-backs are one moment, read two ways");
  assert.equal(PLAYBOOK_TRIGGERS.find((t) => t.id === "visited").cls, "booking", "after a visit runs under Booking");
});

test("a moment and its message agree on the yes they need, or the playbook is refused in these words", () => {
  assert.deepEqual(messageFitsMoment("booking", "utility"), { ok: true });
  assert.deepEqual(messageFitsMoment("follow_up", "utility"), { ok: true });
  assert.deepEqual(messageFitsMoment("reengage", "marketing"), { ok: true });
  assert.deepEqual(messageFitsMoment("campaign", "marketing"), { ok: true });
  assert.deepEqual(messageFitsMoment("booking", "marketing"), {
    ok: false,
    why: "offer_on_texts",
    words: MESSAGE_MOMENT_WORDS.offer_on_texts,
  });
  assert.deepEqual(messageFitsMoment("reengage", "utility"), {
    ok: false,
    why: "texts_on_offers",
    words: MESSAGE_MOMENT_WORDS.texts_on_offers,
  });
  assert.equal(
    messageFitsMoment("booking", null).ok,
    false,
    "a message no channel named is an offer, as the send reads it",
  );
});

test("a version as a page is handed it, its components left behind and its heading kept, reads the same subject", () => {
  assert.deepEqual(versionWords({ channel: "email", header: "Your appointment {{3}}", body_preview: "Hi {{1}}" }), {
    subject: "Your appointment {{3}}",
    body: "Hi {{1}}",
  });
  assert.deepEqual(
    versionWords({ channel: "sms", header: "ignored", body_preview: "Hi {{1}}" }),
    { subject: null, body: "Hi {{1}}" },
    "a text has no subject, whatever it carries",
  );
});

test("a composer opens on the set's own starter for its moment, else one it replaced that the workspace still holds", async () => {
  const { defaultTemplate } = await import("@chanlytics/contracts");
  const row = (name) => ({ name, language: "en_US", category: "marketing", source: "chanlytics" });
  assert.equal(
    defaultTemplate([row("quick_note"), row("winback_reply"), row("winback_offer")], "quiet_30").name,
    "winback_reply",
  );
  assert.equal(
    defaultTemplate([row("quick_note"), row("winback_offer")], "quiet_30").name,
    "winback_offer",
    "a win-back added before the set changed is still that workspace's win-back",
  );
  assert.equal(defaultTemplate([row("quick_note"), row("winback_offer")], "lapsed").name, "winback_offer");
  assert.equal(
    defaultTemplate([row("this_months_offer"), row("monthly_offer")], "everyone_monthly").name,
    "this_months_offer",
  );
});
