/**
 * Conversations, the loading standard's E and F: the row open on its tab is the address's, and the box's words are
 * kept per tab.
 *
 * - The address held a tab OR a row (`conversations/phone`, `conversations/cv-4`), so the row a person had open on a
 *   tab was nobody's after a refresh, and no link could name it. The page's one rule (CV_ROUTE) reads `<tab>:<id>`
 *   too, its twin (CV_ADDRESS) spells it, and a row pressed writes it, so a refresh opens the same row on the same
 *   tab: replaced on a desktop, where Back leaves the page; pushed on a phone, where the row is the screen and Back
 *   closes it to its list.
 * - A search typed on Phone was gone after a trip to People: it is kept per tab in the tab's storage (tab-memory.ts),
 *   and a tab pressed opens with the words last typed on it.
 * - The rows are the surface's newest read. The page held its list and its tabs' counts on a counter only a decision
 *   moved, so what the live feed read again while the page was open never reached the screen (5 Oct 2026): the stub
 *   keeps useMemo as React does (_legacy-react.mjs), or a memo on the wrong inputs could never show.
 * Run against the page (surfaces/inbox/pages/conversations-page.tsx) on a stub React, over the rows the seam holds, with the
 * tab's memory installed as the app installs it.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { toConversationVM, toCallVM, stateOf } from "@chanlytics/contracts";
import { legacyAddress } from "../../shell/address/_address.mjs";
import {
  installLegacyReact,
  fresh as freshTree,
  again,
  all,
  find,
  byTestId,
  textOf,
  press,
} from "../../_legacy-react.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");

/* ---------------------------------- the window ---------------------------------- */

