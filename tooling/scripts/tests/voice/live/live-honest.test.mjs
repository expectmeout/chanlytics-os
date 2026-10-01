/**
 * Live says what is true about a call, and a keyboard can reach it.
 *
 * - An ended call's card led with the phone provider's own summary, though the analysis says what the
 *   caller wanted, how it ended and what to do next; every caller's row drew a "P" (the wiring audit's A20).
 * - The header said "no phone line yet" when the line could not be read (A16).
 * - The hand-over's toast read r.line, which the client nests under data, so it named the line from
 *   Settings rather than the one the server rang; before Settings had been read, the button said to add a
 *   line the workspace may well have (A20).
 * - "Sep 6 · 3:10" put a call's length where a time reads, and the door said "Open client" (L8).
 * - Rows took a click and nothing else (the Live half of A25); a link could not name a call; and a call
 *   gone quiet said nothing until the checking banner, minutes later.
 * Run against the contracts and the page (apps/dashboard/src/surfaces/live, TSX since decision 0015) on the legacy stub
 * React, its view model handed over the seam and its verbs run for real over a fetch this test holds.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { toLiveVM, toLiveCallVM, liveStillUp, liveBar } from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh,
  again,
  all,
  find,
  byTestId,
  textOf,
  quiet,
  redrawWanted,
} from "../../_legacy-react.mjs";

const ZONE = "America/New_York";
const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const LINE = "+13055550199";
const RANG = "+13055550142";

// A call as the calls route returns it (live-page-controls.test.mjs).
const call = (over = {}) => ({
  id: "c-live",
  retell_call_id: "call_abc123def456",
  direction: "inbound",
  call_type: "phone_call",
  status: "ongoing",
  from_e164: "+16465550123",
  from_raw: null,
  to_e164: "+13055550100",
  started_at: iso(90_000),
  ended_at: null,
  duration_ms: null,
  disconnection_reason: null,
  sentiment: null,
  call_successful: null,
  in_voicemail: null,
  summary: null,
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: null,
  transcript_object: [
    { role: "agent", content: "Thank you for calling Marisa's Beauty Salon!" },
    { role: "user", content: "Hi, is Marisa in today?" },
  ],
  recording: null,
  conversation_id: "cv1",
  contact_id: "k1",
  message_id: null,
  created_at: iso(90_000),
  updated_at: iso(2_000),
  contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
  ...over,
});
// Ended, with the post-call analysis (the-pages-say-only-what-is-true.test.mjs's words).
const ended = (over = {}) =>
  call({
    id: "c-done",
    status: "ended",
    started_at: iso(3_600_000),
    ended_at: iso(3_410_000),
    duration_ms: 190_000,
    disconnection_reason: "user_hangup",
    created_at: iso(3_600_000),
    updated_at: iso(3_400_000),
    from_e164: "+19175550106",
    contact_id: "c7",
    conversation_id: "cv7",
    contact: { display_name: "Emily Chen", wa_profile_name: null, phone_e164: "+19175550106" },
    summary: "The user called Marisa's Beauty Salon to arrange a bridal trial.",
    wanted: "Wants to book a bridal trial on October 3",
    outcome: "callback_needed",
    follow_up: "Call Emily back to confirm the bridal trial",
    caller_name: "Emily",
    ...over,
  });
const channels = [
  { id: "ch1", kind: "voice", number_e164: "+13055550100", status: "active", created_at: iso(86_400_000), config: {} },
];

/* -------------------------------- the view model -------------------------------- */

test("REGRESSION (A20, L8): an ended call carries what the caller wanted, how it ended, what to do next, and its length in words", () => {
  const vm = toLiveCallVM(ended(), ZONE, new Date(NOW));
  assert.equal(
    vm.wanted,
    "Wants to book a bridal trial on October 3",
    "REGRESSION: the Live card had only the provider's summary",
  );
  assert.equal(typeof vm.outcomeWords, "string");
  assert.ok(vm.outcomeWords.length > 0, "how it ended, in the owner's words");
  assert.equal(vm.followUp, "Call Emily back to confirm the bridal trial");
  assert.equal(vm.callerName, "Emily");
  assert.equal(vm.lengthWords, "3 min 10 sec");
  const live = toLiveCallVM(call(), ZONE, new Date(NOW));
  assert.deepEqual(
    [live.wanted, live.followUp, live.lengthWords],
    [null, null, null],
    "a call in progress has none of these yet",
  );
});

