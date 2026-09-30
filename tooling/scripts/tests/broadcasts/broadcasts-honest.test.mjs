/**
 * Broadcasts and Messages: each state said in words, and each word from where it is kept.
 *
 * - A broadcast's composer could pick a visit's time a broadcast does not have, a visit playbook's composer held a
 *   value its select had no option for, and a run's detail printed "visit_when" (the wiring audit's C6, C24).
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
  number: null,
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
      candidates: 4,
      held: 0,
    },
  ],
  timezone: ZONE,
  calendar: "none",
  number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio",
  bookingLink: false,
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
await import(`${SRC}/legacy/components/record-fold.jsx`);
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
await import(`${SRC}/legacy/components/record-sheet.jsx`);
const { BroadcastsPage } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { bcWhenNote, bcWhenWords } = await import(`${SRC}/surfaces/campaigns/broadcasts/when.tsx`);
const { PlaybooksPage } = await import(`${SRC}/surfaces/campaigns/playbooks/playbooks-page.tsx`);
const { PlaybookCard } = await import(`${SRC}/surfaces/campaigns/playbooks/card-detail.tsx`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { TemplateComposer } = await import(`${SRC}/surfaces/campaigns/templates/composer.tsx`);
const { mpParts } = await import(`${SRC}/surfaces/campaigns/parts/message-preview.tsx`);
const { CmPicker } = await import(`${SRC}/surfaces/campaigns/parts/picker.tsx`);
const { broadcasts } = await import(`${SRC}/surfaces/campaigns/broadcasts/verbs.ts`);
const { playbooks } = await import(`${SRC}/surfaces/campaigns/playbooks/verbs.ts`);
const { templates, starters } = await import(`${SRC}/surfaces/campaigns/templates/verbs.ts`);
const { AFTER } = await import(`${SRC}/legacy-bridge/refresh-map.ts`);
const { setSurfaceValue, surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

/** A language chip in its two parts: the letters of the language in view, and "+1" for the rest ("" for none). */
const chipSays = (chip) => [
  textOf(find(chip, (n) => n.props?.className === "lp-words")).trim(),
  textOf(
    find(chip, (n) =>
      String(n.props?.className || "")
        .split(" ")
        .includes("lp-more"),
    ),
  ).trim(),
];
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
const page = (props) => {
  fresh();
  return BroadcastsPage(props);
};
const again = (props) => drawAgain(() => BroadcastsPage(props));
/** The composer, opened the way a person opens it: New broadcast, on the ledger. */
const writing = (props) => {
  const tree = page(props);
  press(byTestId(tree, "bc-new"));
  return again(props);
};
/** Playbooks, drawn again over the same cells, as React would after a state change. */
const outboundAgain = () => drawAgain(() => PlaybooksPage({}));
const composerOf = (surface) => {
  setSurfaceValue("playbooks", surface);
  fresh();
  PlaybooksPage({});
  globalThis.dispatchEvent({ type: "playbooks:new" });
  return outboundAgain();
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
  setSurfaceValue("settings", held);
  globalThis.__TEMPLATES_ALL = held.templatesAll;
  return held;
};
/** The settings surface read again with one thing changed, as its next read lands: the rest as it was. */
const settingsChanged = (over) => settingsOf({ ...surfaceValue("settings"), ...over });
/**
 * Messages on a workspace with a WhatsApp number, over the starter library the page imports. No playbooks unless a test
 * gives them: a row reads which language a running playbook sends, and one left by a Playbooks test (the default
 * Win-back, in English) would flag a starter it never set out to.
 */
const messages = ({ playbooks: held, ...over } = {}) => {
  setSurfaceValue("playbooks", held);
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
const templateRow = (over = {}) => ({
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
});
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
/** Each slot as the composer lists it: what fills it, and what else it offers (nothing, when it has no choice). */
const slotsOf = (tree) =>
  all(tree, (n) => n.props?.["data-testid"] === "bc-var").map((f) => {
    const sel = find(f, (n) => n.props?.["data-testid"] === "bc-var-source");
    return {
      kind: f.props["data-kind"],
      offers: sel ? all(sel, (n) => n.type === "option").map((o) => o.props.value) : [],
    };
  });

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
  const chips = all(tree, (n) => n.props?.["data-testid"] === "bc-template");
  assert.deepEqual(
    chips.map((c) => textOf(c).toLowerCase().includes("autumn")),
    [true],
    `REGRESSION: ${chips.map(textOf).join(" | ")}`,
  );
  const selects = all(tree, (n) => n.props?.["data-testid"] === "bc-var-source");
  assert.equal(selects.length, own.variables.length);
  for (const sel of selects) {
    const offered = all(sel, (n) => n.type === "option").map((o) => o.props.value);
    assert.ok(!offered.some((k) => k.startsWith("visit_")), `REGRESSION: a broadcast offered ${offered.join(", ")}`);
    assert.ok(offered.includes(sel.props.value), `the slot's value, ${sel.props.value}, is one it offers`);
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
  assert.equal(textOf(values), "Values: their visit's time · their first name", "REGRESSION: visit_when");
});

test("REGRESSION (C6): a visit playbook's composer fills its visit's words -- the starter's slot held a value its select had no option for", () => {
  const { row, slots } = visitTemplate();
  const tree = composerOf(
    playbooksSurface({
      rows: [],
      templates: [row],
      calendar: "ok",
      triggers: [
        {
          id: "visit_tomorrow",
          label: "Visit reminder",
          hint: "The day before an appointment on the calendar",
          cls: "booking",
          list: null,
          kind: "visit",
          candidates: 2,
          held: 0,
        },
      ],
    }),
  );
  // The walk counts a node once, so each slot is met once.
  const fills = all(tree, (n) => n.props?.["data-testid"] === "pb-fill");
  assert.deepEqual(
    fills.map((f) => f.props["data-kind"]),
    slots.map((s) => (s.kind === "booking_link" ? "text" : s.kind)),
    "the starter's own slots, a link the workspace lacks typed",
  );
  for (const f of fills) {
    const sel = find(f, (n) => n.props?.["data-testid"] === "pb-fill-source");
    if (sel)
      assert.ok(
        find(sel, (n) => n.type === "option" && n.props.value === f.props["data-kind"]),
        `REGRESSION: ${f.props["data-kind"]} had no option`,
      );
  }
  assert.ok(textOf(fills[slots.findIndex((s) => s.kind === "visit_when")]).includes("Their visit's time"));
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
  const first = all(tree, (n) => n.props?.["data-testid"] === "bc-var")[0];
  assert.ok(
    textOf(first).includes("Their first name") && textOf(first).includes("“there” when none is on file"),
    `the words, and what a person with no name on file reads: ${textOf(first)}`,
  );
  assert.equal(byTestId(tree, "bc-var-input"), null, "nothing to type on a starter that knows every slot");

  // Typed over, the business name starts from it; what goes out greets each person by their own name.
  find(
    all(tree, (n) => n.props?.["data-testid"] === "bc-var")[1],
    (n) => n.props?.["data-testid"] === "bc-var-source",
  ).props.onChange({ target: { value: "text" } });
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(byTestId(tree, "bc-var-input").props.value, "Northside Studio");
  press(byTestId(tree, "bc-send"));
  await press(byTestId(again({ initialSegment: null, initialRun: null }), "bc-send-yes"));
  assert.deepEqual(sent.at(-1).params, [{ kind: "first_name" }, "Northside Studio", { kind: "booking_link" }]);
});

