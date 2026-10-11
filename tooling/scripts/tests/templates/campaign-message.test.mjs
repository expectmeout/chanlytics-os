/**
 * A campaign message, read once (contracts templates/campaign-message.ts): a name in a language whose versions are the
 * workspace's template rows, any non-empty set of WhatsApp, email and text. The seven sets a message can have, crossed
 * with WhatsApp's standing (approved, waiting, refused, or no row at all), each say which version anchors it, which
 * channels it holds, whether a picker may list it, and what each channel it does not hold says. Then the rules that cross
 * them: the category and purpose (WhatsApp's wins, own rows take the strictest, a row with none is an offer), hidden, the
 * slots, the rows that belong to no message, and an email's subject that takes a value, which holds nothing back.
 *
 * The functions run as the dashboard's reader hands their rows down (apps/dashboard server/readers/templates.ts: every
 * column it selects, the parts templateParts reads out of the components, and `blocked` for every row, email's included).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BROADCAST_FAILURE_WORDS,
  BROADCAST_WORDS,
  HELD_REASONS,
  LIBRARY_WORDS,
  MESSAGE_GONE_WORDS,
  RUN_NOW_WITHOUT_VERSION_WORDS,
  STARTER_LINE_WORDS,
  STARTER_TEMPLATES,
  broadcastFailureFix,
  campaignMessageOf,
  campaignMessagesOf,
  messageHolds,
  messageStandingWords,
  messageWhyNot,
  noVersionWords,
  reachOutRowName,
  variablesSlotCount,
  whatsappStoppedRunWords,
} from "@chanlytics/contracts";

const NAME = "autumn_note";
const LANGUAGE = "en_US";
const IDS = { whatsapp: "w-row", email: "e-row", sms: "s-row" };

/** A template row as the reader answers it: a WhatsApp row is Meta's, an email's or a text's is written here and approved at once. */
const row = (channel, over = {}) => ({
  id: IDS[channel] ?? `${channel}-row`,
  channel,
  name: NAME,
  language: LANGUAGE,
  body_preview: "Hi {{1}}, a note from us.",
  variables: [{ position: 1, label: "First name", example: "Dani" }],
  category: "utility",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: channel === "whatsapp" ? "meta" : "chanlytics",
  hidden_at: null,
  title: null,
  header: null,
  footer: null,
  buttons: [],
  blocked: null,
  ...over,
});

const W = (over) => row("whatsapp", over);
const E = (over) => row("email", { header: "A note, {{1}}", ...over });
const T = (over) => row("sms", over);

/* ---------------------------------- the seven sets, crossed with WhatsApp's standing ---------------------------------- */

const SETS = [
  ["whatsapp"],
  ["email"],
  ["sms"],
  ["whatsapp", "email"],
  ["whatsapp", "sms"],
  ["email", "sms"],
  ["whatsapp", "email", "sms"],
];
/** The version the anchor is, by the set: WhatsApp's if it has one, else the email, else the text. */
const ANCHORS = { w: "whatsapp", e: "email", s: "sms", we: "whatsapp", ws: "whatsapp", es: "email", wes: "whatsapp" };
const WHY_WHATSAPP = {
  absent: "This message has no WhatsApp version.",
  pending: "WhatsApp is still reviewing this message's WhatsApp version.",
  rejected: "WhatsApp refused this message's WhatsApp version.",
};
const NO_EMAIL = "This message has no email version yet.";
const NO_TEXT = "This message has no text version yet.";

