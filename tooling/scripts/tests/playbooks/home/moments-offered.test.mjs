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
  triggerWords,
  winBackWords,
  campaignsHomeOf,
  isWinBack,
  momentOffered,
  momentReadsCalendar,
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
  // Without a calendar: the win-back by silence, and no appointment moment (D44). With one: by visits, and both.
  assert.deepEqual(OFFERED(false), ["quiet_30", "everyone_monthly", "saved_list"]);
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
  assert.deepEqual(Object.keys(winBackWords("appointment")).sort(), ["lapsed", "quiet_30"]);
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

test("an appointment moment is offered only where a calendar is connected: without one it would skip every day (D44)", () => {
  for (const dealsOn of [false, true]) {
    assert.equal(
      OFFERED(false, dealsOn).some((id) => triggerOf(id).kind === "visit"),
      false,
      `deals ${dealsOn}: no calendar, no appointment moment`,
    );
    assert.deepEqual(
      OFFERED(true, dealsOn).filter((id) => triggerOf(id).kind === "visit"),
      ["visit_tomorrow", "visited"],
    );
  }
  assert.equal(
    triggerOffered(triggerOf("visit_tomorrow"), false),
    true,
    "one made before keeps running: the run never asks",
  );
});

test("the moments a calendar decides are one set: the two win-backs and the appointment moments, and no other moment's offer turns on it", () => {
  assert.deepEqual(
    PLAYBOOK_TRIGGERS.filter(momentReadsCalendar).map((t) => t.id),
    ["quiet_30", "visit_tomorrow", "visited", "lapsed"],
  );
  for (const dealsOn of [false, true]) {
    const outside = (calendarOn) => OFFERED(calendarOn, dealsOn).filter((id) => !momentReadsCalendar(triggerOf(id)));
    assert.deepEqual(outside(false), outside(true), `deals ${dealsOn}: the calendar changes nothing else`);
  }
});

