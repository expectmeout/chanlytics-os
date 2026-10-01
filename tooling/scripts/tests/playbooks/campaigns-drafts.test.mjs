/**
 * Campaigns, the loading standard's D and G: a playbook's act is said when the server takes it, and a composer's
 * words are kept in the tab, come back when it opens again, and are thrown away only after one question.
 *
 * - A playbook card's Pause, Run now, Approve, Skip and Delete waited for the write AND the refresh map's re-read of
 *   the playbooks and the broadcasts (the second reads every contact page) before saying anything. They say it from
 *   the server's answer (`onAccepted`), and the card's buttons wait for the re-read: a Run now pressed twice before
 *   the first run's rows had landed would be two runs.
 * - The playbook sheet's Escape dropped everything typed; the send screen's Cancel and a trip to another page lost a
 *   name, a typed value and a picked time; a template half-written, or a translation the assistant had just been paid
 *   to write, went with a Cancel. Each is kept per tab (tab-memory.ts) under one rule (record-fold.jsx
 *   useUnsavedWork), the registry holds the tab from closing over it, and Cancel asks once (UnsavedAsk).
 * Run against the pages on a stub React, with the tab's memory installed as the app installs it.
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
  appNavigate: (to) => went.push(to),
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __surfaceState: () => "live",
  __DEMO_MODE: false,
});
const { BroadcastsPage } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { PlaybooksPage } = await import(`${SRC}/surfaces/campaigns/playbooks/playbooks-page.tsx`);
const { PlaybookCard } = await import(`${SRC}/surfaces/campaigns/playbooks/card-detail.tsx`);
const { PlaybookComposer } = await import(`${SRC}/surfaces/campaigns/playbooks/composer.tsx`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { TemplateComposer } = await import(`${SRC}/surfaces/campaigns/templates/composer.tsx`);
const { broadcasts } = await import(`${SRC}/surfaces/campaigns/broadcasts/verbs.ts`);
const { playbooks } = await import(`${SRC}/surfaces/campaigns/playbooks/verbs.ts`);
const { templates } = await import(`${SRC}/surfaces/campaigns/templates/verbs.ts`);
const { setSurfaceValue, surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

/* ---------------------------------- walking a tree ---------------------------------- */

