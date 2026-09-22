/**
 * Today, EXECUTED on the stub React over the view models the bridge publishes: the standing line, the day's card
 * (four figures, each with its receipt on hover, focus or a tap; the lines that are not numbers; the period in one
 * line with one door), the queue with one primary verb, the day with its cap, Worth a look with a word for its tone
 * and an Ask door, While you were away over all four queue kinds, a borrowed read that failed saying so, and the
 * composition without a seeded panel. Every sentence with a number is read back from contracts, never typed here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM, todayPeriodLine, todayRunWords, todayRunApproved, todayLeaks, unreadCount, zoneDayKey, clockTime, feedProblemWords, toPersonRowVM, PEOPLE_LISTS, peopleListAction } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";

const ZONE = "America/New_York";
// 4 PM in New York on Friday 18 September 2026.
const NOW = new Date("2026-09-18T20:00:00Z");
const went = [];
const asked = [];
const flashes = [];
const failed = new Set();
const refreshed = [];
installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: (k) => failed.has(k), __refreshSurface: (k) => refreshed.push(k) });
const L = "../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
const { TODAY_HELPERS } = await import("../../../apps/dashboard/src/legacy-bridge/today.ts");
Object.assign(globalThis, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  askAbout: (a) => asked.push(a),
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  gate: () => ({}),
  useHotkey: () => {},
  refusalToast: (res, lead) => ({ msg: `${lead}: ${res.error}`, tone: "danger" }),
  __today: TODAY_HELPERS,
  __clock: { dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
});
await import(`${L}/pages/attention-bits.jsx`);
await import(`${L}/pages/dashboard-a-brief.jsx`);
await import(`${L}/pages/dashboard-a-command.jsx`);
await import(`${L}/pages/dashboard-a-day.jsx`);
await import(`${L}/pages/dashboard-a-week.jsx`);
await import(`${L}/pages/dashboard-a.jsx`);
const W = globalThis.window;

/* ------------------------------------ a working day ------------------------------------ */

const metrics = (over = {}) => ({
  workspace: { name: "Melany's Beauty Salon", timezone: ZONE, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }, { kind: "voice", status: "active", number: "+1 786" }],
  window: { days: 1, since: "2026-09-18T04:00:00Z", since_local: "2026-09-18T00:00:00", now_local: "2026-09-18T16:00:00" },
  now: { escalations_open: 1, oldest_open_escalation_at: "2026-09-18T18:20:00Z", threads_needing_human: 1, threads_snoozed: 0, threads_awaiting_reply: 0, last_inbound_at: "2026-09-18T19:38:00Z", last_outbound_at: "2026-09-18T19:38:41Z", ...(over.now ?? {}) },
  period: { messages_in: 9, messages_out_ai: 11, messages_out_you: 0, conversations_active: 6, answered_by_ai: 7, answered_by_you: 0, unanswered_in_window: 1, median_reply_seconds_ai: 34, send_failures: 1, escalations_new: 1, escalation_reasons: { human_token: 1 }, calls: 3, call_seconds: 412, call_sentiments: { Positive: 2, Neutral: 1 }, calls_voicemail: 1, new_contacts: 2, ...(over.period ?? {}) },
  ...(over.channels ? { channels: over.channels } : {}),
});
const msg = (id, dir, body, created_at, over = {}) => ({ id, direction: dir === "in" ? "inbound" : "outbound", sender: dir === "in" ? "customer" : "ai", type: "text", body, media: null, meta: null, status: dir === "in" ? "received" : "delivered", channel: "whatsapp", created_at, ...over });
const thread = (id, name, messages, over = {}) => ({ id, state: "open", paused_until: null, assignee_user_id: null, assignee_is_me: false, last_wa_inbound_at: null, last_message_at: messages.at(-1)?.created_at ?? null, contact: { id: `k-${id}`, display_name: name, wa_profile_name: null, phone_e164: "+13055550100" }, messages, ...over });
const threads = () => [
  thread("cv-r", "Renata Solís", [msg("r1", "in", "Anything Saturday for a gel manicure?", "2026-09-18T13:10:00Z"), msg("r2", "ai", "Saturday 10:00 or 2:00 is open.", "2026-09-18T13:10:30Z")]),
  thread("cv-p", "Priya Nair", [msg("p1", "in", "Do you do balayage on Sundays?", "2026-09-18T17:50:00Z"), msg("p2", "ai", "We're closed Sundays, but Saturday 1:00 PM is open.", "2026-09-18T17:51:00Z", { status: "failed" })]),
  thread("cv-d", "Dulce Amaro", [msg("d0", "in", "Booking for the 12th", "2026-09-09T13:00:00Z", { channel: "sms" }), msg("d2", "in", "Can I bring my sister too?", "2026-09-18T17:30:00Z", { channel: "sms" })]),
  thread("cv-a", "Ana Reyes", [msg("a0", "in", "Hi, can I book?", "2026-09-10T14:00:00Z"), msg("a2", "in", "I'd rather talk to a person about a refund.", "2026-09-18T18:19:00Z")], { state: "needs_human" }),
];
const escalations = () => [{ id: "e-a", conversation_id: "cv-a", reason: "human_token", details: null, state: "open", created_at: "2026-09-18T18:20:00Z" }];
const call = (id, over = {}) => ({ id, retell_call_id: `r-${id}`, direction: "inbound", call_type: "phone_call", status: "ended", from_e164: "+13475550188", from_raw: null, to_e164: null, started_at: "2026-09-18T19:20:00Z", ended_at: "2026-09-18T19:21:00Z", duration_ms: 60_000, disconnection_reason: "user_hangup", sentiment: "Positive", call_successful: true, in_voicemail: false, summary: "Asked about hours.", wanted: "Asked about hours.", outcome: "handled", follow_up: null, caller_name: null, transcript_object: null, recording: null, conversation_id: null, contact_id: null, message_id: null, contact: null, ...over });
const calls = () => [call("k1"), call("k2", { sentiment: "Neutral" }), call("k3", { in_voicemail: true, sentiment: null, summary: null, wanted: null, outcome: "voicemail", started_at: "2026-09-18T19:35:00Z", ended_at: "2026-09-18T19:35:30Z", duration_ms: 30_000 })];
const busy = () => toTodayVM(metrics(), threads(), escalations(), calls(), NOW);
const quietDay = () => toTodayVM(metrics({ now: { escalations_open: 0, oldest_open_escalation_at: null, threads_needing_human: 0, last_inbound_at: "2026-09-17T21:39:00Z", last_outbound_at: "2026-09-17T21:40:18Z" }, period: { messages_in: 0, messages_out_ai: 0, conversations_active: 0, answered_by_ai: 0, unanswered_in_window: 0, median_reply_seconds_ai: null, send_failures: 0, escalations_new: 0, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0 } }), [thread("cv-old", "Bea Lind", [msg("o1", "in", "Thanks!", "2026-09-17T21:39:00Z")])], [], [], NOW);

