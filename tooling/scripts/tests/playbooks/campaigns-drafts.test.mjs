/**
 * Campaigns, the loading standard's D and G: a playbook's act is said when the server takes it, and a composer's
 * words are kept in the tab, come back when it opens again, and are thrown away only after one question.
 *
 * - A playbook's Pause, Run now, Approve, Skip and Delete (the pane the home opens it in, PlaybookPane) waited for the
 *   write AND the refresh map's re-read of the playbooks and the broadcasts (the second reads every contact page) before
 *   saying anything. They say it from the server's answer (`onAccepted`), and the pane's buttons wait for the re-read: a
 *   Run now pressed twice before the first run's rows had landed would be two runs.
 * - The playbook composer's Escape dropped everything typed; the send screen's Cancel and a trip to another page lost a
 *   name, a typed value and a picked time; a template half-written, or a translation the assistant had just been paid
 *   to write, went with a Cancel. Each is kept per tab (tab-memory.ts) under one rule (record-fold.jsx
 *   useUnsavedWork), the registry holds the tab from closing over it, and Cancel asks once (UnsavedAsk).
 * - Words kept come back as the page does: Campaigns' home reopens a half-written send, playbook or change to a playbook
 *   by replacing its address (`campaigns/new`, `new:every`, `new:edit:<id>`, use-home.ts useReopenDrafts), and the
 *   composer it lands on opens on the words.
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
const { CampaignsHome } = await import(`${SRC}/surfaces/campaigns/home/home-page.tsx`);
const { PlaybookPane } = await import(`${SRC}/surfaces/campaigns/playbooks/card-detail.tsx`);
const { Menu } = await import(`${SRC}/surfaces/kit/menu/menu.tsx`);
const { Field } = await import(`${SRC}/surfaces/kit/field/field.tsx`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { CmSlot } = await import(`${SRC}/surfaces/campaigns/parts/slot.tsx`);
/** One of the composer's choices, the kit's Picker (surfaces/kit/picker/), by its test id. */
const pickerOf = (tree, testid) => find(tree, (n) => n.type === Picker && n.props["data-testid"] === testid);
/** What a picker's token says: the page's face, else the one chosen, else what it says with none. */
const faceOf = (tree, testid) => {
  const p = pickerOf(tree, testid);
  const one = p.props.groups.flatMap((g) => g.options).find((o) => o.value === p.props.value);
  return textOf(p.props.face ?? (one ? one.label : (p.props.placeholder ?? "")));
};
/** The kit menu's item by its words (the ⋯ beside Pause and Edit, where Run now and Delete live): what a press does. */
const moreItem = (tree, label) => {
  const menu = find(tree, (n) => n.type === Menu);
  const item = menu && menu.props.groups.flatMap((g) => g.items || []).find((i) => i.label === label);
  assert.ok(item, `the ⋯ menu offers ${label}`);
  return item;
};
const { PlaybookComposer } = await import(`${SRC}/surfaces/campaigns/playbooks/composer.tsx`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { TemplateComposer } = await import(`${SRC}/surfaces/campaigns/templates/composer.tsx`);
const { broadcasts } = await import(`${SRC}/surfaces/campaigns/broadcasts/verbs.ts`);
const { playbooks } = await import(`${SRC}/surfaces/campaigns/playbooks/verbs.ts`);
const { templates } = await import(`${SRC}/surfaces/campaigns/templates/verbs.ts`);
const { setSurfaceValue, surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

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
const broadcastsSurface = (over = {}) => ({
  audiences: [
    { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 2, conversational: 3 } },
    { kind: "saved", id: "s1", label: "Regulars", counts: { marketing: 1, conversational: 1 } },
  ],
  templates: [ownTemplate],
  rows: [toBroadcastVM(dto(), ZONE)],
  more: false,
  heldReasons: contracts.HELD_REASONS,
  chunk: contracts.BROADCAST_CHUNK,
  number: healthyNumber,
  optIn: null,
  getYes: contracts.GET_YES_ROUTE,
  listsRead: true,
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
  schedule: "daily at 10:00",
  next: "tomorrow 10:00",
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
/** The send's name box, by its own words: the foot's Field (the kit's, by its placeholder). */
const nameBox = (tree) =>
  find(tree, (n) => n.type === Field && String(n.props?.placeholder || "").startsWith("Name this broadcast"));
/** Campaigns' home at an address's param (null: the home itself), as the route draws it. */
const home = (param = null) => CampaignsHome({ param, nowMs: NOW });
/** What the composer was told: the sheet closes on Cancel and on a thrown-away draft, and says what it saved on a Save. */
const closed = [];
const saved = [];
/** The playbook composer drawn on its own, as the home's sheet draws it: a new playbook, or the one being changed. */
const composer = (over = {}) =>
  PlaybookComposer({
    data: surfaceValue("playbooks"),
    editing: null,
    initialTrigger: null,
    onDone: (d, changed) => saved.push([d, changed]),
    onCancel: () => closed.push("cancel"),
    ...over,
  });
const messagesPage = () => {
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: "Northside Studio" } } },
    channels: [{ kind: "whatsapp" }],
    templatesAll: [],
  });
  return TemplatesPage();
};

