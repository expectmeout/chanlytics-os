/**
 * The Inbox in the owner's words, offering only the templates that can send (I4).
 *
 * Seen on the salon's workspace, 15 Sep 2026, look-only:
 * - the phone-only composer read "PHONE · +19175550106", where the header said "+1 (917) 555-0106";
 * - the template picker read "booking_link · en_US", and offered all seven approved templates to people the
 *   reply route refuses most of them for: a promotion goes only to someone who said yes to offers, and the Inbox
 *   fills exactly two values -- a button whose only outcome was a refusal;
 * - its button said "Send booking link" whichever template was picked;
 * - the search offered "threads, clients, tags" on a workspace with no tags and no clients page;
 * - a teammate with no name was shouted in capitals: "BILLING@RJCAPITAL.IO HAS IT".
 * Run against the contracts, the server's row mapping, and the pages on a stub React.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again } from "../../_legacy-react.mjs";

// New exports are read at run time, so a missing one fails its own test and not the file.
const contracts = await import("@chanlytics/contracts");

const ZONE = "America/New_York";
const NOW = new Date("2026-09-15T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const person = (over = {}) => ({
  id: "p1",
  display_name: "Rosa Díaz",
  wa_profile_name: null,
  phone_e164: "+16465550123",
  consent: "unknown",
  dnc: false,
  ...over,
});
const wrote = (id, body, min) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at: ago(min),
  channel_ts: ago(min),
});
const callNote = {
  id: "m9",
  direction: "inbound",
  sender: "system",
  type: "call_summary",
  body: "Inbound call · 3 min — asked about a bridal trial",
  media: null,
  meta: {},
  status: "received",
  created_at: ago(56),
  channel_ts: ago(56),
};
// Two days since they last wrote: the WhatsApp window is closed, and only a template sends.
const conv = (over = {}) => ({
  id: "c1",
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(3000),
  last_message_at: ago(3000),
  contact: person(),
  messages: [wrote("m1", "Is Saturday free?", 3000)],
  ...over,
});
const asked = (over = {}) => ({
  id: "e1",
  reason: "human_token",
  details: null,
  state: "open",
  created_at: ago(40),
  ...over,
});
// Templates as GET templates returns them to the composer.
const tpl = (name, over = {}) => ({
  id: `t-${name}-${over.language ?? "en_US"}`,
  channel: "whatsapp",
  name,
  language: "en_US",
  body_preview: "Hi",
  variables: [{}, {}],
  category: "utility",
  meta_status: "approved",
  title: null,
  ...over,
});
// The shapes the salon's rows have: a Meta template's labels, and the starters' "Value n" labels with their examples.
const valued = (...examples) => examples.map((example, i) => ({ label: `Value ${i + 1}`, example, position: i + 1 }));
const booking = tpl("booking_link", {
  variables: [
    { label: "Business name", example: "Marisa's Beauty Salon", position: 1 },
    { label: "Booking link", example: "book.example.com/marisas", position: 2 },
  ],
});
const offer = tpl("monthly_offer", {
  category: "marketing",
  variables: valued(
    "Dani",
    "Luna Studio",
    "20% off balayage for regulars, book by Friday.",
    "https://booksy.com/luna-studio",
  ),
});
const note = tpl("quick_note", {
  variables: valued("Dani", "Luna Studio", "we're open late on Thursdays this month."),
});
const saveEs = tpl("save_our_number", {
  language: "es",
  variables: [
    { label: "Nombre", example: "Dani", position: 1 },
    { label: "Nombre del negocio", example: "Luna Studio", position: 2 },
    { label: "Enlace de reservas", example: "https://booksy.com/luna-studio", position: 3 },
  ],
});
const welcome = tpl("welcome_new", { variables: valued("Dani", "Luna Studio", "https://booksy.com/luna-studio") });

/* ------------------------------ the contracts ------------------------------ */