const tile = (id, value, compare = null) => ({ id, label: id, value, meta: "", delta: null, spark: [], compare });
const reports = () => ({
  vm: { days: 7, rangeLabel: "7 days", since: "Sep 12", until: "Sep 18", empty: false, tiles: [tile("messages", "24", "up from 19"), tile("calls", "4")], answered: { totals: { in: 24, ai: 21, you: 1, none: 2 }, share: 0.875 }, replyTime: { count: 21, medianLabel: "34s" }, calls: { total: 4 }, reasons: [] },
  campaigns: null,
  booking: { present: true, headline: "2 of 18 booked", sub: "", pct: 11, asked: 18, booked: 2 },
});
const list = (id, label, count, action = null) => ({ id, label, group: "journey", count, action });
const people = () => ({
  rows: [{ id: "k-cv-a", state: "needs_you", hasChat: true, calls: 0, consent: { state: "opted_in", dnc: false, label: "Opted in", sub: "Reply · Sep 10", source: "reply", marketing: "unknown", marketingSource: null, marketingSub: "never asked about offers", marketingLabel: "Not asked" } }],
  lists: [list("asked_never_booked", "Asked, never booked", 16, { text: "", cta: "Text the booking link", to: "broadcasts/asked_never_booked", enabled: true }), list("opted_in", "Said yes to messages", 7, { text: "", cta: "Get their yes to offers", to: "broadcasts/get-yes", enabled: true }), list("offers_ok", "Can receive offers", 0, null), list("quiet", "Quiet 30+ days", 6, { text: "", cta: "Reach out", to: "broadcasts/quiet", enabled: true })],
  aggregates: { total: 28 },
});
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const run = (id, state, over = {}) => ({ id, name: `${id} · run`, state, playbook_id: "pb-1", audience: { label: "Win-back" }, recipient_count: 3, scheduled_for: iso(2 * 3_600_000), started_at: null, when: "today 6:00 PM", counts: { sent: 0, replied: 0 }, ...over });
// The run that went out went out a minute ago: RunsDone keys on the business's day, and three hours ago is yesterday before 3 AM.
const broadcasts = () => ({ rows: [run("b-wait", "pending_approval"), run("b-soon", "scheduled", { audience: { label: "Visit reminder" } }), run("b-done", "sent", { name: "Save our number", playbook_id: null, audience: { label: "Everyone" }, started_at: iso(-60_000), counts: { sent: 8, replied: 1 } })] });
const block = (id, t, title, person = null) => ({ id, t, dur: 60, time: `${t}:00`, title, person, description: null, location: null, contacts: { phones: [], e164: [], emails: [] }, guess: null, start: "", end: "" });
const calendar = (blocks) => ({ vm: { timezone: ZONE, from: "2026-09-18", to: "2026-11-19", rangeLabel: "", monthLabel: "", hours: { start: 8, end: 20 }, days: [{ key: "2026-09-18", dow: "Fri", date: "Sep 18", long: "Friday, September 18", dayNum: "18", today: true, past: false, closed: { yes: false, note: null }, bands: [], blocks, allDay: [], windows: [] }, { key: "2026-09-19", dow: "Sat", date: "Sep 19", long: "Saturday, September 19", dayNum: "19", today: false, past: false, closed: { yes: false, note: null }, bands: [], blocks: [], allDay: [], windows: [] }], today: "2026-09-18", now: 16, feed: { present: true, state: "ok", line: "", events: blocks.length, source: "Google Calendar" }, stats: { events: blocks.length, windows: 0, next: "Mon 9:30 AM" }, rules: "", hoursLines: [], closuresAhead: [], services: [], bookingLink: null } });
const bellRow = (id, kind, title, tone = "", about = null, to = "reports") => ({ id, kind, icon: "bell", tone, unread: true, time: "1h", title, message: "", about, actions: [{ label: "Open", to, primary: true }] });

