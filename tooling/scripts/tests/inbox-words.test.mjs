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
 * Run against the contracts, the server's row mapping, the bridge, and the pages on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, stateOf, memberWords } from "@chanlytics/contracts";

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
    { label: "Business name", example: "Melany's Beauty Salon", position: 1 },
    { label: "Booking link", example: "booksy.com/melanys", position: 2 },
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
      ["booking_link", "Booking link", "Booking link · English"],
      ["save_our_number", "Save our number", "Save our number · Spanish"],
    ],
  );
  assert.equal(
    no.hidden,
    "Not offered: 2 that need words the Inbox doesn't ask for.",
    "an offer and a note have words to write; the Inbox asks for none",
  );
  const yes = inboxTemplates([booking, offer, note, welcome], { who: "Rosa Díaz", offersOk: true });
  assert.deepEqual(
    yes.sendable.map((s) => s.title),
    ["Booking link", "Welcome"],
    "REGRESSION: a starter that opens with their first name was turned away for taking three values",
  );
  assert.equal(yes.hidden, "Not offered: 2 that need words the Inbox doesn't ask for.");
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

test("the thread knows what the composer needs: whether they said yes to offers, and their number as people read it", async () => {
  const { toConversationDto } = await import("../../../apps/dashboard/src/server/dto.ts");
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

globalThis.window = {
  location: {
    pathname: "/w/melanys",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  __WORKSPACES: [{ id: "t1", slug: "melanys", name: "Melany's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
};
globalThis.document = {
  visibilityState: "hidden",
  body: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } }),
};
const quiet = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};

let cells = [];
let seq = 0;
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = fn();
    return cells[k];
  },
  useEffect: (fn) => {
    const k = seq++;
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of [
  "StatePill",
  "MoreMenu",
  "EmptyState",
  "PolicyChip",
  "TlMedia",
  "FailedRead",
  "Confirm",
  "usePPToast",
  "useHotkey",
])
  globalThis[k] = globalThis.window[k];
await import("../../../apps/dashboard/src/legacy/pages/inbox-list.jsx");
globalThis.ConfidenceDots = globalThis.window.ConfidenceDots;
await import("../../../apps/dashboard/src/legacy/pages/inbox-thread.jsx");
const { InboxList, InboxComposer } = globalThis.window;

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
  cells = [];
  seq = 0;
  return InboxComposer({ thread, reply: "", onSend() {} });
};

/* --------------------------------- the pages --------------------------------- */

test("the composer names the channel and the number the way the header does", () => {
  globalThis.window.__TEMPLATES = [booking];
  globalThis.window.__inboxTemplates = contracts.inboxTemplates;
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

test("the template send offers what can go to this person, by title and language, says why the rest are not offered, and names what it sends", () => {
  globalThis.window.__inboxTemplates = contracts.inboxTemplates;
  const closed = toInboxThreadVM(conv(), asked(), ZONE, NOW);

  globalThis.window.__TEMPLATES = [booking, offer, note];
  let tree = composerOf(closed);
  assert.equal(
    find(tree, (n) => n.type === "select"),
    undefined,
    "one template this person can be sent: no picker",
  );
  assert.ok(
    buttonsOf(tree).includes("Send “Booking link”"),
    "REGRESSION: 'Send booking link', whichever template was picked",
  );
  // Why the rest are not offered is one tap away, never a sentence sitting under the reply box.
  assert.equal(find(tree, byTestId("ix-tpl-hidden")), undefined, "not until it is asked for");
  find(tree, (n) => n.type === "button" && textOf(n).trim() === "Why?").props.onClick();
  seq = 0;
  tree = InboxComposer({ thread: closed, reply: "", onSend() {} });
  assert.equal(
    textOf(find(tree, byTestId("ix-tpl-hidden"))),
    "Not offered: 2 that need words the Inbox doesn't ask for.",
    "REGRESSION: all seven were offered, and most would be refused",
  );

  globalThis.window.__TEMPLATES = [booking, saveEs];
  tree = composerOf(closed);
  const pick = find(tree, (n) => n.type === "select");
  assert.deepEqual(
    findAll(pick, (n) => n.type === "option").map(textOf),
    ["Booking link · English", "Save our number · Spanish"],
    "REGRESSION: booking_link · en_US",
  );
  assert.ok(buttonsOf(tree).includes("Send template"));

  globalThis.window.__TEMPLATES = [tpl("welcome_new", { category: "marketing", variables: welcome.variables }), note];
  tree = composerOf(closed);
  assert.match(
    textOf(find(tree, hasClass("ix-tpl-none"))),
    /^No approved message can go to Rosa Díaz yet\.\s*Why\?$/,
    "eight words, with the counts behind them",
  );
  find(tree, (n) => n.type === "button" && textOf(n).trim() === "Why?").props.onClick();
  seq = 0;
  tree = InboxComposer({ thread: closed, reply: "", onSend() {} });
  assert.equal(
    textOf(find(tree, byTestId("ix-tpl-hidden"))),
    "Not offered: 1 promotion (Rosa Díaz hasn't said yes to offers) and 1 that needs words the Inbox doesn't ask for.",
  );
  assert.ok(
    !buttonsOf(tree).some((b) => b.startsWith("Send")),
    "REGRESSION: a button whose only outcome was a refusal",
  );

  globalThis.window.__TEMPLATES = [];
  assert.match(textOf(composerOf(closed)), /No approved template yet/, "none approved is still its own answer");
});

test("the search asks for what it searches, and a teammate's email keeps its own letters", () => {
  globalThis.window.__TEAM = [{ userId: "u-b", email: "billing@rjcapital.io", displayName: "" }];
  try {
    const theirs = toInboxThreadVM(conv({ assignee_user_id: "u-b", assignee_is_me: false }), asked(), ZONE, NOW);
    cells = [];
    seq = 0;
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
      find(tree, (n) => n.type === "input" && n.props?.className === "ix-search-input").props.placeholder,
      "Search by name or message…",
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

/* --------------------------------- the bridge --------------------------------- */

test("the bridge publishes the rule the composer offers templates by", async () => {
  const { installInboxVerbs } = await quiet(() => import("../../../apps/dashboard/src/legacy-bridge/inbox-verbs.ts"));
  delete globalThis.window.__inboxTemplates;
  installInboxVerbs();
  assert.equal(
    typeof globalThis.window.__inboxTemplates,
    "function",
    "REGRESSION: the page had no rule to offer templates by",
  );
  assert.deepEqual(
    globalThis.window
      .__inboxTemplates([booking, offer], { who: "Rosa Díaz", offersOk: false })
      .sendable.map((s) => s.title),
    ["Booking link"],
  );
});
