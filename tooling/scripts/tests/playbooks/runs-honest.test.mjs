/**
 * A run you can open: every door to one broadcast lands on it, and a playbook's detail shows what it sends.
 *
 * - A playbook's runs were dead text, and "Its runs in Broadcasts" opened the page of every broadcast, which could
 *   name none of them (the wiring audit's C9); Today's run rows opened Playbooks or that same page (A21).
 * - The broadcast detail said "Couldn't be read right now." with nothing to press, never re-read while a send went
 *   out, and would have offered a Retry for a broadcast that is not in the workspace at all (C23).
 * - A playbook's detail named its template and never showed the words its runs send (C10); Skip this run fired on one
 *   click, when Broadcasts asks first (C16); a visit reminder's had no policy chip, its class (booking) being looked
 *   up as a row id (book) (C18); the composer's no-template hint named Messages as plain words (C19).
 * - Run now said "sending now" over a run the server had moved to nine o'clock (C7).
 * Run against the pages (TSX, apps/dashboard/src/surfaces/campaigns) on a stub React, over the view models the seam holds
 * (surface-values.ts), their verbs the modules' own; Today's run rows are the shell's, still JSX. A playbook's detail is
 * `PlaybookPane` (the card the Playbooks list drew in its row is gone, 3 Oct 2026: Campaigns' home opens the pane in a
 * sheet), and the composer is the home's `new:every` address.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toBroadcastVM,
  toTodayVM,
  stateOf,
  fmtDay,
  PLAYBOOK_TRIGGERS,
  POLICY_CLASS_WORDS,
  POLICY_MODE_WORDS,
  MESSAGE_GONE_WORDS,
  campaignMessagesOf,
} from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again as drawAgain,
  all,
  find,
  byTestId,
  textOf,
  press,
  settle,
} from "../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.now();
/** An instant relative to now: negative is past. */
const iso = (ms) => new Date(NOW + ms).toISOString();

/** A broadcast as GET broadcasts returns it (contracts BroadcastDto), for the view model the surface publishes. */
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
/** One person on a broadcast, as GET broadcasts/[id] returns them (contracts BroadcastRecipientDto). */
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

