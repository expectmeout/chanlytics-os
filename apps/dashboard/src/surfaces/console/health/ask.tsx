/**
 * Ask, Health's tab (decision 0068): the owner's assistant as a part of its own. How many answers and how fast (the
 * whole answer and its first words, at the median and the 95th percentile), where the time went (reading the
 * workspace, the model's first byte, its rounds, the tools), how many rounds an answer took and how much of the prompt
 * the cache held, which tools are slow, every failure in both voices (what the owner read, what the API said: kept since
 * 00469), and what each workspace's Ask cost, ours marked. From each answer's own trace and the usage ledger, never the
 * words anyone asked. Every word is contracts' (askOf).
 */
import { dollarsWords, secondsWords, workspaceNamer, type HealthAskVM, type HealthScope } from "@chanlytics/contracts";
import { Figure } from "../../kit/figure/figure";
import { Meter } from "../../kit/meter/meter";
import { NoneRow, ScreenSection } from "../parts";
import type { ConsoleHealth } from "../verbs";
import { HealthRow, HealthRows, healthCount as n, healthCountOf, utcWords as when } from "./line";

const pct = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);

function AskFigures({ a, scope }: { a: HealthAskVM; scope: HealthScope }) {
  return (
    <dl className="cs-h-figures" data-testid="console-health-ask-figures">
      <Figure label="Answers" value={n(a.answers)} meta={`in ${healthCountOf(a.threads, "conversation")}`} />
      <Figure
        label="The whole answer, p95"
        value={secondsWords(a.latencyP95)}
        meta={`median ${secondsWords(a.latencyP50)} · slowest ${secondsWords(a.latencyMax)}`}
        {...(a.slow ? { tone: "fail" as const } : {})}
      />
      <Figure
        label="First words, p95"
        value={secondsWords(a.firstTextP95)}
        meta={`median ${secondsWords(a.firstTextP50)} · of ${n(a.traced)} traced`}
      />
      <Figure
        label="Failed"
        value={n(a.failed)}
        meta={`${n(a.ungrounded)} without the workspace's facts`}
        {...(a.failed ? { tone: "warn" as const } : {})}
      />
      <Figure
        label="What it cost"
        value={a.usd === null ? "—" : dollarsWords(a.usd)}
        meta={a.oursShare !== null && scope !== "customers" ? `ours ${pct(a.oursShare)} of every workspace's` : null}
      />
    </dl>
  );
}

/** Where an answer's time went, each stage at the median and the 95th, against the whole answer's 95th. */
function Stages({ a }: { a: HealthAskVM }) {
  const whole = a.stages.find((s) => s.key === "final")?.p95 ?? null;
  return (
    <ScreenSection
      title="Where the time goes"
      sub={`of ${healthCountOf(a.traced, "answer")} with a trace · the cache held ${pct(a.cacheHit)} of the prompt`}
      testid="console-health-ask-stages"
    >
      {a.traced === 0 ? (
        <NoneRow words="No answer kept its trace in the window." />
      ) : (
        <>
          <HealthRows head={["Stage", "Median", "p95", { label: "", desk: true }]} label="Where the time goes">
            {a.stages.map((s) => (
              <HealthRow
                key={s.key}
                title={s.words}
                testid={`console-health-ask-stage-${s.key}`}
                cells={[
                  { v: secondsWords(s.p50) },
                  { v: secondsWords(s.p95) },
                  {
                    desk: true,
                    v:
                      whole && s.p95 !== null ? (
                        <Meter
                          size="sm"
                          parts={[
                            { tone: "ok", share: Math.min(1, s.p95 / whole) },
                            { tone: "rest", share: 1 - Math.min(1, s.p95 / whole) },
                          ]}
                          aria-label={`${s.words}: ${secondsWords(s.p95)} of ${secondsWords(whole)} at the 95th percentile`}
                        />
                      ) : null,
                  },
                ]}
              />
            ))}
          </HealthRows>
          <HealthRows head={["How it answered", "Answers"]} label="How it answered">
            <HealthRow title="In one round" cells={[{ v: n(a.rounds.one) }]} />
            <HealthRow title="In two rounds" cells={[{ v: n(a.rounds.two) }]} />
            <HealthRow title="In more" cells={[{ v: n(a.rounds.more) }]} />
            <HealthRow title="In fast mode" cells={[{ v: n(a.fast) }]} />
          </HealthRows>
        </>
      )}
    </ScreenSection>
  );
}