for (const set of SETS) {
  const has = { whatsapp: set.includes("whatsapp"), email: set.includes("email"), sms: set.includes("sms") };
  // A set with no WhatsApp has no standing of WhatsApp's to cross: its WhatsApp is absent.
  for (const standing of has.whatsapp ? ["approved", "pending", "rejected"] : ["absent"]) {
    const key = set.map((c) => c[0]).join("");
    test(`a message of ${set.join(" + ")} with WhatsApp ${standing}: its anchor, what it holds, whether it is offered, what each channel says`, () => {
      const rows = [
        ...(has.whatsapp ? [W({ meta_status: standing })] : []),
        ...(has.email ? [E()] : []),
        ...(has.sms ? [T()] : []),
      ];
      const m = campaignMessageOf(rows, NAME, LANGUAGE);
      assert.ok(m, "a message");
      assert.equal(m.anchor.channel, ANCHORS[key]);
      assert.equal(m.anchor.id, IDS[ANCHORS[key]]);
      assert.deepEqual(m.versions, {
        whatsapp: has.whatsapp ? { id: "w-row", status: standing, hidden: false, blocked: null, reason: null } : null,
        email: has.email ? { id: "e-row" } : null,
        sms: has.sms ? { id: "s-row" } : null,
      });
      const holds = { whatsapp: has.whatsapp && standing === "approved", email: has.email, sms: has.sms };
      assert.deepEqual(messageHolds(m), holds);
      assert.equal(
        m.offered,
        holds.whatsapp || holds.email || holds.sms,
        "a picker lists a message that holds a channel",
      );
      assert.equal(m.hidden, false);
      assert.equal(m.slots, 1);
      assert.equal(m.category, "utility");
      assert.equal(m.purpose, "conversational");
      assert.equal(messageWhyNot(m, "whatsapp"), holds.whatsapp ? null : WHY_WHATSAPP[standing]);
      assert.equal(messageWhyNot(m, "email"), has.email ? null : NO_EMAIL);
      assert.equal(messageWhyNot(m, "sms"), has.sms ? null : NO_TEXT);
    });
  }
}

test("a message whose only version is an unapproved WhatsApp one is not offered, and one with an email beside it is", () => {
  for (const meta_status of ["pending", "rejected", "paused", "disabled"]) {
    const alone = campaignMessageOf([W({ meta_status })], NAME, LANGUAGE);
    assert.equal(alone.offered, false, `${meta_status} alone`);
    assert.deepEqual(messageHolds(alone), { whatsapp: false, email: false, sms: false });
    const beside = campaignMessageOf([W({ meta_status }), E()], NAME, LANGUAGE);
    assert.equal(beside.offered, true, `${meta_status} beside an email`);
    assert.equal(beside.anchor.channel, "whatsapp", "the anchor is still WhatsApp's, held or not");
  }
});

/* ---------------------------------- the category and what it is for ---------------------------------- */

test("the category is WhatsApp's, in any status, and it wins over the own rows' however they read", () => {
  const cases = [
    // [WhatsApp's row, the own rows, the category, the purpose]
    [W({ category: "marketing" }), [E({ category: "utility" })], "marketing", "marketing"],
    [W({ category: "utility", meta_status: "rejected" }), [E({ category: "marketing" })], "utility", "conversational"],
    [W({ category: "marketing", meta_status: "pending" }), [E({ category: "utility" }), T()], "marketing", "marketing"],
    [W({ category: "utility", meta_status: "paused" }), [T({ category: "marketing" })], "utility", "conversational"],
    [W({ category: "authentication" }), [E({ category: "marketing" })], "authentication", "conversational"],
    // Meta's word is the row's, and a row that says none is read as an offer, the send's own fail-closed reading.
    [W({ category: null }), [E({ category: "utility" })], null, "marketing"],
  ];
  for (const [whatsapp, own, category, purpose] of cases) {
    const m = campaignMessageOf([whatsapp, ...own], NAME, LANGUAGE);
    assert.equal(
      m.category,
      category,
      `${whatsapp.category} ${whatsapp.meta_status} over ${own.map((r) => r.category)}`,
    );
    assert.equal(m.purpose, purpose);
  }
});

test("with no WhatsApp row the category is the strictest of the own rows': marketing beats utility, and none is marketing", () => {
  const cases = [
    [[E({ category: "utility" })], "utility", "conversational"],
    [[T({ category: "utility" })], "utility", "conversational"],
    [[E({ category: "marketing" })], "marketing", "marketing"],
    [[E({ category: "utility" }), T({ category: "utility" })], "utility", "conversational"],
    [[E({ category: "utility" }), T({ category: "marketing" })], "marketing", "marketing"],
    [[E({ category: "marketing" }), T({ category: "utility" })], "marketing", "marketing"],
    [[E({ category: null })], "marketing", "marketing"],
    [[E({ category: null }), T({ category: "utility" })], "marketing", "marketing"],
    [[E({ category: "utility" }), T({ category: null })], "marketing", "marketing"],
  ];
  for (const [rows, category, purpose] of cases) {
    const m = campaignMessageOf(rows, NAME, LANGUAGE);
    assert.equal(m.category, category, rows.map((r) => `${r.channel}:${r.category}`).join(" "));
    assert.equal(m.purpose, purpose);
  }
});