test("the templates a person can be sent: every slot a fact the Inbox has, a promotion only to someone who said yes to offers -- in the owner's words, with why the rest are not offered", () => {
  const { inboxTemplates, languageWords } = contracts;
  assert.deepEqual(
    [languageWords("en_US"), languageWords("es"), languageWords("pt-BR")],
    ["English", "Spanish", "Portuguese"],
  );
  const no = inboxTemplates([booking, offer, note, saveEs], { who: "Rosa Díaz", offersOk: false });
  assert.deepEqual(
    no.sendable.map((s) => [s.template.name, s.title, s.label]),
    [
      ["quick_note", "A quick note", "A quick note"],
      ["booking_link", "Booking link", "Booking link"],
      ["save_our_number", "Save our number", "Save our number"],
    ],
    "a message is offered by its title: the language it is written in is not a choice a person makes",
  );
  // One blank of words is the member's to write in the template box (the phone canvas, C1): a note is offered, with its
  // blank, and first, since it answers whatever they asked; every other slot is a fact the Inbox has.
  assert.deepEqual(
    no.sendable.map((s) => [s.blank?.label ?? null, s.fits]),
    [
      ["The note", true],
      [null, false],
      [null, false],
    ],
    "REGRESSION: Daniela's price question could not be answered through the shut window -- the note was 'not offered'",
  );
  assert.equal(no.hidden, "Not offered: 1 promotion (Rosa Díaz hasn't said yes to offers).");
  const yes = inboxTemplates([booking, offer, note, welcome], { who: "Rosa Díaz", offersOk: true });
  assert.deepEqual(
    yes.sendable.map((s) => s.title),
    ["A quick note", "Booking link", "This month's offer (earlier)", "Welcome"],
    "REGRESSION: a starter that opens with their first name was turned away for taking three values",
  );
  assert.equal(yes.sendable[2].blank?.label, "The offer", "an offer's words are the member's to write");
  assert.equal(yes.hidden, null);
  // More than one blank, or a slot that is no fact and no words (a review link the Inbox does not keep), stays back.
  const twoBlanks = tpl("two_notes", {
    variables: valued("Dani", "Luna Studio", "we're open late.", "and on Sundays."),
  });
  assert.deepEqual(inboxTemplates([twoBlanks], { who: "Rosa Díaz", offersOk: false }), {
    sendable: [],
    hidden: "Not offered: 1 that needs words the Inbox doesn't ask for.",
  });
  const promo = inboxTemplates([booking, tpl("welcome_new", { category: "marketing", variables: welcome.variables })], {
    who: "Rosa Díaz",
    offersOk: false,
  });
  assert.equal(
    promo.hidden,
    "Not offered: 1 promotion (Rosa Díaz hasn't said yes to offers).",
    "a promotion still waits for a yes to offers",
  );
  assert.equal(
    inboxTemplates([booking], { who: "Rosa Díaz", offersOk: false }).hidden,
    null,
    "nothing held back, nothing said",
  );
  assert.deepEqual(
    inboxTemplates([tpl("x", { category: null, variables: booking.variables })], { who: "Rosa Díaz", offersOk: false })
      .sendable,
    [],
    "a template with no category is a promotion, as the route judges it",
  );
  assert.equal(
    inboxTemplates([tpl("given", { title: "Spring hello", variables: booking.variables })], {
      who: "Rosa Díaz",
      offersOk: false,
    }).sendable[0].title,
    "Spring hello",
    "the title the workspace gave it first",
  );
  assert.equal(
    inboxTemplates([tpl("unsynced", { variables: null })], { who: "Rosa Díaz", offersOk: false }).sendable.length,
    1,
    "a template whose slots were never recorded keeps the two the Inbox always sent",
  );
});

