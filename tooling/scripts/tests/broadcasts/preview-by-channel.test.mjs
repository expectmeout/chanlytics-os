/**
 * The campaign composers' preview by channel, a lighter To row, and the split as a bar (One message, every channel; the
 * Campaigns review's items 15, 17 and 18). A campaign that goes by more than WhatsApp reaches each person once, on one channel,
 * and the preview was WhatsApp's bubble for everyone.
 *
 * - Each person in the preview carries the channel the send reaches them on (contracts audiencePreview), none where they are
 *   held back, so the page draws the message as that channel's version.
 * - What each channel adds is said once: an email's foot is the one the sender puts on the wire (contracts emailFoot, which
 *   core imports), a text's STOP line is the one renderOwnVersion adds.
 * - A version the page does not hold is said, never drawn as WhatsApp's words under the email's name.
 * - A message needs no WhatsApp row (Lane 1): the composers offer it by the channels it holds, open on the first of them the
 *   workspace is ready on, say a closed channel in the message's own words (or the workspace's where it is the workspace that
 *   cannot), and draw a person held back as the message's own words, noted Not sent.
 * - The split is a bar: each part's share of the people reached, in the channel's own chart colour, its words in the kit's
 *   tooltip and its meaning to a screen reader; none where the campaign goes by WhatsApp alone.
 * Run on the stub React over the parts the composers draw (the composers' own wiring is held in
 * broadcasts-honest.test.mjs and playbook-composer.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as contracts from "@chanlytics/contracts";
import { ROOT } from "../_source.mjs";
import { installLegacyReact, fresh, all, find, byTestId, textOf } from "../_legacy-react.mjs";

installLegacyReact({
  location: {
    pathname: "/w/studio",
    hash: "#/broadcasts",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [
    { id: "t-studio", slug: "studio", name: "Northside Studio", status: "active", timezone: "America/New_York" },
  ],
  __ACTIVE_WORKSPACE: "t-studio",
  __DEMO_MODE: false,
});
const SRC = "../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
const { MessagePreview } = await import(`${SRC}/surfaces/campaigns/parts/message-preview.tsx`);
const { cmPreviewBy, cmChannelOfPerson } = await import(`${SRC}/surfaces/campaigns/parts/preview-by.ts`);
const channelsModule = await import(`${SRC}/surfaces/campaigns/parts/channels.ts`);
const { cmReachBy, cmViaTicks, cmDefaultChannels, cmOfferedMessages, cmStandInOf, CM_NO_MESSAGE_YET } = channelsModule;

const h = (type, props, ...kids) => globalThis.React.createElement(type, props, ...kids);

// A workspace whose offers by email can go: the business's own news by email waits for them as an offer does (decision D2).
const OFFERS_OPEN = { campaigns: true, address: true, paused: null };
const READY = contracts.channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true, offers: OFFERS_OPEN },
});
const ALL = ["whatsapp", "sms", "email"];

/**
 * A person as the pick and the preview read them: a yes on WhatsApp and by text, a number, an address, where they last
 * wrote. They have dealt with the business (a relationship on record), as a customer has, which is what lets an email the
 * business chose to send reach them with no yes covering email (decision D1): the preview's subject is the channel.
 */
const row = (id, name, over = {}) => ({
  id,
  name,
  givenName: name === "" ? null : name.split(" ")[0],
  waName: null,
  phone: "+15550100",
  email: `${id}@example.com`,
  lastChannel: null,
  consent: {
    state: "opted_in",
    dnc: false,
    marketing: "unknown",
    channels: ["whatsapp", "sms"],
    marketingChannels: null,
    relationship: true,
  },
  ...over,
});
const PEOPLE = () => [
  row("p-wa", "Ana Reyes"),
  row("p-sms", "Sol Text", { lastChannel: "sms" }),
  row("p-mail", "Mia Mail", { lastChannel: "email" }),
  row("p-none", "Nia None", { phone: null, email: null }),
];

/** What a message says on each channel: a visit's note with a first name in each, and the business's name in the email. */
const VERSIONS = {
  email: { subject: "A note, {{1}}", body: "Hi {{1}},\nwe are open late on Thursdays at {{2}}." },
  sms: { body: "Hi {{1}}, we are open late on Thursdays." },
};
const WHATSAPP = {
  body: "Hi {{1}}, a quick note from {{2}}.",
  header: null,
  footer: "Reply STOP to opt out",
  buttons: null,
};
const OPTS = (over = {}) => ({
  versions: VERSIONS,
  language: "en_US",
  business: "Northside Studio",
  address: null,
  labelled: true,
  // A message with a WhatsApp version: the words the page holds are WhatsApp's, so that is who a person held back is drawn as.
  standIn: "whatsapp",
  ...over,
});

/* ---------------------------------- who is reached on which channel ---------------------------------- */