test("a WhatsApp row added to a message later takes the category from Meta: the own rows' stops mattering", () => {
  const own = [E({ category: "marketing" })];
  assert.equal(campaignMessageOf(own, NAME, LANGUAGE).purpose, "marketing");
  assert.equal(campaignMessageOf([...own, W({ category: "utility" })], NAME, LANGUAGE).purpose, "conversational");
});

/* ---------------------------------- hidden and the slots ---------------------------------- */

test("a message is hidden when its anchor is, and a hidden message is not offered, whatever it holds", () => {
  const hidden = "2026-10-01T12:00:00.000Z";
  const w = campaignMessageOf([W({ hidden_at: hidden }), E()], NAME, LANGUAGE);
  assert.equal(w.hidden, true);
  assert.equal(w.versions.whatsapp.hidden, true);
  assert.equal(w.offered, false);
  assert.deepEqual(messageHolds(w), { whatsapp: true, email: true, sms: false }, "hidden is not a channel's standing");
  // The anchor is WhatsApp's: an email the workspace hid by itself does not hide the message.
  const e = campaignMessageOf([W(), E({ hidden_at: hidden })], NAME, LANGUAGE);
  assert.equal(e.hidden, false);
  assert.equal(e.offered, true);
  // With no WhatsApp row the email is the anchor.
  const own = campaignMessageOf([E({ hidden_at: hidden }), T()], NAME, LANGUAGE);
  assert.equal(own.hidden, true);
  assert.equal(own.offered, false);
  assert.equal(campaignMessageOf([T({ hidden_at: hidden })], NAME, LANGUAGE).hidden, true);
});

test("the slots are WhatsApp's variables, else the anchor's: the highest position a row names, or how many it lists", () => {
  const vars = (n) => Array.from({ length: n }, (_, i) => ({ position: i + 1, label: `Value ${i + 1}`, example: "x" }));
  assert.equal(campaignMessageOf([W({ variables: vars(2) }), E({ variables: vars(1) })], NAME, LANGUAGE).slots, 2);
  assert.equal(campaignMessageOf([W({ variables: vars(1) }), E({ variables: vars(3) })], NAME, LANGUAGE).slots, 1);
  assert.equal(
    campaignMessageOf([W({ meta_status: "rejected", variables: vars(2) }), T({ variables: vars(1) })], NAME, LANGUAGE)
      .slots,
    2,
    "WhatsApp's count stands in any status",
  );
  assert.equal(campaignMessageOf([E({ variables: vars(3) }), T({ variables: vars(1) })], NAME, LANGUAGE).slots, 3);
  assert.equal(campaignMessageOf([T({ variables: vars(2) })], NAME, LANGUAGE).slots, 2);
  // How a row names its values: a list with positions, one with a gap, none, or nothing a list.
  assert.equal(campaignMessageOf([E({ variables: [{ position: 3, label: "Link" }] })], NAME, LANGUAGE).slots, 3);
  assert.equal(campaignMessageOf([E({ variables: [{ label: "A" }, { label: "B" }] })], NAME, LANGUAGE).slots, 2);
  assert.equal(campaignMessageOf([E({ variables: [] })], NAME, LANGUAGE).slots, 0);
  assert.equal(campaignMessageOf([E({ variables: null })], NAME, LANGUAGE).slots, 0);
  assert.equal(campaignMessageOf([E({ variables: { position: 2 } })], NAME, LANGUAGE).slots, 0);
});

test("the count of values a row names is one function, the message's slots and the db's reading of them: the highest position, or the rows listed", () => {
  assert.equal(variablesSlotCount([{ position: 1 }, { position: 2 }]), 2);
  assert.equal(variablesSlotCount([{ position: 1 }, { position: 4 }]), 4, "the highest numbered one");
  assert.equal(
    variablesSlotCount([{ label: "First name" }, { label: "Business" }, { label: "Time" }]),
    3,
    "or the rows it lists",
  );
  assert.equal(
    variablesSlotCount([null, { position: "2" }]),
    2,
    "a position written as a number string counts, a null row is a row",
  );
  for (const none of [null, undefined, "x", { position: 2 }, []]) assert.equal(variablesSlotCount(none), 0);
  const message = campaignMessageOf([W({ variables: [{ position: 1 }, { position: 3 }] })], NAME, LANGUAGE);
  assert.equal(message.slots, variablesSlotCount([{ position: 1 }, { position: 3 }]));
});