test("a template's one blank of words is the member's: its slot, its label and its example -- never a second blank, a fact, or a slot that is no words", () => {
  const { inboxBlankOf } = contracts;
  assert.deepEqual(inboxBlankOf(note), {
    at: 2,
    label: "The note",
    example: "we're open late on Thursdays this month.",
  });
  assert.deepEqual(
    inboxBlankOf(
      tpl("reservar_ahora", {
        variables: [
          { label: "Business name", position: 1 },
          { label: "Offer", position: 2 },
        ],
      }),
    ),
    { at: 1, label: "Offer", example: null },
    "a Meta template's own label, with no example",
  );
  assert.equal(inboxBlankOf(booking), null, "every slot a fact the Inbox has");
  assert.equal(
    inboxBlankOf(tpl("two_notes", { variables: valued("Dani", "Luna Studio", "we're open late.", "and on Sundays.") })),
    null,
    "two blanks: one box writes one",
  );
});

test("a template's words as she will read them: her name and the business's facts filled in, the blank where its words go", () => {
  const { inboxTemplateParts } = contracts;
  const facts = { firstName: "Rosa", businessName: "Marisa's", bookingLink: "https://book.example.com/marisas" };
  const said = { ...note, body_preview: "Hi {{1}}, a quick note from {{2}}: {{3}} Write back here." };
  assert.deepEqual(inboxTemplateParts(said, facts), [
    { words: "Hi " },
    { words: "Rosa" },
    { words: ", a quick note from " },
    { words: "Marisa's" },
    { words: ": " },
    { blank: "The note" },
    { words: " Write back here." },
  ]);
  assert.deepEqual(
    // A workspace's own template, its slots named by Meta's labels (a starter's are its own).
    inboxTemplateParts(
      { ...booking, name: "book_with_us", body_preview: "Book with {{1}}: {{2}}" },
      { ...facts, businessName: null },
    )
      .map((p) => p.words)
      .join(""),
    "Book with [Business name]: book.example.com/marisas",
    "a fact the settings do not have is named, never invented; a link reads without its scheme",
  );
  assert.deepEqual(
    inboxTemplateParts({ ...note, body_preview: "Hi {{1}}, a quick note." }, facts),
    [{ words: "Hi " }, { words: "Rosa" }, { words: ", a quick note." }, { words: " " }, { blank: "The note" }],
    "a preview read before its slots were: the blank goes after the words, so the box always has somewhere to write",
  );
  assert.deepEqual(inboxTemplateParts({ ...note, body_preview: null }, facts), [{ blank: "The note" }]);
  assert.deepEqual(inboxTemplateParts({ ...booking, body_preview: null }, facts), [], "no words, and nothing to write");
});

test("what fits comes first, and a message for after a visit waits while their visit is ahead", () => {
  const { inboxTemplates } = contracts;
  const howDidItGo = tpl("after_visit_check", { variables: valued("Dani", "Luna Studio") });
  const to = (visit) => ({ who: "Rosa Díaz", offersOk: false, visit });
  const ahead = inboxTemplates([booking, howDidItGo, note], to("ahead"));
  assert.deepEqual(
    ahead.sendable.map((s) => [s.title, s.fits]),
    [
      ["A quick note", true],
      ["Booking link", false],
    ],
    "REGRESSION: 'How did it go' stood first under a price question two days before the visit (I4)",
  );
  assert.equal(ahead.hidden, "Not offered: 1 for afterwards (Rosa Díaz's booking is ahead).");
  assert.deepEqual(
    inboxTemplates([booking, howDidItGo], to("behind")).sendable.map((s) => s.title),
    ["Booking link", "How did it go"],
    "after the visit, it is offered",
  );
  assert.deepEqual(
    inboxTemplates([booking, howDidItGo], to(null)).sendable.map((s) => s.title),
    ["Booking link", "How did it go"],
    "no visit known: nothing is held back on a guess",
  );
});