test("REGRESSION: Send it again puts right a slot a run filled with what it cannot take -- the composer took a run's sources as they were", async () => {
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
  again({ initialSegment: null, initialRun: null });
  const tree = again({ initialSegment: null, initialRun: null });
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
    all(tree, (n) => n.props?.["data-testid"] === "bc-var-input").map((x) => x.props.value),
    ["Northside", ""],
  );
});

/* ------------------------------ a broadcast's state ------------------------------ */

test("REGRESSION (C12): a failed broadcast says why, in its row and in its detail -- it read '· failed' with the reason on file", async () => {
  const failed = dto({ id: "b-failed", name: "September offer", state: "failed", failure: "template_not_approved" });
  const unexplained = dto({ id: "b-failed-2", name: "August offer", state: "failed", failure: null });
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      rows: [failed, unexplained].map((b) => toBroadcastVM(b, ZONE)),
    }),
  );
  answers.set("b-failed", [{ ok: true, data: detailOf(failed, []) }]);
  const rows = all(page({ initialSegment: null, initialRun: null }), (n) => n.props?.["data-testid"] === "bc-history");
  // The card says it failed (its state) and why (its line), where the row said "· failed" and stopped.
  assert.ok(
    textOf(rows[0]).includes("Failed") && textOf(rows[0]).includes("WhatsApp no longer approves its template"),
    `REGRESSION: ${textOf(rows[0])}`,
  );
  assert.ok(textOf(rows[1]).includes("no reason was recorded"), textOf(rows[1]));
  const props = { initialSegment: null, initialRun: "b-failed" };
  page(props);
  await settle();
  const tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-detail-failure")), "It stopped: WhatsApp no longer approves its template.");
  // And, opened, how to get past it -- never "something went wrong".
  assert.ok(
    textOf(byTestId(tree, "bc-stopped")).includes("Open it in Templates — it can be resubmitted."),
    textOf(byTestId(tree, "bc-stopped")),
  );
});

test("an opened run is sent again from its own head: the send screen, filled with its template, its list and its values -- and no button when one of them cannot go", async () => {
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
  assert.equal(went.at(-1), "broadcasts", "the run closes");
  again({ initialSegment: null, initialRun: null });
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(byTestId(tree, "bc-composer"), "onto the send screen");
  assert.ok(
    textOf(
      find(tree, (n) => n.props?.["data-testid"] === "bc-audience" && String(n.props.className).includes("active")),
    ).startsWith("Regulars"),
    "its list",
  );
  assert.ok(
    find(
      tree,
      (n) =>
        n.props?.["data-testid"] === "bc-template" &&
        n.props["aria-pressed"] === true &&
        textOf(n).toLowerCase().includes("autumn"),
    ),
    "its template, not the one the screen opens on",
  );
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "bc-var-source").map((x) => x.props.value),
    ["first_name", "text"],
    "its values, by what fills them",
  );
  assert.equal(
    byTestId(byTestId(tree, "bc-vars"), "bc-var-input").props.value,
    "20% off colour",
    "and the words it said",
  );

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
});

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
    assert.equal(textOf(byTestId(sheet, "bc-sheet-pos")), "1 of 2 · Campaigns", "where it sits among the runs waiting");
    assert.equal(textOf(find(sheet, (n) => n.type === "h1")), "The month's offer");
    const reach = textOf(byTestId(sheet, "bc-sheet-reach"));
    assert.ok(
      reach.includes("2will get it") &&
        reach.includes("each said yes to offers") &&
        reach.includes("none heard from any playbook this week"),
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
      textOf(byTestId(sheet, "bc-sheet-approve")).includes("Approve \u2014 2 "),
      textOf(byTestId(sheet, "bc-sheet-approve")),
    );
    // Who gets it, on asking.
    press(byTestId(sheet, "bc-sheet-see"));
    tree = again(props);
    assert.equal(all(byTestId(tree, "bc-sheet-people"), (n) => n.props?.["data-testid"] === "bc-person").length, 2);
    // Approved, the next run waiting opens.
    await press(byTestId(tree, "bc-sheet-approve"));
    assert.deepEqual(approved, ["b-wait"]);
    assert.equal(went.at(-1), "broadcasts/run:b-wait-2", "a queue of two is two presses");

    // Skip arms before it acts, as every stop on the page does (D13).
    const skipped = [];
    broadcasts.cancel = async (id) => {
      skipped.push(id);
      return { ok: true, data: { was: "pending_approval" } };
    };
    page(props);
    await settle();
    tree = again(props);
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
    assert.equal(went.at(-1), "broadcasts/run:b-wait-2");

    // A run whose day has passed is refused by approveRun: the sheet says why, and offers the skip.
    const stale = { ...first, run_for: "2020-01-01" };
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: [offer], rows: [toBroadcastVM(stale, ZONE)] }));
    answers.set("b-wait", [{ ok: true, data: detailOf(stale, people) }]);
    page(props);
    await settle();
    tree = again(props);
    assert.equal(byTestId(tree, "bc-sheet-approve"), null, "REGRESSION-IN-WAITING: a button the server refuses");
    assert.ok(textOf(byTestId(tree, "bc-sheet-expired")).includes("that day has passed"));
    assert.equal(textOf(byTestId(tree, "bc-sheet-pos")), "Campaigns", "the only one waiting");
  } finally {
    Object.assign(broadcasts, keep);
  }
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
    ["94 never said yes to offersGet their yes", "32 heard from a playbook this week"],
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
  assert.equal(went.at(-1), "broadcasts/get-yes");
});

