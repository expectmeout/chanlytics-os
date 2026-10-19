/**
 * Broadcasts and Messages: each state said in words, and each word from where it is kept.
 *
 * - A broadcast's composer could pick a visit's time a broadcast does not have, and a run's detail printed "visit_when"
 *   (the wiring audit's C6, C24).
 * - Every slot of a broadcast took any source, so a starter's first name could be set to the booking link and a
 *   broadcast greeted everyone "Hi your booking link"; Send it again kept a run's sources as they were.
 * - Deleting a message a running playbook sends went through, and its runs skipped from then on (C8).
 * - A failed broadcast read "· failed" with its reason on file (C12); a send in flight was prose with no bar, an
 *   Approve could be pressed twice, and "N queued" counted runs waiting for a person (C14).
 * - The sending hours and the pace were typed into the pages beside the constants they restate (C15).
 * - On Messages one busy flag relabelled every button (C20), and the quality WhatsApp rated a message was never
 *   drawn (C22).
 * - A run opened on a page already scrolled stayed out of sight, found on the live page after B4a.
 * Run against the pages (TSX since decision 0015, apps/dashboard/src/surfaces/campaigns) on a stub React, over the values
 * the seam holds (surface-values.ts) and the starter library the templates verbs export.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  kitPages,
  fresh as freshTree,
  again as drawAgain,
  all,
  find,
  byTestId,
  textOf,
  press,
  settle,
} from "../_legacy-react.mjs";

const { toBroadcastVM, stateOf, numberHealth } = contracts;
/**
 * How a send of the old kind goes (contracts reach-for.ts, which audiencePreview now takes): by WhatsApp alone, which the
 * workspace can send on. The channels a campaign ticks were not an argument before they were a choice.
 */
const HOW = {
  channels: contracts.DEFAULT_CAMPAIGN_CHANNELS,
  ready: contracts.channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
};
const TID = "t-studio";
const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.now();
/** An instant relative to now: negative is past. */
const iso = (ms) => new Date(NOW + ms).toISOString();
const quiet = { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };

/** A broadcast as GET broadcasts returns it (contracts BroadcastDto). */
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
  // A first step's run: its sequence has the step's own id (00440).
  sequence_id: "pb-1",
  counts: { queued: 0, sent: 3, skipped: 0, failed: 0, delivered: 2, read: 1, replied: 1 },
  ...over,
});
const person = (over = {}) => ({
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
const detailOf = (broadcast, recipients = [person()]) => ({ broadcast, recipients });
const healthyNumber = {
  present: true,
  display: "+1 305-555-0100",
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
};
/** The Broadcasts surface as its override publishes it (surfaces/campaigns/broadcasts/surface.ts BroadcastsSurface). */
const broadcastsSurface = (over = {}) => ({
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
const playbook = (over = {}) => ({
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
  totals: { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
const playbooksSurface = (over = {}) => ({
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

// The page's window is the stub React's (installLegacyReact: window IS globalThis), with the shell's doors the TSX
// pages reach through the bridge's verbs (surfaces/legacy-verbs.ts, legacy-parts.ts) and the workspace its clock reads.
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
  __DEMO_MODE: false,
  // The ledger's minute ticker (a run under an hour away counts down) is a timer this file never lets tick: nothing
  // here unmounts a page, and a real interval would keep the process alive.
  setInterval: () => 1,
  clearInterval() {},
});
const SRC = "../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
// What the shell still owns and the pages draw by name: Confirm, StatePill, PolicyChip (data-bits), the unsaved-work
// rule (record-fold) and the record sheet. The pages themselves are TSX (decision 0015) and imported below.
await import(`${SRC}/legacy/components/data-bits.jsx`);
Object.assign(globalThis.window, kitPages);
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
});
const { BroadcastSend, BroadcastRun } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { GetYesSheet } = await import(`${SRC}/surfaces/people/sheets/get-yes-sheet.tsx`);
const { bcWhenNote, BcWhenPick } = await import(`${SRC}/surfaces/campaigns/broadcasts/when.tsx`);
const { BroadcastDetail, BcRunVerbs } = await import(`${SRC}/surfaces/campaigns/broadcasts/run.tsx`);
// The receipt's sentence is words alone, apart from the picker, so the shell that publishes it carries no picker.
const { bcWhenWords, bcOpensOnItsSheet } = await import(`${SRC}/surfaces/campaigns/broadcasts/when-words.ts`);
const { CmSlot } = await import(`${SRC}/surfaces/campaigns/parts/slot.tsx`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { TemplateComposer } = await import(`${SRC}/surfaces/campaigns/templates/composer.tsx`);
const { mpParts } = await import(`${SRC}/surfaces/campaigns/parts/message-preview.tsx`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { Field } = await import(`${SRC}/surfaces/kit/field/field.tsx`);
const { Meter } = await import(`${SRC}/surfaces/kit/meter/meter.tsx`);
const { Popover } = await import(`${SRC}/surfaces/kit/popover/popover.tsx`);
const { CmReachLine } = await import(`${SRC}/surfaces/campaigns/parts/reach.tsx`);
/** The send's reach line (parts/reach.tsx CmReachLine, under its sentence): how many can hear it, and its words. */
const reachOf = (tree) => find(tree, (n) => n.type === CmReachLine);
const whoN = (tree) => String(reachOf(tree)?.props.will ?? "");
/** The line's words: the press that opens who is held back (the kit popover's trigger, which the stub does not walk). */
const reachText = (tree) =>
  textOf(
    find(byTestId(tree, "bc-reach"), (n) => n.type === Popover && n.props.label === "Who's held back")?.props.trigger,
  );
const { DatePicker } = await import(`${SRC}/surfaces/kit/datepicker/datepicker.tsx`);
/** One of the composer's choices, the kit's Picker, by its test id. */
const pickerOf = (t, id) => find(t, (n) => n.type === Picker && n.props["data-testid"] === id);
/** A picker's options in their order, each with its group's heading. */
const optionsOf = (p) => p.props.groups.flatMap((g) => g.options.map((o) => ({ ...o, group: g.label })));
const { broadcasts } = await import(`${SRC}/surfaces/campaigns/broadcasts/verbs.ts`);
const { templates, starters } = await import(`${SRC}/surfaces/campaigns/templates/verbs.ts`);
const { Menu } = await import(`${SRC}/surfaces/kit/menu/menu.tsx`);
const { standingSaid } = await import(`${SRC}/surfaces/kit/head/standing.ts`);
/** What the page last said to the frame's head (kit/head/standing.ts): its line and its act, which the frame draws, not the page. */
const headSaid = () => {
  const said = standingSaid();
  return { props: { children: [said?.sentence ?? null, said?.act ?? null] } };
};
/** A part of the page, or of its head where the page says it to the frame. */
const headed = (tree, id) => byTestId(tree, id) ?? byTestId(headSaid(), id);
const { AFTER } = await import(`${SRC}/legacy-bridge/refresh-map.ts`);
const { setSurfaceValue, surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { SubTabs } = await import(`${SRC}/surfaces/kit/sub-tabs/sub-tabs.tsx`);
const { Face } = await import(`${SRC}/surfaces/kit/face/face.tsx`);

/** A run's name as its pane's head says it (CmPane's title, an h2's first child; its state is the second): where the page's h1 was. */
const paneTitle = (tree) => textOf(find(byTestId(tree, "bc-run-solo"), (n) => n.type === "h2").props.children[0]);

/**
 * A language chip is the kit's Picker (surfaces/kit/picker/), drawn as a token: its face says the letters of the language
 * in view and, after a space, "+1" for the rest. In its two parts: the letters, and "+1" ("" for none).
 */
const chipSays = (chip) => {
  const [letters, more = ""] = textOf(chip.props.face)
    .trim()
    .split(/\s+(?=\+\d)/);
  return [letters, more];
};
/** The state of the language in view, as the glyph in the chip's face draws it ("ok", "info", "none"). */
const chipTone = (chip) => find(chip.props.face, (n) => n.type === "svg").props["data-tone"];
/** A language option's group, by the key the contracts file it under ("on", "ready", "add"), from its heading. */
const groupKey = (heading) =>
  Object.entries(contracts.LANGUAGE_GROUP_WORDS).find(([, words]) => words === heading)?.[0];
/** A language chip's options in a row, each with its group's key, and one of them by its code. */
const optionsIn = (row) => optionsOf(pickerOf(row, "template-lang")).map((o) => ({ ...o, group: groupKey(o.group) }));
const optionOf = (row, lang) => optionsIn(row).find((o) => o.value === lang);
/** A language picked from the chip in a row, as its Picker is told. */
const pickLanguage = (row, lang) => pickerOf(row, "template-lang").props.onValueChange(lang);
/** Wait, a turn at a time and never long, for what an async chain is to make true; whether it did. */
const until = async (ok) => {
  for (let i = 0; i < 200 && !ok(); i += 1) await settle();
  return ok();
};
/**
 * WhatsApp's sync held in flight, and let go. The page imports the verb (verbs.ts syncTemplates, the client's
 * POST templates/sync), so a test holds the answer where the client asks for it: the window's fetch. What the refresh
 * map re-reads behind a write is templates-truth.test.mjs's, so it is emptied for the route while the sync is held.
 */
const holdSync = () => {
  const was = { fetch: globalThis.fetch, after: AFTER["POST templates/sync"] };
  let release = () => {};
  globalThis.fetch = (url) => {
    if (!String(url).includes("templates/sync")) return Promise.reject(new Error(`not held: ${url}`));
    return new Promise((r) => {
      release = (data) => r({ status: 200, headers: { get: () => null }, json: async () => ({ ok: true, data }) });
    });
  };
  AFTER["POST templates/sync"] = () => [];
  return {
    finish: (data) => release(data),
    restore() {
      globalThis.fetch = was.fetch;
      AFTER["POST templates/sync"] = was.after;
    },
  };
};
/** A fresh mount: nothing kept from the last page, no listener left behind by it. */
const fresh = () => {
  freshTree();
  went.length = 0;
};

/** The detail's reads, answered in order per broadcast; the last answer repeats. */
const answers = new Map();
// The verb the run's screen reads through (verbs.ts `broadcasts.detail`): answered from the queue above. Its words for a
// failure, a report and an approval are the verbs' own (contracts, stamped by the clock the page runs on), not stand-ins.
broadcasts.detail = async (id) => {
  const queue = answers.get(id) || [];
  return (
    (queue.length > 1 ? queue.shift() : queue[0]) || {
      ok: false,
      code: "not_found",
      status: 404,
      message: "Broadcast not found.",
    }
  );
};
/** What the screens are drawn from: Sent's runs, with who each audience reaches once that is read (the page's own read). */
const dataNow = () => {
  const live = surfaceValue("broadcasts");
  return live ? { ...surfaceValue("audiences"), ...live } : null;
};
/** Whether New, which hosts the send screen, has been told it was left (sent, scheduled or cancelled): it closes then. */
let left = false;
/**
 * The send screen as the one New hosts it (home/new-message.tsx NewOnce: the Campaigns wiring review's lane 6), on the
 * audience its address names: its toast the host's, its door to their yes New's address replaced, and New closed once the
 * screen says it was left. Sent's page, which hosted it beside Sequences' list, went with its mount.
 */
function SendHost({ initialSegment = null }) {
  const data = dataNow();
  if (left || !data) return null;
  return globalThis.React.createElement(BroadcastSend, {
    data,
    initialSegment,
    flash: (t) => toasts.push(t),
    onDone: () => {
      left = true;
    },
    // The door to their yes moves New itself: its address is replaced by People's sheet's, and New is left with it.
    onYes: (route) => {
      went.push(route);
      left = true;
    },
  });
}
/**
 * What a test asks to see: a run's one screen at its home (`initialRun`: BroadcastRun, lane 2), People's Get their yes
 * (`initialYes`: lane 7), else the send screen as New hosts it, on the audience named.
 */
const screen = (props) => {
  if (props.initialRun) return BroadcastRun({ id: props.initialRun });
  if (props.initialYes) return globalThis.React.createElement(GetYesSheet, { open: true, onClose() {} });
  return SendHost(props);
};
const page = (props) => {
  fresh();
  left = false;
  return screen(props);
};
const again = (props) => drawAgain(() => screen(props));
/** The send screen, open on the audience named, or on the one it opens on where none is: drawn twice, as a page settles. */
const writing = (props) => {
  page(props);
  return again(props);
};
/**
 * Send it again goes to Campaigns' composer (`campaigns/new`), its send kept in the tab as a send half-written is
 * (page/runs.tsx bcAgainOf): the tab's memory, as the shell keeps it (legacy-bridge/tab-memory.ts), held for a test that
 * hands a send on and taken away after it, so no other test's composer opens on what it kept.
 */
const withTabMemory = async (fn) => {
  const kept = new Map();
  const at = (kind, key) => `${kind}:${key ?? ""}`;
  globalThis.window.__tabMemory = {
    place: () => null,
    keepPlace() {},
    draft: (kind, key) => kept.get(at(kind, key)) ?? null,
    keepDraft: (kind, value, key) => void kept.set(at(kind, key), value),
    dropDraft: (kind, key) => void kept.delete(at(kind, key)),
  };
  try {
    await fn();
  } finally {
    delete globalThis.window.__tabMemory;
  }
};
/** Campaigns' composer as Send it again opens it: the send screen (BroadcastSend), on what the tab kept. */
const sentAgain = () => {
  const props = { data: surfaceValue("broadcasts"), flash() {}, onDone() {}, onYes() {} };
  fresh();
  BroadcastSend(props);
  drawAgain(() => BroadcastSend(props));
  return drawAgain(() => BroadcastSend(props));
};
/**
 * What the settings surface holds of the workspace, as Templates reads it (surface.ts SettingsSurface): the record, the
 * channels, every template with what uses each and when each last went out. `__TEMPLATES_ALL` is the pages' name for
 * the same list, which a template's title is looked up in by its name (verbs.ts titleOf), as the app publishes it.
 */
const settingsOf = (over = {}) => {
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
  globalThis.__TEMPLATES_ALL = held.templatesAll;
  return held;
};
/** The settings surface read again with one thing changed, as its next read lands: the rest as it was. */
const settingsChanged = (over) => settingsOf({ ...surfaceValue("settings"), messages: undefined, ...over });
/**
 * Messages on a workspace with a WhatsApp number, over the starter library the page imports. No playbooks unless a test
 * gives them: a row reads which language a running playbook sends, and one left by a Playbooks test (the default
 * Win-back, in English) would flag a starter it never set out to.
 */
const messages = ({ playbooks: held, ...over } = {}) => {
  // The playbooks a test names, over the surface as its read publishes it whole (its shape and number beside the rows).
  setSurfaceValue("playbooks", held === undefined ? undefined : playbooksSurface(held));
  settingsOf(over);
  fresh();
  return TemplatesPage();
};
const messagesAgain = () => drawAgain(() => TemplatesPage());
/** Messages with one message OPEN: a row carries what it is, and the words and the verbs are inside it. */
const messagesOpen = (over = {}, which = "custom-row") => {
  const tree = messages(over);
  const row = byTestId(tree, which);
  press(find(row, (n) => n.props?.["data-testid"] === "template-open"));
  return messagesAgain();
};
/**
 * The message the surface stamps on a template it offers (surfaces/campaigns/parts/channels.ts cmOfferedMessages), made as the
 * reader makes it, of a row on each channel the template holds: what the Send by row reads a closed channel's words from.
 */
const messageHeld = (t) =>
  contracts.campaignMessageOf(
    (t.channels ?? ["whatsapp"]).map((channel) => ({
      ...t,
      id: channel === "whatsapp" ? t.id : `${t.id}-${channel}`,
      channel,
    })),
    t.name,
    t.language,
  );
const withMessage = (t) => ({ ...t, message: messageHeld(t) });
const templateRow = (over = {}) => {
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
/** The visit reminder as WhatsApp holds it, with the starter's own slots. */
const visitTemplate = () => {
  const starter = starters.forTrigger("visit_tomorrow");
  const slots = starters.text(starter, "en_US").slots;
  return {
    starter,
    slots,
    row: {
      id: "tpl-visit",
      name: starter.name,
      language: "en_US",
      channel: "whatsapp",
      meta_status: "approved",
      category: "utility",
      purpose: "conversational",
      body_preview: slots.map((_, i) => `{{${i + 1}}}`).join(" "),
      variables: slots.map((s, i) => ({ position: i + 1, label: s.label, example: s.example })),
    },
  };
};
/** A starter as WhatsApp holds it once approved: the library's words and slots. */
const starterTemplate = (name) => {
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
/** The message's slots, each the control in the bubble that changes what fills it (parts/slot.tsx), in their order. */
const slotElements = (tree) => all(tree, (n) => n.type === CmSlot);
/** The slots that are typed, in their order: the boxes the table of slots had. */
const typedOf = (tree) => slotElements(tree).filter((s) => s.props.kind === "text");
/** Each slot as the composer lists it: what fills it, and what else it offers (nothing, when it has no choice). */
const slotsOf = (tree) =>
  slotElements(tree).map((s) => ({
    kind: s.props.kind,
    offers: s.props.offers.length > 1 ? s.props.offers.map((o) => o.id) : [],
  }));
/**
 * A drawing's words as a customer reads them. A slot is its words in a control (parts/slot.tsx) whose Tooltip draws nothing
 * on this stub, so textOf stops at it: its words are the `text` it was given.
 */
const wordsOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(wordsOf).join("");
  if (n.type === CmSlot) return n.props.text;
  return wordsOf(n.rendered !== undefined ? n.rendered : n.props?.children);
};
/** What a picker's token says: the page's face, else the one chosen, else what it says with none. */
const faceOf = (tree, testid) => {
  const p = pickerOf(tree, testid);
  const one = optionsOf(p).find((o) => o.value === p.props.value);
  return textOf(p.props.face ?? (one ? one.label : (p.props.placeholder ?? "")));
};
/** The list the send is for, as its token says it: the one chosen, with the count this message reaches (its option's word at the end). */
const audienceOf = (tree) => {
  const p = pickerOf(tree, "bc-audience");
  const one = optionsOf(p).find((o) => o.value === p.props.value);
  return one ? `${one.label} ${one.meta}` : null;
};

/* ------------------------------ a slot's words ------------------------------ */

test("REGRESSION (C6): a broadcast offers no visit's words, and a run's values say what fills them -- a broadcast could name a visit it does not have, and the detail printed visit_when", async () => {
  const { row, slots } = visitTemplate();
  assert.ok(
    slots.some((s) => s.kind.startsWith("visit_")),
    "the fixture is the starter that names a visit",
  );
  // Beside it, a message written elsewhere: each of its slots a guess, so each may take any source a broadcast has.
  const own = templateRow({
    id: "tpl-own",
    name: "autumn_offer",
    purpose: "marketing",
    body_preview: "Hi {{1}}, {{2}} {{3}}.",
    variables: [
      { position: 1, label: "Name", example: "Dani" },
      { position: 2, label: "The offer", example: "20% off" },
      { position: 3, label: "When", example: "tomorrow at 2" },
    ],
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [row, own], number: healthyNumber }));
  let tree = writing({ initialSegment: null, initialRun: null });
  // The visit reminder is a visit playbook's: a broadcast has no visit to fill its time and service with, so it is
  // not offered. It was, with those two slots typed once for everyone.
  // The message is the kit's picker (one option per message), and each slot the control in the bubble (parts/slot.tsx):
  // the sources it may take are its offers.
  const pickable = optionsOf(pickerOf(tree, "bc-template"));
  assert.deepEqual(
    pickable.map((o) => o.label.toLowerCase().includes("autumn")),
    [true],
    `REGRESSION: ${pickable.map((o) => o.label).join(" | ")}`,
  );
  const fills = slotElements(tree);
  assert.equal(fills.length, own.variables.length);
  for (const fill of fills) {
    const offered = fill.props.offers.map((o) => o.id);
    assert.ok(!offered.some((k) => k.startsWith("visit_")), `REGRESSION: a broadcast offered ${offered.join(", ")}`);
    assert.ok(offered.includes(fill.props.kind), `the slot's value, ${fill.props.kind}, is one it offers`);
  }

  answers.set("b-visit", [
    {
      ok: true,
      data: detailOf(
        dto({
          id: "b-visit",
          name: "Visit reminder · 2026-09-15",
          params: [{ kind: "visit_when" }, { kind: "first_name" }],
        }),
      ),
    },
  ]);
  const props = { initialSegment: null, initialRun: "b-visit" };
  page(props);
  await settle();
  tree = again(props);
  const values = find(
    byTestId(tree, "bc-detail"),
    (n) => n.props?.className === "cl-prof-aut-hint" && textOf(n).startsWith("Values:"),
  );
  assert.equal(textOf(values), "Values: their booked time · their first name", "REGRESSION: visit_when");
});

test("REGRESSION: a starter's first name is each person's own on a broadcast and offers no other source -- it could be set to the booking link, and a broadcast greeted everyone 'Hi your booking link'", async () => {
  const sent = [];
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [starterTemplate("winback_offer")],
      number: healthyNumber,
      bookingLink: true,
    }),
  );
  broadcasts.send = async (body) => {
    sent.push(body);
    return {
      ok: true,
      data: {
        id: "b-new",
        name: "Win-back",
        recipient_count: 2,
        scheduled_for: new Date().toISOString(),
        moved_from: null,
      },
    };
  };
  let tree = writing({ initialSegment: null, initialRun: null });
  assert.deepEqual(
    slotsOf(tree),
    [
      { kind: "first_name", offers: [] },
      { kind: "business_name", offers: ["business_name", "text"] },
      { kind: "booking_link", offers: ["booking_link", "text"] },
    ],
    "a first name has no choice; the business name and the link may be typed over, and nothing else",
  );
  const first = slotElements(tree)[0];
  assert.deepEqual(
    first.props.offers.map((o) => o.label),
    ["Their first name"],
    "what fills it, in words",
  );
  assert.ok(
    String(first.props.hint).includes("“there” when none is on file"),
    `and what a person with no name on file reads: ${first.props.hint}`,
  );
  assert.equal(typedOf(tree).length, 0, "nothing to type on a starter that knows every slot");

  // Typed over, the business name starts from it; what goes out greets each person by their own name.
  slotElements(tree)[1].props.onKind("text");
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(typedOf(tree)[0].props.typed, "Northside Studio");
  press(byTestId(tree, "bc-send"));
  await press(byTestId(again({ initialSegment: null, initialRun: null }), "bc-send-yes"));
  assert.deepEqual(sent.at(-1).params, [{ kind: "first_name" }, "Northside Studio", { kind: "booking_link" }]);
});

test("REGRESSION: Send it again puts right a slot a run filled with what it cannot take -- the composer took a run's sources as they were", () =>
  withTabMemory(async () => {
    // Sent by hand with the old free choice: the first name filled by the booking link, the business name typed, and a link the workspace has since removed.
    const wrong = dto({
      id: "b-wrong",
      name: "Win-back by hand",
      playbook_id: null,
      run_for: null,
      template_id: "tpl-winback_offer",
      template_name: "winback_offer",
      audience: { kind: "saved", id: "s1", label: "Regulars" },
      params: [{ kind: "booking_link" }, { kind: "text", value: "Northside" }, { kind: "booking_link" }],
    });
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        templates: [starterTemplate("winback_offer")],
        number: healthyNumber,
        rows: [toBroadcastVM(wrong, ZONE)],
      }),
    );
    answers.set("b-wrong", [{ ok: true, data: detailOf(wrong) }]);
    const props = { initialSegment: null, initialRun: "b-wrong" };
    page(props);
    await settle();
    press(byTestId(again(props), "bc-again"));
    assert.equal(went.at(-1), "campaigns/sequences/new:once", "New's Send once, filled with what the run sent");
    const tree = sentAgain();
    assert.deepEqual(
      slotsOf(tree),
      [
        { kind: "first_name", offers: [] },
        { kind: "text", offers: ["business_name", "text"] },
        { kind: "text", offers: [] },
      ],
      "each person's own name; the words it said, where words may go; a link with none on file can only be typed",
    );
    assert.deepEqual(
      typedOf(tree).map((x) => x.props.typed),
      ["Northside", ""],
    );
  }));

test("the review ask's review-link slot is the Google listing's link on a broadcast only where the listing keeps one; with none it can only be typed, as a booking link with none on file", () => {
  for (const [reviewLink, last] of [
    [true, { kind: "review_link", offers: ["review_link", "text"] }],
    [false, { kind: "text", offers: [] }],
  ]) {
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({ templates: [starterTemplate("after_visit_review")], number: healthyNumber, reviewLink }),
    );
    const tree = writing({ initialSegment: null, initialRun: null });
    assert.deepEqual(
      slotsOf(tree),
      [{ kind: "first_name", offers: [] }, { kind: "business_name", offers: ["business_name", "text"] }, last],
      `the listing keeps ${reviewLink ? "one" : "none"}`,
    );
  }
});

/* ------------------------------ a broadcast's state ------------------------------ */

test("REGRESSION (C12): a failed broadcast says why in its detail -- it read '· failed' with the reason on file", async () => {
  const failed = dto({ id: "b-failed", name: "September offer", state: "failed", failure: "template_not_approved" });
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [toBroadcastVM(failed, ZONE)] }));
  answers.set("b-failed", [{ ok: true, data: detailOf(failed, []) }]);
  const props = { initialSegment: null, initialRun: "b-failed" };
  page(props);
  await settle();
  const tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-detail-failure")), "It stopped: its WhatsApp version is no longer approved.");
  // And, opened, how to get past it -- never "something went wrong".
  assert.ok(
    textOf(byTestId(tree, "bc-stopped")).includes(
      "Open it in Messages — its WhatsApp version can be resubmitted, or the message written as an email or a text.",
    ),
    textOf(byTestId(tree, "bc-stopped")),
  );
});

test("an opened run is sent again from its own head: Campaigns' composer, filled with its template, its list and its values -- and no button when one of them cannot go", () =>
  withTabMemory(async () => {
    const note = {
      id: "tpl-note",
      channel: "whatsapp",
      name: "a_quick_note",
      language: "en_US",
      meta_status: "approved",
      category: "utility",
      purpose: "conversational",
      body_preview: "Hi {{1}}",
      variables: [{ position: 1, label: "First name", example: "Dani" }],
    };
    const offer = {
      id: "tpl-offer",
      channel: "whatsapp",
      name: "autumn_offer",
      language: "en_US",
      meta_status: "approved",
      category: "marketing",
      purpose: "marketing",
      body_preview: "Hi {{1}}, {{2}}",
      variables: [
        { position: 1, label: "First name", example: "Dani" },
        { position: 2, label: "The offer", example: "20% off" },
      ],
    };
    const byHand = dto({
      id: "b-hand",
      name: "Autumn colour",
      playbook_id: null,
      run_for: null,
      template_id: "tpl-offer",
      template_name: "autumn_offer",
      audience: { kind: "saved", id: "s1", label: "Regulars" },
      params: [{ kind: "first_name" }, { kind: "text", value: "20% off colour" }],
    });
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        templates: [note, offer],
        number: healthyNumber,
        rows: [byHand, dto()].map((b) => toBroadcastVM(b, ZONE)),
      }),
    );
    answers.set("b-hand", [{ ok: true, data: detailOf(byHand) }]);
    const props = { initialSegment: null, initialRun: "b-hand" };
    page(props);
    await settle();
    let tree = again(props);
    press(byTestId(tree, "bc-again"));
    assert.equal(
      went.at(-1),
      "campaigns/sequences/new:once",
      "onto New's Send once, pushed, so Back returns to the run",
    );
    tree = sentAgain();
    assert.ok(byTestId(tree, "bc-composer"), "onto the send screen");
    assert.ok(audienceOf(tree).startsWith("Regulars"), "its list");
    assert.ok(
      pickerOf(tree, "bc-template").props.value === "autumn_offer" && faceOf(tree, "bc-template").includes("Autumn"),
      "its template, not the one the screen opens on",
    );
    assert.deepEqual(
      slotElements(tree).map((x) => x.props.kind),
      ["first_name", "text"],
      "its values, by what fills them",
    );
    assert.equal(typedOf(tree)[0].props.typed, "20% off colour", "and the words it said");

    // A playbook's run is sent again by its playbook, and a template WhatsApp no longer approves cannot go at all.
    answers.set("b-sent", [{ ok: true, data: detailOf(dto()) }]);
    page({ initialSegment: null, initialRun: "b-sent" });
    await settle();
    assert.equal(
      byTestId(again({ initialSegment: null, initialRun: "b-sent" }), "bc-again"),
      null,
      "a playbook's run is sent again by its playbook",
    );
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        templates: [note],
        number: healthyNumber,
        rows: [byHand].map((b) => toBroadcastVM(b, ZONE)),
      }),
    );
    page(props);
    await settle();
    assert.equal(
      byTestId(again(props), "bc-again"),
      null,
      "REGRESSION-IN-WAITING: a send screen quietly filled with another template",
    );
  }));