beforeEach(() => {
  unmount();
  fresh();
  closed.length = 0;
  saved.length = 0;
  clearTabMemory();
  globalThis.__recordFolds.reset();
  setSurfaceValue("broadcasts", broadcastsSurface());
  setSurfaceValue("playbooks", playbooksSurface());
});

/* ---------------------------------- D: an act is said when the server takes it ---------------------------------- */

test("a playbook's act is said the moment the server takes it, with what it answered -- not after the playbooks, the broadcasts and every contact are read again -- and the pane's button waits for the re-read", async () => {
  const keep = { ...playbooks };
  const reread = [];
  const acceptThenRead =
    (data) =>
    (_id, opts = {}) => {
      if (opts.onAccepted) opts.onAccepted(data);
      return new Promise((r) => reread.push(() => r({ ok: true, data })));
    };
  try {
    playbooks.pause = acceptThenRead({ id: "pb-1", state: "paused" });
    playbooks.runNow = acceptThenRead({
      outcome: "sent",
      eligible: 4,
      scheduled_for: iso(0),
      moved_from: null,
    });
    const draw = () =>
      PlaybookPane({ p: playbook(), canAct: true, onEdit() {}, flash: (t) => toasts.push(t), onClose() {} });
    let card = draw();
    press(byTestId(card, "pb-pause"));
    await settle();
    assert.equal(toasts.length, 1, "said at acceptance, while the surfaces are read again");
    assert.match(textOf(toasts[0].msg), /Win-back paused — nothing runs until you resume it/);
    card = redraw(draw);
    assert.equal(
      byTestId(card, "pb-pause").props.disabled,
      true,
      "the pane's buttons wait for the re-read: a second press now would be a second act",
    );
    while (reread.length) reread.shift()();
    await settle();
    assert.equal(toasts.length, 1, "and said once");
    card = redraw(draw);
    assert.equal(byTestId(card, "pb-pause").props.disabled, false, "free once the re-read landed");

    toasts.length = 0;
    moreItem(card, "Run now").onSelect();
    await settle();
    assert.equal(toasts.length, 1, "Run now says what the run did from the server's answer, at acceptance");
    assert.match(textOf(toasts[0].msg), /Win-back — 4 people/);
    while (reread.length) reread.shift()();
    await settle();
    assert.equal(toasts.length, 1);

    // A client that never says it was accepted (an older bridge): said once the write answers, as before.
    toasts.length = 0;
    playbooks.pause = async () => ({ ok: true, data: { id: "pb-1", state: "paused" } });
    card = redraw(draw);
    press(byTestId(card, "pb-pause"));
    await settle();
    assert.equal(toasts.length, 1, "said once, from the answer");
    // A refusal is said as one, and nothing else.
    toasts.length = 0;
    playbooks.pause = async () => ({
      ok: false,
      code: "forbidden",
      status: 403,
      message: "Only an owner or operator can pause a playbook.",
    });
    card = redraw(draw);
    press(byTestId(card, "pb-pause"));
    await settle();
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].tone, "danger");
    assert.match(textOf(toasts[0].msg), /Only an owner or operator/);
  } finally {
    Object.assign(playbooks, keep);
  }
});

/* ---------------------------------- G: the playbook composer ---------------------------------- */