test("Broadcasts is one ledger: the runs waiting on you said at the head, the states as the filter of the runs, the week ahead, and the composer its own screen", () => {
  const sent = (i) =>
    dto({
      id: `b-s${i}`,
      name: `Sent ${i}`,
      state: "sent",
      scheduled_for: iso(-(i + 1) * D),
      counts: { queued: 0, sent: 3, skipped: 0, failed: 0, delivered: 3, read: 1, replied: 1 },
    });
  const waiting = dto({
    id: "b-wait",
    name: "The month's offer",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(2 * H),
    playbook_id: "pb-1",
    counts: quiet,
  });
  const soon = dto({
    id: "b-soon",
    name: "Autumn colour",
    state: "scheduled",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(20 * 60_000),
    playbook_id: null,
    audience: { kind: "saved", id: "s1", label: "Regulars" },
    counts: quiet,
  });
  const going = dto({
    id: "b-going",
    name: "Offers",
    state: "sending",
    started_at: iso(-60_000),
    finished_at: null,
    counts: { queued: 6, sent: 3, skipped: 1, failed: 0, delivered: 2, read: 0, replied: 0 },
  });
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      rows: [soon, going, waiting, ...Array.from({ length: 7 }, (_, i) => sent(i))].map((b) => toBroadcastVM(b, ZONE)),
    }),
  );
  setSurfaceValue(
    "playbooks",
    playbooksSurface({
      rows: [
        playbook({
          id: "pb-9",
          name: "Welcome",
          trigger: "new_week",
          state: "running",
          run_hour: 10,
          last_run_for: null,
        }),
      ],
    }),
  );
  const props = { initialSegment: null, initialRun: null };
  let tree = page(props);
  // The head says what waits on you once -- its state's filter, the line's first words -- and the page's act is beside
  // it. A flag at the right said "1 waiting on you" a second time over the same filter (23 Sep, Campaigns made compact).
  assert.equal(textOf(byTestId(tree, "bc-band-pending_approval")).trim(), "1 waiting on you");
  assert.equal(byTestId(tree, "bc-waiting"), null, "said once");
  assert.ok(byTestId(tree, "bc-new"), "New broadcast");
  assert.equal(byTestId(tree, "bc-composer"), null, "the composer is its own screen, not the top of the ledger");
  // Everything open, what waits on you first, then what is going out, then what is to come; then the latest five gone.
  const cards = () =>
    all(tree, (n) => ["bc-open", "bc-history"].includes(n.props?.["data-testid"])).map((n) => n.props.id);
  assert.deepEqual(cards(), [
    "bc-run-b-wait",
    "bc-run-b-going",
    "bc-run-b-soon",
    "bc-run-b-s0",
    "bc-run-b-s1",
    "bc-run-b-s2",
    "bc-run-b-s3",
    "bc-run-b-s4",
  ]);
  const urgent = find(tree, (n) => n.props?.id === "bc-run-b-wait");
  assert.ok(
    String(urgent.props.className).includes("is-urgent"),
    "a run waiting on you carries the urgency edge (legacy/CLAUDE.md)",
  );
  assert.ok(byTestId(urgent, "bc-approve"), "and Approve");
  assert.match(
    textOf(
      byTestId(
        find(tree, (n) => n.props?.id === "bc-run-b-soon"),
        "bc-soon",
      ),
    ),
    /^\d+:\d\d$/,
    "a run under an hour away counts down",
  );
  assert.ok(textOf(byTestId(tree, "bc-runs-more")).includes("All 7 sent"), "and the way to the rest of what went");
  // The legend is the list's filter: press a band, the runs are that band's; press it again, all of them.
  press(byTestId(tree, "bc-band-sent"));
  tree = again(props);
  assert.equal(cards().length, 7, "the seven sent");
  assert.equal(byTestId(tree, "bc-band-sent").props["aria-pressed"], true);
  press(byTestId(tree, "bc-band-sent"));
  tree = again(props);
  assert.equal(cards().length, 8);
  // The week ahead: seven days from today, a mark per run at its hour, and a running playbook's runs to come.
  const days = all(tree, (n) => n.props?.["data-testid"] === "bc-week-day");
  assert.equal(days.length, 7);
  assert.ok(textOf(days[0]).startsWith("Today"), textOf(days[0]));
  assert.ok(
    all(days[1], (n) => String(n.props?.className || "").includes("is-projected")).length === 1,
    "the Welcome playbook's run tomorrow, at its hour",
  );
  // New broadcast opens the composer; Cancel goes back to the ledger.
  press(byTestId(tree, "bc-new"));
  tree = again(props);
  assert.ok(byTestId(tree, "bc-composer"), "the composer, on its own screen");
  assert.equal(byTestId(tree, "bc-band"), null, "with the ledger out of the way");
  press(byTestId(tree, "bc-compose-close"));
  tree = again(props);
  assert.equal(byTestId(tree, "bc-composer"), null);
  // A link that names a list is asking to write one: it opens the composer on that list.
  tree = page({ initialSegment: "s1", initialRun: null });
  assert.ok(byTestId(tree, "bc-composer"), "People's 'broadcast to this list' lands on the composer");
  setSurfaceValue("playbooks", undefined);
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
  const scrolled = [];
  const keep = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => (id === "bc-optin" ? { scrollIntoView: () => scrolled.push(id) } : null);
  try {
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
      "Nobody on “Everyone who said yes” has said yes to offers yet — that is a separate answer from saying yes to messages. Record it under “Offers and news” on their profile, or get their yes with the phrase and the QR.",
      "REGRESSION: '…with the phrase and QR below'",
    );
    const door = byTestId(line, "bc-nobody-door");
    assert.equal(
      textOf(door),
      "get their yes with the phrase and the QR",
      "the way to their yes is the door, in the sentence that names it",
    );
    assert.deepEqual(scrolled, [], "nothing moves before it is pressed");

    // Pressed: the send screen closes onto the ledger, which is where the card is, and the QR is brought into view.
    press(door);
    assert.equal(went.at(-1), contracts.GET_YES_ROUTE, "where every other 'nobody has said yes' goes (#663)");
    tree = again(props);
    assert.equal(
      byTestId(tree, "bc-composer"),
      null,
      "REGRESSION: navigating while the send screen was up kept it up, and the card undrawn",
    );
    assert.ok(byTestId(tree, "bc-optin"), "the ledger, with the card the door is for");
    assert.deepEqual(scrolled, ["bc-optin"], "and the QR brought into view");
    // Then the shell follows the address it went to, broadcasts/get-yes, which names no list: the send stays shut.
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

    // Written from broadcasts/get-yes itself, where the address does not change when the door is pressed: the door
    // brings the QR into view on its own, rather than leaving the ledger wherever the send screen was scrolled to.
    scrolled.length = 0;
    const yes = { initialSegment: null, initialRun: null, initialYes: true };
    tree = page(yes);
    assert.deepEqual(scrolled, ["bc-optin"], "the landing, as #663 made it");
    press(byTestId(tree, "bc-new"));
    tree = again(yes);
    press(byTestId(tree, "bc-nobody-door"));
    tree = again(yes);
    assert.equal(byTestId(tree, "bc-composer"), null);
    assert.deepEqual(
      scrolled,
      ["bc-optin", "bc-optin"],
      "REGRESSION: with no change of address, nothing brought it into view",
    );
    // And again, on the same page: every press lands, not only the first.
    press(byTestId(tree, "bc-new"));
    tree = again(yes);
    press(byTestId(tree, "bc-nobody-door"));
    tree = again(yes);
    assert.deepEqual(scrolled, ["bc-optin", "bc-optin", "bc-optin"], "a second press lands too");

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
      "Nobody on “Everyone who said yes” has said yes to offers yet — that is a separate answer from saying yes to messages. Record it under “Offers and news” on their profile.",
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
  } finally {
    globalThis.document.getElementById = keep;
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
      conversational: contracts.audiencePreview(rows, "saved", null, new Set(ids), "conversational"),
      marketing: contracts.audiencePreview(rows, "saved", null, new Set(ids), "marketing"),
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
    cta: "Use in a broadcast",
    to: "broadcasts/s-reg",
    enabled: false,
  });

  // Nobody on Walk-ins said yes to offers -- Bea's yes is to messages: that IS a missing answer, and the door stays.
  line = nobodyOn("s-walk", offer);
  assert.equal(
    textOf(line),
    "Nobody on “Walk-ins” has said yes to offers yet — that is a separate answer from saying yes to messages. Record it under “Offers and news” on their profile, or get their yes with the phrase and the QR.",
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
      conversational: contracts.audiencePreview(rows, "saved", null, new Set(ids), "conversational"),
      marketing: contracts.audiencePreview(rows, "saved", null, new Set(ids), "marketing"),
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
  const held = " · people who asked to stop, have no number, or are mid-thread with a person are held back at the wire";

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
  broadcasts.cancel = acceptThenRead({ was: "pending_approval" });
  const props = { initialSegment: null, initialRun: null };
  try {
    toasts.length = 0;
    press(byTestId(page(props), "bc-approve"));
    await settle();
    assert.equal(toasts.length, 1, "said at acceptance, while the surfaces are read again");
    assert.match(textOf(toasts[0].msg), /approved — 3 people/);
    assert.equal(
      textOf(byTestId(again(props), "bc-approve")).trim(),
      "Approve the run",
      "the button is back when the server took it",
    );
    while (reread.length) reread.shift()();
    await settle();
    assert.equal(toasts.length, 1, "and said once");
  } finally {
    Object.assign(broadcasts, keep);
  }
});