test("a person in the preview carries the channel the send reaches them on, and none where they are held back", () => {
  const pv = contracts.audiencePreview(PEOPLE(), "everyone", null, null, "conversational", {
    channels: ALL,
    ready: READY,
    about: "ours",
  });
  assert.deepEqual(
    pv.people.map((p) => [p.label, p.channel, p.refusal === null]),
    [
      ["Ana Reyes", "whatsapp", true],
      ["Sol Text", "sms", true],
      ["Mia Mail", "email", true],
      ["Nia None", null, false],
    ],
    "where each last wrote first, else the first channel that carries it; the held one is on none, with why",
  );
  // WhatsApp alone: everyone it reaches is on WhatsApp.
  const alone = contracts.audiencePreview(PEOPLE(), "everyone", null, null, "conversational", {
    channels: ["whatsapp"],
    ready: READY,
    about: "ours",
  });
  assert.deepEqual(
    alone.people.filter((p) => p.refusal === null).map((p) => p.channel),
    ["whatsapp", "whatsapp", "whatsapp"],
  );
  // Decision D1: the same people with no relationship on record (and a yes that covers WhatsApp and text, not email): an
  // email the business chose to send reaches none of them, and each says why.
  const noDealings = PEOPLE().map((p) => ({ ...p, consent: { ...p.consent, relationship: false } }));
  const cold = contracts.audiencePreview(noDealings, "everyone", null, null, "conversational", {
    channels: ["email"],
    ready: READY,
    about: "ours",
  });
  assert.deepEqual(
    [cold.sending, cold.held, cold.people.map((p) => p.channel)],
    [0, 4, [null, null]],
    "an address alone is no yes to the business's news by email: all four held, the preview naming two of them",
  );
  assert.ok(cold.people.every((p) => p.refusal !== null));
  const theirs = contracts.audiencePreview(noDealings, "everyone", null, null, "conversational", {
    channels: ["email"],
    ready: READY,
    about: "theirs",
  });
  assert.deepEqual(
    theirs.people.map((p) => p.channel),
    ["email", "email", "email", null],
    "but a message about their visit asks no yes, only an address",
  );
  assert.equal(cmChannelOfPerson({ refusal: null, channel: "email" }), "email");
  assert.equal(cmChannelOfPerson({ refusal: null }), "whatsapp", "a reading made before channels were kept: WhatsApp");
  assert.equal(cmChannelOfPerson({ refusal: "Asked to stop.", channel: "email" }), null, "held: reached on none");
});

/* ---------------------------------- what each channel adds ---------------------------------- */

test("an email carries the foot the sender adds, a text its STOP line, WhatsApp the template: said once, in contracts", () => {
  const on = (channel, over = {}) =>
    contracts.previewOn(channel, {
      versions: VERSIONS,
      language: "en_US",
      business: "Northside Studio",
      ...over,
    });
  const mail = on("email");
  assert.deepEqual(
    [mail.label, mail.version, mail.missing],
    ["By email", VERSIONS.email, null],
    "the email version's subject and body as written, slots and all",
  );
  assert.equal(
    mail.foot,
    contracts.emailFoot("Northside Studio", undefined, { kind: "visit", facts: {} }, OPTS().language),
    "the foot is the one the sender puts on the wire, from the one function core imports, in the version's language",
  );
  assert.ok(mail.foot.includes("Reply STOP to stop these emails."));
  assert.ok(mail.foot.includes("You're getting this because you've been in touch with Northside Studio."));
  assert.ok(
    on("email", { address: "12 Harbor Way" }).foot.endsWith("Northside Studio · 12 Harbor Way"),
    "and where the Business record holds an address, who and where",
  );
  assert.ok(
    on("email", { facts: { visit_when: "tomorrow at 2:00 PM" } }).foot.startsWith(
      "You're getting this because of your appointment",
    ),
    "an appointment's reason where the person's row kept the visit's time",
  );
  const text = on("sms");
  assert.deepEqual([text.label, text.version, text.foot], ["By text", VERSIONS.sms, "Reply STOP to opt out"]);
  assert.equal(on("sms", { language: "es_MX" }).foot, "Responde STOP para darte de baja", "in the version's language");
  // What a person is sent is the words filled and the STOP line: the preview draws the same.
  const sent = contracts.renderOwnVersion("sms", VERSIONS.sms, ["Sol"], "en_US");
  assert.equal(`${contracts.fillSlots(text.version.body, ["Sol"])}\n${text.foot}`, sent.body);
  const wa = on("whatsapp");
  assert.deepEqual([wa.label, wa.version, wa.foot, wa.missing], ["On WhatsApp", null, null, null]);
  // A message with no version on the person's channel is said, not drawn as another channel's words.
  const none = on("email", { versions: { sms: VERSIONS.sms } });
  assert.deepEqual([none.version, none.foot], [null, null]);
  assert.equal(none.missing, "This message has no email version yet.");
});