const went = [];
installLegacyReact({
  history: { replaceState() {}, back: () => went.push(["back"]) },
  setInterval: () => 1,
  clearInterval() {},
  __DEMO_MODE: false,
  __chrome: { state: stateOf },
  appNavigate: (to, opts) => went.push(["app", to, opts || null]),
  canDo: () => true,
  gate: () => ({}),
});
Object.assign(globalThis, {
  CHANLY: {
    nav: (to) => went.push(["nav", to]),
    address: await legacyAddress(),
    R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` },
  },
});
const S = "../../../../../apps/dashboard/src";
const { ConversationsPage, OutcomePill } = await import(`${S}/surfaces/inbox/pages/conversations-page.tsx`);
const { SubTabs } = await import(`${S}/surfaces/kit/sub-tabs/sub-tabs.tsx`);
const cvRules = await import(`${S}/surfaces/inbox/cv-rules.ts`);
const { cvRoute: route, cvAddress: address } = cvRules;
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { installTabMemory, clearTabMemory } = await import(`${S}/legacy-bridge/tab-memory.ts`);
installTabMemory(globalThis.window);
const TM = globalThis.window.__tabMemory;

/* ---------------------------------- walking a tree ---------------------------------- */

const rows = (tree) => all(tree, (n) => String(n.props?.className || "").startsWith("cv-row "));
const searchBox = (tree) =>
  find(tree, (n) => n.type === "input" && String(n.props?.placeholder || "").startsWith("Search names"));
/** A fresh mount, as React mounts the page a person came back to. */
const fresh = () => {
  freshTree();
  went.length = 0;
};
/** The page drawn again over the same cells, as React draws it after a state change or a new prop. */
const redraw = (props) => again(() => ConversationsPage(props));

/* ---------------------------------- the rows ---------------------------------- */

const msg = (over = {}) => ({
  id: "m",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Do you have Friday?",
  media: null,
  meta: null,
  status: "received",
  created_at: "2026-09-14T13:00:00Z",
  ...over,
});
const ours = (over = {}) =>
  msg({
    id: "m2",
    direction: "outbound",
    sender: "ai",
    body: "Yes, 3pm works.",
    status: "sent",
    created_at: "2026-09-14T13:01:00Z",
    ...over,
  });
const conv = (id, name, messages) => ({
  id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: "2026-09-14T13:00:00Z",
  last_message_at: "2026-09-14T13:01:00Z",
  contact: {
    id: `k-${id}`,
    display_name: name,
    wa_profile_name: null,
    phone_e164: "+13475550101",
    consent: "opted_in",
    dnc: false,
  },
  messages,
});
const call = (id, name, over = {}) =>
  toCallVM(
    {
      id,
      retell_call_id: `r-${id}`,
      direction: "inbound",
      call_type: "phone_call",
      status: "ended",
      from_e164: "+19175550106",
      from_raw: null,
      to_e164: "+13055550123",
      started_at: "2026-09-14T13:00:00Z",
      ended_at: "2026-09-14T13:03:10Z",
      duration_ms: 190_000,
      disconnection_reason: "agent_hangup",
      sentiment: "Positive",
      call_successful: true,
      in_voicemail: false,
      summary: "The caller asked about a bridal trial.",
      transcript_object: null,
      recording: null,
      conversation_id: `cv-${id}`,
      contact_id: `k-${id}`,
      message_id: `m-${id}`,
      contact: { display_name: name, wa_profile_name: null, phone_e164: "+19175550106" },
      wanted: null,
      outcome: null,
      follow_up: null,
      caller_name: name,
      ...over,
    },
    ZONE,
    NOW,
  );
const rosa = toConversationVM(conv("c1", "Rosa Díaz", [msg({ id: "m1" }), ours()]), null, ZONE, NOW);
const emily = call("k7", "Emily Chen");
const withRows = (list) => {
  setSurfaceValue("conversations", {
    CONVERSATIONS: list,
    CV_CHANNELS: [
      { id: "all", label: "All" },
      { id: "whatsapp", label: "WhatsApp" },
      { id: "phone", label: "Phone" },
    ],
    CALLS_READ: true,
  });
};

beforeEach(() => {
  fresh();
  clearTabMemory();
  setSurfaceValue("inbox", { THREADS: [], CHANNEL_LABELS: { whatsapp: "WhatsApp", phone: "Phone" } });
  withRows([rosa, emily]);
});

/* ---------------------------------- E: the address ---------------------------------- */

test("the one rule reads a tab, a row, or a row on its tab -- and its twin spells them back", () => {
  assert.deepEqual(route("phone"), { channel: "phone", id: null });
  assert.deepEqual(route("cv-4"), { channel: "all", id: "cv-4" });
  assert.deepEqual(route("phone:cv-4"), { channel: "phone", id: "cv-4" }, "the row open on its tab");
  assert.deepEqual(route("whatsapp:5b0c6a52-8f1e-4d7a-9c1b-2e7f3a9d4c10"), {
    channel: "whatsapp",
    id: "5b0c6a52-8f1e-4d7a-9c1b-2e7f3a9d4c10",
  });
  assert.deepEqual(route("all:cv-4"), { channel: "all", id: "cv-4" }, "All, said in full");
  assert.deepEqual(route("phone:"), { channel: "phone", id: null }, "a tab with nothing after its colon is the tab");
  assert.deepEqual(
    route("nobody:cv-4"),
    { channel: "all", id: "nobody:cv-4" },
    "a word that is no tab is an id, colon and all, as it was",
  );
  assert.equal(address("all", null), "conversations");
  assert.equal(address("phone", null), "conversations/phone");
  assert.equal(address("all", "cv-4"), "conversations/cv-4", "on All a row is spelled as every link spells it");
  assert.equal(address("phone", "cv-4"), "conversations/phone:cv-4");
  for (const [tab, id] of [
    ["all", null],
    ["phone", null],
    ["all", "cv-4"],
    ["whatsapp", "cv-4"],
  ]) {
    assert.deepEqual(
      route(address(tab, id).replace(/^conversations\/?/, "") || undefined),
      { channel: tab, id },
      `${tab}:${id} goes round`,
    );
  }
});

test("on a desktop a row pressed is the address's, on its tab, replaced -- and the pane opens it; a tab pressed is a new entry", () => {
  let tree = ConversationsPage({ channel: "phone", initialId: null });
  assert.equal(rows(tree).length, 1, "the phone's rows");
  press(rows(tree)[0]);
  assert.deepEqual(
    went,
    [["app", "conversations/phone:cv-k7", { replace: true }]],
    "REGRESSION: the row a person opened was nowhere in the address",
  );
  tree = redraw({ channel: "phone", initialId: "cv-k7" });
  assert.ok(String(rows(tree)[0].props.className).includes("active"), "and it is the one open");
  assert.ok(
    find(tree, (n) => String(n.props?.className || "").startsWith("conversations")).props["data-takeover"],
    "the phone's turn for the pane",
  );

  // On All, a row is spelled as every other link spells it.
  fresh();
  tree = ConversationsPage({ channel: "all", initialId: null });
  press(rows(tree).find((r) => textOf(r).includes("Rosa")));
  assert.deepEqual(went, [["app", "conversations/c1", { replace: true }]]);

  // A tab pressed is a new place: pushed, by the same spelling.
  fresh();
  tree = ConversationsPage({ channel: "all", initialId: null });
  // The channels are the kit's strip (Base UI's Tabs, held in a browser): a pick is its onSelect, by the tab's id.
  const strip = (t) => find(t, (n) => n.type === SubTabs).props;
  assert.ok(
    strip(tree).tabs.some((t) => t.testid === "cv-tab-phone"),
    "the channels carry their test ids",
  );
  strip(tree).onSelect("phone");
  strip(tree).onSelect("all");
  assert.deepEqual(went, [
    ["nav", "conversations/phone"],
    ["nav", "conversations"],
  ]);
});

test("on a phone a row pressed is an entry of its own: the viewer's Back steps back through it, and the list returns", () => {
  const phone = (tree) =>
    !!find(tree, (n) => String(n.props?.className || "").startsWith("conversations")).props["data-takeover"];
  const viewerBack = (tree) => find(tree, (n) => typeof n.props?.onBack === "function").props.onBack;
  const wasMedia = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === "(max-width: 720px)" });
  try {
    let tree = ConversationsPage({ channel: "phone", initialId: null });
    press(rows(tree)[0]);
    assert.deepEqual(
      went,
      [["app", "conversations/phone:cv-k7", null]],
      "REGRESSION: a row replaced the address on a phone, so Back left Conversations with the row open",
    );
    globalThis.window.location.hash = "#/conversations/phone:cv-k7";
    tree = redraw({ channel: "phone", initialId: "cv-k7" });
    assert.ok(phone(tree), "the row is the screen");
    viewerBack(tree)();
    assert.deepEqual(went.at(-1), ["back"], "the viewer's own Back is the same step as the system's");
    // Back lands on the list's address: the viewer closes.
    globalThis.window.location.hash = "#/conversations/phone";
    redraw({ channel: "phone", initialId: null });
    tree = redraw({ channel: "phone", initialId: null });
    assert.ok(!phone(tree), "the list, not the row");

    // A row the address brought (a link, a cold boot) has no entry of its own: it closes to its list in place.
    fresh();
    globalThis.window.location.hash = "#/conversations/phone:cv-k7";
    tree = ConversationsPage({ channel: "phone", initialId: "cv-k7" });
    tree = redraw({ channel: "phone", initialId: "cv-k7" });
    viewerBack(tree)();
    assert.ok(!went.some((w) => w[0] === "back"), "never a step back out of the page");
    tree = redraw({ channel: "phone", initialId: "cv-k7" });
    assert.ok(!phone(tree));
  } finally {
    globalThis.matchMedia = wasMedia;
    globalThis.window.location.hash = "#/conversations";
  }
});

test("a link to a row on a tab opens that row on that tab, and a search that hides it keeps it open", () => {
  let tree = ConversationsPage({ channel: "phone", initialId: "cv-k7" });
  assert.ok(String(rows(tree)[0].props.className).includes("active"));
  assert.equal(byTestId(tree, "cv-call-pane") !== null, true, "the call's pane");
  searchBox(tree).props.onChange({ target: { value: "rosa" } });
  tree = redraw({ channel: "phone", initialId: "cv-k7" });
  assert.equal(rows(tree).length, 0, "the words hide its row");
  assert.ok(byTestId(tree, "cv-call-pane"), "and the pane keeps the row asked for, never the list's first");
});

test("the rows are the surface's newest read: what lands while the page is open shows in its row, its tab's count and the call open", () => {
  const tabs = (tree) => find(tree, (n) => n.type === SubTabs).props.tabs;
  const count = (tree, id) => tabs(tree).find((t) => t.id === id).count;
  const said = (tree, who) => textOf(rows(tree).find((r) => textOf(r).includes(who)));
  let tree = ConversationsPage({ channel: "all", initialId: "cv-k7" });
  assert.equal(rows(tree).length, 2);
  assert.equal(count(tree, "whatsapp"), 1);
  assert.ok(!textOf(byTestId(tree, "cv-call-pane")).includes("booked the trial"));

  // The live feed reads the surface again: Rosa wrote again, Ana wrote for the first time, and the call's summary is in.
  const rosaAgain = toConversationVM(
    conv("c1", "Rosa Díaz", [
      msg({ id: "m1" }),
      ours(),
      msg({ id: "m3", body: "Can I bring my sister?", created_at: "2026-09-14T13:30:00Z" }),
    ]),
    null,
    ZONE,
    NOW,
  );
  const ana = toConversationVM(
    conv("c2", "Ana Ruiz", [msg({ id: "m4", body: "Are you open on Sunday?" })]),
    null,
    ZONE,
    NOW,
  );
  withRows([ana, rosaAgain, call("k7", "Emily Chen", { summary: "She booked the trial for Friday." })]);
  tree = redraw({ channel: "all", initialId: "cv-k7" });
  assert.equal(rows(tree).length, 3, "REGRESSION: a conversation that began while the page was open had no row");
  assert.ok(said(tree, "Ana Ruiz").includes("Are you open on Sunday?"));
  assert.ok(
    said(tree, "Rosa").includes("Can I bring my sister?"),
    "REGRESSION: a row said the words it had when the page opened",
  );
  assert.equal(count(tree, "whatsapp"), 2, "the tab counts the rows it shows");
  assert.ok(
    textOf(byTestId(tree, "cv-call-pane")).includes("She booked the trial for Friday."),
    "the call open is drawn from the newest read",
  );
});

/* ---------------------------------- F: the box's words ---------------------------------- */

test("the box's words are kept per tab, in the tab's storage: back after a trip away, and each tab's own when a tab is pressed", () => {
  let tree = ConversationsPage({ channel: "all", initialId: null });
  searchBox(tree).props.onChange({ target: { value: "rosa" } });
  tree = redraw({ channel: "all", initialId: null });
  assert.equal(searchBox(tree).props.value, "rosa");
  assert.deepEqual(TM.place("conversations", "all"), { q: "rosa" }, "kept as typed");
  // The page is one mount across its tabs: Phone pressed is the same page with a new channel, and its own words.
  tree = redraw({ channel: "phone", initialId: null });
  assert.equal(searchBox(tree).props.value, "", "Phone has none yet");
  assert.equal(rows(tree).length, 1, "and its rows are not filtered by All's words");
  searchBox(tree).props.onChange({ target: { value: "emily" } });
  redraw({ channel: "phone", initialId: null });
  assert.deepEqual(TM.place("conversations", "phone"), { q: "emily" });
  tree = redraw({ channel: "all", initialId: null });
  assert.equal(searchBox(tree).props.value, "rosa", "back on All, All's words");
  // Left for People and come back to: the words are there.
  fresh();
  tree = ConversationsPage({ channel: "phone", initialId: null });
  assert.equal(searchBox(tree).props.value, "emily", "REGRESSION: a search typed on Phone was gone after a trip away");
  // Cleared, forgotten: a place with nothing in it is not kept.
  searchBox(tree).props.onChange({ target: { value: "" } });
  assert.equal(TM.place("conversations", "phone"), null);
  // Signed out, gone.
  clearTabMemory();
  assert.equal(TM.place("conversations", "all"), null);
});

/* ---------------------------------- one row per person ---------------------------------- */

test("REGRESSION: a person who called three times is one row, their newest, saying how many -- not three rows of their name", () => {
  const { cvOnePerPerson, cvLeadOf } = cvRules;
  const tabs = (tree) => find(tree, (n) => n.type === SubTabs).props.tabs;
  const theirs = (id, at, summary) =>
    call(id, "Emily Chen", {
      contact_id: "k-emily",
      conversation_id: "cv-emily",
      started_at: at,
      ended_at: at,
      summary,
    });
  // Newest first, as the surface sorts them.
  const emilys = [
    theirs("k3", "2026-09-14T13:40:00Z", "She asked about parking."),
    theirs("k2", "2026-09-14T13:20:00Z", "She booked the trial for Friday."),
    theirs("k1", "2026-09-14T13:00:00Z", "She hung up."),
  ];
  withRows([emilys[0], rosa, emilys[1], emilys[2]]);
  let tree = ConversationsPage({ channel: "all", initialId: null });
  assert.equal(rows(tree).length, 2, "REGRESSION: a row for every call");
  const emily = textOf(rows(tree)[0]);
  assert.ok(emily.includes("Emily Chen") && emily.includes("3 calls"), emily);
  assert.equal(tabs(tree).find((t) => t.id === "phone").count, 1, "the tab counts the people it shows");

  // A link to one of the calls (Ask's, Today's) opens it, on its person's row.
  fresh();
  tree = ConversationsPage({ channel: "all", initialId: "cv-k2" });
  assert.equal(rows(tree).length, 2);
  assert.ok(String(rows(tree)[0].props.className).includes("active"), "their row is the one open");
  assert.ok(
    textOf(byTestId(tree, "cv-call-pane")).includes("She booked the trial for Friday."),
    "at the call asked for",
  );
  assert.equal(byTestId(tree, "cv-missing-thread"), null, "never 'not among the newest'");

  // A search keeps what it matched, and the row leads with it.
  searchBox(tree).props.onChange({ target: { value: "parking" } });
  tree = redraw({ channel: "all", initialId: null });
  assert.equal(rows(tree).length, 1);
  assert.ok(!textOf(rows(tree)[0]).includes("calls"), "one call matched: no count");

  // A thread that needs you says so under the call that came after it; a call going on now says that.
  const needs = { ...rosa, standing: "needs_you" };
  const after = { ...call("k9", "Rosa Díaz", { contact_id: rosa.clientId }), outcome: "abandoned" };
  const [one] = cvOnePerPerson([after, needs]);
  assert.equal(one.id, after.id, "the newest leads the row");
  assert.equal(cvLeadOf(one).standing, "needs_you", "REGRESSION: 'Hung up early' over a thread that needs you");
  assert.equal(cvLeadOf({ ...one, live: true }).id, after.id);
  // A caller who withheld their number is nobody's: each of their calls stands alone.
  const anon = (id) => ({ ...call(id, "Unknown"), clientId: null, threadId: undefined });
  assert.equal(cvOnePerPerson([anon("a1"), anon("a2")]).length, 2);
});

test("REGRESSION: a person who only phones says what the Inbox says of them -- 'Needs you', not the 'Hung up early' of the call after -- and a row of several calls says the count, not one call's length", () => {
  const { cvCallsStandAsTheirThread } = cvRules;
  const drawn = (row) => find(row, (n) => n.type === OutcomePill).rendered.props.value;
  const foot = (row) => find(row, (n) => n.props?.className === "cv-row-foot");
  // Their thread holds nothing written, so the surface gives it no row: it is read only for who has it.
  const thread = {
    ...toConversationVM(conv("e1", "Emily Chen", [msg({ type: "call_summary", sender: "ai" })]), null, ZONE, NOW),
    standing: "needs_you",
  };
  const theirs = (id, at, over = {}) =>
    call(id, "Emily Chen", { contact_id: "k-e1", conversation_id: "e1", started_at: at, ended_at: at, ...over });
  const hungUp = theirs("k6", "2026-09-14T13:40:00Z", { disconnection_reason: "user_hangup", duration_ms: 7_000 });
  const earlier = theirs("k5", "2026-09-14T13:00:00Z");
  assert.equal(hungUp.outcome, "abandoned", "the newest is a call they hung up on");

  const calls = cvCallsStandAsTheirThread([hungUp, earlier], [thread]);
  assert.deepEqual(
    calls.map((c) => c.standing),
    ["needs_you", "needs_you"],
    "each call stands as its thread",
  );
  assert.equal(cvCallsStandAsTheirThread([emily], [thread])[0], emily, "a call of another thread is left as it was");

  withRows(calls);
  let tree = ConversationsPage({ channel: "all", initialId: null });
  const [row] = rows(tree);
  assert.equal(drawn(row), "escalated", "REGRESSION: the row said 'Hung up early' while the Inbox said 'Needs you'");
  assert.equal(textOf(foot(row)), "2 calls", "REGRESSION: one call's 0:07 beside '2 calls' read as theirs together");
  // The row is the Inbox's beside it: the wire one badge on the face, named for a screen reader (no glyph before the
  // name), the time at the first line's end, and no receptionist's name where one answers everything here.
  const byClass = (node, cls) => find(node, (n) => n.props?.className === cls);
  const wire = byClass(row, "cv-row-wire");
  assert.equal(wire?.props["aria-label"], "Phone", "the wire, on the face, named");
  assert.equal(find(wire, (n) => n.props?.name)?.props.name, "phone");
  assert.ok(byClass(byClass(row, "cv-row-lead"), "cv-row-wire"), "the face's lead holds it");
  assert.equal(
    find(byClass(row, "cv-row-line1"), (n) => n.props?.name),
    null,
    "no glyph on the line of the name",
  );
  assert.ok(byClass(byClass(row, "cv-row-line1"), "cv-row-at tabular"), "the time ends the first line");
  assert.ok(!textOf(row).includes("Receptionist"), "one receptionist answers here: the foot does not name it");

  // Quiet again, the call says its own story; and a row of one call keeps its length.
  withRows([{ ...hungUp, standing: "quiet" }]);
  fresh();
  tree = ConversationsPage({ channel: "all", initialId: null });
  assert.equal(drawn(rows(tree)[0]), "abandoned");
  assert.ok(textOf(rows(tree)[0]).includes("0:07"), "a row of one call says how long it ran, in its words");
  assert.equal(foot(rows(tree)[0]), null, "and nothing under them: one receptionist here, one call");
});

test("a person who asked to stop is marked on their row, and a number is one glyph on a row's face (D1-stop-unseen, D1-face-number)", async () => {
  const { Face } = await import(`${S}/surfaces/kit/face/face.tsx`);
  const stopper = (id, name, consent) =>
    toConversationVM(
      {
        ...conv(id, name, [msg({ id: `m-${id}` }), ours({ id: `o-${id}` })]),
        contact: { id: `k-${id}`, display_name: name, wa_profile_name: null, phone_e164: "+13475550109", ...consent },
      },
      null,
      ZONE,
      NOW,
    );
  const dana = stopper("c9", "Dana Cole", { consent: "opted_out", dnc: false });
  const onDnc = stopper("c8", "Eli Brandt", { consent: "opted_in", dnc: true });
  const number = stopper("c7", "+1 (347) 555-0107", { consent: "opted_in", dnc: false });
  assert.deepEqual([dana.stopped, onDnc.stopped, number.stopped, rosa.stopped], [true, true, false, false]);

  withRows([dana, onDnc, number, rosa]);
  const tree = ConversationsPage({ channel: "all", initialId: null });
  const rowOf = (name) => rows(tree).find((r) => textOf(r).includes(name));
  assert.equal(textOf(byTestId(rowOf("Dana Cole"), "cv-row-stopped")), "Stopped", "they asked to stop");
  assert.ok(byTestId(rowOf("Eli Brandt"), "cv-row-stopped"), "so did a person on do-not-contact");
  assert.equal(
    byTestId(rowOf("+1 (347) 555-0107"), "cv-row-stopped"),
    null,
    "someone who can be answered says nothing",
  );
  assert.equal(byTestId(rowOf("Rosa Díaz"), "cv-row-stopped"), null);

  // One face: the kit's, told who it is for; a number is the phone glyph and never its last two digits.
  const faceOf = (name) => find(rowOf(name), (n) => n.type === Face);
  assert.deepEqual(faceOf("Dana Cole").props.person, { name: "Dana Cole", initials: "DC" });
  assert.equal(find(faceOf("Dana Cole"), (n) => n.props?.name)?.props.name, undefined, "initials for a name");
  assert.equal(find(faceOf("+1 (347) 555-0107"), (n) => n.props?.name)?.props.name, "phone", "a number is the glyph");
  assert.equal(textOf(faceOf("+1 (347) 555-0107")), "");
  assert.ok(String(faceOf("Dana Cole").rendered.props.className).includes("cv-row-pic"));

  // A person's one row says it when their call does, though the chat beside it was read before the flag.
  const call9 = { ...call("k9", "Dana Cole", { contact_id: dana.clientId }), stopped: true };
  const [one] = cvRules.cvOnePerPerson([call9, { ...dana, stopped: false }]);
  assert.equal(cvRules.cvStopped(one), true);
});
