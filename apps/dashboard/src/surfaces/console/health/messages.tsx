/**
 * Messages and calls (decision 0068): sends by channel with what the providers said of the ones that failed, in words
 * with their codes; calls by how they ended, the endings that are ours to mend apart; what each provider delivered to
 * us this week and how much of it failed its signature, with billing's events beside it; and every connection that is
 * not healthy, with its workspace. Every word is contracts' (sendsOf, callsOf, webhooksOf, connectionsOf).
 */
import {
  callsOf,
  connectionsOf,
  inScope,
  sendsOf,
  webhooksOf,
  workspaceNamer,
  type HealthScope,
} from "@chanlytics/contracts";
import { Meter } from "../../kit/meter/meter";
import { NoneRow, ScreenSection } from "../parts";
import type { ConsoleHealth } from "../verbs";
import { HealthLine as Line, healthCount as n } from "./line";

function Sends({ h, scope }: { h: ConsoleHealth; scope: HealthScope }) {
  const s = sendsOf(h.parts, scope);
  return (
    <ScreenSection
      title="Sends"
      sub={`${n(s.failed)} of ${n(s.total)} failed · ${n(s.delivered)} confirmed delivered`}
      testid="console-health-sends"
    >
      {h.parts === null ? (
        <NoneRow words="The sends could not be read just now." />
      ) : s.channels.length === 0 ? (
        <NoneRow words="Nothing was sent in the window." />
      ) : (
        <div className="cl-attn-list">
          {s.channels.map((c) => (
            <div className="set-row" key={c.channel} data-testid={`console-health-send-${c.channel}`}>
              <div className="set-row-info">
                <span className="set-row-label">{c.words}</span>
                <span className="set-row-hint" data-tone={c.failed ? "warn" : undefined}>
                  {`${n(c.total)} sent · ${n(c.delivered)} delivered · ${n(c.failed)} failed${c.topError ? ` · most: ${c.topError}` : ""}`}
                </span>
                <Meter
                  size="sm"
                  rest
                  parts={[
                    { tone: "ok", share: c.total ? c.delivered / c.total : 0 },
                    { tone: "warn", share: c.total ? c.failed / c.total : 0 },
                  ]}
                  aria-label={`${c.words}: ${n(c.delivered)} delivered, ${n(c.failed)} failed, of ${n(c.total)}`}
                />
              </div>
            </div>
          ))}
          {s.errors.map((e) => (
            <Line
              key={`${e.channel}:${e.code}`}
              label={`${e.words}`}
              hint={`${e.channel} · code ${e.code} · ${n(e.n)} time${e.n === 1 ? "" : "s"}`}
              testid={`console-health-send-code-${e.code}`}
            />
          ))}
        </div>
      )}
    </ScreenSection>
  );
}

function Calls({ h, scope }: { h: ConsoleHealth; scope: HealthScope }) {
  const c = callsOf(h.parts, scope);
  return (
    <ScreenSection title="Calls" sub={`${n(c.connected)} of ${n(c.total)} connected`} testid="console-health-calls">
      {h.parts === null ? (
        <NoneRow words="The calls could not be read just now." />
      ) : c.total === 0 ? (
        <NoneRow words="No call came in." />
      ) : (
        <div className="cl-attn-list">
          {c.trouble.map((t) => (
            <Line
              key={`trouble:${t.reason}`}
              label={`${n(t.n)} ${t.words}`}
              hint={t.why}
              tone="danger"
              testid={`console-health-call-trouble-${t.reason}`}
            />
          ))}
          {c.reasons.map((r) => (
            <Line key={r.reason || "none"} label={r.words} hint={`${n(r.n)} call${r.n === 1 ? "" : "s"}`} />
          ))}
        </div>
      )}
    </ScreenSection>
  );
}

function Webhooks({ h, scope, nowMs }: { h: ConsoleHealth; scope: HealthScope; nowMs: number }) {
  const w = webhooksOf(h.parts, scope, nowMs);
  return (
    <ScreenSection
      title="Webhooks in · this week"
      sub={`${n(w.total)} delivered to us · ${n(w.unverified)} failed their signature`}
      testid="console-health-webhooks"
    >
      {h.parts === null ? (
        <NoneRow words="What the providers delivered could not be read just now." />
      ) : w.providers.length === 0 ? (
        <NoneRow words="No provider delivered anything this week." />
      ) : (
        <div className="cl-attn-list">
          {w.providers.map((p) => (
            <Line
              key={p.provider}
              label={p.words}
              hint={`${n(p.n)} · ${p.unverified} unverified · ${p.doors.join(", ")}`}
              tone={p.unverified ? "warn" : undefined}
              testid={`console-health-webhook-${p.provider}`}
            />
          ))}
          {w.billing.map((b) => (
            <Line key={`${b.type}:${b.state}`} label={`Billing · ${b.type}`} hint={`${n(b.n)} ${b.state}`} />
          ))}
        </div>
      )}
    </ScreenSection>
  );
}

function Connections({ h, scope }: { h: ConsoleHealth; scope: HealthScope }) {
  const nameOf = workspaceNamer(h.workspaces);
  const rows = connectionsOf(h.parts).filter((c) => inScope(c.ours, scope));
  return (
    <ScreenSection
      title="Connections"
      sub="lines, channels, Google and mailboxes that are not healthy"
      testid="console-health-connections"
    >
      {h.parts === null ? (
        <NoneRow words="The connections could not be read just now." />
      ) : rows.length === 0 ? (
        <NoneRow words="Every connection is healthy." />
      ) : (
        <div className="cl-attn-list">
          {rows.map((c) => (
            <Line
              key={c.key}
              label={`${c.what} · ${nameOf(c.tenantId)}${c.ours ? " · Ours" : ""}`}
              hint={c.why}
              tone="warn"
              testid={`console-health-connection-${c.key}`}
            />
          ))}
        </div>
      )}
    </ScreenSection>
  );
}

export function MessagesTab({ h, scope, nowMs }: { h: ConsoleHealth; scope: HealthScope; nowMs: number }) {
  return (
    <>
      <Sends h={h} scope={scope} />
      <Calls h={h} scope={scope} />
      <Webhooks h={h} scope={scope} nowMs={nowMs} />
      <Connections h={h} scope={scope} />
    </>
  );
}