test("a run waiting on you opens as the sheet the canvas draws -- where it sits in the queue, who it reaches by the rules that made it, the words, and Approve alone at the foot -- and approving opens the next one", async () => {
  const today = globalThis.window.__clock.dayKey(Date.now());
  const offer = {
    id: "tpl-offer",
    channel: "whatsapp",
    name: "monthly_offer",
    language: "en_US",
    meta_status: "approved",
    category: "marketing",
    purpose: "marketing",
    body_preview: "Hi {{1}}, this month at {{2}}: a free gloss with any cut.",
    variables: [],
  };
  const waitingRun = (id, name, pb) =>
    dto({
      id,
      name,
      state: "pending_approval",
      started_at: null,
      finished_at: null,
      scheduled_for: iso(-H),
      counts: quiet,
      recipient_count: 2,
      playbook_id: pb,
      run_for: today,
      template_id: "tpl-offer",
      template_name: "monthly_offer",
      params: [{ kind: "first_name" }, { kind: "business_name" }],
      audience: { kind: "playbook", id: pb, label: name },
    });
  const first = waitingRun("b-wait", "The month's offer", "pb-offer");
  const second = waitingRun("b-wait-2", "Win-back", "pb-1");
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [offer],
      rows: [first, second].map((b) => toBroadcastVM(b, ZONE)),
    }),
  );
  setSurfaceValue(
    "playbooks",
    playbooksSurface({
      rows: [
        playbook({
          id: "pb-offer",
          name: "The month's offer",
          trigger: "everyone_monthly",
          policy_class: "campaign",
          cap_per_run: 250,
          cadence_days: 30,
          triggerHint: "Everyone who said yes, on a cadence",
        }),
        playbook(),
      ],
    }),
  );
  const people = [
    person({
      contact_id: "k0",
      name: "+1 (917) 555-0142",
      first_name: null,
      state: "queued",
      sent_at: null,
      message_status: null,
      delivered_at: null,
    }),
    person({ state: "queued", sent_at: null, message_status: null, delivered_at: null }),
  ];
  answers.set("b-wait", [{ ok: true, data: detailOf(first, people) }]);
  const approved = [];
  const keep = { approve: broadcasts.approve, cancel: broadcasts.cancel };
  broadcasts.approve = async (id) => {
    approved.push(id);
    return { ok: true, data: { recipient_count: 2, scheduled_for: iso(0), moved_from: null } };
  };
  try {
    const props = { initialSegment: null, initialRun: "b-wait" };
    page(props);
    await settle();
    let tree = again(props);
    const sheet = byTestId(tree, "bc-sheet");
    assert.ok(sheet, "a run waiting on you is its sheet, not a report of nothing sent");
    assert.equal(byTestId(tree, "bc-figures"), null);
    // The sheet's own top (back, "Waiting for your approval", its place) and its title are the pane's head now (the layout is the
    // Inbox's list + pane, docs/2026-10-02-campaigns-on-the-kit.md §3.1), outside the sheet's body.
    assert.equal(
      textOf(byTestId(tree, "bc-sheet-pos")),
      "Waiting for your approval · 1 of 2",
      "where it sits among the runs waiting",
    );
    assert.equal(paneTitle(tree), "The month's offer");
    // What made the run, first on the sheet's line, in its own words: never a playbook to its reader (decision 19), and no
    // "Campaign ·" before it or when it goes after it, which wrapped onto a line of its own on a phone. When it goes is
    // said beside the Approve it speaks of, as a line of its own.
    const hint = textOf(byTestId(sheet, "bc-sheet-hint"));
    assert.equal(hint, "Everyone who said yes, on a cadence", "its campaign's own words for who it is for");
    assert.doesNotMatch(textOf(sheet), /Playbook · /);
    assert.match(
      textOf(byTestId(sheet, "bc-sheet-goes")),
      /^Goes (the moment you approve it|at .+ once you approve it)\. /,
    );
    const reach = textOf(byTestId(sheet, "bc-sheet-reach"));
    assert.ok(
      reach.includes("2will get it") &&
        reach.includes("each said yes to offers") &&
        reach.includes("none hears from you within a week of it"),
      reach,
    );
    assert.ok(!/ of \d/.test(reach), `REGRESSION-IN-WAITING: a pool the run never recorded -- ${reach}`);
    const words = textOf(byTestId(sheet, "bc-sheet-words"));
    assert.ok(
      words.includes("Hi Rosa, this month at Northside Studio") && words.includes("as Rosa Díaz reads it"),
      words,
    );
    assert.equal(
      textOf(byTestId(sheet, "bc-sheet-hi")),
      "1 gets \u201cHi there\u201d \u2014 no name on file",
      "the case nobody is shown before a send, shown before this one",
    );
    assert.ok(
      textOf(byTestId(sheet, "bc-sheet-approve")).includes("Approve \u00b7 2 people"),
      textOf(byTestId(sheet, "bc-sheet-approve")),
    );
    // Who gets it, folded under its head, its press at the head's right (19 Oct 2026: it was a half of the foot beside
    // Approve): closed, the head alone; opened, its rows, brought into view as they open (on a phone they opened under
    // the message, off the screen).
    const fold = byTestId(sheet, "bc-sheet-people");
    const foldPress = byTestId(fold, "bc-sheet-people-press");
    assert.equal(textOf(fold).trim(), contracts.WHO_GETS_IT_WORDS.head, "closed, the head alone");
    assert.deepEqual(
      [foldPress.props["aria-label"], foldPress.props["aria-expanded"], fold.props["data-open"]],
      [contracts.WHO_GETS_IT_WORDS.show, false, "false"],
    );
    assert.equal(all(fold, (n) => n.props?.["data-testid"] === "bc-person").length, 0, "closed, no rows");
    assert.equal(byTestId(byTestId(sheet, "bc-sheet-acts"), "bc-sheet-see"), null, "no list press in the foot");
    press(foldPress);
    tree = again(props);
    const opened = byTestId(tree, "bc-sheet-people");
    assert.equal(all(opened, (n) => n.props?.["data-testid"] === "bc-person").length, 2);
    assert.deepEqual(
      [byTestId(opened, "bc-sheet-people-press").props["aria-label"], opened.props["data-open"]],
      [contracts.WHO_GETS_IT_WORDS.hide, "true"],
    );
    let brought = null;
    find(opened, (n) => typeof n.props?.ref === "function").props.ref({ scrollIntoView: (how) => (brought = how) });
    assert.deepEqual(brought, { block: "nearest" }, "the rows, as they mount, scrolled to where they are seen whole");
    // Approved, the next run waiting opens.
    await press(byTestId(tree, "bc-sheet-approve"));
    assert.deepEqual(approved, ["b-wait"]);
    assert.equal(went.at(-1), "campaigns/sequences/pb-1/runs/b-wait-2", "a queue of two is two presses, at its home");

    // Skip arms before it acts, as every stop on the page does (D13).
    const skipped = [];
    broadcasts.cancel = async (id) => {
      skipped.push(id);
      return { ok: true, data: { was: "pending_approval" } };
    };
    page(props);
    await settle();
    tree = again(props);
    // One word per act (decision 19): Skip, as on every row a run is decided.
    assert.equal(textOf(byTestId(tree, "bc-sheet-skip")).trim(), contracts.LIFECYCLE_WORDS.ledger.skip);
    press(byTestId(tree, "bc-sheet-skip"));
    tree = again(props);
    assert.equal(skipped.length, 0, "one press does not skip");
    assert.equal(byTestId(tree, "bc-sheet-approve"), null, "the question stands alone");
    assert.ok(
      textOf(byTestId(tree, "bc-sheet-skip-confirm")).includes("Nothing sends, and the run closes."),
      "and it says what skipping does",
    );
    await press(byTestId(tree, "bc-sheet-skip-yes"));
    assert.deepEqual(skipped, ["b-wait"]);
    assert.equal(went.at(-1), "campaigns/sequences/pb-1/runs/b-wait-2");

    // A run whose day has passed is refused by approveRun: the sheet says why, and offers the skip.
    const stale = { ...first, run_for: "2020-01-01" };
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: [offer], rows: [toBroadcastVM(stale, ZONE)] }));
    answers.set("b-wait", [{ ok: true, data: detailOf(stale, people) }]);
    page(props);
    await settle();
    tree = again(props);
    assert.equal(byTestId(tree, "bc-sheet-approve"), null, "REGRESSION-IN-WAITING: a button the server refuses");
    assert.ok(textOf(byTestId(tree, "bc-sheet-expired")).includes("that day has passed"));
    assert.equal(textOf(byTestId(tree, "bc-sheet-pos")), "Waiting for your approval", "the only one waiting");

    // On a phone the acts dock at the pane's foot, as a sequence's do: Approve and who gets it an equal pair, when it goes
    // a line over them, and Skip in the head's menu, asked in the dock (the Inbox's run review, 18 Oct 2026). They stood
    // after the words, a solid slab halfway down the screen.
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({ templates: [offer], rows: [first, second].map((b) => toBroadcastVM(b, ZONE)) }),
    );
    answers.set("b-wait", [{ ok: true, data: detailOf(first, people) }]);
    const media = globalThis.matchMedia;
    globalThis.matchMedia = (q) => ({
      matches: q === "(max-width: 900px)",
      addEventListener() {},
      removeEventListener() {},
    });
    try {
      page(props);
      await settle();
      tree = again(props);
      const docks = all(tree, (n) => n.props?.["data-testid"] === "bc-sheet-acts");
      assert.equal(docks.length, 1, "the acts once, at the foot, not again in the sheet's body");
      // One row, as a sequence's record docks its Approve: when it goes, then Approve. Its line over the button made two
      // rows in a capsule rounded as one, whose ends cut across the pill's (19 Oct 2026).
      assert.equal(docks[0].props["data-foot-pair"], undefined, "a row, not the stacked pair");
      assert.ok(docks[0].props.className.split(" ").includes("bc-dock-row"), docks[0].props.className);
      const [said, act] = docks[0].props.children.filter(Boolean);
      assert.equal(said.props["data-testid"], "bc-sheet-goes", "when it goes, first");
      assert.equal(act.props["data-testid"], "bc-sheet-approve", "then the Approve it speaks of");
      assert.match(textOf(said), /^Goes /, "when it goes, beside the Approve it speaks of");
      assert.ok(byTestId(docks[0], "bc-sheet-approve"), "Approve across the foot");
      assert.equal(
        byTestId(docks[0], "bc-sheet-see"),
        null,
        "who gets it is the sheet's own fold, not a half of the foot",
      );
      assert.equal(byTestId(docks[0], "bc-sheet-skip"), null, "Skip is in the head's menu, never beside Approve");
      const more = find(tree, (n) => Array.isArray(n.props?.groups) && /^More for /.test(n.props.label ?? ""));
      assert.equal(more.props.label, "More for The month's offer", "the head's menu, named for the run");
      const skip = more.props.groups[0].items[0];
      assert.equal(skip.label, `${contracts.LIFECYCLE_WORDS.ledger.skip}…`);
      skip.onSelect();
      tree = again(props);
      const asked = byTestId(tree, "bc-sheet-acts");
      assert.equal(byTestId(asked, "bc-sheet-approve"), null, "the question stands alone in the dock");
      assert.ok(textOf(byTestId(asked, "bc-sheet-skip-confirm")).includes("Nothing sends, and the run closes."));
      await press(byTestId(asked, "bc-sheet-skip-yes"));
      assert.deepEqual(skipped, ["b-wait", "b-wait"], "skipped from the dock");
    } finally {
      globalThis.matchMedia = media;
    }
  } finally {
    Object.assign(broadcasts, keep);
  }
});

test("REGRESSION: a run waiting on you says the words on the channel its reader is reached on -- an email's subject and words, a text's words and STOP line -- named for the channel, never WhatsApp's under another's name", async () => {
  const today = globalThis.window.__clock.dayKey(Date.now());
  const note = withMessage({
    id: "tpl-note",
    channel: "whatsapp",
    name: "visit_note",
    language: "en_US",
    meta_status: "approved",
    category: "utility",
    purpose: "conversational",
    body_preview: "Hi {{1}}, your visit is tomorrow.",
    variables: [{ position: 1, label: "First name" }],
    channels: ["whatsapp", "sms", "email"],
    versions: {
      email: { subject: "Your visit, {{1}}", body: "Hi {{1}},\nwe will see you tomorrow." },
      sms: { subject: null, body: "Visit tomorrow, {{1}}." },
    },
  });
  /** The sheet of a waiting run whose first person is reached on `channel`, over `tpl` and the channels the run counted. */
  const sheetOf = async (channel, tpl = note, by = null) => {
    const run = dto({
      id: "b-ch",
      name: "Visit reminders",
      state: "pending_approval",
      started_at: null,
      finished_at: null,
      scheduled_for: iso(-H),
      counts: quiet,
      recipient_count: 2,
      playbook_id: "pb-visit",
      run_for: today,
      template_id: "tpl-note",
      template_name: "visit_note",
      params: [{ kind: "first_name" }],
      audience: { kind: "playbook", id: "pb-visit", label: "Visit reminders", ...(by ? { reach: by } : {}) },
    });
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: [tpl], rows: [toBroadcastVM(run, ZONE)] }));
    // A visit's moment: its message is about their own visit, which by email carries the visit foot (no postal address owed).
    // The business's news by email carries an offer's, which does (decision D2).
    setSurfaceValue(
      "playbooks",
      playbooksSurface({
        rows: [
          playbook({ id: "pb-visit", name: "Visit reminders", trigger: "visit_tomorrow", policy_class: "booking" }),
        ],
      }),
    );
    const queued = { state: "queued", sent_at: null, message_status: null, delivered_at: null };
    answers.set("b-ch", [
      { ok: true, data: detailOf(run, [person({ ...queued, channel }), person({ ...queued, contact_id: "k2" })]) },
    ]);
    const props = { initialSegment: null, initialRun: "b-ch" };
    page(props);
    await settle();
    return byTestId(again(props), "bc-sheet-words");
  };

  // By email: the subject, the words of the email, and who reads them, by email -- not one of WhatsApp's words.
  const mail = await sheetOf("email");
  assert.equal(mail.props["data-channel"], "email");
  assert.equal(textOf(byTestId(mail, "bc-sheet-subject")), "Your visit, Rosa");
  assert.ok(textOf(mail).includes("we will see you tomorrow."), textOf(mail));
  assert.ok(!textOf(mail).includes("your visit is tomorrow"), "WhatsApp's words are not an email's");
  assert.equal(textOf(byTestId(mail, "bc-sheet-reader")), "as Rosa Díaz reads it · by email");
  // By text: its words and the STOP line the sender adds.
  const text = await sheetOf("sms");
  assert.equal(byTestId(text, "bc-sheet-subject"), null, "a text has no subject");
  assert.ok(textOf(text).includes("Visit tomorrow, Rosa."), textOf(text));
  assert.ok(textOf(text).includes("Reply STOP to opt out"), "the STOP line is part of what they read");
  assert.equal(textOf(byTestId(text, "bc-sheet-reader")), "as Rosa Díaz reads it · by text");
  // By WhatsApp alone: what the sheet always said, with no channel named.
  const wa = await sheetOf("whatsapp");
  assert.ok(textOf(wa).includes("Hi Rosa, your visit is tomorrow."), textOf(wa));
  assert.equal(textOf(byTestId(wa, "bc-sheet-reader")), "as Rosa Díaz reads it");
  // A run that goes by more than WhatsApp names the channel even for the reader on WhatsApp.
  const split = await sheetOf("whatsapp", note, {
    pool: 2,
    will: 2,
    by_channel: { whatsapp: 1, sms: 0, email: 1 },
    noNumber: 0,
    stopped: 0,
    noYes: 0,
    heardThis: 0,
    heardAny: 0,
    overCap: 0,
    overLimit: 0,
  });
  assert.equal(textOf(byTestId(split, "bc-sheet-reader")), "as Rosa Díaz reads it · on WhatsApp");
  // The reader's version is not in hand (the page holds none for it): WhatsApp's words stand under no channel's name, and
  // the sheet says why, rather than draw them as an email.
  const bare = await sheetOf("email", { ...note, versions: undefined });
  assert.equal(textOf(byTestId(bare, "bc-sheet-version-note")), "This message has no email version yet.");
  assert.equal(byTestId(bare, "bc-sheet-subject"), null);
  assert.equal(
    textOf(byTestId(bare, "bc-sheet-reader")),
    "as Rosa Díaz reads it",
    "no channel's name on words that are not its own",
  );
});

test("a run that kept who it left out opens as the board's card: of how many, the grey and the amber, a line per reason, and the door to getting their yes", async () => {
  const today = globalThis.window.__clock.dayKey(Date.now());
  const offer = {
    id: "tpl-offer",
    channel: "whatsapp",
    name: "monthly_offer",
    language: "en_US",
    meta_status: "approved",
    category: "marketing",
    purpose: "marketing",
    body_preview: "Hi {{1}}, a free gloss with any cut.",
    variables: [],
  };
  const reach = {
    pool: 312,
    will: 186,
    noNumber: 0,
    stopped: 0,
    noYes: 94,
    heardThis: 0,
    heardAny: 32,
    overCap: 0,
    overLimit: 0,
  };
  const waiting = dto({
    id: "b-kept",
    name: "The month's offer",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
    recipient_count: 186,
    playbook_id: "pb-offer",
    run_for: today,
    template_id: "tpl-offer",
    template_name: "monthly_offer",
    params: [{ kind: "first_name" }],
    audience: { kind: "playbook", id: "pb-offer", label: "The month's offer", reach },
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [offer], rows: [toBroadcastVM(waiting, ZONE)] }));
  setSurfaceValue(
    "playbooks",
    playbooksSurface({
      rows: [
        playbook({
          id: "pb-offer",
          name: "The month's offer",
          trigger: "everyone_monthly",
          policy_class: "campaign",
          cap_per_run: 250,
          cadence_days: 30,
        }),
      ],
    }),
  );
  answers.set("b-kept", [
    {
      ok: true,
      data: detailOf(waiting, [person({ state: "queued", sent_at: null, message_status: null, delivered_at: null })]),
    },
  ]);
  const props = { initialSegment: null, initialRun: "b-kept" };
  page(props);
  await settle();
  const tree = again(props);
  const card = byTestId(byTestId(tree, "bc-sheet"), "bc-sheet-reach");
  assert.equal(textOf(byTestId(card, "bc-sheet-pool")), "312", "out of everyone its moment named");
  assert.deepEqual(
    all(byTestId(card, "bc-sheet-why"), (n) => n.type === "li").map((li) => textOf(li)),
    ["94 never said yes to offersGet their yes", "32 hear from you within a week of it"],
  );
  // The bar is the whole list: green reaches, amber waits, and the grey is the rest.
  const parts = all(card, (n) => /^bc-sheet-bar-/.test(String(n.props?.className || ""))).map((n) => [
    n.props.className,
    n.props.style ? n.props.style.width : null,
  ]);
  assert.deepEqual(parts, [
    ["bc-sheet-bar-will", "59.6%"],
    ["bc-sheet-bar-held", "10.3%"],
    ["bc-sheet-bar-rest", null],
  ]);
  assert.equal(textOf(card).includes("each said yes to offers"), false, "the counts stand where the rules stood");
  // Of every reason, the one an owner can change opens where it is changed.
  press(byTestId(card, "bc-sheet-door"));
  assert.equal(went.at(-1), contracts.GET_YES_ROUTE, "People's Get their yes");
});

test("Sent drew the send screen beside Sequences' list; New's Send once hosts it now, opened on a list's old address and told when it is left", () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  // A link that names a list is asking to write one (the app moves `broadcasts/<list>` to `campaigns/sequences/new:once:to:<list>`,
  // contracts retiredRouteOf): the send screen opens on that list, and Cancel, its Close, tells New it was left.
  assert.equal(contracts.retiredRouteOf("broadcasts/s1"), "campaigns/sequences/new:once:to:s1");
  let tree = page({ initialSegment: "s1", initialRun: null });
  assert.ok(byTestId(tree, "bc-composer"), "People's 'message this list' lands on the send screen");
  assert.equal(byTestId(tree, "bc-band"), null, "no list of runs: a run is a day of its sequence's History");
  assert.equal(byTestId(tree, "bc-compose-close").props["aria-label"], "Cancel", "its Close is the screen's Cancel");
  press(byTestId(tree, "bc-compose-close"));
  // The screen says it was left as it draws again; New closes on its next draw.
  again({ initialSegment: "s1", initialRun: null });
  tree = again({ initialSegment: "s1", initialRun: null });
  assert.equal(byTestId(tree, "bc-composer"), null, "New closes as the screen says it was left");
});

test("REGRESSION: the send screen's 'nobody has said yes' is a door to the QR -- it said 'the phrase and QR below', and since the send became its own screen nothing is below it", () => {
  const optIn = {
    phrase: "YES OFFERS",
    phraseEs: "SI OFERTAS",
    link: "https://wa.me/13055550100?text=YES%20OFFERS",
    qrPath: "/api/v1/consent/qr",
    pageUrl: null,
  };
  const nobody = [
    { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 0, conversational: 0 } },
    { kind: "saved", id: "s1", label: "Regulars", counts: { marketing: 0, conversational: 0 } },
  ];
  const offer = templateRow({ id: "tpl-offer", name: "fall_offer", purpose: "marketing" });
  const note = templateRow({ id: "tpl-note", name: "hours_note", category: "utility", purpose: "conversational" });
  {
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        templates: [offer],
        audiences: nobody,
        number: healthyNumber,
        optIn,
      }),
    );
    const props = { initialSegment: null, initialRun: null };
    let tree = writing(props);
    const line = byTestId(tree, "bc-nobody");
    assert.equal(
      textOf(line),
      "Nobody on “Everyone who said yes” has said yes to offers yet. Record it under “Offers and news” on their profile, or get their yes with the phrase and the QR.",
      "REGRESSION: '…with the phrase and QR below'",
    );
    const door = byTestId(line, "bc-nobody-door");
    assert.equal(
      textOf(door),
      "get their yes with the phrase and the QR",
      "the way to their yes is the door, in the sentence that names it",
    );

    // Pressed: the send screen closes onto Get their yes, People's sheet, where the QR is (the Campaigns wiring review's
    // lane 7).
    press(door);
    assert.equal(went.at(-1), contracts.GET_YES_ROUTE, "where every other 'nobody has said yes' goes (#663)");
    assert.equal(contracts.GET_YES_ROUTE, "clients/get-yes");
    tree = again(props);
    assert.equal(
      byTestId(tree, "bc-composer"),
      null,
      "REGRESSION: navigating while the send screen was up kept it up, and the card undrawn",
    );
    // Then the shell follows the address it went to, People's sheet, which names no list: the send stays shut.
    tree = again({ ...props, initialYes: true });
    assert.equal(byTestId(tree, "bc-composer"), null);
    assert.ok(byTestId(tree, "bc-optin"));

    // Opened from People on a list ("Broadcast to this list"): the door leaves that list's send screen too.
    tree = page({ initialSegment: "s1", initialRun: null });
    assert.ok(
      textOf(byTestId(tree, "bc-nobody")).startsWith("Nobody on “Regulars”"),
      textOf(byTestId(tree, "bc-nobody")),
    );
    press(byTestId(tree, "bc-nobody-door"));
    tree = again({ initialSegment: "s1", initialRun: null });
    assert.equal(byTestId(tree, "bc-composer"), null);
    tree = again({ initialSegment: null, initialRun: null, initialYes: true });
    assert.equal(byTestId(tree, "bc-composer"), null, "the address it lands on does not reopen the list's send");
    assert.ok(byTestId(tree, "bc-optin"));

    // A message for everyone who said yes to messages says so, and has the same door.
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        templates: [note],
        audiences: nobody,
        number: healthyNumber,
        optIn,
      }),
    );
    tree = writing(props);
    assert.equal(
      textOf(byTestId(tree, "bc-nobody")),
      "Nobody on “Everyone who said yes” has said yes to messages yet. Record it on their profile, or get their yes with the phrase and the QR.",
    );
    assert.ok(byTestId(byTestId(tree, "bc-nobody"), "bc-nobody-door"));

    // No number, no QR: no door to a card the ledger does not draw, and no sentence about it.
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        templates: [offer],
        audiences: nobody,
        number: healthyNumber,
        optIn: { ...optIn, link: null, qrPath: null },
      }),
    );
    tree = writing(props);
    assert.equal(
      textOf(byTestId(tree, "bc-nobody")),
      "Nobody on “Everyone who said yes” has said yes to offers yet. Record it under “Offers and news” on their profile.",
    );
    assert.equal(byTestId(tree, "bc-nobody-door"), null);
    // A surface cached before the page knew where the card is: the sentence ends at the profile until it is read again.
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        templates: [offer],
        audiences: nobody,
        number: healthyNumber,
        optIn,
        getYes: undefined,
      }),
    );
    tree = writing(props);
    assert.equal(byTestId(tree, "bc-nobody-door"), null, "never a door to #/undefined");
    assert.ok(textOf(byTestId(tree, "bc-nobody")).endsWith("on their profile."));
  }
});

test("REGRESSION: the send screen tells a list with no number from a list with no yes -- a yes with no number to send to read 'Nobody has said yes', and its door asked for an answer already given", () => {
  const optIn = {
    phrase: "YES OFFERS",
    phraseEs: "SI OFERTAS",
    link: "https://wa.me/13055550100?text=YES%20OFFERS",
    qrPath: "/api/v1/consent/qr",
    pageUrl: null,
  };
  const rows = [
    // Wrote in by email and said yes to both there: an address, and no number (the email channel, live since 18 Sep).
    contact({
      id: "c-ana",
      display_name: "Ana Reyes",
      wa_profile_name: null,
      phone_e164: null,
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      marketing_consent_source: "customer_message",
    }),
    // Walked in, said yes to messages at the desk, and left no number.
    contact({
      id: "c-bea",
      display_name: "Bea Soto",
      wa_profile_name: null,
      phone_e164: null,
      consent_source: "in_person",
      marketing_consent: "unknown",
      channels: [],
      has_chat: false,
      conversation_count: 0,
      latest_conversation_id: null,
      latest_state: null,
      latest_wa_inbound_at: null,
      last_message_at: null,
      last_message_direction: null,
      last_message_sender: null,
      last_inbound_text: null,
      last_inbound_at: null,
    }),
    // A number, and a yes to messages only: offers he was never asked about.
    contact({
      id: "c-luis",
      display_name: "Luis Mora",
      wa_profile_name: "Luis",
      phone_e164: "+17865550199",
      consent_source: "in_person",
      marketing_consent: "unknown",
    }),
  ].map((c) => contracts.toPersonRowVM(c, ZONE, new Date(NOW)));
  const on = (ids) => rows.filter((r) => ids.includes(r.id));
  // A list kept by hand, as the surface publishes it (broadcasts/surface.ts broadcastsOverride): both purposes, from contracts.
  const listOf = (id, label, ids) => {
    const preview = {
      conversational: contracts.audiencePreview(rows, "saved", null, new Set(ids), "conversational", HOW),
      marketing: contracts.audiencePreview(rows, "saved", null, new Set(ids), "marketing", HOW),
    };
    return {
      kind: "saved",
      id,
      label,
      counts: { conversational: preview.conversational.sending, marketing: preview.marketing.sending },
      preview,
      hint: "A list kept by hand — of those whose yes covers this message",
    };
  };
  const audiences = [
    listOf("s-reg", "Regulars", ["c-ana", "c-luis"]),
    listOf("s-walk", "Walk-ins", ["c-bea", "c-luis"]),
    listOf("s-desk", "At the desk", ["c-bea"]),
  ];
  const offer = templateRow({ id: "tpl-offer", name: "fall_offer", purpose: "marketing" });
  const note = templateRow({ id: "tpl-note", name: "hours_note", category: "utility", purpose: "conversational" });
  /** The send screen, opened on a list the way People opens it, with one message to pick: its "nobody" line. */
  const nobodyOn = (list, tpl) => {
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: [tpl], audiences, number: healthyNumber, optIn }));
    const tree = page({ initialSegment: list, initialRun: null });
    assert.ok(byTestId(tree, "bc-composer"), list);
    return byTestId(tree, "bc-nobody");
  };

  // Ana said yes to offers and there is no number to send one to: the list is missing a number, not an answer.
  let line = nobodyOn("s-reg", offer);
  assert.equal(
    textOf(line),
    "Nobody on “Regulars” can be sent an offer yet — a broadcast reaches only a recorded yes with a number to send to.",
    "REGRESSION: 'Nobody on “Regulars” has said yes to offers yet'",
  );
  assert.equal(byTestId(line, "bc-nobody-door"), null, "REGRESSION: a door asking Ana for the yes she gave");
  // People says the same of the same list, and nothing to press (contracts broadcastStep, #663).
  assert.deepEqual(contracts.savedListAction("s-reg", on(["c-ana", "c-luis"])), {
    text: "Nobody on this list can be sent an offer yet — a broadcast reaches only a recorded yes with a number to send to.",
    cta: "Send them a message",
    to: "campaigns/sequences/new:once:to:s-reg",
    enabled: false,
  });

  // Nobody on Walk-ins said yes to offers -- Bea's yes is to messages: that IS a missing answer, and the door stays.
  line = nobodyOn("s-walk", offer);
  assert.equal(
    textOf(line),
    "Nobody on “Walk-ins” has said yes to offers yet. Record it under “Offers and news” on their profile, or get their yes with the phrase and the QR.",
  );
  assert.ok(byTestId(line, "bc-nobody-door"), "the door, for the list that needs a yes");
  assert.equal(
    contracts.savedListAction("s-walk", on(["c-bea", "c-luis"])).to,
    contracts.GET_YES_ROUTE,
    "where People's step goes too",
  );

  // The yes is the message's own. Bea said yes to messages, so a message to her list is missing a number...
  line = nobodyOn("s-desk", note);
  assert.equal(
    textOf(line),
    "Nobody on “At the desk” can be sent a message yet — a broadcast reaches only a recorded yes with a number to send to.",
  );
  assert.equal(byTestId(line, "bc-nobody-door"), null);
  // ...and an offer to it is missing her answer.
  line = nobodyOn("s-desk", offer);
  assert.ok(textOf(line).startsWith("Nobody on “At the desk” has said yes to offers yet"), textOf(line));
  assert.ok(byTestId(line, "bc-nobody-door"));
});