/* ------------------------------ the page, drawn ------------------------------ */

const flashes = [];
const went = [];
const sent = [];
installLegacyReact({
  __DEMO_MODE: false,
  CHANLY: { nav: (to) => went.push(to) },
  setInterval: () => 1,
  clearInterval() {},
});
const S = "../../../../../apps/dashboard/src";
// What the shell still owns and the page draws by name: the role gate, the door to a person, the state pill (data-bits.jsx).
await import(`${S}/legacy/components/data-bits.jsx`);
// data-bits also publishes the shell's toast hook; this harness keeps its own flash.
globalThis.usePPToast = () => [null, (m) => flashes.push(m)];
const { StatePill, StatCell, StatStrip } = globalThis;
const { LivePage } = await import(`${S}/surfaces/live/live-page.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { liveOverride } = await import(`${S}/surfaces/live/surface.ts`);
const { hearSurfaces } = await import(`${S}/legacy-bridge/surface-status.ts`);

// The hand-over is the bridge's verb (inbox-verbs.ts), imported by the page and run for real over the client: this is the
// wire. The client's answer is the route's body under data (client/api.ts), never flat.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const path = new URL(url, "https://app.chanlytics.com").pathname;
  sent.push({ method: init.method, path });
  const data = { ok: true, decision_id: "d2", line: RANG };
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

/** Settings' facts as the seam holds them: undefined before Settings has been read. */
const withFacts = (facts) =>
  setSurfaceValue("settings", facts === undefined ? undefined : { facts: { facts, conflicts: [] } });
withFacts({ handoff_number: { value: LINE } });
const live = (calls, ch = channels) => toLiveVM(calls, ch, ZONE, new Date(NOW));
const withLive = (calls, ch = channels) => {
  const vm = live(calls, ch);
  setSurfaceValue("live", vm);
  fresh();
  return vm;
};
const mount = (props = {}) => again(() => LivePage(props));
const callRows = (tree) => all(tree, (n) => n.props?.["data-call-id"] && n.props?.["data-testid"] === "live-row");
const headName = (tree) => find(tree, (n) => n.props?.className === "lm-head-name");
const headMeta = (tree) => find(tree, (n) => n.props?.className === "lm-head-meta");
const pressIn = (node) => node.props.onClick();

test("REGRESSION (A20, L8): an ended call's card leads with what the caller wanted, says what to do next, and gives its length in words beside the time", () => {
  const vm = withLive([ended()]);
  const tree = mount();
  const card = byTestId(tree, "live-summary");
  assert.match(
    textOf(card),
    /Wants to book a bridal trial on October 3/,
    "REGRESSION: the card led with the provider's summary",
  );
  assert.ok(textOf(card).includes(vm.recent[0].outcomeWords), "how it ended");
  assert.match(textOf(card), /To do: Call Emily back to confirm the bridal trial/);
  const meta = textOf(headMeta(tree));
  assert.match(meta, / · 3 min 10 sec/);
  assert.doesNotMatch(meta, /· 3:10/, "REGRESSION: 'Sep 6 · 3:10' put a length where a time reads");
  assert.ok(
    find(tree, (n) => n.type === "button" && textOf(n).includes("Open profile")),
    "the door names what it opens",
  );
  assert.ok(!textOf(tree).includes("Open client"));
  went.length = 0;
  find(tree, (n) => n.type === "button" && textOf(n).includes("Open profile")).props.onClick();
  assert.deepEqual(went, ["clients/c7"], "and it opens the person's page");
});

test("REGRESSION: who is calling opens their page, and their number rings them -- the name was words beside an Open profile button, and the number words to type again", () => {
  withLive([ended()]);
  const tree = mount();
  const who = byTestId(tree, "lm-head-person");
  assert.ok(who, "the caller's name is a link");
  assert.equal(who.type, "a");
  assert.equal(who.props.href, "#/clients/c7", "to their page");
  assert.equal(textOf(who), "Emily Chen");
  const tel = find(tree, (n) => n.type === "a" && String(n.props?.href || "").startsWith("tel:"));
  assert.ok(tel, "the number is a link that rings them");
  assert.equal(tel.props.href, "tel:+19175550106");
  // Nobody behind the call: the name stays words.
  withLive([ended({ contact_id: null, contact: null })]);
  assert.ok(!byTestId(mount(), "lm-head-person"), "no link where there is no page");
});

test("REGRESSION (A20, A25): a caller's row shows their initials, and the rows take the keyboard -- Tab reaches them, Enter opens one, arrows move", () => {
  const ada = call({
    id: "c-live-2",
    conversation_id: "cv2",
    contact_id: "k2",
    contact: { display_name: "Ada Byron", wa_profile_name: null, phone_e164: "+16465550999" },
  });
  withLive([call(), ada]);
  let tree = mount();
  let rows = callRows(tree);
  assert.equal(rows.length, 2, "REGRESSION: rows carried no call id a keyboard could move between");
  assert.match(textOf(rows[0]), /RD/, "REGRESSION: every caller was drawn as 'P'");
  assert.deepEqual(
    rows.map((r) => r.type),
    ["button", "button"],
    "a row is a button: Tab reaches it, and a screen reader says it can be pressed",
  );
  assert.deepEqual(
    rows.map((r) => r.props["aria-current"]),
    ["true", undefined],
    "the open call is the current row",
  );
  const focused = [];
  const list = {
    querySelector: (sel) => {
      const m = /data-call-id="([^"]+)"/.exec(sel);
      return m ? { focus: () => focused.push(m[1]) } : null;
    },
  };
  const press = (row, key) =>
    row.props.onKeyDown({ key, currentTarget: { closest: () => list }, preventDefault() {}, stopPropagation() {} });
  press(rows[0], "ArrowDown");
  assert.deepEqual(focused, ["c-live-2"], "the arrow moves to the next call");
  tree = mount();
  rows = callRows(tree);
  assert.deepEqual(
    rows.map((r) => r.props["aria-current"]),
    [undefined, "true"],
    "and opens it",
  );
  press(rows[0], "Enter");
  assert.deepEqual(
    callRows(mount()).map((r) => r.props["aria-current"]),
    ["true", undefined],
    "Enter opens the row it is on",
  );
});

test("REGRESSION (A16): when the line could not be read, the page says so -- not that there is no phone line", () => {
  withLive([], null);
  const tree = mount();
  assert.ok(byTestId(tree, "live-line-failed"), "the list says the line's state is unknown");
  assert.doesNotMatch(textOf(tree), /no phone line yet/, "REGRESSION: a failed read said the workspace has no line");
});

test("REGRESSION (A20): the hand-over's toast names the line the server rang, which the client nests under data", async () => {
  withLive([call()]);
  const before = flashes.length;
  await pressIn(byTestId(mount(), "live-hand-over"));
  const said = flashes
    .slice(before)
    .map((m) => textOf(m.msg))
    .join(" ");
  assert.ok(said.includes(RANG), `REGRESSION: the toast named the line from Settings, not the one rung: ${said}`);
  assert.ok(!said.includes(LINE), "and not the line Settings holds");
  assert.deepEqual(
    sent.map((r) => [r.method, r.path]),
    [["POST", "/api/v1/calls/c-live/hand-over"]],
    "the verb asked the route for this call",
  );
});

test("REGRESSION (A20): before Settings has been read, Pass the call to me stays pressable -- the server knows the line; only a line known to be missing disables it", () => {
  withLive([call()]);
  try {
    withFacts(undefined);
    const unread = byTestId(mount(), "live-hand-over");
    assert.equal(unread.props.disabled, false, "REGRESSION: it said to add a line the workspace may well have");
    assert.ok(!String(unread.props.title).includes("Add the business's own line"));
    withFacts({});
    fresh();
    const none = byTestId(mount(), "live-hand-over");
    assert.equal(none.props.disabled, true, "a line known to be missing still disables it");
    assert.ok(String(none.props.title).includes("Settings"));
  } finally {
    withFacts({ handoff_number: { value: LINE } });
  }
});

test("a link names the call it opens, and a call not among these says so, with a door to its transcript", () => {
  withLive([call(), ended()]);
  assert.match(
    textOf(headName(mount({ initialCallId: "c-done" }))),
    /Emily Chen/,
    "the linked call opens, not the one on the line",
  );
  withLive([call()]);
  const tree = mount({ initialCallId: "c-gone" });
  const notice = byTestId(tree, "live-missing");
  assert.ok(notice, "a call that isn't here is said to be missing");
  find(notice, (n) => n.type === "button" && textOf(n).includes("Conversations")).props.onClick();
  assert.equal(went.at(-1), "conversations/cv-c-gone");
});

test("REGRESSION: a call you opened that Live no longer holds says so -- the panel fell to another caller's call, End and Pass to me with it", () => {
  // `all.find(opened) || live[0] || recent[0]`: once the opened call left both lists, whoever was on the line took
  // the panel, controls and all, and nothing said the call on screen was not the one chosen.
  const ada = call({
    id: "c-live-2",
    conversation_id: "cv2",
    contact_id: "k2",
    contact: { display_name: "Ada Byron", wa_profile_name: null, phone_e164: "+16465550999" },
  });
  withLive([call(), ada]);
  const rows = callRows(mount());
  rows.find((r) => r.props["data-call-id"] === "c-live-2").props.onClick();
  assert.match(textOf(headName(mount())), /Ada Byron/, "Ada's call is open");
  // The next read no longer holds it: the page keeps what was chosen (the state is not reset, as a re-read's is not).
  setSurfaceValue("live", live([call()]));
  const tree = mount();
  assert.equal(headName(tree), null, "REGRESSION: Rosa's call opened in Ada's place");
  assert.equal(byTestId(tree, "live-hand-over"), null, "and no other call's controls stand under the notice");
  assert.match(textOf(byTestId(tree, "live-missing")), /has ended, and Live no longer holds it/);
  find(
    byTestId(tree, "live-missing"),
    (n) => n.type === "button" && textOf(n).includes("Conversations"),
  ).props.onClick();
  assert.equal(went.at(-1), "conversations/cv-c-live-2", "with the door to its transcript");
});

test("the call open is the address's: a row opens it by replacing the address, never a new entry, and a refresh opens the same call", () => {
  // The loading standard's E: Live read its call from the address once, on mount, and a click never wrote it -- so a
  // refresh opened whoever was on the line, and the crumbs kept naming the call the page was first opened on.
  const ada = call({
    id: "c-live-2",
    conversation_id: "cv2",
    contact_id: "k2",
    contact: { display_name: "Ada Byron", wa_profile_name: null, phone_e164: "+16465550999" },
  });
  withLive([call(), ada]);
  const navs = [];
  const keep = globalThis.window.appNavigate;
  globalThis.window.appNavigate = (to, opts) => navs.push([to, opts]);
  try {
    const rows = callRows(mount());
    rows.find((r) => r.props["data-call-id"] === "c-live-2").props.onClick();
    assert.deepEqual(
      navs,
      [["live/c-live-2", { replace: true }]],
      "replaced: Back leaves Live rather than replaying every call looked at",
    );
    const head = (tree) => textOf(headName(tree));
    // The shell hands the page the address it asked for (the page stays mounted: its route's `mount`, surfaces/live/routes.ts).
    assert.match(head(mount({ initialCallId: "c-live-2" })), /Ada Byron/, "the address names the call on screen");
    fresh();
    assert.match(head(mount({ initialCallId: "c-live-2" })), /Ada Byron/, "and a refresh opens it again");
  } finally {
    globalThis.window.appNavigate = keep;
  }
});

test("a call gone quiet says when it was last heard from, before the checking banner minutes later", () => {
  withLive([call({ updated_at: iso(40_000) })]);
  assert.match(textOf(headMeta(mount())), /last heard 4\d s ago/);
  withLive([call({ updated_at: iso(2_000) })]);
  assert.doesNotMatch(textOf(headMeta(mount())), /last heard/, "a call heard from seconds ago needs no line about it");
});

/* --------------------------- the shell's live bar --------------------------- */
// A call in progress is true for minutes a week, and it held a permanent slot in
// the phone tab bar -- 60px, with room for neither of the two controls a live
// call has. It is a bar across the top while it is happening instead.

const barAt = (calls, atMs = NOW) => liveBar(toLiveVM(calls, channels, ZONE, new Date(NOW)), atMs);

test("the bar says who is on the phone and how long, and draws nothing when nobody is", () => {
  assert.equal(barAt([ended()]), null, "REGRESSION: an ended call kept the bar up");
  assert.equal(barAt([]), null);
  const one = barAt([call()]);
  assert.equal(one.text, "On the phone now · Rosa", "the caller's first name, the Live page's own whoShort");
  assert.equal(one.callId, "c-live", "and a press opens that call, not the list");
  assert.ok(one.sinceMs >= 90_000 && one.sinceMs < 92_000, `running since it started — ${one.sinceMs}ms`);
  assert.equal(one.checking, false);
});

test("two calls are counted, not named, and open the list", () => {
  const two = barAt([
    call(),
    call({
      id: "c-live-2",
      conversation_id: "cv2",
      contact: { display_name: "Ada Byron", wa_profile_name: null, phone_e164: "+16465550999" },
    }),
  ]);
  assert.equal(two.text, "2 calls on your line now");
  assert.equal(two.callId, null, "no one call to open");
  assert.equal(two.sinceMs, null, "and no clock: whose would it be");
});

test("the heartbeat rule is applied between refreshes, by every reader, from here", () => {
  const vm = toLiveVM([call()], channels, ZONE, new Date(NOW));
  const c = vm.now[0];
  assert.equal(liveStillUp(c, vm.heartbeatMs, NOW), true);
  assert.equal(
    liveStillUp(c, vm.heartbeatMs, NOW + vm.heartbeatMs + 1),
    false,
    "REGRESSION: the phone tab counted `live` alone, so its badge stayed lit for a call nobody had heard from",
  );
  assert.equal(liveBar(vm, NOW + vm.heartbeatMs + 1), null, "and the bar leaves with it, before the next fetch");
  assert.equal(
    liveStillUp({ ...c, live: false }, vm.heartbeatMs, NOW),
    false,
    "a call the read already ended is never up",
  );
});

test("a call the provider has gone quiet about keeps the bar but loses the clock", () => {
  // Marked live, last heard from past LIVE_STALE_MS: toLiveCallVM sets `checking`.
  const quiet = barAt([call({ updated_at: iso(6 * 60_000) })]);
  assert.ok(quiet, "still on the line as far as anyone knows");
  assert.equal(quiet.checking, true);
  assert.equal(quiet.sinceMs, null, "REGRESSION: a number climbing for a call that may already have ended");
});

/* ----------------------- Live takes the Inbox's look ----------------------- */
// Live is a view of the Inbox's door (#655). It was a page of its own inside it: a title, a sub-headline
// and three stat cards above a 400px table of When · Length · From, with a "Recent" table of the calls
// Conversations › Calls already lists -- its own footer said so.

test("the list is who is on the phone right now: a finished call is no row here, and there is no second table of them", () => {
  withLive([call(), ended()]);
  const tree = mount();
  assert.deepEqual(
    callRows(tree).map((r) => r.props["data-call-id"]),
    ["c-live"],
    "REGRESSION: the ended call was a row in a Recent table",
  );
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
    "no table at all: the rows are the Inbox's shape",
  );
  assert.equal(byTestId(tree, "recent-row"), null);
});

test("a row says who, how long, and what they last said -- in the Inbox's three lines", () => {
  withLive([call()]);
  const row = callRows(mount())[0];
  const text = textOf(row);
  assert.match(text, /Rosa Díaz/);
  assert.match(text, /1:3\d/, "the running clock, from the call's real start");
  assert.match(text, /“Hi, is Marisa in today\?”/, "the caller's own last words, not the receptionist's");
  assert.ok(
    find(row, (n) => n.type === StatePill && n.props.value === "live"),
    "and the live pill",
  );
  // The receptionist usually has the last word -- the row still quotes the caller, which is what the call is about.
  withLive([
    call({
      transcript_object: [
        { role: "agent", content: "Thank you for calling Marisa's Beauty Salon!" },
        { role: "user", content: "Can I move my Saturday colour to Sunday?" },
        { role: "agent", content: "Let me check what Sunday has open." },
      ],
    }),
  ]);
  const quoted = textOf(callRows(mount())[0]);
  assert.match(
    quoted,
    /“Can I move my Saturday colour to Sunday\?”/,
    "REGRESSION: the row quoted the receptionist, not the caller",
  );
  assert.doesNotMatch(quoted, /Let me check/);
  withLive([call({ transcript_object: [] })]);
  assert.match(
    textOf(callRows(mount())[0]),
    /The receptionist has picked up/,
    "before the first words arrive, it says what is true",
  );
});

test("with nobody on the line the list says what the line is doing and opens Conversations › Calls; the panel still opens on the last call", () => {
  withLive([ended()]);
  went.length = 0;
  const tree = mount();
  assert.equal(callRows(tree).length, 0);
  assert.match(textOf(tree), /No call in progress\. The line is on/);
  const door = byTestId(tree, "live-to-calls");
  assert.ok(door, "the door to every call");
  door.props.onClick();
  assert.deepEqual(went, ["conversations/phone"], "REGRESSION: the calls were listed a second time here instead");
  assert.ok(byTestId(tree, "live-summary"), "what the last caller wanted is still one look away, in the panel");
});

test("the work first: no title, no sub-headline, no stat cards above the calls", () => {
  withLive([call(), ended()]);
  const tree = mount();
  assert.ok(StatCell && StatStrip, "the shell's stat cards are there to be drawn, and this page draws neither");
  assert.equal(
    find(tree, (n) => n.type === StatCell || n.type === StatStrip),
    null,
    "REGRESSION: three cards said what the list and the panel already say",
  );
  assert.equal(
    find(tree, (n) => n.props?.className === "cl-page-title"),
    null,
  );
  assert.ok(
    find(tree, (n) => n.props?.className === "lm-body lm-body-rows"),
    "the list takes the Inbox's width (live.css .lm-body-rows)",
  );
});

test("a door that names a finished call still opens it here, and one Live no longer holds says so", () => {
  withLive([call(), ended()]);
  assert.match(
    textOf(headName(mount({ initialCallId: "c-done" }))),
    /Emily Chen/,
    "the bar and Today's links open the call they name",
  );
  withLive([call()]);
  const notice = byTestId(mount({ initialCallId: "c-gone" }), "live-missing");
  assert.match(
    textOf(notice),
    /has ended, and Live no longer holds it/,
    "REGRESSION: it counted the calls 'shown here', which the list no longer shows",
  );
});

/* ------------------------ what the page draws, and where from ------------------------ */
// The page draws again when its surface moves: its calls read again, a turn, an end (the override says so on "surface:live",
// which the frame counts against the surface's key before React draws: hearSurfaces over the overrides' own events).

test("the page is drawn again when the live surface moves, and shows what the read now holds", () => {
  withLive([call()]);
  assert.equal(callRows(mount()).length, 1);
  quiet();
  setSurfaceValue("live", live([call(), call({ id: "c-live-2", contact: { display_name: "Ada Byron" } })]));
  assert.equal(redrawWanted(), false, "a value nobody has said moved is not yet a reason to draw");
  const stop = hearSurfaces([liveOverride], globalThis);
  try {
    globalThis.window.dispatchEvent({ type: "surface:today" });
    assert.equal(redrawWanted(), false, "another surface's read is not this page's");
    globalThis.window.dispatchEvent({ type: liveOverride.events[0] });
    assert.equal(redrawWanted(), true, "the surface's own event is a reason to draw again");
  } finally {
    stop();
  }
  assert.equal(callRows(mount()).length, 2, "and the next draw is the new read");
});

// The route draws the real page whenever the surface holds a value, a demo session draws the same page over a contracts
// sample (surfaces/live/sample.ts: the mockup's scripted console is gone), and a session with neither draws nothing.

test("the page draws what the surface holds; before its first read nothing, and in a demo session the sample", () => {
  withLive([call()]);
  assert.ok(byTestId(mount(), "live-real"), "a value the surface holds is the page");
  setSurfaceValue("live", undefined);
  fresh();
  assert.equal(mount(), null, "before the first read of a real workspace the page draws nothing");
  globalThis.window.__DEMO_MODE = true;
  try {
    fresh();
    const tree = mount();
    assert.ok(byTestId(tree, "live-real"), "a demo session draws the one Live page");
    assert.deepEqual(
      callRows(tree).map((r) => textOf(find(r, (n) => n.props?.className === "lm-row-who"))),
      ["Rosa Díaz"],
      "over the sample's call on the line, not a customer's",
    );
    assert.ok(byTestId(tree, "live-controls"), "with the controls a live call has");
    setSurfaceValue("live", live([]));
    fresh();
    assert.equal(callRows(mount()).length, 0, "a value the surface holds wins over the sample, even an empty one");
  } finally {
    globalThis.window.__DEMO_MODE = false;
  }
});