test("a version a message lacks has one sentence per channel, which messageWhyNot says and the previews and cards say in the same words", () => {
  const nothing = { versions: { whatsapp: null, email: null, sms: null } };
  assert.deepEqual(
    ["whatsapp", "email", "sms"].map((c) => noVersionWords(c)),
    [
      "This message has no WhatsApp version.",
      "This message has no email version yet.",
      "This message has no text version yet.",
    ],
  );
  for (const c of ["whatsapp", "email", "sms"]) assert.equal(messageWhyNot(nothing, c), noVersionWords(c), c);
  // A WhatsApp version that exists says its own standing, not that it is missing.
  const reviewing = campaignMessageOf([W({ meta_status: "pending" })], NAME, LANGUAGE);
  assert.notEqual(messageWhyNot(reviewing, "whatsapp"), noVersionWords("whatsapp"));
});

test("the title is the message's words for people: the first title its WhatsApp, email or text version carries, else the name made words", () => {
  const titleOf = (...rows) => campaignMessageOf(rows, NAME, LANGUAGE).title;
  assert.equal(titleOf(W({ title: "  Autumn   special " }), E({ title: "Other" })), "Autumn special");
  assert.equal(titleOf(E({ title: "Autumn special" })), "Autumn special");
  assert.equal(titleOf(T()), "Autumn note");
  // A title written with the first email version is not lost once a WhatsApp row with no title of its own exists: the
  // message's title was the anchor's alone, and the anchor moved to the row that has none.
  assert.equal(titleOf(W(), E({ title: "Autumn special" })), "Autumn special");
  assert.equal(titleOf(E({ title: "Autumn special" }), W()), "Autumn special", "whichever order the rows came in");
  assert.equal(
    titleOf(W(), E(), T({ title: "Autumn text" })),
    "Autumn text",
    "a text's, where no other version has one",
  );
  // In order: WhatsApp's, then the email's, then the text's.
  assert.equal(titleOf(T({ title: "Text" }), E({ title: "Email" }), W({ title: "WhatsApp" })), "WhatsApp");
  assert.equal(titleOf(T({ title: "Text" }), E({ title: "Email" })), "Email");
  // A blank title says none, so it does not hide the next version's.
  assert.equal(titleOf(W({ title: "   " }), E({ title: "Autumn special" })), "Autumn special");
  assert.equal(titleOf(W({ title: "" }), E(), T()), "Autumn note", "none anywhere: the name made words");
  // A starter's own title is read when no version carries one; a title given outranks it.
  const [visit] = STARTER_TEMPLATES;
  assert.equal(
    campaignMessageOf([W({ name: visit.name }), E({ name: visit.name })], visit.name, LANGUAGE).title,
    visit.title,
  );
  assert.equal(
    campaignMessageOf([W({ name: visit.name }), E({ name: visit.name, title: "Our reminder" })], visit.name, LANGUAGE)
      .title,
    "Our reminder",
  );
  // The Library's list is made of the same: one message, one title, whichever row came first.
  assert.deepEqual(
    campaignMessagesOf([W(), E({ title: "Autumn special" }), T()]).map((m) => m.title),
    ["Autumn special"],
  );
});

/* ---------------------------------- the rows that are no message's ---------------------------------- */

test("a reach-out's email, another channel's row, another language's and another name's make no part of a message", () => {
  const step = "0b1e0c4a-2d5e-4a8b-9c3d-7f6a5b4c3d2e";
  const reachOut = row("email", { id: "r-row", name: reachOutRowName(step), language: "en" });
  assert.equal(campaignMessageOf([reachOut], reachOutRowName(step), "en"), null, "its name has no message");
  assert.deepEqual(campaignMessagesOf([reachOut]), []);

  const voice = row("voice", { id: "v-row" });
  const instagram = row("instagram", { id: "i-row" });
  assert.equal(campaignMessageOf([voice, instagram], NAME, LANGUAGE), null, "voice and Instagram are no version");
  const m = campaignMessageOf([voice, instagram, E()], NAME, LANGUAGE);
  assert.deepEqual(m.versions, { whatsapp: null, email: { id: "e-row" }, sms: null });
  assert.equal(m.anchor.id, "e-row");
  assert.deepEqual(messageHolds(m), { whatsapp: false, email: true, sms: false });

  const spanish = W({ id: "w-es", language: "es" });
  const other = E({ id: "e-other", name: "winter_note" });
  const only = campaignMessageOf([spanish, other, T()], NAME, LANGUAGE);
  assert.deepEqual(
    only.versions,
    { whatsapp: null, email: null, sms: { id: "s-row" } },
    "the right name, the right language",
  );
  assert.equal(campaignMessageOf([spanish, other], NAME, LANGUAGE), null, "and none of it where there is none");
  assert.equal(campaignMessageOf([], NAME, LANGUAGE), null);
});