test("REGRESSION: the line under the audience says who said yes when nobody can be sent it -- '0 people on “Regulars” said yes to offers' stood over 'Nobody on “Regulars” can be sent an offer yet'", () => {
  const rows = [
    // Dani: a number, and a yes to both (the contact's own defaults).
    contact({ id: "c-dani" }),
    // Ana and Eva wrote in by email and said yes to both there: an address each, and no number.
    contact({
      id: "c-ana",
      display_name: "Ana Reyes",
      wa_profile_name: null,
      phone_e164: null,
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      marketing_consent_source: "customer_message",
    }),
    contact({
      id: "c-eva",
      display_name: "Eva Lund",
      wa_profile_name: null,
      phone_e164: null,
      email: "eva@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      marketing_consent_source: "customer_message",
    }),
    // Bea walked in, said yes to messages at the desk, and left no number.
    contact({
      id: "c-bea",
      display_name: "Bea Soto",
      wa_profile_name: null,
      phone_e164: null,
      consent_source: "in_person",
      marketing_consent: "unknown",
      channels: [],
      has_chat: false,
      conversation_count: 0,
      latest_conversation_id: null,
      latest_state: null,
      latest_wa_inbound_at: null,
      last_message_at: null,
      last_message_direction: null,
      last_message_sender: null,
      last_inbound_text: null,
      last_inbound_at: null,
    }),
    // Luis: a number, and a yes to messages only.
    contact({
      id: "c-luis",
      display_name: "Luis Mora",
      wa_profile_name: "Luis",
      phone_e164: "+17865550199",
      consent_source: "in_person",
      marketing_consent: "unknown",
    }),
  ].map((c) => contracts.toPersonRowVM(c, ZONE, new Date(NOW)));
  // A list kept by hand, as the surface publishes it (broadcasts/surface.ts broadcastsOverride): both purposes, from contracts.
  const listOf = (id, label, ids) => {
    const preview = {
      conversational: contracts.audiencePreview(rows, "saved", null, new Set(ids), "conversational", HOW),
      marketing: contracts.audiencePreview(rows, "saved", null, new Set(ids), "marketing", HOW),
    };
    return {
      kind: "saved",
      id,
      label,
      counts: { conversational: preview.conversational.sending, marketing: preview.marketing.sending },
      preview,
      hint: "A list kept by hand — of those whose yes covers this message",
    };
  };
  const audiences = [
    listOf("s-reg", "Regulars", ["c-ana", "c-luis"]),
    listOf("s-mail", "By email", ["c-ana", "c-eva"]),
    listOf("s-walk", "Walk-ins", ["c-bea", "c-luis"]),
    listOf("s-desk", "At the desk", ["c-bea"]),
    listOf("s-vip", "VIPs", ["c-dani", "c-ana"]),
  ];
  const offer = templateRow({ id: "tpl-offer", name: "fall_offer", purpose: "marketing" });
  const note = templateRow({ id: "tpl-note", name: "hours_note", category: "utility", purpose: "conversational" });
  /** The send screen, opened on a list the way People opens it, with one message to pick: the line under the audience. */
  const metaOn = (list, tpl) => {
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: [tpl], audiences, number: healthyNumber }));
    const tree = page({ initialSegment: list, initialRun: null });
    assert.ok(byTestId(tree, "bc-composer"), list);
    return textOf(find(tree, (n) => n.props?.className === "bc-meta"));
  };
  // What the wire holds back, named for the channels the send goes by (contracts heldBackWords): WhatsApp's is a phone number.
  const held =
    " · people who asked to stop, have no phone number, or are mid-thread with a person are held back at the wire";

  // Ana said yes to offers and has no number: one person said yes, and the line says so -- with what is missing.
  assert.ok(
    metaOn("s-reg", offer).startsWith(`1 person on “Regulars” said yes to offers, with no number to send to${held}`),
    `REGRESSION: ${metaOn("s-reg", offer)}`,
  );
  assert.ok(
    metaOn("s-mail", offer).startsWith(
      `2 people on “By email” said yes to offers, none with a number to send to${held}`,
    ),
    metaOn("s-mail", offer),
  );
  // The yes is the message's own: Bea said yes to messages, so a message to her is missing a number.
  assert.ok(
    metaOn("s-desk", note).startsWith(
      `1 person on “At the desk” said yes to messages, with no number to send to${held}`,
    ),
    metaOn("s-desk", note),
  );
  // Nobody on Walk-ins said yes to offers, and the line said so already: unchanged.
  assert.ok(
    metaOn("s-walk", offer).startsWith(`0 people on “Walk-ins” said yes to offers${held}`),
    metaOn("s-walk", offer),
  );
  // Above 0 the number is who it reaches, People's shorthand ("N of M on this list said yes to offers -- a broadcast
  // reaches them"): Dani, and not Ana, whose yes has no number. Unchanged.
  assert.ok(metaOn("s-vip", offer).startsWith(`1 person on “VIPs” said yes to offers${held}`), metaOn("s-vip", offer));
});

test("an approve or a stop is said the moment the server takes it, with what it answered -- not after the broadcasts, the playbooks and every contact are read again", async () => {
  // The loading standard's D: the toast waited for the write and the refresh map's re-read of both surfaces (the
  // broadcasts one reads every contact page). The server's answer is what the toast says, so it is said from that.
  const waiting = dto({
    id: "b-wait",
    name: "Win-back · 2026-09-15",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    // Today's run: one made for an earlier day is refused by the verb, and no page offers to approve it.
    run_for: globalThis.window.__clock.dayKey(Date.now()),
    counts: quiet,
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [waiting].map((b) => toBroadcastVM(b, ZONE)) }));
  const keep = { approve: broadcasts.approve, cancel: broadcasts.cancel };
  const reread = [];
  const acceptThenRead =
    (data) =>
    (_id, opts = {}) => {
      if (opts.onAccepted) opts.onAccepted(data);
      return new Promise((r) => reread.push(() => r({ ok: true, data })));
    };
  broadcasts.approve = acceptThenRead({
    recipient_count: 3,
    scheduled_for: iso(0),
    moved_from: null,
  });
  const stops = [];
  const stopThenRead = acceptThenRead({ was: "sending" });
  broadcasts.cancel = (id, opts) => (stops.push(id), stopThenRead(id, opts));
  answers.set("b-wait", [{ ok: true, data: detailOf(waiting, []) }]);
  // The run waiting on you, open on its sheet beside Sequences' list, where it is approved.
  const props = { initialSegment: null, initialRun: "b-wait" };
  try {
    toasts.length = 0;
    page(props);
    await settle();
    press(byTestId(again(props), "bc-sheet-approve"));
    await settle();
    assert.equal(toasts.length, 1, "said at acceptance, while the surfaces are read again");
    assert.match(textOf(toasts[0].msg), /approved — 3 people/);
    assert.ok(
      !textOf(byTestId(again(props), "bc-sheet-approve")).includes("Approving…"),
      "the button is back when the server took it",
    );
    while (reread.length) reread.shift()();
    await settle();
    assert.equal(toasts.length, 1, "and said once");
    // The way back, as Send once's toast offers it: "Stop it" for a run that goes now, "Cancel it" for one still to go.
    const goes = bcWhenWords({ recipient_count: 3, scheduled_for: iso(0), moved_from: null });
    assert.equal(
      toasts[0].action?.label,
      contracts.runStopDoorWords(goes !== contracts.SENDING_NOW_WORDS),
      "REGRESSION: an approval's toast offered no way back",
    );
    toasts[0].action.onClick();
    await settle();
    while (reread.length) reread.shift()();
    await settle();
    assert.deepEqual(stops, ["b-wait"], "the run just approved");
    assert.match(textOf(toasts.at(-1).msg), /stops after this batch/);
  } finally {
    Object.assign(broadcasts, keep);
  }
});

test("REGRESSION (C14): Approve says it is approving and cannot approve twice -- a second press approved again, and the server refused it", async () => {
  const waiting = dto({
    id: "b-wait",
    name: "Win-back · 2026-09-15",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    // Today's run: one made for an earlier day is refused by the verb, and no page offers to approve it.
    run_for: globalThis.window.__clock.dayKey(Date.now()),
    counts: quiet,
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [waiting, dto()].map((b) => toBroadcastVM(b, ZONE)) }));
  answers.set("b-wait", [{ ok: true, data: detailOf(waiting, []) }]);
  let release = () => {};
  const approvals = [];
  const keep = broadcasts.approve;
  broadcasts.approve = (id) => {
    approvals.push(id);
    return new Promise((r) => {
      release = () => r({ ok: true, data: { recipient_count: 3, scheduled_for: iso(0), moved_from: null } });
    });
  };
  const props = { initialSegment: null, initialRun: "b-wait" };
  try {
    page(props);
    await settle();
    let tree = again(props);
    const approve = byTestId(tree, "bc-sheet-approve");
    press(approve);
    press(approve);
    assert.deepEqual(approvals, ["b-wait"], "REGRESSION: a second press approved again, and the server refused it");
    tree = again(props);
    const busy = byTestId(tree, "bc-sheet-approve");
    assert.ok(textOf(busy).includes("Approving…"));
    assert.equal(busy.props.disabled, true);
    release();
    await settle();
  } finally {
    broadcasts.approve = keep;
  }
});

test("REGRESSION (C15): the sending hours and the pace are the published ones -- they were typed into the pages beside the constants", async () => {
  // The hours are the contracts' published words (SENDING_HOURS_WORDS), the very object the page's clock hands every page
  // (zone.ts pageClock): change them and each page says the new ones; a page that typed its own would say nine to
  // twenty still.
  const realClock = globalThis.__clock;
  const published = { ...realClock.hours };
  Object.assign(realClock.hours, {
    min: 8,
    max: 19,
    first: "8:00",
    range: "8:00–19:59",
    between: "between 8:00 and 19:59",
  });
  try {
    let at = Date.now() + H;
    while (!realClock.nextOpen(at).moved) at += H;
    assert.ok(bcWhenNote(at, 30).words.endsWith("sends wait for 8:00–19:59"), bcWhenNote(at, 30).words);
    const receipt = bcWhenWords({
      scheduled_for: new Date(at + 12 * H).toISOString(),
      moved_from: new Date(at).toISOString(),
    });
    assert.ok(receipt.includes("between 8:00 and 19:59"), receipt);

    const plain = templateRow({ id: "tpl-plain", name: "fall_offer", purpose: "marketing" });
    setSurfaceValue("broadcasts", broadcastsSurface({ chunk: 10, templates: [plain], number: healthyNumber }));
    broadcasts.send = async () => ({
      ok: true,
      data: {
        id: "b-new",
        name: "Fall offer",
        recipient_count: 2,
        scheduled_for: new Date().toISOString(),
        moved_from: null,
      },
    });
    const tree = writing({ initialSegment: null, initialRun: null });
    assert.ok(
      textOf(find(tree, (n) => n.props?.className === "bc-meta")).includes("sent 10 at a time"),
      "REGRESSION: '25 at a time' in the page",
    );
    toasts.length = 0;
    press(byTestId(tree, "bc-send"));
    await press(byTestId(again({ initialSegment: null, initialRun: null }), "bc-send-yes"));
    assert.ok(textOf(toasts.at(-1).msg).includes("sending now, 10 at a time"), textOf(toasts.at(-1).msg));
  } finally {
    Object.assign(realClock.hours, published);
  }
});

test("When the send goes is a sentence -- Now, or a day and a time of the sending hours, within the days the route keeps: the browser's own datetime box took any minute of any day, in the device's colours", async (t) => {
  const plain = templateRow({ id: "tpl-plain", name: "fall_offer", purpose: "marketing" });
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [plain], number: healthyNumber }));
  const sent = [];
  broadcasts.send = async (body) => {
    sent.push(body);
    return {
      ok: true,
      data: {
        id: "b-new",
        name: "Fall offer",
        recipient_count: 2,
        scheduled_for: body.scheduled_for,
        moved_from: null,
      },
    };
  };
  const C = globalThis.__clock;
  const props = { initialSegment: null, initialRun: null };
  const mode = (t) => pickerOf(t, "bc-when-mode");
  const dayOf = (t) => find(t, (n) => n.type === DatePicker);
  const scheduleOf = (t) => find(t, (n) => String(n.props?.className || "").includes("bc-send-later"));
  const nowOf = (t) => byTestId(t, "bc-send");
  const slot = (h, m) => `${String(h).padStart(2, "0")}:${m}`;

  // It opens on Now: no day or time to pick, and the note says what Send now does; Schedule has no time to wait for.
  let tree = writing(props);
  assert.equal(mode(tree).props.value, "now");
  assert.deepEqual(
    optionsOf(mode(tree)).map((o) => [o.value, o.label]),
    [
      ["now", "Now"],
      ["later", "Pick a time"],
    ],
  );
  assert.equal(faceOf(tree, "bc-when-mode"), "now", "a word of the send's sentence");
  assert.equal(dayOf(tree), null);
  assert.equal(pickerOf(tree, "bc-when-time"), null);
  assert.ok(textOf(byTestId(tree, "bc-when-note")).startsWith("Goes out"), textOf(byTestId(tree, "bc-when-note")));
  assert.equal(scheduleOf(tree), null, "nothing to schedule until a time is picked: the one act is Send now");
  assert.ok(nowOf(tree));

  // A time picked opens with the first one ahead: a quarter hour of the sending hours, by the business's clock.
  mode(tree).props.onValueChange("later");
  tree = again(props);
  assert.equal(faceOf(tree, "bc-when-mode"), "on");
  const first = C.fromInput(`${dayOf(tree).props.value}T${pickerOf(tree, "bc-when-time").props.value}`);
  assert.equal(dayOf(tree).props.today, C.dayKey(Date.now()), "the day's today is the business's");
  assert.ok(
    first > Date.now() && first - Date.now() < 2 * D,
    `ahead of now, and soon: ${new Date(first).toISOString()}`,
  );
  assert.equal(C.nextOpen(first).moved, false, "inside the sending hours");
  assert.equal(first % (15 * 60_000), 0, "on a quarter hour");
  assert.ok(textOf(byTestId(tree, "bc-when-note")).startsWith("Goes out"), textOf(byTestId(tree, "bc-when-note")));
  assert.equal(scheduleOf(tree).props.disabled, false);
  assert.ok(
    textOf(byTestId(tree, "bc-when-note")).includes(`${C.city()} time`),
    "the zone, in the line that says when",
  );

  // The times are the sending hours the clock publishes, every quarter hour of them.
  const times = (t) => optionsOf(pickerOf(t, "bc-when-time")).map((o) => o.value);
  assert.equal(times(tree).length, (C.hours.max - C.hours.min + 1) * 4);
  assert.deepEqual([times(tree)[0], times(tree).at(-1)], [slot(C.hours.min, "00"), slot(C.hours.max, "45")]);
  assert.equal(optionsOf(pickerOf(tree, "bc-when-time"))[0].label, "9:00 AM", "said as the page says a time");

  // A day beyond the days the route takes comes back as the last of them; one before today, as no day that has passed.
  const last = C.dayKey(Date.now() + 30 * D);
  dayOf(tree).props.onValueChange(C.dayKey(Date.now() + 60 * D));
  tree = again(props);
  assert.equal(dayOf(tree).props.value, last, "the ceiling the route keeps: thirty days");
  dayOf(tree).props.onValueChange(C.dayKey(Date.now() - 5 * D));
  tree = again(props);
  assert.ok(dayOf(tree).props.value >= C.dayKey(Date.now()), "never a day that has passed");

  // A day and a time of its own: what is sent is the instant the business's clock names for them, and the note says it.
  const target = C.dayKey(Date.now() + 29 * D);
  dayOf(tree).props.onValueChange(target);
  tree = again(props);
  assert.equal(dayOf(tree).props.value, target);
  pickerOf(tree, "bc-when-time").props.onValueChange("14:30");
  tree = again(props);
  assert.equal(pickerOf(tree, "bc-when-time").props.value, "14:30");
  assert.equal(dayOf(tree).props.value, target, "the day is kept");
  const at = C.fromInput(`${target}T14:30`);
  assert.ok(textOf(byTestId(tree, "bc-when-note")).includes(C.when(at)), textOf(byTestId(tree, "bc-when-note")));
  await press(scheduleOf(tree));
  assert.equal(
    sent.at(-1).scheduled_for,
    new Date(at).toISOString(),
    "the instant, not the device's reading of the words",
  );

  // Back to Now: nothing picked, and a send goes now.
  tree = writing(props);
  mode(tree).props.onValueChange("later");
  tree = again(props);
  mode(tree).props.onValueChange("now");
  tree = again(props);
  assert.equal(dayOf(tree), null);
  assert.equal(mode(tree).props.value, "now");

  // The sending hours are the published ones, not nine to twenty typed into the page. Only the words move here; the
  // next opening keeps the contracts' own hours, so the first time ahead is read at the business's noon, inside both:
  // read in the evening it fell at 20:30, outside the hours this world publishes, and the test failed by the time of
  // day it ran at.
  const published = { ...C.hours };
  t.mock.timers.enable({ apis: ["Date"], now: C.fromInput(`${C.dayKey(Date.now())}T12:00`) });
  Object.assign(C.hours, { min: 8, max: 19, first: "8:00", range: "8:00–19:59", between: "between 8:00 and 19:59" });
  try {
    tree = writing(props);
    mode(tree).props.onValueChange("later");
    tree = again(props);
    assert.deepEqual([times(tree)[0], times(tree).at(-1)], ["08:00", "19:45"]);
    const picked = C.fromInput(`${dayOf(tree).props.value}T${pickerOf(tree, "bc-when-time").props.value}`);
    assert.equal(C.nextOpen(picked).moved, false, "and the first one ahead is inside them");
  } finally {
    Object.assign(C.hours, published);
    t.mock.timers.reset();
  }
});

test("REGRESSION: the send screen's foot says the first thing that keeps Send from going, and Send is disabled exactly when it does -- the button was dead with no reason on a phone, where the foot is docked away from the columns that explain it", () => {
  const FLAGGED = numberHealth({ quality: "GREEN", event: "FLAGGED", limit: "TIER_1K" });
  const SMALL = numberHealth({ quality: "GREEN", event: null, limit: "TIER_250" });
  const slotted = templateRow({
    id: "tpl-slot",
    name: "offer_of_the_week",
    purpose: "marketing",
    variables: [{ position: 1, label: "Offer" }],
    body_preview: "This week: {{1}}",
  });
  const plain = templateRow({ id: "tpl-plain", name: "fall_offer", purpose: "marketing" });
  const everyone = (counts) => ({
    kind: "everyone",
    id: null,
    label: "Everyone who said yes",
    counts: { marketing: counts, conversational: counts },
  });
  const say = (tree) => byTestId(tree, "bc-foot-say");
  const sendOf = (tree) => byTestId(tree, "bc-send");
  const open = (over) => {
    setSurfaceValue("broadcasts", broadcastsSurface({ number: healthyNumber, ...over }));
    return writing({ initialSegment: null, initialRun: null });
  };
  /** The sentence, and the one rule: a sentence in the foot if and only if Send is dead. */
  const footSays = (tree) => {
    assert.equal(sendOf(tree).props.disabled, say(tree) !== null, "the foot says why exactly when Send is disabled");
    return say(tree) && textOf(say(tree));
  };

  // Nothing stops it: nothing is said, and Send is live.
  assert.equal(footSays(open({ templates: [plain], audiences: [everyone(2)] })), null);

  // The message picked first, then the list, then each value left blank.
  assert.equal(footSays(open({ templates: [], audiences: [everyone(2)] })), "Pick the message to send.");
  assert.equal(footSays(open({ templates: [plain], audiences: [] })), "Pick who it goes to.");
  const blank = open({ templates: [slotted], audiences: [everyone(2)] });
  assert.equal(footSays(blank), "Fill in “Offer” to send it.", "the value still to fill, by its own name");
  assert.equal(say(blank).props.role, "status", "said to a screen reader as it changes");
  // Typing it clears the line, and Send is live.
  find(blank, (n) => n.type === CmSlot).props.onTyped("20% off until Friday");
  assert.equal(footSays(again({ initialSegment: null, initialRun: null })), null);

  // Nobody it reaches: the list, or no channel left to reach them by.
  assert.equal(
    footSays(open({ templates: [plain], audiences: [everyone(0)] })),
    "Nobody on “Everyone who said yes” can be sent an offer yet.",
  );
  // A flagged number says its own refusal; none connected says so; a list past the day's limit says the limit's sentence.
  assert.equal(
    footSays(open({ templates: [plain], audiences: [everyone(2)], number: { ...healthyNumber, health: FLAGGED } })),
    FLAGGED.refusal,
  );
  assert.equal(
    footSays(
      open({ templates: [plain], audiences: [everyone(2)], number: { present: false, display: null, health: SMALL } }),
    ),
    "No WhatsApp number connected — connect one in Settings › Connections.",
  );
  assert.equal(
    footSays(open({ templates: [plain], audiences: [everyone(300)], number: { ...healthyNumber, health: SMALL } })),
    contracts.overLimitRefusal(SMALL, 300),
  );
  // The first thing, in the order a person fills the screen: a blank value before a refusal of the number.
  assert.equal(
    footSays(open({ templates: [slotted], audiences: [everyone(2)], number: { ...healthyNumber, health: FLAGGED } })),
    "Fill in “Offer” to send it.",
  );
});

test("REGRESSION: the send screen draws the kit's parts by import, not through the window's doors -- where the frame had not published them a Confirm drew nothing, and an armed Send had no Yes to press", async () => {
  // What the shell publishes for the pages it still holds. Taken away, as it is wherever Campaigns is drawn outside it.
  const published = ["Confirm", "StatePill", "PolicyChip", "UnsavedAsk", "RecordSheet", "FieldError", "useUnsavedWork"];
  const held = Object.fromEntries(published.map((name) => [name, globalThis[name]]));
  for (const name of published) delete globalThis[name];
  try {
    const plain = templateRow({ id: "tpl-plain", name: "fall_offer", purpose: "marketing" });
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: [plain], number: healthyNumber }));
    const props = { initialSegment: null, initialRun: null };
    // Send now asks first, in the kit's own Confirm: its Yes and No are there to press.
    let tree = writing(props);
    await press(byTestId(tree, "bc-send"));
    tree = again(props);
    assert.ok(byTestId(tree, "bc-send-confirm"), "the question the Send foot asks");
    assert.ok(byTestId(tree, "bc-send-yes") && byTestId(tree, "bc-send-no"), "with its two answers");
  } finally {
    Object.assign(globalThis, held);
  }
});

test("one act at the foot, which says what it will do: Send to N now, or once a time is picked in the sentence, Schedule for that time (Ruben, 11 Oct 2026)", (t) => {
  const plain = templateRow({ id: "tpl-plain", name: "fall_offer", purpose: "marketing" });
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [plain], number: healthyNumber }));
  const props = { initialSegment: null, initialRun: null };
  const acts = (t) => find(t, (n) => n.props?.className === "bc-actions");
  const order = (t) =>
    [acts(t).props.children]
      .flat(Infinity)
      .filter((c) => c && c.props && /bc-send-(now|later)/.test(String(c.props.className)))
      .map((c) => [/bc-send-now/.test(c.props.className) ? "now" : "later", c.props.variant ?? "secondary"]);
  // Now: Send now alone, the act.
  let tree = writing(props);
  assert.deepEqual(order(tree), [["now", "primary"]]);
  // A time picked, in the sentence's "now": Schedule alone, saying when.
  pickerOf(tree, "bc-when-mode").props.onValueChange("later");
  tree = again(props);
  assert.deepEqual(order(tree), [["later", "primary"]]);
  const C = globalThis.__clock;
  const picked = C.fromInput(
    `${find(tree, (n) => n.type === DatePicker).props.value}T${pickerOf(tree, "bc-when-time").props.value}`,
  );
  const S = contracts.LIFECYCLE_WORDS.compose.sentence;
  assert.ok(
    textOf(byTestId(tree, "bc-schedule")).includes(S.scheduleFor(S.at(C.when(picked)))),
    textOf(byTestId(tree, "bc-schedule")),
  );
  // The page left open past the time picked: Schedule waits for a later time, and the foot says so.
  t.mock.timers.enable({ apis: ["Date"], now: picked + 60_000 });
  try {
    tree = again(props);
    assert.equal(textOf(byTestId(tree, "bc-foot-say")), "That time has passed — pick a later one, or Send now");
    assert.equal(byTestId(tree, "bc-schedule").props.disabled, true, "and Schedule waits for a later time");
  } finally {
    t.mock.timers.reset();
  }
  tree = again(props);
  // Back to now: Send now again.
  pickerOf(tree, "bc-when-mode").props.onValueChange("now");
  tree = again(props);
  assert.deepEqual(order(tree), [["now", "primary"]]);
});

test("each run opens on a pane of its own: the open run's filter and expanded rows are its state, and were carried into the next run opened, the pane being one element for every run", async () => {
  const [one, two] = [dto(), dto({ id: "b-sent-2", name: "Win-back · 2026-09-11" })];
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [one, two].map((b) => toBroadcastVM(b, ZONE)) }));
  for (const b of [one, two]) answers.set(b.id, [{ ok: true, data: detailOf(b) }]);
  const paneOf = async (id) => {
    const props = { initialSegment: null, initialRun: id };
    page(props);
    await settle();
    return find(again(props), (n) => n.type === BroadcastDetail);
  };
  const first = await paneOf("b-sent");
  const second = await paneOf("b-sent-2");
  assert.equal(first.props.id, "b-sent");
  assert.equal(second.props.id, "b-sent-2");
  // The pane is keyed by the run it holds, so React gives the next run fresh state, not the last run's.
  assert.equal(first.props.key, "b-sent");
  assert.equal(second.props.key, "b-sent-2");
});

test("the run open at its home is the address's: closing it goes back to where it was opened from, else onto its sequence's History, and a link out pushes one", async () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  answers.set("b-sent", [{ ok: true, data: detailOf(dto()) }]);
  const calls = [];
  const keep = globalThis.appNavigate;
  globalThis.appNavigate = (to, opts) => calls.push([to, opts && opts.replace ? "replace" : "push"]);
  try {
    const props = { initialSegment: null, initialRun: "b-sent" };
    page(props);
    await settle();
    let tree = again(props);
    assert.ok(byTestId(tree, "bc-run-solo"), "the run's pane, beside the list");
    // A door out of the page is a link: it pushes, as every link does.
    const door = find(byTestId(tree, "bc-run-solo"), (n) => n.props?.className === "bc-run-link");
    assert.ok(door, "the run's playbook is a link in the pane's head");
    assert.match(textOf(door), / campaign$/, "said as a campaign to its reader (decision 19)");
    const before = calls.length;
    press(door);
    assert.equal(went.at(-1), "campaigns/sequences/pb-1", "its sequence, by the sequence's own id the run names");
    assert.equal(calls.length, before, "and it did not replace the run's entry");
    // Closed with no frame to say what opened it (a link, a reload): onto its sequence's History, the days it is one of,
    // never a Back out of the app. The frame's own Back to the opener is the shell's (shell-status.test.mjs).
    press(byTestId(tree, "bc-detail-close"));
    assert.equal(went.at(-1), "campaigns/sequences/pb-1/history");
    assert.equal(calls.length, before, "nothing replaced here: the page is left as it is drawn");
    tree = again(props);
    assert.ok(
      byTestId(tree, "bc-run-solo"),
      "the pane stays drawn until its page is left, never the list a moment first",
    );
  } finally {
    globalThis.appNavigate = keep;
  }
});

test("a run's report: who it touched is filtered by the kit's sub-tabs, and a person is the kit's face", async () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  const replied = person({
    contact_id: "k2",
    name: "Mia Ortiz",
    first_name: "Mia",
    replied: true,
    replied_at: iso(-4 * D),
    reply_words: "Yes please, Saturday?",
  });
  answers.set("b-sent", [{ ok: true, data: detailOf(dto(), [person(), replied]) }]);
  const props = { initialSegment: null, initialRun: "b-sent" };
  page(props);
  await settle();
  let tree = again(props);
  const strip = () => find(byTestId(tree, "bc-touched"), (n) => n.type === SubTabs).props;
  assert.deepEqual(
    strip().tabs.map((t) => [t.id, t.label, t.testid]),
    [
      ["all", "All", "bc-touched-all"],
      ["replied", "Replied", "bc-touched-replied"],
      ["held", "Held back", "bc-touched-held"],
      ["stopped", "Stopped", "bc-touched-stopped"],
    ],
    "the four filters, each with the id its test has always had",
  );
  assert.equal(strip().value, "all");
  const people = () => all(byTestId(tree, "bc-touched"), (n) => n.props?.["data-testid"] === "bc-person");
  assert.equal(people().length, 2, "everyone, to start");
  const nReplied = strip().tabs.find((t) => t.id === "replied").count;
  assert.equal(nReplied, 1, "the count beside it is the report's");
  strip().onSelect("replied");
  tree = again(props);
  assert.equal(strip().value, "replied");
  assert.equal(people().length, nReplied, "picking it shows those who wrote back");
  strip().onSelect("all");
  tree = again(props);
  assert.equal(people().length, 2);
  // A person's mark is the kit's face at the desk row's size, with their initials.
  for (const row of people()) {
    const faces = all(row, (n) => n.type === Face);
    assert.equal(faces.length, 1, "one face to a person");
    assert.equal(faces[0].props.size, "sm");
    assert.ok(faces[0].props.person?.initials, "with their initials, beside their name (the kit face's person)");
  }
});

/* ------------------------------ Messages ------------------------------ */

test("the page counts templates: `message` is what a customer gets, and the word meant three things across one nav", () => {
  // With rows on file, so the line reaches its plural: an empty workspace says
  // "No template on file yet" whatever the word for a full one is.
  const tree = messages({ templatesAll: [templateRow(), templateRow({ id: "t8", name: "welcome" })] });
  const line = textOf(headSaid());
  assert.match(
    line,
    /(No template on file yet|\d+ templates?\b)/,
    `REGRESSION: it counted "messages" under a tab beside the Inbox — ${line}`,
  );
  assert.ok(!/\bmessages?\b/i.test(line), `nothing on the line calls a template a message — ${line}`);
  assert.equal(textOf(headed(tree, "template-new")).trim(), "New template", "and the act that makes one says so");
});