test("REGRESSION (C14): a send in flight draws its progress, Approve says it is approving and cannot approve twice, and Scheduled counts by state -- 'N queued' counted runs waiting for you", async () => {
  const sending = dto({
    id: "b-sending",
    name: "Offers · 2026-09-15",
    state: "sending",
    started_at: iso(-60_000),
    finished_at: null,
    recipient_count: 10,
    counts: { queued: 6, sent: 3, skipped: 1, failed: 0, delivered: 2, read: 0, replied: 0 },
  });
  const waiting = dto({
    id: "b-wait",
    name: "Win-back · 2026-09-15",
    state: "pending_approval",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(-H),
    counts: quiet,
  });
  setSurfaceValue(
    "broadcasts",
    broadcastsSurface({
      rows: [sending, waiting, dto()].map((b) => toBroadcastVM(b, ZONE)),
      more: true,
    }),
  );
  let release = () => {};
  const approvals = [];
  broadcasts.approve = (id) => {
    approvals.push(id);
    return new Promise((r) => {
      release = () => r({ ok: true, data: { recipient_count: 3, scheduled_for: iso(0), moved_from: null } });
    });
  };
  const props = { initialSegment: null, initialRun: null };
  let tree = page(props);
  const bar = find(tree, (n) => n.props?.role === "progressbar");
  assert.ok(bar, "REGRESSION: progress as prose, no bar");
  assert.equal(bar.props["aria-valuenow"], 40, "four of ten attempted");
  // The band counts by state -- one sending, one waiting on you -- where a line said "2 queued".
  assert.equal(textOf(byTestId(tree, "bc-band-sending")).trim(), "1 sending", "REGRESSION: '2 queued'");
  assert.equal(textOf(byTestId(tree, "bc-band-pending_approval")).trim(), "1 waiting on you");
  assert.match(
    textOf(byTestId(tree, "bc-standing")),
    /the latest 50 broadcasts/,
    "past fifty, the ledger says its numbers are not all of them",
  );

  const approve = byTestId(tree, "bc-approve");
  press(approve);
  press(approve);
  assert.deepEqual(approvals, ["b-wait"], "REGRESSION: a second press approved again, and the server refused it");
  tree = again(props);
  const busy = byTestId(tree, "bc-approve");
  assert.equal(textOf(busy).trim(), "Approving…");
  assert.equal(busy.props.disabled, true);
  release();
  await settle();
  tree = again(props);
  assert.equal(textOf(byTestId(tree, "bc-approve")).trim(), "Approve the run");
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

    setSurfaceValue("playbooks", playbooksSurface());
    fresh();
    const cardTree = PlaybookCard({ p: playbook(), canAct: true, onEdit() {}, flash() {} });
    assert.ok(
      byTestId(cardTree, "pb-run-now").props["data-tip"].includes("outside 8:00–19:59 it goes at 8:00"),
      "REGRESSION: 'outside nine to twenty'",
    );
    const composer = composerOf(playbooksSurface());
    assert.deepEqual(
      all(byTestId(composer, "pb-hour"), (n) => n.type === "option").map((o) => o.props.value),
      [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      "the hours a run may start at",
    );
  } finally {
    Object.assign(realClock.hours, published);
  }
});

test("REGRESSION: a run opened on a page already scrolled is brought into view, and a row pressed in view stays put -- the landing scroll ran once, for listed runs only", () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  const scrolled = [];
  const where = { "bc-run-b-sent": 200, "bc-run-b-old": -900 };
  const keep = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) =>
    id in where
      ? {
          getBoundingClientRect: () => ({ top: where[id], bottom: where[id] + 40 }),
          scrollIntoView: () => scrolled.push(id),
        }
      : null;
  try {
    page({ initialSegment: null, initialRun: null });
    again({ initialSegment: null, initialRun: "b-sent" });
    assert.deepEqual(scrolled, [], "a row pressed in view stays where it is");
    const tree = again({ initialSegment: null, initialRun: "b-old" });
    assert.deepEqual(
      scrolled,
      ["bc-run-b-old"],
      "REGRESSION: a run opened first on a page scrolled past it stayed out of sight",
    );
    assert.equal(
      byTestId(tree, "bc-run-solo").props.id,
      "bc-run-b-old",
      "the section a link lands on carries the run's anchor",
    );
  } finally {
    globalThis.document.getElementById = keep;
  }
});

/* ------------------------------ Messages ------------------------------ */

test("the page counts templates: `message` is what a customer gets, and the word meant three things across one nav", () => {
  // With rows on file, so the line reaches its plural: an empty workspace says
  // "No template on file yet" whatever the word for a full one is.
  const tree = messages({ templatesAll: [templateRow(), templateRow({ id: "t8", name: "welcome" })] });
  const line = textOf(byTestId(tree, "messages-standing"));
  assert.match(
    line,
    /(No template on file yet|\d+ templates?\b)/,
    `REGRESSION: it counted "messages" under a tab beside the Inbox — ${line}`,
  );
  assert.ok(!/\bmessages?\b/i.test(line), `nothing on the line calls a template a message — ${line}`);
  assert.equal(textOf(byTestId(tree, "template-new")).trim(), "New template", "and the act that makes one says so");
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
    const addAll = all(tree, (n) => n.props?.["data-testid"] === "starter-add-all");
    assert.equal(addAll.length, 1, "one press adds what the starter set is missing, in every language at once");
    for (const b of addAll) {
      assert.ok(!textOf(b).includes("Adding"), `REGRESSION: ${textOf(b)} while a sync ran`);
      assert.equal(b.props.disabled, true, "and it waits for the sync");
    }
    const adds = all(tree, (n) => n.props?.["data-testid"] === "starter-add");
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
  const adds = all(tree, (n) => n.props?.["data-testid"] === "starter-add-all");
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
    rows: [{ id: "pb-1", name: "Offer", template_name: "offer", template_language: language, state: "running" }],
  });
  const attn = (t) => String(byTestId(t, "custom-row").props.className).split(" ").includes("is-attn");
  // A playbook sends Spanish and WhatsApp holds only English: every run of it is skipped.
  let tree = messages({ templatesAll: [en], playbooks: sends("es"), templateUse: use });
  assert.ok(attn(tree), "a language a running playbook sends, missing");
  assert.equal(textOf(byTestId(tree, "template-status")).trim(), "Spanish missing");
  assert.ok(textOf(byTestId(tree, "messages-standing")).includes("all approved"), "the one on file is approved");
  // It sends the approved English, and Spanish is in review: nothing is refused, so the row is at rest -- and the
  // pill still says Spanish is in review.
  tree = messages({ templatesAll: [en, es], playbooks: sends("en_US"), templateUse: use });
  assert.ok(!attn(tree), "REGRESSION: a language nobody sends asked for attention");
  assert.equal(textOf(byTestId(tree, "template-status")).trim(), "Spanish in review");
  const head = textOf(byTestId(tree, "messages-standing"));
  assert.ok(head.includes("1 approved") && head.includes("1 in review"), head);
  // Without the playbooks read, a language on file that is not approved, on a message something sends.
  tree = messages({ templatesAll: [en, es], playbooks: undefined, templateUse: use });
  assert.ok(attn(tree), "the playbooks unread: what is on file and not approved");
});

