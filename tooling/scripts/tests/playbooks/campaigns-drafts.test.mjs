/**
 * Campaigns, the loading standard's D and G: a playbook's act is said when the server takes it, and a composer's
 * words are kept in the tab, come back when it opens again, and are thrown away only after one question.
 *
 * - The send screen's Cancel and a trip to another page lost a name, a typed value and a picked time; a template
 *   half-written, or a translation the assistant had just been paid to write, went with a Cancel. Each is kept per tab (tab-memory.ts) under one rule (record-fold.jsx
 *   useUnsavedWork), the registry holds the tab from closing over it, and Cancel asks once (UnsavedAsk).
 * - Words kept come back as their composer opens again (`campaigns/new`, the sheet Campaigns opens over Sequences,
 *   home/sheets.tsx), on the words. The playbook composer's went with its Every time (the closed-loop audit of 17 Oct
 *   2026, G): a sequence's draft is New sequence's own.
 * Run against the pages and the composers on a stub React, with the tab's memory installed as the app installs it.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again,
  unmount,
  all,
  find,
  byTestId,
  textOf,
  press,
  settle,
} from "../_legacy-react.mjs";

const { toBroadcastVM, stateOf, numberHealth } = contracts;
const TID = "t-studio";
const ZONE = "America/New_York";
const NOW = Date.now();

/* ---------------------------------- the window ---------------------------------- */