test("a message is the workspace's rows of one name and language, however the rows are mixed in with the rest", () => {
  const rows = [
    row("email", { id: "e-other", name: "winter_note" }),
    row("email", { id: "r-row", name: reachOutRowName("0b1e0c4a-2d5e-4a8b-9c3d-7f6a5b4c3d2e"), language: "en" }),
    W({ id: "w-es", language: "es" }),
    E(),
    row("voice", { id: "v-row" }),
    W(),
    T({ id: "s-es", language: "es" }),
    T(),
  ];
  const m = campaignMessageOf(rows, NAME, LANGUAGE);
  assert.deepEqual(m.versions, {
    whatsapp: { id: "w-row", status: "approved", hidden: false, blocked: null, reason: null },
    email: { id: "e-row" },
    sms: { id: "s-row" },
  });
  assert.deepEqual(campaignMessageOf(rows, NAME, "es").versions, {
    whatsapp: { id: "w-es", status: "approved", hidden: false, blocked: null, reason: null },
    email: null,
    sms: { id: "s-es" },
  });
});

/* ---------------------------------- what WhatsApp cannot take, and what an email may carry ---------------------------------- */

test("an email's subject that takes a value is no reason to hold the email: blocked is read from the WhatsApp row alone", () => {
  // The reader works `blocked` out for every row, and an email's subject is stored as a heading, so it answers this for
  // an email whose subject carries {{1}}. It is no standing of the message's.
  const subjectWithAValue = { blocked: "a heading that takes a value", header: "A note, {{1}}" };
  const emailComponents = [
    { type: "HEADER", format: "TEXT", text: "A note, {{1}}" },
    { type: "BODY", text: "Hi {{1}}" },
  ];

  const both = campaignMessageOf([W(), E(subjectWithAValue)], NAME, LANGUAGE);
  assert.equal(both.versions.whatsapp.blocked, null);
  assert.deepEqual(messageHolds(both), { whatsapp: true, email: true, sms: false });
  assert.equal(messageWhyNot(both, "email"), null);

  const alone = campaignMessageOf([E(subjectWithAValue)], NAME, LANGUAGE);
  assert.equal(alone.offered, true);
  assert.deepEqual(messageHolds(alone), { whatsapp: false, email: true, sms: false });
  assert.equal(messageWhyNot(alone, "email"), null);

  // The same row as the edge reads it, with its components and no answer: nothing reads the email's, as before.
  const raw = campaignMessageOf([E({ blocked: undefined, components: emailComponents })], NAME, LANGUAGE);
  assert.equal(raw.offered, true);
  assert.deepEqual(messageHolds(raw), { whatsapp: false, email: true, sms: false });
});

test("a WhatsApp version this product cannot put on the wire whole is held back, and says what is in the way", () => {
  // The reader's answer.
  const picture = campaignMessageOf([W({ blocked: "a picture for a heading" }), E()], NAME, LANGUAGE);
  assert.equal(picture.versions.whatsapp.status, "approved");
  assert.equal(picture.versions.whatsapp.blocked, "a picture for a heading");
  assert.deepEqual(messageHolds(picture), { whatsapp: false, email: true, sms: false });
  assert.equal(picture.offered, true, "its email is held");
  assert.equal(
    messageWhyNot(picture, "whatsapp"),
    "This message's WhatsApp version has a picture for a heading, so it cannot be sent from here.",
  );

  // The components Meta holds, judged here: a heading that takes a value.
  const heading = campaignMessageOf(
    [
      W({
        blocked: undefined,
        components: [
          { type: "HEADER", format: "TEXT", text: "Hello {{1}}" },
          { type: "BODY", text: "Hi {{1}}" },
        ],
      }),
    ],
    NAME,
    LANGUAGE,
  );
  assert.equal(heading.versions.whatsapp.blocked, "a heading that takes a value");
  assert.equal(heading.offered, false, "nothing else to send by");
  assert.equal(
    messageWhyNot(heading, "whatsapp"),
    "This message's WhatsApp version has a heading that takes a value, so it cannot be sent from here.",
  );
});

