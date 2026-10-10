/**
 * A playbook's run, run: every branch through fakes that log their calls.
 * Until now the edge's runner was executed by no test; playbooks.test.mjs
 * pinned its text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAYBOOK_VETO_DELAY_MS,
  channelsReady,
  numberHealth,
  toPersonRowVM,
  touchesAfterRun,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");
const NOW = new Date("2026-09-06T14:00:00Z"); // 10:00 in New York
const TZ = "America/New_York";
const D = 86_400_000;
const WRITES = new Set(["record", "assemble", "holdRecipients", "notify"]);

/** A person as the People page reads them: quiet for 40 days, said yes to both. */
const person = (id, over = {}) => ({
  id,
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
    marketing: "opted_in",
    marketingSource: "in_person",
    marketingSub: "",
  },
  lastContact: { ts: NOW.getTime() - 40 * D, label: "" },
  ...over,
  // They wrote last when they were last in touch: Quiet 30+ days reads the days since (lists.ts).
  heardDays: over.heardDays ?? Math.round((NOW.getTime() - (over.lastContact?.ts ?? NOW.getTime() - 40 * D)) / D),
});
/** A person as people_list answers, with a calendar: the visit run reads their visits. */
const iso = (msAgo) => new Date(NOW.getTime() - msAgo).toISOString();
function dto(id, over = {}) {
  return {
    id,
    display_name: `Person ${id}`,
    wa_profile_name: null,
    phone_e164: `+1305555000${id}`,
    consent: "opted_in",
    consent_source: "keyword",
    consent_updated_at: iso(30 * D),
    dnc: false,
    marketing_consent: "opted_in",
    marketing_consent_source: "customer_message",
    marketing_consent_updated_at: iso(30 * D),
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: `cv-${id}`,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: iso(3 * D),
    last_message_at: iso(3 * D),
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "hi",
    last_inbound_at: iso(3 * D),
    last_call_at: null,
    last_inbound_call_at: null,
    last_inbound_call_summary: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: iso(60 * D),
    earliest_row_at: iso(60 * D),
    has_backfill: false,
    has_chat: true,
    queued_reply_at: null,
    effective_reply_mode: "auto",
    visits: null,
    ...over,
  };
}
const visit = (startIso, title) => ({
  id: `v-${startIso}`,
  start: startIso,
  end: new Date(Date.parse(startIso) + 3_600_000).toISOString(),
  title,
  all_day: false,
  via: "phone",
});

const playbook = (over = {}) => ({
  id: "p1",
  tenant_id: "t1",
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
  created_by: "owner",
  last_run_for: null,
  ...over,
});
/**
 * What the workspace can send on now, as the run reads it (contracts channelsReady): WhatsApp by its number, and by default
 * nothing else set up, as every workspace was before the channels.
 */
const ready = ({ textLine = null, mailbox = false, domain = false } = {}) =>
  channelsReady({ whatsapp: { canSend: true, refusal: null }, textLine, email: { mailbox, domain } });
const context = (over = {}) => ({
  tz: TZ,
  now: NOW,
  people: [person("a"), person("b", { lastContact: { ts: NOW.getTime() - 90 * D, label: "" } })],
  modes: new Map([["reengage", "auto"]]),
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  ready: ready(),
  touches: { byThis: new Map(), byAny: new Map() },
  calendar: "none",
  visits: new Map(),
  ...over,
});
const cmd = (over = {}) => ({
  playbook: playbook(),
  ctx: context(),
  runFor: "2026-09-06",
  by: { kind: "system" },
  ...over,
});
/** A run's reach with nobody named and nobody left out: every count a run keeps, at zero. */
const NOBODY_LEFT = {
  pool: 0,
  will: 0,
  noNumber: 0,
  stopped: 0,
  noYes: 0,
  heardThis: 0,
  heardAny: 0,
  overCap: 0,
  overLimit: 0,
  // Step 3: who it could not reach for want of an address, an address mail no longer goes to, or a channel, and who it reaches on each.
  no_address: 0,
  address_stopped: 0,
  no_channel: 0,
  by_channel: { whatsapp: 0, sms: 0, email: 0 },
};
/** Who a run reaches on each channel, WhatsApp alone: every run before the channels. */
const onWhatsApp = (n) => ({ whatsapp: n, sms: 0, email: 0 });

/** A template row as the port answers it (db messageVersionRowsOf): one version of a message, on its channel. */
const versionRow = (channel, over = {}) => ({
  id: `tpl-${channel}`,
  channel,
  name: "winback_offer",
  language: "en_US",
  meta_status: "approved",
  category: null,
  variables: [],
  hidden_at: null,
  title: null,
  source: channel === "whatsapp" ? "meta" : "chanlytics",
  components: [],
  body_preview: null,
  rejected_reason: null,
  ...over,
});
/**
 * The port's answer for a message: the rows the workspace holds of the name and language it is asked for. `whatsapp` is
 * Meta's row as it stands (null: the message has none), `own` the channels, of email and text, that hold a version of it,
 * and `ownCategory` the category those rows carry (the one a message with no WhatsApp row is read by).
 */
const messageOf =
  ({ whatsapp = { meta_status: "approved" }, own = [], ownCategory = null } = {}) =>
  (name, language) => [
    ...(whatsapp ? [versionRow("whatsapp", { name, language, ...whatsapp })] : []),
    ...own.map((channel) => versionRow(channel, { name, language, category: ownCategory })),
  ];

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    // The message's rows (db messageVersionRowsOf): Meta's approved row, and no email or text version of it.
    message: messageOf(),
    alreadyRan: false,
    record: undefined,
    // The run, its people, its job and its decision, whole (00381): the run's id, and the decision's when one was asked for.
    assemble: (_row, _recipients, _sendAt, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    // The month's allowance, counted before anyone is enrolled: what this workspace's campaigns have sent by email and by
    // text this month (none here), and the write that holds those past it the moment the run exists.
    monthSent: 0,
    holdRecipients: undefined,
    notify: undefined,
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]), of: (name) => log.filter((l) => l[0] === name) };
}

test("the mode decides: never runs nothing and says so; no row for the class means ask; a person who asks has decided, it sends now unless the class is never", async () => {
  const never = fakes();
  assert.deepEqual(await runPlaybook(never.ports, cmd({ ctx: context({ modes: new Map([["reengage", "never"]]) }) })), {
    outcome: "off",
    mode: "never",
    skipped: "never",
  });
  assert.deepEqual(never.log, [
    ["record", "p1", "2026-09-06", NOW, { run_for: "2026-09-06", by: "system", mode: "never", skipped: "never" }],
  ]);
  const noRow = fakes();
  const held = await runPlaybook(noRow.ports, cmd({ ctx: context({ modes: new Map() }) }));
  assert.equal(held.outcome, "held", "no row for the class is ask");
  assert.equal(noRow.of("assemble")[0][1].state, "pending_approval");
  assert.equal(noRow.of("assemble")[0][4], null, "a run that waits is made with no decision: its approval is one");
  const asked = fakes();
  const r = await runPlaybook(
    asked.ports,
    cmd({ ctx: context({ modes: new Map([["reengage", "ask"]]) }), by: { kind: "user", userId: "u1" } }),
  );
  assert.deepEqual(
    r,
    {
      outcome: "sent",
      broadcast_id: "b1",
      eligible: 2,
      mode: "ask",
      state: "scheduled",
      scheduled_for: NOW.toISOString(),
      moved_from: null,
    },
    "a person's run now sends now under ask, and says when",
  );
  assert.deepEqual(asked.of("assemble")[0][3], NOW);
  assert.deepEqual(asked.of("assemble")[0][1].created_by, "u1", "their run");
  assert.deepEqual(
    asked.of("assemble")[0][4],
    {
      by: { kind: "user", userId: "u1" },
      payload: {
        playbook_id: "p1",
        playbook: "Win-back",
        mode: "ask",
        recipients: 2,
        channels: ["whatsapp"],
        scheduled_for: NOW.toISOString(),
        run_now: true,
      },
    },
    "and their decision, written with the run",
  );
  const refused = fakes();
  assert.deepEqual(
    await runPlaybook(
      refused.ports,
      cmd({ ctx: context({ modes: new Map([["reengage", "never"]]) }), by: { kind: "user", userId: "u1" } }),
    ),
    { outcome: "off", mode: "never", skipped: "never" },
    "never is never, even asked",
  );
});

