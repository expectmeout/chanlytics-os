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
import { HealthLine, healthCount as n, utcWords as when } from "./line";

const pct = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);

function AskFigures({ a, scope }: { a: HealthAskVM; scope: HealthScope }) {
  return (
    <dl className="cs-h-figures" data-testid="console-health-ask-figures">
      <Figure label="Answers" value={n(a.answers)} meta={`in ${n(a.threads)} conversations`} />
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
        meta={`${n(a.ungrounded)} answered without the workspace's facts`}
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
      sub={`of ${n(a.traced)} answers with a trace · median and 95th percentile`}
      testid="console-health-ask-stages"
    >
      {a.traced === 0 ? (
        <NoneRow words="No answer kept its trace in the window." />
      ) : (
        <div className="cl-attn-list">
          {a.stages.map((s) => (
            <div className="set-row" key={s.key} data-testid={`console-health-ask-stage-${s.key}`}>
              <div className="set-row-info">
                <span className="set-row-label">{s.words}</span>
                <span className="set-row-hint">{`median ${secondsWords(s.p50)} · p95 ${secondsWords(s.p95)}`}</span>
                {whole && s.p95 !== null ? (
                  <Meter
                    size="sm"
                    rest
                    parts={[{ tone: "ok", share: Math.min(1, s.p95 / whole) }]}
                    aria-label={`${s.words}: ${secondsWords(s.p95)} of ${secondsWords(whole)} at the 95th percentile`}
                  />
                ) : null}
              </div>
            </div>
          ))}
          <HealthLine
            label="Rounds"
            hint={`${n(a.rounds.one)} in one · ${n(a.rounds.two)} in two · ${n(a.rounds.more)} in more · the cache held ${pct(a.cacheHit)} of the prompt · ${n(a.fast)} in fast mode`}
          />
        </div>
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
        <div className="cl-attn-list">
          {a.tools.map((t) => (
            <HealthLine
              key={t.name}
              label={t.words}
              hint={`${n(t.n)} runs · average ${secondsWords(t.avgMs)} · slowest ${secondsWords(t.maxMs)}${t.slow ? " · slow" : ""}`}
              tone={t.slow ? "warn" : undefined}
              testid={`console-health-ask-tool-${t.name}`}
            />
          ))}
        </div>
      )}
    </ScreenSection>
  );
}

/** Every failure in both voices: what the owner read, and what the API said of a round that got no answer. */
function Failures({ a, h }: { a: HealthAskVM; h: ConsoleHealth }) {
  const nameOf = workspaceNamer(h.workspaces);
  const none = a.failures.length === 0 && a.apiFailures.length === 0;
  return (
    <ScreenSection
      title="What failed"
      sub="what the owner read, then what the API said"
      testid="console-health-ask-failures"
    >
      {none ? (
        <NoneRow words="No answer failed in the window." />
      ) : (
        <div className="cl-attn-list">
          {a.failures.map((f, i) => (
            <HealthLine
              key={`said:${f.atMs}:${i}`}
              label={`“${f.said}”`}
              hint={`${nameOf(f.tenantId)}${f.ours ? " · Ours" : ""} · ${when(f.atMs)} UTC${f.failure ? ` · ${f.failure}` : ""}`}
              tone="warn"
            />
          ))}
          {a.apiFailures.map((f, i) => (
            <HealthLine
              key={`api:${f.atMs}:${i}`}
              label={f.reason ?? "No reason kept: this round came before the ledger kept them"}
              hint={`The API, on a round · ${nameOf(f.tenantId)}${f.ours ? " · Ours" : ""} · ${when(f.atMs)} UTC`}
              tone={f.reason ? "danger" : undefined}
            />
          ))}
        </div>
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
        <div className="cl-attn-list">
          {a.byWorkspace.map((w) => (
            <HealthLine
              key={w.tenantId}
              label={`${nameOf(w.tenantId)}${w.ours ? " · Ours" : ""}`}
              hint={`${dollarsWords(w.usd)} · ${n(w.answers)} answers · ${n(w.rounds)} model rounds`}
            />
          ))}
        </div>
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