test("the playbook composer keeps what was typed in the tab, opens again on it, and its Cancel and Escape ask before throwing it away -- Escape dropped everything", () => {
  let tree = composer();
  assert.ok(byTestId(tree, "pb-composer"), "the composer is open");
  assert.deepEqual(drafts(), {}, "nothing typed, nothing kept");
  // Cancel with nothing changed closes at once, as it did.
  press(byTestId(tree, "pb-cancel"));
  assert.deepEqual(closed, ["cancel"], "Cancel closes it");
  closed.length = 0;

  unmount();
  tree = composer();
  type(byTestId(tree, "pb-name"), "Sunday quiet");
  tree = redraw(composer);
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet");
  const kept = TM.draft("playbook", "new");
  assert.equal(kept && kept.name, "Sunday quiet", "kept in the tab under the composer's kind, as it is typed");
  assert.equal(tabClosing(), true, "and the tab asks before closing over it (the record kit's registry holds it)");
  assert.equal(globalThis.__settingsUnsaved(), true, "the rail's question hears it too");

  // Escape is the pane's Close (useRecSheetEscape): it asks, where the pane's buttons were, and closes nothing.
  globalThis.dispatchEvent({ type: "keydown", key: "Escape", defaultPrevented: false, preventDefault() {} });
  tree = redraw(composer);
  assert.deepEqual(closed, [], "REGRESSION: Escape dropped the composer and everything typed in it");
  assert.ok(byTestId(tree, "pb-composer"), "still open");
  assert.ok(byTestId(tree, "pb-leave-confirm"), "the one question");
  assert.equal(textOf(byTestId(tree, "pb-leave-confirm")).includes("Throw away what you've written?"), true);
  assert.equal(byTestId(tree, "pb-cancel"), null, "in the buttons' place");
  press(byTestId(tree, "pb-leave-no"));
  tree = redraw(composer);
  assert.ok(byTestId(tree, "pb-cancel"), "Keep writing: the buttons are back");
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet", "and the words with them");
  assert.deepEqual(closed, [], "nothing was closed");

  // The composer left (a trip to People, a reload) and opened again: on the words that were typed. The home is what opens
  // it again as the page does (the next test).
  unmount();
  assert.equal(tabClosing(), false, "gone from the page, it holds the tab no longer");
  tree = composer();
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet", "on the words that were typed");
  assert.ok(faceOf(tree, "pb-moment").includes("Welcome"), "the draft's moment: the first one nothing is doing yet");

  // A moment's Turn on pressed while a new playbook is half-written: the composer opens on THAT moment (the sheet keys the
  // composer by the moment, so React mounts it anew), with the words kept. Drawn on its own: the stub keeps one set of
  // cells whatever the key.
  unmount();
  const pressed = composer({ initialTrigger: "phoned_only" });
  assert.ok(
    faceOf(pressed, "pb-moment").includes(contracts.triggerOf("phoned_only").label),
    "the moment pressed wins over the draft's",
  );
  assert.equal(byTestId(pressed, "pb-name").props.value, "Sunday quiet", "and the words stay");
  unmount();
  tree = composer();

  // Cancel, then Yes: gone, from the composer and from the tab.
  press(byTestId(tree, "pb-cancel"));
  tree = redraw(composer);
  assert.deepEqual(closed, [], "asked first");
  press(byTestId(tree, "pb-leave-yes"));
  assert.deepEqual(closed, ["cancel"], "thrown away: the composer closes");
  assert.equal(TM.draft("playbook", "new"), null, "and nothing is kept");
  // The stub draws no unmount of a child the page stopped drawing: React would, and the hold goes with it.
  unmount();
  assert.equal(tabClosing(), false);
});

test("a playbook being changed is kept under its own id, and Save, taken, keeps nothing", async () => {
  const keep = { ...playbooks };
  try {
    playbooks.update = async (id, body) => ({
      ok: true,
      data: { id, name: body.name || "Win-back" },
    });
    const editing = playbook();
    const change = () => composer({ editing });
    let tree = change();
    assert.ok(byTestId(tree, "pb-composer"));
    type(byTestId(tree, "pb-name"), "Win-back, gentler");
    tree = redraw(change);
    assert.equal(
      TM.draft("playbook", "pb-1") && TM.draft("playbook", "pb-1").name,
      "Win-back, gentler",
      "under the playbook's id",
    );
    assert.equal(TM.draft("playbook", "new"), null, "not the new one's");
    unmount();
    tree = change();
    assert.equal(byTestId(tree, "pb-name").props.value, "Win-back, gentler", "come back to, the change opens again");
    await press(byTestId(tree, "pb-save"));
    assert.deepEqual(
      saved,
      [[{ id: "pb-1", name: "Win-back, gentler" }, true]],
      "saved: the home is told it was a change",
    );
    assert.equal(TM.draft("playbook", "pb-1"), null, "and the server has it: nothing to keep");
    // The home closes the sheet on the answer (the stub draws no unmount of a child that stopped being drawn), and the hold goes with it.
    unmount();
    assert.equal(tabClosing(), false);
  } finally {
    Object.assign(playbooks, keep);
  }
});