const went = [];
const replaced = [];
const toasts = [];
installLegacyReact({
  location: {
    pathname: "/w/studio",
    hash: "#/broadcasts",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
});
const SRC = "../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
// The tab's memory, as the app installs it (surface-cache.ts): the one store every composer keeps its words in.
const { installTabMemory, clearTabMemory } = await import(`${SRC}/legacy-bridge/tab-memory.ts`);
installTabMemory(globalThis);
const TM = globalThis.__tabMemory;
// What the shell still owns and the pages draw by name (Confirm, StatePill, PolicyChip, the sheet, the unsaved-work rule):
// the frame's JSX, loaded as the app loads it. The pages are TSX since decision 0015, and their verbs are imported.
await import(`${SRC}/legacy/components/data-bits.jsx`);
Object.assign(globalThis, {
  useHotkey: () => {},
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to, opts) => (opts && opts.replace ? replaced : went).push(to),
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __surfaceState: () => "live",
  __DEMO_MODE: false,
});
const { BroadcastsPage } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { CampaignsSheets } = await import(`${SRC}/surfaces/campaigns/home/sheets.tsx`);
// The sheets and the Library's pane are chunks of their own (campaigns-code.tsx): fetched here as a reach for a message's
// door fetches them, so every draw below finds them in, as a press after that reach does.
const { warmCampaignsCode } = await import(`${SRC}/surfaces/campaigns/home/campaigns-code.tsx`);
warmCampaignsCode("campaigns/message:any");
await import(`${SRC}/surfaces/campaigns/home/open-sheets.tsx`);
await import(`${SRC}/surfaces/campaigns/parts/message-in-place.tsx`);
await new Promise((r) => setTimeout(r, 0));
const { Field } = await import(`${SRC}/surfaces/kit/field/field.tsx`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { CmSlot } = await import(`${SRC}/surfaces/campaigns/parts/slot.tsx`);
/** One of the composer's choices, the kit's Picker (surfaces/kit/picker/), by its test id. */
const pickerOf = (tree, testid) => find(tree, (n) => n.type === Picker && n.props["data-testid"] === testid);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { TemplateComposer } = await import(`${SRC}/surfaces/campaigns/templates/composer.tsx`);
const { broadcasts } = await import(`${SRC}/surfaces/campaigns/broadcasts/verbs.ts`);
const { templates } = await import(`${SRC}/surfaces/campaigns/templates/verbs.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

/* ---------------------------------- walking a tree ---------------------------------- */

/** Words typed into one of the kit's Fields (surfaces/kit/field/), which says them as its own `onValueChange`. */
const type = (node, value) => node.props.onValueChange(value);
/** A fresh mount, as React mounts a page a person came back to: every cell forgotten, every listener gone. */
const fresh = () => {
  freshTree();
  went.length = 0;
  replaced.length = 0;
  toasts.length = 0;
};
/** The tree drawn again over the same cells, as React draws it after a state change. */
const redraw = (draw) => again(draw);
/** What the tab keeps, whole: every draft in the slot. */
const drafts = () => JSON.parse(globalThis.sessionStorage.getItem("chanlytics.drafts.v1") || "{}");
/** The browser's own question before the tab closes: whether the registry's listener held it. */
const tabClosing = () => {
  const ev = {
    type: "beforeunload",
    returnValue: undefined,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  globalThis.dispatchEvent(ev);
  return ev.prevented;
};

/* ---------------------------------- the surfaces ---------------------------------- */

const D = 24 * 3_600_000;
const iso = (ms) => new Date(NOW + ms).toISOString();
const dto = (over = {}) => ({
  id: "b-sent",
  name: "Win-back · 2026-09-10",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  audience: { kind: "playbook", id: "pb-1", label: "Win-back" },
  state: "sent",
  scheduled_for: iso(-5 * D),
  started_at: iso(-5 * D),
  finished_at: iso(-5 * D + 60_000),
  recipient_count: 3,
  failure: null,
  created_at: iso(-5 * D),
  playbook_id: "pb-1",
  run_for: "2026-09-10",
  counts: { queued: 0, sent: 3, skipped: 0, failed: 0, delivered: 2, read: 1, replied: 1 },
  ...over,
});
const healthyNumber = {
  present: true,
  display: "+1 305-555-0100",
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
};
/** A starter as WhatsApp holds it once approved: the library's words and slots. */
const starterRow = (key, id) => {
  const s = contracts.starterByKey(key);
  const t = contracts.starterText(s, "en_US");
  return {
    id,
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    meta_status: "approved",
    category: s.category,
    purpose: s.category === "utility" ? "conversational" : "marketing",
    source: "starter",
    title: null,
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
  };
};
/** A message written elsewhere, with one slot to type into. */
const ownTemplate = {
  id: "tpl-own",
  channel: "whatsapp",
  name: "autumn_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  purpose: "marketing",
  source: "meta",
  title: "Autumn offer",
  body_preview: "Hi {{1}}, {{2}} this autumn.",
  variables: [
    { position: 1, label: "Name", example: "Dani" },
    { position: 2, label: "Value 2", example: "20% off" },
  ],
};
/** Who each audience reaches, as its own read publishes it (broadcasts/audiences-surface.ts): the composer is made of it too. */
const audiencesSurface = (over = {}) => ({
  audiences: [
    { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 2, conversational: 3 } },
    { kind: "saved", id: "s1", label: "Regulars", counts: { marketing: 1, conversational: 1 } },
  ],
  listsRead: true,
  heardRead: true,
  fetchedAt: 1,
  ...over,
});
const broadcastsSurface = (over = {}) => ({
  templates: [ownTemplate],
  rows: [toBroadcastVM(dto(), ZONE)],
  more: false,
  heldReasons: contracts.HELD_REASONS,
  chunk: contracts.BROADCAST_CHUNK,
  number: healthyNumber,
  optIn: null,
  getYes: contracts.GET_YES_ROUTE,
  scheduleMaxDays: 30,
  businessName: "Northside Studio",
  bookingLink: false,
  ...over,
});
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: iso(-30 * D),
  triggerLabel: "Quiet 30 days",
  triggerHint: "anyone quiet for a month",
  schedule: "daily at 10:00 AM",
  next: "tomorrow 10:00 AM",
  // On, before its last day, its moment one that runs here (contracts campaignRunsOn): Run now is offered.
  runs: true,
  candidates: 4,
  held: 0,
  totals: { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
/** What a moment's count reads as the route answers it: who is on it, and who of them said yes. */
const poolOf = (pool, candidates = pool) => ({
  candidates,
  held: 0,
  pool,
  noYes: 0,
  stopped: 0,
  noNumber: 0,
  saidYes: pool,
});
const playbooksSurface = (over = {}) => ({
  rows: [playbook()],
  pools: { quiet_30: poolOf(4), new_week: poolOf(0), visit_tomorrow: poolOf(3), visited: poolOf(2) },
  templates: [starterRow("winback_offer", "tpl-1")],
  triggers: contracts.PLAYBOOK_TRIGGERS.map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    cls: t.cls,
    list: t.list,
    kind: t.kind,
    // 2 Oct 2026: every moment offered, so a draft may name any (surface.ts says which a new playbook may start from).
    offered: true,
    candidates: 4,
    held: 0,
  })),
  timezone: ZONE,
  calendar: "none",
  // How the business works (the surface's shape, 9 Oct 2026): the words this file pins are the word "visit"'s.
  shape: { calendar: "none", hasDeals: false, word: "visit" },
  number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio",
  bookingLink: true,
  fetchedAt: NOW,
  ...over,
});
// The verbs the pages import, as this test holds them: a run's report by no clock, a read that finds nothing, a send the
// server takes. The words (failureWords, noNumberWords, saidYesWords) are the verbs' own, over contracts.
broadcasts.report = (d) =>
  contracts.toRunReportVM(d, { windowMs: contracts.REPLY_WINDOW_MS, nowMs: Date.now(), clock: () => null });
broadcasts.detail = async () => ({ ok: false, code: "not_found", status: 404, message: "Broadcast not found." });
broadcasts.send = async () => ({
  ok: true,
  data: { id: "b-new", name: "Autumn", recipient_count: 2, scheduled_for: iso(0), moved_from: null },
});

const page = (props = { initialSegment: null, initialRun: null }) => BroadcastsPage(props);
/**
 * The send screen, opened as the page still opens it: a link that names a list is asking to write to it. The Sent room's own New
 * message is the home's address (campaigns/new, which hosts this same screen in a sheet), so the page opens nothing for it. Two
 * draws: the first moves the page onto the link, the second draws the screen it opened (a mount opens on it at once).
 */
const openByLink = () => {
  redraw(() => page({ initialSegment: "no-such-list", initialRun: null }));
  return redraw(page);
};
/** The slots of the send's message that are typed, in their order: the bubble's controls (parts/slot.tsx), where the table's boxes were. */
const typedSlots = (tree) => all(tree, (n) => n.type === CmSlot).filter((s) => s.props.kind === "text");
/** The send's name box, by its name: the Name row's Field (the kit's, by its aria-label). */
const nameBox = (tree) => find(tree, (n) => n.type === Field && n.props?.["aria-label"] === "Name this broadcast");
/** Campaigns' sheets at an address's param (null: none open), as the route draws them over Sequences. */
const home = (param = null) => CampaignsSheets({ param });
const messagesPage = () => {
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: "Northside Studio" } } },
    templatesAll: [],
    messages: [],
  });
  // A WhatsApp number, as the channels read holds it (surfaces/channels/surface.ts).
  setSurfaceValue("channels", { rows: [{ kind: "whatsapp" }] });
  return TemplatesPage();
};

beforeEach(() => {
  unmount();
  fresh();
  clearTabMemory();
  globalThis.__recordFolds.reset();
  setSurfaceValue("broadcasts", broadcastsSurface());
  setSurfaceValue("audiences", audiencesSurface());
  setSurfaceValue("playbooks", playbooksSurface());
});

/* ---------------------------------- D: an act is said when the server takes it ---------------------------------- */

/* ---------------------------------- G: the send screen ---------------------------------- */

test("the send screen keeps its words -- a name, a typed value, a picked time -- and opens again on them; a list or a message chosen alone keeps nothing; Cancel asks once and Yes clears it", () => {
  let tree = openByLink();
  assert.ok(byTestId(tree, "bc-composer"));
  // The list and the message are choices, not words: chosen, nothing is kept and Cancel closes at once.
  pickerOf(tree, "bc-audience").props.onValueChange("saved:s1");
  tree = redraw(page);
  assert.deepEqual(drafts(), {}, "a choice alone is not work");
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  assert.equal(byTestId(tree, "bc-composer"), null, "Cancel closes it, as it did");

  tree = openByLink();
  typedSlots(tree)[0].props.onTyped("20% off colour");
  tree = redraw(page);
  type(nameBox(tree), "Autumn colour");
  tree = redraw(page);
  // A picked time is work too: the day and the time, kept as the instant the pair names.
  pickerOf(tree, "bc-when-mode").props.onValueChange("later");
  tree = redraw(page);
  const kept = TM.draft("broadcast");
  assert.equal(kept.name, "Autumn colour");
  assert.ok(typeof kept.whenAt === "number" && kept.whenAt > Date.now(), "the time picked, as an instant ahead");
  assert.deepEqual(
    kept.params["tpl-own"],
    [null, "20% off colour"],
    "the value typed into the second slot (the first is each person's own name)",
  );
  assert.equal(kept.aud, "saved:s1", "and the list it was for");
  assert.equal(tabClosing(), true, "the tab asks before closing over it");

  // Cancel with words asks -- in the pane's foot, where the send's acts were (the pane's Close stays at its head, as the
  // layout is the Inbox's list + pane, docs/2026-10-02-campaigns-on-the-kit.md §3.1); Keep editing puts them back.
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-composer"), "not closed");
  assert.ok(byTestId(tree, "bc-leave-confirm"), "asked");
  assert.equal(byTestId(tree, "bc-send"), null, "the question stands alone in the foot");
  press(byTestId(tree, "bc-leave-no"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-compose-close"));
  assert.ok(byTestId(tree, "bc-schedule"), "and the send's one act is back: Schedule, since a time is picked");
  assert.equal(typedSlots(tree)[0].props.typed, "20% off colour");

  // Left and come back to: the send screen, on the same list, with the same words.
  unmount();
  tree = page();
  assert.ok(byTestId(tree, "bc-composer"), "opens on the send half-written");
  assert.equal(nameBox(tree).props.value, "Autumn colour");
  assert.equal(typedSlots(tree)[0].props.typed, "20% off colour");
  assert.equal(pickerOf(tree, "bc-audience").props.value, "saved:s1", "on Regulars, the list it was for");
  assert.equal(pickerOf(tree, "bc-when-mode").props.value, "later", "and the time that was picked");
  assert.equal(
    pickerOf(tree, "bc-when-time").props.value,
    globalThis.__clock.inputValue(kept.whenAt).split("T")[1],
    "at the hour it was",
  );
  // A link that names a list wins the list.
  unmount();
  tree = page({ initialSegment: "s1", initialRun: null });
  assert.ok(byTestId(tree, "bc-composer"));
  unmount();
  tree = page();

  // Yes, throw it away: closed, cleared, and nothing kept -- the next send opens empty.
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  press(byTestId(tree, "bc-leave-yes"));
  tree = redraw(page);
  assert.equal(byTestId(tree, "bc-composer"), null);
  assert.equal(TM.draft("broadcast"), null);
  tree = openByLink();
  assert.equal(nameBox(tree).props.value, "", "REGRESSION: the last send's words stayed in the page after a Cancel");
  assert.equal(typedSlots(tree)[0].props.typed, "");
  assert.equal(pickerOf(tree, "bc-when-mode").props.value, "now", "and no time picked");
});

test("a send the server took keeps nothing: the screen closes onto the ledger and the next send is empty", async () => {
  let tree = openByLink();
  typedSlots(tree)[0].props.onTyped("20% off colour");
  tree = redraw(page);
  assert.ok(TM.draft("broadcast"));
  press(byTestId(tree, "bc-send"));
  tree = redraw(page);
  await press(byTestId(tree, "bc-send-yes"));
  tree = redraw(page);
  assert.equal(byTestId(tree, "bc-composer"), null, "sent, the screen closes");
  assert.equal(TM.draft("broadcast"), null, "and nothing is kept");
  tree = openByLink();
  assert.equal(typedSlots(tree)[0].props.typed, "", "the next one starts empty");
});

test("a send made in Campaigns' sheet raises its toast on the sheets' own host: the screen draws none of its own, so the toast and its Stop outlive the sheet that closes over it", async () => {
  const keepToast = globalThis.usePPToast;
  const keepSend = broadcasts.send;
  const keepCancel = broadcasts.cancel;
  // One host to each component that asks for one, told apart by the node it would draw: the home's, asked for first, and the
  // send screen's own (which, drawn, would go with the sheet the moment the send closes it).
  const hosts = [];
  globalThis.usePPToast = () => {
    const ref = globalThis.React.useRef(null);
    if (!ref.current) {
      ref.current = { node: `HOST-${hosts.length}`, said: [] };
      hosts.push(ref.current);
    }
    const host = ref.current;
    return [host.node, (t) => host.said.push(t)];
  };
  const stopped = [];
  broadcasts.send = async () => ({
    ok: true,
    data: { id: "b-new", name: "Autumn", recipient_count: 2, scheduled_for: iso(0), moved_from: null },
  });
  broadcasts.cancel = async (id, opts) => {
    stopped.push(id);
    const data = { was: "sending" };
    if (opts && opts.onAccepted) opts.onAccepted(data);
    return { ok: true, data };
  };
  try {
    unmount();
    fresh();
    const draw = () => redraw(() => home("new"));
    let tree = draw();
    const [page] = hosts;
    assert.ok(textOf(tree).includes(page.node), "the sheets draw their toast host");
    for (const own of hosts.slice(1))
      assert.ok(!textOf(tree).includes(own.node), "the send screen draws none of its own");
    typedSlots(tree)[0].props.onTyped("20% off colour");
    tree = draw();
    press(byTestId(tree, "bc-send"));
    tree = draw();
    await press(byTestId(tree, "bc-send-yes"));
    // The toast is said on the sheets' host, with its Stop and its See who; the screen's own host was never asked.
    const said = page.said.at(-1);
    assert.equal(said.action.label, "Stop it");
    assert.equal(said.links[0].to, "broadcasts/run:b-new");
    assert.match(textOf(said.msg), /Autumn/);
    assert.deepEqual(
      hosts.slice(1).flatMap((h) => h.said),
      [],
      "nothing was said on a host that would go with the sheet",
    );
    // The sheet closes onto Sequences and the screen goes with it; the toast is the sheets', and its Stop still stops the send.
    unmount();
    await said.action.onClick();
    assert.deepEqual(stopped, ["b-new"], "Stop it, after the sheet is gone");
    assert.match(textOf(page.said.at(-1).msg), /stops after this batch/, "and says so on the same host");
  } finally {
    globalThis.usePPToast = keepToast;
    broadcasts.send = keepSend;
    broadcasts.cancel = keepCancel;
  }
});

test("the send screen's door to their yes, pressed in Campaigns' sheet, replaces the sheet's address with the section's: the sheet is not closed past it, which a step Back would undo", () => {
  const backs = [];
  const keep = globalThis.history.back;
  globalThis.history.back = () => backs.push("back");
  try {
    setSurfaceValue(
      "audiences",
      audiencesSurface({
        audiences: [
          { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 0, conversational: 0 } },
        ],
      }),
    );
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        optIn: {
          phrase: "YES OFFERS",
          phraseEs: "SI OFERTAS",
          link: "https://wa.me/13055550100?text=YES%20OFFERS",
          qrPath: "/api/v1/consent/qr",
          pageUrl: null,
        },
      }),
    );
    unmount();
    fresh();
    // Send once's screen says nobody on the list has said yes, with the door to get it.
    const tree = redraw(() => home("new"));
    press(byTestId(tree, "bc-nobody-door"));
    assert.deepEqual(replaced, ["broadcasts/get-yes"], "the sheet's address becomes the section: one move");
    // The screen has been left, and the host was not told it was done: a close now would go Back over the move.
    redraw(() => home("new"));
    redraw(() => home("new"));
    assert.deepEqual(backs, [], "no step Back after the door");
    assert.deepEqual(replaced, ["broadcasts/get-yes"], "and the address was not replaced with Sequences either");
    assert.deepEqual(went, []);
  } finally {
    globalThis.history.back = keep;
  }
});

/* ---------------------------------- G: the template composer ---------------------------------- */

test("a template half-written is kept, comes back with the page, and Close asks once; a translation the assistant wrote is kept too, and is not written again", async () => {
  const keep = { ...templates };
  const drafted = [];
  Object.assign(templates, {
    draft: async (body) => {
      drafted.push(body);
      return {
        ok: true,
        data: {
          draft: {
            name: "autumn_offer",
            body: "Hola {{1}}, {{2}} este otoño.",
            footer: "",
            examples: ["Dani", "20%"],
            variables: [{ label: "Name" }, { label: "Offer" }],
            warnings: [],
          },
        },
      };
    },
    create: async (b) => ({ ok: true, data: { name: b.name } }),
  });
  try {
    // New, drawn on its own.
    let closed = 0;
    const composeNew = () =>
      TemplateComposer({
        businessName: "Northside Studio",
        onDone() {},
        onCancel() {
          closed += 1;
        },
      });
    let tree = composeNew();
    type(byTestId(tree, "tpl-body"), "Hi {{1}}, 20% off any colour service this week.");
    tree = redraw(composeNew);
    assert.equal(
      TM.draft("template", "new").body,
      "Hi {{1}}, 20% off any colour service this week.",
      "kept as it is typed",
    );
    press(byTestId(tree, "tpl-close"));
    tree = redraw(composeNew);
    assert.equal(closed, 0, "not closed");
    assert.ok(byTestId(tree, "tpl-leave-confirm"), "Close with words asks");
    assert.equal(byTestId(tree, "tpl-submit"), null, "where the submit was");
    press(byTestId(tree, "tpl-leave-no"));
    tree = redraw(composeNew);
    assert.ok(byTestId(tree, "tpl-submit"));
    // Campaigns > Templates, come back to: the composer is open, on the words.
    unmount();
    tree = messagesPage();
    assert.ok(byTestId(tree, "messages-composer"), "come back to, the composer is open");
    assert.equal(
      byTestId(tree, "tpl-body").props.value,
      "Hi {{1}}, 20% off any colour service this week.",
      "on the words",
    );
    // Submitted and taken: nothing kept.
    unmount();
    tree = composeNew();
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hi {{1}}, 20% off any colour service this week.");
    type(byTestId(tree, "tpl-name"), "autumn_colour");
    tree = redraw(composeNew);
    const ex = find(tree, (n) => n.type === Field && n.props?.placeholder === "Ana");
    type(ex, "Dani");
    tree = redraw(composeNew);
    await press(byTestId(tree, "tpl-submit"));
    assert.equal(TM.draft("template", "new"), null, "submitted and taken: nothing kept");
    unmount();
    tree = messagesPage();
    assert.equal(byTestId(tree, "messages-composer"), null, "and Templates opens on its rows");

    // A translation: written once by the assistant, kept under the message and its language, and never paid for twice.
    fresh();
    const translate = { ref: "tpl-own", from: "en_US", name: "autumn_offer", language: "es", title: "Autumn offer" };
    const compose = () => TemplateComposer({ businessName: "Northside Studio", translate, onDone() {}, onCancel() {} });
    tree = compose();
    await settle();
    assert.equal(drafted.length, 1, "written once");
    tree = redraw(compose);
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hola {{1}}, {{2}} este otoño.");
    assert.equal(
      TM.draft("template", "autumn_offer|es").body,
      "Hola {{1}}, {{2}} este otoño.",
      "the assistant's words are work too",
    );
    unmount();
    tree = compose();
    await settle();
    assert.equal(
      drafted.length,
      1,
      "REGRESSION: opened again, it was drafted again -- and the assistant is paid per draft",
    );
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hola {{1}}, {{2}} este otoño.", "the words it had");
    press(byTestId(tree, "tpl-cancel"));
    tree = redraw(compose);
    assert.ok(byTestId(tree, "tpl-leave-confirm"), "Cancel asks");
    press(byTestId(tree, "tpl-leave-yes"));
    assert.equal(TM.draft("template", "autumn_offer|es"), null, "thrown away");
  } finally {
    Object.assign(templates, keep);
  }
});

test("a template composer drawn where there is no number to write to says so in place of its rows, and its submit stays shut over words the tab kept", () => {
  const compose = (over = {}) =>
    TemplateComposer({ pane: true, businessName: "Northside Studio", onDone() {}, onCancel() {}, ...over });
  // Words kept in the tab from a composer that had a number, as a person typed them.
  let tree = TemplateComposer({ businessName: "Northside Studio", onDone() {}, onCancel() {} });
  type(byTestId(tree, "tpl-body"), "Hi {{1}}, 20% off any colour service this week.");
  type(byTestId(tree, "tpl-name"), "autumn_colour");
  tree = redraw(() => TemplateComposer({ businessName: "Northside Studio", onDone() {}, onCancel() {} }));
  type(
    find(tree, (n) => n.type === Field && n.props?.placeholder === "Ana"),
    "Dani",
  );
  redraw(() => TemplateComposer({ businessName: "Northside Studio", onDone() {}, onCancel() {} }));
  unmount();
  // With a number the same words are ready to submit.
  tree = compose();
  assert.equal(byTestId(tree, "tpl-submit").props.disabled, false, "the words the tab kept are a template to submit");
  assert.equal(byTestId(tree, "tpl-no-number"), null);
  // Without one the composer says why, once, where its rows were, and submits nothing.
  unmount();
  const why = "Connect a WhatsApp number first — templates belong to a number's account.";
  tree = compose({ numberWhy: why });
  assert.ok(textOf(byTestId(tree, "tpl-no-number")).startsWith(why));
  assert.equal(byTestId(tree, "tpl-composer"), null, "none of its rows");
  assert.equal(byTestId(tree, "tpl-submit").props.disabled, true, "shut over words that would otherwise be ready");
});

test("the registry's hold: a composer's words hold the tab and the rail, as an open fold's do, and never stand between two folds", () => {
  const folds = globalThis.__recordFolds;
  assert.equal(tabClosing(), false);
  let words = true;
  const release = folds.hold("send", () => words);
  assert.equal(tabClosing(), true, "the tab asks");
  assert.equal(globalThis.__settingsUnsaved(), true, "the rail asks");
  words = false;
  assert.equal(tabClosing(), false, "read at the moment it asks");
  words = true;
  // A fold asked for while a composer holds opens at once: the hold is not a fold's unsaved changes.
  assert.equal(folds.request("hours", { dirty: () => false }), true);
  assert.equal(
    folds.request("services", { dirty: () => false }),
    true,
    "a clean fold gives way whatever a composer holds",
  );
  release();
  assert.equal(tabClosing(), false, "released, it holds nothing");
  release();
  folds.reset();
});