test("REGRESSION (C20): on Messages only the pressed control says it is working, and every control waits -- one flag relabelled every Add while a sync ran", async () => {
  const sync = holdSync();
  try {
    // With a starter open, so its own Add is drawn and the assertion below is a
    // reading rather than a loop over nothing.
    let tree = messagesOpen({}, "starter-row");
    press(byTestId(tree, "sync-templates"));
    tree = messagesAgain();
    // The control is the freshness state now -- a dot, when it last looked, and a
    // press to look again -- so its working words are its own: it still says it is
    // working, and it is still the only one that does.
    assert.match(
      textOf(byTestId(tree, "sync-templates")),
      /Checking WhatsApp/,
      "the pressed control says it is working",
    );
    // The kit's LinkButton and the host button it draws both carry the id: the one control is the host.
    const addAll = all(tree, (n) => n.type === "button" && n.props?.["data-testid"] === "starter-add-all");
    assert.equal(addAll.length, 1, "one press adds what the starter set is missing, in every language at once");
    for (const b of addAll) {
      assert.ok(!textOf(b).includes("Adding"), `REGRESSION: ${textOf(b)} while a sync ran`);
      assert.equal(b.props.disabled, true, "and it waits for the sync");
    }
    // Its Add is the kit's Button now (drawn in the open message's pane): the host button is the one, not its wrappers.
    const adds = all(tree, (n) => n.type === "button" && n.props?.["data-testid"] === "starter-add");
    assert.equal(adds.length, 1, "the open starter offers the one language it is missing");
    assert.ok(
      adds.every((b) => b.props.disabled === true && !textOf(b).includes("Adding")),
      "a message's own Add waits in its own words",
    );
    sync.finish({ seen: 2, approved: 2, marketing: 1 });
    assert.ok(
      await until(() => !/Checking WhatsApp/.test(textOf(byTestId(messagesAgain(), "sync-templates")))),
      "the sync finished",
    );
    tree = messagesAgain();
    assert.match(
      textOf(byTestId(tree, "sync-templates")),
      /Synced|Never synced/,
      "and afterwards it says when it last looked, not what to press",
    );
    assert.match(textOf(toasts.at(-1).msg), /2 templates from WhatsApp — 2 approved, 1 marketing/, "and what it found");
  } finally {
    sync.restore();
  }
});

test("A starter set part-way on file says what is left at the list's foot, in words a screen reader hears -- no notice, and it waits in its own words while a sync runs", async () => {
  const first = starters.list[0];
  let tree = messages({
    templatesAll: [templateRow({ id: "t-s", name: first.name, language: "en_US", meta_status: "approved" })],
  });
  // The notice that said a language never written cost customers something is gone: a run sends one language to
  // everyone on it. What is left to add is one quiet act under the list.
  assert.equal(byTestId(tree, "starters"), null, "no notice part-way through the set");
  const adds = all(tree, (n) => n.type === "button" && n.props?.["data-testid"] === "starter-add-all");
  assert.equal(adds.length, 1);
  assert.equal(textOf(adds[0]).trim(), "Add the rest of the starter set");
  const left = String(adds[0].props["aria-description"]);
  assert.ok(/in English/.test(left) && /in Spanish/.test(left), left);
  assert.equal(adds[0].props["data-tip"], left, "the hover and a screen reader hear the one sentence");
  const sync = holdSync();
  try {
    press(byTestId(tree, "sync-templates"));
    tree = messagesAgain();
    const waiting = byTestId(tree, "starter-add-all");
    assert.equal(waiting.props.disabled, true, "it waits for the sync");
    assert.ok(!textOf(waiting).includes("Adding"), textOf(waiting));
    sync.finish({ seen: 1, approved: 1, marketing: 1 });
    assert.ok(
      await until(() => byTestId(messagesAgain(), "starter-add-all").props.disabled !== true),
      "and is pressable again once the sync is done",
    );
  } finally {
    sync.restore();
  }
});

test("A row asks for attention when a language a playbook sends is missing or not approved -- not for a language nobody sends -- and the head says all approved once", () => {
  const en = templateRow({ id: "t-en", name: "offer", language: "en_US", meta_status: "approved" });
  const es = templateRow({ id: "t-es", name: "offer", language: "es", meta_status: "pending" });
  const use = { offer: { words: "Offer", unused: false, playbook: "pb-1" } };
  const sends = (language) => ({
    rows: [
      { id: "pb-1", name: "Offer", template_name: "offer", template_language: language, state: "running", runs: true },
    ],
  });
  const attn = (t) => String(byTestId(t, "custom-row").props.className).split(" ").includes("is-attn");
  // A playbook sends Spanish and WhatsApp holds only English: every run of it is skipped.
  let tree = messages({ templatesAll: [en], playbooks: sends("es"), templateUse: use });
  assert.ok(attn(tree), "a language a running playbook sends, missing");
  assert.equal(textOf(byTestId(tree, "template-status")).trim(), "Spanish missing");
  assert.ok(textOf(headSaid()).includes("all approved"), "the one on file is approved");
  // It sends the approved English, and Spanish is in review: nothing is refused, so the row is at rest -- and the
  // pill still says Spanish is in review.
  tree = messages({ templatesAll: [en, es], playbooks: sends("en_US"), templateUse: use });
  assert.ok(!attn(tree), "REGRESSION: a language nobody sends asked for attention");
  assert.equal(textOf(byTestId(tree, "template-status")).trim(), "Spanish in review");
  const head = textOf(headSaid());
  assert.ok(head.includes("1 approved") && head.includes("1 in review"), head);
  // Without the playbooks read, a language on file that is not approved, on a message something sends.
  tree = messages({ templatesAll: [en, es], playbooks: undefined, templateUse: use });
  assert.ok(attn(tree), "the playbooks unread: what is on file and not approved");
});

/**
 * A message's languages are what it opens into: they were a column of every closed row ("● EN ⌄" sixteen times) for a
 * choice that changes nothing about who a run reaches (23 Sep, Campaigns made compact). Opens the row `rowOf` finds
 * when it is closed, and returns the tree with it open.
 */
const openedRow = (rowOf) => {
  let tree = messagesAgain();
  // The row stands selected while its message is open in the pane beside the list (the layout is the Inbox's list +
  // pane, Claude Video/docs/2026-10-02-campaigns-on-the-kit.md §3.1): the words are not under it any more.
  if (!String(rowOf(tree).props.className).split(" ").includes("is-open")) {
    press(byTestId(rowOf(tree), "template-open"));
    tree = messagesAgain();
  }
  return tree;
};
const customRow = (t) => byTestId(t, "custom-row");
/** The open message's pane: its words, its languages and its verbs, which were under its row. */
const paneOf = (t) => byTestId(t, "template-pane");
/** An item of the pane's menu, by its words: the kit's Menu draws nothing under this runner, so its groups are read. */
const menuItem = (t, words) =>
  find(t, (n) => n.type === Menu)
    .props.groups.flatMap((g) => g.items)
    .find((i) => i.label === words);
const lastStarterRow = (t) => all(t, (n) => n.props?.["data-testid"] === "starter-row").at(-1);

test("A message is a row you scan, and the words open under it: what it is, what sends it and what went out -- without opening anything; its languages open with it", () => {
  const en = templateRow({
    id: "t-en",
    name: "offer",
    language: "en_US",
    meta_status: "approved",
    body_preview: "Hi {{1}},\n  20% off\tthis week.",
  });
  let tree = messages({
    templatesAll: [en],
    templateUse: { offer: { words: "Win-back", unused: false, playbook: "pb-1" } },
  });
  const row = byTestId(tree, "custom-row");
  // A line of the words rides the row, on one line whatever the message does with
  // newlines and tabs, in quotes and with its slots NAMED rather than numbered --
  // so a row IS the message, and shows what varies per person. A slot nothing
  // names on file is "value 1": never Meta's "{{1}}".
  assert.ok(textOf(row).includes("“Hi {value 1}, 20% off this week.”"), textOf(row));
  assert.ok(textOf(byTestId(row, "template-users")).includes("Win-back"), "and what sends it, closed");
  assert.ok(byTestId(row, "template-sent"), "and what went out, in its own cell");
  assert.equal(byTestId(tree, "template-open-body"), null, "the whole message is not drawn until it is asked for");
  assert.equal(paneOf(tree), null, "and nothing is open beside the list");
  // The name WhatsApp knows it by is no row's: in type on every closed row ("winback_offer") it was a word nobody acts on
  // (23 Sep, Campaigns made compact).
  const opened = messagesOpen({
    templatesAll: [templateRow({ id: "t-en", name: "offer_spring", language: "en_US", meta_status: "approved" })],
  });
  assert.equal(
    all(byTestId(opened, "custom-row"), (n) => n.props?.className === "msg-row-name mono").length,
    0,
    "no name in type on the row's line",
  );
  // Nor in the open message's pane (11 Oct 2026): where it was made, in one word, and never the name it is filed under.
  const body = textOf(byTestId(paneOf(opened), "template-open-body"));
  assert.ok(!body.includes("offer_spring"), body);
  assert.match(body, /Made here|From WhatsApp Manager/);

  // No language on the closed row. Open, ONE language control per message, where a slot per language stood ("EN ES"
  // on every row): the language in view, its state drawn, and no "+1" for a message that exists in one language.
  assert.equal(
    all(row, (n) => n.props?.["data-testid"] === "template-lang").length,
    0,
    "the languages are the open message's, in its pane",
  );
  const chips = all(
    paneOf(messagesOpen({ templatesAll: [en] })),
    (n) => n.type === Picker && n.props["data-testid"] === "template-lang",
  );
  assert.equal(chips.length, 1);
  assert.deepEqual(chipSays(chips[0]), ["EN", ""]);
  assert.equal(chipTone(chips[0]), "ok", "its state, drawn");

  // A STARTER's chip, in its open row, opens its languages in groups: the one WhatsApp holds, the
  // one the library has written and the workspace never added -- a language that
  // did not exist was simply absent before, which is the hole the toolbar's
  // arithmetic ("Add the 3 in English") was describing -- and every other
  // language WhatsApp takes.
  // The set's first starter (2 Oct 2026, the lifecycle set): winback_offer is retired, so it is no starter row now.
  messages({
    templatesAll: [en, templateRow({ id: "t-w", name: "winback_reply", language: "en_US", meta_status: "approved" })],
  });
  tree = openedRow((t) => all(t, (n) => n.props?.["data-testid"] === "starter-row")[0]);
  const chip = pickerOf(paneOf(tree), "template-lang");
  assert.deepEqual(chipSays(chip), ["EN", ""], "Spanish is not on file, so there is nothing more to count");
  // The list the chip opens is the Picker's groups, each under its heading.
  const options = optionsIn(paneOf(tree));
  const group = (g) => options.filter((o) => o.group === g).map((o) => o.value);
  assert.deepEqual(group("on"), ["en_US"]);
  assert.deepEqual(group("ready"), ["es"], "the library's Spanish, never added");
  assert.equal(group("add").length, starters.allLanguages.length - 2, "and every other language WhatsApp takes");
  assert.equal(chip.props.value, "en_US", "the one in view is the one chosen");

  // Picking the library's Spanish puts it in view in the open message, where
  // the words WhatsApp would review are, and the Add beside them.
  pickLanguage(paneOf(tree), "es");
  tree = messagesAgain();
  const open = paneOf(tree);
  assert.deepEqual(
    chipSays(pickerOf(open, "template-lang")),
    ["ES", "+1"],
    "the chip says the language in view, and that English is on file too",
  );
  assert.equal(chipTone(pickerOf(open, "template-lang")), "none", "which WhatsApp has never seen");
  assert.ok(
    byTestId(open, "template-open-body"),
    "the message stays open, on the language that was pressed (the chip above)",
  );
  assert.ok(textOf(open).includes("Not on WhatsApp in Spanish yet"), textOf(open));
  assert.ok(byTestId(open, "starter-add"), "and the Add for that language is beside its words");

  // One at a time: opening another message closes this one, because two messages'
  // words side by side is the wall this page stopped being.
  press(find(byTestId(tree, "custom-row"), (n) => n.props?.["data-testid"] === "template-open"));
  tree = messagesAgain();
  const isOpen = (r) => String(r.props.className).split(" ").includes("is-open");
  assert.equal(
    isOpen(all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0]),
    false,
    "the one that was open is closed",
  );
  assert.ok(isOpen(byTestId(tree, "custom-row")), "and the one that was pressed is open");
  assert.equal(
    all(tree, (n) => n.type === "section" && n.props?.["data-testid"] === "template-pane").length,
    1,
    "in the one pane beside the list",
  );
  assert.ok(textOf(paneOf(tree)).includes("offer"), "the pane is the pressed message's");
});

test("Templates is the Inbox's shape: the search and WhatsApp's sync are the list's own top bar, the head's act is New alone, an open message's verbs are its pane's menu, and New opens a pane too", async () => {
  const keep = { ...templates };
  const said = [];
  Object.assign(templates, {
    rename: async (id, title) => (said.push(["rename", id, title]), { ok: true, data: {} }),
    hide: async (id) => (said.push(["hide", id]), { ok: true, data: {} }),
  });
  try {
    let tree = messages({ templatesAll: [templateRow()] });
    // The head says the act alone. The search was in its act, which a phone draws as one coral circle (the box read
    // "Sea"), and the sync in its sentence, which Glass leaves out (it could not be reached at all).
    const head = headSaid();
    assert.ok(byTestId(head, "template-new"), "the head's act is New");
    assert.equal(byTestId(head, "templates-search"), null, "not the search");
    assert.equal(byTestId(head, "sync-templates"), null, "nor the sync");
    const bar = find(tree, (n) => n.props?.className === "tpl-bar");
    assert.ok(byTestId(bar, "templates-search") && byTestId(bar, "sync-templates"), "the list's top bar holds both");
    assert.equal(byTestId(tree, "messages-real").props["data-open"], undefined, "nothing open: the list alone");

    // A row opens its message in a pane beside the list, and its verbs are the menu in the pane's head.
    press(byTestId(customRow(tree), "template-open"));
    tree = messagesAgain();
    assert.equal(byTestId(tree, "messages-real").props["data-open"], "true", "the page says something is open");
    assert.ok(
      textOf(find(paneOf(tree), (n) => n.props?.className === "cm-pane-title")).startsWith("Offer"),
      "the pane is named as the row is",
    );
    assert.equal(byTestId(tree, "template-menu"), null, "the row's own ··· is gone");
    assert.deepEqual(
      find(tree, (n) => n.type === Menu)
        .props.groups.flatMap((g) => g.items)
        .map((i) => [i.label, i.tone, i.gate["data-testid"]]),
      [
        ["Rename", undefined, "template-rename"],
        ["Hide", undefined, "template-hide"],
        ["Delete", "danger", "template-delete"],
      ],
    );
    menuItem(tree, "Rename").onSelect();
    tree = messagesAgain();
    // The rename box is the kit's Field (surfaces/kit/field/): what is typed is its `onValueChange`.
    byTestId(tree, "template-title").props.onValueChange("Fall offer");
    tree = messagesAgain();
    press(byTestId(tree, "template-title-save"));
    assert.deepEqual(
      said,
      [["rename", "t9", "Fall offer"]],
      "the name goes through the verb, from the pane's own form",
    );
    await settle();
    tree = messagesAgain();
    assert.equal(byTestId(tree, "template-rename-form"), null, "and the form is gone with it");
    menuItem(tree, "Hide").onSelect();
    assert.deepEqual(said.at(-1), ["hide", "t9"]);
    await settle();

    // A role that may not change a template is shown no menu, and the page says why once.
    const canDo = globalThis.window.canDo;
    globalThis.window.canDo = () => false;
    try {
      tree = messages({ templatesAll: [templateRow()] });
      press(byTestId(customRow(tree), "template-open"));
      tree = messagesAgain();
      assert.equal(
        find(tree, (n) => n.type === Menu),
        null,
        "no menu",
      );
      assert.ok(byTestId(tree, "messages-role"), "and the page says why");
    } finally {
      globalThis.window.canDo = canDo;
    }

    // New is a pane too: the list stays beside it, a message pressed gives it way, and Cancel with nothing written closes it.
    tree = messages({ templatesAll: [templateRow()] });
    press(headed(tree, "template-new"));
    tree = messagesAgain();
    assert.ok(byTestId(tree, "messages-composer"));
    assert.equal(textOf(find(tree, (n) => n.props?.className === "cm-pane-title")).trim(), "New template");
    assert.ok(byTestId(tree, "custom-row"), "the list stays beside it");
    press(byTestId(customRow(tree), "template-open"));
    tree = messagesAgain();
    assert.equal(byTestId(tree, "messages-composer"), null, "a message pressed gives it way");
    assert.ok(paneOf(tree));
    press(headed(tree, "template-new"));
    tree = messagesAgain();
    assert.equal(paneOf(tree), null, "and New gives way to the message");
    press(byTestId(tree, "tpl-close"));
    tree = messagesAgain();
    assert.equal(byTestId(tree, "messages-composer"), null, "Cancel, with nothing written, closes it");
  } finally {
    Object.assign(templates, keep);
  }
});

/* -------------------------- a message in one more language -------------------------- */

/** The written-here offer, in English, with its first name slot filed as the create path files it. */
const offerEn = (over = {}) =>
  templateRow({
    id: "t-en",
    name: "offer",
    language: "en_US",
    meta_status: "approved",
    category: "marketing",
    body_preview: "Hi {{1}}, 20% off any service this week.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    footer: "Reply STOP to opt out",
    ...over,
  });

test("A language nobody has written is picked from the one chip and written in the row it opened: the same message, drafted from its own words, sent when the owner says", async () => {
  const drafts = [];
  const made = [];
  const keep = { ...templates };
  Object.assign(templates, {
    draft: async (b) => {
      drafts.push(b);
      return {
        ok: true,
        data: {
          draft: {
            name: "offer",
            body: "Oi {{1}}, 20% de desconto em qualquer serviço esta semana.",
            footer: "Responda STOP para sair",
            examples: ["Dani"],
            variables: [{ position: 1, label: "First name" }],
            warnings: [],
            category: "marketing",
            language: "pt_BR",
            button: null,
            from: "en_US",
          },
        },
      };
    },
    create: async (b) => {
      made.push(b);
      return { ok: true, data: { id: "t-pt", name: b.name, language: b.language, meta_status: "pending" } };
    },
  });
  toasts.length = 0;
  try {
    let tree = messages({ templatesAll: [offerEn()] });
    tree = openedRow(customRow);
    // Every language WhatsApp takes, under "Translate into", for a message written here.
    const pt = optionOf(paneOf(tree), "pt_BR");
    assert.equal(pt.group, "add");
    pickLanguage(paneOf(tree), "pt_BR");
    tree = messagesAgain();
    // The language is written in the pane beside the list (the layout is the Inbox's list + pane,
    // Claude Video/docs/2026-10-02-campaigns-on-the-kit.md §3.1), not under the row.
    let row = paneOf(tree);
    // Picked, the open message turns to the new language and starts writing it at once.
    assert.equal(byTestId(row, "tpl-composer").props["data-mode"], "translate");
    assert.ok(byTestId(row, "tpl-translating"), "the shape of the words while the assistant writes");
    assert.deepEqual(
      drafts,
      [{ language: "pt_BR", translate: { id: "t-en" } }],
      "written FROM the English on file, once",
    );
    assert.deepEqual(chipSays(pickerOf(row, "template-lang")), ["PT", "+1"]);
    assert.equal(chipTone(pickerOf(row, "template-lang")), "none", "a language WhatsApp has never seen");
    assert.ok(
      textOf(customRow(tree)).includes("“Hi {first name}, 20% off any service this week.”"),
      "the row still quotes the message while its new language is written",
    );

    await settle();
    tree = messagesAgain();
    row = paneOf(tree);
    assert.equal(drafts.length, 1, "drawn again, it does not ask again");
    assert.equal(
      byTestId(row, "tpl-body").props.value,
      "Oi {{1}}, 20% de desconto em qualquer serviço esta semana.",
      "the words, to read and change",
    );
    assert.equal(byTestId(row, "tpl-name"), null, "the name is the message's own: nothing to type");
    assert.ok(
      textOf(byTestId(row, "tpl-composer")).includes("Written from the English (US) words"),
      textOf(byTestId(row, "tpl-composer")),
    );
    assert.ok(byTestId(row, "tpl-preview"), "and the message as the customer will read it");

    await press(byTestId(row, "tpl-submit"));
    assert.deepEqual(
      made,
      [
        {
          name: "offer",
          language: "pt_BR",
          category: "marketing",
          body: "Oi {{1}}, 20% de desconto em qualquer serviço esta semana.",
          footer: "Responda STOP para sair",
          examples: ["Dani"],
          labels: ["First name"],
          button: null,
        },
      ],
      "the same name, in one more language",
    );
    tree = messagesAgain();
    row = paneOf(tree);
    assert.ok(byTestId(row, "template-new-sent"), "it says it went, rather than offering the words to send twice");
    assert.equal(byTestId(row, "tpl-composer"), null);
    assert.ok(textOf(toasts.at(-1).msg).includes("in Portuguese (Brazil) went to WhatsApp"), textOf(toasts.at(-1).msg));

    // With the next read the row is on file, in review, and the chip draws it so.
    settingsChanged({
      templatesAll: [
        offerEn(),
        offerEn({ id: "t-pt", language: "pt_BR", meta_status: "pending", body_preview: made[0].body }),
      ],
    });
    tree = messagesAgain();
    assert.equal(chipTone(pickerOf(paneOf(tree), "template-lang")), "info");
    assert.equal(textOf(byTestId(customRow(tree), "template-status")).trim(), "Portuguese (Brazil) in review");
  } finally {
    Object.assign(templates, keep);
  }
});

test("Cancel goes back to the language that was in view; a heading, or a role that may not add one, keeps the other languages out of the list and says why", async () => {
  const keep = { ...templates };
  Object.assign(templates, {
    draft: async () => ({ ok: false, message: "The assistant is not available right now. Try again in a moment." }),
  });
  try {
    let tree = messages({ templatesAll: [offerEn()] });
    tree = openedRow(customRow);
    pickLanguage(paneOf(tree), "fr");
    messagesAgain();
    await settle();
    tree = messagesAgain();
    let row = paneOf(tree);
    // A draft that could not be written says why, and offers another try -- not empty boxes.
    assert.ok(textOf(byTestId(row, "tpl-translate-failed")).includes("not available right now"));
    assert.ok(byTestId(row, "tpl-translate-again"));
    // Another new language picked from there, and Cancel still goes back to the
    // English -- never to the French that was only being drafted.
    pickLanguage(row, "de");
    tree = messagesAgain();
    row = paneOf(tree);
    assert.deepEqual(chipSays(pickerOf(row, "template-lang")), ["DE", "+1"]);
    press(byTestId(row, "tpl-cancel"));
    tree = messagesAgain();
    row = paneOf(tree);
    assert.deepEqual(chipSays(pickerOf(row, "template-lang")), ["EN", ""], "back on English, and nothing more on file");
    assert.equal(byTestId(row, "tpl-composer"), null);
    assert.ok(byTestId(row, "message-preview"), "the English, as the customer reads it");
  } finally {
    Object.assign(templates, keep);
  }

  // A starter in a language its library never wrote is written like any other
  // message -- never the library's English passed off under a Portuguese heading --
  // from the row on file, or from the library's English when nothing is on file.
  // (The library's LAST starter: the test's React keys every hook by one global
  // order, so a composer opening in an earlier row would shift the rows under it.)
  const asked = [];
  const last = starters.list.at(-1);
  Object.assign(templates, {
    draft: async (b) => {
      asked.push(b);
      return { ok: false, message: "no" };
    },
  });
  try {
    const starterIn = (list) => {
      messages({ templatesAll: list });
      let t = openedRow(lastStarterRow);
      pickLanguage(paneOf(t), "pt_BR");
      t = messagesAgain();
      return paneOf(t);
    };
    let s = starterIn([
      templateRow({ id: "t-s", name: last.name, language: "en_US", meta_status: "approved", category: last.category }),
    ]);
    assert.equal(byTestId(s, "tpl-composer").props["data-mode"], "translate");
    assert.equal(byTestId(s, "starter-add"), null, "nothing to add as it is: the library has no Portuguese");
    assert.ok(!textOf(s).includes("the words WhatsApp would review"), "and no English passed off as Portuguese");
    s = starterIn([]);
    assert.equal(byTestId(s, "tpl-composer").props["data-mode"], "translate");
    assert.deepEqual(asked, [
      { language: "pt_BR", translate: { id: "t-s" } },
      { language: "pt_BR", translate: { starter: last.key, from: "en_US" } },
    ]);
  } finally {
    Object.assign(templates, keep);
  }

  // A language that stops being on file -- deleted, or gone with a sync -- is not a
  // request to write it again: the row falls back to one it has, and nothing is drafted.
  const drafted = [];
  Object.assign(templates, {
    draft: async (b) => {
      drafted.push(b);
      return { ok: false, message: "no" };
    },
  });
  try {
    const pt = offerEn({ id: "t-pt", language: "pt_BR", body_preview: "Oi {{1}}, 20% de desconto esta semana." });
    let t = messages({ templatesAll: [offerEn(), pt] });
    t = openedRow(customRow);
    pickLanguage(paneOf(t), "pt_BR");
    t = messagesAgain();
    assert.deepEqual(chipSays(pickerOf(paneOf(t), "template-lang")), ["PT", "+1"]);
    settingsChanged({ templatesAll: [offerEn()] });
    t = messagesAgain();
    const r = paneOf(t);
    assert.deepEqual(chipSays(pickerOf(r, "template-lang")), ["EN", ""], "back on the language it has");
    assert.equal(byTestId(r, "tpl-composer"), null);
    assert.deepEqual(drafted, [], "and the assistant was never asked");
  } finally {
    Object.assign(templates, keep);
  }

  // A heading would not come with it: no language to translate into, and the reason where they would be.
  messages({ templatesAll: [offerEn({ header: "Fall news" })] });
  let tree = openedRow(customRow);
  let row = paneOf(tree);
  assert.deepEqual([...new Set(optionsIn(row).map((o) => o.group))], ["on"]);
  const noteOf = (r) => textOf(pickerOf(r, "template-lang").props.note);
  assert.ok(noteOf(row).includes("it has a heading"), noteOf(row));

  // Someone who may not add a template sees the languages WhatsApp holds, and why there are no more.
  const canDo = globalThis.window.canDo;
  globalThis.window.canDo = () => false;
  try {
    tree = messages({ templatesAll: [offerEn()] });
    tree = openedRow(customRow);
    row = paneOf(tree);
    assert.deepEqual([...new Set(optionsIn(row).map((o) => o.group))], ["on"]);
    assert.equal(noteOf(row).trim(), "Only an owner or operator can add a language.");
  } finally {
    globalThis.window.canDo = canDo;
  }
});

test("A new template may be written in any language WhatsApp takes, found by typing it -- the composer offered six", async () => {
  const drafts = [];
  const keep = { ...templates };
  Object.assign(templates, {
    draft: async (b) => {
      drafts.push(b);
      return { ok: false, message: "no" };
    },
  });
  try {
    fresh();
    const draw = () => drawAgain(() => TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} }));
    let tree = draw();
    const field = pickerOf(tree, "tpl-language");
    assert.equal(textOf(field.props.face).trim(), "English (US)", "the language in words, as the fields beside it are");
    const options = optionsOf(field);
    assert.equal(options.length, starters.allLanguages.length);
    // The search is the kit Picker's, narrowing by what the contracts' findLanguages finds: a name, its own name, a place.
    const found = options.filter((o) => field.props.search.match(o, "fran")).map((o) => o.value);
    assert.deepEqual(
      found,
      ["fr", "fr_BE", "fr_CA", "fr_CI", "fr_MA", "fr_CH"],
      "French by its own name, every place WhatsApp files it",
    );
    field.props.onValueChange(found[0]);
    tree = draw();
    assert.equal(textOf(pickerOf(tree, "tpl-language").props.face).trim(), "French");
    // The brief is the kit's Field (surfaces/kit/field/), which says what is typed as `onValueChange`.
    byTestId(tree, "tpl-brief").props.onValueChange("Twenty percent off colour this week");
    tree = draw();
    await press(byTestId(tree, "tpl-draft"));
    assert.equal(drafts[0].language, "fr", "the draft is asked for in French");
  } finally {
    Object.assign(templates, keep);
  }
});

test("A message says whether it may be sent to everyone, on the row: marketing is a rule about who it can reach, not a label", () => {
  // Meta's own category on the workspace's row, and the library's purpose on a
  // starter not yet added -- the same mark either way, because the rule is the same.
  const tree = messages({
    templatesAll: [
      templateRow({ id: "t-o", name: "offer", language: "en_US", category: "MARKETING" }),
      templateRow({ id: "t-n", name: "front_desk_note", language: "en_US", category: "UTILITY" }),
    ],
  });
  const marks = all(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("msg-row-mark"),
  ).map((m) => m.props["data-kind"]);
  assert.ok(marks.includes("offer") && marks.includes("note"), marks.join(","));
  const offer = all(tree, (n) => n.props?.["data-kind"] === "offer")[0];
  assert.ok(String(offer.props["data-tip"]).includes("said yes to offers"), offer.props["data-tip"]);
});