/* ---------------------------------- the sentences ---------------------------------- */

test("a channel the message does not hold has one sentence, and the words an email and a text said before are the same", () => {
  const m = (...rows) => campaignMessageOf(rows, NAME, LANGUAGE);
  assert.equal(messageWhyNot(m(E()), "whatsapp"), "This message has no WhatsApp version.");
  assert.equal(
    messageWhyNot(m(W({ meta_status: "pending" })), "whatsapp"),
    "WhatsApp is still reviewing this message's WhatsApp version.",
  );
  assert.equal(
    messageWhyNot(m(W({ meta_status: "rejected" }), E()), "whatsapp"),
    "WhatsApp refused this message's WhatsApp version.",
  );
  assert.equal(
    messageWhyNot(m(W({ meta_status: "paused" })), "whatsapp"),
    "WhatsApp has paused this message's WhatsApp version.",
  );
  assert.equal(
    messageWhyNot(m(W({ meta_status: "disabled" })), "whatsapp"),
    "WhatsApp has disabled this message's WhatsApp version.",
  );
  assert.equal(
    messageWhyNot(m(W({ blocked: "a button that takes a value" })), "whatsapp"),
    "This message's WhatsApp version has a button that takes a value, so it cannot be sent from here.",
  );
  // Pinned by core-campaigns.test.mjs, outbound-routes.test.mjs and the composers' tests: the words are the same.
  assert.equal(messageWhyNot(m(W()), "email"), "This message has no email version yet.");
  assert.equal(messageWhyNot(m(W()), "sms"), "This message has no text version yet.");
  // A channel the message holds says nothing.
  assert.equal(messageWhyNot(m(W(), E(), T()), "whatsapp"), null);
  assert.equal(messageWhyNot(m(W(), E(), T()), "email"), null);
  assert.equal(messageWhyNot(m(W(), E(), T()), "sms"), null);
});

test("a run that stops for a WhatsApp version it cannot send says why in the words a channel not held has, then what that left; a message with no row at all has no WhatsApp version", () => {
  const stopped = (...rows) => whatsappStoppedRunWords(campaignMessageOf(rows, NAME, LANGUAGE));
  const LEFT = "Everyone on this run goes by WhatsApp, so nothing was sent.";
  assert.equal(
    stopped(W({ meta_status: "pending" })),
    `WhatsApp is still reviewing this message's WhatsApp version. ${LEFT}`,
  );
  assert.equal(
    stopped(W({ meta_status: "rejected" }), E()),
    `WhatsApp refused this message's WhatsApp version. ${LEFT}`,
  );
  assert.equal(stopped(W({ meta_status: "paused" })), `WhatsApp has paused this message's WhatsApp version. ${LEFT}`);
  assert.equal(
    stopped(W({ meta_status: "disabled" })),
    `WhatsApp has disabled this message's WhatsApp version. ${LEFT}`,
  );
  assert.equal(
    stopped(W({ blocked: "a picture for a heading" })),
    `This message's WhatsApp version has a picture for a heading, so it cannot be sent from here. ${LEFT}`,
    "an approved version that cannot go whole is not called withdrawn",
  );
  assert.equal(stopped(E()), `This message has no WhatsApp version. ${LEFT}`, "a message of an email alone");
  assert.equal(whatsappStoppedRunWords(null), `This message has no WhatsApp version. ${LEFT}`, "no row of it at all");
  // Every sentence is its channel's own, never one that calls the version a template.
  assert.ok(!/template/i.test(stopped(W({ meta_status: "pending" }))));
});

test("WhatsApp's refusal carries Meta's reason when it gave one, and a status that is not a refusal carries none", () => {
  const reason = (over) => campaignMessageOf([W(over)], NAME, LANGUAGE).versions.whatsapp.reason;
  assert.equal(
    reason({ meta_status: "rejected", rejected_reason: "ABUSIVE_CONTENT" }),
    "WhatsApp refused this one: abusive content. Change the words and send it back.",
  );
  assert.equal(reason({ meta_status: "rejected", rejected_reason: null }), null, "Meta gave none");
  assert.equal(reason({ meta_status: "pending", rejected_reason: "ABUSIVE_CONTENT" }), null);
  assert.equal(reason({ meta_status: "approved", rejected_reason: "ABUSIVE_CONTENT" }), null);
});