test("one message is offered once: its default language first, a language said only where two entries would read alike, and no title ends with the language it is in", () => {
  const { inboxTemplates } = contracts;
  const to = { who: "Rosa Díaz", offersOk: false };
  const welcomeEn = tpl("welcome_new", { variables: welcome.variables });
  const welcomeEs = tpl("welcome_new", { language: "es", variables: welcome.variables });
  const twins = inboxTemplates([welcomeEs, booking, welcomeEn], to);
  assert.deepEqual(
    twins.sendable.map((s) => [s.template.language, s.label]),
    [
      ["en_US", "Welcome · English"],
      ["es", "Welcome · Spanish"],
      ["en_US", "Booking link"],
    ],
    "one message's rows stand together with the default language first, however they came; the two that read alike say why",
  );
  const named = inboxTemplates(
    [tpl("welcome_new", { language: "es", title: "Bienvenida (Spanish)", variables: welcome.variables }), welcomeEn],
    to,
  );
  assert.deepEqual(
    named.sendable.map((s) => [s.template.language, s.title, s.label]),
    [
      ["en_US", "Welcome", "Welcome"],
      ["es", "Bienvenida", "Bienvenida"],
    ],
    "REGRESSION: the picker read 'Bienvenida (Spanish) · Spanish'; the row says its language, so the title does not, and nothing reads alike to be told apart",
  );
  assert.deepEqual(
    inboxTemplates([saveEs, booking], to).sendable.map((s) => s.title),
    ["Booking link", "Save our number"],
    "nothing says what language this person reads: a message in the product's own comes before one without",
  );
  assert.equal(
    inboxTemplates([tpl("given", { title: "Hola (Spanish)", variables: booking.variables })], to).sendable[0].title,
    "Hola (Spanish)",
    "a title that names a language the row is not in is the owner's words, and stays",
  );
});

test("the thread knows what the composer needs: whether they said yes to offers, and their number as people read it", async () => {
  const { toConversationDto } = await import("../../../../../apps/dashboard/src/server/dto.ts");
  const row = {
    id: "c1",
    state: "open",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    last_wa_inbound_at: null,
    last_message_at: null,
    contacts: {
      id: "p1",
      display_name: "Rosa Díaz",
      wa_profile_name: null,
      phone_e164: "+19175550106",
      consent: "opted_in",
      dnc: false,
      marketing_consent: "opted_in",
    },
  };
  const dto = toConversationDto(row, [], "u-me");
  assert.equal(
    dto.contact.marketing_consent,
    "opted_in",
    "REGRESSION: the list dropped the yes to offers, so the composer could not know which templates would send",
  );
  const vm = toInboxThreadVM(dto, null, ZONE, NOW);
  assert.deepEqual([vm.offersOk, vm.phoneDisplay], [true, "+1 (917) 555-0106"]);
  assert.equal(toInboxThreadVM(conv(), null, ZONE, NOW).offersOk, false, "no yes on file is not a yes");
});

/* -------------------------------- a browser -------------------------------- */