/**
 * A message's languages are the row it opens: they were a column of every closed row ("● EN ⌄" sixteen times) for a
 * choice that changes nothing about who a run reaches (23 Sep, Campaigns made compact). Opens the row `rowOf` finds
 * when it is closed, and returns the tree with it open.
 */
const openedRow = (rowOf) => {
  let tree = messagesAgain();
  if (!byTestId(rowOf(tree), "template-open-body")) {
    press(byTestId(rowOf(tree), "template-open"));
    tree = messagesAgain();
  }
  return tree;
};
const customRow = (t) => byTestId(t, "custom-row");
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
  assert.equal(byTestId(row, "template-open-body"), null, "the whole message is not drawn until it is asked for");
  // The name WhatsApp knows it by is the open row's, in its foot beside its kind and where it was made: in type on
  // every closed row ("winback_offer") it was a word nobody acts on (23 Sep, Campaigns made compact).
  const opened = messagesOpen({
    templatesAll: [templateRow({ id: "t-en", name: "offer_spring", language: "en_US", meta_status: "approved" })],
  });
  assert.equal(
    all(byTestId(opened, "custom-row"), (n) => n.props?.className === "msg-row-name mono").length,
    0,
    "no name in type on the row's line",
  );
  assert.ok(
    textOf(byTestId(opened, "template-open-body")).includes("offer_spring"),
    "and the name WhatsApp knows it by, in the open row",
  );

  // No language on the closed row. Open, ONE language control per message, where a slot per language stood ("EN ES"
  // on every row): the language in view, its state drawn, and no "+1" for a message that exists in one language.
  assert.equal(
    all(row, (n) => n.props?.["data-testid"] === "template-lang").length,
    0,
    "the languages are the open row's",
  );
  const chips = all(
    customRow(messagesOpen({ templatesAll: [en] })),
    (n) => n.props?.["data-testid"] === "template-lang",
  );
  assert.equal(chips.length, 1);
  assert.equal(textOf(chips[0]).trim(), "EN");
  assert.equal(chips[0].props["data-tone"], "ok", "its state, drawn");

  // A STARTER's chip, in its open row, opens its languages in groups: the one WhatsApp holds, the
  // one the library has written and the workspace never added -- a language that
  // did not exist was simply absent before, which is the hole the toolbar's
  // arithmetic ("Add the 3 in English") was describing -- and every other
  // language WhatsApp takes.
  messages({
    templatesAll: [en, templateRow({ id: "t-w", name: "winback_offer", language: "en_US", meta_status: "approved" })],
  });
  tree = openedRow((t) => all(t, (n) => n.props?.["data-testid"] === "starter-row")[0]);
  let starter = all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0];
  const chip = byTestId(starter, "template-lang");
  assert.equal(textOf(chip).trim(), "EN", "Spanish is not on file, so there is nothing more to count");
  press(chip);
  tree = messagesAgain();
  starter = all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0];
  const options = all(starter, (n) => n.props?.["data-testid"] === "template-lang-option");
  const group = (g) => options.filter((o) => o.props["data-group"] === g).map((o) => o.props["data-lang"]);
  assert.deepEqual(group("on"), ["en_US"]);
  assert.deepEqual(group("ready"), ["es"], "the library's Spanish, never added");
  assert.equal(group("add").length, starters.allLanguages.length - 2, "and every other language WhatsApp takes");
  assert.equal(options.find((o) => o.props["aria-selected"]).props["data-lang"], "en_US", "the one in view is ticked");

  // Picking the library's Spanish puts it in view in the open message, where
  // the words WhatsApp would review are, and the Add beside them.
  press(options.find((o) => o.props["data-lang"] === "es"));
  tree = messagesAgain();
  const open = all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0];
  assert.deepEqual(
    chipSays(byTestId(open, "template-lang")),
    ["ES", "+1"],
    "the chip says the language in view, and that English is on file too",
  );
  assert.equal(byTestId(open, "template-lang").props["data-tone"], "none", "which WhatsApp has never seen");
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
  assert.equal(
    byTestId(all(tree, (n) => n.props?.["data-testid"] === "starter-row")[0], "template-open-body"),
    null,
    "the one that was open is closed",
  );
  assert.ok(byTestId(byTestId(tree, "custom-row"), "template-open-body"), "and the one that was pressed is open");
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
/** The chip's options in a row, and one of them by its code. */
const optionsIn = (row) => all(row, (n) => n.props?.["data-testid"] === "template-lang-option");
const optionOf = (row, lang) => optionsIn(row).find((o) => o.props["data-lang"] === lang);

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
    press(byTestId(customRow(tree), "template-lang"));
    tree = messagesAgain();
    // Every language WhatsApp takes, under "Translate into", for a message written here.
    const pt = optionOf(byTestId(tree, "custom-row"), "pt_BR");
    assert.equal(pt.props["data-group"], "add");
    press(pt);
    tree = messagesAgain();
    let row = byTestId(tree, "custom-row");
    // Picked, the open row turns to the new language and starts writing it at once.
    assert.equal(byTestId(row, "tpl-composer").props["data-mode"], "translate");
    assert.ok(byTestId(row, "tpl-translating"), "the shape of the words while the assistant writes");
    assert.deepEqual(
      drafts,
      [{ language: "pt_BR", translate: { id: "t-en" } }],
      "written FROM the English on file, once",
    );
    assert.deepEqual(chipSays(byTestId(row, "template-lang")), ["PT", "+1"]);
    assert.equal(byTestId(row, "template-lang").props["data-tone"], "none", "a language WhatsApp has never seen");
    assert.ok(
      textOf(row).includes("“Hi {first name}, 20% off any service this week.”"),
      "the row still quotes the message while its new language is written",
    );

    await settle();
    tree = messagesAgain();
    row = byTestId(tree, "custom-row");
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
    row = byTestId(tree, "custom-row");
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
    row = byTestId(tree, "custom-row");
    assert.equal(byTestId(row, "template-lang").props["data-tone"], "info");
    assert.equal(textOf(byTestId(row, "template-status")).trim(), "Portuguese (Brazil) in review");
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
    press(byTestId(customRow(tree), "template-lang"));
    tree = messagesAgain();
    press(optionOf(byTestId(tree, "custom-row"), "fr"));
    messagesAgain();
    await settle();
    tree = messagesAgain();
    let row = byTestId(tree, "custom-row");
    // A draft that could not be written says why, and offers another try -- not empty boxes.
    assert.ok(textOf(byTestId(row, "tpl-translate-failed")).includes("not available right now"));
    assert.ok(byTestId(row, "tpl-translate-again"));
    // Another new language picked from there, and Cancel still goes back to the
    // English -- never to the French that was only being drafted.
    press(byTestId(row, "template-lang"));
    tree = messagesAgain();
    press(optionOf(byTestId(tree, "custom-row"), "de"));
    tree = messagesAgain();
    row = byTestId(tree, "custom-row");
    assert.deepEqual(chipSays(byTestId(row, "template-lang")), ["DE", "+1"]);
    press(byTestId(row, "tpl-cancel"));
    tree = messagesAgain();
    row = byTestId(tree, "custom-row");
    assert.deepEqual(chipSays(byTestId(row, "template-lang")), ["EN", ""], "back on English, and nothing more on file");
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
      press(byTestId(lastStarterRow(t), "template-lang"));
      t = messagesAgain();
      press(optionOf(all(t, (n) => n.props?.["data-testid"] === "starter-row").at(-1), "pt_BR"));
      t = messagesAgain();
      return all(t, (n) => n.props?.["data-testid"] === "starter-row").at(-1);
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
    press(byTestId(customRow(t), "template-lang"));
    t = messagesAgain();
    press(optionOf(byTestId(t, "custom-row"), "pt_BR"));
    t = messagesAgain();
    assert.deepEqual(chipSays(byTestId(byTestId(t, "custom-row"), "template-lang")), ["PT", "+1"]);
    settingsChanged({ templatesAll: [offerEn()] });
    t = messagesAgain();
    const r = byTestId(t, "custom-row");
    assert.deepEqual(chipSays(byTestId(r, "template-lang")), ["EN", ""], "back on the language it has");
    assert.equal(byTestId(r, "tpl-composer"), null);
    assert.deepEqual(drafted, [], "and the assistant was never asked");
  } finally {
    Object.assign(templates, keep);
  }

  // A heading would not come with it: no language to translate into, and the reason where they would be.
  messages({ templatesAll: [offerEn({ header: "Fall news" })] });
  let tree = openedRow(customRow);
  press(byTestId(customRow(tree), "template-lang"));
  tree = messagesAgain();
  let row = byTestId(tree, "custom-row");
  assert.deepEqual([...new Set(optionsIn(row).map((o) => o.props["data-group"]))], ["on"]);
  assert.ok(
    textOf(byTestId(row, "template-lang-note")).includes("it has a heading"),
    textOf(byTestId(row, "template-lang-note")),
  );

  // Someone who may not add a template sees the languages WhatsApp holds, and why there are no more.
  const canDo = globalThis.window.canDo;
  globalThis.window.canDo = () => false;
  try {
    tree = messages({ templatesAll: [offerEn()] });
    tree = openedRow(customRow);
    press(byTestId(customRow(tree), "template-lang"));
    tree = messagesAgain();
    row = byTestId(tree, "custom-row");
    assert.deepEqual([...new Set(optionsIn(row).map((o) => o.props["data-group"]))], ["on"]);
    assert.equal(textOf(byTestId(row, "template-lang-note")).trim(), "Only an owner or operator can add a language.");
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
    const field = byTestId(tree, "tpl-language");
    assert.equal(
      textOf(find(field, (n) => n.props?.className === "lp-words")).trim(),
      "English (US)",
      "the language in words, as the fields beside it are",
    );
    press(field);
    tree = draw();
    assert.equal(
      all(tree, (n) => n.props?.["data-testid"] === "tpl-language-option").length,
      starters.allLanguages.length,
    );
    byTestId(tree, "tpl-language-search").props.onChange({ target: { value: "fran" } });
    tree = draw();
    const found = all(tree, (n) => n.props?.["data-testid"] === "tpl-language-option").map((o) => o.props["data-lang"]);
    assert.deepEqual(
      found,
      ["fr", "fr_BE", "fr_CA", "fr_CI", "fr_MA", "fr_CH"],
      "French by its own name, every place WhatsApp files it",
    );
    press(all(tree, (n) => n.props?.["data-testid"] === "tpl-language-option")[0]);
    tree = draw();
    assert.equal(
      textOf(find(byTestId(tree, "tpl-language"), (n) => n.props?.className === "lp-words")).trim(),
      "French",
    );
    byTestId(tree, "tpl-brief").props.onChange({ target: { value: "Twenty percent off colour this week" } });
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
    let tree = messagesOpen({ templatesAll: [templateRow()], playbooks: playbooks });
    press(byTestId(tree, "template-menu"));
    tree = messagesAgain();
    press(byTestId(tree, "template-delete"));
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
  press(find(held, (n) => n.type === "button" && textOf(n).includes("Playbooks")));
  assert.equal(went.at(-1), "outbound", "and a door to the playbook");

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
    textOf(byTestId(tree, "template-delete-confirm")).includes("couldn't check which playbooks send it"),
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
  assert.equal(toasts.at(-1).links[0].to, "broadcasts/run:b-new");
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
  const head = find(preview, (n) => n.props?.className === "mp-head");
  assert.ok(textOf(head).includes("Luna Studio"), textOf(head));
  assert.ok(textOf(head).includes("Business account"), textOf(head));
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
    templateUse: { offer: { words: "Win-back and 2 broadcasts", unused: false, playbook: "pb-1" } },
  });
  const users = byTestId(tree, "template-users");
  assert.ok(textOf(users).includes("Win-back and 2 broadcasts"), textOf(users));
  press(users);
  assert.equal(went.at(-1), "outbound/pb-1", "and it opens that playbook's card");

  // The answer the page could not give while it read the playbooks alone: a
  // message two broadcasts had gone out with read the same as a dead one.
  tree = messages({
    templatesAll: offer,
    templateUse: { offer: { words: "Nothing sends it", unused: true, playbook: null } },
  });
  assert.equal(textOf(byTestId(tree, "template-users")).trim(), "Nothing sends it");

  // More than one playbook: the line still says them, and opens the list.
  tree = messages({
    templatesAll: offer,
    templateUse: { offer: { words: "Win-back and Welcome", unused: false, playbook: null } },
  });
  press(byTestId(tree, "template-users"));
  assert.equal(went.at(-1), "outbound", "no single playbook to open, so the list");

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
  const pv = contracts.audiencePreview(rows, "everyone", null, null, "marketing");
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
  assert.ok(textOf(byTestId(tree, "bc-preview")).includes("Hi Daniela"), "the slot takes THEIR name");

  // The next one has no name on file: the message opens "Hi there", and the page
  // says why rather than leaving it to be discovered after the send.
  press(find(step, (n) => n.props?.["aria-label"] === "The next person"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(textOf(byTestId(tree, "bc-preview")).includes("Hi there"), textOf(byTestId(tree, "bc-preview")));
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

test("One chip per message, its languages inside it -- the starter set in two drew seven pairs of identical chips", () => {
  const some = starters.list.slice(0, 3);
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

  const chips = all(tree, (n) => n.props?.["data-testid"] === "bc-template");
  assert.equal(chips.length, some.length, `one chip per MESSAGE, not per row: ${chips.map(textOf).join(" | ")}`);
  const titles = chips.map((c) => textOf(c).trim());
  assert.equal(new Set(titles).size, titles.length, `REGRESSION: two chips read alike -- ${titles.join(" | ")}`);

  // Each chip carries ONE language control -- the language it would go in -- where
  // a toggle spelled out every language of every message: "English | Spanish".
  const langs = all(tree, (n) => n.props?.["data-testid"] === "bc-template-lang");
  assert.equal(langs.length, some.length);
  assert.deepEqual(
    [...new Set(langs.map((l) => textOf(l).trim()))],
    ["EN"],
    "the letters of the language each would go in",
  );
  // A group with one language shows no language control at all.
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: [rows[rows.length - 1]], number: healthyNumber }));
  assert.equal(
    all(writing({ initialSegment: null, initialRun: null }), (n) => n.props?.["data-testid"] === "bc-template-lang")
      .length,
    0,
  );

  // Picking a language picks THAT row, and the armed send names it.
  setSurfaceValue("broadcasts", broadcastsSurface({ templates: rows, number: healthyNumber }));
  tree = writing({ initialSegment: null, initialRun: null });
  press(all(tree, (n) => n.props?.["data-testid"] === "bc-template-lang")[0]);
  tree = again({ initialSegment: null, initialRun: null });
  const offered = all(tree, (n) => n.props?.["data-testid"] === "bc-template-lang-option");
  const words = (o) => textOf(find(o, (n) => n.props?.className === "lp-opt-label")).trim();
  assert.deepEqual(
    offered.map(words),
    ["English", "Spanish"],
    "every language the message is approved in, in words -- and nothing it is not",
  );
  assert.ok(textOf(offered[1]).includes("Español"), "each in its own words too, where they differ");
  press(offered.find((n) => words(n) === "Spanish"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(
    textOf(
      byTestId(
        find(tree, (n) => String(n.props?.className || "").includes("tpl-chip active")),
        "bc-template-lang",
      ),
    ).trim(),
    "ES",
    "the picked chip says the language it goes in",
  );
  press(byTestId(tree, "bc-send"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(textOf(byTestId(tree, "bc-send-confirm")).includes("(Spanish)"), textOf(byTestId(tree, "bc-send-confirm")));

  // And the composer opens on the same row however the rows arrive: `defaultTemplate`
  // used to `find` on the list as given, so a reload could open on the other language.
  const opened = (list) => {
    setSurfaceValue("broadcasts", broadcastsSurface({ templates: list, number: healthyNumber }));
    const t = writing({ initialSegment: null, initialRun: null });
    const chip = find(t, (n) => String(n.props?.className || "").includes("tpl-chip active"));
    const on = chip ? byTestId(chip, "bc-template-lang") : null;
    return on ? `${textOf(byTestId(chip, "bc-template")).trim()} ${textOf(on).trim()}` : null;
  };
  assert.ok(opened(rows), "the composer opens on a message with its language");
  assert.equal(opened(rows), opened(rows.slice().reverse()), "the picker opens on the same language either way");
});

test("A playbook's card says which message it sends AND in which language -- the language was in a data-tip, which no finger reaches", () => {
  // The card draws the message it sends, so its template has to be among the
  // approved ones the surface carries -- an empty list is "no longer approved".
  const es = templateRow({ id: "tpl-1", name: "winback_offer", language: "es", body_preview: "Hola {{1}}." });
  setSurfaceValue("playbooks", playbooksSurface({ templates: [es] }));
  fresh();
  const card = PlaybookCard({
    p: playbook({ template_id: "tpl-1", template_language: "es" }),
    canAct: true,
    onEdit() {},
    flash() {},
  });
  const caption = byTestId(card, "pb-template-name");
  assert.ok(caption, "the message is captioned with the message it is");
  assert.ok(textOf(caption).includes("Spanish"), textOf(caption));
  assert.equal(caption.props["data-tip"], undefined, "and not only on hover");
  press(caption);
  assert.equal(went.at(-1), "messages", "and it opens where that message is kept");
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
  let chip = byTestId(byTestId(tree, "custom-row"), "template-lang");
  assert.deepEqual(chipSays(chip), ["EN", "+1"]);
  assert.ok(!/approved|review/i.test(textOf(chip)), `the chip says a language, not a state: ${textOf(chip)}`);
  assert.equal(chip.props["data-tone"], "ok");
  // Opened, each language WhatsApp holds says its state in words at its right.
  press(chip);
  tree = messagesAgain();
  const held = all(
    byTestId(tree, "custom-row"),
    (n) => n.props?.["data-testid"] === "template-lang-option" && n.props["data-group"] === "on",
  );
  assert.deepEqual(
    held.map((o) => [
      o.props["data-lang"],
      textOf(o).includes("Approved") ? "Approved" : textOf(o).includes("In review") ? "In review" : "?",
    ]),
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
  press(held[1]);
  tree = messagesAgain();
  chip = byTestId(byTestId(tree, "custom-row"), "template-lang");
  assert.deepEqual(chipSays(chip), ["ES", "+1"], "Spanish in view, English the one more");
  assert.equal(chip.props["data-tone"], "info", "drawn in review");
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
  const chips = all(tree, (n) => n.props?.["data-testid"] === "bc-template");
  press(chips[chips.length - 1]);
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(textOf(byTestId(tree, "bc-preview")).includes("Not now? Reply STOP"), textOf(byTestId(tree, "bc-preview")));

  // On Messages too, where it said a starter's footer or nothing at all.
  // Scoped to the workspace's OWN row: the starter cards on the same page draw the
  // library's footer, so reading the whole section would pass either way.
  const msgTree = messagesOpen({ templatesAll: [mine] });
  const own = byTestId(msgTree, "custom-row");
  assert.ok(own, "the workspace's own message has a row");
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
  const chips = all(tree, (n) => n.props?.["data-testid"] === "bc-template");
  assert.equal(chips.length, 1, `only what can go on the wire: ${chips.map(textOf).join(" | ")}`);
  const why = textOf(byTestId(tree, "bc-blocked"));
  assert.ok(why.includes("a picture for a heading"), why);
  assert.ok(why.includes("WhatsApp Manager"), "and where it does still work");

  // Playbooks refuses the same one.
  setSurfaceValue("playbooks", playbooksSurface({ templates: [plain, picture] }));
  fresh();
  PlaybooksPage({});
  globalThis.dispatchEvent({ type: "playbooks:new" });
  const pb = outboundAgain();
  press(byTestId(pb, "pb-template"));
  const list = outboundAgain();
  assert.deepEqual(
    [...new Set(all(list, (n) => n.props?.["data-testid"] === "pb-template-option").map((o) => o.props["data-lang"]))],
    ["offer"],
    "its list offers what can go on the wire",
  );
  assert.ok(
    textOf(byTestId(list, "pb-template-note")).includes("a picture for a heading"),
    "and says, under it, why the rest is not there",
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

test("History says whether a playbook or a person sent each broadcast, and the split filters it", () => {
  // `broadcasts.playbook_id` is on every row and nothing drew it, so a playbook's
  // automatic run sat beside a hand-sent blast with no way to tell them apart --
  // while Playbooks summed the same runs again on its own tab.
  const run = (over = {}) =>
    toBroadcastVM(
      dto({
        id: "b-run",
        name: "Win-back · 2026-09-10",
        playbook_id: "pb-1",
        audience: { kind: "playbook", id: "pb-1", label: "Win-back" },
        ...over,
      }),
      ZONE,
    );
  const byHand = toBroadcastVM(
    dto({
      id: "b-hand",
      name: "Spring offer",
      playbook_id: null,
      audience: { kind: "list", id: "quiet", label: "Lapsed 60+ days" },
    }),
    ZONE,
  );
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [run(), byHand] }));
  let tree = page({ initialSegment: null, initialRun: null });

  const rowWords = () =>
    all(tree, (n) => n.props?.["data-testid"] === "bc-history").map((n) => textOf(n).replace(/\s+/g, " "));
  let words = rowWords();
  assert.equal(words.length, 2);
  // Each card says which kind sent it, first on its line: a playbook's run, or a broadcast a person sent.
  assert.ok(
    words.some((w) => w.includes("Playbook · Win-back")),
    words.join(" || "),
  );
  assert.ok(
    words.some((w) => w.includes("Broadcast · Lapsed 60+ days")),
    words.join(" || "),
  );
  // The playbook's name is said ONCE: it is the audience cell, and that cell opens it.
  const run0 = all(tree, (n) => n.props?.["data-testid"] === "bc-history")[0];
  assert.equal(
    textOf(run0).match(/Win-back/g).length,
    2,
    "the run's own name, and the audience — not a third time in the origin",
  );
  press(byTestId(run0, "bc-history-playbook"));
  assert.equal(went.at(-1), "outbound/pb-1", "and it opens the playbook that made it");

  // The line splits them, and each count is its own filter.
  const line = byTestId(tree, "bc-standing");
  assert.ok(textOf(line).includes("by a playbook") && textOf(line).includes("by hand"), textOf(line));
  press(byTestId(line, "bc-origin-hand"));
  tree = again({ initialSegment: null, initialRun: null });
  words = rowWords();
  assert.equal(words.length, 1, words.join(" || "));
  assert.ok(words[0].includes("Spring offer"), words[0]);
  // Pressing the one in force clears it, as the Playbooks line's taps do.
  press(byTestId(byTestId(tree, "bc-standing"), "bc-origin-hand"));
  tree = again({ initialSegment: null, initialRun: null });
  assert.equal(rowWords().length, 2);

  // One kind only: nothing to split, so no taps.
  setSurfaceValue("broadcasts", broadcastsSurface({ rows: [byHand] }));
  assert.equal(byTestId(page({ initialSegment: null, initialRun: null }), "bc-origin-playbook"), null);
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
    const set = (id, v) => {
      byTestId(tree, id).props.onChange({ target: { value: v } });
    };
    set("tpl-name", "spring_offer");
    set("tpl-body", "Hi {{1}}, 20% off any colour service this week.");
    tree = drawAgain(() => TemplateComposer({ businessName: "Luna Studio", onDone() {}, onCancel() {} }));
    // The address is the workspace's own, and it is shown rather than typed.
    assert.ok(
      textOf(byTestId(tree, "tpl-button")).includes("booksy.com/luna-studio"),
      textOf(byTestId(tree, "tpl-button")),
    );
    byTestId(tree, "tpl-button-text").props.onChange({ target: { value: "Book now" } });
    all(tree, (n) => n.props?.["data-testid"] === "tpl-examples").length;
    const ex = find(
      tree,
      (n) => n.type === "input" && String(n.props?.placeholder || "").includes("what a real value"),
    );
    if (ex) ex.props.onChange({ target: { value: "Dani" } });
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
  assert.ok(
    textOf(byTestId(tree, "tpl-button-none")).includes("booking link"),
    textOf(byTestId(tree, "tpl-button-none")),
  );
});

test("the send screen says how many of an audience heard from a playbook or a broadcast this week -- a send by hand is not held back by the week a playbook waits, and the owner was told nothing", async () => {
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
  // Counted over who it reaches: Cy heard from a run, but no offer reaches Cy.
  const touched = new Set(["b", "c"]);
  const offers = contracts.audiencePreview(rows, "everyone", null, null, "marketing", 5, touched);
  assert.deepEqual([offers.sending, offers.heard], [2, 1]);
  const notes = contracts.audiencePreview(rows, "everyone", null, null, "conversational", 5, touched);
  assert.deepEqual([notes.sending, notes.heard], [3, 2]);
  assert.equal(
    contracts.audiencePreview(rows, "everyone", null, null, "marketing").heard,
    0,
    "no touches read, nobody said",
  );
  assert.equal(contracts.heardWords(2), "2 of them heard from a playbook or a broadcast this week.");
  assert.equal(contracts.heardWords(1), "One of them heard from a playbook or a broadcast this week.");
  assert.equal(contracts.heardWords(0), null);

  const offer = templateRow({ id: "tpl-offer", name: "fall_offer", purpose: "marketing" });
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
          preview: { marketing: offers, conversational: notes },
        },
      ],
    }),
  );
  const tree = writing({ initialSegment: null, initialRun: null });
  assert.equal(textOf(byTestId(tree, "bc-heard")), "One of them heard from a playbook or a broadcast this week.");
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
          preview: { marketing: { ...offers, heard: 0 }, conversational: { ...notes, heard: 0 } },
        },
      ],
    }),
  );
  assert.equal(
    byTestId(writing({ initialSegment: null, initialRun: null }), "bc-heard"),
    null,
    "nobody heard, nothing said",
  );
});

