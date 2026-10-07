/**
 * The moments a NEW playbook may start from (2 Oct 2026, the lifecycle set, "One message, every channel" step 1): the
 * Campaigns home (3 Oct 2026, which replaced the Playbooks list) and the playbook's check ask contracts momentOffered,
 * with the workspace's real calendar; the run never does, so a playbook already made on a moment no longer offered keeps
 * running. Executed: the predicate, the surface the home draws from, the moments the home offers to turn on (its view
 * model, campaignsHomeOf, over that surface), the composer's moment picker, and the run itself.
 *
 * The check's refusals are core-campaigns.test.mjs's, Ask's are ask-turn.test.mjs's, and a playbook counted by its message
 * is calendar-counts.test.mjs's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOMENTS_RETIRED,
  PLAYBOOK_TRIGGERS,
  WIN_BACK_WORDS,
  campaignsHomeOf,
  isWinBack,
  momentOffered,
  channelsReady,
  numberHealth,
  playbookPoolKey,
  stateOf,
  triggerOf,
  triggerOffered,
} from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
const NOW = Date.parse("2026-09-06T14:00:00Z");
const DAY = 86_400_000;

/** Every moment, offered or not, in the order the product lists them. */
const IDS = PLAYBOOK_TRIGGERS.map((t) => t.id);
/** The moments a new playbook may start from, for a workspace whose customers book (deals off), by its calendar. */
const OFFERED = (calendarOn, dealsOn = false) =>
  PLAYBOOK_TRIGGERS.filter((t) => momentOffered(t, { dealsOn, calendarOn })).map((t) => t.id);

test("which moments a new playbook may start from: none retired, the proposal's only where deals are on, and of the two win-backs the one the workspace can read -- while a playbook already on any of them may exist and run (triggerOffered)", () => {
  // Without a calendar: the win-back by silence. With one: by visits.
  assert.deepEqual(OFFERED(false), ["quiet_30", "everyone_monthly", "visit_tomorrow", "visited", "saved_list"]);
  assert.deepEqual(OFFERED(true), ["everyone_monthly", "visit_tomorrow", "visited", "lapsed", "saved_list"]);
  // Deals on add the proposal follow-up, in its place; a reach-out's two steps are never moments.
  assert.deepEqual(
    OFFERED(false, true),
    [...OFFERED(false), "proposal_waiting"].sort((a, b) => IDS.indexOf(a) - IDS.indexOf(b)),
  );
  for (const calendarOn of [false, true])
    for (const dealsOn of [false, true]) {
      const here = OFFERED(calendarOn, dealsOn);
      for (const id of ["new_week", "phoned_only", "lead_first", "after_step"])
        assert.ok(
          !here.includes(id),
          `${id}: never offered for a new playbook (calendar ${calendarOn}, deals ${dealsOn})`,
        );
      assert.equal(here.filter(isWinBack).length, 1, "one win-back, whichever way the workspace can read it");
    }
  // The two retired moments each carry their words, and are the whole set retired.
  assert.deepEqual(Object.keys(MOMENTS_RETIRED).sort(), ["new_week", "phoned_only"]);
  for (const words of Object.values(MOMENTS_RETIRED)) assert.ok(words.length > 40, words);
  assert.deepEqual(Object.keys(WIN_BACK_WORDS).sort(), ["lapsed", "quiet_30"]);
  // May exist and run is a wider question: a retired moment and the other win-back keep running.
  for (const id of ["new_week", "phoned_only", "quiet_30", "lapsed"])
    assert.equal(triggerOffered(triggerOf(id), false), true, `${id}: a playbook on it still runs`);
  assert.equal(
    triggerOffered(triggerOf("proposal_waiting"), false),
    false,
    "the proposal follow-up needs deals to run",
  );
  assert.deepEqual(
    PLAYBOOK_TRIGGERS.filter((t) => triggerOf(t.id).label === "Win-back").map((t) => t.id),
    ["quiet_30", "lapsed"],
    "both are called Win-back: one moment, read two ways",
  );
});

/* ------------------------------ the surface and the home ------------------------------ */