test("off before a single row: a template Meta withdrew, a flagged number, a run already made for the day (said once, not recorded twice), a visit playbook without its calendar", async () => {
  const withdrawn = fakes({ message: messageOf({ whatsapp: { meta_status: "rejected" } }) });
  assert.deepEqual(await runPlaybook(withdrawn.ports, cmd()), {
    outcome: "off",
    mode: "auto",
    skipped: "template_not_approved",
  });
  assert.deepEqual(withdrawn.ops(), ["record"]);
  const gone = fakes({ message: messageOf({ whatsapp: null }) });
  assert.equal((await runPlaybook(gone.ports, cmd())).skipped, "template_not_approved");
  const flagged = fakes();
  assert.deepEqual(
    await runPlaybook(
      flagged.ports,
      cmd({ ctx: context({ health: numberHealth({ quality: "RED", event: null, limit: "TIER_1K" }) }) }),
    ),
    { outcome: "off", mode: "auto", skipped: "number_flagged" },
  );
  assert.deepEqual(flagged.log[0][4], { run_for: "2026-09-06", by: "system", mode: "auto", skipped: "number_flagged" });
  const twice = fakes({ alreadyRan: true });
  assert.deepEqual(await runPlaybook(twice.ports, cmd()), {
    outcome: "off",
    mode: "auto",
    skipped: "already_ran_today",
  });
  assert.deepEqual(twice.ops(), [], "the day's run stands; nothing is recorded again");
  // No calendar connected is a final answer for the day: said, and recorded.
  const noCalendar = fakes();
  const p = playbook({ trigger: "visit_tomorrow", policy_class: "booking" });
  assert.deepEqual(
    await runPlaybook(
      noCalendar.ports,
      cmd({ playbook: p, ctx: context({ modes: new Map([["booking", "auto"]]), calendar: "none" }) }),
    ),
    { outcome: "off", mode: "auto", skipped: "no_calendar" },
  );
  assert.deepEqual(noCalendar.ops(), ["record"]);
});