test("Edit in a playbook's pane pushes the composer on that playbook over the drawer, so Cancel returns to the detail, and the composer opens on its own words", () => {
  const backs = [];
  const keep = globalThis.history.back;
  globalThis.history.back = () => backs.push("back");
  try {
    // The pane the home opens a playbook in: its Edit is pushed over the drawer (use-home.ts useHomeNav), not put in its place,
    // so what the person came from is one Back away.
    let tree = again(() => home("moment:pb-1"));
    press(byTestId(tree, "pb-edit"));
    assert.deepEqual(went, ["campaigns/new:edit:pb-1"], "pushed");
    assert.deepEqual(replaced, [], "and never replaced");
    // The address says it, so the home hosts the composer on that playbook and no choice of kind is drawn; the drawer's own
    // address is gone, so it is closed.
    const draw = () => again(() => home("new:edit:pb-1"));
    tree = draw();
    const drawer = find(tree, (n) => n.props?.testid === "cmh-drawer");
    assert.equal(drawer.props.open, false, "the drawer is on its way out: its address has gone");
    assert.equal(find(tree, (n) => n.type === PlaybookComposer).props.editing.id, "pb-1");
    type(byTestId(tree, "pb-name"), "Win-back, gentler");
    draw();
    assert.equal(
      TM.draft("playbook", "pb-1").name,
      "Win-back, gentler",
      "kept under the playbook's id, from the home's sheet too",
    );
    // Cancel (Escape, the sheet's Close) is a step Back: to the detail it was opened over, never to the home.
    tree = draw();
    press(byTestId(tree, "pb-cancel"));
    press(byTestId(draw(), "pb-leave-yes"));
    assert.deepEqual(backs, ["back"], "one entry back: the drawer's address");
    assert.deepEqual(replaced, [], "the home is not where it lands");
  } finally {
    globalThis.history.back = keep;
  }
});

/* ---------------------------------- G: the home reopens what was kept ---------------------------------- */

/** Words typed into the composer's name box and kept in the tab (the draft is written as the composer draws again), then the page left. */
const keepWords = (over, words) => {
  unmount();
  const draw = () => composer(over);
  type(byTestId(draw(), "pb-name"), words);
  redraw(draw);
  unmount();
};

test("what the tab kept comes back as the home does: the address is replaced with the send, the new playbook or the change that was half-written", () => {
  const nowhere = () => {
    unmount();
    fresh();
    return home();
  };
  // Nothing kept: the home itself, and no address moved.
  nowhere();
  assert.deepEqual(replaced, [], "nothing kept, nothing reopened");

  // A playbook half-written: on Every time a moment comes. The words are the composer's, and it opens on them.
  keepWords({}, "Sunday quiet");
  nowhere();
  assert.deepEqual(replaced, ["campaigns/new:every"]);
  fresh();
  let tree = again(() => home("new:every"));
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet", "the composer it lands on opens on the words");
  assert.deepEqual(replaced, [], "an address that already names the composer is left where it is");

  // One of the playbooks being changed, under its own address.
  clearTabMemory();
  keepWords({ editing: playbook() }, "Win-back, gentler");
  nowhere();
  assert.deepEqual(replaced, ["campaigns/new:edit:pb-1"]);
  fresh();
  tree = again(() => home("new:edit:pb-1"));
  assert.equal(byTestId(tree, "pb-name").props.value, "Win-back, gentler");

  // A change to a playbook the workspace no longer has is nobody's to reopen: the home, and the words wait their day.
  unmount();
  setSurfaceValue("playbooks", playbooksSurface({ rows: [] }));
  nowhere();
  assert.deepEqual(replaced, [], "no such playbook, no change to reopen");
  setSurfaceValue("playbooks", playbooksSurface());

  // A send half-written wins over a playbook's words: it is the home's first, as it was the page's.
  clearTabMemory();
  keepWords({}, "Sunday quiet");
  let send = openByLink();
  typedSlots(send)[0].props.onTyped("20% off colour");
  redraw(page);
  assert.ok(TM.draft("broadcast"), "the send's words are kept");
  nowhere();
  assert.deepEqual(replaced, ["campaigns/new"]);
  fresh();
  tree = again(() => home("new"));
  assert.ok(
    find(tree, (n) => n.props?.["data-testid"] === "cmh-composer"),
    "and the composer is on Send once",
  );
  assert.equal(typedSlots(tree)[0].props.typed, "20% off colour", "on the words that were typed");
  assert.equal(replaced.length, 0);
});