test("REGRESSION (C22): a message shows the quality WhatsApp rated it -- the rating was synced and never drawn", () => {
  // The rating is about the message, so it is in the message: the row says what
  // the message is, and opening it says everything WhatsApp knows about it.
  let tree = messagesOpen({
    templatesAll: [templateRow({ name: "front_desk_note", source: "meta", quality: "YELLOW" })],
  });
  const q = byTestId(tree, "template-quality");
  assert.ok(q, "REGRESSION: no rating on the message");
  assert.equal(textOf(q).trim(), "Medium quality");
  tree = messagesOpen({
    templatesAll: [templateRow({ name: "front_desk_note", source: "meta", quality: "UNKNOWN" })],
  });
  assert.equal(
    textOf(byTestId(tree, "template-quality")).trim(),
    "Quality not rated yet",
    "a rating WhatsApp has not given is said so",
  );
  tree = messagesOpen({ templatesAll: [templateRow({ name: "front_desk_note", source: "meta", quality: null })] });
  assert.equal(byTestId(tree, "template-quality"), null, "nothing synced, nothing said");
});

test("REGRESSION (C8): deleting a message a playbook sends names the playbook -- a running one holds the delete back, a paused one is named in the question, and an unread list says so", () => {
  const armed = (playbooks) => {
    const tree = messagesOpen({ templatesAll: [templateRow()], playbooks: playbooks });
    // Delete is an item of the open message's menu (the pane's head, the kit's Menu): its act is what the item does.
    assert.equal(menuItem(tree, "Delete").tone, "danger");
    menuItem(tree, "Delete").onSelect();
    return messagesAgain();
  };
  let tree = armed({
    rows: [playbook({ name: "Win-back", template_name: "offer", template_language: "en_US", state: "running" })],
  });
  assert.equal(
    byTestId(tree, "template-delete-yes"),
    null,
    "REGRESSION: a Yes, and the playbook's runs skipped from then on",
  );
  const held = byTestId(tree, "template-delete-held");
  assert.ok(held && textOf(held).includes("“Win-back” still uses this template."), textOf(held));
  // The old Playbooks list is Campaigns' home now: the door says Campaigns and still goes to `outbound`, which lands there.
  press(find(held, (n) => n.type === "button" && textOf(n).includes("Campaigns")));
  assert.equal(went.at(-1), "campaigns/sequences", "and a door to the playbooks");

  tree = armed({
    rows: [
      playbook({ name: "Welcome", template_name: "offer", template_language: "en_US", state: "paused" }),
      playbook({
        id: "pb-es",
        name: "Spanish offer",
        template_name: "offer",
        template_language: "es",
        state: "running",
      }),
    ],
  });
  assert.ok(
    byTestId(tree, "template-delete-yes"),
    "a paused playbook does not hold it back, nor one sending another language",
  );
  assert.ok(
    textOf(byTestId(tree, "template-delete-confirm")).includes("“Welcome” is paused and sends it"),
    textOf(byTestId(tree, "template-delete-confirm")),
  );

  tree = armed(undefined);
  assert.ok(
    textOf(byTestId(tree, "template-delete-confirm")).includes("couldn't check which campaigns send it"),
    "a playbooks read that has not landed is said",
  );
});

test("Send now asks before it sends, and the question names the template, its language, the count and the list", async () => {
  const sent = [];
  const en = templateRow({
    id: "tpl-en",
    name: "winback_offer",
    language: "en_US",
    purpose: "marketing",
    body_preview: "Hi {{1}}, come back to {{2}}.",
  });
  const es = templateRow({
    id: "tpl-es",
    name: "winback_offer",
    language: "es",
    purpose: "marketing",
    body_preview: "Hola {{1}}, vuelve a {{2}}.",
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [en, es], number: healthyNumber }));
  broadcasts.send = async (body) => {
    sent.push(body);
    return {
      ok: true,
      data: {
        id: "b-new",
        name: "Win-back",
        recipient_count: 2,
        scheduled_for: new Date().toISOString(),
        moved_from: null,
      },
    };
  };

  let tree = writing({ initialSegment: null, initialRun: null });
  press(byTestId(tree, "bc-send"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(
    sent.length,
    0,
    "one press sends nothing -- it was the only act here that could not be taken back and the only one that did not ask",
  );
  const q = textOf(byTestId(tree, "bc-send-confirm"));
  // A workspace holding the starter set in both languages has two rows per name
  // and the chips read the same over each, so the question names the one it means.
  assert.ok(q.includes("(English)"), q);
  assert.ok(q.includes("Win-back"), q);
  assert.ok(/to \d+ (person|people) on/.test(q), q);
  assert.ok(q.includes("cannot be taken back"), q);

  toasts.length = 0;
  await press(byTestId(tree, "bc-send-yes"));
  assert.equal(sent.length, 1, "and the Yes sends it");
  // The receipt's one door out, in the verb the row itself uses: a message
  // already delivered stays delivered, so it is not offered as an Undo.
  assert.equal(toasts.at(-1).action.label, "Stop it");
  assert.equal(toasts.at(-1).links[0].to, "campaigns/sequences/b-new/runs/b-new");
});

test("The preview is the message as the customer receives it: the name in the chat header, what fills per person marked, a link drawn as one, and the hour it really goes", () => {
  const tpl = templateRow({
    id: "tpl-1",
    name: "winback_offer",
    purpose: "marketing",
    body_preview: "Hi {{1}}, book at booksy.com/luna and we'll take it from there.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
  });
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [tpl],
      number: healthyNumber,
      businessName: "Luna Studio",
    }),
  );
  const tree = writing({ initialSegment: null, initialRun: null });
  const preview = byTestId(tree, "bc-preview");
  assert.ok(preview, "the composer draws one");

  // The business's name is the chat header. Inside the bubble it is WhatsApp's
  // GROUP-chat treatment, which a broadcast never is -- and it was drawn there
  // in --accent, the token reserved for a live agent.
  // A composer's preview is bare (11 Oct 2026): the walk over it says who reads it, and no chat head stands over it.
  assert.equal(
    find(preview, (n) => n.props?.className === "mp-head"),
    null,
  );
  const bubble = find(preview, (n) => n.props?.className === "mp-bubble");
  assert.ok(
    !textOf(find(bubble, (n) => n.props?.className === "mp-body")).startsWith("Luna Studio"),
    "not a line inside the bubble",
  );

  // What fills per person is marked, so the eye can see what varies. A string
  // cannot be marked, which is why the three local renderers could not do this.
  const slots = all(preview, (n) => n.props?.className === "mp-slot");
  assert.equal(slots.length, 1, "one slot, one mark");
  assert.equal(textOf(slots[0]), "Dani");

  // The booking link is the pixel the message exists for; it was drawn as prose.
  const link = find(preview, (n) => n.props?.className === "mp-link");
  assert.ok(link && textOf(link) === "booksy.com/luna", "the link is a link");

  // The stamp is the hour it really goes -- it was the literal word "now" on a
  // send that could be scheduled for Tuesday.
  const stamp = textOf(find(preview, (n) => n.props?.className === "mp-stamp"));
  assert.notEqual(stamp, "now");
  assert.equal(stamp, globalThis.window.__clock.time(globalThis.window.__clock.nextOpen(Date.now()).at), stamp);

  // A slot nobody has filled stays a hole rather than quietly reading as words.
  assert.deepEqual(
    mpParts("Hi {{1}}.", []).map((p) => p.text),
    ["Hi ", "{{1}}", "."],
  );
});

test("Messages says what sends each message -- every source, so 'nothing sends it' is a reading and not a guess about the two it could not see", () => {
  const offer = [templateRow({ name: "offer", language: "en_US" })];
  let tree = messages({
    templatesAll: offer,
    templateUse: { offer: { words: "Win-back · step 2 and Labor Day hours", unused: false, sequence: "sq-1" } },
  });
  const users = byTestId(tree, "template-users");
  assert.ok(textOf(users).includes("Win-back · step 2 and Labor Day hours"), textOf(users));
  press(users);
  assert.equal(went.at(-1), "campaigns/sequences/sq-1", "and it opens the one sequence that sends it");

  // The answer the page could not give while it read the playbooks alone: a
  // message two broadcasts had gone out with read the same as a dead one.
  tree = messages({
    templatesAll: offer,
    templateUse: { offer: { words: "Not used", unused: true, sequence: null } },
  });
  assert.equal(textOf(byTestId(tree, "template-users")).trim(), "Not used");

  // More than one sequence: the line still says them, and opens the list.
  tree = messages({
    templatesAll: offer,
    templateUse: { offer: { words: "Win-back and Welcome", unused: false, sequence: null } },
  });
  press(byTestId(tree, "template-users"));
  assert.equal(went.at(-1), "campaigns/sequences", "no single sequence to open, so the list");

  // A usage read that has not landed is not "nothing sends it".
  tree = messages({ templatesAll: offer, templateUse: undefined });
  assert.equal(byTestId(tree, "template-users"), null, "an unread map makes no claim");
});

test("Messages says how many of each went out and when the last one did -- and a message that never went out says so in words, not 0", () => {
  const offer = [templateRow({ name: "offer", language: "en_US" })];
  let tree = messages({ templatesAll: offer, templateSent: { offer: { count: "1,204", when: "2d ago" } } });
  const head = find(tree, (n) => n.props?.className === "msg-list-head");
  assert.ok(textOf(head).includes("Sent"), `the column is named once, above the rows -- ${textOf(head)}`);
  let cell = byTestId(byTestId(tree, "custom-row"), "template-sent");
  assert.ok(cell, "the row carries the cell");
  assert.match(
    textOf(cell),
    /1,204 sent/,
    "the count, and the word a stacked row and a screen reader need without the heading",
  );
  assert.ok(textOf(cell).includes("2d ago"), textOf(cell));

  tree = messages({ templatesAll: offer, templateSent: { offer: { count: null, when: "Never sent" } } });
  cell = byTestId(byTestId(tree, "custom-row"), "template-sent");
  // A dash where the number would be (aria-hidden: a screen reader hears the words), then the words.
  assert.equal(textOf(cell).replace("—", "").trim(), "Never sent");
  assert.ok(!/\b0\b/.test(textOf(cell)), "never a 0 in a column of counts");

  // A roll-up that was not read makes no claim.
  tree = messages({ templatesAll: offer, templateSent: null });
  assert.equal(
    textOf(byTestId(byTestId(tree, "custom-row"), "template-sent")).trim(),
    "",
    "not read is not never sent",
  );
  // A starter not on file has nothing to count, and says why: it was never added.
  // Not "Never sent", which would say a template exists that nothing sent.
  tree = messages({ templatesAll: offer, templateSent: { offer: { count: "3", when: "just now" } } });
  const starter = all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0];
  assert.ok(starter, "the fixture draws a starter the workspace has not added");
  assert.equal(textOf(byTestId(starter, "template-sent")).replace("—", "").trim(), "Not added");
  assert.ok(
    !/\b0\b|Never sent/.test(textOf(byTestId(starter, "template-sent"))),
    "neither a 0 nor a send that never happened",
  );
});

/**
 * A person as GET contacts returns them, through the same view model the Broadcasts surface
 * builds audiences from -- not a shape invented here, because a made-up fixture
 * field is how a page passes a test while production stays wrong.
 */
const contact = (over = {}) => ({
  id: "c1",
  display_name: "Daniela R.",
  wa_profile_name: "Dani",
  phone_e164: "+17865550181",
  consent: "opted_in",
  consent_source: "reply",
  consent_updated_at: iso(-30 * D),
  dnc: false,
  marketing_consent: "opted_in",
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "cv1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: iso(-2 * H),
  last_message_at: iso(-2 * H),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "See you Saturday",
  last_inbound_at: iso(-2 * H),
  // What they wrote is their own words (people_list's last_wrote_at): a relationship on record, which is what lets an email
  // the business chose to send reach them with no yes covering email (decision D1).
  last_wrote_at: iso(-2 * H),
  last_call_at: null,
  last_inbound_call_at: null,
  last_inbound_call_summary: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(-60 * D),
  earliest_row_at: iso(-60 * D),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  effective_reply_mode: "auto",
  visits: null,
  ...over,
});

test("The composer shows one of the real people at a time, and the two nobody had ever been shown: the one with no name, and the one held back", () => {
  const rows = [
    contact({ id: "c1", display_name: "Daniela R.", wa_profile_name: "Dani" }),
    // Only a number on file. The wire greets them "Hi there" (resolveParams) and
    // the composer had no way to show it before the send went.
    contact({ id: "c2", display_name: null, wa_profile_name: null }),
    contact({ id: "c3", display_name: "Marco Ortiz", wa_profile_name: "Marco" }),
    // In the list, not in the send.
    contact({
      id: "c4",
      display_name: "Tomás Ruiz",
      wa_profile_name: "Tomás",
      consent: "opted_out",
      marketing_consent: "opted_out",
    }),
  ].map((c) => contracts.toPersonRowVM(c, ZONE, new Date(NOW)));
  const pv = contracts.audiencePreview(rows, "everyone", null, null, "marketing", HOW);
  assert.equal(pv.sending, 3);
  assert.equal(pv.held, 1);
  // An ordinary person first, then the one with no name -- the case worth seeing.
  // The name a human typed wins over the WhatsApp profile name, as at the wire.
  assert.equal(pv.people[0].firstName, "Daniela");
  assert.equal(pv.people[1].firstName, null);
  assert.equal(
    pv.people.at(-1).refusal,
    contracts.PURPOSE_REFUSALS.opted_out,
    "the reason is the one the wire would give",
  );

  const tpl = templateRow({
    id: "tpl-1",
    name: "winback_offer",
    purpose: "marketing",
    body_preview: "Hi {{1}}, come back to us.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
  });
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [tpl],
      number: healthyNumber,
      audiences: [
        {
          kind: "everyone",
          id: null,
          label: "Everyone who said yes",
          counts: { marketing: pv.sending, conversational: pv.sending },
          preview: { marketing: pv, conversational: pv },
        },
      ],
    }),
  );

  let tree = writing({ initialSegment: null, initialRun: null });
  const step = byTestId(tree, "mp-step");
  assert.ok(step, "an audience chip showed a count and never a person");
  assert.ok(textOf(step).includes("Daniela R."), textOf(step));
  assert.ok(textOf(step).includes("1 of 3"), textOf(step));
  assert.ok(wordsOf(byTestId(tree, "bc-preview")).includes("Hi Daniela"), "the slot takes THEIR name");

  // The next one has no name on file: the message opens "Hi there", and the page
  // says why rather than leaving it to be discovered after the send.
  press(find(step, (n) => n.props?.["aria-label"] === "The next person"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(wordsOf(byTestId(tree, "bc-preview")).includes("Hi there"), wordsOf(byTestId(tree, "bc-preview")));
  assert.ok(textOf(byTestId(tree, "mp-note")).includes("Hi there"), textOf(byTestId(tree, "mp-note")));

  // And the last is in the list but held back: drawn as not sent, with the reason.
  // Two more steps: Daniela, the one with no name, Marco, then Tomás.
  for (let i = 0; i < 2; i += 1) {
    press(find(byTestId(tree, "mp-step"), (n) => n.props?.["aria-label"] === "The next person"));
    tree = again({ initialSegment: null, initialRun: null });
  }
  assert.ok(byTestId(tree, "mp-held"), "the bubble is marked Not sent");
  assert.ok(textOf(byTestId(tree, "mp-note")).includes("asked to stop"), textOf(byTestId(tree, "mp-note")));
  assert.equal(
    textOf(find(byTestId(tree, "mp-step"), (n) => String(n.props?.className || "").startsWith("mp-step-pos"))),
    "held back",
    "and its place in the walk says so rather than counting them into the send",
  );
});

test("The To row says how many of the list can hear it, and who is held back and why is behind one quiet link -- the chip wall and the held-back paragraphs were the page", () => {
  const rows = [
    contact({ id: "c1", display_name: "Daniela R.", wa_profile_name: "Dani" }),
    contact({ id: "c2", display_name: "Marco Ortiz", wa_profile_name: "Marco" }),
    // In the list, not in the send.
    contact({
      id: "c3",
      display_name: "Tomás Ruiz",
      wa_profile_name: "Tomás",
      consent: "opted_out",
      marketing_consent: "opted_out",
    }),
  ].map((c) => contracts.toPersonRowVM(c, ZONE, new Date(NOW)));
  const pv = contracts.audiencePreview(rows, "everyone", null, null, "marketing", HOW);
  assert.deepEqual([pv.sending, pv.held], [2, 1]);
  const tpl = templateRow({
    id: "tpl-1",
    name: "winback_offer",
    purpose: "marketing",
    body_preview: "Hi {{1}}, come back to us.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
  });
  /** The send screen over a list whose preview is `sample`, its count the sample's own. */
  const open = (sample) => {
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({
        templates: [tpl],
        number: healthyNumber,
        audiences: [
          {
            kind: "everyone",
            id: null,
            label: "Everyone who said yes",
            counts: { marketing: sample.sending, conversational: sample.sending },
            preview: { marketing: sample, conversational: sample },
          },
        ],
      }),
    );
    return writing({ initialSegment: null, initialRun: null });
  };
  const named = (tree) => all(tree, (n) => n.props?.["data-testid"] === "bc-who-row");
  /** The quiet link, which is the kit popover's trigger (a prop, which the stub draws nothing of), or none. */
  const heldLink = (tree) =>
    find(tree, (n) => n.type === Popover && n.props.label === "Who's held back")?.props.trigger ?? null;

  let tree = open(pv);
  // One sentence: the list as a token, and how many of what it holds can hear the message.
  assert.equal(whoN(tree), "2");
  assert.ok(reachText(tree).includes("2 of 3 can hear it"), reachText(tree));
  // No bar on the line: its dot is amber where somebody is held back.
  assert.equal(
    find(tree, (n) => n.type === Meter),
    null,
  );
  assert.equal(byTestId(tree, "bc-reach").props["data-tone"], "warn");
  // The held-back person is named, with the reason the wire would give, behind the line, its one press.
  assert.equal(heldLink(tree)?.props["data-testid"], "bc-reach-held", "the line is the press");
  assert.ok(textOf(heldLink(tree)).includes("1 held back"), textOf(heldLink(tree)));
  assert.equal(named(tree).length, 1);
  assert.ok(textOf(named(tree)[0]).includes("Tomás Ruiz"), textOf(named(tree)[0]));
  assert.ok(textOf(named(tree)[0]).includes(contracts.PURPOSE_REFUSALS.opted_out), textOf(named(tree)[0]));
  assert.equal(byTestId(tree, "bc-who-rest"), null, "nobody held that it does not name");
  // Pressing the name walks the bubble to them: Not sent, with the reason.
  assert.equal(byTestId(tree, "mp-held"), null, "the bubble opens on someone who is sent to");
  press(byTestId(named(tree)[0], "bc-who-name"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(byTestId(tree, "mp-held"), "the bubble is marked Not sent");
  assert.ok(textOf(byTestId(tree, "mp-note")).includes("asked to stop"), textOf(byTestId(tree, "mp-note")));

  // More held back than the sample names: how many, for the same reasons.
  tree = open({ ...pv, held: 3 });
  assert.equal(textOf(byTestId(tree, "bc-who-rest")), "2 more held back, for the same reasons");
  assert.ok(reachText(tree).includes("2 of 5 can hear it"));
  // None named, but some held: the count says so, and points to the reasons on the line above.
  const unnamed = { ...pv, people: pv.people.filter((p) => !p.refusal), held: 2 };
  tree = open(unnamed);
  assert.equal(named(tree).length, 0);
  assert.equal(textOf(byTestId(tree, "bc-who-rest")), "2 held back, for the reasons above");
  // Nobody held back: no one is named in it, but the link stays (the paragraphs the row used to carry are behind it).
  tree = open({ ...unnamed, held: 0 });
  assert.ok(heldLink(tree), "the rules and who said yes are behind it whether or not anybody is held");
  assert.equal(named(tree).length, 0);
  assert.equal(byTestId(tree, "bc-who-rest"), null);
  assert.ok(reachText(tree).includes("All 2 can hear it"));
  // A surface cached before the people were kept has no pool to say: the count alone.
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [tpl],
      number: healthyNumber,
      audiences: [{ kind: "everyone", id: null, label: "Everyone", counts: { marketing: 2, conversational: 3 } }],
    }),
  );
  tree = writing({ initialSegment: null, initialRun: null });
  assert.ok(reachText(tree).includes("2 can hear it"), reachText(tree));
  assert.equal(
    find(tree, (n) => n.type === Meter),
    null,
  );
  assert.ok(heldLink(tree), "and the link, which holds what the row used to say under it");
});

test("One chip per message, its languages inside it -- the starter set in two drew seven pairs of identical chips", () => {
  // Three a broadcast can send: a visit's or a proposal's slots are a moment's to fill, never a broadcast's (the lifecycle
  // set opens with the win-back, the month's offer and the visit reminder).
  const some = starters.list
    .filter((s) => !s.texts.en_US.slots.some((x) => /^visit_|^proposal_/.test(x.kind)))
    .slice(0, 3);
  // As the rows come back: both languages, in no useful order.
  const rows = [];
  for (const lang of ["es", "en_US"]) {
    for (const s of some) {
      const t = starters.text(s, lang);
      rows.push(
        templateRow({
          id: `${s.name}:${lang}`,
          name: s.name,
          language: lang,
          category: s.category,
          purpose: s.category === "utility" ? "conversational" : "marketing",
          body_preview: t.body,
        }),
      );
    }
  }
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: rows, number: healthyNumber }));
  let tree = writing({ initialSegment: null, initialRun: null });

  // The message is the kit's picker (the chips are gone): one option per MESSAGE, not per row.
  const pickable = optionsOf(pickerOf(tree, "bc-template"));
  assert.equal(
    pickable.length,
    some.length,
    `one option per MESSAGE, not per row: ${pickable.map((o) => o.label).join(" | ")}`,
  );
  const titles = pickable.map((o) => o.label.trim());
  assert.equal(new Set(titles).size, titles.length, `REGRESSION: two options read alike -- ${titles.join(" | ")}`);
  assert.ok(
    pickable.every((o) => o.meta === "2 languages"),
    "each says how many languages it is in",
  );

  // The picked message carries ONE language control -- the language it would go in -- where
  // a toggle spelled out every language of every message: "English | Spanish".
  assert.equal(all(tree, (n) => n.type === Picker && n.props["data-testid"] === "bc-template-lang").length, 1);
  assert.equal(
    faceOf(tree, "bc-template-lang").trim(),
    "English",
    "the language it would go in, a word under the preview",
  );
  // A group with one language shows no language control at all.
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [rows[rows.length - 1]], number: healthyNumber }));
  assert.equal(pickerOf(writing({ initialSegment: null, initialRun: null }), "bc-template-lang"), null);

  // Picking a language picks THAT row, and the armed send names it.
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: rows, number: healthyNumber }));
  tree = writing({ initialSegment: null, initialRun: null });
  const was = pickerOf(tree, "bc-template").props.value;
  const languages = optionsOf(pickerOf(tree, "bc-template-lang"));
  assert.deepEqual(
    languages.map((o) => o.label),
    ["English", "Spanish"],
    "every language the message is approved in, in words -- and nothing it is not",
  );
  assert.equal(languages[1].sub, "Español", "each in its own words too, where they differ");
  pickerOf(tree, "bc-template-lang").props.onValueChange("es");
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(faceOf(tree, "bc-template-lang").trim(), "Spanish", "the picker says the language it goes in");
  assert.equal(pickerOf(tree, "bc-template").props.value, was, "and the message is the same one");
  press(byTestId(tree, "bc-send"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(textOf(byTestId(tree, "bc-send-confirm")).includes("(Spanish)"), textOf(byTestId(tree, "bc-send-confirm")));

  // Picking another message keeps the language it is in, where the message has it.
  tree = again({ initialSegment: null, initialRun: null });
  const other = pickable.find((o) => o.value !== was).value;
  pickerOf(tree, "bc-template").props.onValueChange(other);
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(pickerOf(tree, "bc-template").props.value, other);
  assert.equal(faceOf(tree, "bc-template-lang").trim(), "Spanish", "in the language the screen was on");

  // And the composer opens on the same row however the rows arrive: `defaultTemplate`
  // used to `find` on the list as given, so a reload could open on the other language.
  const opened = (list) => {
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: list, number: healthyNumber }));
    const t = writing({ initialSegment: null, initialRun: null });
    const on = pickerOf(t, "bc-template-lang");
    return on ? `${faceOf(t, "bc-template").trim()} ${faceOf(t, "bc-template-lang").trim()}` : null;
  };
  assert.ok(opened(rows), "the composer opens on a message with its language");
  assert.equal(opened(rows), opened(rows.slice().reverse()), "the picker opens on the same language either way");
});

test("The template a composer opens on does not depend on the order the rows arrived in", () => {
  // The page sorts before it asks, so the rendered picker is steady either way --
  // but `defaultTemplate` is what a caller that does NOT sort gets, and it used
  // to `find` on the list as given. Held here, where the fix is.
  const row = (name, language) => ({
    id: `${name}:${language}`,
    name,
    language,
    category: "marketing",
    source: "chanlytics",
    title: null,
  });
  const list = [
    row("welcome_new", "es"),
    row("winback_offer", "es"),
    row("welcome_new", "en_US"),
    row("winback_offer", "en_US"),
  ];
  const pick = (l) => contracts.defaultTemplate(l, "quiet_30").id;
  assert.equal(pick(list), pick(list.slice().reverse()));
  assert.equal(pick(list), "winback_offer:en_US", "the trigger's starter, in the first language of the total order");
  // And the order IS total: two rows of one name never compare equal.
  assert.notEqual(contracts.compareTemplates(row("winback_offer", "en_US"), row("winback_offer", "es")), 0);
});

test("A message says its state once, and a refusal is a line rather than a hover", () => {
  // The language button switched the language AND carried that language's status
  // as a dot plus words, so the control you press to read the Spanish version was
  // the only place its approval was written -- and a rejection's reason was a
  // `title=`, which a touch screen has no way to show at all.
  messages({
    templatesAll: [
      templateRow({ id: "t-en", name: "offer", language: "en_US", meta_status: "approved" }),
      templateRow({ id: "t-es", name: "offer", language: "es", meta_status: "pending" }),
    ],
  });
  // One chip for both, in the open row: the language in view, its state DRAWN, and "+1" for the
  // other -- a language, not a state, in its words.
  let tree = openedRow(customRow);
  let chip = pickerOf(paneOf(tree), "template-lang");
  assert.deepEqual(chipSays(chip), ["EN", "+1"]);
  assert.ok(
    !/approved|review/i.test(textOf(chip.props.face)),
    `the chip says a language, not a state: ${textOf(chip.props.face)}`,
  );
  assert.equal(chipTone(chip), "ok");
  // Opened, each language WhatsApp holds says its state in words at its right (the option's own word at its end).
  const held = optionsIn(paneOf(tree)).filter((o) => o.group === "on");
  assert.deepEqual(
    held.map((o) => [o.value, o.meta]),
    [
      ["en_US", "Approved"],
      ["es", "In review"],
    ],
  );
  // Words once per MESSAGE, beside the title, for the language that is not simply
  // approved -- whichever language is in view. It was the state of the language in
  // view, so a message half in review read as fine until Spanish was pressed.
  assert.equal(
    textOf(byTestId(tree, "template-status")).trim(),
    "Spanish in review",
    "the language that is not approved, in words, beside the title",
  );
  pickLanguage(paneOf(tree), held[1].value);
  tree = messagesAgain();
  chip = pickerOf(paneOf(tree), "template-lang");
  assert.deepEqual(chipSays(chip), ["ES", "+1"], "Spanish in view, English the one more");
  assert.equal(chipTone(chip), "info", "drawn in review");
  assert.equal(
    textOf(byTestId(tree, "template-status")).trim(),
    "Spanish in review",
    "and the same words with the other language in view",
  );
  // A message whose every language is approved has nothing to say: a green
  // "Approved" on every row is the state said twice, beside the slot that drew it.
  tree = messages({
    templatesAll: [templateRow({ id: "t-en", name: "offer", language: "en_US", meta_status: "approved" })],
  });
  assert.equal(
    byTestId(byTestId(tree, "custom-row"), "template-status"),
    null,
    "nothing to say about an approved message",
  );

  tree = messages({
    templatesAll: [
      templateRow({ name: "offer", language: "en_US", meta_status: "rejected", rejected_reason: "ABUSIVE_CONTENT" }),
    ],
  });
  const said = textOf(byTestId(tree, "template-rejected"));
  assert.ok(said.includes("abusive content"), said);
  assert.ok(said.includes("send it back"), "and what to do about it");

  // A reason Meta wrote as a sentence keeps its capital and its one full stop (contracts refusedWords).
  tree = messages({
    templatesAll: [
      templateRow({
        name: "offer",
        language: "en_US",
        meta_status: "rejected",
        rejected_reason: "Variables can't be at the start or end of the template.",
      }),
    ],
  });
  assert.equal(
    textOf(byTestId(tree, "template-rejected")),
    "WhatsApp refused this one: Variables can't be at the start or end of the template. Change the words and send it back.",
    "REGRESSION: 'variables can't be at the start or end of the template.. Change the words'",
  );
});

