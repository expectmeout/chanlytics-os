import { localDate, nextOpenMoment, parseParamSpecs, planRun, playbookGapDays, purposeOfPlaybook, reachOfPlaybook, triggerOf, visitFactsFor, type PersonRowVM, type PlaybookTrigger, type RunPlan } from "@chanlytics/contracts";
import { assembleRun } from "./assemble";
import type { RunOutcome, RunPlaybookCommand, RunPlaybookPorts } from "./ports";

type Skipped = Extract<RunOutcome, { outcome: "off" }>["skipped"];

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
 * the class is set to never. Never at 3 AM, whoever asks: a send that would
 * go out past the hours a run keeps on its own (a "Run now" at eleven at
 * night, a veto window ending past twenty) goes at nine, and the ledger says
 * what was asked for. Every run is recorded as an event, a run that found
 * nobody included. A run never throws: the sweep behind it must go on.
 */
export async function runPlaybook(ports: RunPlaybookPorts, cmd: RunPlaybookCommand): Promise<RunOutcome> {
  const { playbook: p, ctx, by } = cmd;
  const now = ctx.now;
  const runFor = cmd.runFor ?? localDate(ctx.tz, now);
  const record = (data: Record<string, unknown>) => ports.record(p.id, runFor, now, { run_for: runFor, by: by.kind, ...data });
  // No row for the class means ask — the safest.
  const mode = ctx.modes.get(p.policy_class) ?? "ask";
  // Off, and the run says why -- recorded, unless the day's run already stands.
  const off = async (skipped: Skipped, opts: { record?: boolean } = {}): Promise<RunOutcome> => {
    if (opts.record !== false) await record({ mode, skipped });
    return { outcome: "off", mode, skipped };
  };
  // A person who asks has decided: it sends now, unless the class is never.
  const plan: RunPlan = by.kind === "user"
    ? (mode === "never" ? { kind: "off" } : { kind: "send", state: "scheduled", at: now })
    : planRun(mode, now);
  if (plan.kind === "off") return off("never");
  // Never at 3 AM, whoever asks: the same hours a run keeps on its own, by
  // the business's clock. A send that would go out past them moves to nine.
  const send = plan.kind === "send" ? plan : null;
  const open = send ? nextOpenMoment(ctx.tz, send.at) : null;
  const movedFrom = send && open?.moved ? send.at.toISOString() : null;

  // The template must still be what Meta approved; the number must be one
  // Meta lets send. A template that could not be READ is this run failing,
  // not the template withdrawn: nothing is recorded, so the next sweep asks
  // again rather than skipping the day.
  let tpl: Awaited<ReturnType<RunPlaybookPorts["template"]>>;
  try {
    tpl = await ports.template(p.template_name, p.template_language);
  } catch (e) {
    return { outcome: "failed", error: `template: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!tpl || tpl.meta_status !== "approved") return off("template_not_approved");
  if (!ctx.health.canSend) return off("number_flagged");
  // One run per local day: a second ask says so and records nothing twice.
  if (await ports.alreadyRan(p.id, runFor)) return off("already_ran_today", { record: false });
  // A visit playbook without a calendar has nothing to read: off, and the run says so.
  if (triggerOf(p.trigger)?.kind === "visit" && ctx.calendar !== "ok") return off("no_calendar");

  // Who the run reaches, and who it holds back and why -- one pass -- with the number's daily limit as a ceiling.
  const shape = { trigger: p.trigger as PlaybookTrigger, cap_per_run: p.cap_per_run, gap_days: p.gap_days, cadence_days: p.cadence_days };
  const reach = reachOfPlaybook(ctx.people, shape, { byThis: ctx.touches.byThis.get(p.id) ?? new Map(), byAny: ctx.touches.byAny }, now.getTime());
  let eligible = reach.eligible;
  // The number's own daily limit is the one ceiling a reminder meets; the
  // people past it are named in the run's record, never dropped in silence.
  let dropped = 0;
  if (ctx.health.limitPerDay !== null && eligible.length > ctx.health.limitPerDay) {
    const keep = Math.max(0, Math.floor(ctx.health.limitPerDay));
    dropped = eligible.length - keep;
    eligible = eligible.slice(0, keep);
  }
  if (eligible.length === 0) { await record({ mode, eligible: 0, ...(dropped ? { dropped } : {}) }); return { outcome: "empty", eligible: 0, mode }; }

  const specs = parseParamSpecs(p.params);
  // A visit run keeps each person's words on their row — the visit's time
  // and service as the calendar said them now — so the send fills the slots
  // without reading the calendar again.
  // Relative to the moment the send goes: a run asked for at night goes at
  // nine, and "tomorrow" said at eleven is "today" by then.
  const factsOf = (r: PersonRowVM) => {
    const v = ctx.visits.get(r.id);
    return visitFactsFor(p.trigger, p.trigger === "visit_tomorrow" ? (v?.next ?? null) : (v?.last ?? null), ctx.tz, open ? open.at : now);
  };
  const n = eligible.length;
  const made = await assembleRun(ports, {
    broadcast: {
      name: `${p.name} · ${runFor}`,
      template_id: p.template_id,
      template_name: p.template_name,
      template_language: p.template_language,
      params: specs,
      // The run keeps who it held back and why, so a run to come can say "186 of 312" rather than one full bar.
      audience: {
        kind: "playbook", id: p.id, label: p.name,
        reach: {
          pool: reach.pool,
          purpose: purposeOfPlaybook(triggerOf(p.trigger)?.cls ?? null),
          gap_days: triggerOf(p.trigger)?.kind === "visit" ? null : playbookGapDays(shape),
          held: { ...reach.held, limit: dropped },
        },
      },
      state: plan.state,
      scheduled_for: (open ? open.at : now).toISOString(),
      recipient_count: n,
      created_by: by.kind === "user" ? by.userId : p.created_by,
      playbook_id: p.id,
      run_for: runFor,
    },
    recipients: eligible.map((r) => ({ contact_id: r.id, facts: factsOf(r) })),
    sendAt: open ? open.at : null,
  });
  if (!made.ok) return { outcome: "failed", error: made.error };

  if (open) {
    // The ledger: a run the sweep sends is the system's decision under the
    // mode the owner chose; a run a person asked for is theirs.
    await ports.decide({ broadcastId: made.id, by, payload: { playbook_id: p.id, playbook: p.name, mode, recipients: n, scheduled_for: open.at.toISOString(), run_now: by.kind === "user", ...(movedFrom ? { moved_from: movedFrom } : {}) } });
  } else {
    await ports.notify(
      `Playbook “${p.name}” is ready: ${n} ${n === 1 ? "person" : "people"}`,
      `${n} ${n === 1 ? "person has" : "people have"} become eligible for “${p.name}”. Approve or skip the run on Today or in Campaigns › Playbooks. Nothing is sent until you do.`,
    );
  }
  await record({ mode, eligible: n, broadcast_id: made.id, state: plan.state, ...(movedFrom ? { moved_from: movedFrom } : {}) });
  // A sent run says when it really goes, so the person who asked is not told "now" over a run moved to nine.
  return open
    ? { outcome: "sent", broadcast_id: made.id, eligible: n, mode, state: plan.state, scheduled_for: open.at.toISOString(), moved_from: movedFrom }
    : { outcome: "held", broadcast_id: made.id, eligible: n, mode, state: plan.state };
}
