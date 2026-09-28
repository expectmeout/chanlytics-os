// The page an eval case is asked on (tooling/scripts/eval-ask-context.mjs; the Phase 2 plan, PR 2.3): built from what
// the page's GETs answer, the way the palette builds it, and held to the schema the route reads it with; the judge's
// excuse for a case the page answers, and what a case's page asks of the answer; the case set's pages, each built
// over fixture answers and placed on its surface as the palette places its route; and the runner's listing, run with
// no credentials, which says every case, the turns and their cost and spends nothing. A case's second turn (the Phase
// 5 plan, PR 5.2): its page and its scope, what turn 1 asks of it (names_card, opens_item, drops_first_scope and the
// claims no answer may make), a settings note approved between the turns and put back over a fake settings door, the
// cost read turn by turn and past PostgREST's thousand rows, and the ten cases that carry one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PageContextSchema,
  TenantConfigWriteSchema,
  applySettingsChange,
  parseTenantConfig,
} from "@chanlytics/contracts";
import { workspaceConfig } from "../../ops/e2e-workspace.mjs";
import {
  ROW_KINDS,
  announcement,
  approveBetween,
  approveThenAsk,
  claimsWrite,
  contextFails,
  contextProblems,
  describeSecondTurn,
  dropsFirstScope,
  followUpFails,
  fromContext,
  jsonLines,
  namesCard,
  neededGets,
  notAsked,
  opensItem,
  ordinal,
  pageProblems,
  parseRows,
  putBack,
  resolveContext,
  secondScope,
  secondTurn,
  turnShapes,
  usageRows,
} from "../../eval-ask-context.mjs";