test("A template written here keeps its footer everywhere, not only while it is being drafted", () => {
  // The components as the CREATE path files them with Meta, built by contracts --
  // not a shape invented here.
  const written = contracts.templateComponents({
    name: "spring_offer",
    language: "en_US",
    category: "marketing",
    body: "Hi {{1}}, 20% off any service this week.",
    footer: "Reply STOP to opt out",
    examples: ["Dani"],
  });
  // And as the SYNC stores them, which is Meta's own array.
  const fromManager = [
    { type: "BODY", text: "Hi {{1}}, your table is ready." },
    { type: "FOOTER", text: "Not now? Reply STOP" },
  ];

  const mine = templateRow({
    id: "t-mine",
    name: "spring_offer",
    purpose: "marketing",
    body_preview: "Hi {{1}}, 20% off any service this week.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    footer: contracts.footerOf(written),
  });
  const theirs = templateRow({
    id: "t-theirs",
    name: "front_desk_note",
    source: "meta",
    purpose: "marketing",
    body_preview: "Hi {{1}}, your table is ready.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    footer: contracts.footerOf(fromManager),
  });

  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [mine, theirs], number: healthyNumber }));
  let tree = writing({ initialSegment: null, initialRun: null });
  assert.ok(
    textOf(byTestId(tree, "bc-preview")).includes("Reply STOP to opt out"),
    textOf(byTestId(tree, "bc-preview")),
  );

  // The other one, picked: a template synced from WhatsApp Manager keeps ITS words.
  const pickable = optionsOf(pickerOf(tree, "bc-template"));
  pickerOf(tree, "bc-template").props.onValueChange(pickable[pickable.length - 1].value);
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(textOf(byTestId(tree, "bc-preview")).includes("Not now? Reply STOP"), textOf(byTestId(tree, "bc-preview")));

  // On Messages too, where it said a starter's footer or nothing at all.
  // Scoped to the workspace's OWN message, open in the pane beside the list (the layout is the Inbox's list + pane,
  // Claude Video/docs/2026-10-02-campaigns-on-the-kit.md §3.1): the starter rows on the same page do not carry the
  // library's footer, so reading the whole page would pass either way.
  const msgTree = messagesOpen({ templatesAll: [mine] });
  assert.ok(byTestId(msgTree, "custom-row"), "the workspace's own message has a row");
  const own = paneOf(msgTree);
  assert.ok(own, "and its words open beside the list");
  assert.ok(textOf(own).includes("Reply STOP to opt out"), textOf(own));

  // A row with no footer on file invents none -- and a STARTER still knows its own.
  const bare = templateRow({ id: "t-bare", name: "front_desk_note", footer: null, body_preview: "No footer here." });
  assert.equal(starters.footer(bare), null);
  const s = starters.list[0];
  assert.equal(starters.footer({ name: s.name, language: "es", footer: null }), s.texts.es.footer);
});

test("A template this product cannot send is not offered, and its card says why", () => {
  // `sendTemplate` (packages/channels) puts ONE component on the wire -- the body --
  // and `variablesOf` counts only the BODY's slots. So a template whose heading is a
  // picture, or which takes a value in a heading or a button, passed the composer's
  // "every slot filled" check, enrolled its recipients, and was then refused BY META
  // for every one of them. The owner saw a broadcast that delivered to nobody.
  const parts = (components) => ({
    ...contracts.templateParts(components),
    blocked: contracts.templateBlocked({ components }),
  });
  const plain = templateRow({
    id: "t-ok",
    name: "offer",
    purpose: "marketing",
    body_preview: "Hi {{1}}.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    ...parts([{ type: "BODY", text: "Hi {{1}}." }]),
  });
  const picture = templateRow({
    id: "t-img",
    name: "spring_poster",
    source: "meta",
    purpose: "marketing",
    body_preview: "Hi {{1}}.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    ...parts([
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Hi {{1}}." },
    ]),
  });

  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [plain, picture], number: healthyNumber }));
  const tree = writing({ initialSegment: null, initialRun: null });
  const onTheWire = optionsOf(pickerOf(tree, "bc-template"));
  assert.equal(onTheWire.length, 1, `only what can go on the wire: ${onTheWire.map((o) => o.label).join(" | ")}`);
  // As on Playbooks, it says, under the list, why the rest is not there.
  const why = textOf(pickerOf(tree, "bc-template").props.note);
  assert.ok(why.includes("a picture for a heading"), why);
  assert.ok(why.includes("WhatsApp Manager"), "and where it does still work");
  assert.equal(byTestId(tree, "bc-blocked"), null, "with a list to stand under, it is not said twice");
  // With nothing left to pick, there is no list for it to stand under: it is a line of its own.
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [picture], number: healthyNumber }));
  const bare = writing({ initialSegment: null, initialRun: null });
  assert.equal(pickerOf(bare, "bc-template"), null);
  assert.ok(
    textOf(byTestId(bare, "bc-blocked")).includes("a picture for a heading"),
    textOf(byTestId(bare, "bc-blocked")),
  );

  // And the library says why rather than leaving it looking available.
  const card = messages({ templatesAll: [picture] });
  assert.ok(
    textOf(byTestId(card, "template-blocked")).includes("a picture for a heading"),
    textOf(byTestId(card, "template-blocked")),
  );

  // Every shape the wire cannot carry, each named. The page above proves one of
  // them reaches the picker; these prove the rule itself, one case at a time.
  const blocked = (components) => contracts.templateBlocked({ components });
  assert.equal(
    blocked([
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Hi." },
    ]),
    "a picture for a heading",
  );
  assert.equal(
    blocked([
      { type: "HEADER", format: "VIDEO" },
      { type: "BODY", text: "Hi." },
    ]),
    "a video for a heading",
  );
  assert.equal(
    blocked([
      { type: "HEADER", format: "TEXT", text: "{{1}} is back" },
      { type: "BODY", text: "Hi." },
    ]),
    "a heading that takes a value",
  );
  assert.equal(
    blocked([
      { type: "BODY", text: "Hi." },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Book", url: "https://x.example/{{1}}" }] },
    ]),
    "a button that takes a value",
  );
  assert.equal(
    blocked([
      { type: "BODY", text: "Hi." },
      { type: "BUTTONS", buttons: [{ type: "COPY_CODE", text: "Copy" }] },
    ]),
    "a button Chanlytics cannot fill",
  );
  // And every shape it CAN: a static heading, a static link, a quick reply, a call.
  assert.equal(
    blocked([
      { type: "HEADER", format: "TEXT", text: "This week" },
      { type: "BODY", text: "Hi." },
    ]),
    null,
  );
  assert.equal(
    blocked([
      { type: "BODY", text: "Hi." },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Book", url: "https://x.example/book" },
          { type: "QUICK_REPLY", text: "No" },
          { type: "PHONE_NUMBER", text: "Call" },
        ],
      },
    ]),
    null,
  );
  assert.equal(blocked([{ type: "BODY", text: "Hi." }]), null);
  assert.equal(blocked(null), null, "a row with no components on file makes no claim");
});

test("The preview draws the heading and the buttons, which are the message too", () => {
  // For an appointment business the "Book now" button IS the message, and it was
  // the one part of it the operator could not see: `body_preview` is the BODY
  // component alone, so a heading and a button were drawn as nothing at all.
  const components = [
    { type: "HEADER", format: "TEXT", text: "This week at Luna Studio" },
    { type: "BODY", text: "Hi {{1}}, 20% off any colour service." },
    { type: "FOOTER", text: "Reply STOP to opt out" },
    {
      type: "BUTTONS",
      buttons: [
        { type: "URL", text: "Book now", url: "https://booksy.com/luna" },
        { type: "QUICK_REPLY", text: "Not now" },
      ],
    },
  ];
  const tpl = templateRow({
    id: "t-rich",
    name: "offer",
    purpose: "marketing",
    body_preview: "Hi {{1}}, 20% off any colour service.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    ...contracts.templateParts(components),
    blocked: contracts.templateBlocked({ components }),
  });
  assert.equal(tpl.blocked, null, "static heading and static buttons carry no parameter, so this one sends");

  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [tpl], number: healthyNumber }));
  const preview = byTestId(writing({ initialSegment: null, initialRun: null }), "bc-preview");
  assert.ok(textOf(find(preview, (n) => n.props?.className === "mp-header")).includes("This week at Luna Studio"));
  const buttons = byTestId(preview, "mp-buttons");
  assert.ok(buttons, "the buttons are drawn");
  assert.equal(all(buttons, (n) => n.props?.className === "mp-button").length, 2);
  assert.ok(textOf(buttons).includes("Book now") && textOf(buttons).includes("Not now"), textOf(buttons));
  // A screen reader hears the whole message, not the words alone.
  const said = String(find(preview, (n) => n.props?.className === "mp-bubble").props["aria-label"]);
  assert.ok(said.includes("This week at Luna Studio") && said.includes("Book now"), said);
});

test("A message written here can carry a Book now button, and it is the one kind that sends", () => {
  // For an appointment business the button IS the conversion, and until now one
  // could only arrive by syncing from WhatsApp Manager -- where it could just as
  // easily arrive in a shape that cannot be sent at all.
  const settings = {
    config: { brain: { business_name: "Luna Studio", booking_link: "https://booksy.com/luna-studio" } },
  };
  settingsOf({ settings, channels: [{ kind: "whatsapp" }], templatesAll: [] });
  const made = [];
  const keep = { ...templates };
  Object.assign(templates, {
    create: async (b) => {
      made.push(b);
      return { ok: true, data: { name: b.name } };
    },
  });
  try {
    fresh();
    let tree = TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} });
    // The boxes are the kit's Fields (surfaces/kit/field/): what is typed is their `onValueChange`.
    const set = (id, v) => {
      byTestId(tree, id).props.onValueChange(v);
    };
    set("tpl-name", "spring_offer");
    set("tpl-body", "Hi {{1}}, 20% off any colour service this week.");
    tree = drawAgain(() => TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} }));
    // The address is the workspace's own, and it is shown rather than typed.
    // Its label is the Field's own (a prop), so the words are read from it.
    const buttonLabel = textOf(byTestId(tree, "tpl-button-text").props.label);
    assert.ok(buttonLabel.includes("booksy.com/luna-studio"), buttonLabel);
    byTestId(tree, "tpl-button-text").props.onValueChange("Book now");
    all(tree, (n) => n.props?.["data-testid"] === "tpl-examples").length;
    const ex = find(tree, (n) => n.type === Field && n.props?.placeholder === "Ana");
    if (ex) ex.props.onValueChange("Dani");
    tree = drawAgain(() => TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} }));

    // It is drawn where the customer will see it, before anything is filed.
    assert.ok(textOf(byTestId(tree, "mp-buttons")).includes("Book now"), "the composer draws its own button");

    return press(byTestId(tree, "tpl-submit")).then(() => {
      assert.equal(made.length, 1, "it was filed");
      assert.deepEqual(made[0].button, { text: "Book now", url: "https://booksy.com/luna-studio" });
      // And what is filed is a template that SENDS: a static button carries no
      // parameter, so templateBlocked passes it (unlike every shape #646 refuses).
      const check = contracts.validateTemplateDraft({
        name: "spring_offer",
        language: "en_US",
        category: "marketing",
        body: "Hi {{1}}.",
        examples: ["Dani"],
        button: made[0].button,
      });
      assert.ok(check.ok, check.error);
      const components = contracts.templateComponents(check.value);
      assert.equal(contracts.templateBlocked({ components }), null, "a static button is sendable");
      assert.deepEqual(
        contracts.templateParts(components).buttons,
        [{ text: "Book now", kind: "url" }],
        "and it reads back as itself",
      );
    });
  } finally {
    Object.assign(templates, keep);
  }
});

test("A button cannot take a value, and needs somewhere to go", () => {
  const base = { name: "offer", language: "en_US", category: "marketing", body: "Hi {{1}}.", examples: ["Dani"] };
  const err = (button) => contracts.validateTemplateDraft({ ...base, button }).error;
  // The whole point: a button whose URL takes a value needs a parameter that
  // `sendTemplate` never sends, so Meta refuses every recipient.
  assert.match(err({ text: "Book", url: "https://x.example/{{1}}" }), /cannot take a value/);
  assert.match(err({ text: "Book {{1}}", url: "https://x.example" }), /cannot take a value/);
  assert.match(err({ text: "", url: "https://x.example" }), /Give the button its words/);
  assert.match(err({ text: "Book an appointment with us today", url: "https://x.example" }), /under 25 characters/);
  assert.match(err({ text: "Book", url: "booksy.com/luna" }), /starting with https/);
  assert.equal(contracts.validateTemplateDraft({ ...base, button: null }).ok, true, "and no button at all is fine");

  // With no booking link on file the composer offers no button, and says why.
  settingsOf({
    settings: { config: { brain: { business_name: "Luna Studio", booking_link: "" } } },
    channels: [{ kind: "whatsapp" }],
  });
  fresh();
  const tree = TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} });
  assert.equal(byTestId(tree, "tpl-button-text"), null);
  // The hint stands in the Field's place as its control, a prop of the kit's Field (surfaces/kit/field/).
  const none = find(byTestId(tree, "tpl-button"), (n) => n.type === Field).props.control;
  assert.ok(textOf(none).includes("booking link"), textOf(none));
});

test("the send screen says how many of an audience heard from a playbook or a broadcast this week, and leaves them out -- a send by hand was not held back by the week a playbook waits; a switch sends to them too", async () => {
  const rows = [
    {
      id: "a",
      phone: "+13055550101",
      consent: { state: "opted_in", marketing: "opted_in", dnc: false },
      name: "Ana",
      givenName: "Ana",
      waName: null,
    },
    {
      id: "b",
      phone: "+13055550102",
      consent: { state: "opted_in", marketing: "opted_in", dnc: false },
      name: "Bea",
      givenName: "Bea",
      waName: null,
    },
    {
      id: "c",
      phone: "+13055550103",
      consent: { state: "opted_in", marketing: "unknown", dnc: false },
      name: "Cy",
      givenName: "Cy",
      waName: null,
    },
  ];
  // Counted over who it reaches: Cy heard from a run, but no offer reaches Cy. Who heard and when, as GET
  // broadcasts/touches' `touched_at` says it (db recentTouches); the composer counts them for the send's own time (contracts heardFor).
  const touched = { b: [iso(-2 * D)], c: [iso(-2 * D)] };
  const heardNow = (p) => contracts.heardFor(p.heardTouches, NOW, NOW).heard;
  const offers = contracts.audiencePreview(rows, "everyone", null, null, "marketing", HOW, 5, touched);
  assert.deepEqual([offers.sending, heardNow(offers)], [2, 1]);
  const notes = contracts.audiencePreview(rows, "everyone", null, null, "conversational", HOW, 5, touched);
  assert.deepEqual([notes.sending, heardNow(notes)], [3, 2]);
  assert.equal(
    heardNow(contracts.audiencePreview(rows, "everyone", null, null, "marketing", HOW)),
    0,
    "no touches read, nobody said",
  );
  // While the send breathes they are left out; switched to send to them too, the note says who they are.
  assert.equal(contracts.heardWords(2, true), "2 left out: they hear from you within a week of it");
  assert.equal(contracts.heardWords(1, true), "1 left out: they hear from you within a week of it");
  assert.equal(contracts.heardWords(2, false), "2 of them hear from you within a week of it.");
  assert.equal(contracts.heardWords(1, false), "One of them hears from you within a week of it.");
  assert.equal(contracts.heardWords(0, true), null);

  const offer = templateRow({ id: "tpl-offer", name: "fall_offer", purpose: "marketing" });
  const heardSurface = () =>
    broadcastsSurface({
      templates: [offer],
      number: healthyNumber,
      audiences: [
        {
          kind: "everyone",
          id: null,
          label: "Everyone",
          counts: { marketing: 2, conversational: 3 },
          preview: { marketing: offers, conversational: notes },
        },
        {
          kind: "saved",
          id: "s1",
          label: "Regulars",
          counts: { marketing: 2, conversational: 2 },
          preview: { marketing: { ...offers, heardTouches: [] }, conversational: { ...notes, heardTouches: [] } },
        },
      ],
    });
  const sent = [];
  broadcasts.send = async (body) => {
    sent.push(body);
    return {
      ok: true,
      data: {
        id: "b-new",
        name: "Fall offer",
        recipient_count: 2,
        left_out: body.breathe === false ? 0 : 1,
        scheduled_for: new Date().toISOString(),
        moved_from: null,
      },
    };
  };
  const heardToo = (t) =>
    find(t, (n) => n.props?.["data-testid"] === "bc-heard-too" && typeof n.props.onCheckedChange === "function");
  const sendIt = async () => {
    press(byTestId(again({ initialSegment: null, initialRun: null }), "bc-send"));
    await press(byTestId(again({ initialSegment: null, initialRun: null }), "bc-send-yes"));
  };
  setSurfaceValue("broadcasts", heardSurface());
  let tree = writing({ initialSegment: null, initialRun: null });
  assert.equal(textOf(byTestId(tree, "bc-heard")), "1 left out: they hear from you within a week of it");
  // The count is who it sends to: of the two it reaches, the one who heard waits; Cy, with no yes to offers, is held back.
  assert.equal(whoN(tree), "1");
  assert.ok(reachText(tree).includes("1 of 3 can hear it"), reachText(tree));
  assert.equal(byTestId(tree, "bc-reach").props["data-count"], 1, "the line carries its count, which the e2e reads");
  assert.ok(textOf(byTestId(tree, "bc-send")).includes("Send to 1 now"), textOf(byTestId(tree, "bc-send")));
  const sw = heardToo(tree);
  assert.ok(sw, "the switch is drawn where somebody heard");
  assert.equal(sw.props.checked, false, "off by default");
  assert.equal(
    textOf(byTestId(tree, "bc-heard-too-word")),
    "Also send to the one who hears from you within a week of it",
  );
  toasts.length = 0;
  await sendIt();
  assert.equal(sent.length, 1);
  assert.equal("breathe" in sent[0], false, "off: the body says nothing, and the send breathes");
  assert.ok(textOf({ props: { children: toasts.at(-1).msg } }).includes("1 person"), "the toast says who it went to");
  assert.ok(
    textOf({ props: { children: toasts.at(-1).msg } }).includes("1 left out: they hear from you within a week of it"),
  );

  // Switched on: the note says who they are, the count is everyone it reaches, and the send carries breathe: false.
  setSurfaceValue("broadcasts", heardSurface());
  tree = writing({ initialSegment: null, initialRun: null });
  heardToo(tree).props.onCheckedChange(true);
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(heardToo(tree).props.checked, true);
  assert.equal(textOf(byTestId(tree, "bc-heard")), "One of them hears from you within a week of it.");
  assert.equal(whoN(tree), "2");
  // It answers for this message, list and channels alone: on another list it says nothing of them, and the send there
  // breathes; back on this one, the choice made for it stands.
  pickerOf(tree, "bc-audience").props.onValueChange("saved:s1");
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(heardToo(tree), null, "nobody on Regulars heard");
  assert.equal(whoN(tree), "2");
  pickerOf(tree, "bc-audience").props.onValueChange("everyone:");
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(heardToo(tree).props.checked, true, "as it was chosen for Everyone");
  await sendIt();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].breathe, false);
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [offer],
      number: healthyNumber,
      audiences: [
        {
          kind: "everyone",
          id: null,
          label: "Everyone",
          counts: { marketing: 2, conversational: 3 },
          preview: { marketing: { ...offers, heardTouches: [] }, conversational: { ...notes, heardTouches: [] } },
        },
      ],
    }),
  );
  tree = writing({ initialSegment: null, initialRun: null });
  assert.equal(byTestId(tree, "bc-heard"), null, "nobody heard, nothing said");
  assert.equal(heardToo(tree), null, "and no switch");
  assert.equal(whoN(tree), "2");

  // Everyone it reaches heard: the foot says so and Send waits, never "nobody said yes"; the switch sends to them all.
  const all2 = contracts.audiencePreview(rows, "everyone", null, null, "marketing", HOW, 5, {
    a: [iso(-2 * D)],
    b: [iso(-2 * D)],
  });
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [offer],
      number: healthyNumber,
      audiences: [
        {
          kind: "everyone",
          id: null,
          label: "Everyone",
          counts: { marketing: 2, conversational: 3 },
          preview: { marketing: all2, conversational: notes },
        },
      ],
    }),
  );
  tree = writing({ initialSegment: null, initialRun: null });
  assert.equal(textOf(byTestId(tree, "bc-foot-say")), contracts.allLeftOutWords("Everyone", 2));
  assert.equal(byTestId(tree, "bc-nobody"), null, "they said yes: the line about a missing yes is not drawn");
  heardToo(tree).props.onCheckedChange(true);
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(byTestId(tree, "bc-foot-say"), null, "sent to them too, nothing stops it");
});

test("the send screen's composer offers the review ask by the surface its page loads: the broadcasts surface's review link, whether or not Settings was ever opened", () => {
  const was = surfaceValue("settings");
  // Settings never opened in this tab: its surface holds nothing, as before its read lands (offered-templates.ts).
  setSurfaceValue("settings", undefined);
  const review = contracts
    .startersOffered({ reviewLink: true })
    .find((s) => !contracts.startersOffered({ reviewLink: false }).some((x) => x.key === s.key));
  assert.ok(review, "the review ask is the starter a review link adds");
  try {
    for (const reviewLink of [true, false]) {
      setSurfaceValue(
        "broadcasts",
        broadcastsSurface({ templates: [templateRow()], number: healthyNumber, reviewLink }),
      );
      press(byTestId(writing({ initialSegment: null, initialRun: null }), "bc-new-template"));
      const tree = again({ initialSegment: null, initialRun: null });
      const chips = new Set(
        all(tree, (n) => n.props?.["data-testid"] === "tpl-start-from" && n.props.title).map((n) => n.props.title),
      );
      assert.ok(chips.size > 0, "the starters are offered");
      assert.equal(
        chips.has(`${review.title} — ${review.purpose}`),
        reviewLink,
        `the listing keeps ${reviewLink ? "one" : "none"}`,
      );
    }
  } finally {
    setSurfaceValue("settings", was);
  }
});

/* ------------------------------- Send by (One message, every channel, step 3) ------------------------------- */

const { Tooltip } = await import(`${SRC}/surfaces/kit/tooltip/tooltip.tsx`);
const { otherChannelSets } = await import(`${SRC}/lib/campaign-channels.ts`);
const { bcPersonRow } = await import(`${SRC}/surfaces/campaigns/broadcasts/run-sheet.tsx`);

/**
 * The workspace's channels as the page reads them (server/campaigns/channels-ready.ts): every channel ready, and offers by email
 * open (the campaigns domain verified, the address on file, no pause), which the business's own news by email waits for as an
 * offer does (decision D2): a broadcast is that news, so its email is open only here.
 */
const ALL_READY = contracts.channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
});
/** The same workspace before its campaigns domain is set up: offers, and the news with them, are closed by email. */
const OFFERS_CLOSED = contracts.channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true, offers: { campaigns: false, address: true, paused: null } },
});
const NO_TEXT_NO_MAIL = contracts.channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: null,
  email: { mailbox: false, domain: true, offers: { campaigns: true, address: true, paused: null } },
});
/**
 * Four people: one on WhatsApp only, one with an email address only, one with both, one with neither -- so each set of
 * channels reaches a different few, and who is held is held for a different reason.
 */
const viaRows = () =>
  [
    contact({ id: "c-wa", display_name: "Ana Wa", phone_e164: "+17865550101", email: null }),
    contact({ id: "c-mail", display_name: "Mia Mail", phone_e164: null, email: "mia@example.com" }),
    contact({ id: "c-both", display_name: "Bo Both", phone_e164: "+17865550102", email: "bo@example.com" }),
    contact({ id: "c-none", display_name: "Nia None", phone_e164: null, email: null }),
  ].map((c) => contracts.toPersonRowVM(c, ZONE, new Date(NOW)));
/** An audience as the surface publishes it (broadcasts/surface.ts): WhatsApp alone, and the preview for each other set. */
const viaAudience = (rows, ready, touched = {}) => {
  // A broadcast is the business's own news (surface.ts passes "ours", decision D1). Who heard from a run lately and when,
  // as GET broadcasts/touches' `touched_at` says it: nobody, unless a test says who.
  const reading = (purpose, channels) =>
    contracts.audiencePreview(rows, "everyone", null, null, purpose, { channels, ready, about: "ours" }, 5, touched);
  const preview = {
    conversational: reading("conversational", ["whatsapp"]),
    marketing: reading("marketing", ["whatsapp"]),
  };
  const sets = (purpose) =>
    otherChannelSets(ready, purpose, "ours").map((channels) => ({ channels, preview: reading(purpose, channels) }));
  return {
    kind: "everyone",
    id: null,
    label: "Everyone",
    hint: contracts.EVERYONE_HINT,
    counts: { conversational: preview.conversational.sending, marketing: preview.marketing.sending },
    preview,
    by: { conversational: sets("conversational"), marketing: sets("marketing") },
  };
};
/** A message about their visit with a version on each channel; an offer, WhatsApp's alone. */
const noteRow = (channels = ["whatsapp", "sms", "email"]) =>
  templateRow({ id: "tpl-note", name: "hours_note", category: "utility", purpose: "conversational", channels });
const offerRow = () =>
  templateRow({ id: "tpl-offer", name: "fall_offer", purpose: "marketing", channels: ["whatsapp"] });
const viaSurface = (over = {}) => {
  const ready = over.ready === undefined ? ALL_READY : over.ready;
  return broadcastsSurface({
    templates: [noteRow()],
    audiences: [viaAudience(viaRows(), ready ?? ALL_READY)],
    number: healthyNumber,
    ready,
    ...over,
  });
};
const openVia = (over = {}) => {
  setSurfaceValue("broadcasts", viaSurface(over));
  return writing({ initialSegment: null, initialRun: null });
};
const viaAgain = () => again({ initialSegment: null, initialRun: null });
/**
 * The Send by row's toggles by channel (parts/send-by.tsx: a capsule each, a switch to a screen reader), read as the
 * switches they replaced were read: whether it is on, whether it takes no press, what describes it, and a press that asks
 * for a state, which presses the toggle where its state is not that one already.
 */
const viaOf = (tree) =>
  Object.fromEntries(
    ["whatsapp", "sms", "email"].map((c) => {
      const one = byTestId(tree, `bc-via-${c}`);
      return [
        c,
        one && {
          props: {
            role: one.props.role,
            checked: one.props["aria-checked"],
            readOnly: one.props["data-fixed"] === "true",
            describedBy: one.props["aria-describedby"],
            onCheckedChange: (on) => {
              if (on !== one.props["aria-checked"]) one.props.onClick();
            },
          },
        },
      ];
    }),
  );
/** Why each closed channel is closed, under its word in the channels' list (a channel that says nothing says none). */
const reasonsOf = (tree) =>
  Object.fromEntries(
    ["whatsapp", "sms", "email"].flatMap((c) => {
      const why = byTestId(tree, `bc-via-${c}-why`);
      return why ? [[c, textOf(why)]] : [];
    }),
  );

test("Send by: a switch for each channel under To, WhatsApp alone on by default, and a channel closed to the message is off and says why", () => {
  let tree = openVia();
  assert.ok(byTestId(tree, "bc-via"), "the list is drawn");
  const via = viaOf(tree);
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => via[c].props.checked),
    [true, false, false],
    "WhatsApp alone, as every broadcast went",
  );
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => via[c].props.readOnly),
    [true, false, false],
    "the one channel that is on stays on; the others may be turned on",
  );
  assert.deepEqual(
    Object.keys(reasonsOf(tree)),
    ["whatsapp"],
    "a message about their visit goes by all three: only the last one on says why",
  );
  // One sentence (11 Oct 2026): what, to whom, by which channels and when; the name is the pane's head, not a row.
  const recipe = byTestId(tree, "bc-recipe");
  assert.ok(byTestId(recipe, "bc-audience"), "the list is a word of the sentence");
  assert.ok(byTestId(recipe, "bc-via"), "and the channels");
  assert.equal(byTestId(tree, "bc-col-name"), null, "the name is the pane's head");
  // An offer: texts carry no offers, and offers by email wait for their release.
  setSurfaceValue("broadcasts", viaSurface({ templates: [offerRow()], ready: OFFERS_CLOSED }));
  tree = writing({ initialSegment: null, initialRun: null });
  assert.equal(reasonsOf(tree).sms, "Texts carry no offers.");
  assert.equal(reasonsOf(tree).email, "Offers by email start once the campaigns domain is set up.");
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => viaOf(tree)[c].props.readOnly),
    [true, true, true],
  );
  // The reason is the switch's own description too, and stands under its word.
  const why = byTestId(tree, "bc-via-sms-why");
  assert.equal(textOf(why), "Texts carry no offers.");
  assert.equal(viaOf(tree).sms.props.describedBy, why.props.id);
  viaOf(tree).sms.props.onCheckedChange(true);
  assert.equal(viaOf(viaAgain()).sms.props.checked, false, "pressing a closed channel changes nothing");
});

test("Send by: no texting line or mailbox says what is missing, a message with no version on a channel says so, and an unread workspace offers WhatsApp alone", () => {
  let tree = openVia({ ready: NO_TEXT_NO_MAIL });
  assert.equal(reasonsOf(tree).sms, "No texting line yet.");
  assert.equal(reasonsOf(tree).email, "Set up email in Settings › Connections first.");
  tree = openVia({ templates: [noteRow(["whatsapp", "email"])] });
  assert.equal(reasonsOf(tree).sms, "This message has no text version yet.", "the line is ready, the message is not");
  assert.equal(viaOf(tree).email.props.readOnly, false, "its email version is there");
  // Unread: WhatsApp as before, which the number's banner judges; the others are not offered, and it says it could not tell.
  tree = openVia({ ready: null });
  assert.equal(viaOf(tree).whatsapp.props.checked, true);
  // A broadcast is the business's news, an offer by email at the door (decision D2): a page that read no facts about offers says
  // what an offer says of them, closed, in the campaigns domain's words (the edge that could not be asked says "could not be
  // checked" through the facts themselves, contracts channelsReady).
  assert.equal(reasonsOf(tree).email, contracts.CHANNEL_WORDS.noOffersByEmailYet);
  assert.equal(byTestId(tree, "bc-send").props.disabled, false, "and a send by WhatsApp is the send it was");
});

