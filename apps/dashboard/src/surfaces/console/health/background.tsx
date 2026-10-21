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
import { NoneRow, ScreenSection, type Flash, type Go } from "../parts";
import type { ConsoleHealth, ConsoleMe } from "../verbs";
import { ActInPlace } from "./acts";

const timeWords = (ms: number | null, nowMs: number) =>
  ms === null
    ? "never recorded"
    : agoWords(ms, nowMs, {
        dateAfterMs: DAY_MS,
        date: (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      });

/** The clocks, the ones not running first; `first` draws that many and a line for the rest. */
export function ClockList({ h, nowMs, first, go }: { h: ConsoleHealth; nowMs: number; first?: number; go: Go }) {
  const clocks = clocksOf(h.clocks);
  const running = clocks.rows.filter((c) => c.state === "running").length;
  const idle = clocks.rows.filter((c) => c.state === "idle").length;
  const shown = first ? clocks.rows.slice(0, first) : clocks.rows;
  const rest = clocks.rows.length - shown.length;
  return (
    <ScreenSection
      title={`Clocks · ${running} of ${clocks.rows.length} running${idle ? `, ${idle} idle` : ""}`}
      sub={`${clocks.runs.toLocaleString("en-US")} runs in ${h.days} days · ${clocks.failed} failed to start`}
      testid="console-health-clocks"
    >
      {h.clocks === null ? (
        <NoneRow words="The clocks could not be read just now." />
      ) : (
        <div className="cs-h-rows" data-shape="clocks">
          <div className="cs-h-rows-head" aria-hidden="true">
            <span>Clock</span>
            <span>Last spoke</span>
            <span>Judged by</span>
            <span>State</span>
          </div>
          {shown.map((c) => (
            <div className="cs-h-rows-row" key={c.sweep} data-testid={`console-health-clock-${c.sweep}`}>
              <span className="cs-q-what">
                <span className="cs-q-title">{c.words}</span>
                <span className="cs-q-meta cs-h-mono">{[c.machine, c.schedule].filter(Boolean).join(" · ")}</span>
                {c.problem ? <span className="cs-a-warn cs-h-problem">{c.problem}</span> : null}
                {c.note ? <span className="cs-q-meta">{c.note}</span> : null}
              </span>
              <span className="cs-q-topic">{timeWords(c.lastMs, nowMs)}</span>
              <span className="cs-q-topic">{c.judged}</span>
              <span>
                <StatePill kind="tone" value={c.stateWords.tone} label={c.stateWords.label} />
              </span>
            </div>
          ))}
        </div>
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
        <div className="cs-h-rows" data-shape="pager">
          <div className="cs-h-rows-head" aria-hidden="true">
            <span>Condition</span>
            <span>First</span>
            <span>Seen</span>
            <span>Last mailed</span>
          </div>
          {rows.map((p) => (
            <div className="cs-h-rows-row" key={p.key} data-testid={`console-health-page-${p.key}`}>
              <span className="cs-q-what">
                <span className="cs-q-title">{p.words}</span>
                <span className="cs-q-meta cs-h-mono">{`${p.key}${p.ours ? " · Ours" : ""}`}</span>
              </span>
              <span className="cs-q-topic">{p.first}</span>
              <span className="cs-q-topic">{p.count.toLocaleString("en-US")}</span>
              <span className="cs-q-topic">{p.lastMailed ?? "never"}</span>
            </div>
          ))}
        </div>
      )}
    </ScreenSection>
  );
}

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
      sub={`${jobs.length} in ${h.days} days · a send is never run again from here`}
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
      sub={`${d.failed} of ${d.total.toLocaleString("en-US")} failed · each change passed on to what reads it`}
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
                  <span className="set-row-label">{s.words}</span>
                  <span className="set-row-hint" data-tone={s.failed ? "danger" : undefined}>
                    {`${s.done.toLocaleString("en-US")} delivered · ${s.failed} failed · ${s.waiting} waiting`}
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
  const backlog =
    h.backlog === null
      ? "The job backlog could not be read just now."
      : h.backlog > 0
        ? `${h.backlog} due job${h.backlog === 1 ? "" : "s"} nobody has claimed for two minutes.`
        : "No job is waiting unclaimed.";
  return (
    <>
      <div className="cs-held" data-testid="console-health-backlog">
        {backlog}
      </div>
      <ClockList h={h} nowMs={nowMs} go={go} />
      <FailedJobs h={h} scope={scope} nowMs={nowMs} me={me} flash={flash} again={again} />
      <Deliveries h={h} scope={scope} me={me} flash={flash} again={again} />
      <PagerList h={h} scope={scope} nowMs={nowMs} />
    </>
  );
}