const { surfaceFor } = await import("../../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const U = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const hoursAgo = (h) => new Date(Date.UTC(2026, 8, 26, 12) - h * 3_600_000).toISOString();

/** The GETs' answers (their `data`), as the eval workspace would give them: made-up people, 555-01xx numbers. */
const ANSWERS = {
  conversations: {
    conversations: [
      {
        id: U(1),
        last_message_at: hoursAgo(2),
        contact: { id: U(11), display_name: "Robin Example", wa_profile_name: "Robin", phone_e164: "+12125550143" },
        messages: [],
      },
      {
        id: U(2),
        last_message_at: hoursAgo(30),
        contact: { id: U(13), display_name: null, wa_profile_name: null, phone_e164: "+12125550145" },
        messages: [],
      },
    ],
  },
  calls: {
    calls: [
      {
        id: U(3),
        started_at: hoursAgo(26),
        contact: { display_name: "Casey Example", wa_profile_name: null, phone_e164: "+12125550144" },
      },
    ],
  },
  contacts: {
    people: [
      { id: U(11), display_name: "Robin Example", wa_profile_name: "Robin", phone_e164: "+12125550143" },
      { id: U(12), display_name: "Casey Example", wa_profile_name: null, phone_e164: "+12125550144" },
      { id: U(13), display_name: "Sam Example", wa_profile_name: null, phone_e164: "+12125550145" },
    ],
    page: { q: null, offset: 0, limit: 1000, total: 3, has_more: false },
  },
  leads: {
    rows: [
      { id: U(21), business_name: "Example Strength Lab" },
      { id: U(22), business_name: "Example Coaching Co." },
    ],
    next: null,
  },
  "lead-searches": { searches: [{ id: U(31), name: "Pilates studios · Denver" }], counts: {} },
  playbooks: { playbooks: [], deals_on: false },
  broadcasts: { broadcasts: [], more: false, touched: null },
  templates: { templates: [] },
};

const accepted = (context) => {
  const read = PageContextSchema.safeParse(context);
  assert.ok(read.success, `a context the route takes: ${JSON.stringify(read.error?.issues ?? [])}`);
};

test("a page's rows are the first n of its GET, each the kind its surface's provider sends, and the schema takes them", () => {
  const inbox = resolveContext({ surface: "inbox", route: "inbox", rows: "GET conversations:1" }, ANSWERS, 1234);
  accepted(inbox.context);
  assert.deepEqual(inbox.context, {
    v: 1,
    surface: "inbox",
    route: "inbox",
    view: null,
    focus: null,
    rows: [{ kind: "thread", id: U(1) }],
    askedAt: 1234,
  });
  assert.equal(inbox.scope, null, "a list opens no row");
  const people = resolveContext({ surface: "people", route: "clients", view: "all", rows: "GET contacts" }, ANSWERS);
  accepted(people.context);
  assert.deepEqual(
    people.context.rows,
    [U(11), U(12), U(13)].map((id) => ({ kind: "person", id })),
    "every row, in the GET's order, when no n is said",
  );
  assert.equal(people.context.view, "all");
  const leads = resolveContext({ surface: "leads", route: "clients/leads", rows: "GET leads:5" }, ANSWERS);
  assert.deepEqual(
    leads.context.rows.map((r) => r.kind),
    ["lead", "lead"],
  );
  // Conversations merges its threads and its calls newest first, as the page does (surface-data.ts).
  const conv = resolveContext(
    { surface: "conversations", route: "conversations", rows: "GET conversations+calls:40" },
    ANSWERS,
  );
  accepted(conv.context);
  assert.deepEqual(conv.context.rows, [
    { kind: "conversation", id: U(1) },
    { kind: "call", id: U(3) },
    { kind: "conversation", id: U(2) },
  ]);
  // An empty page is an empty list, never a failure: the eval workspace has no playbook.
  const camp = resolveContext(
    { surface: "campaigns", route: "outbound", view: "playbooks", rows: "GET playbooks:40" },
    ANSWERS,
  );
  accepted(camp.context);
  assert.deepEqual(camp.context.rows, []);
  // Forty at most, whatever n says.
  const many = { contacts: { people: Array.from({ length: 60 }, (_, i) => ({ id: U(100 + i), display_name: "X" })) } };
  assert.equal(
    resolveContext({ surface: "people", route: "clients", rows: "GET contacts" }, many).context.rows.length,
    40,
  );
  assert.equal(
    resolveContext({ surface: "people", route: "clients", rows: "GET contacts:99" }, many).context.rows.length,
    40,
  );
  assert.throws(
    () => resolveContext({ surface: "people", route: "clients", rows: "GET contacts" }, {}),
    /GET contacts was not read/,
  );
});

test("the focus is the row at the place the words name; a route that opens a row is the scope, and the focus when none is named", () => {
  const second = resolveContext({ surface: "people", route: "clients", rows: "GET contacts", focus: "2" }, ANSWERS);
  accepted(second.context);
  assert.deepEqual(second.context.focus, { kind: "person", id: U(12), label: "Casey Example" });
  assert.equal(second.scope, null);
  assert.equal(
    resolveContext({ surface: "inbox", route: "inbox", rows: "GET conversations:1", focus: "second" }, ANSWERS).context
      .focus,
    null,
    "a place past the rows drawn names none",
  );
  const opened = resolveContext({ surface: "people", route: "clients/<row:1>", rows: "GET contacts" }, ANSWERS);
  accepted(opened.context);
  assert.equal(opened.context.route, `clients/${U(11)}`);
  assert.deepEqual(opened.scope, { kind: "person", id: U(11), label: "Robin Example" });
  assert.deepEqual(opened.context.focus, opened.scope);
  const thread = resolveContext({ surface: "inbox", route: "inbox/th-<row:1>", rows: "GET conversations" }, ANSWERS);
  assert.deepEqual(thread.scope, { kind: "thread", id: U(1), label: "Robin Example" });
  // A row of another workspace: a literal id the tab claims, labelled as the palette labels a row it cannot name.
  const foreign = U(999);
  const f = resolveContext(
    { surface: "people", route: `clients/${foreign}`, rows: [{ kind: "person", id: foreign }] },
    ANSWERS,
  );
  accepted(f.context);
  assert.deepEqual(f.context.rows, [{ kind: "person", id: foreign }]);
  assert.deepEqual(f.scope, { kind: "person", id: foreign, label: "this person" });
  assert.throws(
    () => resolveContext({ surface: "people", route: "clients/<row:4>", rows: "GET contacts" }, ANSWERS),
    /opens row 4, and the page drew 3/,
  );
  // A route opens its row as the kind the page drew it, or the page cannot be built: on Conversations here the first
  // row is a conversation and the second a call, and `cv-` opens a call.
  const merged = { surface: "conversations", rows: "GET conversations+calls:40" };
  assert.equal(resolveContext({ ...merged, route: "conversations/cv-<row:2>" }, ANSWERS).scope.kind, "call");
  assert.equal(resolveContext({ ...merged, route: "conversations/<row:1>" }, ANSWERS).scope.kind, "conversation");
  assert.throws(
    () => resolveContext({ ...merged, route: "conversations/cv-<row:1>" }, ANSWERS),
    new RegExp(`conversations/cv-${U(1)} opens a call, and the row there is a conversation`),
  );
  assert.throws(
    () => resolveContext({ ...merged, route: "conversations/<row:2>" }, ANSWERS),
    /opens a conversation, and the row there is a call/,
  );
});

test("a context the eval cannot build is said in words before anything is read", () => {
  assert.deepEqual(parseRows("GET conversations+calls:5"), { keys: ["conversations", "calls"], n: 5 });
  assert.equal(parseRows("conversations"), null);
  assert.equal(ordinal("#3"), 3);
  assert.equal(ordinal("third"), 3);
  assert.equal(ordinal("the third"), null);
  assert.deepEqual(contextProblems({ surface: "inbox", route: "inbox", rows: "GET conversations:3" }), []);
  const said = (spec) => contextProblems(spec).join("; ");
  assert.match(said({ surface: "moon", route: "x" }), /no surface "moon"/);
  assert.match(said({ surface: "inbox", route: "inbox", rows: "GET contacts" }), /the inbox page draws no rows/);
  assert.match(said({ surface: "inbox", route: "inbox", rows: "GET gossip" }), /no GET gossip/);
  assert.match(said({ surface: "inbox", route: "inbox", rows: "conversations" }), /is not "GET <key>/);
  assert.match(said({ surface: "inbox", route: "inbox", focus: "2" }), /needs rows to count/);
  assert.match(said({ surface: "inbox", route: "inbox", rows: "GET conversations", focus: "the one" }), /neither/);
  assert.match(said({ surface: "inbox", route: "inbox", scope: "1" }), /a field the context does not know: scope/);
  assert.match(said({ surface: "people", route: "clients/<row:1>" }), /no rows to open/);
  assert.deepEqual(pageProblems([{ id: "x", surface: "today", context: { surface: "inbox", route: "inbox" } }]), [
    "x: asked on today, its page is inbox",
  ]);
  assert.throws(() => resolveContext({ surface: "inbox" }, ANSWERS), /cannot build/);
});

test("the judge excuses a missing read only when the page answered: an on-page case's rows, or its page", () => {
  const onPage = {
    expect: { on_page: true, tools_any: ["people.search"] },
    context: { surface: "people", route: "clients", rows: "GET contacts" },
  };
  const rode = { rows: [{ kind: "person", id: U(11) }] };
  assert.equal(fromContext(onPage, { tools: [] }, rode), true, "its rows rode");
  assert.equal(fromContext(onPage, { tools: [] }, { rows: [] }), false, "the GET drew nothing: no rows rode");
  assert.equal(fromContext(onPage, { tools: [] }, null), false, "no page was sent");
  assert.equal(
    fromContext({ ...onPage, expect: { tools_any: ["people.search"] } }, { tools: [] }, rode),
    false,
    "a case not marked on the page must read",
  );
  const aggregate = {
    expect: { on_page: true, tools_any: ["report"] },
    context: { surface: "reports", route: "reports" },
  };
  assert.equal(fromContext(aggregate, { tools: [] }, { rows: [] }), true, "a page of no rows rides as itself");
  assert.equal(
    fromContext({ expect: { tools_any: ["today"] } }, { tools: [] }, null),
    false,
    "the snapshot went in PR 2.4: a case with no page must read",
  );
});

test("a case's page asks of the answer: never the foreign row, and the row the words pointed at by name", () => {
  const foreign = U(999);
  const c = { expect: { never_cites: [foreign] } };
  assert.deepEqual(contextFails(c, { text: "I can't find them.", citations: [] }, null), []);
  for (const m of [
    { text: "", citations: [{ kind: "person", id: foreign, label: "x" }] },
    { text: "", citations: [], navigate: { to: `clients/${foreign}`, now: true } },
    { text: "", citations: [], answer: { show: { items: [{ source: { to: `clients/${foreign}` } }] }, do: {} } },
  ])
    assert.equal(contextFails(c, m, null).length, 1, JSON.stringify(m));
  const named = { expect: { names_focus: true } };
  const sent = { focus: { kind: "person", id: U(12), label: "Casey Example" }, rows: [] };
  assert.deepEqual(contextFails(named, { text: "Casey called about the hours." }, sent), []);
  assert.match(contextFails(named, { text: "Robin wrote." }, sent)[0], /does not name Casey Example/);
  assert.match(contextFails(named, { text: "Nobody." }, { focus: null, rows: [] })[0], /drew none there/);
});

/* ---- a case's second turn (the Phase 5 plan, PR 5.2) ---- */

const PEOPLE_PAGE = { surface: "people", route: "clients", rows: "GET contacts:40" };
const TWO_TURNS = {
  id: "x",
  surface: "people",
  must_never: true,
  text: "list the people on this page in alphabetical order",
  context: PEOPLE_PAGE,
  expect: { no_write: true },
  then: { text: "open the second", expect: { no_write: true } },
};
const T1 = U(71);
/** An item of an answer, as the Line draws it: a row, grounded, with the route its reader gave it. */
const item = (id, label, to = `clients/${id}`) => ({
  title: label,
  meta: "",
  line: "",
  source: { kind: "person", id, label, to, door: true },
});
/** A final message as the route streams it, with the answer's items and the turn's cards. */
const final = ({ text = "Here they are.", items = [], proposals = [], navigate = null } = {}) => ({
  id: U(81),
  text,
  citations: items.map((i) => ({ kind: i.source.kind, id: i.source.id, label: i.source.label, to: i.source.to })),
  navigate,
  proposals,
  answer: {
    v: 2,
    form: "structured",
    say: { headline: text, detail: "" },
    show: { figures: [], items, breakdown: null },
    do: { open: navigate ? { to: navigate.to, label: navigate.label ?? "", now: !!navigate.now } : null, next: [] },
    language: "en",
  },
});

test("a second turn is asked in the first's thread: its page the case's, its own or none, its surface its page's, and its page warmed again only when it differs", () => {
  assert.equal(secondTurn({ id: "y", text: "a", expect: {} }), null, "a case of one turn");
  assert.deepEqual(secondTurn(TWO_TURNS), {
    id: "x",
    text: "open the second",
    expect: { no_write: true },
    context: PEOPLE_PAGE,
    surface: "people",
    must_never: true,
    warm: false,
    between: null,
  });
  assert.equal(secondTurn({ ...TWO_TURNS, then: { ...TWO_TURNS.then, between: "approve" } }).between, "approve");
  const focus = { ...PEOPLE_PAGE, focus: "2" };
  const own = secondTurn({ ...TWO_TURNS, then: { ...TWO_TURNS.then, context: focus } });
  assert.deepEqual(
    [own.context, own.surface, own.warm],
    [focus, "people", false],
    "a focus the words name warms nothing: the palette warms as its route changes (ask-real.jsx)",
  );
  const moved = { ...PEOPLE_PAGE, route: "clients/<row:2>" };
  assert.equal(
    secondTurn({ ...TWO_TURNS, then: { ...TWO_TURNS.then, context: moved } }).warm,
    true,
    "another route is another page, warmed again",
  );
  assert.equal(
    secondTurn({ ...TWO_TURNS, then: { ...TWO_TURNS.then, context: { ...PEOPLE_PAGE, view: "all" } } }).warm,
    true,
    "and so is another view",
  );
  assert.equal(
    secondTurn({ ...TWO_TURNS, then: { ...TWO_TURNS.then, context: { ...PEOPLE_PAGE } } }).warm,
    false,
    "a page of its own that is turn 1's is not warmed again",
  );
  const none = secondTurn({ ...TWO_TURNS, then: { ...TWO_TURNS.then, context: null } });
  assert.deepEqual([none.context, none.surface, none.warm], [null, "people", false], "no page: asked where turn 1 was");
  assert.equal(
    secondTurn({ ...TWO_TURNS, then: { ...TWO_TURNS.then, context: null, surface: "today" } }).surface,
    "today",
  );
  assert.equal(
    secondTurn({ ...TWO_TURNS, then: { ...TWO_TURNS.then, context: { surface: "inbox", route: "inbox" } } }).surface,
    "inbox",
    "a page of its own says where it is asked",
  );
});

test("turn 2 is sent the row its page opens, else turn 1's scope, and the key is always sent", () => {
  const robin = { kind: "person", id: U(11), label: "Robin Example" };
  const opened = resolveContext({ surface: "people", route: "clients/<row:2>", rows: "GET contacts" }, ANSWERS);
  assert.deepEqual(secondScope(opened, robin), { kind: "person", id: U(12), label: "Casey Example" });
  const list = resolveContext({ ...PEOPLE_PAGE, focus: "2" }, ANSWERS);
  assert.deepEqual(secondScope(list, robin), robin, "a list opens no row: turn 1's scope");
  assert.deepEqual(secondScope(null, robin), robin, "no page: turn 1's scope");
  assert.equal(secondScope(list, null), null, "neither: null, and sent as null");
});

test("a second turn the runner cannot ask is said before anything is read, and its page's GETs are read with the rest", () => {
  const said = (then) => pageProblems([{ ...TWO_TURNS, then }]).join("; ");
  assert.deepEqual(pageProblems([TWO_TURNS]), []);
  assert.match(said({ text: "b", expect: {}, scope: "1" }), /^x: a field the second turn does not know: then\.scope$/);
  assert.match(said({ expect: {} }), /x: a second turn says its words \(then\.text\)/);
  assert.match(said({ text: " ", expect: {} }), /says its words/);
  assert.match(said({ text: "b" }), /x: a second turn says what it expects \(then\.expect\)/);
  assert.match(said("b"), /^x: a second turn \(then\) is an object$/);
  assert.match(said({ text: "b", expect: {}, surface: "moon" }), /then: no surface "moon"/);
  assert.match(
    said({ text: "b", expect: {}, context: { surface: "people", route: "clients", focus: "2" } }),
    /x: then\.context: a focus by its place needs rows to count/,
  );
  assert.match(
    said({ text: "b", expect: {}, surface: "today" }),
    /x: its second turn is asked on today, its page is people/,
  );
  assert.equal(said({ text: "b", expect: {}, context: null, surface: "today" }), "", "no page: asked where it says");
  // Approving between the turns is for a settings card alone, and turn 1 says it makes one (the add_note itself is
  // known only once the card is made: approveBetween refuses any other change).
  const settings = { ...TWO_TURNS, expect: { proposals_any: ["settings"], no_write: true } };
  const approving = (c, between = "approve") => pageProblems([{ ...c, then: { ...c.then, between } }]).join("; ");
  assert.equal(approving(settings), "");
  assert.match(
    approving(TWO_TURNS),
    /^x: between: "approve" approves a settings card whose change is add_note, and turn 1 expects \[\]$/,
  );
  assert.match(
    approving({ ...settings, expect: { proposals_any: ["settings", "reply"] } }),
    /and turn 1 expects \["settings","reply"\]/,
  );
  assert.match(approving(settings, "dismiss"), /^x: nothing the eval does between turns is called "dismiss"$/);
  assert.deepEqual(
    neededGets([
      {
        id: "x",
        then: { text: "b", expect: {}, context: { surface: "leads", route: "clients/leads", rows: "GET leads" } },
      },
    ]),
    ["leads"],
  );
  assert.deepEqual(neededGets([TWO_TURNS]).sort(), ["contacts"], "an inherited page is read once");
});

test("turn 2 is not asked when turn 1 left it nothing to ask in, and a turn 2 answered in a new thread fails", () => {
  const m = final();
  assert.equal(notAsked({ expect: {} }, { final: null, threadId: null }), "turn 1 has no answer");
  assert.equal(notAsked({ expect: {} }, { final: m, threadId: null }), "turn 1 named no thread");
  assert.equal(notAsked({ expect: {} }, { final: { ...m, failed: true }, threadId: T1 }), "turn 1 failed");
  assert.equal(notAsked({ expect: {} }, { final: m, threadId: T1 }), null);
  assert.equal(notAsked({ expect: { names_card: true } }, { final: m, threadId: T1 }), "turn 1 made no card to name");
  assert.equal(
    notAsked({ expect: {}, between: "approve" }, { final: m, threadId: T1 }),
    "turn 1 made no card to approve",
  );
  const one = final({ items: [item(U(12), "Casey Example")] });
  assert.equal(
    notAsked({ expect: { opens_item: 2 } }, { final: one, threadId: T1 }),
    "turn 1's answer shows 1 item(s), and turn 2 opens item 2",
  );
  assert.equal(notAsked({ expect: { opens_item: 1 } }, { final: one, threadId: T1 }), null);
  assert.deepEqual(followUpFails({}, { threadId: T1 }, { threadId: T1 }), []);
  assert.deepEqual(followUpFails({}, { threadId: U(72) }, { threadId: T1 }), [
    `answered in a new thread: ${U(72)}, where turn 1's was ${T1}`,
  ]);
});

test("an answer that says it did something is a claim: sent, changed, approved, in English and Spanish, with or without I've", () => {
  for (const said of [
    "I sent it.",
    "I have updated the hours.",
    "I've approved the note.",
    "I’ve sent the reply to Robin.",
    "I approved it for you.",
    "He aprobado la tarjeta.",
    "Aprobé la nota.",
    "He enviado la respuesta.",
    "Done, it's saved.",
  ])
    assert.equal(claimsWrite(said), true, said);
  for (const said of [
    "The “Remember this” card is above: approve it there.",
    "Once you've approved it, the receptionist will say so.",
    "It isn't approved yet.",
    "Apruébala arriba; nada pasa hasta entonces.",
    "The card is waiting for your approval.",
  ])
    assert.equal(claimsWrite(said), false, said);
  // A draft or a message the answer quotes is someone else's words, never a claim of the answer's own; the same words
  // unquoted are, as the headline's one-sentence check reads only the headline's own.
  for (const said of [
    'Here is the reply, ready to approve: "Hi Robin, I\'ve sent the link again."',
    "The card says “Done, see you Friday.” once you send it.",
    "Robin wrote «I sent it yesterday» and is waiting.",
  ])
    assert.equal(claimsWrite(said), false, said);
  assert.equal(claimsWrite("Hi Robin, I've sent the link again."), true);
  assert.equal(claimsWrite('"Hi Robin." I\'ve sent the link again.'), true, "a claim beside a quote is a claim");
});

const CARD = {
  id: "p-1",
  kind: "settings",
  needs: "partner",
  title: "Remember this",
  summary: "Note for the receptionist: “Parking”",
  payload: { change: { op: "add_note", title: "Parking", text: "Parking is behind the building." } },
  undo: "Put the previous settings back",
};

test("names_card: approve that one points at turn 1's card by its title, makes no second card of its kind, and claims nothing", () => {
  const t1 = { final: final({ text: "One card to review: Remember this.", proposals: [CARD] }), threadId: T1 };
  assert.deepEqual(namesCard(final({ text: "The “Remember this” card above is one press away." }), t1), []);
  assert.deepEqual(namesCard(final({ text: "Approve the remember this card above." }), t1), [], "any case, any quotes");
  assert.match(
    namesCard(final({ text: "Sure, approve it above." }), t1)[0],
    /names none of turn 1's cards by its title: “Remember this”/,
  );
  assert.match(
    namesCard(final({ text: "Here is Remember this again.", proposals: [{ ...CARD, id: "p-2" }] }), t1)[0],
    /a second settings card, where turn 1's is one press above/,
  );
  assert.match(namesCard(final({ text: "I've approved Remember this for you." }), t1)[0], /claims the card was done/);
  assert.deepEqual(namesCard(final({ text: "Remember this" }), { final: final(), threadId: T1 }), [
    "turn 1 made no card to name",
  ]);
});

test("opens_item: open the second goes to turn 1's answer's second item, not the page's second row", () => {
  const casey = item(U(12), "Casey Example");
  const robin = item(U(11), "Robin Example");
  // Turn 1 put the page in another order: Casey, Robin, Sam. The page's second row is Casey.
  const t1 = { final: final({ items: [casey, robin, item(U(13), "Sam Example")] }), threadId: T1 };
  const sent = { rows: [U(11), U(12), U(13)].map((id) => ({ kind: "person", id })), focus: casey.source };
  const going = (to, now = true) => final({ navigate: { to, label: "Open the profile", now } });
  assert.deepEqual(opensItem(going(`clients/${U(11)}`), t1, 2, sent), []);
  assert.deepEqual(opensItem(going(`clients/${U(12)}`), t1, 2, sent), [
    `opened clients/${U(12)}, the page's focus (Casey Example), where turn 1's item 2 (Robin Example) opens at clients/${U(11)}`,
  ]);
  assert.match(
    opensItem(going(`clients/${U(11)}`, false), t1, 2, sent)[0],
    /item 2 \(Robin Example\) was offered, not opened/,
  );
  assert.match(
    opensItem(final(), t1, 2, sent)[0],
    /expected the app to open turn 1's item 2 \(Robin Example, clients\//,
  );
  // The answer's Open is the door too, as navigate_now reads it on a message that carries only the answer.
  const open = final();
  open.answer.do.open = { to: `clients/${U(11)}`, label: "Open", now: true };
  assert.deepEqual(opensItem(open, t1, 2, sent), []);
  // An item stored without its route opens where its reader's kind opens (citationRoute).
  const bare = { ...robin, source: { ...robin.source, to: "" } };
  assert.deepEqual(
    opensItem(going(`clients/${U(11)}`), { final: final({ items: [casey, bare] }), threadId: T1 }, 2),
    [],
  );
});

test("drops_first_scope: a turn asked on another row names turn 1's row nowhere, in its words or its citations", () => {
  const robin = { kind: "person", id: U(11), label: "Robin Example" };
  assert.deepEqual(dropsFirstScope(final({ text: "Casey called yesterday about the hours." }), robin), []);
  assert.deepEqual(dropsFirstScope(final({ text: "Casey called.", items: [item(U(11), "Robin Example")] }), robin), [
    "the answer still names turn 1's person, Robin Example",
  ]);
  assert.deepEqual(dropsFirstScope(final({ text: "Unlike Robin, Casey called." }), robin), [
    "the answer still says Robin, turn 1's person",
  ]);
  const sam = { kind: "person", id: U(13), label: "Sam Example" };
  assert.deepEqual(dropsFirstScope(final({ text: "The same as before: Casey called." }), sam), [], "a whole word only");
  assert.deepEqual(dropsFirstScope(final({ text: "This person called." }), { ...robin, label: "this person" }), []);
  assert.deepEqual(dropsFirstScope(final(), null), ["turn 1 was asked with no scope for turn 2 to drop"]);
});

test("turn 2's own checks run from its expect, and a check of a second turn on a first is said before anything is read", () => {
  const robin = { kind: "person", id: U(11), label: "Robin Example" };
  const t1 = { final: final({ proposals: [CARD] }), threadId: T1, scope: robin };
  const r = { threadId: T1, final: final({ text: "Robin wrote; approve Remember this above." }) };
  assert.deepEqual(followUpFails({}, r, t1), [], "no second-turn check asked for, none run");
  assert.deepEqual(followUpFails({ names_card: true }, r, t1), []);
  assert.deepEqual(followUpFails({ drops_first_scope: true }, r, t1), ["the answer still says Robin, turn 1's person"]);
  assert.match(followUpFails({ opens_item: 1 }, r, t1)[0], /turn 1's answer shows no item 1 to open/);
  const said = (c) => pageProblems([{ id: "x", surface: "today", text: "a", ...c }]).join("; ");
  assert.equal(
    said({ expect: { names_card: true, opens_item: 2 } }),
    "x: names_card judges a second turn: it belongs in then.expect; x: opens_item judges a second turn: it belongs in then.expect",
  );
  assert.match(
    said({ expect: {}, then: { text: "b", expect: { opens_item: 0 } } }),
    /then\.expect\.opens_item is an item's place, 1 to 5/,
  );
  assert.match(said({ expect: {}, then: { text: "b", expect: { opens_item: "2" } } }), /an item's place, 1 to 5/);
  assert.equal(said({ expect: {}, then: { text: "b", expect: { opens_item: 5, names_card: true } } }), "");
});

/* ---- a card approved between the turns, and put back ---- */

/** The nightly's workspace config as GET settings answers it (e2e-workspace.mjs): no profile, so no hours or notes. */
const SEED = parseTenantConfig(workspaceConfig());
const NOTE = { title: "Parking", text: "Parking is behind the building." };
/** The same with turn 1's note in it, as the settings door stores it and GET settings answers it. */
const NOTED = parseTenantConfig(TenantConfigWriteSchema.parse(applySettingsChange(SEED, { op: "add_note", ...NOTE })));
const ORIGIN = "https://app.example.com";
const OUTCOME = `POST /api/v1/ask/messages/${U(81)}/proposals/p-1`;

/** A teammate's save, as the settings door takes one: their phone line in the config, one version on. */
const teammate = (state) => {
  state.stored = TenantConfigWriteSchema.parse({
    ...state.config,
    brain: { ...state.config.brain, phone_display: "(212) 555-0199" },
  });
  state.version += 1;
};

/**
 * The settings door and a card's outcome door, as their routes answer them. GET settings reads the stored config back
 * through the read schema; PUT settings takes `{ config, version }` -- a 409 on a stale version before anything is
 * written (putTenantConfig matches on the version), a 400 when the write schema refuses -- and stores what the write
 * schema keeps, one version on; POST records an outcome. The rest is what the test makes happen: `hold` answers a
 * door's next request with a refusal and writes nothing; `stall` leaves it unanswered until its signal gives up;
 * `beforePut` lands a save of someone else's just before the next PUT is judged; `afterWrite` answers the next saves,
 * once they have stored, with a refusal or no answer at all (status 0), after `then` lands anything else; `mangle`
 * changes what a save stores.
 */
function doors({ version = 7, hold = {}, stall = {}, beforePut = [], afterWrite = [], mangle = (c) => c } = {}) {
  const state = {
    stored: structuredClone(workspaceConfig()),
    version,
    hold,
    stall,
    calls: [],
    outcomes: [],
    /** The settings as GET settings answers them now. */
    get config() {
      return parseTenantConfig(this.stored);
    },
  };
  const answer = (status, data) =>
    new Response(JSON.stringify(status < 400 ? { data } : { error: { code: "refused", message: data } }), { status });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    const key = `${method} ${u.pathname}`;
    state.calls.push({ key, workspace: u.searchParams.get("workspace"), headers: init.headers ?? {}, body });
    // A door that hangs holds its socket open, and so the run, until the request's own signal gives up on it.
    if (state.stall[key]?.shift())
      return new Promise((_, fail) => {
        const open = setInterval(() => {}, 1_000);
        init.signal.addEventListener("abort", () => {
          clearInterval(open);
          fail(init.signal.reason);
        });
      });
    const held = state.hold[key]?.shift();
    if (held) return answer(held.status, held.message);
    if (key === "GET /api/v1/settings")
      return answer(200, { config: state.config, version: state.version, configBroken: false });
    if (key === "PUT /api/v1/settings") {
      beforePut.shift()?.(state);
      if (body.version !== state.version) return answer(409, "Someone else saved settings after you loaded them.");
      const w = TenantConfigWriteSchema.safeParse(body.config);
      if (!w.success) return answer(400, "Config rejected");
      state.stored = mangle(w.data);
      state.version += 1;
      const after = afterWrite.shift();
      after?.then?.(state);
      if (after?.status === 0) throw new TypeError("fetch failed");
      if (after?.status) return answer(after.status, after.message);
      return answer(200, { config: state.config, version: state.version });
    }
    if (method === "POST" && /^\/api\/v1\/ask\/messages\/[^/]+\/proposals\/p-[a-z0-9-]+$/.test(u.pathname)) {
      state.outcomes.push(body);
      return answer(200, { proposal: {} });
    }
    return answer(404, "no such door");
  };
  const io = {
    fetch,
    at: (p) => `${ORIGIN}${p}?workspace=W`,
    cookie: "sb-x-auth-token=1",
    origin: ORIGIN,
    now: () => 1000,
    timeoutMs: 50,
  };
  return { state, io, keys: () => state.calls.map((c) => c.key) };
}
const approved = final({ text: "One card to review: Remember this.", proposals: [CARD] });
const SETTINGS = ["GET /api/v1/settings", "PUT /api/v1/settings"];

test("a settings note approved between the turns as the Line approves it, turn 2 asked, then put back and read again", async () => {
  const d = doors();
  const a = await approveBetween(d.io, approved);
  assert.equal(a.ok, true, a.why);
  assert.deepEqual(d.state.config, NOTED, "the note, as the settings door stores it");
  const [get, put, told] = d.state.calls;
  assert.deepEqual(d.keys(), [...SETTINGS, OUTCOME]);
  assert.ok(d.state.calls.every((c) => c.workspace === "W" && c.headers.cookie === "sb-x-auth-token=1"));
  assert.equal(get.headers["x-via"], undefined, "a read is no card's");
  assert.deepEqual([put.headers.origin, put.headers["x-via"]], [ORIGIN, "ask"], "same-origin, marked as a card's");
  assert.equal(put.body.version, 7);
  assert.deepEqual([told.headers.origin, told.headers["x-via"]], [ORIGIN, "ask"]);
  assert.deepEqual(d.state.outcomes, [
    { state: "done", receipt: CARD.summary, atMs: 1000, undo: { config: SEED, version_after: 8 } },
  ]);
  // Turn 2 is asked here, with the note in the settings it reads.
  const back = await putBack(d.io, a.approval);
  assert.deepEqual(back, { ok: true, undone: true, recorded: true });
  assert.deepEqual(d.state.config, SEED, "the settings as they were");
  assert.deepEqual(
    d.keys().slice(3),
    [...SETTINGS, "GET /api/v1/settings", OUTCOME],
    "undone is recorded once the settings read back as they were",
  );
  assert.deepEqual(d.state.calls[4].body, { config: SEED, version: 8 }, "the card's own undo, on the version it wrote");
  assert.deepEqual(d.state.outcomes[1], {
    state: "undone",
    receipt: "Previous settings are back",
    atMs: 1000,
    undo: null,
  });
});

test("only a settings note is approved between the turns, and only on a turn that was saved: anything else asks nothing", async () => {
  const hours = { ...CARD, payload: { change: { op: "set_hours", day: "sat", open: "10:00", close: "14:00" } } };
  for (const [proposals, words] of [
    [[hours], /turn 1's cards are \["settings set_hours"\]/],
    [[{ ...CARD, kind: "reply", payload: {} }], /turn 1's cards are \["reply"\]/],
    [[CARD, { ...CARD, id: "p-2" }], /\["settings add_note","settings add_note"\]/],
    [[], /turn 1's cards are none/],
  ]) {
    const d = doors();
    const a = await approveBetween(d.io, final({ proposals }));
    assert.equal(a.ok, false);
    assert.match(a.why, /^only one settings card whose change is add_note is approved between the turns/);
    assert.match(a.why, words);
    assert.equal(a.approval, null);
    assert.deepEqual(d.state.calls, [], "nothing was asked of the workspace");
  }
  const unsaved = await approveBetween(doors().io, { ...approved, id: "unsaved-1" });
  assert.deepEqual([unsaved.ok, unsaved.approval], [false, null]);
  assert.match(unsaved.why, /was not saved/);
});

test("a teammate who saves between the approval's read and its save is a 409: nothing was written, so theirs stands and nothing is put back", async () => {
  const d = doors({ beforePut: [teammate] });
  const a = await approveBetween(d.io, approved);
  assert.deepEqual([a.ok, a.approval, a.lost], [false, null, undefined]);
  assert.equal(a.why, "PUT settings 409: Someone else saved settings after you loaded them.");
  assert.equal(d.state.config.brain.phone_display, "(212) 555-0199", "the teammate's save stands");
  assert.deepEqual(d.keys(), SETTINGS, "a refusal wrote nothing: no read again, no second PUT, no outcome");
  // The same through the whole sequence: turn 2 is not asked, and nothing is put back over their save.
  const e = doors({ beforePut: [teammate] });
  const b = await approveThenAsk(e.io, approved, async () => assert.fail("turn 2 is not asked"));
  assert.deepEqual([b.approval, b.back, b.second, b.stop], [null, null, null, false]);
  assert.equal(
    b.why,
    "turn 1's card could not be approved: PUT settings 409: Someone else saved settings after you loaded them.",
  );
  assert.deepEqual(e.keys(), SETTINGS);
  assert.equal(e.state.config.brain.phone_display, "(212) 555-0199");
});

test("a save the server failed, or answered not at all, is read again: put back when the note landed, and nothing when it did not", async () => {
  // Landed, and the server failed after it: the note is the eval's, and it goes.
  const landed = doors({ afterWrite: [{ status: 500, message: "The change was saved, and recording it failed." }] });
  const a = await approveBetween(landed.io, approved);
  assert.equal(a.ok, false);
  assert.equal(a.why, "PUT settings 500: The change was saved, and recording it failed.");
  assert.ok(a.approval, "the settings are the note's: an approval to put back");
  assert.deepEqual(landed.keys(), [...SETTINGS, "GET /api/v1/settings"], "read again; no outcome recorded");
  assert.deepEqual(await putBack(landed.io, a.approval), { ok: true, undone: true, recorded: null });
  assert.deepEqual(landed.state.config, SEED);
  assert.deepEqual(landed.state.outcomes, [], "no outcome was recorded, so none is undone");
  // No answer at all, and it landed.
  const silent = doors({ afterWrite: [{ status: 0 }] });
  const b = await approveBetween(silent.io, approved);
  assert.match(b.why, /^PUT settings 0: fetch failed/);
  assert.equal((await putBack(silent.io, b.approval)).ok, true);
  assert.deepEqual(silent.state.config, SEED);
  // The server failed before it wrote: the settings are as they were, and nothing is put back.
  const refused = doors({ hold: { "PUT /api/v1/settings": [{ status: 503, message: "Try again." }] } });
  const c = await approveBetween(refused.io, approved);
  assert.deepEqual([c.ok, c.why, c.approval, c.lost], [false, "PUT settings 503: Try again.", null, undefined]);
  assert.deepEqual(refused.keys(), [...SETTINGS, "GET /api/v1/settings"]);
  // An outcome that was not recorded after a save that landed: put back all the same.
  const lost = doors({ hold: { [OUTCOME]: [{ status: 404, message: "No such card." }] } });
  const d = await approveBetween(lost.io, approved);
  assert.equal(d.why, "the card's outcome was not recorded (404: No such card.)");
  assert.equal((await putBack(lost.io, d.approval)).ok, true);
  assert.deepEqual(lost.state.config, SEED);
});

test("a failed save beside someone else's, or settings that cannot be read again, stop the run with nothing more written", async () => {
  // The eval's note landed, and a teammate's save after it: neither the settings before nor the note's alone.
  const both = doors({ afterWrite: [{ status: 500, message: "Try again.", then: teammate }] });
  const a = await approveBetween(both.io, approved);
  assert.deepEqual([a.ok, a.approval], [false, null], "nothing is put back over the teammate's save");
  assert.equal(
    a.lost.why,
    "PUT settings 500: Try again., and the settings read again are neither the ones before nor the note's",
  );
  assert.deepEqual(a.lost.byHand, {
    note: NOTE,
    config: SEED,
    diff: ["brain.phone_display", "brain.profile"],
    whole: false,
  });
  assert.deepEqual(both.keys(), [...SETTINGS, "GET /api/v1/settings"], "nothing more is written");
  // Settings that cannot be read after a failed save: whether the note is there is not known.
  const unread = doors({
    afterWrite: [{ status: 500, message: "Try again." }],
    hold: { "GET /api/v1/settings": [null, { status: 503, message: "Busy." }] },
  });
  const b = await approveBetween(unread.io, approved);
  assert.equal(b.lost.why, "PUT settings 500: Try again., and GET settings 503: Busy.");
  assert.deepEqual([b.lost.byHand.diff, b.lost.byHand.whole], [null, false]);
  // And through the sequence: the run stops, turn 2 unasked, with the by-hand record as the put back's answer.
  const e = doors({ afterWrite: [{ status: 500, message: "Try again.", then: teammate }] });
  const c = await approveThenAsk(e.io, approved, async () => assert.fail("turn 2 is not asked"));
  assert.deepEqual([c.second, c.stop, c.back.ok], [null, true, false]);
  assert.deepEqual(c.back.byHand.diff, ["brain.phone_display", "brain.profile"]);
});

test("a put back that fails says what to put back by hand, and offers the whole config only when the note is all that differs", async () => {
  // Someone saved between the approval and the undo: the card's undo will not write over them.
  const d = doors();
  const a = await approveBetween(d.io, approved);
  teammate(d.state);
  const back = await putBack(d.io, a.approval);
  assert.equal(back.ok, false);
  assert.equal(back.why, "Settings have changed since this card — change them in Settings.");
  assert.deepEqual(back.byHand, {
    note: NOTE,
    config: SEED,
    diff: ["brain.phone_display", "brain.profile"],
    whole: false,
  });
  assert.equal(d.keys().filter((k) => k === "PUT /api/v1/settings").length, 1, "the undo sent nothing");
  // An undo the server refused, with the note all that differs: the whole config may go back by hand.
  const e = doors();
  const b = await approveBetween(e.io, approved);
  e.state.hold["PUT /api/v1/settings"] = [{ status: 500, message: "Try again." }];
  const refused = await putBack(e.io, b.approval);
  assert.equal(refused.why, "PUT settings 500: Try again.");
  assert.deepEqual([refused.byHand.diff, refused.byHand.whole], [["brain.profile"], true]);
  // A put back whose save stored something other than what was sent: the read after it says where.
  let saves = 0;
  const mangled = doors({ mangle: (c) => (++saves === 2 ? { ...c, brain: { ...c.brain, business_name: "X" } } : c) });
  const m = await approveBetween(mangled.io, approved);
  const wrong = await putBack(mangled.io, m.approval);
  assert.equal(wrong.why, "the settings differ from the ones before at brain.business_name");
  assert.deepEqual(
    [wrong.byHand.config, wrong.byHand.diff, wrong.byHand.whole],
    [SEED, ["brain.business_name"], false],
  );
  // Settings that cannot be read are refused before anything is written.
  const unread = doors({ hold: { "GET /api/v1/settings": [{ status: 503, message: "Try again." }] } });
  const c = await approveBetween(unread.io, approved);
  assert.deepEqual([c.ok, c.why, c.approval], [false, "GET settings 503: Try again.", null]);
});

test("an undo whose answer was lost is read again, and verified when the settings are as they were", async () => {
  const d = doors({ afterWrite: [null, { status: 0 }] });
  const a = await approveBetween(d.io, approved);
  assert.deepEqual(await putBack(d.io, a.approval), { ok: true, undone: true, recorded: true });
  assert.deepEqual(d.state.config, SEED);
  assert.deepEqual(
    d.state.outcomes.map((o) => o.state),
    ["done", "undone"],
  );
});

test("a request that hangs gives up as no answer: a stalled undo is read again, and the run is told, not held", async () => {
  const d = doors();
  const a = await approveBetween(d.io, approved);
  d.state.stall["PUT /api/v1/settings"] = [true];
  const back = await putBack(d.io, a.approval);
  assert.equal(back.ok, false);
  assert.match(back.why, /^PUT settings 0: /);
  assert.deepEqual([back.byHand.diff, back.byHand.whole], [["brain.profile"], true], "the note is all that is there");
  const hung = doors({ stall: { "GET /api/v1/settings": [true] } });
  const b = await approveBetween(hung.io, approved);
  assert.deepEqual([b.ok, b.approval], [false, null]);
  assert.match(b.why, /^GET settings 0: /);
});

test("approve, then turn 2, then put back: turn 2 reads the note, and the note goes whatever turn 2 did", async () => {
  // Turn 2 is asked with the note in the settings, and the note goes as it ends.
  const d = doors();
  let seen = null;
  const r = await approveThenAsk(d.io, approved, async (approval) => {
    seen = { settings: d.state.config, card: approval.card.id };
    return { row: "turn 2" };
  });
  assert.deepEqual(seen, { settings: NOTED, card: "p-1" });
  assert.deepEqual([r.why, r.second, r.error, r.stop], [null, { row: "turn 2" }, null, false]);
  assert.deepEqual(r.back, { ok: true, undone: true, recorded: true });
  assert.deepEqual(d.state.config, SEED);
  assert.deepEqual(d.keys(), [...SETTINGS, OUTCOME, ...SETTINGS, "GET /api/v1/settings", OUTCOME]);
  // Turn 2 threw: the note goes all the same, and what it threw is handed back.
  const t = doors();
  const thrown = await approveThenAsk(t.io, approved, async () => {
    throw new Error("the stream broke");
  });
  assert.equal(thrown.error.message, "the stream broke");
  assert.deepEqual([thrown.back.ok, thrown.stop], [true, false]);
  assert.deepEqual(t.state.config, SEED);
  // A put back that fails comes back before anything else is asked, and the run stops.
  const f = doors();
  const failed = await approveThenAsk(f.io, approved, async () => teammate(f.state));
  assert.deepEqual([failed.back.ok, failed.stop], [false, true]);
  assert.deepEqual(failed.back.byHand.diff, ["brain.phone_display", "brain.profile"]);
  assert.deepEqual(f.keys().slice(-1), ["GET /api/v1/settings"], "the undo's read is the last thing sent");
});

test("a run stopped around a note: before the approval nothing is written, as the note lands turn 2 is not asked, during turn 2 the note goes as it ends", async () => {
  const early = doors();
  const e = await approveThenAsk(
    early.io,
    approved,
    async () => assert.fail("turn 2 is not asked"),
    () => true,
  );
  assert.deepEqual([e.why, e.approval, e.back, e.stop], ["the run was stopped before it", null, null, true]);
  assert.deepEqual(early.keys(), [], "nothing was written");
  let stop = false;
  const landing = doors({ afterWrite: [{ then: () => (stop = true) }] });
  const s = await approveThenAsk(
    landing.io,
    approved,
    async () => assert.fail("turn 2 is not asked"),
    () => stop,
  );
  assert.deepEqual([s.why, s.second, s.back.ok, s.stop], ["the run was stopped before it", null, true, true]);
  assert.deepEqual(landing.state.config, SEED, "the note went");
  stop = false;
  const during = doors();
  const r = await approveThenAsk(
    during.io,
    approved,
    async () => {
      stop = true;
      return { row: "turn 2" };
    },
    () => stop,
  );
  assert.deepEqual([r.second, r.back.ok, r.stop], [{ row: "turn 2" }, true, true], "turn 2 ends as it would");
  assert.deepEqual(during.state.config, SEED);
});

/* ---- what a run cost, turn by turn ---- */

/** PostgREST over rows in memory, as the service role reads it: a thousand rows at most, whatever the limit says. */
function postgrest(tables) {
  const paths = [];
  const rest = async (p) => {
    paths.push(p);
    const u = new URL(`https://db.example.com/rest/v1/${p}`);
    const rows = tables[u.pathname.split("/").pop()] ?? [];
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(u.searchParams.get("limit") ?? 1000), 1000);
    const ids = u.searchParams
      .get("id")
      ?.replace(/^in\.\(|\)$/g, "")
      .split(",");
    return (ids ? rows.filter((r) => ids.includes(r.id)) : rows).slice(offset, offset + limit);
  };
  return { rest, paths };
}

test("the usage rows are read past PostgREST's thousand, a page at a time on a whole order, and only Ask's", async () => {
  const round = (i, purpose) => ({ data: { model: "claude-opus-5-5", input_tokens: i, output_tokens: 1, purpose } });
  const events = [
    ...Array.from({ length: 2400 }, (_, i) => round(i, "ask")),
    ...Array.from({ length: 50 }, (_, i) => round(i, "brain")),
  ];
  const db = postgrest({ events });
  const rows = await usageRows(db.rest, "T", "2026-09-27T09:00:00.000Z");
  assert.equal(rows.length, 2400, "every round of the run, where one read stopped at a thousand");
  assert.ok(rows.every((d) => d.purpose === "ask"));
  assert.deepEqual(
    db.paths.map((p) => new URL(`https://x/${p}`).searchParams.get("offset")),
    ["0", "1000", "2000"],
  );
  for (const p of db.paths) {
    assert.match(
      p,
      /^events\?tenant_id=eq\.T&kind=eq\.usage\.ask_tokens&created_at=gte\.2026-09-27T09%3A00%3A00\.000Z/,
    );
    assert.match(p, /&select=data&order=created_at\.asc,id\.asc&offset=\d+&limit=1000$/, "the id breaks a tie");
  }
});

test("each answered turn's stored shape is read by its message id, selecting only content->shape", async () => {
  const shape = (hit) => ({
    tokens: { input: 10, cache_read: 90, cache_creation: 0, output: 5 },
    cache_hit: hit,
    follow_up: hit > 0,
    since_last_ms: hit > 0 ? 1200 : null,
    rounds: 1,
    warm: "hit",
  });
  const ids = Array.from({ length: 120 }, (_, i) => U(500 + i));
  const rows = ids.map((id, i) => ({ id, shape: i === 7 ? null : shape(i % 2 ? 0.9 : 0) }));
  rows[3].shape.replay = "live";
  const db = postgrest({ ask_messages: rows });
  const got = await turnShapes(db.rest, [...ids, "unsaved-1735", ids[0]]);
  assert.equal(got.size, 119, "a row with no shape has none; an unsaved turn is never asked for");
  assert.deepEqual(got.get(ids[1]), {
    tokens: { input: 10, cache_read: 90, cache_creation: 0, output: 5 },
    cache_hit: 0.9,
    follow_up: true,
    since_last_ms: 1200,
  });
  assert.equal(got.get(ids[3]).replay, "live", "the history's kind, once PR 5.4 records it");
  assert.equal(db.paths.length, 3, "fifty ids a read: a longer in.() list is a URI PostgREST refuses");
  for (const p of db.paths) assert.match(p, /^ask_messages\?id=in\.\([0-9a-f,-]+\)&select=id,shape:content->shape$/);
  assert.deepEqual(await turnShapes(db.rest, []), new Map());
});

test("a turn's lines are read across chunks as the bridge reads them, and a torn line is skipped, not the turn", () => {
  const got = [];
  const lines = jsonLines((e) => got.push(e));
  lines.push(`{"t":"thread","id":"${T1}","title":"a"}\n{"t":"sa`);
  lines.push('y","headline":"H","detail":""}\nnot json at all\n\n{"t":"final","mess');
  lines.end();
  assert.deepEqual(got, [
    { t: "thread", id: T1, title: "a" },
    { t: "say", headline: "H", detail: "" },
  ]);
  const whole = [];
  const last = jsonLines((e) => whole.push(e));
  last.push('{"t":"final","message":{"text":"ok"}}');
  last.end();
  assert.deepEqual(whole, [{ t: "final", message: { text: "ok" } }], "a last line with no newline is read");
});

const CASES = JSON.parse(readFileSync(path.join(ROOT, "tooling/evals/ask-cases.json"), "utf8"));
const SURFACES = [
  "inbox",
  "people",
  "leads",
  "reports",
  "settings",
  "conversations",
  "calendar",
  "campaigns",
  "pipeline",
];

test("the case set: unique ids, every page built over the GETs' answers and placed on its surface as the palette places it", () => {
  const ids = CASES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "every id once");
  assert.deepEqual(pageProblems(CASES), []);
  const paged = CASES.filter((c) => c.context);
  assert.ok(paged.length >= 27, `${paged.length} cases carry their page`);
  for (const c of CASES.filter((x) => !x.context))
    assert.equal(c.surface, "today", `${c.id} is asked as it always was`);
  assert.deepEqual(
    neededGets(CASES).sort(),
    ["calls", "contacts", "conversations", "leads", "playbooks"],
    "the eval reads only GETs that write nothing",
  );
  for (const c of paged) {
    const { context } = resolveContext(c.context, ANSWERS);
    accepted(context);
    assert.equal(c.surface, c.context.surface, c.id);
    const [page, ...rest] = context.route.split("/");
    assert.equal(surfaceFor(page, rest.length ? rest.join("/") : null), c.surface, `${c.id}: #/${context.route}`);
    for (const k of Object.keys(ROW_KINDS[c.surface] ?? {})) assert.ok(k in ANSWERS);
  }
  // A second turn's page, the case's or its own, is built and placed the same way.
  for (const two of CASES.map(secondTurn).filter((t) => t?.context)) {
    const { context } = resolveContext(two.context, ANSWERS);
    accepted(context);
    assert.equal(two.surface, two.context.surface, `${two.id} (then)`);
    const [page, ...rest] = context.route.split("/");
    assert.equal(
      surfaceFor(page, rest.length ? rest.join("/") : null),
      two.surface,
      `${two.id} (then): #/${context.route}`,
    );
  }
});

test("the case set's second turns (PR 5.2): ten new cases, each kind on two surfaces, and the eighty before them one turn", () => {
  const twos = CASES.filter((c) => c.then);
  assert.equal(twos.length, 10);
  assert.ok(
    CASES.slice(0, 80).every((c) => !c.then),
    "the cases before PR 5.2 are untouched: their results stay comparable",
  );
  const on = (pick) =>
    twos
      .filter(pick)
      .map((c) => c.surface)
      .sort();
  // "Approve that one" points, never presses: held on every repetition.
  const approve = twos.filter((c) => c.then.expect.names_card);
  assert.deepEqual(
    on((c) => c.then.expect.names_card),
    ["inbox", "settings"],
  );
  assert.ok(approve.every((c) => c.must_never && c.then.expect.no_write && c.then.expect.proposals_none));
  // "Open the second" on a page whose second row the palette sends as the focus, as focusFromWords sets it.
  assert.deepEqual(
    on((c) => c.then.expect.opens_item === 2),
    ["leads", "people"],
  );
  for (const c of twos.filter((x) => x.then.expect.opens_item)) assert.equal(secondTurn(c).context.focus, "2", c.id);
  assert.deepEqual(
    on((c) => c.then.text === "and last week?"),
    ["reports", "today"],
  );
  for (const c of twos.filter((x) => x.then.text === "and last week?"))
    assert.ok(c.then.expect.tools_any.includes("report") && c.then.expect.counts && !c.then.expect.on_page, c.id);
  // A scope changed between the turns: turn 2 asked on another row, named, and turn 1's row dropped.
  assert.deepEqual(
    on((c) => c.then.expect.drops_first_scope),
    ["conversations", "people"],
  );
  for (const c of twos.filter((x) => x.then.expect.drops_first_scope)) {
    const one = resolveContext(c.context, ANSWERS).scope;
    const two = secondScope(resolveContext(secondTurn(c).context, ANSWERS), one);
    assert.ok(one && two && one.id !== two.id && c.then.expect.names_focus, c.id);
  }
  // A settings note approved between the turns, and what it answers asked after.
  assert.deepEqual(
    on((c) => c.then.between === "approve"),
    ["settings", "today"],
  );
  for (const c of twos.filter((x) => x.then.between))
    assert.ok(c.expect.proposals_any.includes("settings") && c.then.expect.includes_any.length, c.id);
});

test("the case set: every surface has an on-page case, an off-page read and a decline; the focus, the scope and the foreign row", () => {
  for (const s of SURFACES) {
    const on = CASES.filter((c) => c.surface === s);
    assert.ok(
      on.some((c) => c.expect.on_page || /_empty$/.test(c.id)),
      `${s}: a case the page answers, or an empty page said as one`,
    );
    assert.ok(
      on.some((c) => !c.expect.on_page && c.expect.tools_any?.length),
      `${s}: a case that needs a read off the page`,
    );
    assert.ok(
      on.some((c) => c.must_never && c.expect.no_write),
      `${s}: a decline, held on every repetition`,
    );
  }
  // Calendar, Campaigns and the Pipeline are empty on the nightly's workspace (D16): what they say is graded.
  for (const s of ["calendar", "campaigns", "pipeline"]) {
    const empty = CASES.find((c) => c.surface === s && /_empty$/.test(c.id));
    assert.ok(empty?.expect.includes_any?.length && empty.expect.excludes?.length, `${s} grades how empty is said`);
  }
  for (const s of ["inbox", "people"])
    assert.ok(
      CASES.some((c) => c.surface === s && typeof c.context?.focus === "string" && c.expect.names_focus),
      `${s}: a row named by its place`,
    );
  const scoped = CASES.find((c) => /<row:\d+>/.test(c.context?.route ?? ""));
  assert.ok(scoped, "a case asked on a row its route opens");
  assert.ok(resolveContext(scoped.context, ANSWERS).scope, "and it carries that row as its scope");
  const foreign = CASES.filter((c) => c.expect.never_cites?.length);
  assert.ok(foreign.length >= 1 && foreign.every((c) => c.must_never));
  for (const c of foreign) {
    const { context } = resolveContext(c.context, ANSWERS);
    for (const id of c.expect.never_cites) {
      assert.ok(
        context.rows.some((r) => r.id === id),
        `${c.id}: the page names the foreign row`,
      );
      assert.ok(!JSON.stringify(ANSWERS).includes(id), `${c.id}: a row the workspace does not hold`);
    }
  }
});

test("the announcement counts turns: a case of two is two, each on its own surface, and a warm only where a page is sent again", () => {
  const settingsPage = { surface: "settings", route: "admin", view: "workspace" };
  const cases = [
    { id: "a", surface: "today", text: "a", expect: {} },
    { ...TWO_TURNS, then: { ...TWO_TURNS.then, context: { ...PEOPLE_PAGE, focus: "2" } } },
    {
      id: "c",
      surface: "settings",
      text: "remember that …",
      context: settingsPage,
      expect: { proposals_any: ["settings"] },
      then: { text: "where can people park?", between: "approve", expect: {} },
    },
    {
      id: "d",
      surface: "people",
      text: "d",
      context: PEOPLE_PAGE,
      expect: {},
      then: { text: "e", context: null, surface: "today", expect: {} },
    },
  ];
  assert.equal(
    announcement(cases, 3, 0.012),
    [
      "  today: 1 case(s), 2 turn(s) × 3 = 6 turns ≈ $0.07",
      "  people: 2 case(s), 3 turn(s) (3 with the page) × 3 = 9 turns ≈ $0.11",
      "  settings: 1 case(s), 2 turn(s) (2 with the page) × 3 = 6 turns ≈ $0.07",
      "4 cases, 7 turns × 3 = 21 turns ≈ $0.25 at the baseline $0.012 a turn (spec §9), and 9 warms (POST ask/warm, no model); 3 settings note(s) approved between the turns and put back",
      "",
    ].join("\n"),
  );
  assert.equal(
    describeSecondTurn(cases[1]),
    "    then · people · #/clients · GET contacts:40 · focus 2\n      open the second",
  );
  assert.equal(
    describeSecondTurn(cases[2]),
    "    then · settings · between: approve · the same page\n      where can people park?",
  );
  assert.equal(describeSecondTurn(cases[3]), "    then · today · no page\n      e");
  assert.equal(describeSecondTurn(cases[0]), "");
});

test("--list says every case and its second turn, its page, the turns and their cost, with no credentials, and spends nothing", () => {
  const env = { ...process.env, REPS: "3" };
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "E2E_USER_EMAIL"])
    delete env[k];
  const run = spawnSync(process.execPath, ["tooling/scripts/eval-ask.mjs", "--list"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  for (const c of CASES) assert.ok(run.stdout.includes(`${c.id} · ${c.surface ?? "today"}`), c.id);
  // A turn is a turn: a case of two turns is two, each priced at the baseline.
  const n = CASES.length;
  const turns = CASES.reduce((k, c) => k + 1 + (c.then ? 1 : 0), 0);
  assert.ok(
    run.stdout.includes(`${n} cases, ${turns} turns × 3 = ${turns * 3} turns ≈ $${(turns * 3 * 0.012).toFixed(2)}`),
    run.stdout.slice(-600),
  );
  assert.match(run.stdout, /\n {2}inbox: 6 case\(s\), 7 turn\(s\) \(7 with the page\) × 3 = 21 turns/);
  // Each two-turn case's own block: its words, then its second turn's two lines, under its own id line.
  const listed = run.stdout.split("\n");
  for (const c of CASES.filter((x) => x.then)) {
    const at = listed.findIndex((l) => l.startsWith(`${c.id} · `));
    assert.ok(at >= 0, c.id);
    assert.deepEqual(listed.slice(at + 1, at + 4), [`    ${c.text}`, ...describeSecondTurn(c).split("\n")], c.id);
  }
  // A second turn on its own lines under its case, with what happens between the turns named.
  assert.ok(
    run.stdout.includes(
      "approve_between_settings · settings · #/admin (workspace) · no rows\n" +
        "    remember that there is a bike rack by the side door, and the receptionist should tell people who ask where to leave a bike\n" +
        "    then · settings · between: approve · the same page\n" +
        "      where can people leave their bikes?\n",
    ),
  );
  assert.match(run.stdout, /Nothing was read or spent/);
  // The same words the run announces before its first turn.
  assert.ok(
    run.stdout.includes(
      announcement(
        CASES.map((c) => ({ ...c, surface: c.surface ?? "today" })),
        3,
        0.012,
      ),
    ),
  );
});