test("an offered message carries its email and text versions in its own language, read from the rows the workspace holds", () => {
  const version = (name, channel, language, over = {}) => ({
    id: `t-${name}-${channel}-${language}`,
    name,
    channel,
    language,
    meta_status: "approved",
    category: "utility",
    hidden_at: null,
    blocked: null,
    ...over,
  });
  const rows = [
    version("hours_note", "whatsapp", "en_US", { body_preview: "Hi {{1}}" }),
    version("hours_note", "email", "en_US", { header: "A note, {{1}}", body_preview: "Hi {{1}}, we are open late." }),
    version("hours_note", "sms", "en_US", { body_preview: "Open late, {{1}}." }),
    version("hours_note", "email", "es_MX", { header: "Una nota", body_preview: "Hola" }),
    version("other", "email", "en_US", { header: "Other", body_preview: "Other" }),
  ];
  const offered = cmOfferedMessages({ templates: rows });
  const versions = (name, language) => offered.find((t) => t.name === name && t.language === language)?.versions;
  assert.deepEqual(versions("hours_note", "en_US"), {
    email: { subject: "A note, {{1}}", body: "Hi {{1}}, we are open late." },
    sms: { subject: null, body: "Open late, {{1}}." },
  });
  assert.deepEqual(versions("hours_note", "es_MX"), { email: { subject: "Una nota", body: "Hola" } });
  assert.equal(versions("nothing", "en_US"), undefined, "a message the workspace has no row of is not offered");
});

test("what the preview is handed for a person: the email as a mail, the text as a bubble with its STOP line, else WhatsApp's", () => {
  const mail = cmPreviewBy(WHATSAPP, "email", OPTS());
  assert.deepEqual(
    [mail.via, mail.kind, mail.body, mail.header, mail.footer, mail.buttons, mail.note],
    ["By email", "Email", VERSIONS.email.body, null, null, null, null],
  );
  assert.equal(mail.mail.subject, "A note, {{1}}");
  assert.ok(mail.mail.foot.includes("Reply STOP to stop these emails."), "the foot the sender adds");
  const text = cmPreviewBy(WHATSAPP, "sms", OPTS());
  assert.deepEqual(
    [text.via, text.kind, text.body, text.footer, text.mail],
    ["By text", "Text message", VERSIONS.sms.body, "Reply STOP to opt out", null],
    "the same bubble, with the STOP line where WhatsApp's footer stood",
  );
  const wa = cmPreviewBy(WHATSAPP, "whatsapp", OPTS());
  assert.deepEqual(
    [wa.via, wa.kind, wa.body, wa.footer, wa.mail],
    ["On WhatsApp", undefined, WHATSAPP.body, WHATSAPP.footer, null],
  );
  // A WhatsApp campaign draws what it always drew: no label.
  assert.equal(cmPreviewBy(WHATSAPP, "whatsapp", OPTS({ labelled: false })).via, null);
  // A person held back is WhatsApp's bubble, unlabelled (the page marks it Not sent).
  assert.deepEqual(
    [cmPreviewBy(WHATSAPP, null, OPTS()).via, cmPreviewBy(WHATSAPP, null, OPTS()).body],
    [null, WHATSAPP.body],
  );
  // No email version in hand: WhatsApp's words stand, under no channel's name, with the reason.
  const lost = cmPreviewBy(WHATSAPP, "email", OPTS({ versions: undefined }));
  assert.deepEqual(
    [lost.via, lost.mail, lost.body, lost.note],
    [null, null, WHATSAPP.body, "This message has no email version yet."],
  );
  // An offer's email reads with the offer's foot (step 4: contracts emailFoot's "offer" kind), the visit's without it.
  const address = "12 Harbor Way";
  const offer = cmPreviewBy(WHATSAPP, "email", OPTS({ offer: "customer", address }));
  const offerFoot = contracts.emailFoot(
    OPTS().business,
    address,
    { kind: "offer", why: "customer", unsubscribeUrl: contracts.PREVIEW_WORDS.unsubscribeLink },
    OPTS().language,
  );
  assert.equal(offer.mail.foot, offerFoot, "the foot the sender puts on an offer, its link a stand-in");
  assert.notEqual(offer.mail.foot, mail.mail.foot, "never a visit's foot on an offer");
  // A Spanish version's email ends in Spanish, in the preview as on the wire, and a text in its own STOP line.
  const es = (channel, over) => cmPreviewBy(WHATSAPP, channel, OPTS({ language: "es_MX", ...over }));
  assert.equal(
    es("email", { offer: "customer", address }).mail.foot,
    contracts.emailFoot(
      OPTS().business,
      address,
      { kind: "offer", why: "customer", unsubscribeUrl: contracts.PREVIEW_WORDS.unsubscribeLink },
      "es_MX",
    ),
  );
  assert.ok(es("email").mail.foot.includes("Responde STOP para dejar de recibir estos correos."));
  assert.equal(es("sms").footer, contracts.smsStopLine("es_MX"));
  // An offer's foot owes the postal address (emailFoot refuses to be built without it, and the send holds everyone for it):
  // with none on file the preview says so, in WhatsApp's words under no channel's name, and never throws.
  for (const none of [undefined, null, "  "]) {
    const bare = cmPreviewBy(WHATSAPP, "email", OPTS({ offer: "customer", address: none }));
    assert.deepEqual(
      [bare.via, bare.mail, bare.body, bare.note],
      [null, null, WHATSAPP.body, contracts.OFFERS_BY_EMAIL_WORDS.noAddress],
      `no address: ${none}`,
    );
  }
});

/* ---------------------------------- the preview, drawn ---------------------------------- */

