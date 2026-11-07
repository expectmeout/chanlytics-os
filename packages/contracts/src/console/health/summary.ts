/** Health: summary. */

import { agoWords, DAY_MS } from "../../shared/time";
import { clocksOf } from "../health-clocks";
import { inScope, oursOf, workspaceNamer, type HealthScope } from "../health-scope";
import { LOOK_SOURCES, SEVERITY_RANK, dateWords, type HealthLookVM, type LookCtx } from "./looks";
import { countPhrase, type HealthDto } from "./dtos";

/**
 * Everything that needs a person, worst first then newest: a clock not running, the ledger backing up, a model key out
 * of credit, a promise missed for customers, failed jobs, failing deliveries, what paged us, an account Anthropic acted on, sends and calls failing on
 * a provider's word, model calls with no answer, and connections that are not healthy. Each names its workspace.
 */
export function healthLooksOf(health: HealthDto, scope: HealthScope, nowMs: number): HealthLookVM[] {
  const ctx: LookCtx = {
    h: health,
    scope,
    nowMs,
    ours: oursOf(health.workspaces),
    nameOf: workspaceNamer(health.workspaces),
    sinceWords: (ms) => agoWords(ms, nowMs, { dateAfterMs: 2 * DAY_MS, date: dateWords }),
  };
  return LOOK_SOURCES.flatMap((source) => source(ctx))
    .filter((r) => inScope(r.ours, scope))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.sinceMs - a.sinceMs);
}

// ---------------------------------------------------------------------------------------------- the head

/** How many need a look, for customers and for ours: the head's segmented control and its line. */
export function healthCounts(health: HealthDto, nowMs: number): Record<HealthScope, number> {
  return {
    customers: healthLooksOf(health, "customers", nowMs).length,
    ours: healthLooksOf(health, "ours", nowMs).length,
    all: healthLooksOf(health, "all", nowMs).length,
  };
}

/** Health's line under its name: who needs a look, whether every clock runs, whether anything is late. */
export function healthSentence(health: HealthDto, nowMs: number): string {
  const result = healthCounts(health, nowMs);
  const clocks = clocksOf(health.clocks);
  const stopped = clocks.rows.filter((c) => c.state === "stopped").length;
  return [
    result.customers === 0
      ? "Nothing needs a look for customers"
      : `${result.customers} need${result.customers === 1 ? "s" : ""} a look for customers`,
    result.ours ? `${result.ours} in ours` : null,
    health.clocks === null
      ? "the clocks could not be read"
      : stopped
        ? `${countPhrase(stopped, "clock")} not running`
        : "every clock running",
    health.backlog === null ? null : health.backlog > 0 ? `${countPhrase(health.backlog, "job")} late` : "nothing late",
  ]
    .filter(Boolean)
    .join(" · ");
}