const type = (node, value) => node.props.onChange({ target: { value } });
/** A fresh mount, as React mounts a page a person came back to: every cell forgotten, every listener gone. */
const fresh = () => {
  freshTree();
  went.length = 0;
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
const playbooksSurface = (over = {}) => ({
  rows: [playbook()],
  templates: [starterRow("winback_offer", "tpl-1")],
  triggers: contracts.PLAYBOOK_TRIGGERS.map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    cls: t.cls,
    list: t.list,
    kind: t.kind,
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
/** The send's name box, by its own words: the When box's input wears the same class. */
const nameBox = (tree) =>
  find(tree, (n) => n.type === "input" && String(n.props?.placeholder || "").startsWith("Name this broadcast"));
const playbooksPage = () => PlaybooksPage({});
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
  clearTabMemory();
  globalThis.__recordFolds.reset();
  setSurfaceValue("broadcasts", broadcastsSurface());
  setSurfaceValue("playbooks", playbooksSurface());
});

/* ---------------------------------- D: an act is said when the server takes it ---------------------------------- */

test("a playbook card's act is said the moment the server takes it, with what it answered -- not after the playbooks, the broadcasts and every contact are read again -- and the button waits for the re-read", async () => {
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
    const draw = () => PlaybookCard({ p: playbook(), canAct: true, onEdit() {}, flash: (t) => toasts.push(t) });
    let card = draw();
    press(byTestId(card, "pb-pause"));
    await settle();
    assert.equal(toasts.length, 1, "said at acceptance, while the surfaces are read again");
    assert.match(textOf(toasts[0].msg), /Win-back paused — nothing runs until you resume it/);
    card = redraw(draw);
    assert.equal(
      byTestId(card, "pb-pause").props.disabled,
      true,
      "the card's buttons wait for the re-read: a second press now would be a second act",
    );
    while (reread.length) reread.shift()();
    await settle();
    assert.equal(toasts.length, 1, "and said once");
    card = redraw(draw);
    assert.equal(byTestId(card, "pb-pause").props.disabled, false, "free once the re-read landed");

    toasts.length = 0;
    press(byTestId(card, "pb-run-now"));
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

/* ---------------------------------- G: the playbook sheet ---------------------------------- */

test("the playbook sheet keeps what was typed in the tab, opens again on it after the page was left, and its Cancel and Escape ask before throwing it away -- Escape dropped everything", () => {
  playbooksPage();
  globalThis.dispatchEvent({ type: "playbooks:new" });
  let tree = redraw(playbooksPage);
  assert.ok(byTestId(tree, "pb-composer"), "the sheet is open");
  assert.deepEqual(drafts(), {}, "nothing typed, nothing kept");
  // Cancel with nothing changed closes at once, as it did.
  press(byTestId(tree, "pb-cancel"));
  tree = redraw(playbooksPage);
  assert.equal(byTestId(tree, "pb-composer"), null, "Cancel closes it");

  globalThis.dispatchEvent({ type: "playbooks:new" });
  tree = redraw(playbooksPage);
  type(byTestId(tree, "pb-name"), "Sunday quiet");
  tree = redraw(playbooksPage);
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet");
  const kept = TM.draft("playbook", "new");
  assert.equal(kept && kept.name, "Sunday quiet", "kept in the tab under the composer's kind, as it is typed");
  assert.equal(tabClosing(), true, "and the tab asks before closing over it (the record kit's registry holds it)");
  assert.equal(globalThis.__settingsUnsaved(), true, "the rail's question hears it too");

  // Escape is the sheet's Close (record-sheet.jsx): it asks, where the sheet's buttons were, and closes nothing.
  globalThis.dispatchEvent({ type: "keydown", key: "Escape", defaultPrevented: false, preventDefault() {} });
  tree = redraw(playbooksPage);
  assert.ok(byTestId(tree, "pb-composer"), "REGRESSION: Escape dropped the sheet and everything typed in it");
  assert.ok(byTestId(tree, "pb-leave-confirm"), "the one question");
  assert.equal(textOf(byTestId(tree, "pb-leave-confirm")).includes("Throw away what you've written?"), true);
  assert.equal(byTestId(tree, "pb-cancel"), null, "in the buttons' place");
  press(byTestId(tree, "pb-leave-no"));
  tree = redraw(playbooksPage);
  assert.ok(byTestId(tree, "pb-cancel"), "Keep writing: the buttons are back");
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet", "and the words with them");

  // The page left (People, a reload) and come back to: the sheet opens again on what was typed.
  unmount();
  assert.equal(tabClosing(), false, "gone from the page, it holds the tab no longer");
  tree = playbooksPage();
  assert.ok(byTestId(tree, "pb-composer"), "opens again as the page does");
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet", "on the words that were typed");

  // An empty moment's "Set it up" pressed while a new one is half-written: the sheet opens on THAT moment (the page
  // keys the sheet by the slot, so React mounts it anew), with the words kept. Drawn on its own: the stub keeps one
  // set of cells whatever the key.
  assert.ok(
    textOf(byTestId(tree, "pb-moment")).includes("Welcome"),
    "the draft's moment: the first one nothing is doing yet",
  );
  unmount();
  const sheet = PlaybookComposer({
    data: surfaceValue("playbooks"),
    editing: null,
    initialTrigger: "phoned_only",
    onDone() {},
    onCancel() {},
  });
  assert.ok(
    textOf(byTestId(sheet, "pb-moment")).includes(contracts.triggerOf("phoned_only").label),
    "the moment pressed wins over the draft's",
  );
  assert.equal(byTestId(sheet, "pb-name").props.value, "Sunday quiet", "and the words stay");
  unmount();
  tree = playbooksPage();

  // Cancel, then Yes: gone, from the sheet and from the tab.
  press(byTestId(tree, "pb-cancel"));
  tree = redraw(playbooksPage);
  press(byTestId(tree, "pb-leave-yes"));
  tree = redraw(playbooksPage);
  assert.equal(byTestId(tree, "pb-composer"), null, "thrown away: the sheet closes");
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
    let tree = playbooksPage();
    press(byTestId(tree, "pb-open"));
    tree = redraw(playbooksPage);
    press(byTestId(tree, "pb-edit"));
    tree = redraw(playbooksPage);
    assert.ok(byTestId(tree, "pb-composer"));
    type(byTestId(tree, "pb-name"), "Win-back, gentler");
    tree = redraw(playbooksPage);
    assert.equal(
      TM.draft("playbook", "pb-1") && TM.draft("playbook", "pb-1").name,
      "Win-back, gentler",
      "under the playbook's id",
    );
    assert.equal(TM.draft("playbook", "new"), null, "not the new one's");
    unmount();
    tree = playbooksPage();
    assert.ok(byTestId(tree, "pb-composer"), "come back to, the change opens again");
    assert.equal(byTestId(tree, "pb-name").props.value, "Win-back, gentler");
    await press(byTestId(tree, "pb-save"));
    tree = redraw(playbooksPage);
    assert.equal(byTestId(tree, "pb-composer"), null, "saved, the sheet closes");
    assert.equal(TM.draft("playbook", "pb-1"), null, "and the server has it: nothing to keep");
  } finally {
    Object.assign(playbooks, keep);
  }
});

/* ---------------------------------- G: the send screen ---------------------------------- */

test("the send screen keeps its words -- a name, a typed value, a picked time -- and opens again on them; a list or a message chosen alone keeps nothing; Cancel asks once and Yes clears it", () => {
  let tree = page();
  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-composer"));
  // The list and the message are choices, not words: chosen, nothing is kept and Cancel closes at once.
  press(all(tree, (n) => n.props?.["data-testid"] === "bc-audience")[1]);
  tree = redraw(page);
  assert.deepEqual(drafts(), {}, "a choice alone is not work");
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  assert.equal(byTestId(tree, "bc-composer"), null, "Cancel closes it, as it did");

  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  type(byTestId(byTestId(tree, "bc-vars"), "bc-var-input"), "20% off colour");
  tree = redraw(page);
  type(nameBox(tree), "Autumn colour");
  tree = redraw(page);
  const kept = TM.draft("broadcast");
  assert.equal(kept.name, "Autumn colour");
  assert.deepEqual(
    kept.params["tpl-own"],
    [null, "20% off colour"],
    "the value typed into the second slot (the first is each person's own name)",
  );
  assert.equal(kept.aud, "saved:s1", "and the list it was for");
  assert.equal(tabClosing(), true, "the tab asks before closing over it");

  // Cancel with words asks, where the Cancel was; Keep writing puts it back.
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-composer"), "not closed");
  assert.ok(byTestId(tree, "bc-leave-confirm"), "asked");
  press(byTestId(tree, "bc-leave-no"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-compose-close"));
  assert.equal(byTestId(byTestId(tree, "bc-vars"), "bc-var-input").props.value, "20% off colour");

  // Left and come back to: the send screen, on the same list, with the same words.
  unmount();
  tree = page();
  assert.ok(byTestId(tree, "bc-composer"), "opens on the send half-written");
  assert.equal(nameBox(tree).props.value, "Autumn colour");
  assert.equal(byTestId(byTestId(tree, "bc-vars"), "bc-var-input").props.value, "20% off colour");
  const chips = all(tree, (n) => n.props?.["data-testid"] === "bc-audience");
  assert.ok(String(chips[1].props.className).includes("active"), "on Regulars, the list it was for");
  // A link that names a list wins the list.
  unmount();
  tree = page({ initialSegment: "s1", initialRun: null });
  assert.ok(byTestId(tree, "bc-composer"));
  unmount();
  tree = page();

  // Yes, throw it away: closed, cleared, and nothing kept -- New broadcast opens empty.
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  press(byTestId(tree, "bc-leave-yes"));
  tree = redraw(page);
  assert.equal(byTestId(tree, "bc-composer"), null);
  assert.equal(TM.draft("broadcast"), null);
  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  assert.equal(nameBox(tree).props.value, "", "REGRESSION: the last send's words stayed in the page after a Cancel");
  assert.equal(byTestId(byTestId(tree, "bc-vars"), "bc-var-input").props.value, "");
});

test("a send the server took keeps nothing: the screen closes onto the ledger and the next New broadcast is empty", async () => {
  let tree = page();
  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  type(byTestId(byTestId(tree, "bc-vars"), "bc-var-input"), "20% off colour");
  tree = redraw(page);
  assert.ok(TM.draft("broadcast"));
  press(byTestId(tree, "bc-send"));
  tree = redraw(page);
  await press(byTestId(tree, "bc-send-yes"));
  tree = redraw(page);
  assert.equal(byTestId(tree, "bc-composer"), null, "sent, the screen closes");
  assert.equal(TM.draft("broadcast"), null, "and nothing is kept");
  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  assert.equal(byTestId(byTestId(tree, "bc-vars"), "bc-var-input").props.value, "", "the next one starts empty");
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
    const ex = find(
      tree,
      (n) => n.type === "input" && String(n.props?.placeholder || "").includes("what a real value"),
    );
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