test("a calendar that could not be READ is the run failing, not the day done: nothing is recorded, so the next sweep asks again -- as a template that could not be read is", async () => {
  const modes = new Map([["booking", "auto"]]);
  // Every moment that reads the calendar: the visit's two, and Lapsed's.
  for (const trigger of ["visit_tomorrow", "visited", "lapsed"]) {
    const blip = fakes();
    const p = playbook({ trigger, policy_class: trigger === "lapsed" ? "reengage" : "booking" });
    const ctx = context({ modes: new Map([...modes, ["reengage", "auto"]]), calendar: "unavailable" });
    assert.deepEqual(
      await runPlaybook(blip.ports, cmd({ playbook: p, ctx })),
      { outcome: "failed", error: "calendar: could not be read" },
      trigger,
    );
    assert.deepEqual(
      blip.ops(),
      [],
      `${trigger}: nothing recorded, so the day stays open and the next tick asks again`,
    );
  }
  // The same run, the calendar back: it goes, and the day is recorded as the run's own.
  const next = visit("2026-09-07T18:00:00Z", "Balayage");
  const row = toPersonRowVM(
    dto("a", { visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null } }),
    TZ,
    NOW,
  );
  const back = fakes();
  const r = await runPlaybook(
    back.ports,
    cmd({
      playbook: playbook({ trigger: "visit_tomorrow", policy_class: "booking", params: [{ kind: "visit_when" }] }),
      ctx: context({
        modes,
        calendar: "ok",
        people: [row],
        visits: new Map([["a", { timezone: TZ, source: "calendar", state: "ok", next, last: null }]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(back.ops(), ["assemble", "record"]);
});

test("a message that could not be read is the run failing, not the template withdrawn: nothing is recorded, so the next sweep asks again", async () => {
  const blip = fakes({ message: new Error("PostgREST blip") });
  assert.deepEqual(await runPlaybook(blip.ports, cmd()), { outcome: "failed", error: "template: PostgREST blip" });
  assert.deepEqual(blip.ops(), []);
});

test("who the run reaches: the trigger's list crossed with who said yes, longest-unheard first; the number's daily limit as a ceiling; nobody at all, recorded honestly", async () => {
  const rows = [
    person("a"),
    person("b", { lastContact: { ts: NOW.getTime() - 90 * D, label: "" } }),
    person("c", { consent: { state: "unknown", dnc: false } }),
    person("d", { state: "active", heardDays: 3 }),
  ];
  const { ports, of } = fakes();
  const r = await runPlaybook(ports, cmd({ ctx: context({ people: rows }) }));
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("assemble")[0][2], [
    { contact_id: "b", facts: null, channel: "whatsapp" },
    { contact_id: "a", facts: null, channel: "whatsapp" },
  ]);
  assert.equal(of("assemble")[0][1].recipient_count, 2);
  // And who it left out, kept on the run: three on the list, one of them never said yes.
  assert.deepEqual(of("assemble")[0][1].audience.reach, {
    ...NOBODY_LEFT,
    pool: 3,
    will: 2,
    noYes: 1,
    by_channel: onWhatsApp(2),
  });
  const capped = fakes();
  await runPlaybook(
    capped.ports,
    cmd({
      ctx: context({ people: rows, health: { canSend: true, tone: "ok", label: "", limitPerDay: 1, refusal: null } }),
    }),
  );
  assert.deepEqual(
    capped.of("assemble")[0][2].map((x) => x.contact_id),
    ["b"],
    "the day's limit is a ceiling, not a refusal",
  );
  assert.deepEqual(
    capped.of("assemble")[0][1].audience.reach,
    { ...NOBODY_LEFT, pool: 3, will: 1, noYes: 1, overLimit: 1, by_channel: onWhatsApp(1) },
    "and the one past it is counted, not dropped",
  );
  const nobody = fakes();
  assert.deepEqual(
    await runPlaybook(
      nobody.ports,
      cmd({ ctx: context({ people: [person("d", { state: "active", heardDays: 3 })] }) }),
    ),
    { outcome: "empty", eligible: 0, mode: "auto" },
  );
  assert.deepEqual(nobody.log, [
    [
      "record",
      "p1",
      "2026-09-06",
      NOW,
      { run_for: "2026-09-06", by: "system", mode: "auto", eligible: 0, reach: NOBODY_LEFT },
    ],
  ]);
});

test("a run counts everyone its moment named, each once, under the first rule that left them out -- so the counts add up to the list", async () => {
  const quiet = (id, daysAgo, over = {}) =>
    person(id, { lastContact: { ts: NOW.getTime() - daysAgo * D, label: "" }, ...over });
  const rows = [
    quiet("a", 90),
    quiet("b", 80, { phone: null }),
    quiet("c", 80, { consent: { state: "opted_in", dnc: true, marketing: "opted_in" } }),
    quiet("d", 80, { consent: { state: "opted_in", dnc: false, marketing: "unknown" } }),
    quiet("e", 80),
    quiet("f", 80),
    quiet("g", 60),
    quiet("h", 45),
    // No number AND no yes: counted once, under the first rule the run applies.
    quiet("i", 80, { phone: null, consent: { state: "unknown", dnc: false, marketing: "unknown" } }),
    person("j", { state: "active", heardDays: 3 }),
  ];
  const touches = {
    byThis: new Map([["p1", new Map([["e", NOW.getTime() - 10 * D]])]]),
    byAny: new Map([["f", NOW.getTime() - 2 * D]]),
  };
  const { ports, of } = fakes();
  await runPlaybook(ports, cmd({ playbook: playbook({ cap_per_run: 2 }), ctx: context({ people: rows, touches }) }));
  const reach = of("assemble")[0][1].audience.reach;
  assert.deepEqual(reach, {
    pool: 9,
    will: 2,
    noNumber: 2,
    stopped: 1,
    noYes: 1,
    heardThis: 1,
    heardAny: 1,
    overCap: 1,
    overLimit: 0,
    no_address: 0,
    address_stopped: 0,
    no_channel: 0,
    by_channel: onWhatsApp(2),
  });
  assert.equal(
    reach.will +
      reach.noNumber +
      reach.stopped +
      reach.noYes +
      reach.heardThis +
      reach.heardAny +
      reach.overCap +
      reach.overLimit,
    reach.pool,
    "the whole list, every person once",
  );
  assert.deepEqual(
    of("assemble")[0][2].map((x) => x.contact_id),
    ["a", "g"],
    "and who it reaches is what it always was: the longest unheard, to the cap",
  );
});

test("auto: the row, the people, the send now, the system's decision, the run recorded; veto: the send half an hour ahead with the same row", async () => {
  const { ports, log, of, ops } = fakes();
  const r = await runPlaybook(ports, cmd());
  assert.deepEqual(r, {
    outcome: "sent",
    broadcast_id: "b1",
    eligible: 2,
    mode: "auto",
    state: "scheduled",
    scheduled_for: NOW.toISOString(),
    moved_from: null,
  });
  assert.deepEqual(ops(), ["assemble", "record"]);
  assert.deepEqual(of("assemble")[0][1], {
    name: "Win-back · 2026-09-06",
    template_id: "tpl-1",
    template_name: "winback_offer",
    template_language: "en_US",
    params: [{ kind: "first_name" }],
    audience: {
      kind: "playbook",
      id: "p1",
      label: "Win-back",
      // The moment, which the month's allowance asks at the wire: a visit's message is never held by it.
      trigger: "quiet_30",
      reach: { ...NOBODY_LEFT, pool: 2, will: 2, by_channel: onWhatsApp(2) },
    },
    state: "scheduled",
    scheduled_for: NOW.toISOString(),
    recipient_count: 2,
    created_by: "owner",
    playbook_id: "p1",
    run_for: "2026-09-06",
    channels: ["whatsapp"],
  });
  assert.deepEqual(of("assemble")[0][3], NOW);
  assert.deepEqual(of("assemble")[0][4], {
    by: { kind: "system" },
    payload: {
      playbook_id: "p1",
      playbook: "Win-back",
      mode: "auto",
      recipients: 2,
      channels: ["whatsapp"],
      scheduled_for: NOW.toISOString(),
      run_now: false,
    },
  });
  assert.deepEqual(log.at(-1), [
    "record",
    "p1",
    "2026-09-06",
    NOW,
    {
      run_for: "2026-09-06",
      by: "system",
      mode: "auto",
      eligible: 2,
      reach: { ...NOBODY_LEFT, pool: 2, will: 2, by_channel: onWhatsApp(2) },
      broadcast_id: "b1",
      state: "scheduled",
    },
  ]);
  const veto = fakes();
  await runPlaybook(veto.ports, cmd({ ctx: context({ modes: new Map([["reengage", "veto"]]) }) }));
  const at = new Date(NOW.getTime() + PLAYBOOK_VETO_DELAY_MS);
  assert.deepEqual(veto.of("assemble")[0][3], at);
  assert.equal(veto.of("assemble")[0][1].scheduled_for, at.toISOString());
  // "Unless you stop it" is kept only for someone who is told: a run the sweep made under veto says it is on its way,
  // and when, by the business's clock. Until this nobody was told unless Campaigns happened to be open.
  assert.deepEqual(veto.ops(), ["assemble", "notify", "record"]);
  assert.deepEqual(veto.of("notify")[0].slice(1), [
    "Campaign “Win-back” sends today 10:30 AM: 2 people",
    "2 people will be sent “Win-back” today 10:30 AM. Stop the run on Today or in Campaigns before then if it should not go.",
    // The run it is about: the bell's row and the phone open that run, where Stop is (it named none, and opened Campaigns' home).
    "b1",
  ]);
  // Made past the day's hours, it goes at nine tomorrow, and the notice says which day: "9:00 AM" alone reads as gone.
  const late = fakes();
  await runPlaybook(
    late.ports,
    cmd({ ctx: context({ now: new Date("2026-09-07T01:00:00Z"), modes: new Map([["reengage", "veto"]]) }) }),
  );
  assert.equal(late.of("notify")[0][1], "Campaign “Win-back” sends tomorrow 9:00 AM: 2 people");
  // The run is made and on the ledger: a bell that fails does not cost the run its record.
  const deaf = fakes({ notify: new Error("the bell is down") });
  const made = await runPlaybook(deaf.ports, cmd({ ctx: context({ modes: new Map([["reengage", "veto"]]) }) }));
  assert.equal(made.outcome, "sent");
  assert.ok(deaf.ops().includes("record"), "the run is recorded all the same");
  // A run that goes at once has nothing to stop, and a person who asked for a run decided it: neither is told.
  assert.ok(!ops().includes("notify"), "auto says nothing on the bell");
  const asked = fakes();
  await runPlaybook(
    asked.ports,
    cmd({ ctx: context({ modes: new Map([["reengage", "veto"]]) }), by: { kind: "user", userId: "u1" } }),
  );
  assert.ok(!asked.ops().includes("notify"), "a person's own Run now is theirs");
});

test("never at 3 AM, whoever asks: a person's run now at eleven at night goes at nine, and the ledger says what was asked for", async () => {
  const night = new Date("2026-09-07T03:00:00Z"); // 23:00 in New York
  const nine = new Date("2026-09-07T13:00:00Z");
  const f = fakes();
  const r = await runPlaybook(f.ports, cmd({ ctx: context({ now: night }), by: { kind: "user", userId: "u1" } }));
  assert.equal(r.outcome, "sent");
  assert.deepEqual(f.of("assemble")[0][3], nine);
  assert.equal(f.of("assemble")[0][1].scheduled_for, nine.toISOString(), "the row says when it really goes");
  assert.equal(f.of("assemble")[0][4].payload.scheduled_for, nine.toISOString());
  assert.equal(
    f.of("assemble")[0][4].payload.moved_from,
    night.toISOString(),
    "and the ledger keeps what was asked for",
  );
  assert.equal(f.log.at(-1)[4].moved_from, night.toISOString());
  assert.deepEqual(
    [r.scheduled_for, r.moved_from],
    [nine.toISOString(), night.toISOString()],
    "and the person who asked is told when it really goes, and what they asked for",
  );
  const day = fakes();
  await runPlaybook(day.ports, cmd({ by: { kind: "user", userId: "u1" } }));
  assert.ok(!("moved_from" in day.of("assemble")[0][4].payload), "inside the hours nothing moves, and nothing says so");
});

test("ask: the row waits, nobody is scheduled, the owner is told in these words, the run recorded", async () => {
  const { ports, of, ops } = fakes();
  const r = await runPlaybook(ports, cmd({ ctx: context({ modes: new Map([["reengage", "ask"]]) }) }));
  assert.deepEqual(r, { outcome: "held", broadcast_id: "b1", eligible: 2, mode: "ask", state: "pending_approval" });
  assert.deepEqual(ops(), ["assemble", "notify", "record"]);
  assert.equal(of("assemble")[0][3], null, "a run that waits for a person has no job yet");
  assert.equal(of("assemble")[0][1].state, "pending_approval");
  assert.equal(of("assemble")[0][1].scheduled_for, NOW.toISOString());
  assert.deepEqual(of("notify")[0], [
    "notify",
    "Campaign “Win-back” is ready: 2 people",
    "2 people have become eligible for “Win-back”. Approve or skip the run on Today or in Campaigns. Nothing is sent until you do.",
    // The run that waits: the row opens it, where Approve and Skip are.
    "b1",
  ]);
  const one = fakes();
  await runPlaybook(one.ports, cmd({ ctx: context({ modes: new Map([["reengage", "ask"]]), people: [person("a")] }) }));
  assert.equal(one.of("notify")[0][1], "Campaign “Win-back” is ready: 1 person");
  assert.match(one.of("notify")[0][2], /^1 person has become eligible/);
});

test("a visit run keeps each person's words on their row, from the visit the run read", async () => {
  const next = visit("2026-09-07T18:00:00Z", "Balayage"); // tomorrow, 2:00 PM in New York
  const row = toPersonRowVM(
    dto("a", { visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null } }),
    TZ,
    NOW,
  );
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "first_name" }, { kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        modes: new Map([["booking", "auto"]]),
        calendar: "ok",
        people: [row],
        visits: new Map([["a", { timezone: TZ, source: "calendar", state: "ok", next, last: null }]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("assemble")[0][2], [
    {
      contact_id: "a",
      facts: { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" },
      channel: "whatsapp",
    },
  ]);
});

test("a visit read from the calendar keeps its appointment's key, its start and when the run read it on the row (decision 0002), so the send can ask whether it still stands; a visit with no key keeps the words alone", async () => {
  const next = { ...visit("2026-09-07T18:00:00Z", "Balayage"), key: "evt-1:1788804000000" };
  const read = { timezone: TZ, source: "calendar", state: "ok", next, last: null };
  const row = toPersonRowVM(dto("a", { visits: read }), TZ, NOW);
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        modes: new Map([["booking", "auto"]]),
        calendar: "ok",
        people: [row],
        visits: new Map([["a", read]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("assemble")[0][2][0].facts, {
    visit_when: "tomorrow at 2:00 PM",
    visit_service: "Balayage",
    appointment: "evt-1:1788804000000",
    visit_start: "2026-09-07T18:00:00Z",
    appointment_read_at: NOW.toISOString(),
  });
});

test("a person with a visit later today and another tomorrow is reminded of TOMORROW's: the run reads the visit on its day, not the next one (wiring review P2 14)", async () => {
  // Their next visit is today's, at 4 PM: "the next visit is tomorrow" was false, and tomorrow's reminder never went.
  const today = visit("2026-09-06T20:00:00Z", "Cut"); // today, 4:00 PM in New York
  const tomorrow = visit("2026-09-07T18:00:00Z", "Balayage"); // tomorrow, 2:00 PM
  const read = { timezone: TZ, source: "calendar", state: "ok", next: today, last: null, near: [today, tomorrow] };
  const row = toPersonRowVM(dto("a", { visits: read }), TZ, NOW);
  assert.deepEqual(
    row.visitDays.map((d) => d.date),
    ["2026-09-06", "2026-09-07"],
    "the row carries the day of each visit near today",
  );
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        modes: new Map([["booking", "auto"]]),
        calendar: "ok",
        people: [row],
        visits: new Map([["a", read]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent", "REGRESSION: nobody was named, the next visit being today's");
  assert.deepEqual(
    of("assemble")[0][2].map((x) => [x.contact_id, x.facts]),
    [["a", { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" }]],
    "the words are tomorrow's visit, never today's",
  );

  // A read made before the calendar kept the near visits has the next and the last only, and is read as it always was:
  // today's next visit names nobody for tomorrow.
  const old = { timezone: TZ, source: "calendar", state: "ok", next: today, last: null };
  const before = fakes();
  const r2 = await runPlaybook(
    before.ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        modes: new Map([["booking", "auto"]]),
        calendar: "ok",
        people: [toPersonRowVM(dto("a", { visits: old }), TZ, NOW)],
        visits: new Map([["a", old]]),
      }),
    }),
  );
  assert.notEqual(r2.outcome, "sent");
  assert.deepEqual(before.of("assemble"), [], "nobody named, as before");
});

test("two visits tomorrow, the first found by name alone and not surely theirs: the run names them for the second, and its words are the second's", async () => {
  // A person saved as "Maria" (a first name alone): an event titled "Maria Lopez" is found by name and is a guess, so it
  // never names them; their own visit, found by their number, does. The words were the first visit's of the day, the
  // guess included.
  const guess = { ...visit("2026-09-07T14:00:00Z", "Maria Lopez · Balayage"), via: "name" }; // 10:00 AM
  const theirs = visit("2026-09-07T19:00:00Z", "Trim"); // 3:00 PM, by their number
  const read = { timezone: TZ, source: "calendar", state: "ok", next: guess, last: null, near: [guess, theirs] };
  const row = toPersonRowVM(dto("a", { display_name: "Maria", visits: read }), TZ, NOW);
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
      }),
      ctx: context({
        modes: new Map([["booking", "auto"]]),
        calendar: "ok",
        people: [row],
        visits: new Map([["a", read]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(
    of("assemble")[0][2].map((x) => x.facts),
    [{ visit_when: "tomorrow at 3:00 PM", visit_service: "Trim" }],
    "REGRESSION: the words named the other Maria's 10:00 Balayage",
  );
  // With only the guess that day, nobody is named.
  const alone = { ...read, next: guess, near: [guess] };
  const none = fakes();
  await runPlaybook(
    none.ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }],
      }),
      ctx: context({
        modes: new Map([["booking", "auto"]]),
        calendar: "ok",
        people: [toPersonRowVM(dto("a", { display_name: "Maria", visits: alone }), TZ, NOW)],
        visits: new Map([["a", alone]]),
      }),
    }),
  );
  assert.deepEqual(none.of("assemble"), []);
});

test("a person seen yesterday and again this morning is thanked for YESTERDAY's visit: the latest visit alone is today's", async () => {
  const yesterday = visit("2026-09-05T15:00:00Z", "Balayage"); // yesterday, 11:00 AM in New York
  const thisMorning = visit("2026-09-06T12:00:00Z", "Trim"); // today, 8:00 AM, over by now
  const read = {
    timezone: TZ,
    source: "calendar",
    state: "ok",
    next: null,
    last: thisMorning,
    near: [yesterday, thisMorning],
  };
  const row = toPersonRowVM(dto("a", { visits: read }), TZ, NOW);
  const { ports, of } = fakes();
  const r = await runPlaybook(
    ports,
    cmd({
      playbook: playbook({ trigger: "visited", policy_class: "booking", params: [{ kind: "visit_service" }] }),
      ctx: context({
        modes: new Map([["booking", "auto"]]),
        calendar: "ok",
        people: [row],
        visits: new Map([["a", read]]),
      }),
    }),
  );
  assert.equal(r.outcome, "sent", "REGRESSION: the thank-you was never sent, the latest visit being this morning's");
  assert.deepEqual(
    of("assemble")[0][2].map((x) => x.facts),
    [{ visit_when: "yesterday", visit_service: "Balayage" }],
    "yesterday's service",
  );
});

test("a visit's service slot carries the service alone: the person's name comes out of the event's title, and a title that was only their name says \"your appointment\"", async () => {
  const run = async (title, over = {}) => {
    const next = visit("2026-09-07T18:00:00Z", title);
    const row = toPersonRowVM(
      dto("a", {
        display_name: "Maria Lopez",
        visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null },
        ...over,
      }),
      TZ,
      NOW,
    );
    const { ports, of } = fakes();
    const r = await runPlaybook(
      ports,
      cmd({
        playbook: playbook({
          trigger: "visit_tomorrow",
          policy_class: "booking",
          template_name: "visit_reminder",
          params: [{ kind: "visit_when" }, { kind: "visit_service" }],
        }),
        ctx: context({
          modes: new Map([["booking", "auto"]]),
          calendar: "ok",
          people: [row],
          visits: new Map([["a", { timezone: TZ, source: "calendar", state: "ok", next, last: null }]]),
        }),
      }),
    );
    assert.equal(r.outcome, "sent", title);
    return of("assemble")[0][2][0].facts;
  };
  assert.deepEqual(await run("Balayage · Maria Lopez"), {
    visit_when: "tomorrow at 2:00 PM",
    visit_service: "Balayage",
  });
  assert.equal((await run("Maria Lopez - Balayage")).visit_service, "Balayage");
  assert.equal((await run("Haircut with Maria Lopez")).visit_service, "Haircut");
  assert.equal((await run("Maria Lopez")).visit_service, "your appointment", "nothing left: no service words at all");
  assert.equal((await run("Balayage")).visit_service, "Balayage", "a title without a name is the service as it stands");
  // By their WhatsApp name, when no human gave one: the calendar matched it by that name, so that is the name that comes out.
  assert.equal(
    (await run("Gloss · Mari Lopez", { display_name: null, wa_profile_name: "Mari Lopez" })).visit_service,
    "Gloss",
  );
});

test("the people a run enrols are touched for the next run against the same read of the workspace: the week's breath holds between two moments in one hour", async () => {
  // The sweep reads the workspace once and runs every due playbook against it; its touches never changed between the runs,
  // so a second moment judged the breath from a snapshot that did not have the first one's people in it.
  const ctx = context({ people: [person("a"), person("b")], modes: new Map([["reengage", "auto"]]) });
  const first = fakes();
  const one = await runPlaybook(first.ports, cmd({ playbook: playbook({ id: "p1" }), ctx }));
  assert.deepEqual([one.outcome, one.eligible], ["sent", 2]);
  // The same two people, the same morning, another moment: the week's breath holds them.
  const second = fakes();
  const two = await runPlaybook(second.ports, cmd({ playbook: playbook({ id: "p2", name: "Lapsed" }), ctx }));
  assert.deepEqual(two, { outcome: "empty", eligible: 0, mode: "auto" });
  assert.equal(second.of("record")[0][4].reach.heardAny, 2, "left out for the breath, and counted so");
  assert.deepEqual(second.ops(), ["record"], "nobody enrolled: no run, no job");
  // At the moment the first run goes, by any playbook and by the first.
  assert.deepEqual(
    [...ctx.touches.byAny],
    [
      ["a", NOW.getTime()],
      ["b", NOW.getTime()],
    ],
  );
  assert.deepEqual(
    [...ctx.touches.byThis.get("p1")],
    [
      ["a", NOW.getTime()],
      ["b", NOW.getTime()],
    ],
  );
  assert.deepEqual([...ctx.touches.followUps], [], "not a proposal's follow-up");
  // A reminder for a visit is owed whatever else they heard (the run is daily and a visit is on one day): still reaches them.
  const next = visit("2026-09-07T18:00:00Z", "Balayage");
  const rows = ["a", "b"].map((id) =>
    toPersonRowVM(dto(id, { visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null } }), TZ, NOW),
  );
  const reminder = fakes();
  const visitCtx = {
    ...ctx,
    people: rows,
    calendar: "ok",
    visits: new Map(rows.map((r) => [r.id, { timezone: TZ, source: "calendar", state: "ok", next, last: null }])),
    modes: new Map([["booking", "auto"]]),
  };
  const r = await runPlaybook(
    reminder.ports,
    cmd({ playbook: playbook({ id: "p3", trigger: "visit_tomorrow", policy_class: "booking" }), ctx: visitCtx }),
  );
  assert.deepEqual([r.outcome, r.eligible], ["sent", 2]);
});

test("a run that was not made touches nobody, and one made to wait for a person touches its people from the moment it was made", async () => {
  // A run that failed to be assembled enrolled nobody: its people are free for the next playbook, and for tomorrow.
  const failedCtx = context({ people: [person("a")] });
  const failed = await runPlaybook(fakes({ assemble: new Error("insert refused") }).ports, cmd({ ctx: failedCtx }));
  assert.equal(failed.outcome, "failed");
  assert.deepEqual([...failedCtx.touches.byAny], []);
  // Ask mode: the run waits for a person, and its people are enrolled all the same.
  const askCtx = context({ people: [person("a")], modes: new Map([["reengage", "ask"]]) });
  const asked = await runPlaybook(fakes().ports, cmd({ ctx: askCtx }));
  assert.equal(asked.outcome, "held");
  assert.deepEqual([...askCtx.touches.byAny], [["a", NOW.getTime()]]);
});

test("the touches a run adds are new maps, the latest touch stands, and only a proposal's follow-up is one, kept by what it was about (0029)", () => {
  const SEO = "https://example.com/p/seo";
  const given = { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() };
  const after = touchesAfterRun(given, { playbookId: "pf", at: 5, followUp: true }, [
    { id: "a", deal: "d-seo", link: SEO },
    { id: "b", deal: null, link: SEO },
    { id: "c", deal: null, link: null },
  ]);
  assert.deepEqual(
    [...after.followUps],
    [
      ["a", 5],
      ["b", 5],
      ["c", 5],
    ],
  );
  assert.deepEqual(
    [...after.followUpKeys].map(([id, m]) => [id, [...m]]),
    [
      ["a", [["deal:d-seo", 5]]],
      ["b", [[`link:${SEO}`, 5]]],
      ["c", [["bare", 5]]],
    ],
    "by the deal it was about, else its link, else nothing kept",
  );
  assert.deepEqual(
    [...given.byAny, ...given.followUps, ...given.byThis, ...given.followUpKeys],
    [],
    "the touches handed in are left as they were",
  );
  const earlier = touchesAfterRun(after, { playbookId: "pf", at: 3, followUp: true }, [
    { id: "a", deal: "d-seo", link: SEO },
  ]);
  assert.deepEqual(
    [...earlier.byAny],
    [
      ["a", 5],
      ["b", 5],
      ["c", 5],
    ],
  );
  assert.equal(earlier.followUpKeys.get("a")?.get("deal:d-seo"), 5, "the latest stands, by what it was about too");
  assert.notEqual(earlier.followUpKeys.get("a"), after.followUpKeys.get("a"), "a person's keys are a new map too");
  const other = touchesAfterRun(given, { playbookId: "pg", at: 5, followUp: false }, [
    { id: "a", deal: "d-seo", link: SEO },
  ]);
  assert.deepEqual([...other.followUps, ...other.followUpKeys], [], "a run that follows nothing up keeps neither");
});

test('a reminder run asked for at night goes at nine and says "today": the words are relative to the moment the send goes; every visit is reminded, whatever the cap', async () => {
  const night = new Date("2026-09-07T03:00:00Z"); // 23:00 in New York, September 6
  const next = visit("2026-09-07T18:00:00Z", "Balayage"); // September 7, 2:00 PM in New York: tomorrow at eleven, today at nine
  const visits = new Map(
    ["a", "b", "c"].map((id) => [id, { timezone: TZ, source: "calendar", state: "ok", next, last: null }]),
  );
  const rows = ["a", "b", "c"].map((id) => toPersonRowVM(dto(id, { visits: visits.get(id) }), TZ, night));
  const f = fakes();
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: playbook({
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_name: "visit_reminder",
        params: [{ kind: "visit_when" }, { kind: "visit_service" }],
        cap_per_run: 1,
      }),
      ctx: context({ now: night, modes: new Map([["booking", "auto"]]), calendar: "ok", people: rows, visits }),
      by: { kind: "user", userId: "u1" },
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.equal(r.eligible, 3, "the cap is for offers: all three are reminded");
  assert.equal(r.moved_from, night.toISOString());
  assert.deepEqual(
    f.of("assemble")[0][2].map((e) => e.facts.visit_when),
    ["today at 2:00 PM", "today at 2:00 PM", "today at 2:00 PM"],
    "read at nine, the visit is today",
  );
});

test("a run that could not be written says so and stops: the run, its people and its job are one write, so nothing is left to fail and no decision is made", async () => {
  // They were three writes with a compensating fail between them; the transaction is proved against Postgres
  // (broadcasts/assemble-broadcast.db.test.mjs).
  const refused = fakes({ assemble: new Error("insert refused") });
  assert.deepEqual(await runPlaybook(refused.ports, cmd()), { outcome: "failed", error: "insert refused" });
  assert.deepEqual(refused.ops(), ["assemble"], "no decision, no notice, no record of a run that is not there");
});

/* ---- One message, every channel (step 3): a run goes by the channels its playbook ticks ---- */

/** A message about their visit, as Meta files it: a utility, which only the yes to messages is needed for. */
const UTILITY = { meta_status: "approved", category: "utility" };
const TEXT_LINE = { sms_state: "active", reg_mock: false };
/** A visit reminder, ticking all three channels: a message about their visit, which text and email carry. */
const reminder = (over = {}) =>
  playbook({
    trigger: "visit_tomorrow",
    policy_class: "booking",
    template_name: "visit_reminder",
    params: [{ kind: "first_name" }],
    channels: ["whatsapp", "sms", "email"],
    ...over,
  });
const NEXT_VISIT = visit("2026-09-07T18:00:00Z", "Balayage"); // tomorrow, 2:00 PM in New York
const LAST_VISIT = visit("2026-09-05T18:00:00Z", "Balayage"); // yesterday, 2:00 PM in New York
/** People with a visit tomorrow, as people_list reads them: what they can be reached by, said yes to, last wrote on. */
function visitors(specs, when = { next: NEXT_VISIT, last: null }) {
  const visits = new Map(specs.map(([id]) => [id, { timezone: TZ, source: "calendar", state: "ok", ...when }]));
  const people = specs.map(([id, over]) =>
    toPersonRowVM(
      dto(id, {
        visits: visits.get(id),
        // A yes to messages by WhatsApp and by text; a visit message by email needs none.
        consent_channels: ["whatsapp", "sms"],
        email: `${id}@example.com`,
        ...over,
      }),
      TZ,
      NOW,
    ),
  );
  return { people, visits };
}
const reminderCtx = (specs, over = {}) => ({
  ...visitors(specs),
  modes: new Map([["booking", "auto"]]),
  calendar: "ok",
  ready: ready({ textLine: TEXT_LINE, mailbox: true, domain: true }),
  ...over,
});

test("a run goes by the channels its playbook ticks: each person once, on the first that reaches them, written on their row; the row, the ledger and the reach say so", async () => {
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email", "sms"] }) });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: reminder(),
      ctx: context(
        reminderCtx([
          ["a", {}], // a number and an address, never wrote: WhatsApp, the first of the three
          ["b", { last_inbound_channel: "sms" }], // wrote by text last, and said yes by text: text
          ["c", { phone_e164: null }], // an address and no number: email
          ["d", { phone_e164: null, email: null }], // nowhere to send: held, and counted
        ]),
      ),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.equal(r.eligible, 3);
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.channel]),
    [
      ["a", "whatsapp"],
      ["b", "sms"],
      ["c", "email"],
    ],
    "each on one channel: the one they last wrote on first, else WhatsApp, text, email",
  );
  assert.deepEqual(row.channels, ["whatsapp", "sms", "email"]);
  assert.deepEqual(
    row.audience.reach,
    { ...NOBODY_LEFT, pool: 4, will: 3, noNumber: 1, by_channel: { whatsapp: 1, sms: 1, email: 1 } },
    "who it left out, and why, and who it reaches on each channel, adding up to the list",
  );
  assert.deepEqual(f.of("assemble")[0][4].payload.channels, ["whatsapp", "sms", "email"]);
});