test("an email is drawn as a mail -- who from, the subject, the words with their slots, the foot -- and a text as the bubble with its STOP line", () => {
  fresh();
  const slot = (at, text) => h("button", { "data-testid": "slot", "data-at": at }, text);
  const mail = cmPreviewBy(WHATSAPP, "email", OPTS({ address: "12 Harbor Way" }));
  let tree = h(MessagePreview, { from: "Northside Studio", values: ["Mia", "7 pm"], slot, ...mail });
  assert.equal(textOf(byTestId(tree, "mp-via")), "By email", "the quiet label");
  assert.ok(
    find(tree, (n) => n.props?.className === "mp-frame mp-mail-frame"),
    "a mail, not a bubble",
  );
  assert.equal(
    find(tree, (n) => n.props?.className === "mp-bubble"),
    null,
  );
  assert.equal(textOf(find(tree, (n) => n.props?.className === "mp-kind")), "Email");
  assert.equal(
    textOf(find(tree, (n) => n.props?.className === "mp-subject")),
    "A note, Mia",
    "the subject, its slot filled for this person",
  );
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "slot").map((n) => [n.props["data-at"], textOf(n)]),
    [
      [0, "Mia"],
      [1, "7 pm"],
    ],
    "the slots are the composer's controls in the email too, so an email-only campaign can still fill them",
  );
  const foot = textOf(byTestId(tree, "mp-mail-foot"));
  assert.ok(foot.includes("Reply STOP to stop these emails."), foot);
  assert.ok(foot.endsWith("Northside Studio · 12 Harbor Way"), foot);

  const sms = cmPreviewBy(WHATSAPP, "sms", OPTS());
  tree = h(MessagePreview, { from: "Northside Studio", values: ["Sol", "7 pm"], ...sms });
  assert.equal(textOf(byTestId(tree, "mp-via")), "By text");
  assert.equal(textOf(find(tree, (n) => n.props?.className === "mp-kind")), "Text message");
  assert.equal(textOf(find(tree, (n) => n.props?.className === "mp-body")), "Hi Sol, we are open late on Thursdays.");
  assert.equal(textOf(find(tree, (n) => n.props?.className === "mp-foot")), "Reply STOP to opt out", "the STOP line");
  assert.equal(byTestId(tree, "mp-mail-foot"), null);

  // A WhatsApp preview with nothing said of channels is what it always was: "Business account", no label.
  tree = h(MessagePreview, {
    from: "Northside Studio",
    values: ["Ana", "7 pm"],
    ...cmPreviewBy(WHATSAPP, "whatsapp", OPTS({ labelled: false })),
  });
  assert.equal(byTestId(tree, "mp-via"), null);
  assert.equal(textOf(find(tree, (n) => n.props?.className === "mp-kind")), "Business account");
  // Where the version cannot be drawn, the page says so under it.
  tree = h(MessagePreview, {
    from: "Northside Studio",
    values: ["Mia", "7 pm"],
    ...cmPreviewBy(WHATSAPP, "email", OPTS({ versions: {} })),
  });
  assert.equal(textOf(byTestId(tree, "mp-version-note")), "This message has no email version yet.");
});

/* ---------------------------------- the split as a bar ---------------------------------- */

const SPLIT = (byChannel, over = {}) => ({
  reached: Object.values(byChannel).reduce((a, b) => a + b, 0),
  byChannel,
  held: 5,
  heldBy: { no_yes: 5 },
  ...over,
});

test("the To line's clause says the split in the bar's words, and nothing where the campaign goes by WhatsApp alone", () => {
  const split = SPLIT({ whatsapp: 12, sms: 0, email: 12 });
  assert.equal(contracts.reachByWords(split), "12 on WhatsApp, 12 by email");
  assert.equal(cmReachBy(split, ["whatsapp", "email"]), "12 on WhatsApp, 12 by email");
  assert.equal(cmReachBy(split, ["whatsapp"]), null, "WhatsApp alone: the line is what it always was");
  assert.equal(cmReachBy(null, ["whatsapp", "email"]), null);
  assert.equal(cmReachBy(SPLIT({ whatsapp: 0, sms: 0, email: 8 }), ["email"]), "8 by email");
  assert.equal(contracts.reachByWords(SPLIT({ whatsapp: 1200, sms: 0, email: 40 })), "1,200 on WhatsApp, 40 by email");
  assert.deepEqual(
    contracts.reachBarParts(split).map((p) => [p.channel, p.share, p.words]),
    [
      ["whatsapp", 12, "12 on WhatsApp"],
      ["email", 12, "12 by email"],
    ],
  );
  assert.equal(contracts.reachBarWords(SPLIT({ whatsapp: 0, sms: 0, email: 0 })), "Reaches nobody");
});

/* ---------------------------------- what an approving card quotes ---------------------------------- */

