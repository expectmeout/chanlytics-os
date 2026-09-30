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
const { ConversationsPage } = await import(`${S}/surfaces/inbox/pages/conversations-page.tsx`);
const { cvRoute: route, cvAddress: address } = await import(`${S}/surfaces/inbox/cv-rules.ts`);
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
const call = (id, name) =>
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
    },
    ZONE,
    NOW,
  );
const rosa = toConversationVM(conv("c1", "Rosa Díaz", [msg({ id: "m1" }), ours()]), ZONE, NOW);
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
  setSurfaceValue("inbox", { THREADS: [], CHANNEL_LABELS: { whatsapp: "WhatsApp" } });
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
    String(find(tree, (n) => String(n.props?.className || "").startsWith("conversations")).props.className).includes(
      "phone-detail",
    ),
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
  press(byTestId(tree, "cv-tab-phone"));
  press(byTestId(tree, "cv-tab-all"));
  assert.deepEqual(went, [
    ["nav", "conversations/phone"],
    ["nav", "conversations"],
  ]);
});

test("on a phone a row pressed is an entry of its own: the viewer's Back steps back through it, and the list returns", () => {
  const phone = (tree) =>
    String(find(tree, (n) => String(n.props?.className || "").startsWith("conversations")).props.className);
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
    assert.ok(phone(tree).includes("phone-detail"), "the row is the screen");
    viewerBack(tree)();
    assert.deepEqual(went.at(-1), ["back"], "the viewer's own Back is the same step as the system's");
    // Back lands on the list's address: the viewer closes.
    globalThis.window.location.hash = "#/conversations/phone";
    redraw({ channel: "phone", initialId: null });
    tree = redraw({ channel: "phone", initialId: null });
    assert.ok(!phone(tree).includes("phone-detail"), "the list, not the row");

    // A row the address brought (a link, a cold boot) has no entry of its own: it closes to its list in place.
    fresh();
    globalThis.window.location.hash = "#/conversations/phone:cv-k7";
    tree = ConversationsPage({ channel: "phone", initialId: "cv-k7" });
    tree = redraw({ channel: "phone", initialId: "cv-k7" });
    viewerBack(tree)();
    assert.ok(!went.some((w) => w[0] === "back"), "never a step back out of the page");
    tree = redraw({ channel: "phone", initialId: "cv-k7" });
    assert.ok(!phone(tree).includes("phone-detail"));
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
