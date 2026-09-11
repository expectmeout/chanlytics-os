# Core, group three: campaigns — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run's assembly — the broadcast row, the people on it, the send job — has one implementation in `packages/core/src/campaigns/`, and the two things that assemble a run today, the edge's playbook run and the dashboard's broadcast route, are rules in core over ports with adapters at their doors. The approve, the cancel and the playbook's check come with them, so every campaign verb is run by a test.

**Architecture:** Same shape as [group one](2026-09-11-core-conversation-verbs.md) and [group two](2026-09-11-core-the-send-path.md): `verb(ports, cmd)`, ports named for what they mean, `AppError` for the person's mistakes (the dashboard verbs), outcomes for the sweep's (the run never throws: a throw would end the hourly sweep for every workspace behind it), no database client, framework, provider or environment inside a verb. New here: two callers share one kernel, `assembleRun`, and a fourth kind of adapter — the edge's `lib/playbooks.ts` keeps the read that builds the run's context once per tenant and becomes the run's ports.

**Tech Stack:** TypeScript, `packages/core` (tsup, dist committed; the edge imports the dist through `apps/edge/lib/workspace/core.ts`, `packages/jobs` bundles it), `node:test` with hand-written fakes.

---

## Why this group next

- The playbook run on the edge is the one assembly no test executes. `playbooks.test.mjs` pins ten lines of its text, `visit-playbooks` five, `billing-pause` and `notifications-durable` one each, and none of them run a branch: the mode that decides whether a run sends, holds or does nothing; a person's "run now" overriding the mode; the daily limit as a ceiling; a run already made for the day; the visit run's words kept on each row; the three ways a run's assembly can fail and what the row then says. Those rules decide what goes out on its own every hour.
- The dashboard's broadcast route and the playbook check carry the same template-and-values judgement twice, nearly verbatim (`broadcasts/route.ts:78-114`, `server/playbooks.ts:101-135`), and the two assemblies have drifted: the route chunks recipients, the run does not; the run writes why a row failed, the route does not; the run writes the ledger directly, the route through `recordDecision`. One kernel ends the drift.
- After this group every campaign verb — make, run, approve, cancel, check — is a rule in core; the source-scan baseline falls by the pins above.

## Files

