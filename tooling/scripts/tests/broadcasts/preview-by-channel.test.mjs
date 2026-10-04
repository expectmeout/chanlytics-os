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
 * - The split is a bar: each part's share of the people reached, in the channel's own chart colour, its words in the kit's
 *   tooltip and its meaning to a screen reader; none where the campaign goes by WhatsApp alone.
 * Run on the stub React over the parts the composers draw (the composers' own wiring is held in
 * broadcasts-honest.test.mjs and playbook-composer.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import * as contracts from "@chanlytics/contracts";
import { ROOT } from "../_source.mjs";
import { installLegacyReact, fresh, all, find, byTestId, textOf, press } from "../_legacy-react.mjs";

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
const { CmSplitBar } = await import(`${SRC}/surfaces/campaigns/parts/split-bar.tsx`);
const { MessagePreview, PreviewStepper } = await import(`${SRC}/surfaces/campaigns/parts/message-preview.tsx`);
const { cmPreviewBy, cmChannelOfPerson } = await import(`${SRC}/surfaces/campaigns/parts/preview-by.ts`);
const { cmVersionsOf, cmReachBy, cmChannelColour, cmViaTicks } = await import(
  `${SRC}/surfaces/campaigns/parts/channels.ts`
);
const { CmVia } = await import(`${SRC}/surfaces/campaigns/parts/send-by.tsx`);
const { Meter } = await import(`${SRC}/surfaces/kit/meter/meter.tsx`);
const { Tooltip } = await import(`${SRC}/surfaces/kit/tooltip/tooltip.tsx`);

const h = (type, props, ...kids) => globalThis.React.createElement(type, props, ...kids);

const READY = contracts.channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true },
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
      "You're getting this because of your visit",
    ),
    "a visit's reason where the person's row kept the visit's time",
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
  assert.equal(none.missing, "This message has no email version to show here.");
});

test("cmVersionsOf reads a message's email and text versions in a language from the rows the workspace holds", () => {
  const rows = [
    { name: "hours_note", channel: "whatsapp", language: "en_US", body_preview: "Hi {{1}}" },
    {
      name: "hours_note",
      channel: "email",
      language: "en_US",
      header: "A note, {{1}}",
      body_preview: "Hi {{1}}, we are open late.",
    },
    { name: "hours_note", channel: "sms", language: "en_US", body_preview: "Open late, {{1}}." },
    { name: "hours_note", channel: "email", language: "es_MX", header: "Una nota", body_preview: "Hola" },
    { name: "other", channel: "email", language: "en_US", header: "Other", body_preview: "Other" },
  ];
  assert.deepEqual(cmVersionsOf(rows, "hours_note", "en_US"), {
    email: { subject: "A note, {{1}}", body: "Hi {{1}}, we are open late." },
    sms: { subject: null, body: "Open late, {{1}}." },
  });
  assert.deepEqual(cmVersionsOf(rows, "hours_note", "es_MX"), { email: { subject: "Una nota", body: "Hola" } });
  assert.deepEqual(cmVersionsOf(rows, "nothing", "en_US"), {});
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
    [null, null, WHATSAPP.body, "This message has no email version to show here."],
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
  assert.equal(textOf(byTestId(tree, "mp-version-note")), "This message has no email version to show here.");
});

