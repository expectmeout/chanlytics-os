/**
 * Conversations' rows are picked for an act over several, as the Inbox's are, by the same parts (pages/pick.tsx).
 *
 * Seen on production, 7 Oct 2026: Needs you drew a box over a row's face as a pointer reached it, a select-all beside
 * the search and a bar of acts over what was picked; Conversations, the tab beside it, drew the same people as plain
 * buttons with none of it (Ruben). The pick had been written inside the Inbox's list. It is one module now, and the bar
 * offers what applies to the rows picked: the reader's own mark where a person is behind one, Snooze and Archive where
 * a thread is.
 *
 * Run against the page (surfaces/inbox/pages/conversations-page.tsx) on a stub React, over rows made by the contracts'
 * view models, with a fake wire under the courier and the shell's own toast.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { toConversationVM, toCallVM, stateOf } from "@chanlytics/contracts";
import { legacyAddress } from "../../shell/address/_address.mjs";
import { installLegacyReact, fresh as freshTree, again, all, find, textOf, settle } from "../../_legacy-react.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");

/* ---------------------------------- the window ---------------------------------- */

const went = [];
installLegacyReact({
  history: { replaceState() {}, back: () => went.push(["back"]) },
  setInterval: () => 1,
  clearInterval() {},
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  __chrome: { state: stateOf },
  appNavigate: (to, opts) => went.push(["app", to, opts || null]),
});
Object.assign(globalThis, {
  location: { pathname: "/w/marisas", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  __WORKSPACES: [{ id: "t1", slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
  CHANLY: {
    nav: (to) => went.push(["nav", to]),
    address: await legacyAddress(),
    R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` },
  },
});
globalThis.document.visibilityState = "hidden";
// The shell's own toast and role gate, which the page draws through the bridge (surfaces/legacy-verbs.ts).
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");

const S = "../../../../../apps/dashboard/src";
const { ConversationsPage } = await import(`${S}/surfaces/inbox/pages/conversations-page.tsx`);
const { cvPicked, cvWhose } = await import(`${S}/surfaces/inbox/cv-rules.ts`);
const { pickMark } = await import(`${S}/surfaces/inbox/pages/pick.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { AFTER } = await import(`${S}/legacy-bridge/refresh-map.ts`);
const { installTabMemory, clearTabMemory } = await import(`${S}/legacy-bridge/tab-memory.ts`);
installTabMemory(globalThis.window);

/* ---------------------------------- the wire ---------------------------------- */

/** Every ask the page made: a thread's verb, or a person's mark with which way it went. */
const asked = [];
/** What the wire refuses, by conversation: the sentence it answers with. */
const refuses = new Map();
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const wire = async (url, init = {}) => {
  const path = new URL(String(url), "https://app.chanlytics.com").pathname;
  const verb = /\/conversations\/([^/]+)\/(snooze|wake|archive)$/.exec(path);
  if (verb) {
    asked.push([verb[2], verb[1]]);
    if (refuses.has(verb[1]))
      return json(409, { ok: false, error: { code: "conflict", message: refuses.get(verb[1]) } });
    return json(200, { ok: true, data: { conversation: { id: verb[1], state: "open" } } });
  }
  const mark = /\/contacts\/([^/]+)\/seen$/.exec(path);
  if (mark && init.method === "PUT") {
    asked.push(["seen", mark[1], JSON.parse(String(init.body)).seen]);
    return json(200, { ok: true, data: { contact_id: mark[1], marked_at: new Date().toISOString() } });
  }
  return json(404, { ok: false, error: { code: "not_found", message: "not read here" } });
};
globalThis.fetch = wire;
globalThis.window.fetch = wire;
// The courier reads the surfaces again by the table's row for its verb: answered here by no surface.
for (const row of ["POST conversations/[id]/snooze", "POST conversations/[id]/wake", "POST conversations/[id]/archive"])
  AFTER[row] = () => [];
// The toast's own clock does not run here.
globalThis.setTimeout = Object.assign(() => 1, { real: globalThis.setTimeout });
const realTimeout = globalThis.setTimeout.real;
globalThis.clearTimeout = () => {};
const wait = async (until) => {
  for (let i = 0; i < 400 && !until(); i += 1) {
    await settle();
    await new Promise((r) => realTimeout(r, 2));
  }
};

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
const conv = (id, name, over = {}) => ({
  id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: "2026-09-14T13:00:00Z",
  last_inbound_at: "2026-09-14T13:00:00Z",
  last_message_at: "2026-09-14T13:00:00Z",
  contact: {
    id: `k-${id}`,
    display_name: name,
    wa_profile_name: null,
    phone_e164: "+13475550101",
    consent: "opted_in",
    dnc: false,
  },
  messages: [msg({ id: `m-${id}` })],
  ...over,
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
      started_at: "2026-09-14T12:00:00Z",
      ended_at: "2026-09-14T12:03:10Z",
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
// Rosa wrote after the reader last looked: new to them. Nina they have read. Emily only ever phoned.
const rosa = toConversationVM(conv("c1", "Rosa Díaz", { seen_at: "2026-09-14T12:00:00Z" }), null, ZONE, NOW);
const nina = toConversationVM(conv("c2", "Nina Park", { seen_at: "2026-09-14T13:30:00Z" }), null, ZONE, NOW);
const emily = call("k7", "Emily Chen");
// A caller who withheld their number: nobody the workspace knows, and no thread holds the call.
const nobody = call("k9", "Unknown caller", { conversation_id: null, contact_id: null, contact: null });

beforeEach(() => {
  freshTree();
  clearTabMemory();
  went.length = 0;
  asked.length = 0;
  refuses.clear();
  setSurfaceValue("inbox", { THREADS: [], CHANNEL_LABELS: { whatsapp: "WhatsApp", phone: "Phone" } });
  setSurfaceValue("conversations", {
    CONVERSATIONS: [rosa, nina, emily, nobody],
    CV_CHANNELS: [
      { id: "all", label: "All" },
      { id: "whatsapp", label: "WhatsApp" },
      { id: "phone", label: "Phone" },
    ],
    CALLS_READ: true,
  });
});

/* ---------------------------------- walking a tree ---------------------------------- */

let tree;
const draw = (props = { channel: "all", initialId: null }) => (tree = again(() => ConversationsPage(props)));
const rows = () => all(tree, (n) => String(n.props?.className || "").startsWith("cv-row "));
const rowOf = (name) => rows().find((r) => textOf(r).includes(name));
const boxOf = (row) => find(row, (n) => n.type === "input" && n.props?.type === "checkbox");
/** The row of the caller nobody knows: the one that wears no box. */
const strangers = () => rows().filter((r) => !boxOf(r));
const pick = (name) => {
  boxOf(rowOf(name)).props.onChange({ stopPropagation() {} });
  draw();
};
const picked = () =>
  rows()
    .filter((r) => r.props["aria-selected"])
    .map((r) => textOf(find(r, (n) => n.props?.className === "cv-row-who")));
const bar = () => find(tree, (n) => n.type === "div" && n.props?.["data-testid"] === "pick-bar");
const act = (id) => find(tree, (n) => n.type === "button" && n.props?.["data-testid"] === id);
const press = (id) => act(id).props.onClick({ stopPropagation() {}, preventDefault() {} });
const selectAll = () =>
  find(tree, (n) => n.type === "input" && /^(Select all|Clear the selection)/.test(n.props?.["aria-label"] || ""));
const toasts = () =>
  all(draw(), (n) => typeof n.props?.className === "string" && n.props.className.startsWith("pp-toast ")).map(textOf);
const key = (row, k) =>
  row.props.onKeyDown({
    key: k,
    preventDefault() {},
    stopPropagation() {},
    target: { tagName: "DIV" },
    currentTarget: { parentNode: { querySelector: () => null } },
  });

/* ---------------------------------- the rule ---------------------------------- */

test("a row is picked by whose it is: the thread an act goes to, the person a mark is on -- and a row with neither is nobody's to pick", () => {
  const said = { unread: true, archived: () => false };
  assert.deepEqual(
    cvPicked(rosa, said),
    {
      id: "p:k-c1",
      who: "Rosa Díaz",
      conversationId: "c1",
      personId: "k-c1",
      unread: true,
      reading: { unseen: true, heardAtMs: Date.parse("2026-09-14T13:00:00Z"), markAtMs: 0 },
      snoozed: false,
      archived: false,
    },
    "held by the person, so a read that gives them a newer row keeps them picked",
  );
  assert.equal(cvPicked(emily, said).conversationId, "cv-k7", "a person who only phoned: the thread their call is in");
  assert.equal(cvPicked(nobody, said), null, "REGRESSION guard: a caller nobody knows wears no box");
  assert.equal(cvPicked(rosa, { unread: false, archived: (id) => id === "c1" }).archived, true);
  assert.equal(cvWhose(nobody), `r:${nobody.id}`);
});

test("the mark the bar offers: read while anyone picked is new to the reader, else unread -- and nobody to mark, none", () => {
  const a = { personId: "p1", unread: true };
  const b = { personId: "p2", unread: false };
  const c = { personId: null, unread: true };
  assert.deepEqual(pickMark([a, b, c]), { seen: true, whom: [a] }, "the unread among them are marked read");
  assert.deepEqual(pickMark([b]), { seen: false, whom: [b] });
  assert.equal(pickMark([c]), null, "a row with nobody behind it has no one to mark");
});

/* ---------------------------------- the page ---------------------------------- */

test("REGRESSION (7 Oct 2026): a Conversations row wears the Inbox's box, and picking one draws the select-all and the bar of acts", () => {
  draw();
  assert.equal(rows().length, 4);
  for (const name of ["Rosa", "Nina", "Emily"]) {
    const row = rowOf(name);
    assert.ok(boxOf(row), `${name}'s row can be picked: Conversations drew no box at all`);
    assert.equal(boxOf(row).props.className, "ix-thread-check", "the Inbox's own box");
    assert.equal(row.props.role, "option", "an option of the list, as the Inbox's row is");
  }
  assert.equal(strangers().length, 1, "nothing a pick does applies to a caller nobody knows: their row wears none");
  assert.equal(strangers()[0].props["aria-selected"], undefined, "and says neither selected nor not");
  assert.equal(rowOf("Rosa").props["aria-selected"], false, "where a row that can be picked says it is not, yet");
  assert.equal(bar(), null, "no bar until something is picked");

  pick("Rosa");
  assert.deepEqual(picked(), ["Rosa Díaz"]);
  assert.match(textOf(bar()), /^1 selected/);
  assert.equal(textOf(act("pick-mark")), "Mark as read", "she is new to the reader");
  assert.ok(act("pick-snooze") && act("pick-archive"), "her thread can be snoozed and archived");
  assert.equal(act("pick-clear").props["aria-label"], "Clear the selection");
  assert.match(
    String(find(tree, (n) => String(n.props?.className || "").startsWith("cv-list")).props.className),
    /picking/,
    "the list says a pick is under way: its select-all shows",
  );

  // The select-all picks every row that can be picked, and lets them all go again.
  selectAll().props.onChange();
  draw();
  assert.deepEqual(picked(), ["Rosa Díaz", "Nina Park", "Emily Chen"]);
  assert.match(textOf(bar()), /^3 selected/);
  assert.equal(selectAll().props.checked, true);
  selectAll().props.onChange();
  draw();
  assert.deepEqual(picked(), []);
  assert.equal(bar(), null);

  // Someone read already: the mark offered is the other way.
  pick("Nina");
  assert.equal(textOf(act("pick-mark")), "Mark as unread");
  press("pick-clear");
  draw();
  assert.equal(bar(), null, "the bar's ✕ lets the pick go");
});

test("the rows take the Inbox's keys: Space picks a row, Enter opens it, and Space on a row nobody can pick does nothing", () => {
  draw();
  key(rowOf("Nina"), " ");
  draw();
  assert.deepEqual(picked(), ["Nina Park"]);
  key(strangers()[0], " ");
  draw();
  assert.deepEqual(picked(), ["Nina Park"]);
  key(rowOf("Nina"), "Enter");
  assert.deepEqual(went.at(-1), ["app", "conversations/c2", { replace: true }]);
  assert.deepEqual(
    rows().map((r) => r.props.tabIndex),
    [0, -1, -1, -1],
    "one tab stop, on the open row",
  );
});

test("a pick ends with its tab, and lasts through a search", () => {
  draw();
  pick("Rosa");
  const box = find(tree, (n) => n.type === "input" && String(n.props?.placeholder || "").startsWith("Search names"));
  box.props.onChange({ target: { value: "Nina" } });
  draw();
  assert.match(textOf(bar()), /^1 selected/, "Rosa is still picked though the search hides her row");
  draw({ channel: "phone", initialId: null });
  draw({ channel: "phone", initialId: null });
  assert.equal(bar(), null, "another tab is another list");
});

test("Mark as read marks each person picked who is new to the reader, once, says so in one toast with its Undo, and lets the pick go", async () => {
  draw();
  pick("Rosa");
  pick("Nina");
  assert.equal(textOf(act("pick-mark")), "Mark as read");
  press("pick-mark");
  await wait(() => asked.length >= 1);
  assert.deepEqual(asked.splice(0), [["seen", "k-c1", true]], "Rosa alone: Nina was read already");
  const said = toasts();
  assert.equal(bar(), null, "the pick is let go");
  assert.equal(said.length, 1);
  assert.match(said[0], /Rosa Díaz marked as read/);
  assert.equal(String(rowOf("Rosa").props.className).includes("unread"), false, "her row reads as read at once");
  // Undo is the same door the other way.
  find(tree, (n) => n.type === "button" && textOf(n).trim() === "Undo").props.onClick();
  await wait(() => asked.length >= 1);
  assert.deepEqual(asked.splice(0), [["seen", "k-c1", false]]);
  draw();
  assert.ok(String(rowOf("Rosa").props.className).includes("unread"), "and she is new to the reader again");
});

test("Snooze over a pick is one act: one ask per thread, one toast with the count and each refusal named, the refused left picked", async () => {
  refuses.set("c2", "That conversation changed; read it again.");
  draw();
  pick("Rosa");
  pick("Nina");
  press("pick-snooze");
  await wait(() => asked.length >= 2 && !!toasts().length);
  assert.deepEqual(asked.splice(0), [
    ["snooze", "c1"],
    ["snooze", "c2"],
  ]);
  const said = toasts();
  assert.equal(said.length, 1, "one toast for the act");
  assert.match(said[0], /1 of 2 snoozed/);
  assert.match(said[0], /Nina Park: That conversation changed; read it again\./);
  assert.deepEqual(picked(), ["Nina Park"], "the refused stays picked, to try again");
});

test("Archive over a pick asks first, about the threads behind it, and then archives each once", async () => {
  draw();
  pick("Rosa");
  press("pick-archive");
  draw();
  assert.deepEqual(asked, [], "nothing is archived before the question is answered");
  const ask = find(tree, (n) => n.props?.["data-testid"] === "ix-bulk-archive-confirm");
  assert.match(textOf(ask), /Archive Rosa Díaz's conversation\?/);
  find(tree, (n) => n.type === "button" && n.props?.["data-testid"] === "ix-bulk-archive-yes").props.onClick();
  await wait(() => asked.length >= 1 && !!toasts().length);
  assert.deepEqual(asked.splice(0), [["archive", "c1"]]);
  assert.match(toasts()[0], /1 archived/);
  assert.equal(bar(), null);
});
