/**
 * The world Today's zones are drawn in for these tests (Today in three zones, 2 Nov 2026): the stub React with the shell's
 * doors on the window, a fetch every test may hold, a workspace, and a day made by the real contracts. As
 * today/today-page.test.mjs sets it up, in one place for the zones' own tests.
 */
import { after } from "node:test";
import { clockTime, toTodayVM, zoneDayKey } from "@chanlytics/contracts";
import { installStubReact, fresh, again, kitPages, all, textOf } from "../../_stub-react.mjs";

export const ZONE = "America/New_York";
export const NOW = new Date("2026-09-18T20:00:00Z");
export const went = [];
export const flashes = [];
export const asked = [];

installStubReact({
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  __surfaceFailed: () => false,
  __refreshSurface: () => {},
});
Object.assign(globalThis.window, kitPages);
Object.assign(globalThis, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  askAbout: (a) => asked.push(a),
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  mayAtLeast: () => true,
  gate: () => ({}),
  useHotkey: () => {},
  refusalToast: (res, lead) => ({ msg: `${lead}: ${res.error}`, tone: "danger" }),
  __clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
});

/** What the pages asked of the wire, by method and path, and the answer each test holds (`answer`), refused by default. */
export const wire = [];
export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
export let answer = () => json(503, { ok: false, error: { code: "unavailable", message: "not read here" } });
export const answerWith = (fn) => {
  answer = fn;
};
globalThis.window.fetch = globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  wire.push({ method: init.method ?? "GET", path: u.pathname, query: u.search, body: init.body ?? null });
  return answer(u, init);
};
const realConsoleError = console.error;
console.error = () => {};
after(() => {
  console.error = realConsoleError;
});

export const W = globalThis.window;

/** The metrics a day is read with: a working day in New York, two lines up. */
export const metrics = (over = {}) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: ZONE, status: "active" },
  channels: [
    { kind: "whatsapp", status: "active", number: "+13055550101" },
    { kind: "voice", status: "active", number: "+13055550102" },
  ],
  window: {
    days: 1,
    since: "2026-09-18T04:00:00Z",
    since_local: "2026-09-18T00:00:00",
    now_local: "2026-09-18T16:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: "2026-09-18T19:00:00Z",
    last_outbound_at: "2026-09-18T19:01:00Z",
  },
  period: {
    messages_in: 6,
    messages_out_ai: 5,
    messages_out_you: 0,
    conversations_active: 4,
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
  ...over,
});

/** A day with these queue rows, as Today's read publishes it (toTodayVM's own shape, its rows replaced). */
export const dayWith = (rows, over = {}) => {
  const vm = toTodayVM(metrics(), [], [], [], NOW);
  return { ...vm, queue: { ...vm.queue, rows }, ...over };
};

/** A queue row of the kit's one grammar, as contracts makes it: a person waiting `hours` on a thread. */
export const row = (id, who, over = {}) => ({
  id,
  kind: "handoff",
  conversationId: `cv-${id}`,
  callId: null,
  person_id: `p-${id}`,
  who,
  initials: who.slice(0, 2).toUpperCase(),
  channel: "WhatsApp",
  when: "waited 2h",
  sentence: "Can I move my appointment?",
  quoted: true,
  status: [],
  tone: "escalated",
  warn: false,
  cta: { label: "Open and reply", to: `inbox/th-cv-${id}` },
  also: null,
  writes: { for_message_id: `m-${id}`, wire: "WhatsApp", window_open: true, window_closes: null },
  prepared: "Of course, which day suits you?",
  waitedMs: 2 * 3_600_000,
  ...over,
});

/** A component drawn from nothing, and drawn again over the same cells, as React would after a state change. */
export const draw = (Comp, props = {}) => {
  fresh();
  return W.React.createElement(Comp, props);
};
export const redraw = (Comp, props = {}) => again(() => W.React.createElement(Comp, props));

/** The buttons whose words hold `words`, and the elements drawn with a primary act (the page's one coral). */
export const buttons = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).includes(words));
export const corals = (tree) =>
  all(
    tree,
    (n) =>
      n.props?.variant === "primary" ||
      (typeof n.props?.className === "string" && /(^| )(primary|btn-primary)( |$)/.test(n.props.className)),
  );