test("previewSays quotes each channel's own words, in the page's order, named for the channel, from the one fill a send makes", () => {
  const say = (channels, over = {}) =>
    contracts.previewSays(channels, {
      whatsapp: "Hi Dani, a quick note from Northside Studio.",
      versions: VERSIONS,
      values: ["Dani", "Northside Studio"],
      language: "en_US",
      limit: 400,
      ...over,
    });
  assert.deepEqual(say(["email", "whatsapp"]), {
    says: "On WhatsApp: Hi Dani, a quick note from Northside Studio. · By email: “A note, Dani” — Hi Dani, we are open late on Thursdays at Northside Studio.",
  });
  // A text is what is sent: its words, and the STOP line the sender adds.
  assert.deepEqual(say(["sms"]), { says: "By text: Hi Dani, we are open late on Thursdays. Reply STOP to opt out" });
  assert.equal(
    contracts.renderOwnVersion("sms", VERSIONS.sms, ["Dani"], "en_US").body.replace(/\s+/g, " "),
    "Hi Dani, we are open late on Thursdays. Reply STOP to opt out",
    "the same fill, so the card cannot say what the send does not",
  );
  assert.equal(say(["sms"], { language: "es_MX" }).says.endsWith("Responde STOP para darte de baja"), true);
  // A channel the message has no version on is named, with the sentence for it: never WhatsApp's words under its name.
  assert.deepEqual(say(["whatsapp", "email"], { versions: { sms: VERSIONS.sms } }), {
    missing: "email",
    why: "This message has no email version yet.",
  });
  // The room is shared between the channels, none cut under a line's worth, and a cut says so.
  const long = say(["whatsapp", "email"], { whatsapp: "x".repeat(300), limit: 140 }).says;
  assert.ok(long.startsWith(`On WhatsApp: ${"x".repeat(70)}…`), long);
  assert.ok(
    say(["whatsapp"], { whatsapp: "y".repeat(300), limit: 40 }).says.includes("y".repeat(60) + "…"),
    "never under sixty",
  );
});

test("previewVersionsOf is the one reading of a message's version rows, which the composers' stamp is", () => {
  const row = (id, channel, language, over) => ({
    id,
    name: "hours_note",
    channel,
    language,
    meta_status: "approved",
    category: "utility",
    ...over,
  });
  const rows = [
    row("t1", "email", "en_US", { header: "A note", body_preview: "Hi" }),
    row("t2", "sms", "en_US", { body_preview: "Open late." }),
    row("t3", "whatsapp", "en_US", { body_preview: "WhatsApp's words" }),
    row("t4", "email", "es_MX", { header: "Una nota", body_preview: "Hola" }),
  ];
  assert.deepEqual(
    cmOfferedMessages({ templates: rows })[0].versions,
    contracts.previewVersionsOf(rows, "hours_note", "en_US"),
    "what an offered message carries is that one reading",
  );
  assert.deepEqual(contracts.previewVersionsOf(rows, "hours_note", "en_US"), {
    email: { subject: "A note", body: "Hi" },
    sms: { subject: null, body: "Open late." },
  });
});

/* ---------------------------------- a message needs no WhatsApp row ---------------------------------- */

/**
 * A template row as the composers' read returns it (server/readers/templates.ts): the columns a message is made of, a WhatsApp
 * row's `blocked` judged on it and an email's or a text's null. `channel` says whose version it is.
 */
const rowOf = (channel, over = {}) => ({
  id: `t-${channel}`,
  channel,
  name: "hours_note",
  language: "en_US",
  meta_status: "approved",
  category: "utility",
  source: "chanlytics",
  hidden_at: null,
  title: null,
  quality: null,
  rejected_reason: null,
  synced_at: null,
  blocked: null,
  variables: [{ position: 1, label: "First name", example: "Dani" }],
  header: channel === "email" ? "A note, {{1}}" : null,
  body_preview: channel === "whatsapp" ? "Hi {{1}}, we are open late." : "Hi {{1}}, we are open late on Thursdays.",
  ...over,
});
/** What GET templates answers for these rows: the composers' (approved, not hidden) and every row's messages, as the reader makes them. */
const readOf = (rows) => ({
  templates: rows.filter((r) => r.meta_status === "approved" && !r.hidden_at),
  messages: contracts.campaignMessagesOf(rows),
});
/** The workspace as a page has it: a number or none, a texting line, a mailbox that sends the business's news. */
const WORKSPACE = (over = {}) =>
  contracts.channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: { sms_state: "active", reg_mock: false },
    email: { mailbox: true, domain: true, offers: OFFERS_OPEN },
    ...over,
  });
const NO_NUMBER = WORKSPACE({ whatsapp: null });
/** The Send by row for an offered message, as a composer draws it: the ticks it opens on, then the row. */
const sendByOf = (offered, ready) => {
  const ticked = cmDefaultChannels(ready, offered.message ?? null);
  const open = contracts.readyForMessage(ready, offered.message ?? CM_NO_MESSAGE_YET);
  const ticks = cmViaTicks(ticked, open, { purpose: offered.purpose, about: "ours" }, false);
  return { ticked, ticks: Object.fromEntries(ticks.map((t) => [t.channel, { on: t.on, why: t.why }])) };
};

