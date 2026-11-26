/**
 * The world the tests of page/ share. Split by behaviour from broadcasts-honest.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Broadcasts and Messages: each state said in words, and each word from where it is kept.
 *
 * - A run's detail printed "visit_when" (the wiring audit's C6, C24).
 * - Every slot of a broadcast took any source, so a starter's first name could be set to the booking link and a
 *   broadcast greeted everyone "Hi your booking link"; Send it again kept a run's sources as they were. It opens New's
 *   Send once now (decision 0065), on the send the run's screen keeps for it.
 * - Deleting a message a running playbook sends went through, and its runs skipped from then on (C8).
 * - A failed broadcast read "· failed" with its reason on file (C12); a send in flight was prose with no bar, an
 *   Approve could be pressed twice, and "N queued" counted runs waiting for a person (C14).
 * - The sending hours were typed into the pages beside the constants they restate (C15).
 * - On Messages one busy flag relabelled every button (C20), and the quality WhatsApp rated a message was never
 *   drawn (C22).
 * - A run opened on a page already scrolled stayed out of sight, found on the live page after B4a.
 * Run against the pages (TSX since decision 0015, apps/dashboard/src/surfaces/campaigns) on a stub React, over the values
 * the seam holds (surface-values.ts) and the starter library the templates verbs export.
 */
import * as contracts from "@chanlytics/contracts";
import {
  installStubReact,
  kitPages,
  fresh as freshTree,
  again as drawAgain,
  find,
  byTestId,
  textOf,
} from "../../_stub-react.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

export const { toBroadcastVM, stateOf, numberHealth } = contracts;

export const TID = "t-studio";

export const ZONE = "America/New_York";

export const H = 3_600_000;

export const D = 24 * H;

export const NOW = Date.now();

/** An instant relative to now: negative is past. */
export const iso = (ms) => new Date(NOW + ms).toISOString();

export const quiet = { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };

/** A broadcast as GET broadcasts returns it (contracts BroadcastDto). */
export const dto = (over = {}) => ({
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
  // A first step's run: its sequence has the step's own id (00440).
  sequence_id: "pb-1",
  counts: { queued: 0, sent: 3, skipped: 0, failed: 0, delivered: 2, read: 1, replied: 1 },
  ...over,
});

export const person = (over = {}) => ({
  contact_id: "k1",
  name: "Rosa Díaz",
  first_name: "Rosa",
  phone: "+16465550123",
  state: "sent",
  reason: null,
  sent_at: iso(-5 * D),
  message_status: "delivered",
  conversation_id: "cv1",
  replied: false,
  delivered_at: iso(-5 * D + 60_000),
  read_at: null,
  replied_at: null,
  consent_after: null,
  consent_at: null,
  consent_purpose: null,
  reply_words: null,
  answered_by: null,
  answered_at: null,
  waiting_on_you: false,
  ...over,
});

export const detailOf = (broadcast, recipients = [person()]) => ({ broadcast, recipients });

/** The Broadcasts surface as its override publishes it (surfaces/campaigns/broadcasts/surface.ts BroadcastsSurface). */
export const broadcastsSurface = (over = {}) => ({
  audiences: [
    { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 2, conversational: 3 } },
    { kind: "saved", id: "s1", label: "Regulars", counts: { marketing: 1, conversational: 1 } },
  ],
  templates: [],
  rows: [toBroadcastVM(dto(), ZONE)],
  more: false,
  heldReasons: contracts.HELD_REASONS,
  chunk: contracts.BROADCAST_CHUNK,
  // No number, as the channels read says it (campaigns/parts/channels.ts cmNumberOf): never null.
  number: { present: false, display: null, health: numberHealth({ quality: null, event: null, limit: null }) },
  optIn: null,
  getYes: contracts.GET_YES_ROUTE,
  listsRead: true,
  scheduleMaxDays: 30,
  businessName: "Northside Studio",
  bookingLink: false,
  reviewLink: false,
  ...over,
});