function Tools({ a }: { a: HealthAskVM }) {
  return (
    <ScreenSection title="Tools" sub="slowest on average first" testid="console-health-ask-tools">
      {a.tools.length === 0 ? (
        <NoneRow words="No tool ran in the window." />
      ) : (
        <HealthRows head={["Tool", "Runs", "Average", "Slowest"]} label="Tools">
          {a.tools.map((t) => (
            <HealthRow
              key={t.name}
              title={t.words}
              sub={t.slow ? "Slow" : undefined}
              subTone="warn"
              cells={[
                { v: n(t.n) },
                { v: secondsWords(t.avgMs), tone: t.slow ? "warn" : undefined },
                { v: secondsWords(t.maxMs) },
              ]}
              testid={`console-health-ask-tool-${t.name}`}
            />
          ))}
        </HealthRows>
      )}
    </ScreenSection>
  );
}

/** Every failure in both voices: what the owner read, and what the API said of a round that got no answer. */
function Failures({ a, h }: { a: HealthAskVM; h: ConsoleHealth }) {
  const nameOf = workspaceNamer(h.workspaces);
  const none = a.failures.length === 0 && a.apiFailures.length === 0;
  const where = (tenantId: string, ours: boolean) => `${nameOf(tenantId)}${ours ? " · Ours" : ""}`;
  return (
    <ScreenSection
      title="What failed"
      sub="what the owner read, then what the API said"
      testid="console-health-ask-failures"
    >
      {none ? (
        <NoneRow words="No answer failed in the window." />
      ) : (
        <HealthRows head={["What happened", "Workspace", "When, UTC"]} label="What failed" wide>
          {a.failures.map((f, i) => (
            <HealthRow
              key={`said:${f.atMs}:${i}`}
              title={`“${f.said}”`}
              sub={f.failure ?? undefined}
              subTone="warn"
              cells={[{ v: where(f.tenantId, f.ours), desk: true }, { v: when(f.atMs) }]}
            />
          ))}
          {a.apiFailures.map((f, i) => (
            <HealthRow
              key={`api:${f.atMs}:${i}`}
              title={f.reason ?? "No reason kept: this round came before the ledger kept them"}
              sub="The API, on a round"
              subTone={f.reason ? "danger" : undefined}
              cells={[{ v: where(f.tenantId, f.ours), desk: true }, { v: when(f.atMs) }]}
            />
          ))}
        </HealthRows>
      )}
    </ScreenSection>
  );
}

function ByWorkspace({ a, h }: { a: HealthAskVM; h: ConsoleHealth }) {
  const nameOf = workspaceNamer(h.workspaces);
  return (
    <ScreenSection
      title="Each workspace's Ask"
      sub="what it cost, the most first"
      testid="console-health-ask-workspaces"
    >
      {a.byWorkspace.length === 0 ? (
        <NoneRow words="No workspace asked anything in the window." />
      ) : (
        <HealthRows
          head={["Workspace", "Cost", "Answers", { label: "Rounds", desk: true }]}
          label="Each workspace's Ask"
        >
          {a.byWorkspace.map((w) => (
            <HealthRow
              key={w.tenantId}
              title={nameOf(w.tenantId)}
              sub={w.ours ? "Ours" : undefined}
              cells={[{ v: dollarsWords(w.usd) }, { v: n(w.answers) }, { v: n(w.rounds), desk: true }]}
            />
          ))}
        </HealthRows>
      )}
    </ScreenSection>
  );
}

export function AskTab({ a, h, scope }: { a: HealthAskVM; h: ConsoleHealth; scope: HealthScope }) {
  if (h.parts === null)
    return (
      <ScreenSection title="Ask" testid="console-health-ask">
        <NoneRow words="Ask's numbers could not be read just now." />
      </ScreenSection>
    );
  return (
    <>
      <AskFigures a={a} scope={scope} />
      <Stages a={a} />
      <Tools a={a} />
      <Failures a={a} h={h} />
      <ByWorkspace a={a} h={h} />
    </>
  );
}