const set = (globals) => { for (const [k, v] of Object.entries(globals)) { if (v === undefined) delete W[k]; else W[k] = v; } };
const clear = () => { set({ TODAY_DATA: undefined, __TODAY_SAMPLE: undefined, __REPORTS: undefined, __PEOPLE: undefined, __BROADCASTS: undefined, __CALENDAR: undefined, __PLAYBOOKS: undefined, __SETUP: undefined, __GOOGLE: undefined, __google: undefined, __notifs: undefined, __LIVE: undefined, __broadcasts: undefined, __inboxVerb: undefined }); failed.clear(); refreshed.length = 0; went.length = 0; asked.length = 0; flashes.length = 0; W.__DEMO_MODE = false; };
const draw = (Comp, props = {}) => { fresh(); return W.React.createElement(Comp, props); };
const buttons = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).includes(words));
const texts = (tree, cls) => all(tree, (n) => classes(n).includes(cls)).map(textOf);

/* ------------------------------------ the standing line ------------------------------------ */

test("the standing line: the day, the time, the lines counted, its own dot; no greeting, no headline, no live-dot", () => {
  clear();
  set({ TODAY_DATA: busy() });
  const tree = draw(W.HeroBrief);
  const line = byTestId(tree, "today-standing");
  assert.ok(line);
  assert.match(textOf(line), /Melany's Beauty Salon/);
  assert.match(textOf(line), /2 of 2 lines connected/);
  assert.ok(!/Good (morning|afternoon|evening)/.test(textOf(line)));
  assert.ok(!textOf(line).includes(busy().standing.headline), "Ask reads the headline; the page draws the work instead");
  const dot = find(line, (n) => classes(n).includes("today-standing-dot"));
  assert.ok(dot && !classes(dot).includes("down"));
  assert.equal(find(tree, (n) => classes(n).includes("live-dot")), null, "the coral live-dot is the agent's live state, never a status light");
  const down = toTodayVM(metrics({ channels: [{ kind: "whatsapp", status: "disconnected", number: "+1 305" }] }), [], [], [], NOW);
  set({ TODAY_DATA: down });
  const dark = draw(W.HeroBrief);
  assert.ok(classes(find(dark, (n) => classes(n).includes("today-standing-dot"))).includes("down"));
  assert.ok(textOf(dark).includes(down.standing.alert));
  set({ TODAY_DATA: undefined });
  assert.equal(draw(W.HeroBrief).rendered, null, "no seeded hero: without the view model there is nothing above the work");
});

/* ------------------------------------ the day's card ------------------------------------ */

test("the card: four figures in order, each with its clause; nothing said twice; the receipts and the not-numbers under them", () => {
  clear();
  const vm = busy();
  set({ TODAY_DATA: vm, __BROADCASTS: broadcasts() });
  const tree = draw(W.TodayCard);
  const card = byTestId(tree, "today-card");
  assert.ok(card);
  const heading = find(card, (n) => n.type === "h2");
  assert.equal(textOf(heading), "Today so far", "a section with its own heading");
  assert.equal(card.props["aria-labelledby"], heading.props.id);
  const figs = vm.figures.map((f) => byTestId(card, `today-figure-${f.id}`));
  assert.deepEqual(figs.map((n) => !!n), [true, true, true, true]);
  for (const [i, f] of vm.figures.entries()) {
    const said = textOf(figs[i]);
    assert.ok(said.includes(String(f.value)) && said.includes(f.label) && said.includes(f.meta), `${f.id}: ${said}`);
    assert.equal(byTestId(card, `today-receipt-${f.id}`), null, "a receipt waits for a hover, a focus or a tap");
  }
  // The lines that are not numbers: a reply that failed to deliver with its door to the thread; what ran today in
  // contracts' words; the receipts. Never the traffic the figures already say.
  const beats = texts(byTestId(card, "today-recap"), "brief-beat-text");
  assert.ok(!beats.some((b) => /receptionist answered|reached the phone line|messages? in/.test(b)), `REGRESSION: the figures say these already: ${beats.join(" | ")}`);
  const failedBeat = all(card, (n) => classes(n).includes("brief-beat")).find((n) => textOf(n).includes("failed to deliver"));
  assert.ok(failedBeat, "the one line that must never be quiet");
  press(buttons(failedBeat, "See the thread")[0]);
  assert.equal(went.at(-1), "inbox/th-cv-p", "the thread of the reply that failed, not the Inbox list");
  const done = byTestId(card, "brief-run-done");
  assert.ok(done);
  const words = todayRunWords(broadcasts().rows[2]).done;
  assert.ok(textOf(done).includes(`went out at ${W.__clock.time(Date.parse(broadcasts().rows[2].started_at))}: ${words.counts}`), textOf(done));
  assert.ok(!textOf(done).includes("—"), "no em dash in a new sentence");
  assert.equal(all(card, (n) => n.props?.["data-testid"] === "brief-receipt").length, vm.recap.receipts.length, "every receipt the view model kept");
});

test("a receipt opens on hover, focus or a tap, says its why with one door, never repeats the figure, and closes on Escape", () => {
  clear();
  const vm = busy();
  set({ TODAY_DATA: vm });
  const first = draw(W.TodayCard);
  const fig = byTestId(first, "today-figure-messages");
  fig.props.onMouseEnter();
  const hovered = again(() => W.React.createElement(W.TodayCard));
  const receipt = byTestId(hovered, "today-receipt-messages");
  assert.ok(receipt, "hover opens it");
  assert.equal(receipt.props.role, "dialog");
  assert.ok(byTestId(byTestId(hovered, "today-figures"), "today-receipt-messages"), "drawn in the row of figures, so a phone lays it under the row and a desktop anchors it by index");
  assert.equal(receipt.props.style["--i"], 0);
  const f = vm.figures.find((x) => x.id === "messages");
  assert.ok(textOf(receipt).includes(f.receipt.text));
  assert.doesNotMatch(textOf(find(receipt, (n) => classes(n).includes("tc-receipt-t"))), new RegExp(`\\b${f.value}\\b`), "the receipt adds to the figure; it never says its number again");
  const door = buttons(receipt, f.receipt.door.label)[0];
  assert.ok(door, "one door");
  press(door);
  assert.equal(went.at(-1), f.receipt.door.to);
  assert.equal(byTestId(hovered, "today-receipt-answered"), null, "one at a time");
  byTestId(hovered, "today-figures").props.onMouseLeave();
  const left = again(() => W.React.createElement(W.TodayCard));
  assert.equal(byTestId(left, "today-receipt-messages"), null);
  // A tap or a keyboard: the figure is the button.
  const btn = find(byTestId(left, "today-figure-calls"), (n) => n.type === "button");
  assert.equal(btn.props["aria-expanded"], false);
  press(btn);
  const tapped = again(() => W.React.createElement(W.TodayCard));
  assert.ok(byTestId(tapped, "today-receipt-calls"));
  assert.equal(find(byTestId(tapped, "today-figure-calls"), (n) => n.type === "button").props["aria-expanded"], true);
  find(byTestId(tapped, "today-figure-calls"), (n) => n.type === "button").props.onKeyDown({ key: "Escape" });
  assert.equal(byTestId(again(() => W.React.createElement(W.TodayCard)), "today-receipt-calls"), null, "Escape closes");
  // A figure with nothing to add is not a button.
  const thin = toTodayVM(metrics({ period: { messages_in: 1, answered_by_ai: 1, conversations_active: 1, messages_out_ai: 1, send_failures: 0, escalations_new: 0, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0 } }), [], [], [], NOW);
  set({ TODAY_DATA: thin });
  const plain = draw(W.TodayCard);
  assert.equal(find(byTestId(plain, "today-figure-calls"), (n) => n.type === "button"), null, "no receipt, no button");
});

test("the foot: the last seven days in Reports' own numbers with one door; a failed Reports read says so; nothing while it loads", () => {
  clear();
  set({ TODAY_DATA: busy(), __REPORTS: reports() });
  const tree = draw(W.TodayCard);
  const line = byTestId(tree, "today-period");
  assert.equal(textOf(line), todayPeriodLine(reports()).text);
  assert.match(textOf(line), /^Last 7 days: 24 customer messages \(up from 19\), 88% answered by the receptionist, median reply 34s, 4 calls\.$/);
  press(buttons(tree, "Open Reports")[0]);
  assert.equal(went.at(-1), "reports");
  assert.equal(buttons(tree, "Open Reports").length, 1, "one door to Reports on the card: the period card had two");
  set({ __REPORTS: undefined });
  failed.add("reports");
  const broke = draw(W.TodayCard);
  assert.equal(byTestId(broke, "today-period"), null);
  assert.match(textOf(byTestId(broke, "today-period-failed")), /Couldn't read Reports/);
  failed.clear();
  const loading = draw(W.TodayCard);
  assert.equal(byTestId(loading, "today-period"), null);
  assert.equal(byTestId(loading, "today-period-failed"), null, "not read yet is not failed");
});

test("a quiet day: the card says nothing came in, proves the lines are listening, and keeps its one door; no figures", () => {
  clear();
  const vm = quietDay();
  set({ TODAY_DATA: vm });
  const tree = draw(W.TodayCard);
  assert.equal(byTestId(tree, "today-figures"), null, "no row of zeros");
  const line = textOf(byTestId(tree, "today-quiet-line"));
  assert.ok(line.includes("Nothing has come in yet today.") && line.includes(vm.proof), line);
  assert.match(vm.proof, /^The last message arrived yesterday at 5:39 PM, and the receptionist answered 1m 18s later\.$/);
  const proof = byTestId(tree, "brief-quiet-proof");
  assert.match(textOf(proof), /WhatsApp/);
  assert.match(textOf(proof), /· on/);
  press(buttons(tree, "earlier conversation")[0]);
  assert.equal(went.at(-1), "conversations");
  // No traffic while a handoff waits: not a quiet day, and no figure to hang the proof on. The card still says it.
  const waiting = toTodayVM(metrics({ period: { messages_in: 0, messages_out_ai: 0, conversations_active: 0, answered_by_ai: 0, unanswered_in_window: 0, median_reply_seconds_ai: null, send_failures: 0, escalations_new: 0, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0 } }), threads().slice(3), escalations(), [], NOW);
  assert.equal(waiting.quiet, null);
  assert.equal(waiting.figures, null);
  set({ TODAY_DATA: waiting });
  const held = draw(W.TodayCard);
  assert.equal(byTestId(held, "today-figures"), null);
  assert.ok(textOf(byTestId(held, "today-quiet-line")).includes(waiting.proof), "REGRESSION: the proof vanished exactly when an owner needed it");
});

test("the calls read failed: the card says so under the figures, once", () => {
  clear();
  set({ TODAY_DATA: toTodayVM(metrics(), threads(), escalations(), null, NOW) });
  const tree = draw(W.TodayCard);
  assert.ok(byTestId(tree, "brief-calls-failed"));
  assert.equal(all(tree, (n) => String(n.props?.className || "").includes("empty-failed")).length, 1);
});

/* ------------------------------------ the queue ------------------------------------ */

test("the queue: no count badge over the rows, one primary verb, the runs in contracts' words, the approval toast too", async () => {
  clear();
  set({ TODAY_DATA: busy(), __BROADCASTS: broadcasts(), __broadcasts: { approve: async () => ({ ok: true, data: { recipient_count: 3, scheduled_for: iso(3_600_000), moved_from: iso(0) } }), cancel: async () => ({ ok: true, data: {} }) }, bcWhenWords: () => "scheduled for Mon 9:00 AM" });
  const tree = draw(W.AgentCommand);
  const queue = byTestId(tree, "today-queue");
  assert.equal(find(queue, (n) => classes(n).includes("tq-count")), null, "REGRESSION: a number over the rows that say it");
  assert.match(textOf(find(queue, (n) => classes(n).includes("tq-sub"))), /1 need you · 1 call worth a listen · 2 runs waiting/, "the parts from contracts, the runs' count from contracts");
  const rows = all(queue, (n) => classes(n).includes("cl-attn-row"));
  const primary = rows.filter((r) => find(r, (n) => classes(n).includes("cl-attn-cta") && classes(n).includes("primary")));
  assert.equal(primary.length, 1, "the first row carries the page's one primary verb");
  assert.equal(primary[0], rows[0]);
  const waiting = byTestId(queue, "brief-run-row");
  const w = todayRunWords(broadcasts().rows[0]);
  assert.ok(textOf(waiting).includes(w.waiting.sentence) && textOf(waiting).includes(w.waiting.status[0]), textOf(waiting));
  // Four rows: the two people waiting, then both runs — the one waiting for a word, then the one under its
  // veto window. Everything fits, so there is no foot; what does not fit is the next test's business.
  assert.ok(byTestId(queue, "brief-run-soon"), "the scheduled run has a seat once the people are drawn");
  assert.equal(find(queue, (n) => classes(n).includes("tq-foot")), null, "nothing was cut, so nothing is counted");
  assert.equal(all(queue, (n) => classes(n).includes("cl-attn-row")).length, 4, "the card is four rows");
  await press(buttons(waiting, "Approve")[0]);
  const t = todayRunApproved("Win-back", 3, "scheduled for Mon 9:00 AM");
  assert.equal(textOf(flashes.at(-1).msg), `${t.lead} ${t.rest}`);
  assert.ok(!textOf(flashes.at(-1).msg).includes("sending now"));
  delete W.bcWhenWords;
  // The broadcasts read failed: the queue's rows are current, and it says the runs could not be read.
  set({ __BROADCASTS: undefined });
  failed.add("broadcasts");
  const broke = draw(W.AgentCommand);
  assert.match(textOf(byTestId(broke, "today-runs-failed")), /Couldn't read the playbook runs/);
  // `rows` above counted the two run rows too (they are AttnRows as well); the runs are a FailedRead now, so what must stand is the queue's own.
  assert.equal(all(broke, (n) => classes(n).includes("cl-attn-row")).length, busy().queue.rows.length, "the rows themselves stand");
});

test("a snooze or a resolve from the queue is said the moment the server takes it, not after the surfaces are read again", async () => {
  clear();
  const vm = busy();
  const row = vm.queue.rows.find((r) => r.also);
  assert.ok(row, "the fixture has a person with a second act");
  let reread = () => {};
  set({ TODAY_DATA: vm, __BROADCASTS: broadcasts(), __inboxVerb: async (_t, _verb, _payload, opts = {}) => {
    if (opts.onAccepted) opts.onAccepted();
    await new Promise((r) => { reread = r; });
    return { ok: true, data: {} };
  } });
  const queue = byTestId(draw(W.AgentCommand), "today-queue");
  const act = byTestId(queue, `queue-${row.also.verb}`);
  const done = press(act);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(flashes.length, 1, "said at acceptance, while the Inbox, the threads and Today are read again");
  assert.match(textOf(flashes[0].msg), new RegExp(row.who));
  reread();
  await done;
  assert.equal(flashes.length, 1, "and said once");
  // A refusal is the refusal, once.
  set({ __inboxVerb: async () => ({ ok: false, code: "conflict", status: 409, message: "A teammate has this one now." }) });
  await press(byTestId(byTestId(draw(W.AgentCommand), "today-queue"), `queue-${row.also.verb}`));
  assert.equal(flashes.length, 2);
});

test("a run's Approve from the queue is said the moment the server takes it, with what it scheduled, not after the runs are read again", async () => {
  clear();
  let reread = () => {};
  const accepted = { recipient_count: 3, scheduled_for: iso(3_600_000), moved_from: iso(0) };
  set({ TODAY_DATA: busy(), __BROADCASTS: broadcasts(), bcWhenWords: () => "scheduled for Mon 9:00 AM", __broadcasts: {
    approve: (_id, opts = {}) => { if (opts.onAccepted) opts.onAccepted(accepted); return new Promise((r) => { reread = () => r({ ok: true, data: accepted }); }); },
    cancel: async () => ({ ok: true, data: {} }),
  } });
  const waiting = byTestId(byTestId(draw(W.AgentCommand), "today-queue"), "brief-run-row");
  const done = press(buttons(waiting, "Approve")[0]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(flashes.length, 1, "said at acceptance");
  const t = todayRunApproved("Win-back", 3, "scheduled for Mon 9:00 AM");
  assert.equal(textOf(flashes[0].msg), `${t.lead} ${t.rest}`);
  reread();
  await done;
  assert.equal(flashes.length, 1, "and said once");
  delete W.bcWhenWords;
});

test("four rows: people take three while a run wants the fourth, and all four when none does", () => {
  clear();
  // Four people waiting — one more than the card gives them.
  const vm = busy();
  const first = vm.queue.rows[0];
  vm.queue.rows = ["one", "two", "three", "four"].map((w, i) => ({ ...first, id: `q-${w}`, who: `Person ${w}`, cta: { ...first.cta }, also: null }));
  set({ TODAY_DATA: vm, __BROADCASTS: broadcasts() });
  const queue = byTestId(draw(W.AgentCommand), "today-queue");
  const rows = all(queue, (n) => classes(n).includes("cl-attn-row"));
  assert.equal(rows.length, 4, "the card is four rows");
  assert.deepEqual(rows.map((r) => r.props["data-testid"]).slice(0, 3).map((d) => d.startsWith("queue-")), [true, true, true], "three of them are people");
  assert.equal(rows[3].props["data-testid"], "brief-run-row", "and the fourth is the run waiting for a word — the decision no other row can stand in for");
  // Nothing is dropped in silence: the fourth person and the second run are both counted, each with its door.
  assert.match(textOf(find(queue, (n) => classes(n).includes("tq-foot"))), /1 more in the Inbox · 1 more run in Campaigns/);

  // No run wants the seat, so a fourth person has it rather than leaving a hole.
  set({ __BROADCASTS: { rows: [] } });
  const only = byTestId(draw(W.AgentCommand), "today-queue");
  const four = all(only, (n) => classes(n).includes("cl-attn-row"));
  assert.equal(four.length, 4);
  assert.deepEqual(four.map((r) => textOf(find(r, (n) => classes(n).includes("cl-attn-who")))), ["Person one", "Person two", "Person three", "Person four"]);
  assert.equal(find(only, (n) => classes(n).includes("tq-foot")), null, "with the fourth person drawn there is nothing left to count");
});

/* ------------------------------------ the day ------------------------------------ */

test("the day: five rows and a line to the Calendar; a failed calendar read says so where the day would be", () => {
  clear();
  set({ TODAY_DATA: busy(), __CALENDAR: calendar([8, 9, 10, 11, 13, 14, 17].map((h) => block(`b${h}`, h, `Slot ${h}`))), __PLAYBOOKS: { rows: [] } });
  const tree = draw(W.TodayDay);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "today-day-item").length, 5);
  const more = byTestId(tree, "today-day-more");
  assert.equal(textOf(more).trim(), "2 more on the Calendar");
  press(more);
  assert.equal(went.at(-1), "calendar");
  set({ __CALENDAR: undefined });
  failed.add("calendar");
  const broke = draw(W.TodayDay);
  assert.ok(byTestId(broke, "today-day-failed"));
  assert.match(textOf(broke), /Couldn't read the calendar/);
  failed.clear();
  assert.equal(draw(W.TodayDay).rendered, null, "not read yet: the Calendar page's card says why");
});

test("a calendar it HAS and could not read says so where the day goes: the feed's own words, the Retry, the door", () => {
  clear();
  const c = calendar([]);
  c.vm.feed = { ...c.vm.feed, state: "unavailable", problem: feedProblemWords("settings"), events: 0 };
  set({ TODAY_DATA: busy(), __CALENDAR: c, __PLAYBOOKS: { rows: [] } });
  const card = byTestId(draw(W.TodayDay), "today-day-unreadable");
  // REGRESSION: this returned null. A working day and a broken feed drew exactly the same thing — nothing —
  // so a bad calendar address survived two rounds of being looked straight at.
  assert.ok(card, "the card is there");
  const words = textOf(card);
  assert.ok(words.includes("Couldn't read the calendar"), words);
  assert.ok(words.includes(feedProblemWords("settings")), "the feed's own sentence, which names what to do");
  assert.ok(words.includes("The queue and the day's numbers are current"), "what is beside it came from other reads and still stands");
  press(byTestId(card, "today-day-unreadable-read-retry"));
  assert.deepEqual(refreshed, ["calendar"], "one Retry, and it re-reads the calendar surface");
  press(byTestId(card, "today-day-unreadable-open"));
  assert.equal(went.at(-1), "calendar", "and a door to where the address lives");

  // No calendar at all is not a fault: nothing failed, there is nothing to retry, and the invitation to connect
  // one is the Calendar page's card to make — not a red word on a page about today's work.
  c.vm.feed = { ...c.vm.feed, present: false, state: "none", problem: null };
  assert.equal(draw(W.TodayDay).rendered, null, "no feed stays silent");
});

/* ------------------------------------ worth a look ------------------------------------ */

test("worth a look: a word and an icon for the tone, who is waiting, Ask why with the row's own facts, the doors, and the count past the cap", () => {
  clear();
  const vm = busy();
  set({ TODAY_DATA: vm, __REPORTS: reports(), __PEOPLE: people() });
  const tree = draw(W.TodayLeaks);
  const band = byTestId(tree, "today-leaks");
  const { rows, moreLine } = todayLeaks(reports(), people(), vm.noReply);
  assert.equal(rows.length, 2);
  for (const l of rows) {
    const row = byTestId(band, `today-leak-${l.id}`);
    assert.ok(row, l.id);
    assert.equal(textOf(find(row, (n) => classes(n).includes("tl-tag"))), l.tag);
    assert.equal(find(row, (n) => n.type === "Icon").props.name, l.icon);
    assert.equal(textOf(find(row, (n) => classes(n).includes("tl-text"))), l.text);
    assert.equal(textOf(find(row, (n) => classes(n).includes("tl-math"))), l.math);
    press(byTestId(row, `today-leak-ask-${l.id}`));
    assert.deepEqual(asked.at(-1), { prompt: l.ask });
    assert.ok(buttons(row, l.cta.label).length === 1);
  }
  assert.equal(rows[0].id, "never-booked");
  assert.equal(rows[1].id, "unanswered");
  const waiting = all(byTestId(band, "today-leak-unanswered"), (n) => classes(n).includes("tl-person"));
  assert.deepEqual(waiting.map(textOf), ["Dulce Amaro"], "who is waiting with nothing back, from the threads the page holds");
  assert.equal(textOf(find(byTestId(band, "today-leak-unanswered"), (n) => classes(n).includes("tl-people-lead"))), "Waiting now", "named as waiting now, never as the count's own subjects: the count is Reports' over its period");
  press(waiting[0]);
  assert.equal(went.at(-1), "inbox/th-cv-d");
  assert.equal(textOf(byTestId(band, "today-leaks-more")).trim(), moreLine);
  assert.equal(moreLine, "and 2 more", "the reach row and the quiet row qualified too; the cap is two");
  set({ __REPORTS: { ...reports(), vm: { ...reports().vm, answered: { totals: { in: 23, ai: 23, you: 0, none: 0 } } }, booking: { present: true, headline: "17 of 18 booked", sub: "", pct: 94, asked: 18, booked: 17 } }, __PEOPLE: { ...people(), lists: [list("quiet", "Quiet 30+ days", 1, null)] } });
  assert.equal(draw(W.TodayLeaks).rendered, null, "a workspace with nothing wrong gets no band at all");
  set({ __REPORTS: undefined, __PEOPLE: people() });
  failed.add("reports");
  assert.match(textOf(byTestId(draw(W.TodayLeaks), "today-leaks-failed")), /Couldn't read Reports/);
  failed.clear();
  set({ __REPORTS: reports(), __PEOPLE: undefined });
  failed.add("people");
  assert.match(textOf(byTestId(draw(W.TodayLeaks), "today-leaks-failed")), /Couldn't read People/);
  failed.clear();
  assert.equal(draw(W.TodayLeaks).rendered, null, "not read yet is not failed");
});

test("REGRESSION: worth a look over People's real rows -- a yes to offers with no number to send one to is not 'nobody has said yes', and there is no door to ask for it again", () => {
  clear();
  const at = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
  const row = (id, name, over = {}) => toPersonRowVM({
    id, display_name: name, wa_profile_name: null, phone_e164: null, email: null,
    consent: "opted_in", consent_source: "in_person", consent_updated_at: at(20), dnc: false,
    marketing_consent: null, marketing_consent_source: null, marketing_consent_updated_at: null,
    channels: ["whatsapp"], conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
    latest_conversation_id: null, latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null, latest_wa_inbound_at: null,
    last_message_at: at(3), last_message_direction: "inbound", last_message_sender: "customer", last_inbound_text: "Thanks!", last_inbound_at: at(3),
    last_call_at: null, call_count: 0, call_seconds: 0, first_contact_at: at(30), earliest_row_at: at(30), has_backfill: false, has_chat: true, queued_reply_at: null,
    ...over,
  }, ZONE, NOW);
  const rows = [
    row("p1", "Rosa Diaz", { phone_e164: "+13055550101" }), row("p2", "Mia Chen", { phone_e164: "+13055550102" }), row("p3", "Ivy Park", { phone_e164: "+13055550103" }),
    // Wrote in by email and said yes to both there: an address, and no number.
    row("p4", "Ana Reyes", { email: "ana@example.com", channels: ["email"], consent_source: "customer_message", marketing_consent: "opted_in", marketing_consent_source: "customer_message", marketing_consent_updated_at: at(20) }),
  ];
  // The People surface as the bridge publishes it (surface-data.ts publishPeople), with no calendar.
  const P = {
    rows,
    lists: PEOPLE_LISTS.filter((l) => !l.needsCalendar).map((l) => {
      const members = rows.filter(l.test);
      return { id: l.id, label: l.label, group: l.group, count: members.length, ids: members.map((r) => r.id), action: peopleListAction(l.id, members) };
    }),
    aggregates: { total: rows.length },
  };
  // A week that booked and answered, so the reach row is not under the cap.
  const R = { ...reports(), vm: { ...reports().vm, answered: { totals: { in: 23, ai: 23, you: 0, none: 0 } } }, booking: { present: true, headline: "17 of 18 booked", sub: "", pct: 94, asked: 18, booked: 17 } };
  set({ TODAY_DATA: busy(), __REPORTS: R, __PEOPLE: P });
  const reach = byTestId(draw(W.TodayLeaks), "today-leak-unreachable");
  assert.ok(reach, "nobody can be sent an offer: the row stands");
  const want = todayLeaks(R, P).rows.find((l) => l.id === "unreachable");
  assert.equal(textOf(find(reach, (n) => classes(n).includes("tl-text"))), want.text);
  assert.equal(textOf(find(reach, (n) => classes(n).includes("tl-math"))), want.math);
  assert.ok(!/has said yes to offers/.test(textOf(reach)), `REGRESSION: Ana said yes to offers, and the row said nobody had: ${textOf(reach)}`);
  assert.deepEqual(buttons(reach, "Get their yes"), [], "REGRESSION: a door asking Ana for the yes she gave");
  press(buttons(reach, "Open People")[0]);
  assert.equal(went.at(-1), "clients/seg:opted_in", "the number is People's list, and the door opens it");
});

/* ------------------------------------ while you were away ------------------------------------ */

test("while you were away: drawn wherever the bell is, deduped over every queue kind, the head the bell's own number", () => {
  clear();
  const vm = busy();
  const rows = [
    bellRow("needs:th-cv-a", "needs_you", "Ana Reyes needs you", "warn"),
    bellRow("call:k3", "missed_call", "Missed call · +1 (347) 555-0188", "warn", null, "conversations/cv-k3"),
    bellRow("n:1", "review", "1 new rating on Google", "ok"),
    // The run the queue holds for a word, said again by the bell: the fifth queue kind the away card hides.
    bellRow("n:2", "playbook", "Playbook “Win-back” is ready: 3 people", "ok", null, "outbound"),
  ];
  const api = { feed: () => rows, onChange: () => () => {}, read() {}, dismiss() {}, seenAll() {}, unread: () => unreadCount(rows) };
  // The queue draws the Win-back run held for a word (broadcasts()), so the bell's "is ready" about it is the queue's.
  set({ TODAY_DATA: vm, __notifs: api, __BROADCASTS: broadcasts() });
  W.__DEMO_MODE = true;
  const tree = draw(W.TodayAway);
  assert.ok(byTestId(tree, "today-away"), "the mockup's sample publishes a bell too: the card no longer hides in a demo");
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "today-away-row").map((n) => textOf(find(n, (m) => classes(m).includes("ta-title")))), ["1 new rating on Google"], "the handoff's row and the missed call are the queue's");
  assert.equal(textOf(find(tree, (n) => classes(n).includes("tq-count"))).trim(), "4", "the bell's own number");
  assert.match(textOf(find(tree, (n) => classes(n).includes("tq-foot"))), /3 more in the bell, already in the queue above/);
  assert.ok(buttons(tree, "Mark all read").length === 1);
  W.__DEMO_MODE = false;
});

/* ------------------------------------ the mockup ------------------------------------ */

test("the mockup: the borrowed surfaces come from the sample's one global in a demo session, never from the bridge's names", () => {
  clear();
  const bell = { feed: () => [bellRow("n:1", "review", "1 new rating on Google", "ok")], onChange: () => () => {}, read() {}, dismiss() {}, seenAll() {}, unread: () => 1 };
  set({ TODAY_DATA: busy(), __TODAY_SAMPLE: { __REPORTS: reports(), __PEOPLE: people(), __BROADCASTS: broadcasts(), __CALENDAR: calendar([block("b9", 9, "Gloss")]), __PLAYBOOKS: { rows: [] }, __clock: W.__clock, __notifs: bell } });
  W.__DEMO_MODE = true;
  const demo = draw(W.DashboardA);
  for (const id of ["today-standing", "today-queue", "today-day", "today-card", "today-period", "brief-run-row", "brief-run-done", "today-leaks", "today-away", "today-away-row"]) assert.ok(byTestId(demo, id), `${id}: drawn from the sample`);
  for (const name of ["__REPORTS", "__PEOPLE", "__BROADCASTS", "__CALENDAR", "__PLAYBOOKS", "__notifs"]) assert.equal(W[name], undefined, `${name}: the mockup's other pages switch to their real variants on the bridge's names`);
  // A workspace never reads the sample: the same globals outside a demo session draw nothing borrowed.
  W.__DEMO_MODE = false;
  const real = draw(W.DashboardA);
  for (const id of ["today-day", "today-period", "brief-run-row", "today-leaks", "today-away"]) assert.equal(byTestId(real, id), null, `${id}: never from the sample outside a demo`);
  assert.ok(byTestId(real, "today-queue") && byTestId(real, "today-card"), "its own view model still draws");
});

/* ------------------------------------ the composition ------------------------------------ */

test("the page is three bands and nothing seeded: the standing line, the queue with the day, the card, worth a look with away", () => {
  clear();
  set({ TODAY_DATA: busy(), __REPORTS: reports(), __PEOPLE: people(), __BROADCASTS: broadcasts(), __CALENDAR: calendar([block("b9", 9, "Gloss")]), __PLAYBOOKS: { rows: [] }, __notifs: { feed: () => [], onChange: () => () => {}, read() {}, dismiss() {}, seenAll() {}, unread: () => 0 } });
  W.__DEMO_MODE = true;
  const tree = draw(W.DashboardA);
  const order = ["today-standing", "today-queue", "today-day", "today-card", "today-leaks", "today-away"].map((id) => byTestId(tree, id));
  assert.ok(order.every(Boolean), "every band");
  const names = all(tree, (n) => typeof n.type === "function").map((n) => n.type.name);
  for (const seeded of ["NowPlayingRail", "TrustReview", "SegmentPulse", "AgentFleet", "AmbientDock", "HeroBriefSeed", "AgentCommandSeed", "TodayPulse", "TodayJourney", "PulseArc", "BriefBeats"]) assert.ok(!names.includes(seeded), `${seeded} is gone from Today`);
  const core = find(tree, (n) => classes(n).includes("dash-a-v2-core"));
  assert.deepEqual(core.props.children.filter((c) => c && typeof c.type === "function").map((c) => c.type.name), ["AgentCommand", "TodayDay"]);
  const foot = find(tree, (n) => classes(n).includes("dash-a-v2-foot"));
  assert.deepEqual(foot.props.children.filter((c) => c && typeof c.type === "function").map((c) => c.type.name), ["TodayLeaks", "TodayAway"]);
  assert.equal(buttons(byTestId(tree, "today-card"), "Open Reports").length, 1, "the card's one door to Reports (Worth a look's unanswered row keeps its own, to the tile that prints the figure)");
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "today-recap").length, 1, "the not-numbers live in one place");
  W.__DEMO_MODE = false;
});
