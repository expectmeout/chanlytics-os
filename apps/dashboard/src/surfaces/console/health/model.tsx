/**
 * Model calls, Health's tab (decision 0068): every call the platform made to the model in the window, by what it was
 * for, with the ones that got no answer and what each cost; each workspace's spend, ours marked; and every call with no
 * answer, the API's own reason beside it (kept since 00469; none before). A key out of credit is said as such, since it
 * stops every call. Every word is contracts' (modelCallsOf).
 */
import { dollarsWords, modelCallsOf, workspaceNamer, type HealthScope } from "@chanlytics/contracts";
import { Figure } from "../../kit/figure/figure";
import { NoneRow, ScreenSection } from "../parts";
import type { ConsoleHealth } from "../verbs";
import { HealthRow, HealthRows, healthCount as n, utcWords as when } from "./line";

export function ModelTab({ h, scope }: { h: ConsoleHealth; scope: HealthScope }) {
  if (h.parts === null)
    return (
      <ScreenSection title="Model calls" testid="console-health-model">
        <NoneRow words="The model calls could not be read just now." />
      </ScreenSection>
    );
  const m = modelCallsOf(h.parts, scope);
  const nameOf = workspaceNamer(h.workspaces);
  const credit = m.failureGroups.some((g) => g.credit);
  return (
    <>
      <dl className="cs-h-figures" data-testid="console-health-model-figures">
        <Figure label="Model calls" value={n(m.total)} meta={`in ${h.days} days`} />
        <Figure
          label="No answer"
          value={n(m.noAnswer)}
          meta={credit ? "the key's credit ran out" : "refused or unreachable"}
          {...(m.noAnswer ? { tone: credit ? ("fail" as const) : ("warn" as const) } : {})}
        />
        <Figure label="What it cost" value={dollarsWords(m.usd)} meta="as the usage ledger priced each call" />
      </dl>
      <ScreenSection title="By what it was for" sub="the most spent first" testid="console-health-model-purposes">
        {m.byPurpose.length === 0 ? (
          <NoneRow words="No model call in the window." />
        ) : (
          <HealthRows head={["What it was for", "Calls", "No answer", "Cost"]} label="By what it was for">
            {m.byPurpose.map((p) => (
              <HealthRow
                key={p.purpose}
                title={p.words}
                cells={[
                  { v: n(p.n) },
                  { v: n(p.noAnswer), tone: p.noAnswer ? "warn" : undefined },
                  { v: dollarsWords(p.usd) },
                ]}
                testid={`console-health-model-${p.purpose}`}
              />
            ))}
          </HealthRows>
        )}
      </ScreenSection>
      <ScreenSection
        title="By workspace"
        sub="what each spent, the most first"
        testid="console-health-model-workspaces"
      >
        {m.byWorkspace.length === 0 ? (
          <NoneRow words="No workspace called the model in the window." />
        ) : (
          <HealthRows head={["Workspace", "Cost", "Calls", { label: "Of it Ask", desk: true }]} label="By workspace">
            {m.byWorkspace.map((w) => (
              <HealthRow
                key={w.tenantId}
                title={nameOf(w.tenantId)}
                sub={w.ours ? "Ours" : undefined}
                cells={[{ v: dollarsWords(w.usd) }, { v: n(w.n) }, { v: dollarsWords(w.askUsd), desk: true }]}
              />
            ))}
          </HealthRows>
        )}
      </ScreenSection>
      <ScreenSection
        title="Calls with no answer"
        sub="newest first, the API's reason beside each"
        testid="console-health-model-failures"
      >
        {m.failures.length === 0 ? (
          <NoneRow words="Every model call got an answer." />
        ) : (
          <HealthRows head={["What the API said", "Workspace", "When, UTC"]} label="Calls with no answer" wide>
            {[...m.failures]
              .sort((a, b) => b.atMs - a.atMs)
              .map((f, i) => (
                <HealthRow
                  key={`${f.atMs}:${i}`}
                  title={f.reason ?? "No reason kept: this call came before the ledger kept them"}
                  sub={`${f.words} · ${f.outcome}`}
                  subTone={f.reason ? "danger" : undefined}
                  cells={[{ v: `${nameOf(f.tenantId)}${f.ours ? " · Ours" : ""}`, desk: true }, { v: when(f.atMs) }]}
                />
              ))}
          </HealthRows>
        )}
      </ScreenSection>
    </>
  );
}
