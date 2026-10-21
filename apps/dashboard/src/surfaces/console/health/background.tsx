/**
 * Background work (decision 0068): every clock in plain words beside pg_cron's own record of its runs (platform_clocks,
 * 00469) and the health check's judgement of it, the jobs that failed for good with Run again, what paged us with how
 * often and when it was last mailed, and each subscriber's deliveries with Deliver again. The overview draws the first
 * clocks and the pager's recent conditions; this tab draws them all. Every word is contracts'.
 */
import type { MouseEvent } from "react";
import {
  DAY_MS,
  agoWords,
  clocksOf,
  deliveriesOf,
  failureReadingOf,
  healthPathOf,
  inScope,
  jobWords,
  oursOf,
  pagesOf,
  workspaceNamer,
  type HealthScope,
} from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { NoneRow, ScreenSection, type Flash, type Go } from "../parts";
import type { ConsoleHealth, ConsoleMe } from "../verbs";
import { ActInPlace } from "./acts";
import { HealthRow, HealthRows, healthCount as n, healthCountOf } from "./line";

const timeWords = (ms: number | null, nowMs: number) =>
  ms === null
    ? "never recorded"
    : agoWords(ms, nowMs, {
        dateAfterMs: DAY_MS,
        date: (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      });

type Clock = ReturnType<typeof clocksOf>["rows"][number];

/** The problem most of the stopped clocks share, said once over them; none where no two share one. */
function sharedProblem(stopped: readonly Clock[]): string | null {
  const counts = new Map<string, number>();
  for (const c of stopped) if (c.problem) counts.set(c.problem, (counts.get(c.problem) ?? 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return top && top[1] > 1 ? top[0] : null;
}

/** The clocks' table: each clock, when it last spoke, how long it may be quiet, and its state. */
function ClockRows({
  rows,
  nowMs,
  compact,
  shared,
  label,
}: {
  rows: readonly Clock[];
  nowMs: number;
  /** The overview's: the clock, when it spoke and its state, no more. */
  compact: boolean;
  shared: string | null;
  label: string;
}) {
  return (
    <HealthRows
      head={[
        "Clock",
        { label: "Last spoke", desk: true },
        ...(compact ? [] : [{ label: "Late after", desk: true } as const]),
        "State",
      ]}
      label={label}
      shape="clocks"
    >
      {rows.map((c) => {
        const problem = c.problem && c.problem !== shared ? c.problem : null;
        return (
          <HealthRow
            key={c.sweep}
            title={c.words}
            sub={compact ? undefined : (problem ?? c.note ?? [c.machine, c.schedule].filter(Boolean).join(" · "))}
            subTone={problem ? "warn" : undefined}
            mono={!compact && !problem && !c.note}
            cells={[
              { v: timeWords(c.lastMs, nowMs), desk: true },
              ...(compact ? [] : [{ v: c.lateAfter || "—", desk: true }]),
              { v: <StatePill kind="tone" value={c.stateWords.tone} label={c.stateWords.label} /> },
            ]}
            testid={`console-health-clock-${c.sweep}`}
          />
        );
      })}
    </HealthRows>
  );
}

/**
 * The clocks: the ones not running first, the problem they share said once over them, the running ones folded away
 * under their count. The overview's (`first`) draws that many, plainly, and a line for the rest.
 */
export function ClockList({ h, nowMs, first, go }: { h: ConsoleHealth; nowMs: number; first?: number; go: Go }) {
  const clocks = clocksOf(h.clocks);
  const stopped = clocks.rows.filter((c) => c.state === "stopped" || c.state === "unknown");
  const fine = clocks.rows.filter((c) => c.state === "running" || c.state === "idle");
  const idle = clocks.rows.filter((c) => c.state === "idle").length;
  const notRunning = clocks.rows.filter((c) => c.state === "stopped").length;
  const shared = first ? null : sharedProblem(stopped);
  const shown = first ? clocks.rows.slice(0, first) : stopped;
  const rest = clocks.rows.length - (first ? shown.length : clocks.rows.length);
  return (
    <ScreenSection
      title={`Clocks · ${clocks.rows.length - notRunning} of ${clocks.rows.length} running`}
      sub={[
        idle ? `${idle} idle` : null,
        `${n(clocks.runs)} runs in ${h.days} days`,
        `${clocks.failed} failed to start`,
      ]
        .filter(Boolean)
        .join(" · ")}
      testid="console-health-clocks"
    >
      {h.clocks === null ? (
        <NoneRow words="The clocks could not be read just now." />
      ) : (
        <>
          {shared ? (
            <p className="cs-h-shared" data-testid="console-health-clocks-shared">
              <span className="cs-a-warn">{`${healthCountOf(stopped.filter((c) => c.problem === shared).length, "clock")} stopped for one reason:`}</span>
              <span className="cs-h-mono">{shared}</span>
            </p>
          ) : null}
          {first || stopped.length === 0 ? (
            <ClockRows rows={first ? shown : fine} nowMs={nowMs} compact={!!first} shared={null} label="Clocks" />
          ) : (
            <>
              <ClockRows rows={stopped} nowMs={nowMs} compact={false} shared={shared} label="Clocks not running" />
              {fine.length > 0 && (
                <div className="cs-h-fold">
                  <RecordDisclosure
                    id="console-health-clocks-fine"
                    label={`${healthCountOf(fine.length, "clock")} running as they should`}
                    testid="console-health-clocks-fine"
                  >
                    <ClockRows rows={fine} nowMs={nowMs} compact={false} shared={null} label="Clocks running" />
                  </RecordDisclosure>
                </div>
              )}
            </>
          )}
        </>
      )}
      {rest > 0 && (
        <div className="cs-q-foot">
          <span className="cs-key">{`${rest} more`}</span>
          <LinkButton
            href={healthPathOf("background")}
            onClick={(e: MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault();
              go(healthPathOf("background"));
            }}
          >
            Open Background work
          </LinkButton>
        </div>
      )}
    </ScreenSection>
  );
}

/** What paged us: each condition, when it began, how often it was seen, when it was last mailed. */
export function PagerList({
  h,
  scope,
  nowMs,
  recentOnly = false,
}: {
  h: ConsoleHealth;
  scope: HealthScope;
  nowMs: number;
  recentOnly?: boolean;
}) {
  const pages = pagesOf(h.pages, h.workspaces, nowMs);
  const rows = pages.rows.filter((p) => inScope(p.ours, scope) && (!recentOnly || p.recent));
  return (
    <ScreenSection title="What paged us" sub="the pager's memory · ours is never paged" testid="console-health-pager">
      {!pages.read ? (
        <NoneRow words="What paged us could not be read just now." />
      ) : rows.length === 0 ? (
        <NoneRow words={recentOnly ? "Nothing paged us in the last day." : "Nothing paged us."} />
      ) : (
        <HealthRows
          head={["Condition", { label: "First", desk: true }, "Seen", "Last mailed"]}
          label="What paged us"
          shape="pager"
        >
          {rows.map((p) => (
            <HealthRow
              key={p.key}
              title={p.words}
              sub={recentOnly ? (p.ours ? "Ours" : undefined) : `${p.key}${p.ours ? " · Ours" : ""}`}
              mono={!recentOnly}
              cells={[{ v: p.first, desk: true }, { v: n(p.count) }, { v: p.lastMailed ?? "never" }]}
              testid={`console-health-page-${p.key}`}
            />
          ))}
        </HealthRows>
      )}
    </ScreenSection>
  );
}

/** The job backlog in words: nothing waiting, how many wait, or that it could not be read. */
const backlogWords = (backlog: number | null) =>
  backlog === null
    ? "The job backlog could not be read just now."
    : backlog > 0
      ? `${backlog} due job${backlog === 1 ? "" : "s"} nobody has claimed for two minutes.`
      : "no job waiting unclaimed";

/** The jobs that failed for good in the window, newest first, each with what it answered and Run again. */
function FailedJobs({
  h,
  scope,
  nowMs,
  me,
  flash,
  again,
}: {
  h: ConsoleHealth;
  scope: HealthScope;
  nowMs: number;
  me: ConsoleMe;
  flash: Flash;
  again: () => void;
}) {
  const ours = oursOf(h.workspaces);
  const nameOf = workspaceNamer(h.workspaces);
  const jobs = (h.failed_jobs ?? []).filter((j) => inScope(ours.has(j.tenant_id), scope));
  return (
    <ScreenSection
      title="Failed jobs"
      sub={[
        `${jobs.length} in ${h.days} days`,
        h.backlog === 0 ? backlogWords(0) : null,
        "a send is never run again from here",
      ]
        .filter(Boolean)
        .join(" · ")}
      testid="console-health-failed-jobs"
    >
      {h.failed_jobs === null ? (
        <NoneRow words="The failed jobs could not be read just now." />
      ) : jobs.length === 0 ? (
        <NoneRow words="No job failed for good." />
      ) : (
        <div className="cl-attn-list">
          {jobs.map((j) => {
            const reading = failureReadingOf(j.last_error, j.attempts);
            return (
              <div className="set-row" key={j.id} data-testid={`console-health-job-${j.id}`}>
                <div className="set-row-info">
                  <span className="set-row-label">
                    {`${jobWords(j.kind)} · ${nameOf(j.tenant_id)}${ours.has(j.tenant_id) ? " · Ours" : ""}`}
                  </span>
                  <span className="set-row-hint cs-h-mono">
                    {`${j.kind} · ${j.attempts} ${j.attempts === 1 ? "try" : "tries"} · ${timeWords(Date.parse(j.updated_at), nowMs)}`}
                  </span>
                  {j.last_error ? <span className="set-row-hint">{j.last_error.slice(0, 240)}</span> : null}
                  {reading ? (
                    <span className="set-row-hint" data-tone="warn">
                      {reading}
                    </span>
                  ) : null}
                </div>
                <ActInPlace
                  run={{ kind: "run_again", jobId: j.id, tenantId: j.tenant_id }}
                  me={me}
                  flash={flash}
                  again={again}
                  primary={false}
                  testid={`console-health-job-${j.id}-again`}
                />
              </div>
            );
          })}
        </div>
      )}
    </ScreenSection>
  );
}

/** Each subscriber's deliveries in the window: done, failed, waiting, and Deliver again where any failed. */
function Deliveries({
  h,
  scope,
  me,
  flash,
  again,
}: {
  h: ConsoleHealth;
  scope: HealthScope;
  me: ConsoleMe;
  flash: Flash;
  again: () => void;
}) {
  const d = deliveriesOf(h.parts, scope);
  return (
    <ScreenSection
      title="Deliveries"
      sub={`${d.failed} of ${n(d.total)} failed · each change passed on to what reads it`}
      testid="console-health-deliveries"
    >
      {h.parts === null ? (
        <NoneRow words="The deliveries could not be read just now." />
      ) : d.subscribers.length === 0 ? (
        <NoneRow words="Nothing was passed on in the window." />
      ) : (
        <div className="cl-attn-list">
          {d.subscribers.map((s) => {
            const why = d.failures.find((f) => f.subscriber === s.subscriber)?.reason ?? null;
            return (
              <div className="set-row" key={s.subscriber} data-testid={`console-health-delivery-${s.subscriber}`}>
                <div className="set-row-info">
                  <span className="set-row-label">{s.label}</span>
                  <span className="set-row-hint" data-tone={s.failed ? "danger" : undefined}>
                    {`${n(s.done)} delivered · ${s.failed} failed · ${s.waiting} waiting`}
                  </span>
                  {s.failed && why ? <span className="set-row-hint cs-h-mono">{why}</span> : null}
                </div>
                {s.failed > 0 && (
                  <ActInPlace
                    run={{ kind: "redrive", subscriber: s.subscriber }}
                    me={me}
                    flash={flash}
                    again={again}
                    primary={false}
                    testid={`console-health-delivery-${s.subscriber}-again`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </ScreenSection>
  );
}

export function BackgroundTab({
  h,
  scope,
  nowMs,
  me,
  go,
  flash,
  again,
}: {
  h: ConsoleHealth;
  scope: HealthScope;
  nowMs: number;
  me: ConsoleMe;
  go: Go;
  flash: Flash;
  again: () => void;
}) {
  return (
    <>
      {h.backlog !== 0 ? (
        <div className="cs-held" data-testid="console-health-backlog">
          {backlogWords(h.backlog)}
        </div>
      ) : null}
      <ClockList h={h} nowMs={nowMs} go={go} />
      <FailedJobs h={h} scope={scope} nowMs={nowMs} me={me} flash={flash} again={again} />
      <Deliveries h={h} scope={scope} me={me} flash={flash} again={again} />
      <PagerList h={h} scope={scope} nowMs={nowMs} />
    </>
  );
}
