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
 * sheet). The composer's Every time, and its no-template hint, went (the closed-loop audit of 17 Oct 2026, G).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toBroadcastVM, toTodayVM, stateOf, PLAYBOOK_TRIGGERS, campaignMessagesOf } from "@chanlytics/contracts";
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
  // On, before its last day, its moment one that runs here (contracts campaignRunsOn): Run now is offered.
  runs: true,
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
/**
 * What the settings surface publishes of the templates, the one read of them (offered-templates.ts): the playbooks surface asks for
 * no GET templates of its own and is made of it, so a test that reads the surface publishes the rows here first.
 */
const settingsOf = (rows) => ({
  templatesAll: rows.filter((r) => r.channel === "whatsapp"),
  templateVersions: rows.filter((r) => r.channel !== "whatsapp"),
  messages: campaignMessagesOf(rows),
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
const { TodayGoing } = await import(`${S}/surfaces/today/pages/going-today.tsx`);
// The moved surfaces: TSX, drawn over the values the seam holds, their verbs imported.
const { BroadcastSend, BroadcastRun } = await import(`${S}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { Picker } = await import(`${S}/surfaces/kit/picker/picker.tsx`);
/** One of the composer's choices, the kit's Picker (surfaces/kit/picker/), by its test id. */
const pickerOf = (tree, testid) => find(tree, (n) => n.type === Picker && n.props["data-testid"] === testid);
const { broadcasts } = await import(`${S}/surfaces/campaigns/broadcasts/verbs.ts`);
const { playbooksOverride } = await import(`${S}/surfaces/campaigns/playbooks/surface.ts`);
// The broadcasts surface's module declares where its value is mirrored (`window.__BROADCASTS`, which Today's queue reads);
// the app loads it with every override, and no page this file draws imports it any more.
await import(`${S}/surfaces/campaigns/broadcasts/surface.ts`);
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
      message: "Run not found.",
    }
  );
};
/**
 * A run's one screen at its home (`initialRun`: BroadcastRun, the Campaigns wiring review's lane 2), else the send screen as
 * New's Send once hosts it, on the list named (lane 6): Sent's page, which held both beside Sequences' list, went with its
 * mount.
 */
const screen = (props) =>
  props.initialRun
    ? BroadcastRun({ id: props.initialRun })
    : BroadcastSend({
        data: surfaceValue("broadcasts"),
        initialSegment: props.initialSegment ?? null,
        flash() {},
        onDone() {},
        onYes() {},
      });
const page = (props) => {
  fresh();
  return screen(props);
};
const again = (props) => drawAgain(() => screen(props));
/* ------------------------------- a run's own door ------------------------------- */

test("REGRESSION (C9): a link to a run opens it on its sheet -- its report on a screen of its own, as the canvas draws it, whether the read holds it or not", async () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  answers.set("b-sent", [{ ok: true, data: detailOf(dto()) }]);
  // A run is opened from its sequence's History, a bell row, Today or Ask's card, each a link to its home under its
  // sequence (contracts runRoute, the Campaigns wiring review's lane 2).
  const listed = { initialSegment: null, initialRun: "b-sent" };
  page(listed);
  await settle();
  let tree = again(listed);
  const details = all(tree, (n) => n.props?.["data-testid"] === "bc-detail");
  assert.equal(details.length, 1);
  assert.equal(
    byTestId(tree, "bc-run-solo").props.id,
    "bc-run-b-sent",
    "the screen a link lands on carries the run's anchor",
  );
  // The report is a pane (Sequences draws it beside its list at the run's home), its head (a CmPane's) saying the run's
  // name and state.
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
    "campaigns/sequences",
    "closing is a link too, onto Sequences, so the address never names a run that is not open",
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

test("the send screen follows its link rather than starting again: a later link to a list picks it, and a re-read keeps a choice made", () => {
  setSurfaceValue("broadcasts", broadcastsSurface());
  // The list the send is for is the kit's picker's token (the chips are gone): the label of the option chosen.
  const chosen = (tree) => {
    const p = pickerOf(tree, "bc-audience");
    return p.props.groups.flatMap((g) => g.options).find((o) => o.value === p.props.value).label;
  };
  let tree = page({ initialSegment: "s1", initialRun: null });
  assert.ok(chosen(tree).startsWith("Regulars"));
  again({ initialSegment: "s2", initialRun: null });
  tree = again({ initialSegment: "s2", initialRun: null });
  assert.ok(chosen(tree).startsWith("Walk-ins"), "a later link to another list picks that list");
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
    assert.equal(paneTitle(coldPage), "Run", "and has no name to say yet when the list has none for it");
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

  answers.set("b-elsewhere", [{ ok: false, code: "not_found", status: 404, message: "Run not found." }]);
  const gone = { initialSegment: null, initialRun: "b-elsewhere" };
  page(gone);
  await settle();
  tree = again(gone);
  assert.ok(byTestId(tree, "bc-detail-gone"), "a broadcast that is not in this workspace is said to be not here");
  assert.equal(byTestId(tree, "bc-detail-failed"), null, "not offered a Retry that can only fail again");
});

test("REGRESSION (C23, X2-2): an open detail keeps up while its broadcast is sending and for the reply window after it sent, and stops asking once that has closed", async () => {
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
      // Sent a moment ago: the replies, yeses and stops counted to it arrive for three days yet.
      data: detailOf(
        dto({
          id: "b-sending",
          name: "Offers · 2026-09-15",
          state: "sent",
          started_at: iso(-60_000),
          finished_at: iso(-1000),
        }),
        [person({ message_status: "read", read_at: iso(-1000) })],
      ),
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
    reads + 1,
    "REGRESSION (X2-2): sent, its replies still count to it, and it is read again as Sent's runs are",
  );

  // A run that ended longer ago than the reply window has nothing left to change: it is not read again.
  answers.set("b-sent", [{ ok: true, data: detailOf(dto(), [person()]) }]);
  const old = { initialSegment: null, initialRun: "b-sent" };
  page(old);
  await settle();
  again(old);
  const before = asked.filter((id) => id === "b-sent").length;
  for (let i = 0; i < 2; i += 1) {
    globalThis.window.dispatchEvent({ type: "surface:broadcasts" });
    again(old);
    await settle();
  }
  assert.equal(asked.filter((id) => id === "b-sent").length, before, "ended five days ago, it is history");
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
    assert.deepEqual(
      went,
      ["campaigns/sequences/b-wait/runs/b-wait", "campaigns/sequences/b-wait/runs/b-wait"],
      "REGRESSION: Playbooks",
    );
    // The run about to send is Going today's row (decision 0064), above the queue: it opens its run too.
    fresh();
    const next = byTestId(TodayGoing(), "today-going-row");
    next.props.onClick();
    assert.deepEqual(went, ["campaigns/sequences/b-soon/runs/b-soon"], "REGRESSION: the page of every broadcast");
    fresh();
    // What ran today is a line of the brief beside the queue (TodayBriefPane, canvas E3); it was a beat of the hero
    // above it, then of the day's card.
    const recap = TodayBriefPane();
    press(buttonsSaying(byTestId(recap, "brief-run-done"), "Open")[0]);
    assert.deepEqual(went, ["campaigns/sequences/b-done/runs/b-done"]);
  } finally {
    setSurfaceValue("today", undefined);
  }
});

/* ------------------------- what a playbook's detail shows ------------------------- */

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
    if (path === "/api/v1/channels") return answer({ channels: [] });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
  };
  try {
    setSurfaceValue("settings", settingsOf([TEMPLATE]));
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

test("D1-run-words: a run still to come is stopped on Today's Going today as Sent cancels it -- the same question first, the same words after (decision 0064)", async () => {
  const quiet = { queued: 3, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };
  const soon = dto({
    id: "b-soon",
    name: "Offers · 2026-09-15",
    run_for: "2026-09-15",
    state: "scheduled",
    started_at: null,
    finished_at: null,
    scheduled_for: iso(20 * 60_000),
    audience: { kind: "playbook", id: "pb-2", label: "Offers" },
    playbook_id: "pb-2",
    counts: quiet,
  });
  setSurfaceValue("broadcasts", { rows: [toBroadcastVM(soon, ZONE)] });
  setSurfaceValue("today", toTodayVM(metrics, [], [], [], new Date("2026-09-06T14:00:00Z")));
  const cancelled = [];
  const keep = { verbs: globalThis.window.__broadcasts, toast: globalThis.window.usePPToast };
  globalThis.window.__broadcasts = {
    cancel: async (id, opts) => {
      cancelled.push(id);
      opts?.onAccepted?.({ was: "scheduled" });
      return { ok: true };
    },
    approve: async () => ({ ok: true }),
  };
  toasts.length = 0;
  globalThis.window.usePPToast = () => [null, (t) => toasts.push(t)];
  try {
    fresh();
    let band = TodayGoing();
    const row = byTestId(band, "today-going-row");
    // Its one verb is the wait rule's Stop, and its sentence says when it goes unless it is stopped.
    assert.match(textOf(row), /3 people\. Goes at .+ unless you stop it\./);
    assert.equal(buttonsSaying(row, "Cancel").length, 0, "one word for it: Stop");
    press(buttonsSaying(row, "Stop")[0]);
    assert.deepEqual(cancelled, [], "a press asks; it does not cancel");
    // The question Sent asks before the same cancel (contracts runStopWords), in the kit's Confirm under the row.
    band = drawAgain(TodayGoing);
    const ask = byTestId(band, "today-going-stop-confirm");
    assert.ok(ask, "REGRESSION: Today canceled a scheduled run at one tap, where Sent asks first");
    assert.ok(textOf(ask).includes("Cancel Offers?") && textOf(ask).includes("Nothing will send."), textOf(ask));
    assert.equal(textOf(byTestId(band, "today-going-stop-yes")).trim(), "Yes, cancel it");
    // No keeps it as it was.
    press(byTestId(band, "today-going-stop-no"));
    band = drawAgain(TodayGoing);
    assert.equal(byTestId(band, "today-going-stop-confirm"), null);
    assert.deepEqual(cancelled, []);
    // Yes cancels it, and says what Sent says of a run canceled (runStoppedWords), not "stopped: nothing sends".
    press(buttonsSaying(byTestId(band, "today-going-row"), "Stop")[0]);
    band = drawAgain(TodayGoing);
    await press(byTestId(band, "today-going-stop-yes"));
    await settle();
    assert.deepEqual(cancelled, ["b-soon"]);
    assert.equal(textOf(toasts.at(-1).msg), "Offers canceled — nothing will send");
  } finally {
    globalThis.window.__broadcasts = keep.verbs;
    globalThis.window.usePPToast = keep.toast;
    setSurfaceValue("today", undefined);
  }
});
