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
// What the shell still owns and the pages draw by name: Confirm, StatePill, PolicyChip (frame-globals), the unsaved-work
// rule (record-fold) and the record sheet. The pages themselves are TSX (decision 0015) and imported below.
(await import(`${SRC}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
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
const { BroadcastRun } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { bcWhenNote } = await import(`${SRC}/surfaces/campaigns/broadcasts/when.tsx`);
const { BroadcastDetail, BcRunVerbs } = await import(`${SRC}/surfaces/campaigns/broadcasts/run.tsx`);
// The receipt's sentence is words alone, apart from the picker, so the shell that publishes it carries no picker.
const { bcWhenWords, bcOpensOnItsSheet } = await import(`${SRC}/surfaces/campaigns/broadcasts/when-words.ts`);
// New's draft as the page holds it: what Send it again opens New's Send once on, from the send the run screen kept.
const M = await import(`${SRC}/surfaces/campaigns/sequences/new/new-model.ts`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { TemplateComposer } = await import(`${SRC}/surfaces/campaigns/templates/composer.tsx`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { Field } = await import(`${SRC}/surfaces/kit/field/field.tsx`);
/** One of the page's choices, the kit's Picker, by its test id. */
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
      message: "Run not found.",
    }
  );
};
/** What a test asks to see: a run's one screen at its home (`initialRun`: BroadcastRun, lane 2). */
const screen = (props) => BroadcastRun({ id: props.initialRun });
const page = (props) => {
  fresh();
  return screen(props);
};
const again = (props) => drawAgain(() => screen(props));
/**
 * Send it again goes to New's Send once (`campaigns/sequences/new:once`), its send kept in the tab as a send half-written
 * is (page/runs.tsx bcAgainOf): the tab's memory, as the shell keeps it (legacy-bridge/tab-memory.ts), held for a test that
 * hands a send on and taken away after it, so no other test's New opens on what it kept.
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
/** The send Send it again kept in the tab for New to open on (page/runs.tsx bcAgainOf). */
const keptSend = () => globalThis.window.__tabMemory.draft("broadcast");
/** The list a run by hand went to (audience saved:s1), as New lists the workspace's own lists: by its token. */
const REGULARS = [{ id: "list:s1", name: "Regulars" }];
/**
 * New's Send once as Send it again opens it (sequences/new/new-page.tsx useOpenedOn): the send the tab kept, made a
 * one-off by New's model (new-model.ts againOf) over the Library as New reads it -- the messages these rows make, and the
 * rows their values are read from -- and the lists.
 */
const openedAgain = (kept, rows, lists = REGULARS) =>
  M.againOf(kept, { messages: contracts.campaignMessagesOf(rows), rows }, lists, "Northside Studio");
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

/* ------------------------------ a slot's words ------------------------------ */

test("REGRESSION (C6): a run's values say what fills them -- the detail printed visit_when", async () => {
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
  const props = { initialRun: "b-visit" };
  page(props);
  await settle();
  const tree = again(props);
  const values = find(
    byTestId(tree, "bc-detail"),
    (n) => n.props?.className === "cl-prof-aut-hint" && textOf(n).startsWith("Values:"),
  );
  assert.equal(textOf(values), "Values: their booked time · their first name", "REGRESSION: visit_when");
});

test("REGRESSION: Send it again puts right a slot a run filled with what it cannot take -- the send it opened took a run's sources as they were", () =>
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
    const props = { initialRun: "b-wrong" };
    page(props);
    await settle();
    press(byTestId(again(props), "bc-again"));
    assert.equal(went.at(-1), "campaigns/sequences/new:once", "New's Send once, filled with what the run sent");
    // What the tab keeps for New, and the one-off New opens on from it.
    const kept = keptSend();
    assert.deepEqual(
      kept.sources["tpl-winback_offer"],
      ["first_name", "text", "text"],
      "each person's own name; the words it said, where words may go; a link with none on file can only be typed",
    );
    assert.deepEqual(
      openedAgain(kept, [starterTemplate("winback_offer")]).steps[0].message.params,
      [{ kind: "first_name" }, { kind: "text", value: "Northside" }, { kind: "text", value: "" }],
      "the booking link that filled the first name put back to each person's own, and the words it typed kept",
    );
  }));

/* ------------------------------ a broadcast's state ------------------------------ */

test("REGRESSION (C12): a failed broadcast says why in its detail -- it read '· failed' with the reason on file", async () => {
  const failed = dto({ id: "b-failed", name: "September offer", state: "failed", failure: "template_not_approved" });
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [toBroadcastVM(failed, ZONE)] }));
  answers.set("b-failed", [{ ok: true, data: detailOf(failed, []) }]);
  const props = { initialRun: "b-failed" };
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

test("an opened run is sent again from its own head: New's Send once, filled with its message, its list and its values -- and no button when one of them cannot go", () =>
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
    const props = { initialRun: "b-hand" };
    page(props);
    await settle();
    press(byTestId(again(props), "bc-again"));
    assert.equal(
      went.at(-1),
      "campaigns/sequences/new:once",
      "onto New's Send once, pushed, so Back returns to the run",
    );
    // New opens on what the tab kept: a one-off to people, named for its message, as a send by hand is.
    const draft = openedAgain(keptSend(), [note, offer]);
    assert.deepEqual([draft.kind, draft.audience], ["once", "people"]);
    assert.equal(draft.name, contracts.templateTitle("autumn_offer", null));
    assert.deepEqual(draft.who, { kind: "list", token: "list:s1", label: "Regulars" }, "its list");
    assert.equal(draft.steps[0].message.template_id, "tpl-offer", "its message, not the one New would open on");
    assert.deepEqual(
      draft.steps[0].message.params,
      [{ kind: "first_name" }, { kind: "text", value: "20% off colour" }],
      "its values, by what fills them, and the words it said",
    );

    // A playbook's run is sent again by its playbook, and a template WhatsApp no longer approves cannot go at all.
    answers.set("b-sent", [{ ok: true, data: detailOf(dto()) }]);
    page({ initialRun: "b-sent" });
    await settle();
    assert.equal(
      byTestId(again({ initialRun: "b-sent" }), "bc-again"),
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
      "REGRESSION-IN-WAITING: a Send once quietly filled with another message",
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
    const props = { initialRun: "b-wait" };
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
      // Then Approve, with Skip on its caret: one split pill (no three dots in the head, 20 Oct 2026).
      assert.ok(act.props.className.split(" ").includes("bc-dock-split"), act.props.className);
      assert.ok(byTestId(act, "bc-sheet-approve"), "then the Approve it speaks of");
      // The caret is the kit Menu's trigger (Base UI draws it; the stub holds it as the Menu's `trigger`).
      assert.ok(
        find(act, (n) => Array.isArray(n.props?.groups) && n.props.trigger?.props?.["data-testid"] === "bc-sheet-more"),
        "and its caret, which holds Skip",
      );
      assert.match(textOf(said), /^Goes /, "when it goes, beside the Approve it speaks of");
      assert.ok(byTestId(docks[0], "bc-sheet-approve"), "Approve across the foot");
      assert.equal(
        byTestId(docks[0], "bc-sheet-see"),
        null,
        "who gets it is the sheet's own fold, not a half of the foot",
      );
      assert.equal(
        byTestId(docks[0], "bc-sheet-skip"),
        null,
        "Skip is on Approve's caret, never a press of its own beside it",
      );
      const more = find(tree, (n) => Array.isArray(n.props?.groups) && /^More for /.test(n.props.label ?? ""));
      assert.equal(more.props.label, "More for The month's offer", "Approve's caret's menu, named for the run");
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
    const props = { initialRun: "b-ch" };
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
  const props = { initialRun: "b-kept" };
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
  const props = { initialRun: "b-wait" };
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
  const props = { initialRun: "b-wait" };
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

test("REGRESSION (C15): the sending hours are the published ones -- they were typed into the pages beside the constants", () => {
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
  } finally {
    Object.assign(realClock.hours, published);
  }
});

test("each run opens on a pane of its own: the open run's filter and expanded rows are its state, and were carried into the next run opened, the pane being one element for every run", async () => {
  const [one, two] = [dto(), dto({ id: "b-sent-2", name: "Win-back · 2026-09-11" })];
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [one, two].map((b) => toBroadcastVM(b, ZONE)) }));
  for (const b of [one, two]) answers.set(b.id, [{ ok: true, data: detailOf(b) }]);
  const paneOf = async (id) => {
    const props = { initialRun: id };
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
    const props = { initialRun: "b-sent" };
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
  const props = { initialRun: "b-sent" };
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

  // On Messages, where it said a starter's footer or nothing at all.
  // Scoped to the workspace's OWN message, open in the pane beside the list (the layout is the Inbox's list + pane,
  // Claude Video/docs/2026-10-02-campaigns-on-the-kit.md §3.1): the starter rows on the same page do not carry the
  // library's footer, so reading the whole page would pass either way.
  const msgTree = messagesOpen({ templatesAll: [mine] });
  assert.ok(byTestId(msgTree, "custom-row"), "the workspace's own message has a row");
  const own = paneOf(msgTree);
  assert.ok(own, "and its words open beside the list");
  assert.ok(textOf(own).includes("Reply STOP to opt out"), textOf(own));
  // A template synced from WhatsApp Manager keeps ITS words.
  const synced = paneOf(messagesOpen({ templatesAll: [theirs] }));
  assert.ok(textOf(synced).includes("Not now? Reply STOP"), textOf(synced));

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

  // Only what can go on the wire is offered: the reading every picker lists messages by (contracts campaignMessagesOf).
  assert.deepEqual(
    contracts.campaignMessagesOf([plain, picture]).map((m) => [m.name, m.offered]),
    [
      ["offer", true],
      ["spring_poster", false],
    ],
  );

  // And the library says why rather than leaving it looking available.
  const card = messages({ templatesAll: [picture] });
  assert.ok(
    textOf(byTestId(card, "template-blocked")).includes("a picture for a heading"),
    textOf(byTestId(card, "template-blocked")),
  );

  // Every shape the wire cannot carry, each named. The card above proves one of
  // them reaches the page; these prove the rule itself, one case at a time.
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

  // The message open on Messages, its words in the pane beside the list.
  const preview = byTestId(paneOf(messagesOpen({ templatesAll: [tpl] })), "message-preview");
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

/* ------------------------------- A run by every channel (One message, every channel, step 3) ------------------------------- */

const { bcPersonRow } = await import(`${SRC}/surfaces/campaigns/broadcasts/run-sheet.tsx`);

/** A message about their visit with a version on each channel. */
const noteRow = (channels = ["whatsapp", "sms", "email"]) =>
  templateRow({ id: "tpl-note", name: "hours_note", category: "utility", purpose: "conversational", channels });

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
  const props = { initialRun: "b-by" };
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

/* ------------------------- A run's verbs at its head ------------------------- */

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
    // Where the shell gates a control (frame-globals gatedProps), the button carries the verb's own sentence.
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

/* ------------------------- A message needs no WhatsApp row: what Send it again finds ------------------------- */

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

test("Send it again finds the message a run sent by its name and language: a WhatsApp version added since moved the id the picker lists it by", () =>
  withTabMemory(async () => {
    // The run went out when the message had an email version alone, so its template_id is that row's. A WhatsApp version added
    // since is the message's anchor: the surface offers the message by that row's id.
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
    const props = { initialRun: "b-hand" };
    page(props);
    await settle();
    const tree = again(props);
    assert.ok(byTestId(tree, "bc-again"), "the run can be sent again: its message is still there, by name");
    press(byTestId(tree, "bc-again"));
    assert.equal(went.at(-1), "campaigns/sequences/new:once", "onto New's Send once");
    // The send kept for New names the message by the id it is offered by, and New opens on it with the words it said.
    const kept = keptSend();
    assert.equal(kept.tplId, "tpl-offer-whatsapp", "the id it is offered by, not the one the run went out on");
    const { message } = openedAgain(kept, rows).steps[0];
    assert.equal(message.template_id, "tpl-offer-whatsapp", "on its message");
    assert.deepEqual(
      message.params[1],
      { kind: "text", value: "20% off colour" },
      "and the words it said, under the id it is offered by",
    );
    // The message gone from the picker (no version left a broadcast can send): no button, as before.
    setSurfaceValue(
      "broadcasts",
      broadcastsSurface({ templates: [], number: healthyNumber, rows: [toBroadcastVM(byHand, ZONE)] }),
    );
    page(props);
    await settle();
    assert.equal(byTestId(again(props), "bc-again"), null, "no Send once quietly filled with something else");
  }));