test("the number's daily limit is Meta's: it holds WhatsApp's people alone, and an email or a text is never held for it", async () => {
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: reminder({ channels: ["whatsapp", "email"] }),
      ctx: context(
        reminderCtx(
          [
            ["a", {}],
            ["b", {}],
            ["c", { phone_e164: null }],
            ["d", { phone_e164: null }],
          ],
          { health: { canSend: true, tone: "ok", label: "", limitPerDay: 1, refusal: null } },
        ),
      ),
    }),
  );
  assert.equal(r.eligible, 3, "one of the two on WhatsApp is past the day's limit; both by email go");
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.channel]),
    [
      ["a", "whatsapp"],
      ["c", "email"],
      ["d", "email"],
    ],
  );
  assert.deepEqual(
    row.audience.reach,
    { ...NOBODY_LEFT, pool: 4, will: 3, overLimit: 1, by_channel: { whatsapp: 1, sms: 0, email: 2 } },
    "named, never dropped in silence, and the split still adds up to who it reaches",
  );
});

test("an address that bounced is counted as itself, not as no address and not as no channel: the run's reach says which, so the sheet can word each", async () => {
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: reminder({ channels: ["email"] }),
      ctx: context(
        reminderCtx([
          ["a", {}], // an address that works: email
          ["b", { email_suppressed_at: "2026-09-01T10:00:00Z" }], // on file, and mail to it has stopped
          ["c", { email: null }], // no address on file at all
        ]),
      ),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.equal(r.eligible, 1);
  const [, row] = f.of("assemble")[0];
  assert.deepEqual(row.audience.reach, {
    ...NOBODY_LEFT,
    pool: 3,
    will: 1,
    no_address: 1,
    address_stopped: 1,
    by_channel: { whatsapp: 0, sms: 0, email: 1 },
  });
});