test("a message with an email version and no WhatsApp row is offered by the channel it holds: Email on, WhatsApp and Text closed in the message's own words, or the workspace's where it is the workspace that cannot", () => {
  const [offered, ...rest] = cmOfferedMessages(readOf([rowOf("email")]));
  assert.equal(rest.length, 0, "one message");
  assert.deepEqual(
    [offered.id, offered.channel, offered.name, offered.language, offered.purpose, offered.channels, offered.blocked],
    ["t-email", "email", "hours_note", "en_US", "conversational", ["email"], null],
    "its id is its anchor's (the email row), its words that row's, it holds email alone, and nothing blocks it",
  );
  assert.equal(
    offered.body_preview,
    "Hi {{1}}, we are open late on Thursdays.",
    "the anchor's words, there being no WhatsApp row",
  );
  assert.deepEqual(offered.versions, {
    email: { subject: "A note, {{1}}", body: "Hi {{1}}, we are open late on Thursdays." },
  });
  assert.equal(offered.message.versions.whatsapp, null);
  // A workspace with a number, a line and a mailbox: WhatsApp says the message has no version there, Text the same of its own.
  const withNumber = sendByOf(offered, WORKSPACE());
  assert.deepEqual(withNumber.ticked, ["email"], "it opens on Email, the one channel the message holds");
  assert.deepEqual(withNumber.ticks, {
    whatsapp: { on: false, why: "This message has no WhatsApp version." },
    sms: { on: false, why: "This message has no text version yet." },
    email: { on: true, why: "Keep at least one on." },
  });
  // A workspace with no number: WhatsApp's reason is the workspace's, which wins; Text and Email are as they were.
  const noNumber = sendByOf(offered, NO_NUMBER);
  assert.deepEqual(
    noNumber.ticked,
    ["email"],
    "a workspace with no number composing it opens on Email, not on a WhatsApp it has none of",
  );
  assert.deepEqual(noNumber.ticks, {
    whatsapp: { on: false, why: "Connect a WhatsApp number first." },
    sms: { on: false, why: "This message has no text version yet." },
    email: { on: true, why: "Keep at least one on." },
  });
});

test("the Send by row closes a channel for want of a version only where the workspace is ready on it, and the rows' words are contracts' (messageWhyNot), one spelling", () => {
  const [offered] = cmOfferedMessages(readOf([rowOf("email")]));
  // No texting line and no mailbox: each says what the workspace is missing, whatever the message holds.
  const closed = contracts.readyForMessage(
    contracts.channelsReady({
      whatsapp: { canSend: true, refusal: null },
      textLine: null,
      email: { mailbox: false, domain: false },
    }),
    offered.message,
  );
  assert.equal(closed.sms.why, contracts.CHANNEL_WORDS.noTextLine, "the line's, not the message's");
  assert.equal(
    closed.email.why,
    contracts.CHANNEL_WORDS.noEmailDomain,
    "the workspace's, though the message holds an email version",
  );
  assert.equal(closed.whatsapp.why, contracts.messageWhyNot(offered.message, "whatsapp"));
  assert.equal(closed.whatsapp.ready, false);
  // What a closed channel carries besides stays: email's `offers` is not replaced by "no version".
  const open = contracts.readyForMessage(WORKSPACE(), offered.message);
  assert.deepEqual(open.sms, { ...WORKSPACE().sms, ready: false, why: "This message has no text version yet." });
  assert.deepEqual(open.email, WORKSPACE().email, "a channel the message holds is the workspace's as it was");
  assert.equal(
    contracts.readyForMessage({ ...WORKSPACE(), paused: true }, offered.message).paused,
    true,
    "the pause is the workspace's, and rides through",
  );
  // No message in view yet: WhatsApp's version alone, as every campaign opened.
  const none = contracts.readyForMessage(WORKSPACE(), CM_NO_MESSAGE_YET);
  assert.deepEqual(
    [none.whatsapp.ready, none.sms.why, none.email.why],
    [true, "This message has no text version yet.", "This message has no email version yet."],
  );
});

test("one reading of a message in the workspace's channels and one set of words for a version it lacks: contracts' readyForMessage and noVersionWords, with no copy in core, the page or the previews", async () => {
  const core = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);
  assert.equal(core.readyForMessage, undefined, "core's copy is gone");
  assert.equal(channelsModule.cmReadyForMessage, undefined, "and the page's");
  assert.equal(typeof contracts.readyForMessage, "function");
  assert.equal(contracts.PREVIEW_WORDS.noVersion, undefined, "the previews' own spelling of the sentence is gone");
  // A message that holds nothing closes every channel the workspace is ready on, in messageWhyNot's words for each.
  const nothing = { versions: { whatsapp: null, email: null, sms: null } };
  const closed = contracts.readyForMessage(WORKSPACE(), nothing);
  assert.deepEqual(
    contracts.readyForMessage(WORKSPACE(), null),
    closed,
    "null is a message the workspace no longer holds",
  );
  for (const c of contracts.CONSENT_CHANNELS) {
    assert.equal(closed[c].ready, false, c);
    assert.equal(closed[c].why, contracts.messageWhyNot(nothing, c), `${c}: messageWhyNot's`);
    assert.equal(closed[c].why, contracts.noVersionWords(c), `${c}: the one sentence for a version it lacks`);
  }
  // The previews say it in the same words: a channel with no words to draw, whether one person's or the card's.
  assert.equal(
    contracts.previewOn("email", { versions: {}, language: "en_US", business: "Harbor Studio" }).missing,
    contracts.noVersionWords("email"),
  );
  assert.deepEqual(
    contracts.previewSays(["whatsapp", "sms"], {
      whatsapp: "Hi",
      versions: {},
      values: [],
      language: "en_US",
      limit: 200,
    }),
    { missing: "sms", why: contracts.noVersionWords("sms") },
  );
  assert.equal(contracts.noVersionWords("whatsapp"), "This message has no WhatsApp version.");
  assert.equal(contracts.noVersionWords("sms"), "This message has no text version yet.");
});