test("the stepper walks the people and wraps, each press one step, and says its place: ‹ Ana Reyes · 1 of 3 ›", () => {
  fresh();
  const people = [
    { label: "Ana Reyes", position: "1 of 3" },
    { label: "Sol Text", position: "2 of 3" },
    { label: "Mia Mail", position: "3 of 3" },
  ];
  const steps = [];
  const at = (index) => h(PreviewStepper, { people, index, onStep: (i) => steps.push(i) });
  let tree = at(0);
  assert.equal(textOf(byTestId(tree, "mp-step")), "Ana Reyes1 of 3");
  const press1 = (tree, label) => press(find(tree, (n) => n.props?.["aria-label"] === label));
  press1(tree, "The next person");
  press1(tree, "The person before this one");
  assert.deepEqual(steps, [1, 2], "forward one, and back from the first wraps to the last");
  tree = at(2);
  press1(tree, "The next person");
  assert.deepEqual(steps.at(-1), 0, "past the last, the first");
  // Its two presses are the kit's quiet icon buttons, named for a screen reader.
  assert.deepEqual(
    [
      ...new Set(
        all(byTestId(tree, "mp-step"), (n) => typeof n.props?.["aria-label"] === "string").map(
          (n) => n.props["aria-label"],
        ),
      ),
    ],
    ["The person before this one", "The next person"],
  );
  // A playbook's walk is its channels, and says so to a screen reader.
  tree = h(PreviewStepper, {
    people: [
      { label: "On WhatsApp", position: "10 people" },
      { label: "By email", position: "4 people" },
    ],
    index: 1,
    onStep() {},
    words: contracts.PREVIEW_WORDS.walk.channels,
  });
  assert.equal(textOf(byTestId(tree, "mp-step")), "By email4 people");
  assert.ok(find(tree, (n) => n.props?.["aria-label"] === "The next channel"));
  // One alone is no walk.
  assert.equal(byTestId(h(PreviewStepper, { people: people.slice(0, 1), index: 0, onStep() {} }), "mp-step"), null);
});

/* ---------------------------------- why a channel is closed, to a finger ---------------------------------- */

test("why a channel is closed is a line under the Send by row where there is no pointer -- the kit's tooltip never shows to a finger -- and each switch keeps the same words as its description", () => {
  fresh();
  // The workspace sends on WhatsApp alone: WhatsApp is the one on (and stays on), text and email are closed, each for its own reason.
  const ready = contracts.channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  });
  const ticks = cmViaTicks(["whatsapp"], ready, "conversational", false);
  const tree = h(CmVia, { ticks, onTick() {}, testid: "bc-via" });
  const whys = byTestId(tree, "bc-via-whys");
  assert.deepEqual(
    all(whys, (n) => n.type === "li").map((n) => [n.props["data-channel"], textOf(n)]),
    ticks.map((t) => [t.channel, `${t.word} ${t.why}`]),
    "a line for each channel that has a reason, under the row, with the channel's name before it",
  );
  assert.deepEqual(
    ticks.map((t) => t.why !== null),
    [true, true, true],
    "(the one channel that is on says why it cannot be turned off, as the others say why they cannot be turned on)",
  );
  assert.equal(whys.props["aria-hidden"], "true", "hidden from a screen reader, which has the words already");
  // The screen reader's own copy is each switch's description, as it was.
  for (const t of ticks) {
    const one = byTestId(tree, `bc-via-${t.channel}`);
    const said = find(one, (n) => n.props?.className === "cm-sr");
    assert.equal(textOf(said), t.why);
    assert.equal(find(one, (n) => n.props?.describedBy !== undefined).props.describedBy, said.props.id);
  }
  // Nothing to say, no line: a row whose every channel is open and none is the last one on.
  const open = contracts.channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: { sms_state: "active", reg_mock: false },
    email: { mailbox: true, domain: true },
  });
  const quiet = h(CmVia, {
    ticks: cmViaTicks(["whatsapp", "sms"], open, "conversational", false),
    onTick() {},
    testid: "bc-via",
  });
  assert.equal(byTestId(quiet, "bc-via-whys"), null);
});

test("the line is drawn for a touch screen alone: hidden in the stylesheet, shown under (hover: none), in tokens", () => {
  const file = "apps/dashboard/src/surfaces/campaigns/campaigns.css";
  const css = transform({
    filename: file,
    code: fs.readFileSync(path.join(ROOT, file)),
    minify: true,
  }).code.toString();
  const rule = /\.cm-via-whys\{([^}]*)\}/.exec(css);
  assert.ok(rule, "a rule for the line");
  assert.ok(rule[1].includes("display:none"), "off wherever there is a pointer, where the tooltip says it");
  const touch = /@media \(hover:none\)\{\.cm-via-whys\{([^}]*)\}\}/.exec(css);
  assert.ok(touch, "and on under (hover: none)");
  assert.ok(touch[1].includes("display:flex"), touch?.[1]);
  // Its size, ink and gap are the tokens', as every value in a stylesheet is.
  assert.ok(rule[1].includes("font-size:var(--text-xs)") && rule[1].includes("color:var(--ink-dim)"), rule[1]);
  assert.ok(touch[1].includes("gap:var(--space-1)"), touch[1]);
});