test("a row that names no status, or one the set does not know, is waiting, as the column's own default is", () => {
  for (const meta_status of [null, undefined, "draft"]) {
    const m = campaignMessageOf([W({ meta_status })], NAME, LANGUAGE);
    assert.equal(m.versions.whatsapp.status, "pending");
    assert.equal(messageHolds(m).whatsapp, false);
    assert.equal(messageWhyNot(m, "whatsapp"), "WhatsApp is still reviewing this message's WhatsApp version.");
  }
});

/* ---------------------------------- every message the rows make ---------------------------------- */

test("every message the rows make: one a name and language, in the order each first appears, with the ones that have no WhatsApp row", () => {
  const rows = [
    E({ id: "e1", name: "email_only" }),
    W({ id: "w2", name: "both_ways" }),
    row("voice", { id: "v3", name: "heard_only" }),
    row("email", { id: "r4", name: reachOutRowName("0b1e0c4a-2d5e-4a8b-9c3d-7f6a5b4c3d2e"), language: "en" }),
    T({ id: "t5", name: "both_ways" }),
    W({ id: "w6", name: "both_ways", language: "es" }),
    T({ id: "t7", name: "text_only" }),
    E({ id: "e8", name: "email_only", language: "es" }),
  ];
  const messages = campaignMessagesOf(rows);
  assert.deepEqual(
    messages.map((m) => [m.name, m.language, m.anchor.id, m.anchor.channel]),
    [
      ["email_only", LANGUAGE, "e1", "email"],
      ["both_ways", LANGUAGE, "w2", "whatsapp"],
      ["both_ways", "es", "w6", "whatsapp"],
      ["text_only", LANGUAGE, "t7", "sms"],
      ["email_only", "es", "e8", "email"],
    ],
  );
  // The list is the one message each, read the same: nothing is a second reading of the rows.
  for (const m of messages) assert.deepEqual(campaignMessageOf(rows, m.name, m.language), m);
  assert.deepEqual(
    messages.find((m) => m.name === "both_ways" && m.language === LANGUAGE).versions.sms,
    { id: "t5" },
    "a message's rows are one message wherever they stand in the list",
  );
  assert.deepEqual(campaignMessagesOf([]), []);
});

test("a message whole, as a page reads it: every field it carries and no other", () => {
  const m = campaignMessageOf(
    [
      W({
        category: "marketing",
        meta_status: "pending",
        title: "Autumn special",
        variables: [{ position: 1 }, { position: 2 }],
      }),
      E({ category: "utility" }),
      T(),
    ],
    NAME,
    LANGUAGE,
  );
  assert.deepEqual(m, {
    name: NAME,
    language: LANGUAGE,
    title: "Autumn special",
    anchor: { id: "w-row", channel: "whatsapp" },
    slots: 2,
    category: "marketing",
    purpose: "marketing",
    hidden: false,
    offered: true,
    versions: {
      whatsapp: { id: "w-row", status: "pending", hidden: false, blocked: null, reason: null },
      email: { id: "e-row" },
      sms: { id: "s-row" },
    },
  });
});

test("where a language of a message stands on each channel is one set of words: WhatsApp's own standing, an email and a text ready the moment they are written, and what is not there said as such", () => {
  const words = (rows) => messageStandingWords(campaignMessageOf(rows, NAME, LANGUAGE));
  // WhatsApp, by its standing: the pill's words for a template in lower case, but a refusal is refused.
  for (const [status, said] of [
    ["approved", "approved"],
    ["pending", "in review"],
    ["rejected", "refused"],
    ["paused", "paused"],
    ["disabled", "disabled"],
  ])
    assert.equal(words([W({ meta_status: status })]).whatsapp, `WhatsApp · ${said}`, status);
  assert.deepEqual(words([E(), T()]), {
    whatsapp: "WhatsApp · not added",
    email: "Email · ready",
    sms: "Text · ready",
  });
  assert.deepEqual(words([W({ meta_status: "pending" }), E()]), {
    whatsapp: "WhatsApp · in review",
    email: "Email · ready",
    sms: "Text · not written",
  });
  // A text of an offer can never be written, and is not "not written yet".
  assert.equal(words([E({ category: "marketing" })]).sms, "Text · not for offers");
  assert.equal(words([E({ category: "utility" })]).sms, "Text · not written");
  assert.equal(words([T({ category: "utility" })]).email, "Email · not written");
  // A language the message has no version in at all.
  assert.deepEqual(messageStandingWords(null), {
    whatsapp: "WhatsApp · not added",
    email: "Email · not written",
    sms: "Text · not written",
  });
});

