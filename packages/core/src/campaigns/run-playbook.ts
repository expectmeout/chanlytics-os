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