- Create: `packages/core/src/campaigns/ports.ts`, `assemble.ts`, `run-playbook.ts` (PR 1); `template-values.ts`, `create-broadcast.ts`, `approve.ts`, `cancel.ts`, `check-playbook.ts` (PR 2); `index.ts`.
- Modify: `packages/core/src/index.ts` (export the group); `apps/edge/lib/playbooks.ts` (the loader stays, the run becomes the adapter); `apps/dashboard/app/api/v1/broadcasts/route.ts`, `broadcasts/[id]/approve/route.ts`, `broadcasts/[id]/cancel/route.ts`, `apps/dashboard/src/server/playbooks.ts` (adapters); `tooling/scripts/tests/hygiene.test.mjs` (the wall covers `campaigns`).
- Create: `apps/dashboard/src/server/campaign-ports.ts` (the dashboard's adapter; the tables are there).
- Test: `tooling/scripts/tests/core-run-playbook.test.mjs` (PR 1), `tooling/scripts/tests/core-campaigns.test.mjs` (PR 2); `outbound-routes.test.mjs` keeps running the dashboard adapters through `route()`.

Two PRs: Task 1 (the run, and the kernel it needs) and Task 2 (the dashboard's four).

---

### Task 1: The playbook run and the assembly (PR 1)

**Files:** `packages/core/src/campaigns/ports.ts`, `assemble.ts`, `run-playbook.ts`, `index.ts`; `packages/core/src/index.ts`; `apps/edge/lib/playbooks.ts`; `tooling/scripts/tests/core-run-playbook.test.mjs`, `hygiene.test.mjs`, `playbooks.test.mjs`, `visit-playbooks.test.mjs`.

- [x] **Step 1: The ports** — `packages/core/src/campaigns/ports.ts`:

```ts
/**
 * The campaigns' view of the world: what a run's assembly, a playbook's run
 * and a person's broadcast need, named for what each means. The adapters
 * that know the tables are apps/edge/lib/playbooks.ts (the run, hourly or at
 * a person's request) and apps/dashboard/src/server/campaign-ports.ts (a
 * person's broadcast, approve, cancel, the playbook's check).
 */
import type { Audience, DecisionSubject, DecisionVerb, NumberHealth, ParamSpec, PersonRowVM, PersonVisitsDto } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";

/* ---- The assembly: the rows, then the job ---- */

/** A broadcast row as it is made: the assembly writes exactly these columns. */
export interface NewBroadcast {
  name: string;
  template_id: string;
  template_name: string;
  template_language: string;
  params: ParamSpec[];
  audience: Audience;
  state: "scheduled" | "pending_approval";
  scheduled_for: string;
  recipient_count: number;
  created_by: string | null;
  playbook_id?: string;
  run_for?: string;
}
/** One person on the run, with the words their row keeps for the slots (a visit run's), or none. */
export interface NewRecipient { contact_id: string; facts: Record<string, string> | null }

export interface AssemblePorts {
  /** The broadcast row, its id back; throws when it cannot be written. */
  create(row: NewBroadcast): Promise<string>;
  /** The people on it, all of them in one call (the adapter chunks); throws when they cannot be written. */
  enrol(broadcastId: string, rows: NewRecipient[]): Promise<void>;
  /** The row says why it failed. */
  fail(broadcastId: string, failure: string): Promise<void>;
  /** The send job, as this tenant, through the ledger; throws when the ledger refuses. */
  schedule(broadcastId: string, at: Date): Promise<void>;
}
export interface AssembleCommand { broadcast: NewBroadcast; recipients: NewRecipient[]; sendAt: Date | null }
export type Assembled =
  | { ok: true; id: string }
  | { ok: false; id: string | null; failure: "run_not_created" | "recipients_write_failed" | "schedule_failed"; error: string };

/* ---- The playbook's run ---- */

/** The playbook as its row reads. A run names only what it uses. */
export interface PlaybookRow {
  id: string;
  tenant_id: string;
  name: string;
  trigger: string;
  template_id: string;
  template_name: string;
  template_language: string;
  params: unknown;
  policy_class: string;
  state: string;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
  created_by: string | null;
  last_run_for: string | null;
}

/** The workspace as the run reads it once per tenant: the people, the modes, the number, the touches, the calendar. */
export interface RunContext {
  tz: string;
  now: Date;
  people: PersonRowVM[];
  modes: Map<string, string>;
  health: NumberHealth;
  /** When each person last heard from each playbook, and from any; contact id → ms. */
  touches: { byThis: Map<string, Map<string, number>>; byAny: Map<string, number> };
  /** The workspace's calendar: a visit playbook runs only when it is "ok". */
  calendar: "ok" | "unavailable" | "none";
  /** Each person's next and last visit from that calendar, for the words a visit run keeps. */
  visits: Map<string, PersonVisitsDto>;
}

/** Who asked: the sweep (system) or a person (their decision, sends now unless the class is never). */
export type RunBy = { kind: "system" } | { kind: "user"; userId: string };

export type RunOutcome =
  | { outcome: "sent" | "held"; broadcast_id: string; eligible: number; mode: string; state: string }
  | { outcome: "empty"; eligible: 0; mode: string }
  | { outcome: "off"; mode: string; skipped: "never" | "template_not_approved" | "number_flagged" | "already_ran_today" | "no_calendar" }
  | { outcome: "failed"; error: string };

export interface RunPlaybookPorts extends AssemblePorts {
  /** The template as Meta has it now, by name and language; null when gone. */
  template(name: string, language: string): Promise<{ meta_status: string | null } | null>;
  /** Whether a run for this local day was already made (the unique index's fact, read first). */
  alreadyRan(playbookId: string, runFor: string): Promise<boolean>;
  /** The run recorded: the event, and the playbook's last run. Never throws. */
  record(playbookId: string, runFor: string, at: Date, data: Record<string, unknown>): Promise<void>;
  /** The ledger: whose decision the send was. */
  decide(d: { broadcastId: string; by: RunBy; payload: Record<string, unknown> }): Promise<void>;
  /** The owner told that a run waits for them. */
  notify(subject: string, body: string): Promise<void>;
}
export interface RunPlaybookCommand {
  playbook: PlaybookRow;
  ctx: RunContext;
  /** The local day the run is for; one run per playbook per day. Read from the clock when absent. */
  runFor?: string;
  by: RunBy;
}

/* ---- The dashboard's verbs (Task 2) ---- */

/** The template as Meta holds it, read by id in this workspace. */
export interface TemplateRow { id: string; name: string; language: string; meta_status: string | null; category: string | null; variables: unknown; title: string | null }

export interface TemplateValuesPorts {
  /** Null when there is no such template here; throws when it cannot be read. */
  template(id: string): Promise<TemplateRow | null>;
  /** The booking link on file, or null. */
  bookingLink(): Promise<string | null>;
}

/** A run or broadcast as the route's scope loaded it. */
export interface BroadcastRef { id: string; tenant_id: string; state: string; name: string; recipient_count: number | null; playbook_id: string | null }

export interface CreateBroadcastPorts extends AssemblePorts, TemplateValuesPorts {
  /** Everyone, with their visits as of now, the way the People page counts them. */
  people(now: Date): Promise<PersonRowVM[]>;
  /** A list kept by hand: its name and who is on it; null when there is no such list here. */
  savedList(id: string): Promise<{ name: string; memberIds: string[] } | null>;
  /** The active WhatsApp number's health as Meta rated it; null when none is connected. */
  number(): Promise<NumberHealth | null>;
  record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}
export interface CreateBroadcastCommand { userId: string; body: unknown; now: Date }

export interface ApproveRunPorts {
  /** pending_approval → scheduled, only while pending. True iff a row changed. */
  release(broadcastId: string): Promise<boolean>;
  /** Back to waiting, when the job could not be made. */
  hold(broadcastId: string): Promise<void>;
  schedule(broadcastId: string, at: Date): Promise<void>;
  record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}

export interface CancelBroadcastPorts {
  /** The scheduled send withdrawn from the ledger; how many jobs. */
  withdraw(broadcastId: string): Promise<number>;
  /** → canceled, only from the state the row was read in. True iff a row changed. */
  cancel(broadcastId: string, fromState: string): Promise<boolean>;
  record(subject: DecisionSubject, id: string, verb: DecisionVerb, payload: Json): Promise<string>;
}
```

- [x] **Step 2: The kernel** — `packages/core/src/campaigns/assemble.ts`:

```ts
import type { AssembleCommand, AssemblePorts, Assembled } from "./ports";

/**
 * A run's assembly, the one implementation: the broadcast row, then the
 * people on it, then the send job when the plan sends now or later. A stage
 * that fails names itself on the row, so a failed run reads why on the page
 * rather than as a row with no reason; nothing is scheduled for a row whose
 * people could not be written, and no job exists for a row the ledger
 * refused. The caller decides what a failure means to whoever asked: the
 * sweep counts it, a person is told.
 */
export async function assembleRun(ports: AssemblePorts, cmd: AssembleCommand): Promise<Assembled> {
  let id: string;
  try {
    id = await ports.create(cmd.broadcast);
  } catch (e) {
    return { ok: false, id: null, failure: "run_not_created", error: said(e) };
  }
  try {
    await ports.enrol(id, cmd.recipients);
  } catch (e) {
    await ports.fail(id, "recipients_write_failed");
    return { ok: false, id, failure: "recipients_write_failed", error: said(e) };
  }
  if (cmd.sendAt) {
    try {
      await ports.schedule(id, cmd.sendAt);
    } catch (e) {
      await ports.fail(id, "schedule_failed");
      return { ok: false, id, failure: "schedule_failed", error: said(e) };
    }
  }
  return { ok: true, id };
}

const said = (e: unknown): string => (e instanceof Error ? e.message : String(e));
```

- [x] **Step 3: The run** — `packages/core/src/campaigns/run-playbook.ts`:

```ts
import { eligibleForPlaybook, localDate, planRun, triggerOf, visitFactsFor, type ParamSpec, type PersonRowVM, type PlaybookTrigger, type RunPlan } from "@chanlytics/contracts";
import { assembleRun } from "./assemble";
import type { RunOutcome, RunPlaybookCommand, RunPlaybookPorts } from "./ports";

/**
 * One playbook's run, the one implementation.
 *
 * The hourly sweep runs every playbook whose hour it is; "Run now" on the
 * page runs one at a person's request. Both come here. A run is a broadcast
 * for the people who became eligible since the last run — the trigger's
 * list crossed with who said yes, minus anyone who heard from this playbook
 * within its gap, minus anyone who heard from any playbook this week, the
 * longest-unheard first, at most the cap. What the run then does is the
 * class's autonomy mode: auto schedules the send now, veto schedules it half
 * an hour ahead with a Stop, ask leaves it waiting for a person, never does
 * nothing. A person who asks for a run now has decided: it sends now, unless
 * the class is set to never. Every run is recorded as an event, a run that
 * found nobody included. A run never throws: the sweep behind it must go on.
 */
export async function runPlaybook(ports: RunPlaybookPorts, cmd: RunPlaybookCommand): Promise<RunOutcome> {
  const { playbook: p, ctx, by } = cmd;
  const now = ctx.now;
  const runFor = cmd.runFor ?? localDate(ctx.tz, now);
  const record = (data: Record<string, unknown>) => ports.record(p.id, runFor, now, { run_for: runFor, by: by.kind, ...data });
  // No row for the class means ask — the safest.
  const mode = ctx.modes.get(p.policy_class) ?? "ask";
  // A person who asks has decided: it sends now, unless the class is never.
  const plan: RunPlan = by.kind === "user"
    ? (mode === "never" ? { kind: "off" } : { kind: "send", state: "scheduled", at: now })
    : planRun(mode, now);
  if (plan.kind === "off") { await record({ mode, skipped: "never" }); return { outcome: "off", mode, skipped: "never" }; }

  // The template must still be what Meta approved; the number must be one Meta lets send.
  const tpl = await ports.template(p.template_name, p.template_language);
  if (!tpl || tpl.meta_status !== "approved") { await record({ mode, skipped: "template_not_approved" }); return { outcome: "off", mode, skipped: "template_not_approved" }; }
  if (!ctx.health.canSend) { await record({ mode, skipped: "number_flagged" }); return { outcome: "off", mode, skipped: "number_flagged" }; }
  // One run per local day: a second ask says so and records nothing twice.
  if (await ports.alreadyRan(p.id, runFor)) return { outcome: "off", mode, skipped: "already_ran_today" };
  // A visit playbook without a calendar has nothing to read: off, and the run says so.
  if (triggerOf(p.trigger)?.kind === "visit" && ctx.calendar !== "ok") { await record({ mode, skipped: "no_calendar" }); return { outcome: "off", mode, skipped: "no_calendar" }; }

  // Who the run reaches, with the number's daily limit as a ceiling.
  let eligible = eligibleForPlaybook(
    ctx.people,
    { trigger: p.trigger as PlaybookTrigger, cap_per_run: p.cap_per_run, gap_days: p.gap_days, cadence_days: p.cadence_days },
    { byThis: ctx.touches.byThis.get(p.id) ?? new Map(), byAny: ctx.touches.byAny },
    now.getTime(),
  );
  if (ctx.health.limitPerDay !== null && eligible.length > ctx.health.limitPerDay) eligible = eligible.slice(0, Math.max(0, Math.floor(ctx.health.limitPerDay)));
  if (eligible.length === 0) { await record({ mode, eligible: 0 }); return { outcome: "empty", eligible: 0, mode }; }

  const specs: ParamSpec[] = Array.isArray(p.params) ? (p.params as ParamSpec[]) : [];
  // A visit run keeps each person's words on their row — the visit's time
  // and service as the calendar said them now — so the send fills the slots
  // without reading the calendar again.
  const factsOf = (r: PersonRowVM) => {
    const v = ctx.visits.get(r.id);
    return visitFactsFor(p.trigger, p.trigger === "visit_tomorrow" ? (v?.next ?? null) : (v?.last ?? null), ctx.tz);
  };
  const n = eligible.length;
  const made = await assembleRun(ports, {
    broadcast: {
      name: `${p.name} · ${runFor}`,
      template_id: p.template_id,
      template_name: p.template_name,
      template_language: p.template_language,
      params: specs,
      audience: { kind: "playbook", id: p.id, label: p.name },
      state: plan.state,
      scheduled_for: (plan.kind === "send" ? plan.at : now).toISOString(),
      recipient_count: n,
      created_by: by.kind === "user" ? by.userId : p.created_by,
      playbook_id: p.id,
      run_for: runFor,
    },
    recipients: eligible.map((r) => ({ contact_id: r.id, facts: factsOf(r) })),
    sendAt: plan.kind === "send" ? plan.at : null,
  });
  if (!made.ok) return { outcome: "failed", error: made.error };

  if (plan.kind === "send") {
    // The ledger: a run the sweep sends is the system's decision under the
    // mode the owner chose; a run a person asked for is theirs.
    await ports.decide({ broadcastId: made.id, by, payload: { playbook_id: p.id, playbook: p.name, mode, recipients: n, scheduled_for: plan.at.toISOString(), run_now: by.kind === "user" } });
    await record({ mode, eligible: n, broadcast_id: made.id, state: plan.state });
    return { outcome: "sent", broadcast_id: made.id, eligible: n, mode, state: plan.state };
  }
  await ports.notify(
    `Playbook “${p.name}” is ready: ${n} ${n === 1 ? "person" : "people"}`,
    `${n} ${n === 1 ? "person has" : "people have"} become eligible for “${p.name}”. Approve or skip the run on Today or in Campaigns › Playbooks. Nothing is sent until you do.`,
  );
  await record({ mode, eligible: n, broadcast_id: made.id, state: plan.state });
  return { outcome: "held", broadcast_id: made.id, eligible: n, mode, state: plan.state };
}
```

- [x] **Step 4: The barrel** — `packages/core/src/campaigns/index.ts` = `export * from "./ports"; export * from "./assemble"; export * from "./run-playbook";` and `packages/core/src/index.ts` gains `export * from "./campaigns";`. The hygiene wall's loop becomes `for (const group of ["conversations", "messages", "campaigns"])`.

- [x] **Step 5: The test** — `tooling/scripts/tests/core-run-playbook.test.mjs`, every branch through fakes that log their writes:

```js
/**
 * A playbook's run, run: every branch through fakes that log their calls.
 * Until now the edge's runner was executed by no test; playbooks.test.mjs
 * pinned its text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYBOOK_VETO_DELAY_MS, numberHealth, toPersonRowVM } from "@chanlytics/contracts";
import { importSrc } from "./_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");
const NOW = new Date("2026-09-06T14:00:00Z"); // 10:00 in New York
const TZ = "America/New_York";
const D = 86_400_000;
const WRITES = new Set(["record", "create", "enrol", "fail", "schedule", "decide", "notify"]);

/** A person as the People page reads them: quiet for 40 days, said yes to both. */
const person = (id, over = {}) => ({
  id, state: "quiet", hasChat: true, calls: 0, phone: `+1555123000${id}`,
  consent: { state: "opted_in", dnc: false, label: "Opted in", sub: "", source: "in_person", marketing: "opted_in", marketingSource: "in_person", marketingSub: "" },
  lastContact: { ts: NOW.getTime() - 40 * D, label: "" },
  ...over,
});
/** A person as people_list answers, with a calendar: the visit run reads their visits. */
const iso = (msAgo) => new Date(NOW.getTime() - msAgo).toISOString();
function dto(id, over = {}) {
  return {
    id, display_name: `Person ${id}`, wa_profile_name: null, phone_e164: `+1305555000${id}`,
    consent: "opted_in", consent_source: "keyword", consent_updated_at: iso(30 * D), dnc: false,
    marketing_consent: "opted_in", marketing_consent_source: "customer_message", marketing_consent_updated_at: iso(30 * D),
    channels: ["whatsapp"],
    conversation_count: 1, escalation_count: 0, needs_human: false, open_escalation_reason: null, open_escalation_since: null,
    latest_conversation_id: `cv-${id}`, latest_state: "open", latest_paused_until: null, latest_assignee_user_id: null, latest_snooze_until: null,
    latest_wa_inbound_at: iso(3 * D), last_message_at: iso(3 * D), last_message_direction: "inbound", last_message_sender: "customer",
    last_inbound_text: "hi", last_inbound_at: iso(3 * D), last_call_at: null, last_inbound_call_at: null, last_inbound_call_summary: null,
    call_count: 0, call_seconds: 0, first_contact_at: iso(60 * D), earliest_row_at: iso(60 * D), has_backfill: false, has_chat: true, queued_reply_at: null,
    effective_reply_mode: "auto", visits: null, ...over,
  };
}
const visit = (startIso, title) => ({ id: `v-${startIso}`, start: startIso, end: new Date(Date.parse(startIso) + 3_600_000).toISOString(), title, all_day: false, via: "phone" });

const playbook = (over = {}) => ({
  id: "p1", tenant_id: "t1", name: "Win-back", trigger: "quiet_30", template_id: "tpl-1", template_name: "winback_offer", template_language: "en_US",
  params: [{ kind: "first_name" }], policy_class: "reengage", state: "running", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30, created_by: "owner", last_run_for: null, ...over,
});
const context = (over = {}) => ({
  tz: TZ, now: NOW, people: [person("a"), person("b", { lastContact: { ts: NOW.getTime() - 90 * D, label: "" } })],
  modes: new Map([["reengage", "auto"]]), health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  touches: { byThis: new Map(), byAny: new Map() }, calendar: "none", visits: new Map(), ...over,
});
const cmd = (over = {}) => ({ playbook: playbook(), ctx: context(), runFor: "2026-09-06", by: { kind: "system" }, ...over });

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = { template: { meta_status: "approved" }, alreadyRan: false, record: undefined, create: "b1", enrol: undefined, fail: undefined, schedule: undefined, decide: undefined, notify: undefined, ...over };
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
  assert.deepEqual(await runPlaybook(never.ports, cmd({ ctx: context({ modes: new Map([["reengage", "never"]]) }) })), { outcome: "off", mode: "never", skipped: "never" });
  assert.deepEqual(never.log, [["record", "p1", "2026-09-06", NOW, { run_for: "2026-09-06", by: "system", mode: "never", skipped: "never" }]]);
  const noRow = fakes();
  const held = await runPlaybook(noRow.ports, cmd({ ctx: context({ modes: new Map() }) }));
  assert.equal(held.outcome, "held", "no row for the class is ask");
  assert.equal(noRow.of("create")[0][1].state, "pending_approval");
  const asked = fakes();
  const r = await runPlaybook(asked.ports, cmd({ ctx: context({ modes: new Map([["reengage", "ask"]]) }), by: { kind: "user", userId: "u1" } }));
  assert.deepEqual(r, { outcome: "sent", broadcast_id: "b1", eligible: 2, mode: "ask", state: "scheduled" }, "a person's run now sends now under ask");
  assert.deepEqual(asked.of("schedule")[0], ["schedule", "b1", NOW]);
  assert.deepEqual(asked.of("create")[0][1].created_by, "u1", "their run");
  assert.deepEqual(asked.of("decide")[0][1], { broadcastId: "b1", by: { kind: "user", userId: "u1" }, payload: { playbook_id: "p1", playbook: "Win-back", mode: "ask", recipients: 2, scheduled_for: NOW.toISOString(), run_now: true } }, "and their decision");
  const refused = fakes();
  assert.deepEqual(await runPlaybook(refused.ports, cmd({ ctx: context({ modes: new Map([["reengage", "never"]]) }), by: { kind: "user", userId: "u1" } })), { outcome: "off", mode: "never", skipped: "never" }, "never is never, even asked");
});

test("off before a single row: a template Meta withdrew, a flagged number, a run already made for the day (said once, not recorded twice), a visit playbook without its calendar", async () => {
  const withdrawn = fakes({ template: { meta_status: "rejected" } });
  assert.deepEqual(await runPlaybook(withdrawn.ports, cmd()), { outcome: "off", mode: "auto", skipped: "template_not_approved" });
  assert.deepEqual(withdrawn.ops(), ["record"]);
  const gone = fakes({ template: null });
  assert.equal((await runPlaybook(gone.ports, cmd())).skipped, "template_not_approved");
  const flagged = fakes();
  assert.deepEqual(await runPlaybook(flagged.ports, cmd({ ctx: context({ health: numberHealth({ quality: "RED", event: null, limit: "TIER_1K" }) }) })), { outcome: "off", mode: "auto", skipped: "number_flagged" });
  assert.deepEqual(flagged.log[0][4], { run_for: "2026-09-06", by: "system", mode: "auto", skipped: "number_flagged" });
  const twice = fakes({ alreadyRan: true });
  assert.deepEqual(await runPlaybook(twice.ports, cmd()), { outcome: "off", mode: "auto", skipped: "already_ran_today" });
  assert.deepEqual(twice.ops(), [], "the day's run stands; nothing is recorded again");
  const noCalendar = fakes();
  const p = playbook({ trigger: "visit_tomorrow", policy_class: "booking" });
  assert.deepEqual(await runPlaybook(noCalendar.ports, cmd({ playbook: p, ctx: context({ modes: new Map([["booking", "auto"]]), calendar: "unavailable" }) })), { outcome: "off", mode: "auto", skipped: "no_calendar" });
  assert.deepEqual(noCalendar.ops(), ["record"]);
});

test("who the run reaches: the trigger's list crossed with who said yes, longest-unheard first; the number's daily limit as a ceiling; nobody at all, recorded honestly", async () => {
  const rows = [person("a"), person("b", { lastContact: { ts: NOW.getTime() - 90 * D, label: "" } }), person("c", { consent: { state: "unknown", dnc: false } }), person("d", { state: "active" })];
  const { ports, of } = fakes();
  const r = await runPlaybook(ports, cmd({ ctx: context({ people: rows }) }));
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("enrol")[0], ["enrol", "b1", [{ contact_id: "b", facts: null }, { contact_id: "a", facts: null }]]);
  assert.equal(of("create")[0][1].recipient_count, 2);
  const capped = fakes();
  await runPlaybook(capped.ports, cmd({ ctx: context({ people: rows, health: { canSend: true, tone: "ok", label: "", limitPerDay: 1, refusal: null } }) }));
  assert.deepEqual(capped.of("enrol")[0][2].map((x) => x.contact_id), ["b"], "the day's limit is a ceiling, not a refusal");
  const nobody = fakes();
  assert.deepEqual(await runPlaybook(nobody.ports, cmd({ ctx: context({ people: [person("d", { state: "active" })] }) })), { outcome: "empty", eligible: 0, mode: "auto" });
  assert.deepEqual(nobody.log, [["record", "p1", "2026-09-06", NOW, { run_for: "2026-09-06", by: "system", mode: "auto", eligible: 0 }]]);
});

test("auto: the row, the people, the send now, the system's decision, the run recorded; veto: the send half an hour ahead with the same row", async () => {
  const { ports, log, of, ops } = fakes();
  const r = await runPlaybook(ports, cmd());
  assert.deepEqual(r, { outcome: "sent", broadcast_id: "b1", eligible: 2, mode: "auto", state: "scheduled" });
  assert.deepEqual(ops(), ["create", "enrol", "schedule", "decide", "record"]);
  assert.deepEqual(of("create")[0][1], {
    name: "Win-back · 2026-09-06", template_id: "tpl-1", template_name: "winback_offer", template_language: "en_US", params: [{ kind: "first_name" }],
    audience: { kind: "playbook", id: "p1", label: "Win-back" }, state: "scheduled", scheduled_for: NOW.toISOString(), recipient_count: 2, created_by: "owner", playbook_id: "p1", run_for: "2026-09-06",
  });
  assert.deepEqual(of("schedule")[0], ["schedule", "b1", NOW]);
  assert.deepEqual(of("decide")[0][1], { broadcastId: "b1", by: { kind: "system" }, payload: { playbook_id: "p1", playbook: "Win-back", mode: "auto", recipients: 2, scheduled_for: NOW.toISOString(), run_now: false } });
  assert.deepEqual(log.at(-1), ["record", "p1", "2026-09-06", NOW, { run_for: "2026-09-06", by: "system", mode: "auto", eligible: 2, broadcast_id: "b1", state: "scheduled" }]);
  const veto = fakes();
  await runPlaybook(veto.ports, cmd({ ctx: context({ modes: new Map([["reengage", "veto"]]) }) }));
  const at = new Date(NOW.getTime() + PLAYBOOK_VETO_DELAY_MS);
  assert.deepEqual(veto.of("schedule")[0], ["schedule", "b1", at]);
  assert.equal(veto.of("create")[0][1].scheduled_for, at.toISOString());
});

test("ask: the row waits, nobody is scheduled, the owner is told in these words, the run recorded", async () => {
  const { ports, of, ops } = fakes();
  const r = await runPlaybook(ports, cmd({ ctx: context({ modes: new Map([["reengage", "ask"]]) }) }));
  assert.deepEqual(r, { outcome: "held", broadcast_id: "b1", eligible: 2, mode: "ask", state: "pending_approval" });
  assert.deepEqual(ops(), ["create", "enrol", "notify", "record"]);
  assert.equal(of("create")[0][1].state, "pending_approval");
  assert.equal(of("create")[0][1].scheduled_for, NOW.toISOString());
  assert.deepEqual(of("notify")[0], ["notify", "Playbook “Win-back” is ready: 2 people", "2 people have become eligible for “Win-back”. Approve or skip the run on Today or in Campaigns › Playbooks. Nothing is sent until you do."]);
  const one = fakes();
  await runPlaybook(one.ports, cmd({ ctx: context({ modes: new Map([["reengage", "ask"]]), people: [person("a")] }) }));
  assert.equal(one.of("notify")[0][1], "Playbook “Win-back” is ready: 1 person");
  assert.match(one.of("notify")[0][2], /^1 person has become eligible/);
});

test("a visit run keeps each person's words on their row, from the visit the run read", async () => {
  const next = visit("2026-09-07T18:00:00Z", "Balayage"); // tomorrow, 2:00 PM in New York
  const row = toPersonRowVM(dto("a", { visits: { timezone: TZ, source: "calendar", state: "ok", next, last: null } }), NOW);
  const { ports, of } = fakes();
  const r = await runPlaybook(ports, cmd({
    playbook: playbook({ trigger: "visit_tomorrow", policy_class: "booking", template_name: "visit_reminder", params: [{ kind: "first_name" }, { kind: "visit_when" }, { kind: "visit_service" }] }),
    ctx: context({ modes: new Map([["booking", "auto"]]), calendar: "ok", people: [row], visits: new Map([["a", { timezone: TZ, source: "calendar", state: "ok", next, last: null }]]) }),
  }));
  assert.equal(r.outcome, "sent");
  assert.deepEqual(of("enrol")[0][2], [{ contact_id: "a", facts: { visit_when: "tomorrow at 2:00 PM", visit_service: "Balayage" } }]);
});

test("a run that could not be written says so and stops: no row, nothing else; the people not written, the row failed with its reason; the job refused, the row failed with its reason and no decision", async () => {
  const noRow = fakes({ create: new Error("insert refused") });
  assert.deepEqual(await runPlaybook(noRow.ports, cmd()), { outcome: "failed", error: "insert refused" });
  assert.deepEqual(noRow.ops(), ["create"]);
  const noPeople = fakes({ enrol: new Error("rows refused") });
  assert.deepEqual(await runPlaybook(noPeople.ports, cmd()), { outcome: "failed", error: "rows refused" });
  assert.deepEqual(noPeople.log.slice(1), [["enrol", "b1", [{ contact_id: "b", facts: null }, { contact_id: "a", facts: null }]], ["fail", "b1", "recipients_write_failed"]]);
  const noJob = fakes({ schedule: new Error("schedule_job: no row") });
  assert.deepEqual(await runPlaybook(noJob.ports, cmd()), { outcome: "failed", error: "schedule_job: no row" });
  assert.deepEqual(noJob.ops(), ["create", "enrol", "schedule", "fail"]);
  assert.deepEqual(noJob.log.at(-1), ["fail", "b1", "schedule_failed"]);
});
```

- [x] **Step 6: Run it** — `node --conditions=react-server --import tsx --test tooling/scripts/tests/core-run-playbook.test.mjs`: 7 pass.

- [x] **Step 7: The edge adapter** — `apps/edge/lib/playbooks.ts` keeps `loadTenantRunContext` as it is (the read, once per tenant, that builds the context; `TenantRunContext` becomes `RunContext & { db; tenantId }`), re-exports `PlaybookRow` and `RunOutcome` from core for the cron and the admin route, and its `runPlaybook(ctx, p, req)` becomes the ports:

```ts
import { runPlaybook as runOverPorts, type PlaybookRow, type RunBy, type RunContext, type RunOutcome } from "./workspace/core.js";
export type { PlaybookRow, RunOutcome };
export interface TenantRunContext extends RunContext { db: Db; tenantId: string }
export interface RunRequest { runFor?: string; by: RunBy }

/** The run over this runtime's ports: the rules are core's (packages/core/src/campaigns/run-playbook.ts). */
export async function runPlaybook(ctx: TenantRunContext, p: PlaybookRow, req: RunRequest): Promise<RunOutcome> {
  const { db, tenantId } = ctx;
  return runOverPorts(
    {
      template: async (name, language) => {
        const { data } = await db.from("templates").select("meta_status").eq("tenant_id", tenantId).eq("channel", "whatsapp").eq("name", name).eq("language", language).maybeSingle();
        return data ?? null;
      },
      alreadyRan: async (playbookId, runFor) => {
        const { data } = await db.from("broadcasts").select("id").eq("playbook_id", playbookId).eq("run_for", runFor).maybeSingle();
        return !!data;
      },
      record: async (playbookId, runFor, at, data) => {
        await emitEvent(db, tenantId, "playbook.run", "message", "playbook", playbookId, data as Json).catch(() => {});
        await db.from("playbooks").update({ last_run_for: runFor, last_run_at: at.toISOString() }).eq("id", playbookId);
      },
      create: async (row) => {
        const { data, error } = await db.from("broadcasts").insert({ tenant_id: tenantId, ...row, params: row.params as unknown as Json, audience: row.audience as unknown as Json }).select("id").single();
        if (error || !data) throw new Error(error?.message ?? "run not created");
        return data.id;
      },
      enrol: async (id, rows) => {
        const { error } = await db.from("broadcast_recipients").insert(rows.map((r) => ({ broadcast_id: id, contact_id: r.contact_id, tenant_id: tenantId, ...(r.facts ? { facts: r.facts as unknown as Json } : {}) })));
        if (error) throw new Error(error.message);
      },
      fail: async (id, failure) => {
        await db.from("broadcasts").update({ state: "failed", failure }).eq("id", id);
      },
      schedule: async (id, at) => {
        await scheduleJob(db, { tenantId, kind: "broadcast_send", dueAt: at, payload: { broadcast_id: id } });
      },
      decide: async ({ broadcastId, by, payload }) => {
        await db.from("decisions").insert({
          tenant_id: tenantId, subject_type: "broadcast", subject_id: broadcastId, verb: "send_broadcast",
          actor_type: by.kind === "user" ? "user" : "system", actor_user_id: by.kind === "user" ? by.userId : null, payload: payload as unknown as Json,
        });
      },
      notify: async (subject, body) => {
        const target = await loadTenantNotifications(db, tenantId);
        await notify({ tenantId, notifications: target.notifications, isEnvDefault: target.isEnvDefault }, { kind: "playbook", route: "outbound", subject, body });
      },
    },
    { playbook: p, ctx, runFor: req.runFor, by: req.by },
  );
}
```

The cron (`apps/edge/api/cron/playbooks.ts`) and the admin route (`apps/edge/api/admin/playbooks-run.ts`) do not change: the signature they call is the same.

- [x] **Step 8: The pins move** — none added. `playbooks.test.mjs:119-126` (eight lines of the runner's text: the mode's default, the template and number gates, the empty run, the audience label, the actor, the owner's words, the person's plan) go; `core-run-playbook.test.mjs` runs each. Its two loader pins (`.in("state", ["sent", "queued"])`, the `runs` filter) stay on `apps/edge/lib/playbooks.ts`. `visit-playbooks.test.mjs:130`: the loop keeps the three loader strings and drops `'skipped: "no_calendar"'` and the `visitFactsFor` line (run). `billing-pause` (the loader's pause) and `notifications-durable` (`kind: "playbook",` in the adapter) stand as they are.

- [x] **Step 9: Build, typecheck, tests, lint** — `corepack pnpm --filter "./packages/*" build`, restore the CR-only dists, `corepack pnpm -r typecheck` (the edge typechecks against core's dist), then `UPDATE_SOURCE_SCAN_BASELINE=1` over core-run-playbook, playbooks, visit-playbooks, billing-pause, notifications-durable, hygiene, dist-freshness and the ratchet; lint at 23; the full suite.

- [x] **Step 10: Commit** — "Core, group three, PR 1: the playbook's run lives in core and every branch is run".

### Task 2: The dashboard's four (PR 2)

**Files:** `packages/core/src/campaigns/template-values.ts`, `create-broadcast.ts`, `approve.ts`, `cancel.ts`, `check-playbook.ts`; `apps/dashboard/src/server/campaign-ports.ts`; the three broadcast routes and `apps/dashboard/src/server/playbooks.ts`; `tooling/scripts/tests/core-campaigns.test.mjs`.

- [x] **Step 1: The template and the values, judged once** — `template-values.ts`:

```ts
import { AppError, cleanParam, parseParamSpec, type ParamSpec } from "@chanlytics/contracts";
import type { TemplateRow, TemplateValuesPorts } from "./ports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The template as Meta holds it and the values as Meta will accept them:
 * what a broadcast and a playbook both name, judged once. Approved; as many
 * values as the template takes; each typed text once or a value the job
 * fills per person; a booking-link slot needs a link on file. Every refusal
 * is a sentence for the person composing.
 */
export async function templateValues(ports: TemplateValuesPorts, cmd: { templateId: string; params: unknown }): Promise<{ template: TemplateRow; specs: ParamSpec[] }> {
  if (!UUID.test(cmd.templateId)) throw new AppError("validation", "Pick a template.");
  const tpl = await ports.template(cmd.templateId);
  if (!tpl) throw new AppError("not_found", "Template not found.", 404);
  if (tpl.meta_status !== "approved") throw new AppError("conflict", "That template is not approved by WhatsApp, so it cannot be sent.", 409);
  const expected = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
  const rawParams = Array.isArray(cmd.params) ? cmd.params : [];
  if (rawParams.length !== expected) {
    throw new AppError("validation", expected === 0 ? "This template takes no values." : `This template takes ${expected} value${expected === 1 ? "" : "s"}.`);
  }
  // Each slot: typed text once, or a value the job fills per person.
  const specs: ParamSpec[] = [];
  for (const p of rawParams) {
    const spec = parseParamSpec(p);
    if (!spec) throw new AppError("validation", "Each value is typed text, their first name, the business name, or the booking link.");
    if (spec.kind === "text") {
      const v = cleanParam(spec.value);
      if (v === null) throw new AppError("validation", "Every value is needed, without line breaks or tabs, and under 1024 characters.");
      specs.push({ kind: "text", value: v });
    } else {
      specs.push(spec);
    }
  }
  if (specs.some((s) => s.kind === "booking_link") && !(await ports.bookingLink())) {
    throw new AppError("conflict", "This message takes the booking link, and none is on file. Add it in Settings › Workspace first.", 409);
  }
  return { template: tpl, specs };
}
```

- [x] **Step 2: A person's broadcast** — `create-broadcast.ts`: the route's body from `apps/dashboard/app/api/v1/broadcasts/route.ts:68-205` with the reads as ports (`people(now)`, `savedList(id)`, `number()`), `templateValues` for steps 1–2, `assembleRun` for step 5 (`sendAt: when`; a `schedule_failed` is the route's `upstream_meta` 502 "The send could not be scheduled. Nothing was sent; try again.", any other failure a thrown `Error(made.error)`), and `ports.record("broadcast", made.id, "send_broadcast", {...})` for the ledger. The receipt is the route's: `{ id, name, state: "scheduled", recipient_count, scheduled_for, decision_id }`. The refusals keep their order and their words: "Pick a template." before "Pick who this goes to." before "Pick a list.", then the template, the values, the audience, the number, the time, the name.

- [x] **Step 3: Approve and cancel** — `approve.ts` and `cancel.ts`, the two row verbs, over `ApproveRunPorts` and `CancelBroadcastPorts`; the routes' bodies with `changed()` as the ports' answer, exactly as the thread verbs.

- [x] **Step 4: The playbook's check** — `check-playbook.ts`: `checkPlaybook(ports: TemplateValuesPorts, body)` is `apps/dashboard/src/server/playbooks.ts:97-150` with `templateValues` in place of lines 101-135; `PlaybookInput` moves with it. The dashboard's `checkPlaybookInput(ctx, tenantId, body)` becomes one line over `templateValuePorts(ctx, tenantId)`, so `ask/proposals.ts` does not change.

- [x] **Step 5: The adapter** — `apps/dashboard/src/server/campaign-ports.ts`: `templateValuePorts`, `createBroadcastPorts`, `approveRunPorts`, `cancelBroadcastPorts`, each `(ctx, tenantId)`; `changed()` shared from `core-ports.ts`; the `.select("id, name, language, meta_status, category, variables, body_preview, title")` and `withVisits(ctx, tenantId, await listPeople(ctx, tenantId), now)` reads move here with their pins; `enrol` chunks by 500. The file joins the list in `hygiene.test.mjs` of files whose session-client UPDATEs set only granted columns; before writing `failure` on the dashboard's failed row, read the grants — if `broadcasts.failure` is not granted to the session role, `fail` writes `state` alone, as the route does today.

- [x] **Step 6: The test** — `core-campaigns.test.mjs`: the refusal order and words; the template and values (count, kinds, cleaned text, the booking link); everyone / a People list / a saved list, the purpose from the template's category, the empty audience's refusal naming which yes; the number (none connected, flagged, over the day's limit); the time (not a time, past the window, a past time is now); the default name; the assembly and the ledger; the three failures and what the person is told; approve (not waiting, changed under them, the job refused → back to waiting); cancel (scheduled withdraws the job, sending and waiting stop, ended says how); the check (the trigger's words, the default name with and without the trigger's own starter, the whole numbers).

- [x] **Step 7: The pins move** — `broadcasts.test.mjs:183-199` drops what is run (the approval refusal, `cleanParam`, the purpose, `eligibleFor`, the empty refusal, `schedule`, `recordDecision`, cancel's two) and retargets the select and the `withVisits` read to `campaign-ports.ts`; `:266-267` (the number's refusals) go. `playbooks.test.mjs:99-103` (approve, cancel) and `:150-151` (the check) go. `templates-made-here.test.mjs:103-105` go. `visit-playbooks.test.mjs:133` goes. `calendar-people.test.mjs:483` retargets to `campaign-ports.ts`.

- [x] **Step 8: Build, typecheck, tests, lint, commit** — as Task 1's Step 9; `outbound-routes.test.mjs` unchanged and green is the proof the adapters answer what the routes answered.

## Status, 2026-09-11

| PR | What | Merged |
|---|---|---|
| 1 | `assembleRun` and `runPlaybook` in `packages/core/src/campaigns/`; the edge's `lib/playbooks.ts` as the loader plus the run's ports; `core-run-playbook.test.mjs` running every branch; the wall over `campaigns` | #381 |
| 2 | `templateValues`, `createBroadcast`, `approveRun`, `cancelBroadcast`, `checkPlaybook`; `campaign-ports.ts` as the dashboard's adapter; the three broadcast routes and `checkPlaybookInput` as one line each; `core-campaigns.test.mjs` | #382 |

Departures from the plan: the session role may update `state` alone on a broadcast (00046), so the dashboard's `fail` port writes the state and the reason goes to the person, as before; the hygiene wall reads each import line on its own, so a core verb's contracts import is one line however long; `starter-templates.test.mjs` pinned the two default-name lines that moved, and both go where `core-campaigns` runs them; `RunContext` is passed as the edge's `TenantRunContext` itself, the client and the tenant riding along unread. The context loader and the dashboard's people read still compute the same rows from two queries; one `people` port over one read waits for the receptionist's verbs to settle where the edge's reads live.

## Definition of done

- Five verbs and one kernel in `packages/core/src/campaigns/`, every branch a case in a test that runs it.
- `apps/edge/lib/playbooks.ts` is the loader plus the run's ports; the cron and the admin route untouched.
- The three broadcast routes and `checkPlaybookInput` are adapters over `campaign-ports.ts`.
- The wall covers `campaigns`; the baseline is lower by every pin above.
- Behaviour unchanged for the operator and the sweep: the same refusals in the same words, the same receipts, the same outcomes; `outbound-routes.test.mjs` unchanged.

## After this plan

- **The receptionist's own verbs** on the edge (escalate, hold, answer): the largest and the last, once Ruben decides the expired-hold rule.
- The context loader (`loadTenantRunContext`) and the dashboard's people read compute the same `PersonRowVM[]` from two queries; one `people` port over one read is the next step when the receptionist's verbs settle where the edge's reads live.

## Self-review

- **Spec coverage.** The program's epilogue for group three: "the run planner is already pure; what moves is the run's assembly." Task 1 moves the assembly and the run's rules around it; Task 2 moves the other assembler and the three verbs at its door. The check comes because it is the same judgement as the route's first two steps.
- **Placeholders.** Task 1 is in full: ports, kernel, verb, test, adapter. Task 2's kernel and template judgement are in full; its verbs are the routes' bodies with named ports, which the executing engineer copies from the routes (lines named) rather than from this page, as group two's Task 2 was written.
- **Types.** `NewBroadcast.audience` is contracts' `Audience`, whose kinds include `"playbook"`; `RunContext` is the edge's `TenantRunContext` less the client and the tenant; `RunOutcome` is the edge's own, moved, so the cron's tally keys still match; `AssemblePorts` is what both callers write, and `CreateBroadcastPorts extends AssemblePorts, TemplateValuesPorts`.