/* ---------------------------------- the split as a bar ---------------------------------- */

const SPLIT = (byChannel, over = {}) => ({
  reached: Object.values(byChannel).reduce((a, b) => a + b, 0),
  byChannel,
  held: 5,
  heldBy: { no_yes: 5 },
  ...over,
});

test("the split bar: a part for each channel that reaches anyone, its width the share of the people reached, in the channel's own colour, its words in the tooltip", () => {
  fresh();
  const split = SPLIT({ whatsapp: 12, sms: 0, email: 12 });
  const tree = h(CmSplitBar, { split, className: "bc-to-bar", testid: "bar" });
  const meter = find(tree, (n) => n.type === Meter);
  assert.deepEqual(
    meter.props.parts,
    [
      { share: 12, color: cmChannelColour("whatsapp") },
      { share: 12, color: cmChannelColour("email") },
    ],
    "WhatsApp and email, in that order; a channel nobody is reached on has no part",
  );
  assert.deepEqual(
    all(meter, (n) => n.props?.style && "flexGrow" in n.props.style).map((n) => n.props.style.flexGrow),
    [12, 12],
    "each part's share is its width",
  );
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map(cmChannelColour),
    ["var(--chart-cat-1)", "var(--chart-cat-4)", "var(--chart-cat-3)"],
    "a channel is the colour Reports draws it in, a chart palette token",
  );
  assert.equal(
    meter.props["aria-label"],
    "Reaches 24: 12 on WhatsApp, 12 by email",
    "the split in words, to a screen reader",
  );
  assert.equal(meter.props.size, "sm", "thin");
  assert.equal(meter.props["data-testid"], "bar");
  assert.equal(meter.props.tabIndex, 0, "a stop for the keyboard, which brings the tip");
  const tip = find(tree, (n) => n.type === Tooltip);
  assert.equal(tip.props.tip, "12 on WhatsApp, 12 by email", "its words on hover and on focus, in the kit's tooltip");
  // Three channels, unequal: the widths follow the numbers, and the held are not in the bar.
  const three = find(
    h(CmSplitBar, { split: SPLIT({ whatsapp: 52, sms: 12, email: 32 }), testid: "bar" }),
    (n) => n.type === Meter,
  );
  assert.deepEqual(
    three.props.parts.map((p) => p.share),
    [52, 12, 32],
  );
  assert.equal(three.props["aria-label"], "Reaches 96: 52 on WhatsApp, 12 by text, 32 by email");
  // One channel is one whole part, said as one.
  const one = find(
    h(CmSplitBar, { split: SPLIT({ whatsapp: 0, sms: 0, email: 8 }), testid: "bar" }),
    (n) => n.type === Meter,
  );
  assert.deepEqual(one.props.parts, [{ share: 8, color: "var(--chart-cat-3)" }]);
  assert.equal(one.props["aria-label"], "Reaches 8 by email");
  // Nobody reached: no bar.
  assert.equal(
    find(h(CmSplitBar, { split: SPLIT({ whatsapp: 0, sms: 0, email: 0 }), testid: "bar" }), (n) => n.type === Meter),
    null,
  );
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
    why: "This message has no email version to show here.",
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
  const rows = [
    { name: "hours_note", channel: "email", language: "en_US", header: "A note", body_preview: "Hi" },
    { name: "hours_note", channel: "sms", language: "en_US", body_preview: "Open late." },
    { name: "hours_note", channel: "whatsapp", language: "en_US", body_preview: "WhatsApp's words" },
    { name: "hours_note", channel: "email", language: "es_MX", header: "Una nota", body_preview: "Hola" },
  ];
  assert.deepEqual(contracts.previewVersionsOf(rows, "hours_note", "en_US"), cmVersionsOf(rows, "hours_note", "en_US"));
  assert.deepEqual(contracts.previewVersionsOf(rows, "hours_note", "en_US"), {
    email: { subject: "A note", body: "Hi" },
    sms: { subject: null, body: "Open late." },
  });
});