/** One run on a card's history (server/campaigns/playbooks.ts RunSummary). */
const runOf = (i, over = {}) => ({
  id: `b-run-${i}`,
  run_for: `2026-09-${String(14 - i).padStart(2, "0")}`,
  state: "sent",
  scheduled_for: iso(-(i + 1) * D),
  recipient_count: 3,
  sent: 3,
  held: 0,
  delivered: 2,
  replied: i === 0 ? 1 : 0,
  ...over,
});
/** A playbook as the Playbooks surface publishes it: the route's row, its words, its totals (surface.ts). */
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "text", value: "10% off this week" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: "2026-09-14",
  last_run_at: iso(-D),
  created_at: iso(-30 * D),
  triggerLabel: "Quiet 30 days",
  triggerHint: "anyone quiet for a month",
  schedule: "daily at 10:00 AM",
  next: "tomorrow 10:00 AM",
  candidates: 4,
  held: 0,
  // Everyone its moment names, as the route counts them (server/campaigns/playbook-pools.ts triggerPools); null only when it could not.
  named: { pool: 6, noYes: 2, stopped: 0, noNumber: 0, saidYes: 4 },
  totals: {
    runs: 2,
    sent: 6,
    delivered: 4,
    replied: 1,
    held: 0,
    lastRun: { id: "b-run-0", state: "sent", run_for: "2026-09-14", recipient_count: 3 },
    waiting: null,
    history: [runOf(0), runOf(1)],
  },
  ...over,
});
const TEMPLATE = {
  id: "tpl-1",
  name: "winback_offer",
  language: "en_US",
  channel: "whatsapp",
  meta_status: "approved",
  category: "MARKETING",
  purpose: "marketing",
  body_preview: "Hi {{1}}, it's been a while at {{2}}. Come back for {{3}}.",
  variables: [
    { position: 1, label: "First name" },
    { position: 2, label: "Business" },
    { position: 3, label: "Offer" },
  ],
};
const playbooksSurface = (over = {}) => ({
  rows: [playbook()],
  templates: [TEMPLATE],
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
      named: { pool: 6, noYes: 2, stopped: 0, noNumber: 0, saidYes: 4 },
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
/** Two broadcasts the Broadcasts surface lists: one sending now, one sent. */
const SENDING = dto({
  id: "b-sending",
  name: "Offers · 2026-09-15",
  state: "sending",
  started_at: iso(-60_000),
  finished_at: null,
  counts: { queued: 2, sent: 1, skipped: 0, failed: 0, delivered: 1, read: 0, replied: 0 },
});
const broadcastsSurface = (over = {}) => ({
  audiences: [
    { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 2, utility: 3 } },
    { kind: "saved", id: "s1", label: "Regulars", counts: { marketing: 1, utility: 1 } },
    { kind: "saved", id: "s2", label: "Walk-ins", counts: { marketing: 1, utility: 1 } },
  ],
  templates: [],
  rows: [toBroadcastVM(SENDING, ZONE), toBroadcastVM(dto(), ZONE)],
  more: false,
  heldReasons: {},
  number: null,
  optIn: null,
  listsRead: true,
  scheduleMaxDays: 30,
  businessName: "Northside Studio",
  bookingLink: false,
  ...over,
});
// The metrics read as today-doors.test.mjs copies it.
const metrics = {
  workspace: { name: "Northside Studio", timezone: ZONE, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }],
  window: {
    days: 1,
    since: "2026-09-06T04:00:00Z",
    since_local: "2026-09-06T00:00:00",
    now_local: "2026-09-06T10:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-06T13:00:00Z",
    last_outbound_at: "2026-09-06T13:01:00Z",
  },
  period: {
    messages_in: 5,
    messages_out_ai: 5,
    messages_out_you: 0,
    conversations_active: 3,
    answered_by_ai: 5,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: 40,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
};

/* ---------------------------------- the window ---------------------------------- */

// The page's window is the stub React's (installLegacyReact: window IS globalThis), with the shell's doors the TSX pages
// reach through the bridge's verbs (surfaces/legacy-verbs.ts, legacy-parts.ts) and the workspace its clock reads.
const went = [];
const toasts = [];
installLegacyReact({
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  usePPToast: () => [null, () => {}],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to) => went.push(to),
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  useHotkey: () => {},
});
const S = "../../../../apps/dashboard/src";
const { installClock } = await import(`${S}/legacy-bridge/zone.ts`);
installClock();
// What the shell still owns and the pages draw by name: Confirm, StatePill, PolicyChip (data-bits), the unsaved-work rule (record-fold).
await import(`${S}/legacy/components/data-bits.jsx`);
const { installPolicyStore } = await import(`${S}/legacy-bridge/policy-store.ts`);
installPolicyStore(globalThis.window);
// Today's queue and card (TSX since decision 0015): the day comes over the seam, the rows a run needs off the window.
const { AgentCommand } = await import(`${S}/surfaces/today/pages/queue.tsx`);
const { TodayBriefPane } = await import(`${S}/surfaces/today/pages/brief-pane.tsx`);
// The moved surfaces: TSX, drawn over the values the seam holds, their verbs imported.
const { BroadcastsPage } = await import(`${S}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { CampaignsHome } = await import(`${S}/surfaces/campaigns/home/home-page.tsx`);
const { PlaybookPane } = await import(`${S}/surfaces/campaigns/playbooks/card-detail.tsx`);
const { playbooksSample } = await import(`${S}/surfaces/campaigns/playbooks/sample.ts`);
const { Menu } = await import(`${S}/surfaces/kit/menu/menu.tsx`);
const { Picker } = await import(`${S}/surfaces/kit/picker/picker.tsx`);
/** One of the composer's choices, the kit's Picker (surfaces/kit/picker/), by its test id. */
const pickerOf = (tree, testid) => find(tree, (n) => n.type === Picker && n.props["data-testid"] === testid);
/** The kit menu's item by its words (the ⋯ beside Pause and Edit, where Run now and Delete live): what a press does. */
const moreItem = (tree, label) => {
  const menu = find(tree, (n) => n.type === Menu);
  const item = menu && menu.props.groups.flatMap((g) => g.items || []).find((i) => i.label === label);
  assert.ok(item, `the ⋯ menu offers ${label}`);
  return item;
};
const { broadcasts } = await import(`${S}/surfaces/campaigns/broadcasts/verbs.ts`);
const { playbooks } = await import(`${S}/surfaces/campaigns/playbooks/verbs.ts`);
const { playbooksOverride } = await import(`${S}/surfaces/campaigns/playbooks/surface.ts`);
const { setSurfaceValue, surfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

const buttonsSaying = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).trim() === words);
/** A run's name as its pane's head says it (CmPane's title, an h2's first child; its state is the second): where the page's h1 was. */
const paneTitle = (tree) => textOf(find(byTestId(tree, "bc-run-solo"), (n) => n.type === "h2").props.children[0]);
/** A fresh mount: nothing kept from the last page, no listener left behind by it. */
const fresh = () => {
  freshTree();
  went.length = 0;
};

/** The detail's reads, answered in order per broadcast; the last answer repeats. */
const answers = new Map();
const asked = [];
// The verb the run's screen reads through (verbs.ts `broadcasts.detail`): answered from the queue above. Its report is the
// verbs' own (`broadcasts.report`, the contracts' words stamped by the clock the page runs on), not a stand-in.
broadcasts.detail = async (id) => {
  asked.push(id);
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
/** A playbook's detail as the home's drawer draws it (home/drawer.tsx): the pane, its body the card's own words and verbs. */
const paneOf = (p) => PlaybookPane({ p, canAct: true, onEdit() {}, flash: (t) => toasts.push(t), onClose() {} });
const pane = (p) => {
  fresh();
  return paneOf(p);
};
const redraw = (p) => drawAgain(() => paneOf(p));
/**
 * Campaigns' home at an address (`campaigns/<param>`, null for the home), read at the clock the file runs at. Only the
 * playbooks are read here: the broadcasts, the reach-outs and the library are not, and their sections are left out.
 */
const homeAt = (param = null, broadcasts = undefined) => {
  for (const key of ["reach_outs", "settings"]) setSurfaceValue(key, undefined);
  setSurfaceValue("broadcasts", broadcasts);
  fresh();
  return drawAgain(() => CampaignsHome({ param, nowMs: NOW }));
};

/* ------------------------------- a run's own door ------------------------------- */

test("REGRESSION (C9): each of a playbook's runs opens that run -- the runs were dead text, and the one door opened every broadcast", () => {
  setSurfaceValue("playbooks", playbooksSurface());
  const tree = pane(playbook());
  // The kit's LinkButton (surfaces/kit/link-button/) and the host button it draws carry the id: the doors are the hosts.
  const doors = all(tree, (n) => n.type === "button" && n.props?.["data-testid"] === "pb-run-open");
  assert.equal(doors.length, 2, "REGRESSION: a run was a line of text");
  assert.ok(
    doors.every((d) => d.type === "button"),
    "a door a keyboard reaches",
  );
  press(doors[1]);
  assert.deepEqual(went, ["broadcasts/run:b-run-1"]);
  assert.equal(
    all(tree, (n) => n.type === "button" && textOf(n).includes("Its runs in Broadcasts")).length,
    0,
    "REGRESSION: the door to every broadcast, which could name none of them",
  );
  assert.equal(byTestId(tree, "pb-history-more"), null, "every run is in its detail");
  const busy = pane(
    playbook({ totals: { ...playbook().totals, runs: 14, history: Array.from({ length: 10 }, (_, i) => runOf(i)) } }),
  );
  assert.equal(
    textOf(byTestId(busy, "pb-history-more")),
    "The newest 10 of 14 runs",
    "a detail that lists some of its runs says so",
  );
});

test("REGRESSION (C9): a link to a run opens it on Broadcasts -- its report on a screen of its own, as the canvas draws it, whether the list holds it or not", async () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  answers.set("b-sent", [{ ok: true, data: detailOf(dto()) }]);
  // The ledger's own doors: a row's name and its Open (the chevron, named "Open <run>" for a screen reader) are links
  // to the run.
  let tree = page({ initialSegment: null, initialRun: null });
  // A row is `bc-row-<id>` now: the pane beside the list holds `bc-run-<id>`, and one id is one element.
  const card = find(tree, (n) => n.props?.id === "bc-row-b-sent");
  press(byTestId(card, "bc-open-who"));
  press(find(card, (n) => n.type === "button" && /^Open /.test(n.props?.["aria-label"] || "")));
  assert.deepEqual(
    went,
    ["broadcasts/run:b-sent", "broadcasts/run:b-sent"],
    "REGRESSION: nothing named one broadcast, so nothing opened one",
  );
  press(byTestId(tree, "bc-open-who"));
  assert.equal(went.at(-1), "broadcasts/run:b-sending", "a scheduled or sending broadcast opens by its link too");

  const listed = { initialSegment: null, initialRun: "b-sent" };
  page(listed);
  await settle();
  tree = again(listed);
  const details = all(tree, (n) => n.props?.["data-testid"] === "bc-detail");
  assert.equal(details.length, 1);
  assert.equal(
    byTestId(tree, "bc-run-solo").props.id,
    "bc-run-b-sent",
    "the screen a link lands on carries the run's anchor",
  );
  // The layout is the Inbox's list + pane (Claude Video/docs/2026-10-02-campaigns-on-the-kit.md §3.1): the ledger stays the
  // list, and the report is the pane beside it, its head (a CmPane's) saying the run's name and state.
  assert.ok(byTestId(tree, "bc-runs"), "the report is a pane: the ledger stays the list beside it");
  assert.equal(byTestId(tree, "bc-composer"), null);
  const solo0 = byTestId(tree, "bc-run-solo");
  assert.equal(paneTitle(tree), "Win-back · 2026-09-10", "the run's name is the pane's title");
  assert.ok(
    find(solo0, (n) => n.props?.["data-state"] === "sent"),
    "with its state beside it",
  );
  assert.ok(textOf(details[0]).includes("Rosa Díaz"), "and who got it");
  press(byTestId(tree, "bc-detail-close"));
  assert.deepEqual(
    went.at(-1),
    "broadcasts",
    "closing is a link too, so the address never names a run that is not open",
  );

  answers.set("b-old", [{ ok: true, data: detailOf(dto({ id: "b-old", name: "Win-back · 2026-06-01" })) }]);
  const older = { initialSegment: null, initialRun: "b-old" };
  page(older);
  await settle();
  tree = again(older);
  const solo = byTestId(tree, "bc-run-solo");
  assert.ok(
    solo && textOf(solo).includes("Win-back · 2026-06-01"),
    "a run past the newest fifty is read by its id and shown the same way",
  );
  assert.ok(
    find(solo, (n) => n.props?.["data-state"] === "sent"),
    "with its state",
  );
});

test("the page follows its link rather than starting again: opening a run keeps the audience chosen, and a link to a list picks it", () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  // The list the send is for is the kit's picker's token (the chips are gone): the label of the option chosen.
  const chosen = (tree) => {
    const p = pickerOf(tree, "bc-audience");
    return p.props.groups.flatMap((g) => g.options).find((o) => o.value === p.props.value).label;
  };
  let tree = page({ initialSegment: "s1", initialRun: null });
  assert.ok(chosen(tree).startsWith("Regulars"));
  again({ initialSegment: null, initialRun: "b-sent" });
  tree = again({ initialSegment: null, initialRun: "b-sent" });
  assert.equal(byTestId(tree, "bc-composer"), null, "a run opens on its own screen");
  again({ initialSegment: null, initialRun: null });
  tree = again({ initialSegment: null, initialRun: null });
  assert.ok(chosen(tree).startsWith("Regulars"), "and closing it leaves the send, and its audience, where they were");
  again({ initialSegment: "s2", initialRun: null });
  tree = again({ initialSegment: "s2", initialRun: null });
  assert.ok(chosen(tree).startsWith("Walk-ins"), "and a later link to another list picks that list");
  pickerOf(tree, "bc-audience").props.onValueChange("saved:s1");
  setSurfaceValue("broadcasts", broadcastsSurface());
  again({ initialSegment: "s2", initialRun: null });
  tree = again({ initialSegment: "s2", initialRun: null });
  assert.ok(
    chosen(tree).startsWith("Regulars"),
    "while the surface re-reading its lists does not undo a choice made on the page",
  );
});

test("a run opened before opens at once from what the tab holds, and is read again behind -- every open was a read first (~250ms of 'Reading who got it…', measured)", async () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  answers.set("b-sent", [{ ok: true, data: detailOf(dto()) }]);
  answers.set("b-new", [{ ok: true, data: detailOf(dto({ id: "b-new", name: "Win-back · 2026-09-20" })) }]);
  // What the courier's read cache holds (verbs.ts peekDetail): the last answer for a run this tab opened.
  const peekKept = broadcasts.peekDetail;
  broadcasts.peekDetail = (id) => (id === "b-sent" ? { ok: true, data: detailOf(dto()) } : null);
  asked.length = 0;
  try {
    const first = page({ initialSegment: null, initialRun: "b-sent" });
    const seen = byTestId(first, "bc-detail");
    assert.ok(
      !textOf(seen).includes("Reading who got it"),
      "REGRESSION: a run opened a moment ago was read before anything showed",
    );
    assert.equal(paneTitle(first), "Win-back · 2026-09-10", "its report, on the first paint");
    assert.deepEqual(asked, ["b-sent"], "and it is read again behind");
    const coldPage = page({ initialSegment: null, initialRun: "b-new" });
    const cold = byTestId(coldPage, "bc-detail");
    assert.ok(textOf(cold).includes("Reading who got it"), "a run never opened still says it is reading");
    assert.equal(paneTitle(coldPage), "Broadcast", "and has no name to say yet when the list has none for it");
    // The list's row has a name for it (b-sending is on the ledger), which the pane's head says while it reads.
    assert.equal(
      paneTitle(page({ initialSegment: null, initialRun: "b-sending" })),
      "Offers · 2026-09-15",
      "the name its row has, until the report says its own",
    );
  } finally {
    broadcasts.peekDetail = peekKept;
  }
});

test("REGRESSION (C23): a detail that could not be read says so with a Retry, and a link to a broadcast that is not here says that instead", async () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  asked.length = 0;
  answers.set("b-sent", [
    { ok: false, code: "network", status: 0, message: "offline" },
    { ok: true, data: detailOf(dto()) },
  ]);
  const props = { initialSegment: null, initialRun: "b-sent" };
  page(props);
  await settle();
  let tree = again(props);
  assert.ok(byTestId(tree, "bc-detail-failed"), "REGRESSION: 'Couldn't be read right now.' and nothing to press");
  press(byTestId(tree, "bc-detail-failed-retry"));
  again(props);
  await settle();
  tree = again(props);
  assert.equal(asked.filter((id) => id === "b-sent").length, 2, "Retry reads it again");
  assert.ok(textOf(byTestId(tree, "bc-detail")).includes("Rosa Díaz"), "and draws what it read");

  answers.set("b-elsewhere", [{ ok: false, code: "not_found", status: 404, message: "Broadcast not found." }]);
  const gone = { initialSegment: null, initialRun: "b-elsewhere" };
  page(gone);
  await settle();
  tree = again(gone);
  assert.ok(byTestId(tree, "bc-detail-gone"), "a broadcast that is not in this workspace is said to be not here");
  assert.equal(byTestId(tree, "bc-detail-failed"), null, "not offered a Retry that can only fail again");
});

test("REGRESSION (C23): an open detail keeps up while its broadcast is sending, and stops asking once it has sent", async () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  asked.length = 0;
  answers.set("b-sending", [
    {
      ok: true,
      data: detailOf(SENDING, [person({ state: "queued", message_status: null, sent_at: null, delivered_at: null })]),
    },
    { ok: true, data: detailOf(SENDING, [person()]) },
    { ok: false, code: "network", status: 0, message: "offline" },
    {
      ok: true,
      data: detailOf(dto({ id: "b-sending", name: "Offers · 2026-09-15", state: "sent" }), [
        person({ message_status: "read", read_at: iso(-1000) }),
      ]),
    },
  ]);
  const props = { initialSegment: null, initialRun: "b-sending" };
  const onSurfaceRead = async () => {
    globalThis.window.dispatchEvent({ type: "surface:broadcasts" });
    again(props);
    await settle();
    return again(props);
  };
  page(props);
  await settle();
  let tree = again(props);
  const pillOf = (t) =>
    textOf(
      find(byTestId(t, "bc-person"), (n) =>
        String(n.props?.className || "")
          .split(" ")
          .includes("bc-person-pill"),
      ),
    );
  const sentFigure = (t) =>
    textOf(find(byTestId(t, "bc-fig-sent"), (n) => String(n.props?.className).includes("bc-fig-v")));
  assert.deepEqual([pillOf(tree), sentFigure(tree)], ["Waiting", "0"], "one on its way");
  tree = await onSurfaceRead();
  assert.deepEqual(
    [pillOf(tree), sentFigure(tree)],
    ["Delivered", "1"],
    "REGRESSION: the detail never re-read while the send went out",
  );
  tree = await onSurfaceRead();
  assert.deepEqual(
    [pillOf(tree), sentFigure(tree)],
    ["Delivered", "1"],
    "a re-read that fails mid-send keeps what was read",
  );
  assert.equal(byTestId(tree, "bc-detail-failed"), null, "rather than a failure over it");
  await onSurfaceRead();
  const reads = asked.filter((id) => id === "b-sending").length;
  await onSurfaceRead();
  assert.equal(
    asked.filter((id) => id === "b-sending").length,
    reads,
    "sent, it has nothing left to change, and is not read again",
  );
});

test("REGRESSION (A21): Today's run rows open the run -- a run waiting for you opened Playbooks, and one about to send or sent today opened every broadcast", () => {
  const quiet = { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };
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
  const soon = dto({
    id: "b-soon",
    name: "Offers · 2026-09-15",
    state: "scheduled",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(20 * 60_000),
    audience: { kind: "playbook", id: "pb-2", label: "Offers" },
    playbook_id: "pb-2",
    counts: quiet,
  });
  const done = dto({ id: "b-done", name: "Save our number · 2026-09-15", state: "sent", started_at: iso(0) });
  setSurfaceValue("broadcasts", { rows: [waiting, soon, done].map((b) => toBroadcastVM(b, ZONE)) });
  setSurfaceValue("today", toTodayVM(metrics, [], [], [], new Date("2026-09-06T14:00:00Z")));
  try {
    fresh();
    const queue = AgentCommand();
    const run = byTestId(queue, "brief-run-row");
    const who = buttonsSaying(run, "See who's on it")[0];
    assert.ok(who, "REGRESSION: the run's second door was Open Playbooks");
    press(who);
    run.props.onClick();
    const next = byTestId(queue, "brief-run-soon");
    press(buttonsSaying(next, "Open")[0]);
    next.props.onClick();
    assert.deepEqual(
      went,
      ["broadcasts/run:b-wait", "broadcasts/run:b-wait", "broadcasts/run:b-soon", "broadcasts/run:b-soon"],
      "REGRESSION: Playbooks, and the page of every broadcast",
    );
    fresh();
    // What ran today is a line of the brief beside the queue (TodayBriefPane, canvas E3); it was a beat of the hero
    // above it, then of the day's card.
    const recap = TodayBriefPane();
    press(buttonsSaying(byTestId(recap, "brief-run-done"), "Open")[0]);
    assert.deepEqual(went, ["broadcasts/run:b-done"]);
  } finally {
    setSurfaceValue("today", undefined);
  }
});

/* ------------------------- what a playbook's detail shows ------------------------- */

test("REGRESSION (C10): a playbook's detail shows the words its runs send -- it named the template and never showed the message", () => {
  setSurfaceValue("playbooks", playbooksSurface());
  let tree = pane(playbook());
  const words = byTestId(tree, "pb-words");
  assert.ok(words, "REGRESSION: the template's name, and no words");
  assert.ok(
    textOf(words).includes("Hi Dani, it's been a while at Northside Studio. Come back for 10% off this week."),
    textOf(words),
  );
  // The whole message, with no press. It was two clamped lines behind a "Show the
  // whole message" toggle, under the trigger, the schedule, the audience, the
  // template's name and the next run -- the least prominent thing on a card whose
  // subject it is.
  assert.ok(byTestId(byTestId(tree, "pb-words"), "message-preview"), "the whole message, as the customer sees it");
  assert.equal(byTestId(tree, "pb-words-toggle"), null, "and nothing to press to see it");

  setSurfaceValue("playbooks", playbooksSurface({ templates: [] }));
  tree = pane(playbook());
  assert.equal(byTestId(tree, "pb-words"), null);
  assert.equal(
    textOf(byTestId(tree, "pb-template-gone")),
    MESSAGE_GONE_WORDS.card,
    "a message with no version a run can send is said, in contracts' words, true of a message on any channel: the runs skip it",
  );

  // A read of the templates that failed is not "no longer approved": the detail shows no words and calls nothing withdrawn.
  setSurfaceValue("playbooks", playbooksSurface({ templates: null }));
  tree = pane(playbook());
  assert.equal(byTestId(tree, "pb-words"), null);
  assert.equal(byTestId(tree, "pb-template-gone"), null, "a failed read does not call its template withdrawn");
});

test("REGRESSION (C16): Skip this run asks first, as Broadcasts does -- it skipped on one click", async () => {
  const skipped = [];
  const skipKept = playbooks.skipRun;
  playbooks.skipRun = async (id) => {
    skipped.push(id);
    return { ok: true, data: {} };
  };
  setSurfaceValue("playbooks", playbooksSurface());
  const p = playbook({
    totals: { ...playbook().totals, waiting: { id: "b-wait", recipient_count: 3, name: "Win-back · 2026-09-15" } },
  });
  let tree = pane(p);
  press(byTestId(tree, "pb-skip"));
  assert.deepEqual(skipped, [], "REGRESSION: one click skipped the run");
  tree = redraw(p);
  assert.ok(textOf(byTestId(tree, "pb-skip-confirm")).includes("Skip this run of Win-back?"));
  assert.equal(byTestId(tree, "pb-approve"), null, "while it asks, Approve steps aside");
  assert.equal(byTestId(tree, "pb-delete-confirm"), null, "and the delete's question stays its own");
  await press(byTestId(tree, "pb-skip-yes"));
  playbooks.skipRun = skipKept;
  assert.deepEqual(skipped, ["b-wait"]);
});

test("REGRESSION (C18): a visit reminder's detail shows its policy chip -- its class, booking, was looked up as a row id", () => {
  globalThis.window.__POLICIES = { role: "owner", rows: [{ class: "booking", mode: "auto", limits: {} }] };
  try {
    setSurfaceValue("playbooks", playbooksSurface());
    const tree = pane(
      playbook({
        id: "pb-v",
        name: "Visit reminder",
        trigger: "visit_tomorrow",
        policy_class: "booking",
        triggerLabel: "Visit tomorrow",
      }),
    );
    const chip = find(tree, (n) => n.type === globalThis.PolicyChip);
    assert.ok(chip && chip.rendered, "REGRESSION: no chip at all");
    assert.equal(
      textOf(chip.rendered),
      `${POLICY_CLASS_WORDS.booking.short} · ${POLICY_MODE_WORDS.auto.chip}`,
      "the chip says what the mode does, not how it is filed",
    );
  } finally {
    delete globalThis.window.__POLICIES;
  }
});

test("REGRESSION (C19): with no approved template, the composer's hint opens Messages -- it named the page in plain words", () => {
  // A workspace with no playbook and no approved template, and the home's composer on Every time a moment comes.
  setSurfaceValue("playbooks", { ...playbooksSample(new Date(NOW)), rows: [], templates: [] });
  const tree = homeAt("new:every");
  const hint = byTestId(tree, "pb-no-template");
  assert.ok(hint, "the composer is open on a workspace with no template");
  // A door is a link inside its sentence: its address in the href, the app's own way there on a press. As a button it took
  // the touch floor's 44px and broke the sentence on a phone (7 Oct 2026).
  const door = find(hint, (n) => n.type === "a");
  assert.ok(door, "REGRESSION: 'Campaigns › Messages' as words");
  assert.match(door.props.href, /messages$/, "the Library's own address, for a new tab or a long press");
  press(door);
  assert.deepEqual(went, ["messages"]);
});

test("REGRESSION (C7): Run now says when the run really goes -- it said 'sending now' over a run the server moved to nine", async () => {
  setSurfaceValue("playbooks", playbooksSurface());
  const runKept = playbooks.runNow;
  playbooks.runNow = async () => ({
    ok: true,
    data: {
      id: "pb-1",
      outcome: "sent",
      eligible: 3,
      broadcast_id: "b-new",
      name: "Win-back",
      scheduled_for: iso(10 * H),
      moved_from: iso(0),
    },
  });
  toasts.length = 0;
  moreItem(pane(playbook()), "Run now").onSelect();
  await settle();
  let said = textOf(toasts.at(-1).msg);
  assert.ok(said.includes("scheduled for"), `REGRESSION: ${said}`);
  assert.ok(!said.includes("sending now"), said);

  // A dashboard deployed ahead of its edge gets no time back, and does not claim one.
  playbooks.runNow = async () => ({
    ok: true,
    data: { id: "pb-1", outcome: "sent", eligible: 3, broadcast_id: "b-new", name: "Win-back" },
  });
  moreItem(pane(playbook()), "Run now").onSelect();
  await settle();
  said = textOf(toasts.at(-1).msg);
  playbooks.runNow = runKept;
  assert.ok(!/\bnow\b/.test(said), said);
});

test("A playbook's detail says what its runs earned as one sentence, and nothing when it has not run", () => {
  setSurfaceValue("playbooks", playbooksSurface());
  // Five numbers with dots between them became a sentence, the way Today,
  // Reports and People say theirs; each run below still says its own.
  const words = textOf(byTestId(pane(playbook()), "pb-results"))
    .replace(/\s+/g, " ")
    .trim();
  assert.equal(words, "2 runs so far: 6 sent, 4 delivered, 1 wrote back.");
  // A held-back count only when there is one to say.
  const held = textOf(byTestId(pane(playbook({ totals: { ...playbook().totals, held: 3 } })), "pb-results"));
  assert.ok(held.includes("3 held back"), held);
  // And a playbook that has never run claims no numbers at all.
  assert.equal(byTestId(pane(playbook({ totals: { ...playbook().totals, runs: 0 } })), "pb-results"), null);
});

test("A playbook's detail leads with what it sends, not with how it is configured", () => {
  setSurfaceValue("playbooks", playbooksSurface());
  const tree = pane(playbook());
  // The trigger, the schedule, the audience and the next run were five chips and
  // a meta line above the message; they are one sentence beside it now.
  const facts = textOf(find(tree, (n) => String(n.props?.className || "") === "ob-sentence")).replace(/\s+/g, " ");
  for (const part of ["on the list said yes", "Next run"]) assert.ok(facts.includes(part), facts);
  // The trigger's hint is a CONDITION -- contracts PLAYBOOK_TRIGGERS say "Nothing
  // heard in 30 days", "Only ever phoned, never texted" -- so it leads. "Goes to"
  // in front of one read as broken English on five of the six, in production.
  assert.ok(!facts.includes("Goes to"), facts);
  const hint = PLAYBOOK_TRIGGERS.find((t) => t.id === "quiet_30").hint;
  const real = textOf(
    find(pane(playbook({ triggerHint: hint })), (n) => String(n.props?.className || "") === "ob-sentence"),
  ).replace(/\s+/g, " ");
  assert.ok(real.startsWith(`${hint} —`), real);
  assert.equal(
    find(tree, (n) => String(n.props?.className || "").includes("ob-audience")),
    null,
    "no chip row above the message",
  );
  // The audience is still a door to the people it means.
  press(byTestId(tree, "pb-audience"));
  assert.match(went.at(-1), /^clients\/seg:/);
});

test("REGRESSION: a playbook whose yes has no number says so and offers no QR -- its card said '0 people on the list said yes' and sent the owner for an answer they had", async () => {
  // The chain, run: the route's pools (server/campaigns/playbook-pools.ts triggerPools), the surface the bridge builds from them,
  // the words and the door the detail imports (playbooks/words.tsx), and the pane that draws them.
  const empty = { candidates: 0, held: 0, pool: 0, noYes: 0, stopped: 0, noNumber: 0, saidYes: 0 };
  const pools = {
    ...Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, empty])),
    // One wrote by email and said yes to offers; the other has a number and never said it: nobody can be sent a run.
    quiet_30: { ...empty, pool: 2, noYes: 1, noNumber: 1, saidYes: 1 },
    // Two with numbers, and neither said yes to offers.
    new_week: { ...empty, pool: 2, noYes: 2 },
  };
  // The route's row: the fixture less what the surface adds to it (its words and its pools).
  const surfaceOnly = new Set(["triggerLabel", "triggerHint", "schedule", "next", "candidates", "held"]);
  const route = Object.fromEntries(Object.entries(playbook()).filter(([k]) => !surfaceOnly.has(k)));
  const rows = [
    { ...route, id: "pb-quiet", trigger: "quiet_30" },
    { ...route, id: "pb-new", name: "Welcome", trigger: "new_week", policy_class: "campaign" },
    // Nobody the moment names at all.
    { ...route, id: "pb-phoned", name: "Save our number", trigger: "phoned_only" },
  ];
  const answer = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  const kept = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/playbooks") return answer({ playbooks: rows, pools, timezone: ZONE, calendar: "none" });
    if (path === "/api/v1/templates") return answer({ templates: [TEMPLATE] });
    if (path === "/api/v1/channels") return answer({ channels: [] });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
  };
  try {
    await playbooksOverride.apply();
    const drawn = (id) => pane(surfaceValue("playbooks").rows.find((p) => p.id === id));
    const sentence = (tree) =>
      textOf(find(tree, (n) => String(n.props?.className || "") === "ob-sentence")).replace(/\s+/g, " ");
    const hint = PLAYBOOK_TRIGGERS.find((t) => t.id === "quiet_30").hint;
    const noNumber = drawn("pb-quiet");
    assert.ok(
      sentence(noNumber).includes(`${hint} — 1 person on the list said yes to offers, with no number to send to.`),
      `REGRESSION: ${sentence(noNumber)}`,
    );
    assert.ok(/Next run .+ — nobody to send to\./.test(sentence(noNumber)), sentence(noNumber));
    assert.equal(byTestId(noNumber, "pb-reach-door"), null, "REGRESSION: the QR asked for an answer they had given");
    // Nobody on it said yes: its count is true, and the door to that yes stands.
    const noYes = drawn("pb-new");
    assert.ok(sentence(noYes).includes("— 0 people on the list said yes."), sentence(noYes));
    assert.equal(textOf(byTestId(noYes, "pb-reach-door")), "Get their yes");
    press(byTestId(noYes, "pb-reach-door"));
    assert.equal(went.at(-1), "broadcasts/get-yes", "and getting it is one press from the playbook's detail");
    // Nobody on it at all: there is no yes to get.
    assert.equal(byTestId(drawn("pb-phoned"), "pb-reach-door"), null);
  } finally {
    globalThis.fetch = kept;
  }
});

test("REGRESSION: a playbook's list that could not be read is not called deleted, and one of People's is named by contracts (decision 0009)", async () => {
  const empty = { candidates: 0, held: 0, pool: 0, noYes: 0, stopped: 0, noNumber: 0, saidYes: 0 };
  const pools = Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, empty]));
  const surfaceOnly = new Set(["triggerLabel", "triggerHint", "schedule", "next", "candidates", "held"]);
  const route = Object.fromEntries(Object.entries(playbook()).filter(([k]) => !surfaceOnly.has(k)));
  const rows = [
    { ...route, id: "pb-own", trigger: "saved_list", list_id: "l1", list_key: null },
    { ...route, id: "pb-people", trigger: "saved_list", list_id: null, list_key: "lapsed" },
  ];
  const answer = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  const fetchKept = globalThis.fetch;
  // The route's reads of the lists failed: its own lists null, People's none.
  globalThis.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/playbooks")
      return answer({ playbooks: rows, pools, timezone: ZONE, calendar: "none", lists: null, people_lists: [] });
    if (path === "/api/v1/templates") return answer({ templates: [TEMPLATE] });
    if (path === "/api/v1/channels") return answer({ channels: [] });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
  };
  try {
    await playbooksOverride.apply();
    const label = (id) => surfaceValue("playbooks").rows.find((p) => p.id === id).triggerLabel;
    assert.equal(
      label("pb-own"),
      "A list that could not be read",
      "REGRESSION: a failed read said the list was deleted",
    );
    assert.equal(label("pb-people"), "Lapsed", "a built-in is never deleted: contracts names it");
  } finally {
    globalThis.fetch = fetchKept;
  }
});

test("a playbook on an archived list says so in its detail, one press from its list coming back, and no new playbook is offered the list (00169)", async () => {
  const empty = { candidates: 0, held: 0, pool: 0, noYes: 0, stopped: 0, noNumber: 0, saidYes: 0 };
  const pools = {
    ...Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, empty])),
    "list:l1": empty,
    "list:l2": empty,
  };
  const surfaceOnly = new Set(["triggerLabel", "triggerHint", "schedule", "next", "candidates", "held"]);
  const route = Object.fromEntries(Object.entries(playbook()).filter(([k]) => !surfaceOnly.has(k)));
  const rows = [
    {
      ...route,
      id: "pb-vip",
      name: "VIP offer",
      trigger: "saved_list",
      list_id: "l1",
      list_key: null,
      state: "paused",
    },
  ];
  const kept = [
    { id: "l1", name: "VIP", smart: false, archived: true },
    { id: "l2", name: "Regulars", smart: false, archived: false },
    // About whoever is looking: a playbook's run has no one looking, so it is offered to none.
    { id: "l3", name: "Mine", smart: true, archived: false, viewer: true },
  ];
  const answer = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  const fetchKept = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/playbooks")
      return answer({ playbooks: rows, pools, timezone: ZONE, calendar: "none", lists: kept, people_lists: [] });
    if (path === "/api/v1/templates") return answer({ templates: [TEMPLATE] });
    if (path === "/api/v1/channels") return answer({ channels: [] });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
  };
  const restored = [];
  globalThis.window.__lists = {
    restore: async (id) => {
      restored.push(id);
      return { ok: true, data: {} };
    },
  };
  try {
    await playbooksOverride.apply();
    const P = surfaceValue("playbooks");
    assert.equal(P.rows[0].listArchived, true);
    assert.deepEqual(
      P.lists.filter((l) => !l.builtin).map((l) => l.id),
      ["list:l2"],
      "an archived list is offered to no new playbook",
    );
    const drawn = pane(P.rows[0]);
    const sentence = textOf(find(drawn, (n) => String(n.props?.className || "") === "ob-sentence")).replace(
      /\s+/g,
      " ",
    );
    assert.ok(sentence.includes("Paused — its list, VIP, is archived."), sentence);
    await press(byTestId(drawn, "pb-list-restore"));
    await settle();
    assert.deepEqual(restored, ["l1"]);
    assert.match(textOf(toasts.at(-1).msg), /^VIP is back; resume the playbook when you want it running/);
  } finally {
    delete globalThis.window.__lists;
    globalThis.fetch = fetchKept;
  }
});

test("REGRESSION: counts that could not be read are said as such, and nothing draws a zero it never counted -- a People read that failed drew '0 of 0', 'nobody to send to' and the QR on every card", async () => {
  // The route's answer when its People read failed (server/campaigns/playbook-pools.ts triggerPools): no moment was counted.
  const pools = Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, null]));
  const surfaceOnly = new Set(["triggerLabel", "triggerHint", "schedule", "next", "candidates", "held"]);
  const route = Object.fromEntries(Object.entries(playbook()).filter(([k]) => !surfaceOnly.has(k)));
  const answer = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  const kept = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/playbooks") return answer({ playbooks: [route], pools, timezone: ZONE, calendar: "none" });
    if (path === "/api/v1/templates") return answer({ templates: [TEMPLATE] });
    if (path === "/api/v1/channels") return answer({ channels: [] });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
  };
  try {
    await playbooksOverride.apply();
    // The home says what it knows -- its moments, and the win-back's next run -- and draws no figure it never counted: a
    // moment has "—" where it has no number, and its next run says it could not be counted, never "Nobody".
    // (Its Coming up is made of the broadcasts' read too, here read and holding no run: unread, it would say it is reading.)
    const home = homeAt(null, broadcastsSurface({ rows: [], number: { present: true } }));
    const stages = all(home, (n) => n.props?.["data-testid"] === "cmh-stage");
    assert.ok(stages.length > 0);
    for (const s of stages) assert.equal(textOf(byTestId(s, "cmh-people")), "—", `REGRESSION: ${textOf(s)}`);
    const coming = textOf(byTestId(home, "cmh-coming"));
    assert.ok(coming.includes("Who it reaches could not be counted"), coming);
    assert.ok(!/nobody|\b0 of\b/i.test(coming), `REGRESSION: ${coming}`);
    // The playbook's detail says what it knows -- the moment, the clock, the next run -- and no count, no reach, no door.
    const opened = pane(surfaceValue("playbooks").rows[0]);
    const said = textOf(find(opened, (n) => String(n.props?.className || "") === "ob-sentence")).replace(/\s+/g, " ");
    assert.ok(/Next run/.test(said), said);
    assert.ok(!said.includes("on the list said yes") && !said.includes("nobody to send to"), `REGRESSION: ${said}`);
    assert.equal(byTestId(opened, "pb-reach-door"), null);
    // Nor does the composer, where a moment is picked by who it reaches.
    const composing = homeAt("new:every");
    // Its "Who it's for" section (the sheet around it is the record kit's, not loaded here).
    const who = byTestId(composing, "pb-who");
    assert.ok(who, "the composer opens");
    assert.equal(byTestId(who, "pb-reach"), null, "REGRESSION: the composer drew '0 of 0'");
    // And its moments, listed in the kit's Picker: none says how many it reaches today.
    const options = pickerOf(who, "pb-moment").props.groups.flatMap((g) => g.options);
    assert.ok(options.length > 0, "the moments are listed");
    for (const o of options)
      assert.ok(!/nobody today|\d+ today/i.test(`${o.label} ${o.sub ?? ""} ${o.meta ?? ""}`), `REGRESSION: ${o.meta}`);
  } finally {
    globalThis.fetch = kept;
  }
});

test("A paused playbook says it is paused, and a run's day is words", () => {
  setSurfaceValue("playbooks", playbooksSurface());
  // `nextRunLabel` returns the literal "paused" when it is, and the card read
  // "Next run paused" -- seen in production on the month's offer.
  const off = textOf(
    find(
      pane(playbook({ state: "paused", next: "paused" })),
      (n) => String(n.props?.className || "") === "ob-sentence",
    ),
  ).replace(/\s+/g, " ");
  assert.ok(off.includes("Paused — nothing runs until you resume it."), off);
  assert.ok(!off.includes("Next run paused"), off);

  // A run's day is a calendar day, not an instant: it was printed as its raw key.
  const on = textOf(
    find(pane(playbook({ last_run_for: "2026-08-25" })), (n) => String(n.props?.className || "") === "ob-sentence"),
  ).replace(/\s+/g, " ");
  assert.ok(on.includes(`Last ran ${fmtDay("2026-08-25")}.`), on);
  assert.ok(!on.includes("2026-08-25"), on);
  // And in every row of its history, which said the key too.
  const hist = textOf(byTestId(pane(playbook()), "pb-history"));
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(hist), hist);

  // A list with people on it that offers nobody says why: one message per person
  // per week, across playbooks. A bare "0 people" read as broken.
  const held = textOf(
    find(pane(playbook({ candidates: 0, held: 2 })), (n) => String(n.props?.className || "") === "ob-sentence"),
  ).replace(/\s+/g, " ");
  assert.ok(held.includes("0 people on the list said yes, and 2 people more heard from you this week and wait"), held);
});

test("a proposal follow-up's detail (0006): where deals are on, who it reaches with a proposal waiting; where they are off, why it runs nothing, and no count it never took", async () => {
  const { FOLLOW_UP_NEEDS_DEALS } = await import("@chanlytics/contracts");
  const empty = { candidates: 0, held: 0, pool: 0, noYes: 0, stopped: 0, noNumber: 0, saidYes: 0 };
  const surfaceOnly = new Set(["triggerLabel", "triggerHint", "schedule", "next", "candidates", "held"]);
  const route = Object.fromEntries(Object.entries(playbook()).filter(([k]) => !surfaceOnly.has(k)));
  const follow = {
    ...route,
    id: "pb-follow",
    name: "Proposal follow-up",
    trigger: "proposal_waiting",
    policy_class: "follow_up",
    params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }],
  };
  const answer = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  const kept = globalThis.fetch;
  // The route's answer (server/campaigns/playbook-pools.ts triggerPools): the moment counted where deals are on, and not where they
  // are off, when it runs nothing.
  const read = async (dealsOn) => {
    const pools = {
      ...Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, empty])),
      proposal_waiting: dealsOn ? { ...empty, pool: 3, candidates: 2, noYes: 1, saidYes: 2 } : null,
    };
    globalThis.fetch = async (url) => {
      const path = new URL(String(url), "https://app.chanlytics.com").pathname;
      if (path === "/api/v1/playbooks")
        return answer({ playbooks: [follow], pools, timezone: ZONE, calendar: "none", deals_on: dealsOn });
      if (path === "/api/v1/templates") return answer({ templates: [TEMPLATE] });
      if (path === "/api/v1/channels") return answer({ channels: [] });
      return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
    };
    await playbooksOverride.apply();
    return surfaceValue("playbooks");
  };
  try {
    const sentence = (tree) =>
      textOf(find(tree, (n) => String(n.props?.className || "") === "ob-sentence")).replace(/\s+/g, " ");
    const on = await read(true);
    assert.ok(
      on.triggers.some((t) => t.id === "proposal_waiting"),
      "offered where deals are on",
    );
    const drawnOn = sentence(pane(on.rows[0]));
    assert.ok(drawnOn.includes("— 2 people with a proposal waiting said yes."), drawnOn);
    assert.ok(drawnOn.includes("once per proposal") && /Next run /.test(drawnOn), drawnOn);
    const off = await read(false);
    assert.deepEqual(
      [off.triggers.some((t) => t.id === "proposal_waiting"), off.countsRead],
      [false, true],
      "not offered, and no moment said to be uncounted",
    );
    assert.equal(off.rows[0].off, FOLLOW_UP_NEEDS_DEALS);
    const drawnOff = sentence(pane(off.rows[0]));
    assert.ok(
      drawnOff.includes(FOLLOW_UP_NEEDS_DEALS) && !/Next run|nobody to send to/.test(drawnOff),
      `why it runs nothing, never a zero it did not count: ${drawnOff}`,
    );
  } finally {
    globalThis.fetch = kept;
  }
});

test("a playbook's card does not approve a run whose day has passed: the verb would refuse it, and Skip is the act left", async () => {
  const approved = [];
  const keep = playbooks.approveRun;
  playbooks.approveRun = async (id) => {
    approved.push(id);
    return { ok: true, data: { recipient_count: 3, scheduled_for: iso(0), moved_from: null } };
  };
  setSurfaceValue("playbooks", playbooksSurface());
  // The list read carries the waiting run's own day and moment (server playbooks.ts): what the verb's rule reads.
  const waitingFor = (run_for) =>
    playbook({
      totals: {
        ...playbook().totals,
        waiting: { id: "b-wait", recipient_count: 3, name: "Win-back · 2026-09-15", run_for, trigger: "quiet_30" },
      },
    });
  try {
    let tree = pane(waitingFor("2026-09-10"));
    press(byTestId(tree, "pb-approve"));
    await settle();
    assert.deepEqual(approved, [], "REGRESSION: Approve on a run made for a day that has passed, answered 409");
    assert.ok(byTestId(tree, "pb-skip"), "Skip is still offered");
    tree = pane(waitingFor(globalThis.window.__clock.dayKey(Date.now())));
    press(byTestId(tree, "pb-approve"));
    await settle();
    assert.deepEqual(approved, ["b-wait"], "today's run is approved as ever");
    // A read from before the list carried the run's day says nothing of it, and is approved as it was.
    approved.length = 0;
    tree = pane(waitingFor(undefined));
    press(byTestId(tree, "pb-approve"));
    await settle();
    assert.deepEqual(approved, ["b-wait"]);
  } finally {
    playbooks.approveRun = keep;
  }
});

test("a playbook's card does not approve a run while the workspace is paused, and its skip says what the server stopped", async () => {
  const approved = [];
  const keepApprove = playbooks.approveRun;
  const keepSkip = playbooks.skipRun;
  playbooks.approveRun = async (id) => {
    approved.push(id);
    return { ok: true, data: { recipient_count: 3, scheduled_for: iso(0), moved_from: null } };
  };
  const open = {
    whatsapp: { ready: true, why: null },
    sms: { ready: false, why: "x" },
    email: { ready: false, why: "y" },
  };
  const waiting = playbook({
    totals: {
      ...playbook().totals,
      waiting: {
        id: "b-wait",
        recipient_count: 3,
        name: "Win-back · 2026-09-15",
        run_for: globalThis.window.__clock.dayKey(Date.now()),
        trigger: "quiet_30",
      },
    },
  });
  try {
    // Paused for billing: the approve door answers 402, so the card's Approve presses nothing (it says the pause, as a
    // late run's says its day), and Skip is the act left. The one reading Coming up's line reads (waitingRunOffer).
    setSurfaceValue("playbooks", playbooksSurface({ ready: { ...open, paused: true } }));
    let tree = pane(waiting);
    press(byTestId(tree, "pb-approve"));
    await settle();
    assert.deepEqual(approved, [], "an Approve the server would refuse with 402");
    assert.ok(byTestId(tree, "pb-skip"), "Skip is still offered");
    // Not paused: today's run is approved as ever.
    setSurfaceValue("playbooks", playbooksSurface({ ready: open }));
    tree = pane(waiting);
    press(byTestId(tree, "pb-approve"));
    await settle();
    assert.deepEqual(approved, ["b-wait"]);
    // The skip's receipt is the server's answer: a run that waited closes unsent; one a teammate approved a moment
    // before is going, and the card does not say nothing will send of it.
    for (const [was, said] of [
      ["pending_approval", "Win-back skipped — nothing will send"],
      ["sending", "Win-back stops after this batch"],
    ]) {
      playbooks.skipRun = async () => ({ ok: true, data: { was } });
      toasts.length = 0;
      tree = pane(waiting);
      press(byTestId(tree, "pb-skip"));
      tree = redraw(waiting);
      await press(byTestId(tree, "pb-skip-yes"));
      await settle();
      assert.equal(textOf(toasts.at(-1).msg), said);
    }
  } finally {
    playbooks.approveRun = keepApprove;
    playbooks.skipRun = keepSkip;
  }
});

test("a playbook's detail finds its message by its name and language through the surface's own read: a WhatsApp version added since moved the id the message is offered by", async () => {
  const empty = { candidates: 0, held: 0, pool: 0, noYes: 0, stopped: 0, noNumber: 0, saidYes: 0 };
  const pools = Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, empty]));
  const surfaceOnly = new Set(["triggerLabel", "triggerHint", "schedule", "next", "candidates", "held"]);
  const route = Object.fromEntries(Object.entries(playbook()).filter(([k]) => !surfaceOnly.has(k)));
  // Made when the message had an email version alone, its stored template_id that row's. A WhatsApp version added since is the
  // message's anchor, so the composers' read offers it by the WhatsApp row's id.
  const stored = { ...route, id: "pb-quiet", trigger: "quiet_30", template_id: "tpl-email" };
  const version = (channel) => ({
    ...TEMPLATE,
    id: `tpl-${channel === "whatsapp" ? "wa" : channel}`,
    channel,
    header: channel === "email" ? "Come back" : null,
    blocked: null,
    hidden_at: null,
    source: "chanlytics",
  });
  const rows = [version("whatsapp"), version("email")];
  const answer = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  const kept = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/playbooks") return answer({ playbooks: [stored], pools, timezone: ZONE, calendar: "none" });
    if (path === "/api/v1/templates") return answer({ templates: rows, messages: campaignMessagesOf(rows) });
    if (path === "/api/v1/channels") return answer({ channels: [] });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
  };
  try {
    await playbooksOverride.apply();
    const P = surfaceValue("playbooks");
    assert.deepEqual(
      P.templates.map((t) => [t.id, t.name, t.channels]),
      [["tpl-wa", "winback_offer", ["whatsapp", "email"]]],
      "one message, offered by its anchor's id, holding both its versions",
    );
    const tree = pane(P.rows[0]);
    assert.ok(byTestId(tree, "pb-words"), "its words are drawn: the message is found by its name and language");
    assert.equal(byTestId(tree, "pb-template-gone"), null, "and it is not called gone for an id that moved");
  } finally {
    globalThis.fetch = kept;
  }
});