test("Send by before a message is picked: a switch is closed by what the workspace cannot send on, never by a version no message has yet", () => {
  // No message to pick from, so none is picked. Every channel is ready: Email may be ticked, and nothing speaks of a version.
  setSurfaceValue("broadcasts", viaSurface({ templates: [] }));
  let tree = writing({ initialSegment: null, initialRun: null });
  assert.equal(viaOf(tree).email.props.readOnly, false, "email is open before a message is picked");
  assert.equal(reasonsOf(tree).email, undefined);
  assert.ok(
    Object.values(reasonsOf(tree)).every((why) => !/version/.test(why)),
    "no switch says a message it does not have yet lacks a version",
  );
  // Nor is Text closed by "Texts carry no offers" over no message: nothing has said it is an offer yet.
  assert.equal(viaOf(tree).sms.props.readOnly, false, "text is open before a message is picked");
  assert.equal(reasonsOf(tree).sms, undefined);
  // What the workspace cannot send on still closes its switch, in the readiness's own words.
  setSurfaceValue("broadcasts", viaSurface({ templates: [], ready: NO_TEXT_NO_MAIL }));
  tree = writing({ initialSegment: null, initialRun: null });
  assert.equal(reasonsOf(tree).email, "Set up email in Settings › Connections first.");
  assert.equal(viaOf(tree).email.props.readOnly, true);
  // Once a message is picked its versions are asked after, as before.
  tree = openVia({ templates: [noteRow(["whatsapp", "email"])] });
  assert.equal(reasonsOf(tree).sms, "This message has no text version yet.");
});

test("Send by, where the workspace can send on nothing: the row says so once, each channel a door to mend it, in place of the reasons a thumb reads", () => {
  const nothing = contracts.channelsReady({
    whatsapp: null,
    textLine: null,
    email: { mailbox: false, domain: true, offers: { campaigns: true, address: true, paused: null } },
  });
  const tree = openVia({ ready: nothing });
  const standing = byTestId(tree, "bc-via-standing");
  assert.ok(standing, "the row says where the workspace stands");
  const parts = contracts.channelsStandingParts(nothing);
  assert.equal(parts[0].words, "Nothing can send yet");
  assert.equal(textOf(standing), parts.map((p) => p.words).join("·"), "contracts' words, part by part");
  // The link itself: the stub walks a component and what it draws, and each carries the test id.
  const doors = all(standing, (n) => n.type === "a" && n.props?.["data-testid"] === "bc-via-standing-door");
  assert.equal(doors.length, 3, "WhatsApp, Text and Email each have the door that mends them");
  for (const door of doors) assert.match(String(door.props.href), /admin\/integrations$/);
  assert.equal(byTestId(tree, "bc-via-whys"), null, "the touch reasons give way to the line that carries the doors");
  // A switch keeps its own reason for a pointer and a screen reader.
  assert.equal(reasonsOf(tree).sms, "No texting line yet.");
  // With no number either, the line has said so with its door: the number's line under When is not the same words again.
  const bare = openVia({ ready: nothing, number: noNumber });
  assert.ok(byTestId(bare, "bc-via-standing"));
  assert.equal(byTestId(bare, "bc-number"), null);
  // A number that is there and cannot send keeps its line: which number, and what is wrong with it.
  assert.ok(byTestId(tree, "bc-number"));
  // A workspace paused for billing is not one that can send on nothing: the foot says the pause, and the row is as it was.
  assert.equal(byTestId(openVia({ ready: { ...ALL_READY, paused: true } }), "bc-via-standing"), null);
  // Anything open, or a readiness that was not read: the row is what it was.
  assert.equal(byTestId(openVia({ ready: NO_TEXT_NO_MAIL }), "bc-via-standing"), null);
  assert.equal(byTestId(openVia({ ready: null }), "bc-via-standing"), null);
});

test("a paused workspace is said where Send would be, and Send is not offered: the foot says it before anything else, whatever is filled in, and the channels are as they were", () => {
  const live = openVia();
  assert.equal(byTestId(live, "bc-send").props.disabled, false, "a workspace that is not paused: Send as it was");
  assert.equal(byTestId(live, "bc-foot-say"), null, "and nothing under the foot");
  const paused = { ...ALL_READY, paused: true };
  let tree = openVia({ ready: paused });
  assert.equal(textOf(byTestId(tree, "bc-foot-say")), contracts.CAMPAIGNS_PAUSED_WORDS, "the foot says the pause");
  assert.equal(byTestId(tree, "bc-send").props.disabled, true, "and Send is not offered");
  // The Send by row keeps saying what each channel can do: the pause is the workspace's, not a channel's.
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => viaOf(tree)[c].props.readOnly),
    ["whatsapp", "sms", "email"].map((c) => viaOf(live)[c].props.readOnly),
  );
  // Whatever else is wrong, the pause is first: with no message picked it is not "Pick the message to send".
  setSurfaceValue("broadcasts", viaSurface({ templates: [], ready: paused }));
  tree = writing({ initialSegment: null, initialRun: null });
  assert.equal(textOf(byTestId(tree, "bc-foot-say")), contracts.CAMPAIGNS_PAUSED_WORDS);
  // A page cached before the readiness carried the pause, or one that could not read it, says nothing of one.
  tree = openVia({ ready: null });
  assert.equal(byTestId(tree, "bc-foot-say"), null);
});

test("the reach splits by channel as the owner ticks: who is reached on which, who is held and why, and the same numbers on the list's token", () => {
  let tree = openVia();
  assert.equal(whoN(tree), "2", "WhatsApp alone: the two with a number");
  assert.equal(byTestId(tree, "bc-reach-by"), null, "and it says nothing new");
  assert.equal(byTestId(tree, "bc-held-by"), null);
  viaOf(tree).email.props.onCheckedChange(true);
  tree = viaAgain();
  // The To line's clause (the full sentence, with who can't be reached, is the question before the send's).
  assert.equal(
    textOf(byTestId(tree, "bc-reach-by")),
    "2 on WhatsApp, 1 by email",
    "each person once, on one channel: the one with both is on WhatsApp",
  );
  assert.equal(whoN(tree), "3");
  assert.deepEqual(
    all(byTestId(tree, "bc-held-by"), (n) => n.type === "li").map((li) => textOf(li)),
    ["1 · No phone number on file, so nothing can be sent."],
  );
  // The list's own count follows the ticks: the picker's hint for the audience.
  const hint = (t) => optionsOf(pickerOf(t, "bc-audience")).map((o) => o.meta);
  assert.deepEqual(hint(tree), ["3"]);
  // Both on, so WhatsApp may go: email alone reaches the two with an address, and who has none is held for it.
  viaOf(tree).whatsapp.props.onCheckedChange(false);
  tree = viaAgain();
  assert.equal(textOf(byTestId(tree, "bc-reach-by")), "2 by email");
  assert.deepEqual(
    all(byTestId(tree, "bc-held-by"), (n) => n.type === "li").map((li) => textOf(li)),
    ["2 · No email address on file, so nothing can be sent."],
  );
  assert.equal(viaOf(tree).email.props.readOnly, true, "the last one on stays on");
  assert.deepEqual(hint(tree), ["2"]);
  // Back to WhatsApp alone: the line goes, the count is the one the page always had.
  viaOf(tree).whatsapp.props.onCheckedChange(true);
  viaOf(viaAgain()).email.props.onCheckedChange(false);
  tree = viaAgain();
  assert.equal(byTestId(tree, "bc-reach-by"), null);
  assert.equal(whoN(tree), "2");
});

test("by email the business's own news reaches only people who have dealt with it or said yes to email: an address alone is held, and the owner is told (decision D1)", () => {
  // The people as the Send by tests have them, but Mia and Bo have never written, called or had a deal: an address, no more.
  const rows = [
    contact({ id: "c-wa", display_name: "Ana Wa", phone_e164: "+17865550101", email: null }),
    contact({
      id: "c-mail",
      display_name: "Mia Mail",
      phone_e164: null,
      email: "mia@example.com",
      last_wrote_at: null,
    }),
    contact({
      id: "c-both",
      display_name: "Bo Both",
      phone_e164: "+17865550102",
      email: "bo@example.com",
      last_wrote_at: null,
    }),
    contact({ id: "c-none", display_name: "Nia None", phone_e164: null, email: null }),
  ].map((c) => contracts.toPersonRowVM(c, ZONE, new Date(NOW)));
  let tree = openVia({ audiences: [viaAudience(rows, ALL_READY)] });
  viaOf(tree).email.props.onCheckedChange(true);
  tree = viaAgain();
  assert.equal(
    textOf(byTestId(tree, "bc-reach-by")),
    "2 on WhatsApp",
    "the two with a number: Mia's address alone adds nobody by email (with a relationship it read 2 on WhatsApp, 1 by email)",
  );
  assert.equal(whoN(tree), "2");
  const held = all(byTestId(tree, "bc-held-by"), (n) => n.type === "li").map((li) => textOf(li));
  assert.deepEqual(
    held,
    ["1 · This customer has not said yes to messages yet.", "1 · No phone number on file, so nothing can be sent."],
    "Mia is held for the yes she never gave, Nia for having no number",
  );
  // Email alone: with no relationship and no yes covering email, Mia and Bo are both held; nobody is reached.
  viaOf(tree).whatsapp.props.onCheckedChange(false);
  tree = viaAgain();
  assert.equal(byTestId(tree, "bc-reach-by"), null, "nobody to split");
  assert.equal(whoN(tree), "0", "an address alone is no yes to the business's news by email");
});

test("a send carries the channels it goes by, and asks with who it reaches on which", async () => {
  const sent = [];
  broadcasts.send = async (body) => {
    sent.push(body);
    return {
      ok: true,
      data: {
        id: "b-new",
        name: "Hours",
        recipient_count: 3,
        scheduled_for: new Date().toISOString(),
        moved_from: null,
      },
    };
  };
  let tree = openVia();
  press(byTestId(tree, "bc-send"));
  await press(byTestId(viaAgain(), "bc-send-yes"));
  assert.deepEqual(sent.at(-1).channels, ["whatsapp"], "WhatsApp alone, named, as every send went");
  tree = openVia();
  viaOf(tree).email.props.onCheckedChange(true);
  tree = viaAgain();
  press(byTestId(tree, "bc-send"));
  tree = viaAgain();
  assert.ok(
    textOf(byTestId(tree, "bc-send-confirm")).includes("Reaches 3: 2 on WhatsApp, 1 by email"),
    "the question before the send names who gets it on which channel",
  );
  // A tick after the question was asked is a question that was not: the button comes back.
  viaOf(tree).whatsapp.props.onCheckedChange(false);
  viaAgain(); // the effect that puts the button back runs on this draw, and the screen shows it on the next
  assert.equal(byTestId(viaAgain(), "bc-send-confirm"), null);
  viaOf(viaAgain()).whatsapp.props.onCheckedChange(true);
  press(byTestId(viaAgain(), "bc-send"));
  await press(byTestId(viaAgain(), "bc-send-yes"));
  assert.deepEqual(sent.at(-1).channels, ["whatsapp", "email"], "in the page's order");
  assert.equal(sent.at(-1).audience.kind, "everyone");
});

test("the number matters to a send only where it goes by WhatsApp: a paused number holds a send that ticks it and not one that goes by email alone", async () => {
  const paused = numberHealth({ quality: "RED", event: null, limit: "TIER_1K" });
  const readyPaused = contracts.channelsReady({
    whatsapp: { canSend: false, refusal: paused.refusal },
    textLine: null,
    email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
  });
  const sent = [];
  broadcasts.send = async (body) => {
    sent.push(body);
    return {
      ok: true,
      data: {
        id: "b-new",
        name: "Hours",
        recipient_count: 2,
        scheduled_for: new Date().toISOString(),
        moved_from: null,
      },
    };
  };
  const number = { present: true, display: "+1 305-555-0100", health: paused };
  // A message WhatsApp alone holds: no channel the workspace can send on holds it, so it opens ticked on WhatsApp, as ever.
  let tree = openVia({ templates: [offerRow()], ready: readyPaused, number });
  assert.equal(viaOf(tree).whatsapp.props.checked, false, "the number cannot send: WhatsApp is off, and says why");
  assert.equal(reasonsOf(tree).whatsapp, paused.refusal);
  assert.equal(byTestId(tree, "bc-send").props.disabled, true);
  assert.equal(
    textOf(byTestId(tree, "bc-number")),
    paused.refusal,
    "the number's own words stand, as it is the channel that was ticked",
  );
  // The line says nothing can carry it, not that nobody said yes: once, in the foot by the send it stops (10 Oct 2026:
  // the row under To said the same sentence a second time).
  assert.equal(byTestId(tree, "bc-nobody"), null);
  assert.equal(
    textOf(byTestId(tree, "bc-foot-say")),
    "None of the channels ticked can carry this message yet.",
    "and the line says nothing can carry it, not that nobody said yes",
  );
  // A message that holds email too opens on the first channel the workspace can send on and it holds: Email, since the
  // number cannot (before the opening ticks followed the message it opened on WhatsApp, and was held by the number).
  tree = openVia({ ready: readyPaused, number });
  assert.deepEqual(
    ["whatsapp", "sms", "email"].map((c) => viaOf(tree)[c].props.checked),
    [false, false, true],
    "it opens on Email: the number is nothing to it",
  );
  assert.equal(reasonsOf(tree).whatsapp, paused.refusal, "WhatsApp is off, and says why");
  assert.equal(byTestId(tree, "bc-number"), null, "a send that does not tick WhatsApp never asks");
  assert.equal(byTestId(tree, "bc-number"), null);
  assert.equal(byTestId(tree, "bc-send").props.disabled, false);
  press(byTestId(tree, "bc-send"));
  await press(byTestId(viaAgain(), "bc-send-yes"));
  assert.deepEqual(sent.at(-1).channels, ["email"], "only what can go: never the channel the number cannot send on");
});

test("a person's line on a run says the channel it went by where the run went by more than WhatsApp: by email, by text, on WhatsApp -- and says nothing of it for a run that went by WhatsApp alone", () => {
  const run = (recipients, over = {}) =>
    contracts.toRunReportVM(
      { broadcast: dto({ params: [{ kind: "first_name" }], ...over }), recipients },
      { windowMs: contracts.REPLY_WINDOW_MS, nowMs: NOW, clock: (t) => (t ? "10:31" : null) },
    );
  const mixed = run([
    person({ contact_id: "k-wa", name: "Ana Wa", channel: "whatsapp", message_status: "delivered" }),
    person({ contact_id: "k-mail", name: "Mia Mail", channel: "email", message_status: "sent", delivered_at: null }),
    person({ contact_id: "k-text", name: "Tex Text", channel: "sms", message_status: "failed" }),
    person({
      contact_id: "k-held",
      name: "Hal Held",
      channel: "email",
      state: "skipped",
      reason: "no_address",
      sent_at: null,
      message_status: null,
    }),
  ]);
  assert.deepEqual(
    mixed.people.map((p) => p.channel),
    ["on WhatsApp", "by email", "by text", "by email"],
  );
  const lines = Object.fromEntries(
    mixed.people.map((p) => [
      p.name,
      textOf(bcPersonRow(p).props.children.find((c) => c?.props?.className === "bc-person-words")),
    ]),
  );
  assert.ok(lines["Mia Mail"].startsWith("by email · sent"), lines["Mia Mail"]);
  assert.equal(lines["Tex Text"], "by text · the text was not delivered", "not a WhatsApp refusal for a text");
  assert.equal(lines["Hal Held"], "no email address", "a person it never went to has the reason: that is the news");
  // A run of WhatsApp alone reads as it always did.
  const quietRun = run([person({ channel: "whatsapp" }), person({ contact_id: "k2", name: "Bea", channel: null })]);
  assert.deepEqual(
    quietRun.people.map((p) => p.channel),
    [null, null],
  );
  assert.ok(!textOf(bcPersonRow(quietRun.people[0])).includes("on WhatsApp"));
});

test("a run waiting on you says who it reaches on which channel, as the run counted them when it was drawn", async () => {
  const today = globalThis.window.__clock.dayKey(Date.now());
  const offerless = { ...noteRow(), id: "tpl-note", variables: [] };
  const reach = {
    pool: 20,
    will: 14,
    noNumber: 0,
    stopped: 0,
    noYes: 0,
    heardThis: 0,
    heardAny: 0,
    overCap: 0,
    overLimit: 0,
    no_address: 6,
    no_channel: 0,
    by_channel: { whatsapp: 10, sms: 0, email: 4 },
  };
  const waiting = dto({
    id: "b-by",
    name: "Visit reminders",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
    recipient_count: 14,
    playbook_id: "pb-visit",
    run_for: today,
    template_id: "tpl-note",
    template_name: "hours_note",
    params: [],
    audience: { kind: "playbook", id: "pb-visit", label: "Visit reminders", reach },
  });
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [offerless], rows: [toBroadcastVM(waiting, ZONE)] }));
  setSurfaceValue(
    "playbooks",
    playbooksSurface({
      rows: [playbook({ id: "pb-visit", name: "Visit reminders", trigger: "visit_tomorrow", policy_class: "booking" })],
    }),
  );
  answers.set("b-by", [
    {
      ok: true,
      data: detailOf(waiting, [
        person({ state: "queued", sent_at: null, message_status: null, delivered_at: null, channel: "email" }),
      ]),
    },
  ]);
  const props = { initialSegment: null, initialRun: "b-by" };
  page(props);
  await settle();
  const tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-sheet-by")), "Reaches 14: 10 on WhatsApp, 4 by email");
  // A run counted before channels, or by WhatsApp alone, says nothing new.
  const old = {
    ...waiting,
    audience: { ...waiting.audience, reach: { ...reach, by_channel: { whatsapp: 14, sms: 0, email: 0 } } },
  };
  answers.set("b-by", [
    {
      ok: true,
      data: detailOf(old, [person({ state: "queued", sent_at: null, message_status: null, delivered_at: null })]),
    },
  ]);
  page(props);
  await settle();
  assert.equal(byTestId(again(props), "bc-sheet-by"), null);
});

/* ------------------------- The preview by channel, a lighter To row, the split as a bar ------------------------- */

/** A message about their visit with a version of its own on each channel, each in its own words. */
const wordedNote = () =>
  templateRow({
    id: "tpl-note",
    name: "hours_note",
    category: "utility",
    purpose: "conversational",
    body_preview: "Hi {{1}}, we are open late on Thursdays.",
    variables: [{ position: 1, label: "First name", example: "Dani" }],
    channels: ["whatsapp", "sms", "email"],
    versions: {
      email: { subject: "A note, {{1}}", body: "Hi {{1}},\nwe are open late on Thursdays." },
      sms: { subject: null, body: "Hi {{1}}, we are open late on Thursdays (text)." },
    },
  });
/** Four people, each reached on a different channel by the pick: WhatsApp, a text, an email, and none. */
const walkRows = () =>
  [
    contact({ id: "w1", display_name: "Ana Reyes", wa_profile_name: "Ana" }),
    contact({
      id: "w2",
      display_name: "Sol Text",
      wa_profile_name: "Sol",
      last_inbound_channel: "sms",
      consent_channels: ["whatsapp", "sms"],
    }),
    contact({
      id: "w3",
      display_name: "Mia Mail",
      wa_profile_name: "Mia",
      phone_e164: null,
      email: "mia@example.com",
      last_inbound_channel: "email",
    }),
    contact({ id: "w4", display_name: "Nia None", wa_profile_name: "Nia", phone_e164: null, email: null }),
  ].map((c) => contracts.toPersonRowVM(c, ZONE, new Date(NOW)));
const openWalk = (over = {}) => {
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [wordedNote()],
      audiences: [viaAudience(walkRows(), ALL_READY)],
      number: healthyNumber,
      ready: ALL_READY,
      // The business's postal address: an email of a broadcast is the business's news, an offer at the door, whose foot names it.
      businessAddress: WALK_ADDRESS,
      ...over,
    }),
  );
  return writing({ initialSegment: null, initialRun: null });
};
const WALK_ADDRESS = "12 Main St, Springfield";
/** What the preview and its stepper say now: who, their place, the channel's label, and the words as that channel draws them. */
const walkNow = (tree) => {
  const step = byTestId(tree, "mp-step");
  const classOf = (n) => String(n.props?.className || "");
  return {
    who: textOf(find(step, (n) => classOf(n) === "mp-step-name")),
    place: textOf(find(step, (n) => classOf(n).startsWith("mp-step-pos"))),
    via: byTestId(tree, "mp-via") ? textOf(byTestId(tree, "mp-via")) : null,
    kind: textOf(find(tree, (n) => classOf(n) === "mp-kind")),
    mail: !!find(tree, (n) => classOf(n).includes("mp-mail-frame")),
    subject: find(tree, (n) => classOf(n) === "mp-subject")
      ? wordsOf(find(tree, (n) => classOf(n) === "mp-subject"))
      : null,
    words: wordsOf(find(tree, (n) => classOf(n) === "mp-body")),
    foot: byTestId(tree, "mp-mail-foot")
      ? textOf(byTestId(tree, "mp-mail-foot"))
      : find(tree, (n) => classOf(n) === "mp-foot")
        ? textOf(find(tree, (n) => classOf(n) === "mp-foot"))
        : null,
    held: !!byTestId(tree, "mp-held"),
  };
};
const nextPerson = () =>
  press(find(byTestId(viaAgain(), "mp-step"), (n) => n.props?.["aria-label"] === "The next person"));

test("the preview steps through the people the send reaches, each as the version of their channel: the email as a mail with its foot, the text with its STOP line, WhatsApp's template for the rest", () => {
  let tree = openWalk();
  // WhatsApp alone, as every send went: one bubble, no channel named, the stepper as it was.
  assert.equal(byTestId(tree, "mp-via"), null, "nothing is said of channels on a send that goes by WhatsApp alone");
  assert.equal(walkNow(tree).mail, false);
  viaOf(tree).sms.props.onCheckedChange(true);
  viaOf(viaAgain()).email.props.onCheckedChange(true);
  tree = viaAgain();
  // Ana, on WhatsApp: the template, the channel named quietly.
  assert.deepEqual(walkNow(tree), {
    who: "Ana Reyes",
    place: "1 of 3",
    via: "On WhatsApp",
    kind: "",
    mail: false,
    subject: null,
    words: "Hi Ana, we are open late on Thursdays.",
    foot: null,
    held: false,
  });
  // Sol, who last wrote by text: the text version, and the STOP line the sender adds under it.
  nextPerson();
  assert.deepEqual(walkNow(viaAgain()), {
    who: "Sol Text",
    place: "2 of 3",
    via: "By text",
    kind: "",
    mail: false,
    subject: null,
    words: "Hi Sol, we are open late on Thursdays (text).",
    foot: "Reply STOP to opt out",
    held: false,
  });
  // Mia, with an address and no number: the email, its subject over its words, and the foot the sender adds.
  nextPerson();
  const mia = walkNow(viaAgain());
  assert.deepEqual(
    [mia.who, mia.place, mia.via, mia.kind, mia.mail, mia.subject, mia.words],
    ["Mia Mail", "3 of 3", "By email", "", true, "A note, Mia", "Hi Mia,\nwe are open late on Thursdays."],
  );
  // A broadcast is the business's own news, an offer at the door (decision D2): its foot is the offer's, the one the send puts on
  // the wire (contracts emailFoot), with the business's address and the way out.
  assert.equal(
    mia.foot,
    contracts.emailFoot(
      "Northside Studio",
      WALK_ADDRESS,
      { kind: "offer", why: "customer", unsubscribeUrl: contracts.PREVIEW_WORDS.unsubscribeLink },
      "en_US",
    ),
    "the foot is the one the send puts on the wire (contracts emailFoot)",
  );
  assert.ok(mia.foot.includes("Unsubscribe") && mia.foot.includes(WALK_ADDRESS));
  assert.ok(!mia.foot.includes("Reply STOP"), "the visit foot's way out is not this one's");
  // With no postal address on file the preview says so, as the send would hold everyone for it, and draws no foot it would not carry.
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      templates: [wordedNote()],
      audiences: [viaAudience(walkRows(), ALL_READY)],
      number: healthyNumber,
      ready: ALL_READY,
      businessAddress: null,
    }),
  );
  const bare = writing({ initialSegment: null, initialRun: null });
  viaOf(bare).email.props.onCheckedChange(true);
  nextPerson();
  nextPerson();
  assert.equal(
    textOf(byTestId(viaAgain(), "mp-version-note")),
    contracts.OFFERS_BY_EMAIL_WORDS.noAddress,
    "no address, no foot to draw: the page says what the send would hold everyone for",
  );
  // Nia is in the list and held back: WhatsApp's bubble, marked Not sent, with no channel named.
  nextPerson();
  const nia = walkNow(viaAgain());
  assert.deepEqual([nia.who, nia.place, nia.via, nia.held, nia.mail], ["Nia None", "held back", null, true, false]);
  // The walk wraps to the first.
  nextPerson();
  assert.equal(walkNow(viaAgain()).who, "Ana Reyes");
});

test("a preview whose email version is not in hand says so, and never draws WhatsApp's words under the email's name", () => {
  const tpl = { ...wordedNote(), versions: { sms: { subject: null, body: "Hi {{1}}, a text." } } };
  let tree = openWalk({ templates: [tpl] });
  viaOf(tree).email.props.onCheckedChange(true);
  nextPerson();
  tree = viaAgain();
  assert.equal(walkNow(tree).who, "Sol Text", "Sol is reached by WhatsApp when the text is not ticked");
  nextPerson();
  tree = viaAgain();
  assert.equal(walkNow(tree).who, "Mia Mail");
  assert.equal(byTestId(tree, "mp-via"), null, "no channel is named over words that are not its");
  assert.equal(walkNow(tree).mail, false);
  assert.equal(textOf(byTestId(tree, "mp-version-note")), "This message has no email version yet.");
});

/** How many of what the predicate names are drawn inside the fold behind "Who's held back", and how many at all. */
const inFold = (tree, pred) => {
  const fold = find(tree, (n) => n.type === Popover && n.props.label === "Who's held back");
  return { inside: fold ? all(fold.props.children, pred).length : 0, total: all(tree, pred).length };
};
// An element drawn, once: a kit component and the element it draws wear the same test id.
const byId = (id) => (n) => typeof n.type === "string" && n.props?.["data-testid"] === id;
const byClass = (c) => (n) => String(n.props?.className || "") === c;

test("The To row is one line -- the list, how many can hear it, on which channel -- and everything it used to say under it is behind Who's held back, one press away", () => {
  const optIn = {
    phrase: "YES OFFERS",
    phraseEs: "SI OFERTAS",
    link: "https://wa.me/17865550100",
    qrPath: null,
    pageUrl: null,
  };
  const offer = templateRow({
    id: "tpl-offer",
    name: "fall_offer",
    purpose: "marketing",
    channels: ["whatsapp"],
    body_preview: "Our fall offer is here.",
  });
  // An offer's workspace before its campaigns domain is set up: offers by email are closed (and the news with them).
  const audience = viaAudience(viaRows(), OFFERS_CLOSED);
  const line = (t) => byTestId(t, "bc-composer");
  let tree = openVia({
    templates: [offer],
    audiences: [audience],
    optIn,
    ready: OFFERS_CLOSED,
  });
  // The list a word of the sentence, and how many can hear it the line under it; WhatsApp alone says nothing of channels.
  assert.ok(pickerOf(byTestId(tree, "bc-recipe"), "bc-audience"), "the list is a word of the sentence");
  assert.ok(reachText(tree).includes("2 of 4 can hear it"), reachText(tree));
  assert.equal(byTestId(line(tree), "bc-reach-by"), null);
  assert.equal(
    find(line(tree), (n) => n.type === Popover && n.props.label === "Who's held back")?.props.trigger.props[
      "data-testid"
    ],
    "bc-reach-held",
    "and the line its one press, always there where a list is picked",
  );
  // The paragraphs the row carried are behind the link and nowhere else: the rules every send keeps, and what an offer needs.
  const rules = inFold(tree, byClass("bc-meta"));
  assert.deepEqual([rules.inside, rules.total], [1, 1], "the rules, once, in the fold");
  assert.ok(textOf(find(tree, byClass("bc-meta"))).includes("held back at the wire"));
  assert.deepEqual(
    [inFold(tree, byId("bc-offers-note")).inside, inFold(tree, byId("bc-offers-note")).total],
    [1, 1],
    "the offers rule, said where an offer is picked, in the fold",
  );
  // The rule is the workspace's, not a constant: WhatsApp alone while offers by email cannot go (no campaigns domain here),
  // and email's too once they can (contracts offersNote, the ticks' own question).
  const noteOf = (t) => textOf(find(t, byId("bc-offers-note")));
  assert.equal(noteOf(tree), contracts.offersNote(OFFERS_CLOSED));
  assert.match(noteOf(tree), /^Offers and news go by WhatsApp only\./);
  const OFFERS_OPEN = contracts.channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: { sms_state: "active", reg_mock: false },
    email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
  });
  const opened = openVia({
    templates: [offer],
    audiences: [viaAudience(viaRows(), OFFERS_OPEN)],
    optIn,
    ready: OFFERS_OPEN,
  });
  assert.equal(noteOf(opened), contracts.offersNote(OFFERS_OPEN));
  assert.match(noteOf(opened), /^Offers and news go by WhatsApp and by email\./);
  // The ones it holds back and why are in the fold too.
  assert.deepEqual([inFold(tree, byId("bc-who-row")).inside, inFold(tree, byId("bc-who-row")).total], [2, 2]);
  assert.equal(inFold(tree, byId("bc-held-yes")).total, 0, "nobody is held for want of a yes here: no door to it");

  // More than WhatsApp: the clause after the count, and the reasons by count in the fold.
  tree = openVia({ audiences: [viaAudience(viaRows(), ALL_READY)], optIn });
  viaOf(tree).email.props.onCheckedChange(true);
  tree = viaAgain();
  assert.equal(textOf(byTestId(line(tree), "bc-reach-by")), "2 on WhatsApp, 1 by email");
  // And the wire's holds are named for the channels it goes by: a phone number for one, an address that works for the other.
  assert.ok(
    textOf(find(tree, byClass("bc-meta"))).includes(
      "people who asked to stop, have no phone number or no email address that works, or are mid-thread with a person are held back at the wire",
    ),
  );
  const by = inFold(tree, byId("bc-held-by"));
  assert.deepEqual([by.inside, by.total], [1, 1], "who is held and why, counted, in the fold");

  // What stops the send stays where the sender reads it, only while it does: nobody to send it to, with the door to their yes.
  const none = viaAudience(
    [
      contracts.toPersonRowVM(
        contact({ id: "n1", consent: "unknown", marketing_consent: "unknown" }),
        ZONE,
        new Date(NOW),
      ),
    ],
    ALL_READY,
  );
  tree = openVia({ audiences: [none], optIn });
  const stop = inFold(tree, byId("bc-nobody"));
  assert.deepEqual([stop.inside, stop.total], [0, 1], "under the line, not behind the link: it is why Send is shut");
  assert.ok(byTestId(byTestId(tree, "bc-nobody"), "bc-nobody-door"), "with its door to their yes");
  const door = inFold(tree, byId("bc-held-yes"));
  assert.deepEqual(
    [door.inside, door.total],
    [1, 1],
    "and the same door behind the link, where people are held for want of a yes",
  );
  press(byTestId(tree, "bc-held-yes"));
  assert.equal(went.at(-1), contracts.GET_YES_ROUTE, "the one door, to where every other nobody-has-said-yes goes");
});