export const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  // It runs on the business's day while it is on (contracts campaignRunsOn): Run now is offered.
  runs: (over.state ?? "running") === "running",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
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
  totals: { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, last_run: null, waiting: null, history: [] },
  ...over,
});

export const playbooksSurface = (over = {}) => ({
  rows: [playbook()],
  templates: [],
  triggers: [
    {
      id: "quiet_30",
      label: "Quiet 30 days",
      hint: "anyone quiet for a month",
      cls: "reengage",
      list: "quiet_30",
      kind: "list",
      offered: true,
      candidates: 4,
      held: 0,
    },
  ],
  timezone: ZONE,
  calendar: "none",
  // How the business works (the surface's shape, 9 Oct 2026): the words this file pins are the word "visit"'s.
  shape: { calendar: "none", hasDeals: false, word: "visit" },
  number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio",
  bookingLink: false,
  reviewLink: false,
  fetchedAt: NOW,
  ...over,
});

/* ---------------------------------- the window ---------------------------------- */

// The page's window is the stub React's (installStubReact: window IS globalThis), with the shell's doors the TSX
// pages reach through the bridge's verbs (surfaces/frame-verbs.ts, frame-parts.ts) and the workspace its clock reads.
export const went = [];

export const toasts = [];

bridgeHolds({
  who: {
    workspaces: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
    activeWorkspaceId: TID,
  },
});
installStubReact({
  location: {
    pathname: "/w/studio",
    hash: "#/broadcasts",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  // The ledger's minute ticker (a run under an hour away counts down) is a timer this file never lets tick: nothing
  // here unmounts a page, and a real interval would keep the process alive.
  setInterval: () => 1,
  clearInterval() {},
});

export const SRC = "../../../apps/dashboard/src";

export const { installClock } = await import(`${SRC}/bridge/zone.ts`);

installClock();

// What the shell still owns and the pages draw by name: Confirm, StatePill, PolicyChip (frame-globals), the unsaved-work
// rule (record-fold) and the record sheet. The pages themselves are TSX (decision 0015) and imported below.
(await import(`${SRC}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();

Object.assign(globalThis.window, kitPages);

bridgeHolds({ who: { me: { role: "owner" } }, parts: { chrome: { state: stateOf }, surfaceState: () => "live" } });
Object.assign(globalThis, {
  useHotkey: () => {},
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to) => went.push(to),
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});

export const { BroadcastRun } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);

export const { bcWhenNote } = await import(`${SRC}/surfaces/campaigns/broadcasts/when.tsx`);

export const { BroadcastDetail, BcRunVerbs } = await import(`${SRC}/surfaces/campaigns/broadcasts/run.tsx`);

// The receipt's sentence is words alone, apart from the picker, so the shell that publishes it carries no picker.
export const { bcWhenWords, bcOpensOnItsSheet } = await import(`${SRC}/surfaces/campaigns/broadcasts/when-words.ts`);

// New's draft as the page holds it: what Send it again opens New's Send once on, from the send a one-off's record keeps
// (sequences/record-acts.tsx, through new/kept-send.ts: a run that went is read in Reports, 21 Oct 2026).
export const M = await import(`${SRC}/surfaces/campaigns/sequences/new/new-model.ts`);

export const { keptSendOf } = await import(`${SRC}/surfaces/campaigns/sequences/new/kept-send.ts`);

export const { MessageInPlace } = await import(`${SRC}/surfaces/campaigns/parts/message-in-place.tsx`);

export const { TemplateComposer } = await import(`${SRC}/surfaces/campaigns/templates/composer.tsx`);

export const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);

export const { Field } = await import(`${SRC}/surfaces/kit/field/field.tsx`);

/** One of the page's choices, the kit's Picker, by its test id. */
export const pickerOf = (t, id) => find(t, (n) => n.type === Picker && n.props["data-testid"] === id);

/** A picker's options in their order, each with its group's heading. */
export const optionsOf = (p) => p.props.groups.flatMap((g) => g.options.map((o) => ({ ...o, group: g.label })));

export const { broadcasts } = await import(`${SRC}/surfaces/campaigns/broadcasts/verbs.ts`);

export const { templates, starters } = await import(`${SRC}/surfaces/campaigns/templates/verbs.ts`);

export const { Menu } = await import(`${SRC}/surfaces/kit/menu/menu.tsx`);

export const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

export const { SubTabs } = await import(`${SRC}/surfaces/kit/sub-tabs/sub-tabs.tsx`);

export const { Face } = await import(`${SRC}/surfaces/kit/face/face.tsx`);

/** A run's name as its pane's head says it (CmPane's title, an h2's first child; its state is the second): where the page's h1 was. */
export const paneTitle = (tree) =>
  textOf(find(byTestId(tree, "bc-run-solo"), (n) => n.type === "h2").props.children[0]);

/** A fresh mount: nothing kept from the last page, no listener left behind by it. */
export const fresh = () => {
  freshTree();
  went.length = 0;
};

/** The detail's reads, answered in order per broadcast; the last answer repeats. */
export const answers = new Map();

// The verb the run's screen reads through (verbs.ts `broadcasts.detail`): answered from the queue above. Its words for a
// failure, a report and an approval are the verbs' own (contracts, stamped by the clock the page runs on), not stand-ins.
broadcasts.detail = async (id) => {
  const queue = answers.get(id) || [];
  return (
    (queue.length > 1 ? queue.shift() : queue[0]) || {
      ok: false,
      code: "not_found",
      status: 404,
      message: "Run not found.",
    }
  );
};

/** What a test asks to see: a run's one screen at its home (`initialRun`: BroadcastRun, lane 2). */
export const screen = (props) => BroadcastRun({ id: props.initialRun });

export const page = (props) => {
  fresh();
  return screen(props);
};

export const again = (props) => drawAgain(() => screen(props));

/** The list a run by hand went to (audience saved:s1), as New lists the workspace's own lists: by its token. */
export const REGULARS = [{ id: "list:s1", name: "Regulars" }];

/** Which links the workspace keeps: none, so a link's slot can only be typed. */
export const NO_LINKS = { bookingLink: false, reviewLink: false };

/**
 * New's Send once as Send it again opens it (sequences/new/new-page.tsx useOpenedOn): the send the tab kept, made a
 * one-off by New's model (new-model.ts againOf) over the Library as New reads it -- the messages these rows make, and the
 * rows their values are read from -- the lists, and the links on file.
 */
export const openedAgain = (kept, rows, lists = REGULARS, links = NO_LINKS) =>
  M.againOf(kept, { messages: contracts.campaignMessagesOf(rows), rows }, { lists, links }, "Northside Studio");

/**
 * What the settings surface holds of the workspace, as Templates reads it (surface.ts SettingsSurface): the record, the
 * channels, every template with what uses each and when each last went out. A template's title is looked up among its
 * `templatesAll` by its name (verbs.ts titleOf).
 */
export const settingsOf = (over = {}) => {
  const held = {
    settings: { config: { brain: { business_name: "Northside Studio" } } },
    facts: null,
    channels: [{ kind: "whatsapp" }],
    templatesAll: [],
    templateUse: null,
    templateSent: null,
    ...over,
  };
  // The messages the surface holds, made of the WhatsApp rows as the bridge makes them where the read carries none.
  held.messages ??= held.templatesAll ? contracts.campaignMessagesOf(held.templatesAll) : null;
  setSurfaceValue("settings", held);
  // The channels are their own read now (surfaces/channels/surface.ts): the same rows, as GET channels answers them.
  setSurfaceValue("channels", {
    rows: held.channels === null ? null : (held.channels ?? []).map((c) => ({ status: "active", ...c })),
  });
  return held;
};

/**
 * A message's sheet (parts/message-in-place.tsx), the one a message opens in over any page since Messages folded into
 * Campaigns (Campaigns, one tab, 17 Nov 2026), on a workspace with a WhatsApp number: opened on the first message a test
 * gives. No playbooks unless a test gives them.
 */
export let openName = null;

export const sheet = () => MessageInPlace({ name: openName, flash: () => {}, onClose: () => {} });

export const messagesAgain = () => drawAgain(sheet);

export const messagesOpen = ({ playbooks: held, ...over } = {}) => {
  setSurfaceValue("playbooks", held === undefined ? undefined : playbooksSurface(held));
  settingsOf(over);
  fresh();
  openName = (over.templatesAll ?? [])[0]?.name ?? null;
  return sheet();
};

/**
 * The message the surface stamps on a template it offers (surfaces/campaigns/parts/channels.ts cmOfferedMessages), made as the
 * reader makes it, of a row on each channel the template holds: what the Send by row reads a closed channel's words from.
 */
export const messageHeld = (t) =>
  contracts.campaignMessageOf(
    (t.channels ?? ["whatsapp"]).map((channel) => ({
      ...t,
      id: channel === "whatsapp" ? t.id : `${t.id}-${channel}`,
      channel,
    })),
    t.name,
    t.language,
  );

export const withMessage = (t) => ({ ...t, message: messageHeld(t) });

export const templateRow = (over = {}) => {
  const row = {
    id: "t9",
    channel: "whatsapp",
    name: "offer",
    language: "en_US",
    meta_status: "approved",
    category: "marketing",
    source: "chanlytics",
    hidden_at: null,
    title: null,
    quality: null,
    rejected_reason: null,
    synced_at: null,
    body_preview: "Our fall offer is here.",
    variables: [],
    ...over,
  };
  return row.channels && !row.message ? withMessage(row) : row;
};

/** A starter as WhatsApp holds it once approved: the library's words and slots. */
export const starterTemplate = (name) => {
  const s = starters.byName(name);
  const t = starters.text(s, "en_US");
  return templateRow({
    id: `tpl-${name}`,
    name,
    category: s.category,
    purpose: s.category === "utility" ? "conversational" : "marketing",
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
  });
};

/** The open message's pane: its words, its languages and its verbs, which were under its row. */
export const paneOf = (t) => byTestId(t, "template-pane");

/** An item of the pane's menu, by its words: the kit's Menu draws nothing under this runner, so its groups are read. */
export const menuItem = (t, words) =>
  find(t, (n) => n.type === Menu)
    .props.groups.flatMap((g) => g.items)
    .find((i) => i.label === words);

/* ------------------------------- A run by every channel (One message, every channel, step 3) ------------------------------- */

export const { bcPersonRow } = await import(`${SRC}/surfaces/campaigns/broadcasts/run-sheet.tsx`);

/** A message about their visit with a version on each channel. */
export const noteRow = (channels = ["whatsapp", "sms", "email"]) =>
  templateRow({ id: "tpl-note", name: "hours_note", category: "utility", purpose: "conversational", channels });

/* ------------------------- A message needs no WhatsApp row: what Send it again finds ------------------------- */

export const { cmOfferedFrom } = await import(`${SRC}/surfaces/campaigns/parts/channels.ts`);

/** One version of the message hours_note, on `channel`, as GET templates returns its rows (a WhatsApp row's `blocked` judged, an email's null). */
export const versionRow = (channel, over = {}) => ({
  id: `v-${channel}`,
  channel,
  name: "hours_note",
  language: "en_US",
  meta_status: "approved",
  category: "utility",
  source: "chanlytics",
  hidden_at: null,
  title: null,
  quality: null,
  rejected_reason: null,
  synced_at: null,
  blocked: null,
  variables: [{ position: 1, label: "First name", example: "Dani" }],
  header: channel === "email" ? "A note, {{1}}" : null,
  body_preview: "Hi {{1}}, we are open late on Thursdays.",
  ...over,
});

/**
 * What the surface offers of these rows (broadcasts/surface.ts): the settings read's, its WhatsApp rows and its other
 * channels' versions as it publishes them, and its messages, made of every row.
 */
export const offeredOf = (...rows) =>
  cmOfferedFrom({
    templatesAll: rows.filter((r) => r.channel === "whatsapp"),
    templateVersions: rows.filter((r) => r.channel !== "whatsapp"),
    messages: contracts.campaignMessagesOf(rows),
  });
