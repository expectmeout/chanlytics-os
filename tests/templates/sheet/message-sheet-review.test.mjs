/**
 * The message sheet as the live demo found it (12 Nov 2026), and what its review changed: where a message stands when no
 * channel can carry it, the status card said once, the WhatsApp pencil only where WhatsApp holds the words, what waits
 * while WhatsApp looks, the way back to approved words and Ask's kept fix, a language added for every version, the menu on
 * every message, and the drawer of New. On the stub React, as message-versions-page.test.mjs draws the page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOURS,
  NOTHING_READY,
  Picker,
  TPL_VERSION_WORDS,
  TemplateComposer,
  boxOf,
  byTestId,
  contracts,
  custom,
  fieldOf,
  find,
  headed,
  itemOf,
  opened,
  ownRow,
  page,
  paneOf,
  press,
  redraw,
  rowOf,
  sendsIt,
  setSurfaceValue,
  settle,
  standingSays,
  standingWord,
  stubbed,
  textOf,
  toasts,
  usedBy,
} from "./_message-page.mjs";

test("a message something sends that no channel can carry here waits, in a quiet word with nothing to press, never 'Needs you' and never a channel's reason on its row; one a channel carries is sending, its card saying its word once", () => {
  const rows = [custom(HOURS)];
  page({ rows });
  sendsIt(usedBy(HOURS));
  setSurfaceValue("playbooks", { rows: [], ready: NOTHING_READY });
  let tree = redraw();
  // Its row stands with what something sends, never under Needs you: no press on this page mends a channel (the clean
  // list, 13 Nov 2026; it said "Nothing can send it here yet." and the channel's reason on every such row).
  assert.equal(byTestId(tree, "templates-need"), null, "nothing needs you");
  const row = rowOf(tree, HOURS);
  assert.equal(row.props["data-place"], "going");
  const word = (of) => find(of, (n) => n.props?.testid === "template-status") ?? null;
  assert.equal(word(row).props.label, "Waiting", "one quiet word");
  assert.equal(word(row).props.value, "plain", "in no warning's tone");
  assert.equal(textOf(row).includes("Nothing can send"), false, "and no reason under its name");
  assert.equal(textOf(row).includes(contracts.CHANNEL_WORDS.noWhatsApp), false);
  tree = opened(tree, HOURS);
  assert.equal(standingWord(tree), "Waiting");
  assert.equal(
    standingSays(tree),
    "Waiting. Set to go out with Hours · step 2. It goes by itself as soon as there is a way to send it.",
  );

  // A channel that carries it: Sending, and the card says the word once, then what sends it.
  setSurfaceValue("playbooks", {
    rows: [],
    ready: contracts.channelsReady({
      whatsapp: { canSend: true, refusal: null },
      textLine: null,
      email: { mailbox: false, domain: true },
    }),
  });
  tree = redraw();
  assert.equal(standingWord(tree), "Sending");
  assert.equal(standingSays(tree), "Sending. Sent by Hours · step 2.");
  assert.equal(word(rowOf(tree, HOURS)), null, "and its row wears no word");
  // The channels not read say nothing of them: what sends it decides.
  setSurfaceValue("playbooks", undefined);
  assert.equal(standingWord(redraw()), "Sending");

  // An email it has words for, where email could not be asked about just now: a question nobody answered is not a no,
  // so nothing is said of it. With no email of its own, the same unanswered question changes nothing: it waits.
  const unasked = contracts.channelsReady({ whatsapp: null, textLine: null, email: { mailbox: true, domain: null } });
  page({ rows, versions: [ownRow("email", HOURS)] });
  sendsIt(usedBy(HOURS));
  setSurfaceValue("playbooks", { rows: [], ready: unasked });
  assert.equal(word(rowOf(redraw(), HOURS)), null, "a check that did not answer says nothing");
  page({ rows });
  sendsIt(usedBy(HOURS));
  setSurfaceValue("playbooks", { rows: [], ready: unasked });
  assert.equal(word(rowOf(redraw(), HOURS)).props.label, "Waiting");
});

test("a message put away that something still sends says so on its card: putting it away stops nothing", () => {
  const rows = [custom(HOURS, { hidden_at: "2026-11-12T00:00:00Z" })];
  page({ rows });
  sendsIt(usedBy(HOURS));
  // Put away is a folded group: its head unfolds it.
  press(byTestId(redraw(), "templates-hidden"));
  const tree = opened(redraw(), HOURS);
  assert.equal(standingWord(tree), "Put away");
  assert.equal(
    standingSays(tree),
    "Put away. On file, out of the list and the composers. Its name brings it back. Putting it away stops nothing: it is still sent by Hours · step 2.",
  );
});

test("WhatsApp's words have no pencil where WhatsApp holds no copy of them (never sent there): only a message it holds is changed and sent back", () => {
  let tree = opened(page({ rows: [custom(HOURS, { at_meta: false })] }), HOURS);
  assert.equal(byTestId(paneOf(tree), "template-words-edit"), null);
  tree = opened(page({ rows: [custom(HOURS, { at_meta: true })] }), HOURS);
  assert.ok(byTestId(paneOf(tree), "template-words-edit"), "held by WhatsApp: its pencil");
  // A server from before `at_meta` says nothing of it: the pencil stands, and the edge answers in words.
  tree = opened(page({ rows: [custom(HOURS)] }), HOURS);
  assert.ok(byTestId(paneOf(tree), "template-words-edit"));
});

test("changing an approved message's WhatsApp words says first what waits while WhatsApp looks, and says what Send does under the box", () => {
  page({ rows: [custom(HOURS)] });
  setSurfaceValue("playbooks", {
    rows: [
      { id: "pb-1", name: "Hours", template_name: HOURS, template_language: "en_US", state: "running", runs: true },
    ],
  });
  let tree = opened(redraw(), HOURS);
  press(byTestId(paneOf(tree), "template-words-edit"));
  tree = redraw();
  assert.equal(fieldOf(tree, "Message").props.hint, TPL_VERSION_WORDS.whatsappNote, "what Send does, under the box");
  assert.equal(byTestId(paneOf(tree), "template-words-holds"), null, "nothing changed yet: nothing waits");
  boxOf(tree, "Message").props.onValueChange("Hi {{1}}, our hours now start {{2}}.");
  tree = redraw();
  assert.equal(
    textOf(byTestId(paneOf(tree), "template-words-holds")),
    "While WhatsApp looks at the new words, usually a few minutes, “Hours” waits and sends by itself once it says yes.",
  );
  // One sentence, contracts', which Ask's card says too.
  assert.equal(
    contracts.MESSAGE_CHANGE_WORDS.holdsWhileChecked(["Hours"], true),
    "While WhatsApp looks at the new words, usually a few minutes, “Hours” waits and sends by itself once it says yes, and the receptionist won't text it to someone who asks to book.",
  );
  assert.equal(contracts.MESSAGE_CHANGE_WORDS.holdsWhileChecked([], false), null, "nothing sends it: nothing is said");
});

test("a refused change offers the words WhatsApp approved before it, put in the box to send again", () => {
  const before = "Hi {{1}}, our hours start {{2}}. See you soon.";
  const refused = custom(HOURS, {
    meta_status: "rejected",
    rejected_reason: "Promotional words",
    approved_before: before,
  });
  stubbed({ rewrite: async () => new Promise(() => undefined) });
  let tree = opened(page({ rows: [refused] }), HOURS);
  const back = byTestId(paneOf(tree), "template-words-back");
  assert.ok(back, "a refused message opens in its editor, with the way back");
  assert.equal(textOf(back), TPL_VERSION_WORDS.goBack);
  // A message with no approved words before it has no way back to offer.
  tree = opened(
    page({ rows: [custom(HOURS, { meta_status: "rejected", rejected_reason: "Promotional words" })] }),
    HOURS,
  );
  assert.equal(byTestId(paneOf(tree), "template-words-back"), null);
});

test("a language word asked for from the menu goes again as its list closes with nothing added: one language is no choice to show", () => {
  let tree = opened(page({ rows: [custom(HOURS)] }), HOURS);
  const langWord = (t) => find(paneOf(t), (n) => n.type === Picker && n.props["data-testid"] === "template-lang");
  assert.equal(langWord(tree), null, "one language: no word");
  itemOf(tree, "Add").onSelect();
  tree = redraw();
  const word = langWord(tree);
  assert.ok(word, "asked for, it is drawn, its list opening");
  assert.equal(typeof word.props.onClosed, "function");
  word.props.onClosed();
  tree = redraw();
  assert.equal(langWord(tree), null, "closed with nothing added (the live demo, 12 Nov 2026: an 'English' stayed)");
});

test("a language added is written for every version the message has: a message with no WhatsApp version adds one by its email and text alone, each written by Ask and saved", async () => {
  const calls = stubbed({
    rewrite: async (b) => (
      calls.push(["rewrite", b]),
      { ok: true, data: { subject: b.subject ? "Nuestro horario" : null, body: "Hola {{1}}, abrimos {{2}}." } }
    ),
  });
  const own = [ownRow("email", HOURS, { category: "utility" }), ownRow("sms", HOURS, { category: "utility" })];
  // No WhatsApp number at all: an email and a text need none.
  let tree = opened(page({ rows: [], versions: own, channels: [] }), HOURS);
  itemOf(tree, "Add").onSelect();
  tree = redraw();
  const word = find(paneOf(tree), (n) => n.type === Picker && n.props["data-testid"] === "template-lang");
  assert.ok(word, "the language word opens to add one");
  word.props.onValueChange("es");
  await settle();
  assert.deepEqual(
    calls.map(([what, b]) => [what, b.channel, b.language]),
    [
      ["rewrite", "email", "es"],
      ["save", "email", "es"],
      ["rewrite", "sms", "es"],
      ["save", "sms", "es"],
    ],
    "each written by Ask in Spanish, then saved beside the message",
  );
  assert.match(calls[0][1].ask, /^Write this same message in Spanish/);
  assert.deepEqual(calls[1][1], {
    name: HOURS,
    language: "es",
    channel: "email",
    subject: "Nuestro horario",
    body: "Hola {{1}}, abrimos {{2}}.",
  });
});

test("a language WhatsApp's version was written in brings the message's email and text with it, once WhatsApp's has gone", async () => {
  const calls = stubbed({
    rewrite: async (b) => (
      calls.push(["rewrite", b]),
      { ok: true, data: { subject: "Horario", body: "Hola {{1}}, abrimos {{2}}." } }
    ),
  });
  let tree = opened(page({ rows: [custom(HOURS)], versions: [ownRow("email", HOURS)] }), HOURS);
  itemOf(tree, "Add").onSelect();
  tree = redraw();
  find(paneOf(tree), (n) => n.type === Picker && n.props["data-testid"] === "template-lang").props.onValueChange("es");
  tree = redraw();
  const composer = find(paneOf(tree), (n) => n.type === TemplateComposer);
  assert.ok(composer, "WhatsApp's words are drafted in it first, as before");
  assert.equal(composer.props.translate.language, "es");
  composer.props.onDone({ id: "w-es", name: HOURS, language: "es", meta_status: "pending" });
  await settle();
  assert.deepEqual(
    calls.map(([what, b]) => [what, b.channel, b.language]),
    [
      ["rewrite", "email", "es"],
      ["save", "email", "es"],
    ],
  );
});

test("put away while a sequence still sends it says so as it goes: putting it away stops nothing", async () => {
  stubbed({ hide: async () => ({ ok: true, data: {} }) });
  page({ rows: [custom(HOURS)] });
  sendsIt(usedBy(HOURS));
  const tree = opened(redraw(), HOURS);
  itemOf(tree, "Put").onSelect();
  await settle();
  assert.match(
    textOf(toasts.at(-1).msg),
    /is put away — still on file\. Putting it away stops nothing: it is still sent by Hours · step 2\./,
  );
});

test("New's drawer on a phone draws no 'Messages' line over its own head, as an open message's does not", () => {
  page({ rows: [] });
  press(headed(redraw(), "template-new"));
  const tree = redraw();
  const drawer = find(tree, (n) => n.props?.testid === "tpl-drawer");
  if (drawer) assert.equal(drawer.props.bare, true);
});

test("a refused message whose fix Ask already wrote opens on those words at once, never asking Ask again; Undo is the refused words", () => {
  let asked = 0;
  stubbed({ rewrite: async () => (asked++, new Promise(() => undefined)) });
  const kept = "Hi {{1}}, our hours start {{2}}. Book when it suits you.";
  const refused = custom(HOURS, { meta_status: "rejected", rejected_reason: "Promotional words", fix_words: kept });
  let tree = opened(page({ rows: [refused] }), HOURS);
  assert.equal(boxOf(tree, "Message").props.value, kept, "the kept words, in the box");
  assert.equal(asked, 0, "Ask is not asked again");
  press(byTestId(paneOf(tree), "template-version-undo"));
  tree = redraw();
  assert.equal(
    boxOf(tree, "Message").props.value,
    "Hi {{1}}, our hours start {{2}}.",
    "Undo: the words WhatsApp refused",
  );
  // With none kept, Ask writes them as the editor opens, and is told they answer this refusal, so they are kept.
  const calls = [];
  stubbed({ rewrite: async (b) => (calls.push(b), new Promise(() => undefined)) });
  opened(page({ rows: [custom(HOURS, { meta_status: "rejected", rejected_reason: "Promotional words" })] }), HOURS);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].fixing, { template_id: `w-${HOURS}`, reason: "Promotional words" });
});

test("a refusal WhatsApp gave no reason for keeps Ask's fix under no reason, as the read finds it, never under the prompt's words", () => {
  const calls = [];
  stubbed({ rewrite: async (b) => (calls.push(b), new Promise(() => undefined)) });
  opened(page({ rows: [custom(HOURS, { meta_status: "rejected", rejected_reason: null })] }), HOURS);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].fixing, { template_id: `w-${HOURS}`, reason: "" });
  assert.match(calls[0].ask, /no reason given/, "the prompt still says WhatsApp gave none");
});

test("a message only WhatsApp carries is not 'Needs you' while WhatsApp reviews its new words: waiting is not needing you", () => {
  page({ rows: [custom(HOURS, { meta_status: "pending" })] });
  sendsIt(usedBy(HOURS));
  setSurfaceValue("playbooks", {
    rows: [],
    ready: contracts.channelsReady({
      whatsapp: { canSend: true, refusal: null },
      textLine: null,
      email: { mailbox: false, domain: true },
    }),
  });
  const tree = opened(redraw(), HOURS);
  assert.notEqual(standingWord(tree), "Needs you");
  assert.equal(standingWord(tree), "Checking", "its head says WhatsApp is checking");
});

test("a language added after WhatsApp's brings both the email and the text, each written in it once WhatsApp's has gone", async () => {
  const calls = stubbed({
    rewrite: async (b) => (
      calls.push(["rewrite", b]),
      { ok: true, data: { subject: "Horario", body: "Hola {{1}}, abrimos {{2}}." } }
    ),
  });
  const versions = [
    ownRow("email", HOURS),
    ownRow("sms", HOURS, { category: "utility" }),
    ownRow("email", HOURS, { language: "es" }),
  ];
  let tree = opened(page({ rows: [custom(HOURS, { category: "utility" })], versions }), HOURS);
  const composerOf = (t) => find(paneOf(t), (n) => n.type === TemplateComposer);
  const lang = find(paneOf(tree), (n) => n.type === Picker && n.props["data-testid"] === "template-lang");
  lang.props.onValueChange("fr");
  tree = redraw();
  composerOf(tree).props.onDone({ id: "w-fr", name: HOURS, language: "fr", meta_status: "pending" });
  await settle();
  assert.deepEqual(
    calls.filter(([w]) => w === "save").map(([, b]) => [b.channel, b.language]),
    [
      ["email", "fr"],
      ["sms", "fr"],
    ],
  );
});

test("words the door refuses before sending them (their shape, or what a reader saw) are written again by Ask at once, from the reason, which stays under the box; a limit or a twin, which new words do not mend, asks Ask nothing", async () => {
  const would = "WhatsApp would refuse this: It asks for a full card number. Ask for the last four.";
  const asked = [];
  const answers = [{ ok: false, code: "validation", status: 400, message: would }];
  stubbed({
    sendWords: async () => answers.shift(),
    rewrite: async (b) => (asked.push(b), new Promise(() => undefined)),
  });
  page({ rows: [custom(HOURS)] });
  let tree = opened(redraw(), HOURS);
  press(byTestId(paneOf(tree), "template-words-edit"));
  boxOf(redraw(), "Message").props.onValueChange("Hi {{1}}, send your full card number before {{2}}.");
  await press(byTestId(paneOf(redraw()), "template-version-save"));
  await settle();
  tree = redraw();
  assert.equal(textOf(byTestId(paneOf(tree), "template-version-error")), would, "why, under the box");
  assert.equal(asked.length, 1, "Ask is asked once, at once");
  assert.equal(asked[0].ask, TPL_VERSION_WORDS.fixBefore(would));
  assert.equal(asked[0].body, "Hi {{1}}, send your full card number before {{2}}.", "from the words as they were");
  // One change a day, a twin, a send going out: said, and Ask is not asked to write words that would change nothing.
  answers.push({ ok: false, code: "conflict", status: 409, message: "WhatsApp takes one change a day." });
  stubbed({
    sendWords: async () => answers.shift(),
    rewrite: async (b) => (asked.push(b), new Promise(() => undefined)),
  });
  page({ rows: [custom(HOURS)] });
  tree = opened(redraw(), HOURS);
  press(byTestId(paneOf(tree), "template-words-edit"));
  boxOf(redraw(), "Message").props.onValueChange("Hi {{1}}, our hours now start {{2}}.");
  await press(byTestId(paneOf(redraw()), "template-version-save"));
  await settle();
  assert.equal(textOf(byTestId(paneOf(redraw()), "template-version-error")), "WhatsApp takes one change a day.");
  assert.equal(asked.length, 1, "no second ask");
});