test("the split bar sits under the count where the send goes by more than WhatsApp: a part for each channel, its words on hover, the held people not in it", () => {
  let tree = openVia();
  assert.equal(byTestId(tree, "bc-reach-bar"), null, "WhatsApp alone: no bar");
  assert.equal(
    find(tree, (n) => n.type === Meter),
    null,
    "the line's dot says somebody waits, not a bar",
  );
  viaOf(tree).email.props.onCheckedChange(true);
  tree = viaAgain();
  const bar = byTestId(tree, "bc-reach-bar");
  assert.equal(bar.type, Meter);
  assert.deepEqual(
    bar.props.parts,
    [
      { share: 2, color: "var(--chart-cat-1)" },
      { share: 1, color: "var(--chart-cat-3)" },
    ],
    "two on WhatsApp, one by email, each in its own chart colour; the one held is not in it",
  );
  assert.equal(bar.props["aria-label"], "Reaches 3: 2 on WhatsApp, 1 by email");
  assert.equal(bar.props.size, "sm");
  const tip = all(tree, (n) => n.type === Tooltip).find(
    (t) => t.props.children?.[0] === bar || t.props.children === bar,
  );
  assert.equal(tip?.props.tip, "2 on WhatsApp, 1 by email", "its words in the kit's tooltip");
  // Email alone: one whole part.
  viaOf(tree).whatsapp.props.onCheckedChange(false);
  tree = viaAgain();
  assert.deepEqual(byTestId(tree, "bc-reach-bar").props.parts, [{ share: 2, color: "var(--chart-cat-3)" }]);
  assert.equal(byTestId(tree, "bc-reach-bar").props["aria-label"], "Reaches 2 by email");
});

test("the send says under the To line when the month's emails cannot carry everyone it reaches by email, before it goes -- and nothing while there is room or by WhatsApp alone", () => {
  let tree = openVia({ month_sent: { email: 2000, sms: 0 } });
  assert.equal(byTestId(tree, "bc-allowance"), null, "WhatsApp alone spends no allowance");
  viaOf(tree).email.props.onCheckedChange(true);
  tree = viaAgain();
  assert.equal(
    textOf(byTestId(tree, "bc-allowance")),
    "This month's 2,000 emails are used up: 1 person will be held back.",
    "the one reached by email is held, and the sender reads it before sending (contracts allowanceBeforeSend)",
  );
  tree = openVia({ month_sent: { email: 10, sms: 0 } });
  viaOf(tree).email.props.onCheckedChange(true);
  tree = viaAgain();
  assert.equal(byTestId(tree, "bc-allowance"), null, "room for everyone: nothing said");
  tree = openVia({ month_sent: null });
  viaOf(tree).email.props.onCheckedChange(true);
  tree = viaAgain();
  assert.equal(
    byTestId(tree, "bc-allowance"),
    null,
    "a month that could not be counted says nothing it cannot support",
  );
});

test("by more than WhatsApp, every number beside the count is who it sends to: the channel clause, the bar and the month's line leave out whoever heard this week, and the switch puts them back", () => {
  // Mia, reached by email alone, heard from a run this week; the month's emails are used up.
  const surface = () =>
    viaSurface({
      audiences: [viaAudience(viaRows(), ALL_READY, { "c-mail": [iso(-2 * D)] })],
      month_sent: { email: 2000, sms: 0 },
    });
  setSurfaceValue("broadcasts", surface());
  let tree = writing({ initialSegment: null, initialRun: null });
  viaOf(tree).email.props.onCheckedChange(true);
  tree = viaAgain();
  assert.equal(textOf(byTestId(tree, "bc-heard")), contracts.heardWords(1, true));
  assert.equal(whoN(tree), "2");
  assert.equal(textOf(byTestId(tree, "bc-reach-by")), "2 on WhatsApp", "nobody by email: Mia is left out");
  assert.deepEqual(
    byTestId(tree, "bc-reach-bar").props.parts.map((p) => p.share),
    [2],
    "the bar draws who it sends to, WhatsApp's two alone",
  );
  assert.equal(byTestId(tree, "bc-allowance"), null, "nobody goes by email, so the month holds nobody");
  // Sent to her too: by email again, and held by the month as before.
  find(
    tree,
    (n) => n.props?.["data-testid"] === "bc-heard-too" && typeof n.props.onCheckedChange === "function",
  ).props.onCheckedChange(true);
  tree = viaAgain();
  assert.equal(whoN(tree), "3");
  assert.equal(textOf(byTestId(tree, "bc-reach-by")), "2 on WhatsApp, 1 by email");
  assert.deepEqual(
    byTestId(tree, "bc-reach-bar").props.parts.map((p) => p.share),
    [2, 1],
  );
  assert.equal(
    textOf(byTestId(tree, "bc-allowance")),
    "This month's 2,000 emails are used up: 1 person will be held back.",
  );
});

test("a send scheduled ahead leaves out who hears from you within a week of it: the count, the words and the switch follow the time picked", () => {
  // Ana heard two days ago, Bo five days ago; by WhatsApp alone the send reaches the two of them.
  setSurfaceValue(
    "broadcasts",
    viaSurface({
      audiences: [viaAudience(viaRows(), ALL_READY, { "c-wa": [iso(-2 * D)], "c-both": [iso(-5 * D)] })],
    }),
  );
  const props = { initialSegment: null, initialRun: null };
  const C = globalThis.__clock;
  const heardToo = (t) =>
    find(t, (n) => n.props?.["data-testid"] === "bc-heard-too" && typeof n.props.onCheckedChange === "function");
  // Now: both heard this week, so both are left out and nobody is left to send it to.
  let tree = writing(props);
  assert.equal(textOf(byTestId(tree, "bc-heard")), contracts.heardWords(2, true));
  assert.equal(whoN(tree), "0");
  assert.equal(textOf(byTestId(tree, "bc-foot-say")), contracts.allLeftOutWords("Everyone", 2));
  // Three days ahead: a week before it holds Ana's message, not Bo's.
  pickerOf(tree, "bc-when-mode").props.onValueChange("later");
  tree = again(props);
  find(tree, (n) => n.type === DatePicker).props.onValueChange(C.dayKey(Date.now() + 3 * D));
  tree = again(props);
  pickerOf(tree, "bc-when-time").props.onValueChange("14:30");
  tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-heard")), "1 left out: they hear from you within a week of it");
  assert.equal(whoN(tree), "1");
  assert.equal(
    textOf(byTestId(tree, "bc-heard-too-word")),
    "Also send to the one who hears from you within a week of it",
  );
  assert.equal(heardToo(tree).props.checked, false);
  // Ten days ahead: nobody known now hears from you within a week of it, so nobody is left out.
  find(tree, (n) => n.type === DatePicker).props.onValueChange(C.dayKey(Date.now() + 10 * D));
  tree = again(props);
  assert.equal(byTestId(tree, "bc-heard"), null);
  assert.equal(heardToo(tree), null);
  assert.equal(whoN(tree), "2");
});

test("a message due weeks ahead leaves nobody out of a send now, and one due in three days does: the composer counts both sides of the send", () => {
  // Ana is queued for a run in twenty-five days; Bo for one in three days. By WhatsApp alone the send reaches the two.
  setSurfaceValue(
    "broadcasts",
    viaSurface({
      audiences: [viaAudience(viaRows(), ALL_READY, { "c-wa": [iso(25 * D)], "c-both": [iso(3 * D)] })],
    }),
  );
  const props = { initialSegment: null, initialRun: null };
  let tree = writing(props);
  assert.equal(textOf(byTestId(tree, "bc-heard")), contracts.heardWords(1, true), "Bo, three days ahead, is left out");
  assert.equal(whoN(tree), "1", "Ana, twenty-five days ahead, goes");
  // Set for twenty days ahead, Ana's run is five days after it: she is left out, and Bo goes.
  pickerOf(tree, "bc-when-mode").props.onValueChange("later");
  tree = again(props);
  find(tree, (n) => n.type === DatePicker).props.onValueChange(globalThis.__clock.dayKey(Date.now() + 20 * D));
  tree = again(props);
  pickerOf(tree, "bc-when-time").props.onValueChange("14:30");
  tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-heard")), contracts.heardWords(1, true));
  assert.equal(whoN(tree), "1");
});

/**
 * Ana (WhatsApp) and Mia (email) heard two days ago, Bo did not: by WhatsApp and email the send reaches the three, and
 * now it leaves the two out. The send screen opened on them, with email ticked.
 */
const openTwoHeard = (props) => {
  setSurfaceValue(
    "broadcasts",
    viaSurface({
      audiences: [viaAudience(viaRows(), ALL_READY, { "c-wa": [iso(-2 * D)], "c-mail": [iso(-2 * D)] })],
    }),
  );
  viaOf(writing(props)).email.props.onCheckedChange(true);
  return again(props);
};

test("Send now with no time picked is counted for now: its button leaves out who hears from you within a week of now", () => {
  const tree = openTwoHeard({ initialSegment: null, initialRun: null });
  // Now: the two are left out, and Send now names the one it goes to.
  assert.equal(whoN(tree), "1");
  assert.ok(textOf(byTestId(tree, "bc-send")).includes("Send to 1 now"), textOf(byTestId(tree, "bc-send")));
});

test("a Confirm asked for a send now is put away when a time is picked: the act is Schedule, for the picked time's count, and the preview stays on the person it showed", () => {
  const props = { initialSegment: null, initialRun: null };
  const C = globalThis.__clock;
  /** Who the preview is drawn for: the stepper's name. */
  const shownName = (t) =>
    textOf(find(byTestId(t, "mp-step"), (n) => String(n.props?.className || "") === "mp-step-name"));
  let tree = openTwoHeard(props);
  // The preview walked on from its first person.
  const first = shownName(tree);
  press(find(byTestId(tree, "mp-step"), (n) => n.props?.["aria-label"] === "The next person"));
  tree = again(props);
  const shown = shownName(tree);
  assert.ok(shown && shown !== first, `the preview moved on from ${first}: ${shown}`);
  // Send now asks first, and the question is about the one it goes to now.
  press(byTestId(tree, "bc-send"));
  tree = again(props);
  const confirm = textOf(byTestId(tree, "bc-send-confirm"));
  assert.ok(confirm.includes("to 1 person on “Everyone”"), confirm);
  // A time ten days ahead, picked in the sentence while it asks: no longer the question that was asked.
  const at = C.fromInput(`${C.dayKey(Date.now() + 10 * D)}T14:30`);
  find(tree, (n) => n.type === BcWhenPick).props.onChange(at);
  again(props); // the effect that puts the question away runs on this draw, and the screen shows it on the next
  tree = again(props);
  assert.equal(byTestId(tree, "bc-send-confirm"), null, "the Confirm is put away: its Yes would send now");
  assert.equal(byTestId(tree, "bc-send"), null, "the act is Schedule alone");
  const schedule = byTestId(tree, "bc-schedule");
  assert.ok(schedule, "Schedule is drawn for the picked time");
  assert.equal(schedule.props.disabled, false, "and may go");
  // Ten days ahead nobody hears from you within a week of it: the count is the three.
  assert.equal(whoN(tree), "3");
  assert.equal(byTestId(tree, "bc-heard"), null);
  assert.equal(shownName(tree), shown, "picking a time does not move the preview");
});

test("a composer whose read of who heard this week failed says the send still leaves them out, and counts as it can", () => {
  setSurfaceValue("broadcasts", viaSurface({ heardRead: false }));
  const props = { initialSegment: null, initialRun: null };
  let tree = writing(props);
  assert.equal(textOf(byTestId(tree, "bc-heard-unread")), contracts.HEARD_UNREAD_WORDS);
  assert.equal(byTestId(tree, "bc-heard-too"), null, "no switch for people it cannot name");
  // A time picked ahead: the same words, whichever time the send goes at.
  pickerOf(tree, "bc-when-mode").props.onValueChange("later");
  tree = again(props);
  find(tree, (n) => n.type === DatePicker).props.onValueChange(globalThis.__clock.dayKey(Date.now() + 3 * D));
  tree = again(props);
  pickerOf(tree, "bc-when-time").props.onValueChange("14:30");
  tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-heard-unread")), contracts.HEARD_UNREAD_WORDS);
  setSurfaceValue("broadcasts", viaSurface());
  assert.equal(
    byTestId(writing({ initialSegment: null, initialRun: null }), "bc-heard-unread"),
    null,
    "read: nothing said",
  );
});

test("a waiting run whose day has passed is not offered an Approve the route refuses: the button says why, and approves nothing", async () => {
  // approveRun refuses a playbook's run on a later day than the one it was made for (contracts runApprovalRefusal). The
  // run's sheet said so; the run's card offered Approve all the same, and the route answered 409.
  const stale = dto({
    id: "b-stale",
    name: "Win-back · 2026-09-10",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
  });
  assert.equal(stale.run_for, "2026-09-10", "the fixture's day is long gone");
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [stale].map((b) => toBroadcastVM(b, ZONE)) }));
  const keep = broadcasts.approve;
  const approvals = [];
  broadcasts.approve = async (id) => {
    approvals.push(id);
    return { ok: true, data: {} };
  };
  const acts = { canSend: true, armed: false, onArm() {}, stopping: false, cancel() {} };
  const verbs = () =>
    BcRunVerbs({ row: toBroadcastVM(stale, ZONE), ...acts, approve: (row) => void broadcasts.approve(row.id) });
  try {
    // Where the shell gates a control (data-bits gatedProps), the button carries the verb's own sentence.
    globalThis.window.gatedProps = (reason) => ({ "aria-disabled": true, "data-tip": reason, onClick() {} });
    let approve = byTestId(verbs(), "bc-approve");
    assert.equal(approve.props["aria-disabled"], true);
    assert.match(
      approve.props["data-tip"],
      /^This run was made for .+ and that day has passed: .+ Skip it; the next run reads the calendar again\.$/,
    );
    press(approve);
    await settle();
    assert.deepEqual(approvals, [], "REGRESSION: Approve on a run the verb refuses");
    // And where it does not (the standalone page), the press still approves nothing.
    delete globalThis.window.gatedProps;
    approve = byTestId(verbs(), "bc-approve");
    press(approve);
    await settle();
    assert.deepEqual(approvals, [], "no gate, and still no approve");

    // A reach-out's run has no day to pass: approveRun takes it to its own verb before it asks the day (decision D6), so
    // the predicate says nothing of it (runApprovalRefusal, exemption and all).
    const reach = dto({
      id: "b-reach",
      name: "Dentists · 2026-09-10",
      state: "pending_approval",
      started_at: null,
      finished_at: null,
      scheduled_for: iso(-H),
      audience: { kind: "reach_out", root_id: "pb-1", step_id: "pb-1", label: "Dentists" },
      counts: quiet,
    });
    const { runApprovalRefusal } = await import("@chanlytics/contracts");
    const days = { today: "2026-10-05", sendsOn: "2026-10-05" };
    assert.equal(runApprovalRefusal(reach, days), null, "the predicate itself");
    assert.match(runApprovalRefusal(stale, days), /that day has passed/);
  } finally {
    delete globalThis.window.gatedProps;
    broadcasts.approve = keep;
  }
});

test("a run decided on its sheet alone is never approved or skipped from its pane's head: the pane that is its sheet draws none of it (D1-run-reachout-approve)", () => {
  // The rule is the run's offer (contracts waitingRunOffer), asked once: a reach-out's run is `open`; a playbook's own is
  // approved in place, and one whose day has passed is `skip`, which a row still draws (its Approve says why it cannot).
  const waiting = {
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
  };
  const reach = toBroadcastVM(
    dto({
      ...waiting,
      id: "b-reach",
      audience: { kind: "reach_out", root_id: "pb-1", step_id: "pb-1", label: "Dentists" },
    }),
    ZONE,
  );
  const own = toBroadcastVM(
    dto({ ...waiting, id: "b-own", run_for: globalThis.window.__clock.dayKey(Date.now()) }),
    ZONE,
  );
  const stale = toBroadcastVM(dto({ ...waiting, id: "b-stale" }), ZONE);
  assert.equal(bcOpensOnItsSheet(reach), true);
  assert.equal(bcOpensOnItsSheet(own), false);
  assert.equal(
    bcOpensOnItsSheet(stale),
    false,
    "a run whose day has passed is skipped from its row: its offer is skip",
  );
  const acts = { canSend: true, armed: false, onArm() {}, stopping: false, approve() {}, cancel() {} };
  // Its pane is the sheet: Approve and Skip are the sheet's own, so the head's verbs draw nothing for it, asked or not.
  assert.equal(BcRunVerbs({ row: reach, ...acts }), null);
  assert.equal(BcRunVerbs({ row: reach, ...acts, armed: true }), null);
  // A playbook's own run keeps both, and a run that is not waiting keeps its stop.
  const mine = BcRunVerbs({ row: own, ...acts });
  assert.ok(byTestId(mine, "bc-approve"));
  assert.ok(byTestId(mine, "bc-stop"));
  const going = toBroadcastVM(
    dto({ id: "b-going", state: "scheduled", audience: reach.audience, counts: quiet }),
    ZONE,
  );
  assert.ok(byTestId(BcRunVerbs({ row: going, ...acts }), "bc-stop"), "a reach-out's run to come is stopped as before");
});

/* ------------------------- A message needs no WhatsApp row: what the composer offers, opens on, and says ------------------------- */

const { cmOfferedFrom } = await import(`${SRC}/surfaces/campaigns/parts/channels.ts`);

/** One version of the message hours_note, on `channel`, as GET templates returns its rows (a WhatsApp row's `blocked` judged, an email's null). */
const versionRow = (channel, over = {}) => ({
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
const offeredOf = (...rows) =>
  cmOfferedFrom({
    templatesAll: rows.filter((r) => r.channel === "whatsapp"),
    templateVersions: rows.filter((r) => r.channel !== "whatsapp"),
    messages: contracts.campaignMessagesOf(rows),
  });
/** A workspace with a texting line and a mailbox that sends the business's news, and no WhatsApp number. */
const NO_NUMBER_READY = contracts.channelsReady({
  whatsapp: null,
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
});
const noNumber = { present: false, display: null, health: numberHealth({ quality: null, event: null, limit: null }) };
const ticksOf = (tree) => ["whatsapp", "sms", "email"].map((c) => viaOf(tree)[c].props.checked);

test("a message with an email version and no WhatsApp row is offered and opens on Email, on a workspace with no number and on one with: WhatsApp and Text say why they are closed, and no number is asked for", () => {
  const email = offeredOf(versionRow("email"));
  assert.equal(email.length, 1, "offered: not hidden, and it holds a channel");
  // A workspace with no WhatsApp number: the workspace's reason is WhatsApp's, the message's is Text's.
  let tree = openVia({ templates: email, ready: NO_NUMBER_READY, number: noNumber });
  assert.deepEqual(
    ticksOf(tree),
    [false, false, true],
    "it opens on Email, not on a WhatsApp the workspace has none of",
  );
  assert.equal(reasonsOf(tree).whatsapp, "Connect a WhatsApp number first.");
  assert.equal(reasonsOf(tree).sms, "This message has no text version yet.");
  assert.equal(viaOf(tree).email.props.readOnly, true, "the one channel on stays on");
  assert.equal(byTestId(tree, "bc-number"), null, "a send that does not go by WhatsApp never asks for its number");
  assert.equal(textOf(byTestId(tree, "bc-reach-by")), "2 by email");
  assert.equal(byTestId(tree, "bc-send").props.disabled, false, "and it can be sent");
  // A workspace with a number: the message has no WhatsApp version, which is what WhatsApp's tick says.
  tree = openVia({ templates: email });
  assert.deepEqual(ticksOf(tree), [false, false, true]);
  assert.equal(reasonsOf(tree).whatsapp, "This message has no WhatsApp version.");
  assert.equal(reasonsOf(tree).sms, "This message has no text version yet.");
  assert.equal(byTestId(tree, "bc-send").props.disabled, false);
});

test("a message with an approved WhatsApp version opens on WhatsApp, as every broadcast did, whatever else it holds", () => {
  let tree = openVia({ templates: offeredOf(versionRow("whatsapp")) });
  assert.deepEqual(ticksOf(tree), [true, false, false]);
  assert.equal(reasonsOf(tree).email, "This message has no email version yet.");
  tree = openVia({ templates: offeredOf(versionRow("whatsapp"), versionRow("email")) });
  assert.deepEqual(
    ticksOf(tree),
    [true, false, false],
    "with an email beside it: WhatsApp still, the email a press away",
  );
  assert.equal(viaOf(tree).email.props.readOnly, false);
});

test("a message changed to one with no WhatsApp version keeps WhatsApp ticked and off, and the number it goes from is not said under When", () => {
  const rows = [versionRow("whatsapp"), versionRow("email", { id: "v-email-news", name: "news_note" })];
  let tree = openVia({ templates: offeredOf(...rows) });
  assert.equal(pickerOf(tree, "bc-template").props.value, "hours_note", "it opens on the WhatsApp message");
  assert.deepEqual(ticksOf(tree), [true, false, false]);
  assert.ok(byTestId(tree, "bc-number"), "a send by WhatsApp says the number it goes from");
  pickerOf(tree, "bc-template").props.onValueChange("news_note");
  tree = viaAgain();
  assert.equal(pickerOf(tree, "bc-template").props.value, "news_note");
  assert.deepEqual(ticksOf(tree), [false, false, false], "WhatsApp stays ticked, and this message cannot go by it");
  assert.equal(reasonsOf(tree).whatsapp, "This message has no WhatsApp version.");
  assert.equal(byTestId(tree, "bc-number"), null, "the number is nothing to a message WhatsApp does not carry");
  assert.equal(byTestId(tree, "bc-number"), null);
});

test("a WhatsApp version still in review with an email beside it is offered, and WhatsApp's tick says it is being reviewed; a message with only that version is not offered", () => {
  const rows = [versionRow("whatsapp", { meta_status: "pending" }), versionRow("email")];
  const tree = openVia({ templates: offeredOf(...rows) });
  assert.equal(pickerOf(tree, "bc-template").props.value, "hours_note", "the message is on the picker");
  assert.deepEqual(ticksOf(tree), [false, false, true], "it opens on the channel it holds");
  assert.equal(reasonsOf(tree).whatsapp, "WhatsApp is still reviewing this message's WhatsApp version.");
  assert.equal(viaOf(tree).whatsapp.props.readOnly, true, "and the tick stays closed until WhatsApp approves it");
  // As before: a message whose only version is one WhatsApp has not approved is not on the picker.
  const alone = openVia({ templates: offeredOf(versionRow("whatsapp", { meta_status: "pending" })) });
  assert.equal(pickerOf(alone, "bc-template"), null);
  assert.ok(byTestId(alone, "bc-no-template"));
});

test("Send it again finds the message a run sent by its name and language: a WhatsApp version added since moved the id the picker lists it by", () =>
  withTabMemory(async () => {
    // The run went out when the message had an email version alone, so its template_id is that row's. A WhatsApp version added
    // since is the message's anchor: the composer lists the message by that row's id.
    const rows = [
      versionRow("whatsapp", {
        id: "tpl-offer-whatsapp",
        name: "autumn_offer",
        category: "marketing",
        body_preview: "Hi {{1}}, {{2}}",
        variables: [
          { position: 1, label: "First name", example: "Dani" },
          { position: 2, label: "The offer", example: "20% off" },
        ],
      }),
      versionRow("email", {
        id: "tpl-offer-email",
        name: "autumn_offer",
        category: "marketing",
        header: "Autumn",
        body_preview: "Hi {{1}}, {{2}}",
        variables: [
          { position: 1, label: "First name", example: "Dani" },
          { position: 2, label: "The offer", example: "20% off" },
        ],
      }),
    ];
    const offered = offeredOf(...rows);
    assert.equal(offered[0].id, "tpl-offer-whatsapp", "the picker's id is the WhatsApp version's");
    const byHand = dto({
      id: "b-hand",
      name: "Autumn colour",
      playbook_id: null,
      run_for: null,
      template_id: "tpl-offer-email",
      template_name: "autumn_offer",
      audience: { kind: "saved", id: "s1", label: "Regulars" },
      params: [{ kind: "first_name" }, { kind: "text", value: "20% off colour" }],
    });
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({ templates: offered, number: healthyNumber, rows: [toBroadcastVM(byHand, ZONE)] }),
    );
    answers.set("b-hand", [{ ok: true, data: detailOf(byHand) }]);
    const props = { initialSegment: null, initialRun: "b-hand" };
    page(props);
    await settle();
    let tree = again(props);
    assert.ok(byTestId(tree, "bc-again"), "the run can be sent again: its message is still there, by name");
    press(byTestId(tree, "bc-again"));
    assert.equal(went.at(-1), "campaigns/sequences/new:once", "onto New's Send once");
    tree = sentAgain();
    assert.ok(byTestId(tree, "bc-composer"), "onto the send screen");
    assert.equal(pickerOf(tree, "bc-template").props.value, "autumn_offer", "on its message");
    assert.equal(
      typedOf(tree)[0].props.typed,
      "20% off colour",
      "and the words it said, under the id the picker lists it by",
    );
    // The message gone from the picker (no version left a broadcast can send): no button, as before.
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({ templates: [], number: healthyNumber, rows: [toBroadcastVM(byHand, ZONE)] }),
    );
    page(props);
    await settle();
    assert.equal(byTestId(again(props), "bc-again"), null, "no composer quietly filled with something else");
  }));

test("a person held back is drawn as the message's own words, marked Not sent: an email's, for a message with an email version and no WhatsApp row", () => {
  const email = offeredOf(versionRow("email"));
  let tree = openWalk({ templates: email });
  assert.deepEqual(ticksOf(tree), [false, false, true]);
  // Walk to the one nobody can reach: they are in the list and held back.
  let held = null;
  for (let i = 0; i < 4 && !held; i += 1) {
    const now = walkNow(tree);
    if (now.place === "held back") held = now;
    else {
      nextPerson();
      tree = viaAgain();
    }
  }
  assert.ok(held, "someone is held back: a person with no address, on a send that goes by email alone");
  assert.deepEqual(
    [held.via, held.kind, held.mail, held.subject],
    [null, "", true, `A note, ${held.who.split(" ")[0]}`],
    "the email as a mail (a bare one: its shape says it), its words not WhatsApp's, with no channel named over them",
  );
  assert.equal(textOf(byTestId(tree, "mp-version-note")), "Not sent", "marked, as a mail has no mark of its own");
  // A message with a WhatsApp version: the bubble, marked once.
  tree = openWalk();
  for (let i = 0; i < 3; i += 1) {
    nextPerson();
    tree = viaAgain();
  }
  assert.equal(walkNow(tree).place, "held back");
  assert.ok(byTestId(tree, "mp-held"), "WhatsApp's bubble carries its own mark");
  assert.equal(byTestId(tree, "mp-version-note"), null, "which says it once");
});

test("with nothing to send yet and the starters' WhatsApp versions in review, the send screen says so in contracts' words: their WhatsApp versions, never templates", () => {
  const inReview = ["visit_tomorrow", "quiet_30"].map((trigger, i) =>
    templateRow({ id: `s-${i}`, name: starters.forTrigger(trigger).name, meta_status: "pending" }),
  );
  settingsOf({ templatesAll: inReview });
  const tree = openVia({ templates: [] });
  const said = textOf(byTestId(tree, "bc-no-template"));
  assert.equal(said, contracts.STARTER_LINE_WORDS.reviewing(2));
  assert.equal(
    said,
    "Your starter messages' WhatsApp versions are in review (2) — they appear here once approved, usually within minutes.",
  );
  assert.equal(
    byTestId(tree, "bc-add-starters"),
    null,
    "the starter set is not offered again while its versions are in review",
  );
  // With none in review, the line is the picker's own, and the starter set one press adds.
  settingsOf({ templatesAll: [] });
  const none = openVia({ templates: [] });
  assert.ok(textOf(byTestId(none, "bc-no-template")).startsWith(contracts.NO_TEMPLATE_WORDS.lead));
  assert.ok(byTestId(none, "bc-add-starters"));
});