test("the home reopens once, when the playbooks are first read, and never over an address that names something", () => {
  // Words kept for a playbook.
  keepWords({}, "Sunday quiet");
  fresh();

  // Not read yet: nothing drawn, nothing reopened; read, and the home goes where the words are.
  setSurfaceValue("playbooks", undefined);
  assert.equal(
    again(() => home()),
    null,
    "the surface is not read yet: nothing drawn",
  );
  assert.deepEqual(replaced, []);
  setSurfaceValue("playbooks", playbooksSurface());
  again(() => home());
  assert.deepEqual(replaced, ["campaigns/new:every"], "once the first read lands");
  // Back on the home itself (the sheet closed with its words kept) and the playbooks read again, as every write has them:
  // it is not reopened again over the same page.
  setSurfaceValue("playbooks", playbooksSurface());
  again(() => home());
  assert.deepEqual(replaced, ["campaigns/new:every"], "once, on arrival");

  // A link that names a playbook, or the send, is the address asked for: the words wait.
  for (const param of ["moment:pb-1", "new"]) {
    unmount();
    fresh();
    again(() => home(param));
    assert.deepEqual(replaced, [], `${param}: never over an address that names something`);
  }
});

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
  // layout is the Inbox's list + pane, docs/2026-10-02-campaigns-on-the-kit.md §3.1); Keep writing puts them back.
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-composer"), "not closed");
  assert.ok(byTestId(tree, "bc-leave-confirm"), "asked");
  assert.equal(byTestId(tree, "bc-send"), null, "the question stands alone in the foot");
  press(byTestId(tree, "bc-leave-no"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-compose-close"));
  assert.ok(byTestId(tree, "bc-send"), "and the send's acts are back");
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

test("a send made from the home raises its toast on the home's own host: the screen draws none of its own, so the toast and its Stop outlive the sheet that closes over it", async () => {
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
    assert.ok(textOf(tree).includes(page.node), "the home draws its toast host");
    for (const own of hosts.slice(1))
      assert.ok(!textOf(tree).includes(own.node), "the send screen draws none of its own");
    typedSlots(tree)[0].props.onTyped("20% off colour");
    tree = draw();
    press(byTestId(tree, "bc-send"));
    tree = draw();
    await press(byTestId(tree, "bc-send-yes"));
    // The toast is said on the home's host, with its Stop and its See who; the screen's own host was never asked.
    const said = page.said.at(-1);
    assert.equal(said.action.label, "Stop it");
    assert.equal(said.links[0].to, "broadcasts/run:b-new");
    assert.match(textOf(said.msg), /Autumn/);
    assert.deepEqual(
      hosts.slice(1).flatMap((h) => h.said),
      [],
      "nothing was said on a host that would go with the sheet",
    );
    // The sheet closes onto the home and the screen goes with it; the toast is the home's, and its Stop still stops the send.
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

test("the send screen's door to their yes, pressed in the home's sheet, replaces the sheet's address with the section's: the sheet is not closed past it, which a step Back would undo", () => {
  const backs = [];
  const keep = globalThis.history.back;
  globalThis.history.back = () => backs.push("back");
  try {
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        audiences: [
          { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 0, conversational: 0 } },
        ],
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
    // New message pushes the composer's address; its screen says nobody on the list has said yes, with the door to get it.
    let tree = redraw(() => home());
    press(byTestId(tree, "cmh-new"));
    assert.deepEqual(went, ["campaigns/new"]);
    tree = redraw(() => home("new"));
    press(byTestId(tree, "bc-nobody-door"));
    assert.deepEqual(replaced, ["broadcasts/get-yes"], "the sheet's address becomes the section: one move");
    // The screen has been left, and the host was not told it was done: a close now would go Back over the move.
    redraw(() => home("new"));
    redraw(() => home("new"));
    assert.deepEqual(backs, [], "no step Back after the door");
    assert.deepEqual(replaced, ["broadcasts/get-yes"], "and the address was not replaced with the home either");
    assert.deepEqual(went, ["campaigns/new"]);
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
    const ex = find(tree, (n) => n.type === Field && String(n.props?.placeholder || "").includes("what a real value"));
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