test("a channel the workspace is not ready on, or the message has no version on, holds those people and never fails the playbook: nobody is rerouted", async () => {
  const people = [
    ["a", {}],
    ["b", {}],
  ];
  // Email only, no mailbox: nobody can be reached, the run says so and goes on.
  const noMailbox = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  assert.deepEqual(
    await runPlaybook(
      noMailbox.ports,
      cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx(people, { ready: ready() })) }),
    ),
    { outcome: "empty", eligible: 0, mode: "auto" },
  );
  assert.deepEqual(noMailbox.log.at(-1)[4].reach, { ...NOBODY_LEFT, pool: 2, no_channel: 2 });
  // Ready on email, but the message has no email version in this language: the same.
  const noVersion = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["sms"] }) });
  const held = await runPlaybook(
    noVersion.ports,
    cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx(people)) }),
  );
  assert.equal(held.outcome, "empty");
  assert.equal(noVersion.log.at(-1)[4].reach.no_channel, 2);
  // WhatsApp is ticked and not ready: the people it cannot reach go by the channel that can, never by none.
  const offWhatsApp = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const r = await runPlaybook(
    offWhatsApp.ports,
    cmd({
      playbook: reminder({ channels: ["whatsapp", "email"] }),
      ctx: context(
        reminderCtx(people, {
          ready: channelsReady({ whatsapp: null, textLine: null, email: { mailbox: true, domain: true } }),
        }),
      ),
    }),
  );
  assert.equal(r.eligible, 2);
  assert.deepEqual(
    offWhatsApp.of("assemble")[0][2].map((x) => x.channel),
    ["email", "email"],
  );
});