test("the opening ticks are the first channel, in the product's order, that the workspace is ready on and the message holds, and WhatsApp alone where there is none", () => {
  const message = (...channels) => cmOfferedMessages(readOf(channels.map((c) => rowOf(c))))[0].message;
  const ticks = (ready, m) => cmDefaultChannels(ready, m);
  // A message with an approved WhatsApp version opens on WhatsApp, with or without an email beside it: nothing made before changes.
  assert.deepEqual(ticks(WORKSPACE(), message("whatsapp")), ["whatsapp"]);
  assert.deepEqual(ticks(WORKSPACE(), message("whatsapp", "email")), ["whatsapp"]);
  // One with an email and no WhatsApp row opens on Email, and a text before an email.
  assert.deepEqual(ticks(WORKSPACE(), message("email")), ["email"]);
  assert.deepEqual(
    ticks(NO_NUMBER, message("whatsapp", "email")),
    ["email"],
    "no number: WhatsApp is not ready, so the email it holds",
  );
  assert.deepEqual(ticks(WORKSPACE(), message("email", "sms")), ["sms"], "WhatsApp, text, email: the product's order");
  // None that is both ready and held: WhatsApp alone, as before, for the page to say why it cannot send.
  const noMailbox = WORKSPACE({ email: { mailbox: false, domain: true } });
  assert.deepEqual(ticks(noMailbox, message("email")), ["whatsapp"]);
  assert.deepEqual(ticks(WORKSPACE(), null), ["whatsapp"], "no message in view");
  assert.deepEqual(
    ticks(contracts.readyOrWhatsApp(null), message("email")),
    ["whatsapp"],
    "a workspace whose readiness was not read: WhatsApp, as before",
  );
});

test("a WhatsApp version still in review with an email beside it is an offered message, and WhatsApp's tick says it is being reviewed", () => {
  const rows = [rowOf("whatsapp", { meta_status: "pending" }), rowOf("email")];
  const [offered, ...rest] = cmOfferedMessages(readOf(rows));
  assert.equal(rest.length, 0);
  assert.deepEqual(
    [offered.id, offered.channel, offered.channels, offered.message.versions.whatsapp.status],
    ["t-whatsapp", "email", ["email"], "pending"],
    "its id is its anchor's, the WhatsApp row in review, which the read does not return: its words are the email's",
  );
  assert.equal(offered.message.anchor.channel, "whatsapp");
  const by = sendByOf(offered, WORKSPACE());
  assert.deepEqual(by.ticked, ["email"]);
  assert.equal(by.ticks.whatsapp.why, "WhatsApp is still reviewing this message's WhatsApp version.");
  assert.equal(by.ticks.whatsapp.on, false);
  // Refused, paused and disabled each say their own; a message whose only version is one not approved is not offered at all.
  for (const [status, words] of [
    ["rejected", "WhatsApp refused this message's WhatsApp version."],
    ["paused", "WhatsApp has paused this message's WhatsApp version."],
    ["disabled", "WhatsApp has disabled this message's WhatsApp version."],
  ]) {
    const [m] = cmOfferedMessages(readOf([rowOf("whatsapp", { meta_status: status }), rowOf("email")]));
    assert.equal(sendByOf(m, WORKSPACE()).ticks.whatsapp.why, words, status);
  }
  assert.deepEqual(
    cmOfferedMessages(readOf([rowOf("whatsapp", { meta_status: "pending" })])),
    [],
    "as before: not offered",
  );
  // The same message as a cached read made it, with no `messages` in it: made of the rows the read holds, which leave the version in review out.
  const bare = cmOfferedMessages({ templates: [rowOf("email")] });
  assert.deepEqual([bare[0].id, bare[0].channels, bare[0].message.versions.whatsapp], ["t-email", ["email"], null]);
});