const timers = { setTimeout, clearTimeout, setInterval, clearInterval };
installLegacyReact({
  location: {
    pathname: "/w/marisas",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: "t1", slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
globalThis.document.visibilityState = "hidden";
after(() => Object.assign(globalThis, timers));
// The shell's own helpers the pages spread and call (gate, the toast, canDo), as the app publishes them.
(await import("../../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
const S = "../../../../../apps/dashboard/src/surfaces";
const { InboxList } = await import(`${S}/inbox/pages/inbox-list.tsx`);
const { Composer: InboxComposer } = await import(`${S}/inbox/thread/composer.tsx`);
const { Menu } = await import(`${S}/kit/menu/menu.tsx`);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
after(() => setSurfaceValue("inbox", undefined));
/** The Inbox's approved templates, as the surface publishes them (what window.__TEMPLATES was): the composer reads them from the seam. */
const setTemplates = (templates, templatesHeld) =>
  setSurfaceValue("inbox", {
    INBOX_BUCKETS: [],
    INBOX_VIEWS: [],
    THREADS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: { doneThisWeek: 0 },
    templates,
    ...(templatesHeld ? { templatesHeld } : {}),
  });

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const find = (tree, pred) => {
  let hit;
  walk(tree, (n) => {
    if (hit === undefined && pred(n)) hit = n;
  });
  return hit;
};
const findAll = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
const hasClass = (cls) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls);
const byTestId = (id) => (n) => n.props?.["data-testid"] === id;
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return n.rendered !== undefined ? textOf(n.rendered) : textOf(n.props?.children);
};
const buttonsOf = (tree) => findAll(tree, (n) => n.type === "button").map((n) => textOf(n).trim());
const composerOf = (thread) => {
  fresh();
  return InboxComposer({ thread, reply: "", onSend() {} });
};

/* --------------------------------- the pages --------------------------------- */

test("the composer names the channel and the number the way the header does", () => {
  setTemplates([booking]);
  const phoneOnly = toInboxThreadVM(
    conv({ last_wa_inbound_at: null, contact: person({ phone_e164: "+19175550106" }), messages: [callNote] }),
    asked({ reason: "callback", details: "Call back" }),
    ZONE,
    NOW,
  );
  assert.equal(
    find(composerOf(phoneOnly), hasClass("ix-composer-channel")),
    undefined,
    "a caller with no WhatsApp thread has the channel and the number in the header, and the reply box said them again",
  );
  const closed = toInboxThreadVM(conv(), asked(), ZONE, NOW);
  assert.equal(
    find(composerOf(closed), hasClass("ix-composer-channel")),
    undefined,
    "a closed window's reply box is the send alone: the header names the wire and the person, and the bar under it the window",
  );
});

test("the template send is the reply box's capsule: the message it will send at its head, its sentence as they will read it with the member's words in its blank, a menu on its name for the others that also says why the rest are not offered, and Send", () => {
  const closed = toInboxThreadVM(conv(), asked(), ZONE, NOW);
  const menuIn = (tree) => find(tree, (n) => n.type === Menu);
  // The message it will send: the menu's own button where there are others, else the name alone.
  const nameOf = (tree) => {
    const menu = menuIn(tree);
    return textOf(menu ? menu.props.trigger : find(tree, hasClass("ix-tpl-name"))).trim();
  };
  // The menu as the composer reads it: a "|" between two groups, a heading in [], the messages of a group in ().
  const shape = (menu) =>
    menu.props.groups.flatMap((g, i) => [
      ...(i ? ["|"] : []),
      ...(g.header ? ["[" + g.header + "]"] : []),
      ...(g.items.length ? ["(" + g.items.map((o) => o.label).join(", ") + ")"] : []),
    ]);
  const sendOf = (tree) => find(tree, hasClass("ix-composer-send"));

  const noteSaid = {
    ...note,
    body_preview: "Hi {{1}}, a quick note from {{2}}: {{3}} Write back here if you have any questions.",
  };
  setTemplates([booking, offer, noteSaid]);
  let tree = composerOf(closed);
  assert.equal(
    find(tree, (n) => n.type === "select"),
    undefined,
    "REGRESSION: a select over the button, and its own row, for one message to send",
  );
  // What fits first: a note answers whatever they asked ("How did it go" stood first under a price question, I4).
  assert.equal(nameOf(tree), "A quick note", "REGRESSION: 'Send booking link', whichever template was picked");
  assert.ok(buttonsOf(tree).includes("Send"), "the reply box's own Send, at the capsule's foot");
  assert.ok(find(tree, hasClass("ix-composer-row")), "the same capsule the reply box is, not a box of its own");
  assert.equal(textOf(find(tree, hasClass("ix-tpl-note"))), "Reopens the chat", "what sending it does");
  // Why the rest are not offered is one tap away, in the menu on its name, never a sentence under the reply box or a link.
  assert.equal(find(tree, byTestId("ix-tpl-hidden")), undefined);
  assert.ok(!buttonsOf(tree).includes("Why?"), "the menu says it: no second control for it");
  assert.deepEqual(
    shape(menuIn(tree)),
    [
      "[Fits now]",
      "(A quick note)",
      "|",
      "[Others]",
      "(Booking link)",
      "|",
      "[Not offered: 1 promotion (Rosa Díaz hasn't said yes to offers).]",
    ],
    "REGRESSION: all seven were offered, and most would be refused",
  );
  const items = menuIn(tree).props.groups.flatMap((g) => g.items);
  assert.equal(
    items[0].meta,
    "Hi Rosa, a quick note from [Business name]: [the note] Write back here if you have any questions.",
    "each with what it says under its name: they were names alone, so a template went out unread",
  );
  assert.deepEqual(
    items.map((o) => o.glyph.props.className),
    ["", "ix-tpl-unpicked"],
    "the chosen one ticked",
  );
  // Its sentence as she will read it, the member's words written in its blank, and Send waits for them.
  const fill = find(tree, byTestId("ix-tpl-fill"));
  const blank = find(fill, byTestId("ix-tpl-blank"));
  assert.equal(blank.props.placeholder, "the note");
  assert.match(textOf(fill), /^Hi Rosa, a quick note from \[Business name\]: .* Write back here/);
  assert.equal(sendOf(tree).props.disabled, true, "nothing to send until the blank has words");
  blank.props.onChange({ target: { value: "  $180 is our lowest,\n see you Tuesday! " } });
  const sent = [];
  tree = again(() =>
    InboxComposer({ thread: closed, reply: "", onSend: (id, what) => void sent.push([id, what.words]) }),
  );
  assert.equal(sendOf(tree).props.disabled, false);
  sendOf(tree).props.onClick();
  assert.deepEqual(
    sent,
    [[closed.id, "$180 is our lowest, see you Tuesday!"]],
    "the words, as WhatsApp takes a value: one line, single spaces",
  );

  setTemplates([booking]);
  tree = composerOf(closed);
  assert.equal(menuIn(tree), undefined, "one message and nothing held back: the send alone");
  assert.equal(find(tree, byTestId("ix-tpl-blank")), undefined, "and a message with no blank asks for no words");

  setTemplates([booking, saveEs]);
  tree = composerOf(closed);
  assert.deepEqual(
    shape(menuIn(tree)),
    ["(Booking link, Save our number)"],
    "REGRESSION: booking_link · en_US; the menu lists messages, not languages",
  );
  assert.equal(nameOf(tree), "Booking link", "REGRESSION: 'Send template', which said nothing of what it sends");
  menuIn(tree).props.groups[0].items[1].onSelect();
  tree = again(() => InboxComposer({ thread: closed, reply: "", onSend() {} }));
  assert.equal(nameOf(tree), "Save our number", "the chosen message is the one the capsule names, and Send sends");

  const twoBlanks = tpl("two_notes", {
    variables: valued("Dani", "Luna Studio", "we're open late.", "and on Sundays."),
  });
  setTemplates([tpl("welcome_new", { category: "marketing", variables: welcome.variables }), twoBlanks]);
  tree = composerOf(closed);
  assert.match(
    textOf(find(tree, hasClass("ix-tpl-none"))),
    /^No approved message can go to Rosa Díaz yet\.\s*Why\?$/,
    "eight words, with the counts behind them",
  );
  find(tree, (n) => n.type === "button" && textOf(n).trim() === "Why?").props.onClick();
  tree = again(() => InboxComposer({ thread: closed, reply: "", onSend() {} }));
  assert.equal(
    textOf(find(tree, byTestId("ix-tpl-hidden"))),
    "Not offered: 1 promotion (Rosa Díaz hasn't said yes to offers) and 1 that needs words the Inbox doesn't ask for.",
  );
  assert.ok(
    !buttonsOf(tree).some((b) => b.startsWith("Send")),
    "REGRESSION: a button whose only outcome was a refusal",
  );

  setTemplates([]);
  assert.match(textOf(composerOf(closed)), /No approved template yet/, "none approved is still its own answer");
  // ...and it says which: the read counted the messages it left out, by why (noTemplateWords).
  setTemplates([], { pending: 2, rejected: 1, paused: 0, disabled: 0, hidden: 0 });
  assert.equal(
    textOf(find(composerOf(closed), hasClass("ix-tpl-none"))),
    "No approved template yet (2 waiting for WhatsApp to review, 1 refused by WhatsApp) — nothing can be sent until one is.",
    "REGRESSION: 'none yet' over a workspace whose messages were all waiting for WhatsApp, refused, or paused",
  );

  // A message WhatsApp approved and would refuse is not offered, and the menu says so.
  const picture = tpl("autumn_picture", { variables: booking.variables, blocked: "a picture for a heading" });
  setTemplates([booking, picture]);
  tree = composerOf(closed);
  assert.deepEqual(
    shape(menuIn(tree)),
    ["[Not offered: 1 that WhatsApp would refuse (a picture for a heading).]"],
    "REGRESSION: the picker offered a message Meta refuses for every send",
  );
  assert.equal(nameOf(tree), "Booking link");
});

test("the search asks for what it searches, and a teammate's email keeps its own letters", () => {
  globalThis.window.__TEAM = [{ userId: "u-b", email: "billing@rjcapital.io", displayName: "" }];
  try {
    const theirs = toInboxThreadVM(conv({ assignee_user_id: "u-b", assignee_is_me: false }), asked(), ZONE, NOW);
    fresh();
    const tree = InboxList({
      threads: [theirs],
      allThreads: [theirs],
      buckets: [{ id: "escalated", label: "Needs you", icon: "flag", count: 0 }],
      views: [],
      activeBucket: "escalated",
      onBucketChange() {},
      activeThreadId: theirs.id,
      onSelectThread() {},
      selected: [],
      onToggleSelect() {},
      onClearSelection() {},
    });
    assert.equal(
      find(tree, (n) => n.props?.["data-testid"] === "inbox-search").props.placeholder,
      "Search by name or message",
      "REGRESSION: 'Search threads, clients, tags…', on a workspace with no tags",
    );
    const pill = find(tree, (n) => n.type === "span" && hasClass("ix-state-pill")(n) && textOf(n).includes("has it"));
    assert.equal(textOf(pill), "billing@rjcapital.io has it");
    assert.ok(
      hasClass("ix-name-pill")(pill),
      "REGRESSION: a pill that capitalises shouted the email: BILLING@RJCAPITAL.IO HAS IT",
    );
  } finally {
    globalThis.window.__TEAM = null;
  }
});

/* ------------------------------- the rule it offers by ------------------------------- */

test("the composer offers templates by contracts' rule, which it imports: there is no door on the window to publish it", () => {
  assert.equal(
    globalThis.window.__inboxTemplates,
    undefined,
    "the rule is the composer's own import (thread/composer.tsx), not a verb the bridge publishes for the page",
  );
  setTemplates([booking, offer]);
  const closed = toInboxThreadVM(conv(), asked(), ZONE, NOW);
  const offered = contracts
    .inboxTemplates([booking, offer], { who: "Rosa Díaz", offersOk: false })
    .sendable.map((s) => s.title);
  assert.deepEqual(offered, ["Booking link"]);
  const tree = composerOf(closed);
  assert.equal(
    // the promotion it cannot send is said in the menu, so the name is that menu's button
    textOf(find(tree, (n) => n.type === Menu).props.trigger).trim(),
    offered[0],
    "REGRESSION: the page had no rule to offer templates by",
  );
  assert.equal(
    find(tree, (n) => n.type === "select"),
    undefined,
    "the one template it can send, and no picker for the promotion it cannot",
  );
});