test("the number's health stops a run only when it ticks WhatsApp; a playbook made before ticks it alone, and the message is read once whatever the ticks", async () => {
  const flagged = numberHealth({ quality: "RED", event: null, limit: "TIER_1K" });
  const email = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const byEmail = await runPlaybook(
    email.ports,
    cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx([["a", {}]], { health: flagged })) }),
  );
  assert.equal(byEmail.outcome, "sent", "a run that does not tick WhatsApp never asks about its number");
  const both = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }) });
  const stopped = await runPlaybook(
    both.ports,
    cmd({
      playbook: reminder({ channels: ["whatsapp", "email"] }),
      ctx: context(reminderCtx([["a", {}]], { health: flagged })),
    }),
  );
  assert.equal(stopped.skipped, "number_flagged");
  // Made before the channels (no column, or none ticked): WhatsApp alone, and the message is read once, its email and
  // text versions among its rows, whatever the ticks.
  for (const channels of [undefined, null, []]) {
    const asked = [];
    const before = fakes({
      message: (name, language) => (
        asked.push([name, language]),
        messageOf({ whatsapp: UTILITY, own: ["email"] })(name, language)
      ),
    });
    const r = await runPlaybook(before.ports, cmd({ playbook: playbook({ channels }) }));
    assert.equal(r.outcome, "sent", String(channels));
    assert.deepEqual(before.of("assemble")[0][1].channels, ["whatsapp"]);
    assert.deepEqual(asked, [["winback_offer", "en_US"]], `${String(channels)}: the message, once`);
  }
  // A version that could not be looked for is the run failing, not a message without one: nothing is recorded.
  const blip = fakes({ message: new Error("PostgREST blip") });
  assert.deepEqual(
    await runPlaybook(
      blip.ports,
      cmd({ playbook: reminder({ channels: ["whatsapp", "email"] }), ctx: context(reminderCtx([["a", {}]])) }),
    ),
    { outcome: "failed", error: "template: PostgREST blip" },
  );
  assert.deepEqual(blip.ops(), []);
});

test("WhatsApp's template not approved holds WhatsApp's people alone: a run that also ticks email or text goes on for them, and stops on it only when nobody else is drawn", async () => {
  const rejected = { meta_status: "rejected", category: "utility" };
  const both = reminder({ channels: ["whatsapp", "sms", "email"] });
  // The people on email and text go on their versions; the person who has only WhatsApp is held, not drawn.
  const f = fakes({ message: messageOf({ whatsapp: rejected, own: ["email", "sms"] }) });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: both,
      ctx: context(
        reminderCtx([
          ["a", {}], // WhatsApp first, and said yes by text too: goes by text, the next channel that can carry it
          ["c", { phone_e164: null }], // an address and no number: email
          ["w", { consent_channels: ["whatsapp"], email: null }], // WhatsApp alone: nothing else reaches them
        ]),
      ),
    }),
  );
  assert.equal(r.outcome, "sent", "the run is not stopped by a template WhatsApp alone needs");
  assert.deepEqual(
    f.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [
      ["a", "sms"],
      ["c", "email"],
    ],
    "nobody is drawn on WhatsApp: its version of the message is not approved",
  );
  // A run that ticks WhatsApp and has nobody on email or text to draw stops on it, as it always did.
  const alone = fakes({ message: messageOf({ whatsapp: rejected, own: ["email", "sms"] }) });
  assert.deepEqual(
    await runPlaybook(
      alone.ports,
      cmd({ playbook: both, ctx: context(reminderCtx([["w", { consent_channels: ["whatsapp"], email: null }]])) }),
    ),
    { outcome: "off", mode: "auto", skipped: "template_not_approved" },
  );
  assert.deepEqual(alone.ops(), ["record"]);
  // A playbook that does not tick WhatsApp never asks about its template at all.
  const byEmail = fakes({ message: messageOf({ whatsapp: rejected, own: ["email"] }) });
  const e = await runPlaybook(
    byEmail.ports,
    cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx([["c", { phone_e164: null }]])) }),
  );
  assert.equal(e.outcome, "sent");
  // The number's health still stops a run that ticks WhatsApp, whatever else it ticks.
  const flagged = fakes({ message: messageOf({ whatsapp: rejected, own: ["email", "sms"] }) });
  const health = numberHealth({ quality: "RED", event: null, limit: "TIER_1K" });
  assert.equal(
    (await runPlaybook(flagged.ports, cmd({ playbook: both, ctx: context(reminderCtx([["a", {}]], { health })) })))
      .skipped,
    "number_flagged",
  );
});

/* ---- A message needs no WhatsApp row (lane 1): the run reads its message once, from the rows it has ---- */

/** The people a visit reminder reaches by text and email, and the two it leaves out: nowhere to send, and a yes on WhatsApp alone. */
const BY_TEXT_AND_EMAIL = [
  ["a", {}], // a number and an address, said yes by text too: text, the first of the two that is ticked
  ["c", { phone_e164: null }], // an address and no number: email
  ["d", { phone_e164: null, email: null }], // nowhere to send
  ["w", { consent_channels: ["whatsapp"], email: null }], // a yes on WhatsApp alone: neither text nor email reaches them
];