test("a WhatsApp version that cannot be put on the wire whole closes WhatsApp's tick in its own words, and the message is listed as blocked only when nothing else of it can go", () => {
  const picture = { blocked: "a picture for a heading" };
  // With an email beside it the message is offered, not blocked: the email goes, WhatsApp's tick says why not.
  const [both] = cmOfferedMessages(readOf([rowOf("whatsapp", picture), rowOf("email")]));
  assert.deepEqual([both.id, both.channel, both.channels, both.blocked], ["t-whatsapp", "whatsapp", ["email"], null]);
  assert.equal(
    sendByOf(both, WORKSPACE()).ticks.whatsapp.why,
    "This message's WhatsApp version has a picture for a heading, so it cannot be sent from here.",
  );
  // Alone it is listed with the reason, so a picker says why it is not offered (contracts sendableTemplates), as it did.
  const [alone, ...rest] = cmOfferedMessages(readOf([rowOf("whatsapp", picture)]));
  assert.equal(rest.length, 0);
  assert.deepEqual([alone.channels, alone.blocked], [[], "a picture for a heading"]);
  assert.deepEqual(contracts.sendableTemplates([alone]).blocked, [alone]);
  // A hidden message is offered to nobody, whatever its versions.
  assert.deepEqual(
    cmOfferedMessages(readOf([rowOf("whatsapp", { hidden_at: "2026-10-01T00:00:00.000Z" }), rowOf("email")])),
    [],
  );
});

test("a person held back is drawn as the message's own words, noted Not sent: WhatsApp's where the message has a version there, else its email's or its text's", () => {
  const held = (standIn, over = {}) => cmPreviewBy(WHATSAPP, null, OPTS({ standIn, ...over }));
  assert.equal(contracts.PREVIEW_WORDS.notSent, "Not sent");
  const wa = held("whatsapp");
  assert.deepEqual(
    [wa.via, wa.body, wa.footer, wa.mail, wa.note],
    [null, WHATSAPP.body, WHATSAPP.footer, null, "Not sent"],
    "WhatsApp's bubble, as it was, now noted",
  );
  // A message with an email version and no WhatsApp row: the email, as a mail with the foot the sender adds, unlabelled.
  const mail = held("email", { address: "12 Harbor Way" });
  assert.deepEqual(
    [mail.via, mail.kind, mail.body, mail.header, mail.note],
    [null, "Email", VERSIONS.email.body, null, "Not sent"],
  );
  assert.equal(mail.mail.subject, "A note, {{1}}");
  assert.ok(mail.mail.foot.endsWith("Northside Studio · 12 Harbor Way"), mail.mail.foot);
  // A text: the bubble with its STOP line.
  const text = held("sms");
  assert.deepEqual(
    [text.via, text.kind, text.body, text.footer, text.mail, text.note],
    [null, "Text message", VERSIONS.sms.body, "Reply STOP to opt out", null, "Not sent"],
  );
  // The words not in hand: the sentence for that, never another channel's words under the email's name.
  const lost = held("email", { versions: undefined });
  assert.deepEqual([lost.via, lost.mail, lost.note], [null, null, "This message has no email version yet."]);
  // A person on their channel is drawn as ever, whatever the stand-in: no note.
  assert.equal(cmPreviewBy(WHATSAPP, "email", OPTS({ standIn: "sms" })).note, null);
  assert.equal(cmPreviewBy(WHATSAPP, "whatsapp", OPTS({ standIn: "email" })).body, WHATSAPP.body);
  // The channel a stand-in is drawn on is the one the page holds the message's words on.
  assert.deepEqual(
    [cmStandInOf({ channel: "email" }), cmStandInOf({ channel: "sms" }), cmStandInOf({ channel: "whatsapp" })],
    ["email", "sms", "whatsapp"],
  );
  assert.equal(
    cmStandInOf({ channel: "voice" }),
    "whatsapp",
    "a row on no channel a message goes by is WhatsApp's, as every template was",
  );
  const [offered] = cmOfferedMessages(readOf([rowOf("email")]));
  assert.equal(cmStandInOf(offered), "email");
});

test("Not sent is said once: under an email's stand-in, which has no mark of its own; not again under a bubble the page marks held; and by a playbook's stand-in, which names no person", () => {
  fresh();
  const draw = (preview, props = {}) =>
    h(MessagePreview, { from: "Northside Studio", values: ["Mia", "7 pm"], ...preview, ...props });
  const mail = cmPreviewBy(WHATSAPP, null, OPTS({ standIn: "email" }));
  assert.equal(
    textOf(byTestId(draw(mail, { held: "Asked to stop." }), "mp-version-note")),
    "Not sent",
    "the mail has no held mark",
  );
  const bubble = draw(cmPreviewBy(WHATSAPP, null, OPTS({ standIn: "whatsapp" })), { held: "Asked to stop." });
  assert.ok(
    textOf(byTestId(bubble, "mp-held")).includes(contracts.PREVIEW_WORDS.notSent),
    "the bubble's own mark, in contracts' word",
  );
  assert.equal(byTestId(bubble, "mp-version-note"), null, "so no second one under it");
  const text = draw(cmPreviewBy(WHATSAPP, null, OPTS({ standIn: "sms" })), { held: "Asked to stop." });
  assert.ok(byTestId(text, "mp-held") && !byTestId(text, "mp-version-note"), "a text is a bubble too");
  // A playbook walks channels, not people, and marks nothing held: with none open its stand-in says Not sent itself.
  const walk = draw(cmPreviewBy(WHATSAPP, null, OPTS({ standIn: "whatsapp" })));
  assert.equal(byTestId(walk, "mp-held"), null);
  assert.equal(textOf(byTestId(walk, "mp-version-note")), "Not sent");
});