installLegacyReact({
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  __DEMO_MODE: false,
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const SRC = "../../../../../apps/dashboard/src";
const { playbooksOverride } = await import(`${SRC}/surfaces/campaigns/playbooks/surface.ts`);
const { surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

const EMPTY_POOL = { candidates: 0, held: 0, pool: 0, noYes: 0, stopped: 0, noNumber: 0, saidYes: 0 };
/** A playbook as GET playbooks hands it over (contracts PlaybookDto and what its runs earned). */
const row = (id, trigger, over = {}) => ({
  id,
  name: triggerOf(trigger).label,
  trigger,
  list_id: null,
  list_key: null,
  template_id: "tpl-1",
  template_name: "winback_reply",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  policy_class: triggerOf(trigger).cls,
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-08-01T00:00:00Z",
  totals: { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
const answer = (data) =>
  new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });

/** The surface the bridge builds from what GET playbooks answers for a workspace whose calendar is `calendar`. */
async function surfaceFor({ calendar, playbooks = [], pools = {}, dealsOn = false }) {
  const kept = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    if (path === "/api/v1/playbooks")
      return answer({
        playbooks,
        timezone: ZONE,
        pools: { ...Object.fromEntries(IDS.map((id) => [id, EMPTY_POOL])), ...pools },
        calendar,
        deals_on: dealsOn,
        lists: [],
        people_lists: [],
      });
    if (path === "/api/v1/templates") return answer({ templates: [] });
    if (path === "/api/v1/channels") return answer({ channels: [] });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1 });
  };
  try {
    await playbooksOverride.apply();
    return surfaceValue("playbooks");
  } finally {
    globalThis.fetch = kept;
  }
}
/**
 * The home over a surface (what its page draws, from the view model alone: campaigns-home.test.mjs draws the page), and the
 * moments it offers a Turn on for: a moment of its rail that is off, and a line under it that is (the month's offer), in the
 * order the home draws them. A moment to turn on is what a person is offered, so a playbook already on it leaves it out.
 */
const homeOf = (surface) => campaignsHomeOf({ nowMs: NOW, tz: ZONE, playbooks: surface });
const turnOns = (home) =>
  [...home.rail.stages.map((s) => s.act), ...home.strips.map((s) => s.act)]
    .filter((a) => a?.kind === "turn_on")
    .map((a) => a.moment);
const stageOf = (home, id) => home.rail.stages.find((s) => s.id === id);
/** The moments in the product's order, as the picker and the surface list them. */
const inOrder = (ids) => [...ids].sort((a, b) => IDS.indexOf(a) - IDS.indexOf(b));
/** What a new playbook may start from that the home carries: a list's moment is the composer's own choice, not a line. */
const ONHOME = (calendarOn, dealsOn = false) => OFFERED(calendarOn, dealsOn).filter((id) => id !== "saved_list");

test("the surface says which moments a new playbook may start from, by the workspace's calendar: connected counts whether or not its feed reads just now; every moment that may run stays, so a card can read its own", async () => {
  for (const [calendar, on] of [
    ["none", false],
    ["unavailable", true],
    ["ok", true],
  ]) {
    const s = await surfaceFor({ calendar });
    assert.equal(s.calendar, calendar);
    assert.deepEqual(
      s.triggers.map((t) => t.id),
      PLAYBOOK_TRIGGERS.filter((t) => triggerOffered(t, false)).map((t) => t.id),
      `${calendar}: every moment that may run here, the retired ones among them`,
    );
    assert.deepEqual(
      s.triggers.filter((t) => t.offered).map((t) => t.id),
      OFFERED(on),
      `${calendar}: the moments offered for a new playbook`,
    );
  }
  const deals = await surfaceFor({ calendar: "none", dealsOn: true });
  assert.ok(deals.triggers.find((t) => t.id === "proposal_waiting").offered, "deals on: the proposal follow-up");
});

test("the home's moments to turn on: none retired, and one win-back -- the one the workspace can read, and none at all when a playbook is on either", async () => {
  // A first day, no calendar: the win-back by silence among the moments, neither welcome nor save our number.
  assert.deepEqual(inOrder(turnOns(homeOf(await surfaceFor({ calendar: "none" })))), ONHOME(false));
  assert.deepEqual(
    inOrder(turnOns(homeOf(await surfaceFor({ calendar: "ok" })))),
    ONHOME(true),
    "a calendar: the one by visits",
  );
  assert.deepEqual(
    inOrder(turnOns(homeOf(await surfaceFor({ calendar: "none", dealsOn: true })))),
    ONHOME(false, true),
    "deals on: the proposal follow-up is a moment too",
  );
  // A playbook already made on a retired moment is still a line on the home, and is not offered again.
  const welcome = homeOf(
    await surfaceFor({
      calendar: "none",
      playbooks: [row("pb-welcome", "new_week"), row("pb-save", "phoned_only")],
    }),
  );
  assert.deepEqual(
    welcome.strips.filter((l) => l.id.startsWith("pb-")).map((l) => [l.id, l.name, l.act.kind]),
    [
      ["pb-welcome", "Welcome", "open"],
      ["pb-save", "Save our number", "open"],
    ],
    "a line each, as they were, to open",
  );
  assert.deepEqual(inOrder(turnOns(welcome)), ONHOME(false), "neither is a moment left to turn on");
  // One win-back: a playbook on either leaves none to turn on, whichever the workspace is offered now; it is the moment's.
  const winBack = async (trigger, calendar) => {
    const home = homeOf(await surfaceFor({ calendar, playbooks: [row("pb-win", trigger)] }));
    return [turnOns(home).filter(isWinBack), stageOf(home, "quiet").playbookId, stageOf(home, "quiet").act.kind];
  };
  assert.deepEqual(await winBack("quiet_30", "none"), [[], "pb-win", "open"]);
  assert.deepEqual(
    await winBack("quiet_30", "ok"),
    [[], "pb-win", "open"],
    "made by silence, a calendar connected since: not turned on again",
  );
  assert.deepEqual(await winBack("lapsed", "ok"), [[], "pb-win", "open"]);
  assert.deepEqual(
    await winBack("lapsed", "none"),
    [[], "pb-win", "open"],
    "made by visits, the calendar gone since: nor again",
  );
  // And with none made, exactly one of them is there: the one the workspace can read.
  assert.deepEqual(turnOns(homeOf(await surfaceFor({ calendar: "none" }))).filter(isWinBack), ["quiet_30"]);
  assert.deepEqual(turnOns(homeOf(await surfaceFor({ calendar: "ok" }))).filter(isWinBack), ["lapsed"]);
});

test("a playbook whose message makes it stricter than its moment is counted on its own key: the card reads its own count, and every other card the moment's", async () => {
  const counted = (n) => ({ ...EMPTY_POOL, pool: 2, candidates: n, saidYes: n });
  const s = await surfaceFor({
    calendar: "ok",
    playbooks: [row("pb-offer", "visited"), row("pb-check", "visited"), row("pb-reminder", "visit_tomorrow")],
    pools: { visited: counted(2), visit_tomorrow: counted(2), [playbookPoolKey("pb-offer")]: counted(1) },
  });
  const candidates = Object.fromEntries(s.rows.map((p) => [p.id, p.candidates]));
  assert.deepEqual(candidates, { "pb-offer": 1, "pb-check": 2, "pb-reminder": 2 });
  // One the route could not count under its own key is uncounted, never the moment's number.
  const unread = await surfaceFor({
    calendar: "ok",
    playbooks: [row("pb-offer", "visited")],
    pools: { visited: counted(2), [playbookPoolKey("pb-offer")]: null },
  });
  assert.equal(unread.rows[0].candidates, null);
  assert.equal(unread.triggers.find((t) => t.id === "visited").candidates, 2, "the moment is counted as ever");
});

/* ------------------------------ the composer's moment picker ------------------------------ */

const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
const { composerModel, composerOffered, composerOpened } = await import(
  `${SRC}/surfaces/campaigns/playbooks/composer-model.ts`
);

test("the composer's moment picker offers a new playbook the moments it may start from, and a playbook being changed its own as well, a retired moment's included", async () => {
  const choices = (data, editing = null) => {
    const f = composerOpened(editing, null, data);
    const model = composerModel({
      data,
      editing,
      offered: composerOffered(data.templates),
      templatesAll: data.templates,
      f,
      busy: false,
      error: null,
    });
    return { opens: f.trigger, picks: model.momentChoices.map((c) => c.id) };
  };
  const silence = await surfaceFor({ calendar: "none" });
  assert.deepEqual(choices(silence).picks, OFFERED(false), "a new playbook: what is offered");
  assert.equal(choices(silence).opens, "quiet_30", "and it opens on the first moment nothing is doing yet");
  const visits = await surfaceFor({ calendar: "ok" });
  assert.deepEqual(choices(visits).picks, OFFERED(true));
  // A playbook on a retired moment, opened to be changed: its own moment still reads as its own, among the offered.
  const withWelcome = await surfaceFor({ calendar: "none", playbooks: [row("pb-welcome", "new_week")] });
  const changing = choices(withWelcome, withWelcome.rows[0]);
  assert.equal(changing.opens, "new_week");
  assert.deepEqual(changing.picks, ["quiet_30", "new_week", ...OFFERED(false).slice(1)]);
  // And a new one beside it is not offered the retired moment again.
  assert.ok(!choices(withWelcome).picks.includes("new_week"));
  // The win-back made before a calendar was connected: its own moment, and the one by visits to move it to.
  const made = await surfaceFor({ calendar: "ok", playbooks: [row("pb-win", "quiet_30")] });
  assert.deepEqual(choices(made, made.rows[0]).picks, ["quiet_30", ...OFFERED(true)]);
  // A new playbook opens on a moment nothing is doing: with a win-back made, not on the other win-back.
  assert.equal(choices(made).opens, "everyone_monthly");
});

/* ------------------------------ the run ------------------------------ */

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");
const D = DAY;
const RUN_ZONE = "America/New_York";
/** A person as the People page reads them: said yes to messages, and to offers unless `offers` is false. */
const person = (id, { offers = true, ...over } = {}) => ({
  id,
  visitDays: [],
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555123000${id}`,
  consent: {
    state: "opted_in",
    dnc: false,
    label: "Opted in",
    sub: "",
    source: "in_person",
    marketing: offers ? "opted_in" : "unknown",
    marketingSource: "in_person",
    marketingSub: "",
  },
  lastContact: { ts: NOW - 40 * D, label: "" },
  heardDays: 40,
  ...over,
});
const dayOf = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: RUN_ZONE }).format(new Date(ms));
const stored = (over = {}) => ({
  id: "p1",
  tenant_id: "t1",
  name: "Playbook",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "after_visit",
  template_language: "en_US",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner",
  last_run_for: null,
  ...over,
});
const context = (over = {}) => ({
  tz: RUN_ZONE,
  now: new Date(NOW),
  people: [],
  modes: new Map([
    ["reengage", "auto"],
    ["booking", "auto"],
    ["campaign", "auto"],
  ]),
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  // Step 3: a run reads what the workspace can send on; WhatsApp alone, as every workspace was before the channels.
  ready: channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
  touches: { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() },
  calendar: "none",
  visits: new Map(),
  ...over,
});
/** Every port answers; the one write read is the broadcast the run assembles, with the people on it. */
const run = async (playbook, ctx, category) => {
  const assembled = [];
  const outcome = await runPlaybook(
    {
      // The message's rows (db messageVersionRowsOf): Meta's approved row, filed as `category`.
      message: async (name, language) => [
        {
          id: "tpl-1",
          channel: "whatsapp",
          name,
          language,
          meta_status: "approved",
          category,
          variables: [],
          hidden_at: null,
          title: null,
          source: "meta",
          components: [],
          body_preview: null,
          rejected_reason: null,
        },
      ],
      alreadyRan: async () => false,
      record: async () => {},
      assemble: async (_run, recipients) => {
        assembled.push(recipients.map((r) => r.contact_id).sort());
        return "b1";
      },
      decide: async () => {},
      notify: async () => {},
    },
    { playbook, ctx, runFor: dayOf(NOW), by: { kind: "system" } },
  );
  return { outcome, ids: assembled[0] ?? [] };
};

test("a playbook already made on a moment no longer offered keeps running: the run asks whether it may run, never whether it is offered", async () => {
  const phoned = (id, over = {}) => person(id, { hasChat: false, calls: 2, ...over });
  const r = await run(
    stored({ trigger: "phoned_only", name: "Save our number" }),
    context({ people: [phoned("a"), phoned("b", { offers: false })] }),
    "marketing",
  );
  assert.equal(r.outcome.outcome, "sent", "Save our number still runs");
  assert.deepEqual(r.ids, ["a"], "to the one who said yes to offers");
});

test("an After-the-visit playbook that still sends the marketing thank-you it was made with enrols only who said yes to offers; on a message about the visit, anyone who said yes to texts", async () => {
  // Made when the moment was a re-engagement (stored class reengage), moved since to the Bookings class: it must not start
  // enrolling people its message cannot reach.
  const yesterday = dayOf(NOW - D);
  const came = (id, over = {}) =>
    person(id, {
      calendarTz: RUN_ZONE,
      lastVisitDate: yesterday,
      lastVisitMs: NOW - D,
      visitDays: [{ date: yesterday, via: "phone" }],
      booked: false,
      ...over,
    });
  const people = [came("a"), came("b", { offers: false }), person("c")];
  const playbook = stored({ trigger: "visited", name: "After the visit", policy_class: "reengage" });
  const ctx = context({ people, calendar: "ok" });
  const offer = await run(playbook, ctx, "marketing");
  assert.equal(offer.outcome.outcome, "sent");
  assert.deepEqual(offer.ids, ["a"], "the offer reaches only the yes to offers");
  const unfiled = await run(playbook, ctx, null);
  assert.deepEqual(unfiled.ids, ["a"], "a message no channel ever filed is read as an offer, as the send reads it");
  const check = await run(playbook, ctx, "utility");
  assert.deepEqual(check.ids, ["a", "b"], "a message about the visit reaches everyone who said yes to texts");
});