test("a playbook may run on any list: the composer picks one of the workspace's or one of People's, with its own count, and the save names it (decision 0009)", async () => {
  const offer = templateRow({ id: "tpl-offer", name: "fall_offer", purpose: "marketing" });
  const named = { pool: 5, noYes: 2, stopped: 0, noNumber: 0, saidYes: 3 };
  const surface = playbooksSurface({
    rows: [],
    templates: [offer],
    triggers: [
      {
        id: "saved_list",
        label: "One of your lists",
        hint: "Everyone on a list you keep",
        cls: "campaign",
        list: null,
        kind: "saved",
        candidates: null,
        held: null,
      },
    ],
    // Each list by its token: People's first, then the workspace's own (playbooks/surface.ts).
    lists: [
      { id: "seg:lapsed", name: "Lapsed", smart: true, builtin: true, candidates: 2, held: 0, named },
      { id: "list:l1", name: "Regulars", smart: false, builtin: false, candidates: 3, held: 0, named },
      {
        id: "list:l2",
        name: "Texters",
        smart: true,
        builtin: false,
        candidates: 1,
        held: 0,
        named: { ...named, pool: 1, saidYes: 1, noYes: 0 },
      },
    ],
  });
  const bodies = [];
  const keep = { ...playbooks };
  Object.assign(playbooks, {
    create: async (body) => {
      bodies.push(body);
      return { ok: true, data: { id: "p9", name: "Regulars · Fall offer", state: "running" } };
    },
  });
  try {
    let tree = composerOf(surface);
    const picker = (t, id) => find(t, (n) => n.type === CmPicker && n.props.testid === id);
    const lists = picker(tree, "pb-list");
    assert.ok(lists, "a list to pick, under the moment");
    assert.deepEqual(
      lists.props.choices.map((c) => [c.id, c.label, c.group, c.sub, c.hint]),
      [
        ["seg:lapsed", "Lapsed", "people", "One of People's lists", "2 today"],
        ["list:l1", "Regulars", "own", "Kept by hand", "3 today"],
        ["list:l2", "Texters", "own", "Keeps itself current", "1 today"],
      ],
    );
    assert.equal(lists.props.value, "list:l1", "the first list the workspace keeps, until another is picked");
    assert.ok(picker(tree, "pb-list-class"), "and what it sends: an offer or a win-back");
    lists.props.onPick("list:l2");
    tree = outboundAgain();
    picker(tree, "pb-template").props.onPick("fall_offer");
    tree = outboundAgain();
    await press(byTestId(tree, "pb-save"));
    assert.equal(bodies.length, 1, "saved");
    assert.equal(bodies[0].trigger, "saved_list");
    assert.equal(bodies[0].list_id, "l2", "the list picked, named on the playbook");
    assert.equal(bodies[0].list_key, undefined);
    assert.equal(bodies[0].policy_class, "campaign", "an offer, until the owner says a win-back");
    // One of People's lists, sent as a win-back: its id, and the class. A fresh composer, the first one saved and closed.
    tree = composerOf(surface);
    picker(tree, "pb-list").props.onPick("seg:lapsed");
    tree = outboundAgain();
    picker(tree, "pb-template").props.onPick("fall_offer");
    tree = outboundAgain();
    picker(tree, "pb-list-class").props.onPick("reengage");
    tree = outboundAgain();
    await press(byTestId(tree, "pb-save"));
    assert.equal(bodies.length, 2, "saved again");
    assert.deepEqual(
      [bodies[1].list_key, bodies[1].list_id, bodies[1].policy_class],
      ["lapsed", undefined, "reengage"],
    );
  } finally {
    Object.assign(playbooks, keep);
  }
  const none = composerOf(playbooksSurface({ ...surface, lists: [] }));
  assert.ok(byTestId(none, "pb-no-lists"), "no list kept yet: where to make one");
});