test("a message with no WhatsApp row runs on the channels it holds: ticks {email, sms} on an email and a text version filed utility draw everyone who said yes to messages, each on their channel, and nothing stops the run", async () => {
  const f = fakes({ message: messageOf({ whatsapp: null, own: ["email", "sms"], ownCategory: "utility" }) });
  const r = await runPlaybook(
    f.ports,
    cmd({ playbook: reminder({ channels: ["sms", "email"] }), ctx: context(reminderCtx(BY_TEXT_AND_EMAIL)) }),
  );
  assert.equal(r.outcome, "sent", "no WhatsApp row is no stop: the playbook does not tick WhatsApp");
  assert.equal(r.eligible, 2);
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.channel]),
    [
      ["a", "sms"],
      ["c", "email"],
    ],
    "each on the one channel that reaches them, the message's own versions: nobody on WhatsApp, which the message has no version on",
  );
  assert.deepEqual(row.channels, ["sms", "email"]);
  assert.deepEqual(
    row.audience.reach,
    { ...NOBODY_LEFT, pool: 4, will: 2, noNumber: 1, noYes: 1, by_channel: { whatsapp: 0, sms: 1, email: 1 } },
    "who it left out, each counted by why: no number or address to send to, and no yes on the channels it goes by",
  );
  // The message's own category is what the run enrols by: the same people on the same moment, the same rows filed as an
  // offer, and nobody who said yes only to messages is enrolled (a text carries no offers, an email's offer needs its own yes).
  const asOffer = fakes({ message: messageOf({ whatsapp: null, own: ["email", "sms"], ownCategory: "marketing" }) });
  const none = await runPlaybook(
    asOffer.ports,
    cmd({ playbook: reminder({ channels: ["sms", "email"] }), ctx: context(reminderCtx(BY_TEXT_AND_EMAIL)) }),
  );
  assert.deepEqual([none.outcome, none.eligible], ["empty", 0]);
  assert.deepEqual(asOffer.ops(), ["record"], "recorded as a run that found nobody, nothing made");
  // A row of its own that names no category is an offer, as the send reads it: the same.
  const unfiled = fakes({ message: messageOf({ whatsapp: null, own: ["email", "sms"] }) });
  const unread = await runPlaybook(
    unfiled.ports,
    cmd({ playbook: reminder({ channels: ["sms", "email"] }), ctx: context(reminderCtx(BY_TEXT_AND_EMAIL)) }),
  );
  assert.equal(unread.outcome, "empty");
});

test("a message with no WhatsApp row stops no run that does not tick WhatsApp, and one that does tick it holds WhatsApp's people alone: it stops on it only when WhatsApp is all the run goes by", async () => {
  const noWhatsApp = () => fakes({ message: messageOf({ whatsapp: null, own: ["email"], ownCategory: "utility" }) });
  const byEmail = noWhatsApp();
  assert.equal(
    (
      await runPlaybook(
        byEmail.ports,
        cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(reminderCtx([["c", { phone_e164: null }]])) }),
      )
    ).outcome,
    "sent",
  );
  // WhatsApp and email: the run goes on for email, and the person who has only WhatsApp is held, not drawn.
  const both = noWhatsApp();
  const r = await runPlaybook(
    both.ports,
    cmd({
      playbook: reminder({ channels: ["whatsapp", "email"] }),
      ctx: context(
        reminderCtx([
          ["c", { phone_e164: null }],
          ["w", { consent_channels: ["whatsapp"], email: null }],
        ]),
      ),
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(
    both.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [["c", "email"]],
  );
  assert.equal(
    both.of("assemble")[0][1].audience.reach.no_address,
    1,
    "the person WhatsApp alone reaches is held, counted by what the other channel lacks for them: an address",
  );
  // WhatsApp alone, with no WhatsApp version to send: the run stops on it, before anyone is drawn, as it did without a row.
  const alone = noWhatsApp();
  assert.deepEqual(
    await runPlaybook(
      alone.ports,
      cmd({ playbook: reminder({ channels: ["whatsapp"] }), ctx: context(reminderCtx([["a", {}]])) }),
    ),
    { outcome: "off", mode: "auto", skipped: "template_not_approved" },
  );
  assert.deepEqual(alone.ops(), ["record"]);
});

test("a message whose WhatsApp row is pending holds WhatsApp's people and nobody else: {whatsapp, email} goes on for email and holds the person only WhatsApp reaches; {whatsapp} alone stops on it", async () => {
  const pending = { meta_status: "pending", category: "utility" };
  const people = [
    ["a", {}], // a number and an address: WhatsApp is held, so email
    ["w", { consent_channels: ["whatsapp"], email: null }], // WhatsApp alone: held
  ];
  const both = fakes({ message: messageOf({ whatsapp: pending, own: ["email"] }) });
  const r = await runPlaybook(
    both.ports,
    cmd({ playbook: reminder({ channels: ["whatsapp", "email"] }), ctx: context(reminderCtx(people)) }),
  );
  assert.equal(r.outcome, "sent", "template_not_approved is not the outcome: someone is on email");
  assert.deepEqual(
    both.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [["a", "email"]],
  );
  assert.equal(
    both.of("assemble")[0][1].audience.reach.no_address,
    1,
    "the person only WhatsApp reaches is held, counted by the address they lack, never dropped in silence",
  );
  const alone = fakes({ message: messageOf({ whatsapp: pending, own: ["email"] }) });
  assert.deepEqual(
    await runPlaybook(
      alone.ports,
      cmd({ playbook: reminder({ channels: ["whatsapp"] }), ctx: context(reminderCtx(people)) }),
    ),
    { outcome: "off", mode: "auto", skipped: "template_not_approved" },
    "WhatsApp is all this run goes by, and its version is not approved",
  );
  assert.deepEqual(alone.ops(), ["record"]);
});

test("a message with no row of any channel is a message that is gone: nothing is held, so a run that ticks WhatsApp stops on it, and one by email alone finds nobody", async () => {
  const gone = () => fakes({ message: messageOf({ whatsapp: null }) });
  const people = reminderCtx([["a", {}]]);
  const alone = gone();
  assert.equal(
    (await runPlaybook(alone.ports, cmd({ playbook: reminder({ channels: ["whatsapp"] }), ctx: context(people) })))
      .skipped,
    "template_not_approved",
  );
  const both = gone();
  assert.equal(
    (
      await runPlaybook(
        both.ports,
        cmd({ playbook: reminder({ channels: ["whatsapp", "email"] }), ctx: context(people) }),
      )
    ).skipped,
    "template_not_approved",
    "nobody is drawn on a message that holds nothing, and WhatsApp is ticked",
  );
  const email = gone();
  assert.deepEqual(
    await runPlaybook(email.ports, cmd({ playbook: reminder({ channels: ["email"] }), ctx: context(people) })),
    { outcome: "empty", eligible: 0, mode: "auto" },
  );
});

/* ---- The month's allowance, at enrolment ---- */

/** A proposal's follow-up, ticking WhatsApp and email: a message that answers their own request, so email carries it. */
const followUp = (over = {}) =>
  playbook({
    trigger: "proposal_waiting",
    policy_class: "follow_up",
    template_name: "proposal_nudge",
    params: [{ kind: "first_name" }],
    channels: ["whatsapp", "email"],
    ...over,
  });
/** People with a proposal out ten days, as people_list reads them; the specs say who has no number (email only). */
function proposals(specs) {
  const people = specs.map(([id, over]) =>
    toPersonRowVM(
      dto(id, {
        deal_id: `deal-${id}`,
        deal_stage: "proposed",
        deal_service: "Remodel",
        deal_proposed_at: iso(10 * D),
        deal_amount_cents: 500_000,
        deal_proposal_url: `https://example.com/p/${id}`,
        last_inbound_at: iso(12 * D),
        consent_channels: ["whatsapp", "sms"],
        email: `${id}@example.com`,
        ...over,
      }),
      TZ,
      NOW,
    ),
  );
  return people;
}
const followUpCtx = (people, over = {}) => ({
  people,
  modes: new Map([["follow_up", "auto"]]),
  calendar: "none",
  dealsOn: true,
  pace: null,
  ready: ready({ textLine: TEXT_LINE, mailbox: true, domain: true }),
  touches: { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() },
  ...over,
});
const FOLLOW_UPS = [
  ["w", {}], // a number and an address: WhatsApp, which Meta limits and this never does
  ["e1", { phone_e164: null }], // an address and no number: email
  ["e2", { phone_e164: null }],
  ["e3", { phone_e164: null }],
];

test("a run counts the month before it enrolls: whoever is past the room is enrolled held, and the run's page says so up front", async () => {
  const asked = [];
  const f = fakes({
    message: messageOf({ whatsapp: UTILITY, own: ["email"] }),
    monthSent: (channel) => (asked.push(channel), 1999),
  });
  const r = await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx: context(followUpCtx(proposals(FOLLOW_UPS))) }));
  assert.equal(r.outcome, "sent");
  assert.equal(r.eligible, 4, "everyone is enrolled, the held among them");
  assert.deepEqual(asked, ["email"], "only the channel somebody goes by is counted, once, before the run is written");
  assert.deepEqual(f.ops(), ["assemble", "holdRecipients", "record"]);
  assert.deepEqual(
    f.of("holdRecipients")[0],
    ["holdRecipients", "b1", ["e2", "e3"], "month_allowance"],
    "one email left in the month: the first on email keeps it, the others are held, in the order drawn",
  );
  assert.equal(
    f.of("assemble")[0][1].audience.trigger,
    "proposal_waiting",
    "the run keeps its moment for the send's own check",
  );
  assert.equal(f.of("record")[0][4].held_for_allowance, 2, "and the run's record says how many");
  assert.equal("hold_unwritten" in f.of("record")[0][4], false);
});