/* ---------------------------------- every sentence says what is true on every channel ---------------------------------- */

test("what a campaign says of a message whose WhatsApp version cannot go says that version, never a template, and what else carries it", () => {
  // The run door's: a playbook that goes by WhatsApp alone, whose message holds no WhatsApp version a run can send.
  assert.equal(
    RUN_NOW_WITHOUT_VERSION_WORDS,
    "Its message has no WhatsApp version a run can send, and nobody it would reach goes by email or text. Pick another message, or give this one an email or a text version and tick it on the campaign.",
  );
  // The stored reason stays the closed set's; its words say the WhatsApp version, in the person's held reason and the run's.
  assert.equal(HELD_REASONS.template_not_approved, "its WhatsApp version is no longer approved");
  assert.equal(
    BROADCAST_FAILURE_WORDS.template_not_approved,
    HELD_REASONS.template_not_approved,
    "said once, twice spelled",
  );
  // What to do: the version resubmitted, or the message written for a channel that needs no review; a broadcast's page and a
  // playbook's run say the same, whoever reached how many.
  const FIX =
    "Open it in the Library — its WhatsApp version can be resubmitted, or the message written as an email or a text.";
  assert.equal(broadcastFailureFix("template_not_approved"), FIX);
  assert.equal(broadcastFailureFix("template_not_approved", 5), FIX, "however far it got");
  const playbookRun = { playbook_id: "p1", trigger: "quiet_30" };
  assert.ok(
    broadcastFailureFix("template_not_approved", 0, playbookRun)?.includes(FIX),
    "a playbook's run says it too",
  );
  // None of the sentences a page, a route or Ask reads about it calls the version a template.
  const m = (...rows) => campaignMessageOf(rows, NAME, LANGUAGE);
  const said = [
    RUN_NOW_WITHOUT_VERSION_WORDS,
    HELD_REASONS.template_not_approved,
    BROADCAST_FAILURE_WORDS.template_not_approved,
    FIX,
    broadcastFailureFix("template_not_approved", 0, playbookRun),
    STARTER_LINE_WORDS.reviewing(2),
    STARTER_LINE_WORDS.add,
    ...[null, "approved", "pending", "rejected", "paused", "disabled"].map(STARTER_LINE_WORDS.standing),
    MESSAGE_GONE_WORDS.card,
    MESSAGE_GONE_WORDS.composer("Autumn note"),
    BROADCAST_WORDS.tip,
    LIBRARY_WORDS.headTip,
    whatsappStoppedRunWords(m(W({ meta_status: "pending" }))),
    ...["pending", "rejected", "paused", "disabled"].map((status) =>
      messageWhyNot(m(W({ meta_status: status })), "whatsapp"),
    ),
  ];
  for (const s of said) assert.ok(!/\btemplates?\b/i.test(s), s);
});

test("a starter's line says where its WhatsApp version stands in the Library's words, once: in review waits for approval, anything else points at the Library, and adding it says what it writes", () => {
  const library = "Campaigns › Library";
  assert.equal(
    STARTER_LINE_WORDS.standing("pending"),
    "has its WhatsApp version in review — it appears here once approved, usually within minutes.",
  );
  // The word after "its WhatsApp version" is messageStandingWords' own for that status, so a refusal is refused here too.
  for (const status of ["rejected", "paused", "disabled", "approved"]) {
    const [, word] = messageStandingWords(m1(status)).whatsapp.split(" · ");
    assert.equal(STARTER_LINE_WORDS.standing(status), `has its WhatsApp version ${word} — see ${library}.`, status);
  }
  // A row that names no status, or one the set does not know, is waiting, as the column's default is.
  assert.equal(STARTER_LINE_WORDS.standing(null), STARTER_LINE_WORDS.standing("pending"));
  assert.equal(STARTER_LINE_WORDS.standing("mystery"), STARTER_LINE_WORDS.standing("pending"));
  assert.equal(
    STARTER_LINE_WORDS.reviewing(2),
    "Your starter messages' WhatsApp versions are in review (2) — they appear here once approved, usually within minutes.",
  );
  // The link says what it does, and stops: where the WhatsApp version stands is the line's once it is added (`standing`).
  assert.equal(STARTER_LINE_WORDS.add, "Add it");
});
const m1 = (status) => campaignMessageOf([W({ meta_status: status })], NAME, LANGUAGE);