test("a trigger says its label and hint in the workspace's word, and so do the win-back's refusals", () => {
  const t = (id) => triggerOf(id);
  assert.deepEqual(triggerWords(t("visit_tomorrow"), "meeting"), {
    label: "Meeting reminder",
    hint: "The day before a meeting on the calendar",
  });
  assert.deepEqual(triggerWords(t("visited"), "lesson"), {
    label: "After the lesson",
    hint: "The day after a lesson, when nothing is booked next",
  });
  assert.deepEqual(triggerWords(t("lapsed"), "session"), {
    label: "Win-back",
    hint: "No session in 45 days, and nothing booked",
  });
  assert.deepEqual(triggerWords(t("quiet_30"), "session"), { label: "Win-back", hint: "Nothing heard in 30 days" });
  assert.deepEqual(
    [t("visit_tomorrow").label, t("visited").label, t("lapsed").hint],
    ["Appointment reminder", "After the appointment", "No appointment in 45 days, and nothing booked"],
    "the constant says the default word: a workspace that never picked reads appointment (D42)",
  );
  const visits = winBackWords("visit");
  assert.equal(
    visits.lapsed,
    "The win-back by visits needs your calendar, and none is connected. Start the one that goes by silence: nothing heard in 30 days.",
  );
  assert.equal(
    visits.quiet_30,
    "A calendar is connected here, so the win-back goes by visits: no visit in 45 days, and nothing booked. Start that one.",
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
const { setSurfaceValue, surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

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

/**
 * The surface the bridge builds from what GET playbooks answers for a workspace whose calendar is `calendar`; `shape` is
 * what the answer says of the business beside it (its word and its booking tool), absent from a server from before them.
 * `settings` is what the settings surface has published of the templates, the one read of them (offered-templates.ts): by default
 * none, as before the settings read has landed. `settingsAnswer` is what GET settings answers beside the config (whether the
 * Google listing keeps a review link), absent from an older server; `channels` is GET channels' lines.
 */
async function surfaceFor({
  calendar,
  playbooks = [],
  pools = {},
  dealsOn = false,
  shape = {},
  settings = undefined,
  channels = [],
  settingsAnswer = {},
}) {
  // The settings read and the channels read, as they would have landed: the playbooks surface asks for neither (S10-9), and
  // takes the business's name and the listing's review link from the one, the number from the other.
  setSurfaceValue(
    "settings",
    settings && {
      ...settings,
      settings: {
        config: { brain: { business_name: "Northside Studio" } },
        version: 1,
        broken: null,
        reviewLink: settingsAnswer.review_link === true,
      },
    },
  );
  setSurfaceValue("channels", { rows: channels });
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
        ...shape,
      });
    // No GET templates is served: the playbooks surface asks for none (its templates are the settings read's, set above).
    if (path === "/api/v1/channels") return answer({ channels });
    return answer({ config: { brain: { business_name: "Northside Studio" } }, version: 1, ...settingsAnswer });
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
 * moments it offers a Turn on for: a moment of its rail that is off, and a row of its ledger that is (the month's offer), in
 * the order the home draws them. A moment to turn on is what a person is offered, so a playbook already on it leaves it out.
 * A group's own add (another campaign on a moment that holds many, a list's in Lists & offers) is `addOf`'s.
 */
const homeOf = (surface) => campaignsHomeOf({ nowMs: NOW, tz: ZONE, playbooks: surface, shape: surface.shape });
const turnOns = (home) =>
  [...home.rail.stages.map((s) => s.act), ...home.ledger.groups.flatMap((g) => g.rows.map((r) => r.act))]
    .filter((a) => a?.kind === "turn_on")
    .map((a) => a.moment);
/** The moment a ledger group's Turn on adds a campaign on, or null where it adds none. */
const addOf = (home, id) => {
  const add = home.ledger.groups.find((g) => g.id === id)?.add;
  return add?.kind === "turn_on" ? add.moment : null;
};
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

test("the surface publishes the business's shape and says every appointment moment in its word: the one GET playbooks answers, else the one derivation over how its customers buy (a server from before the word)", async () => {
  const reminder = row("pb-r", "visit_tomorrow");
  const after = row("pb-a", "visited", { run_hour: 18 });
  // The word the server answers is the one said, on the cards, their schedules and the moments offered.
  const session = await surfaceFor({
    calendar: "ok",
    playbooks: [reminder, after],
    shape: { appointment_word: "session", bookings_by_email: false },
  });
  assert.deepEqual(session.shape, { calendar: "feed", dealsOn: false, word: "session" });
  assert.deepEqual(
    session.rows.map((p) => [p.triggerLabel, p.triggerHint, p.schedule]),
    [
      [
        "Session reminder",
        "The day before a session on the calendar",
        "Daily 10:00 AM · everyone with a session tomorrow · up to 25",
      ],
      [
        "After the session",
        "The day after a session, when nothing is booked next",
        "Daily 6:00 PM · everyone who had a session yesterday · up to 25",
      ],
    ],
  );
  assert.deepEqual(
    session.triggers.filter((t) => t.kind === "visit").map((t) => [t.label, t.hint]),
    [
      ["Session reminder", "The day before a session on the calendar"],
      ["After the session", "The day after a session, when nothing is booked next"],
    ],
  );
  assert.equal(session.triggers.find((t) => t.id === "lapsed").hint, "No session in 45 days, and nothing booked");
  // A server from before the word: a workspace whose customers get a proposal first says meeting, and one that books says
  // appointment, as the server would (contracts appointmentWordOf); no calendar, bookings by email, is said so.
  const before = await surfaceFor({ calendar: "none", dealsOn: true, playbooks: [reminder] });
  assert.deepEqual(before.shape, { calendar: "none", dealsOn: true, word: "meeting" });
  assert.equal(before.rows[0].triggerLabel, "Meeting reminder");
  const byEmail = await surfaceFor({
    calendar: "none",
    shape: { appointment_word: "appointment", bookings_by_email: true },
  });
  assert.deepEqual(byEmail.shape, { calendar: "email", dealsOn: false, word: "appointment" });
  // Every other moment says its own words, whatever the word.
  assert.equal(session.triggers.find((t) => t.id === "quiet_30").label, triggerOf("quiet_30").label);
});

test("the call's text is said only where the settings read says whether there is one: before it is read the home says nothing, never 'No message for it yet'", async () => {
  const callText = (s) =>
    campaignsHomeOf({ nowMs: NOW, tz: ZONE, playbooks: s, shape: s.shape, library: s.library })
      .ledger.groups.flatMap((g) => g.rows)
      .find((r) => r.id === "call_text");
  // Settings is not read yet (the call's text and the Library are its read's, offered-templates.ts): not known, so not said, and not failed.
  const before = await surfaceFor({ calendar: "ok" });
  assert.equal(before.library, undefined);
  assert.equal(before.templates, undefined, "the composer is still reading, not told that none is approved");
  assert.equal(before.messages, null);
  assert.deepEqual([callText(before).stateWords, callText(before).tone], ["", "plain"]);
  assert.equal(
    campaignsHomeOf({ nowMs: NOW, tz: ZONE, playbooks: before, shape: before.shape, library: before.library }).failed
      .templates,
    null,
  );
  // Settings found no call's text among the WhatsApp rows (contracts bookingTemplate): that is a fact, and the row says it.
  const none = await surfaceFor({ calendar: "ok", settings: { templatesAll: [], templateVersions: [], messages: [] } });
  assert.deepEqual(none.library, []);
  assert.deepEqual(none.templates, []);
  assert.deepEqual([callText(none).stateWords, callText(none).tone], ["No message for it yet", "warn"]);
  // And when it lands after the surface was read, the surface is made of it again with no read of its own.
  setSurfaceValue("settings", {
    templatesAll: [
      {
        id: "t-call",
        channel: "whatsapp",
        name: "call_text",
        language: "en_US",
        meta_status: "approved",
        hidden_at: null,
        category: "utility",
        variables: [],
        blocked: null,
      },
    ],
    templateVersions: [],
    messages: [],
  });
  assert.deepEqual(
    surfaceValue("playbooks").library?.map((t) => t.name),
    ["call_text"],
  );
  setSurfaceValue("settings", undefined);
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
    welcome.ledger.groups
      .flatMap((g) => g.rows)
      .filter((r) => r.id.startsWith("pb-"))
      .map((r) => [r.id, r.name, (r.act ?? r.open).kind]),
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
  // A moment holds many campaigns: its group adds another, and only on the win-back the workspace can read now, whichever
  // the one made stands on.
  const addOn = async (trigger, calendar) =>
    addOf(homeOf(await surfaceFor({ calendar, playbooks: [row("pb-win", trigger)] })), "quiet");
  assert.deepEqual([await addOn("lapsed", "none"), await addOn("quiet_30", "ok")], ["quiet_30", "lapsed"]);
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

/* ------------------------------ the listing's review link ------------------------------ */

// The composer's moment picker and its slots went with its Every time (the closed-loop audit of 17 Oct 2026, G): which slot
// a moment can fill is contracts slotChoices's (message-version-slots.test.mjs), and New sequence makes a moment's sequence.

test("the surface says the Google listing keeps a review link only where GET settings says so; a server from before it says none", async () => {
  const linkOf = async (settingsAnswer) =>
    (await surfaceFor({ calendar: "ok", settings: { templatesAll: [], templateVersions: [] }, settingsAnswer }))
      .reviewLink;
  assert.equal(await linkOf({ review_link: true }), true);
  assert.equal(await linkOf({ review_link: false }), false);
  assert.equal(await linkOf({}), false, "a server from before GET settings said it says nothing of the listing: none");
  setSurfaceValue("settings", undefined);
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
        return { id: "b1", decisionId: null };
      },
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

/**
 * 10 Oct 2026 (Ask, the marketing manager, task 4): what the surface makes of GET playbooks' answer for the home (the
 * business's shape, each card's next run, why it runs nothing here, its list archived and its trigger's words, which
 * moments a new campaign may start from, whether every moment was counted, and the WhatsApp line) is contracts' one
 * reading (lifecycle-inputs.ts), which Ask's campaigns.journey reads too. Pinned as the surface made it before that
 * reading moved, over two answers on one clock: a calendar that cannot be read just now, its own lists (one archived),
 * one of People's, one deleted, a follow-up where deals are off and a paused win-back; and a server whose lists could not
 * be read, with no calendar, its bookings by a tool's emails, and a moment it could not count.
 */
test("the home's input from GET playbooks is the one reading it was: the shape, each card's next run, off, archived list and trigger words, the moments a new campaign may start from, whether every moment was counted, and the WhatsApp line", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const composed = (s) => ({
    shape: s.shape,
    timezone: s.timezone,
    calendar: s.calendar,
    countsRead: s.countsRead,
    rows: s.rows.map((r) => [r.id, r.listArchived, r.triggerLabel, r.next, r.off]),
    offered: s.triggers.filter((x) => x.offered).map((x) => x.id),
    number: s.number.present,
  });
  const lists = [
    { id: "L1", name: "Regulars", smart: false, archived: true },
    { id: "L2", name: "Walk-ins", smart: true, archived: false },
  ];
  const first = await surfaceFor({
    calendar: "unavailable",
    playbooks: [
      row("pb-remind", "visit_tomorrow", { run_hour: 15 }),
      row("pb-own", "saved_list", { list_id: "L1" }),
      row("pb-people", "saved_list", { list_key: "lapsed" }),
      row("pb-gone", "saved_list", { list_id: "L9" }),
      row("pb-follow", "proposal_waiting"),
      row("pb-back", "lapsed", { state: "paused" }),
    ],
    shape: {
      timezone: "America/Los_Angeles",
      lists,
      people_lists: [{ key: "lapsed", label: "Lapsed customers", group: "journey" }],
      appointment_word: "session",
      bookings_by_email: true,
    },
    channels: [{ kind: "whatsapp", status: "active", number_e164: "+13055550100" }],
  });
  const second = await surfaceFor({
    calendar: "none",
    playbooks: [
      row("pb-own", "saved_list", { list_id: "L1" }),
      row("pb-quiet", "quiet_30", { run_hour: 9, last_run_for: "2026-09-06" }),
    ],
    pools: { quiet_30: null },
    shape: { lists: null, bookings_by_email: true, timezone: "" },
    channels: [{ kind: "whatsapp", status: "disconnected" }],
  });
  const FOLLOW =
    "Proposal follow-ups need deals: in Settings › Business, answer “How customers buy” with “Some get a proposal first”.";
  assert.deepEqual(composed(first), {
    shape: { calendar: "feed", dealsOn: false, word: "session" },
    timezone: "America/Los_Angeles",
    calendar: "unavailable",
    countsRead: true,
    rows: [
      ["pb-remind", false, "Session reminder", "today 3:00 PM", null],
      ["pb-own", true, "Regulars", "today 10:00 AM", null],
      ["pb-people", false, "Lapsed customers", "today 10:00 AM", null],
      ["pb-gone", false, "A list that was deleted", "today 10:00 AM", null],
      ["pb-follow", false, "Proposal follow-up", "today 10:00 AM", FOLLOW],
      ["pb-back", false, "Win-back", "paused", null],
    ],
    offered: ["everyone_monthly", "visit_tomorrow", "visited", "lapsed", "saved_list"],
    number: true,
  });
  assert.deepEqual(composed(second), {
    shape: { calendar: "email", dealsOn: false, word: "appointment" },
    timezone: "America/New_York",
    calendar: "none",
    countsRead: false,
    rows: [
      ["pb-own", false, "A list that could not be read", "today, within the hour", null],
      ["pb-quiet", false, "Win-back", "tomorrow 9:00 AM", null],
    ],
    offered: ["quiet_30", "everyone_monthly", "saved_list"],
    number: false,
  });
  // The rail counts its covered moments once, as numbers, and its words and the head's sentence say that count: the
  // receptionist and the running reminder, of first contact, the day before and after, the follow-up held where deals
  // are off, and quiet.
  const home = homeOf(first);
  assert.deepEqual(
    [home.rail.covered, home.rail.of, home.rail.coveredWords, home.head.sentence[0]],
    [2, 5, "2 of 5 moments covered", { b: "2 of 5" }],
  );
});