test("a run is counted against the month it goes in: asked for at eleven on the last night of the month, it goes at nine on the first, and the new month's room is read", async () => {
  const lastNight = new Date("2026-10-01T03:00:00Z"); // 23:00 on 30 September in New York
  const nine = new Date("2026-10-01T13:00:00Z"); // 09:00 on 1 October
  const at = [];
  const f = fakes({
    message: messageOf({ whatsapp: UTILITY, own: ["email"] }),
    monthSent: (_channel, when) => (at.push(when), 0),
  });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: followUp(),
      ctx: context({ ...followUpCtx(proposals(FOLLOW_UPS)), now: lastNight }),
      by: { kind: "user", userId: "u1" },
    }),
  );
  assert.equal(r.outcome, "sent");
  assert.deepEqual(f.of("assemble")[0][3], nine, "the run goes at nine on the first");
  assert.deepEqual(
    at,
    [nine],
    "and the month it is counted against is the one it goes in, never the night it was asked for",
  );
});

test("a proposal's follow-up touches its people as one had, and not those the month's allowance holds: the next run against the same read neither follows the proposal up twice nor breathes on them", async () => {
  const ctx = context(followUpCtx(proposals(FOLLOW_UPS)));
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }), monthSent: 1999 });
  assert.equal((await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx }))).outcome, "sent");
  assert.deepEqual(
    [...ctx.touches.followUps.keys()].sort(),
    ["e1", "w"],
    "e2 and e3 are held for the month: skipped, touched by nothing",
  );
  assert.deepEqual([...ctx.touches.byAny.keys()].sort(), ["e1", "w"]);
});

test("a person with two proposals out (0029): the run follows up the one waiting longest, once, its words carry that proposal's link, and its touch keeps it, so the other is owed its own", async () => {
  // A remodel's proposal out twenty days and a kitchen's out ten, as people_list reads them: the row shows the newer,
  // and open_deals holds both, the newest first.
  const open = (id, service, days, url) => ({
    id,
    stage: "proposed",
    service,
    proposed_at: iso(days * D),
    decided_at: null,
    ended_at: null,
    amount_cents: null,
    per: null,
    currency: "USD",
    proposal_url: url,
    valid_until: null,
    lost_reason: null,
  });
  const KITCHEN = "https://example.com/p/kitchen";
  const REMODEL = "https://example.com/p/remodel";
  const both = toPersonRowVM(
    dto("w", {
      deal_id: "deal-k",
      deal_stage: "proposed",
      deal_service: "Kitchen",
      deal_proposed_at: iso(10 * D),
      deal_proposal_url: KITCHEN,
      open_deals: [open("deal-k", "Kitchen", 10, KITCHEN), open("deal-r", "Remodel", 20, REMODEL)],
      last_inbound_at: iso(25 * D),
      consent_channels: ["whatsapp", "sms"],
      email: "w@example.com",
    }),
    TZ,
    NOW,
  );
  const ctx = context(followUpCtx([both]));
  const f = fakes({ message: messageOf({ whatsapp: UTILITY, own: ["email"] }), monthSent: 0 });
  const r = await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx }));
  assert.deepEqual([r.outcome, r.eligible], ["sent", 1], "one person, one message, whatever they have out");
  const [, , recipients] = f.of("assemble")[0];
  assert.deepEqual(
    recipients.map((x) => [x.contact_id, x.facts?.proposal_link, x.facts?.deal_id]),
    [["w", REMODEL, "deal-r"]],
    "the one waiting longest, with its own link and its deal, though their row shows the kitchen's",
  );
  assert.deepEqual(
    [...(ctx.touches.followUpKeys.get("w") ?? new Map()).keys()],
    ["deal:deal-r"],
    "the touch keeps which proposal it was about: the kitchen's is still owed its own",
  );
});

test("a hold that could not be written leaves the people queued: the run is made, and its record says so", async () => {
  const f = fakes({
    message: messageOf({ whatsapp: UTILITY, own: ["email"] }),
    monthSent: 2000,
    holdRecipients: new Error("write failed"),
  });
  const r = await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx: context(followUpCtx(proposals(FOLLOW_UPS))) }));
  assert.equal(r.outcome, "sent");
  const record = f.of("record")[0][4];
  assert.equal(record.held_for_allowance, 3);
  assert.equal(record.hold_unwritten, 3, "queued, and held at the wire all the same");
});

test("a visit reminder and the check after a visit are never held by the month: they are not even counted against it", async () => {
  for (const trigger of ["visit_tomorrow", "visited"]) {
    const f = fakes({
      message: messageOf({ whatsapp: UTILITY, own: ["email", "sms"] }),
      monthSent: new Error("a visit's message never asks the month"),
    });
    // The reminder reads tomorrow's visit; the check after a visit reads yesterday's, when nothing is booked next.
    const when = trigger === "visit_tomorrow" ? { next: NEXT_VISIT, last: null } : { next: null, last: LAST_VISIT };
    const specs = FOLLOW_UPS.map(([id]) => [id, id === "w" ? {} : { phone_e164: null }]);
    const r = await runPlaybook(
      f.ports,
      cmd({
        playbook: reminder({ trigger, channels: ["whatsapp", "email"] }),
        ctx: context({ ...reminderCtx(specs), ...visitors(specs, when) }),
      }),
    );
    assert.equal(r.outcome, "sent", `${trigger}: ${JSON.stringify(r)}`);
    assert.equal(r.eligible, 4);
    assert.equal(f.of("holdRecipients").length, 0, `${trigger}: nobody held, with the month used up many times over`);
    assert.equal(f.of("assemble")[0][1].audience.trigger, trigger, "and the send knows it is one");
  }
});

test("a booking moment that sends an OFFER is metered like any other: the exemption is a message about a visit, never the moment's", async () => {
  // A playbook made before messages were checked against their moments: a visit moment whose message is an offer. Its run
  // enrols by the stricter purpose (an offer), so it is metered as an offer is, and the send's own check says the same.
  const OFFER = { meta_status: "approved", category: "marketing" };
  const offersOpen = channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
  });
  const specs = [
    ["e1", { phone_e164: null, email_marketing: "opted_in" }],
    ["e2", { phone_e164: null, email_marketing: "opted_in" }],
  ];
  const asked = [];
  const f = fakes({
    message: messageOf({ whatsapp: OFFER, own: ["email"] }),
    monthSent: (channel) => (asked.push(channel), 2000),
  });
  const r = await runPlaybook(
    f.ports,
    cmd({
      playbook: reminder({ channels: ["email"] }),
      ctx: context({ ...reminderCtx(specs), ready: offersOpen }),
    }),
  );
  assert.equal(r.outcome, "sent", JSON.stringify(r));
  assert.equal(r.eligible, 2);
  assert.deepEqual(asked, ["email"], "the month is counted: an offer is not exempt, whatever its moment");
  assert.deepEqual(f.of("holdRecipients")[0], ["holdRecipients", "b1", ["e1", "e2"], "month_allowance"]);
  assert.equal(f.of("record")[0][4].held_for_allowance, 2);
  assert.equal(
    f.of("assemble")[0][1].audience.trigger,
    "visit_tomorrow",
    "and the send reads the same moment and message",
  );
});

test("a month that could not be counted is not room: the run fails, records nothing, and the next sweep counts again", async () => {
  const f = fakes({
    message: messageOf({ whatsapp: UTILITY, own: ["email"] }),
    monthSent: new Error("rpc: connection reset"),
  });
  const r = await runPlaybook(f.ports, cmd({ playbook: followUp(), ctx: context(followUpCtx(proposals(FOLLOW_UPS))) }));
  assert.equal(r.outcome, "failed");
  assert.match(r.error, /^month: rpc: connection reset/);
  assert.deepEqual(f.ops(), [], "no run, no people, no job, no record: nothing says the day was spent");
  // A run by WhatsApp alone has nobody to count for: it never asks.
  const wa = fakes({ message: messageOf({ whatsapp: UTILITY }), monthSent: new Error("never asked") });
  const ok = await runPlaybook(
    wa.ports,
    cmd({ playbook: followUp({ channels: ["whatsapp"] }), ctx: context(followUpCtx(proposals([["w", {}]]))) }),
  );
  assert.equal(ok.outcome, "sent");
});
