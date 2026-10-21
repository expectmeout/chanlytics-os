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
import { HealthRow, HealthRows, healthCount as n, healthCountOf } from "./line";

function Sends({ h, scope }: { h: ConsoleHealth; scope: HealthScope }) {
  const s = sendsOf(h.parts, scope);
  const channelWords = (channel: string) => s.channels.find((c) => c.channel === channel)?.words ?? channel;
  return (
    <>
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
          <HealthRows head={["Channel", "Sent", "Delivered", "Failed", { label: "", desk: true }]} label="Sends">
            {s.channels.map((c) => (
              <HealthRow
                key={c.channel}
                title={c.words}
                testid={`console-health-send-${c.channel}`}
                cells={[
                  { v: n(c.total) },
                  { v: n(c.delivered) },
                  { v: n(c.failed), tone: c.failed ? "warn" : undefined },
                  {
                    desk: true,
                    v: (
                      <Meter
                        size="sm"
                        parts={[
                          { tone: "ok", share: c.total ? c.delivered / c.total : 0 },
                          { tone: "warn", share: c.total ? c.failed / c.total : 0 },
                          // Sent and not yet confirmed either way: the rest of the whole, at its own share.
                          { tone: "rest", share: c.total ? (c.total - c.delivered - c.failed) / c.total : 1 },
                        ]}
                        aria-label={`${c.words}: ${n(c.delivered)} delivered, ${n(c.failed)} failed, of ${n(c.total)}`}
                      />
                    ),
                  },
                ]}
              />
            ))}
          </HealthRows>
        )}
      </ScreenSection>
      {s.errors.length > 0 && (
        <ScreenSection
          title="Why sends failed"
          sub="in the providers' own codes, the most first"
          testid="console-health-send-codes"
        >
          <HealthRows head={["What the provider said", "Channel", "Sends"]} label="Why sends failed">
            {s.errors.map((e) => (
              <HealthRow
                key={`${e.channel}:${e.code}`}
                title={e.words}
                sub={`code ${e.code}`}
                mono
                cells={[{ v: channelWords(e.channel) }, { v: n(e.n), tone: "warn" }]}
                testid={`console-health-send-code-${e.code}`}
              />
            ))}
          </HealthRows>
        </ScreenSection>
      )}
    </>
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
        <HealthRows head={["How it ended", "Calls"]} label="Calls">
          {c.reasons.map((r) => {
            const trouble = c.trouble.find((t) => t.reason === r.reason);
            return (
              <HealthRow
                key={r.reason || "none"}
                title={r.label}
                sub={trouble?.why}
                subTone="danger"
                cells={[{ v: n(r.n), tone: trouble ? "danger" : undefined }]}
                testid={trouble ? `console-health-call-trouble-${r.reason}` : undefined}
              />
            );
          })}
        </HealthRows>
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
      ) : w.providers.length === 0 && w.billing.length === 0 ? (
        <NoneRow words="No provider delivered anything this week." />
      ) : (
        <HealthRows head={["Provider", "Delivered", "Unverified"]} label="Webhooks in">
          {w.providers.map((p) => (
            <HealthRow
              key={p.provider}
              title={p.words}
              sub={p.doors.join(" · ")}
              mono
              cells={[{ v: n(p.n) }, { v: n(p.unverified), tone: p.unverified ? "warn" : undefined }]}
              testid={`console-health-webhook-${p.provider}`}
            />
          ))}
          {w.billing.map((b) => (
            <HealthRow
              key={`${b.type}:${b.state}`}
              title="Billing"
              sub={`${b.type} · ${b.state}`}
              mono
              cells={[{ v: n(b.n) }, { v: "—" }]}
            />
          ))}
        </HealthRows>
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
      sub={
        rows.length ? `${healthCountOf(rows.length, "connection")} not healthy` : "lines, channels, Google, mailboxes"
      }
      testid="console-health-connections"
    >
      {h.parts === null ? (
        <NoneRow words="The connections could not be read just now." />
      ) : rows.length === 0 ? (
        <NoneRow words="Every connection is healthy." />
      ) : (
        <HealthRows head={["Connection", "Workspace"]} label="Connections" wide>
          {rows.map((c) => (
            <HealthRow
              key={c.key}
              title={c.what}
              sub={c.why}
              subTone="warn"
              cells={[{ v: `${nameOf(c.tenantId)}${c.ours ? " · Ours" : ""}` }]}
              testid={`console-health-connection-${c.key}`}
            />
          ))}
        </HealthRows>
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
