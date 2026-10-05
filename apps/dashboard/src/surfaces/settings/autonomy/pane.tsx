/**
 * Settings › Autonomy on the workspace's policies table (moved from legacy/pages/settings.jsx, decision 0015 step 11).
 *
 * Every row is a class with an enforcer -- the receptionist (replies, questions, bookings), the playbooks (re-engage,
 * offers), the review sweep, and for money a database trigger -- so every switch shown is one something honours,
 * offering only the modes it honours. The three dials write the reply row's limits through one route. The limits card
 * shows the runtime's actual numbers: two the charter's, two this workspace's own. Settings' page (settings.jsx) still
 * draws it by its old name, which seed-globals publishes (settings/globals.ts), until Settings' frame moves; the mockup's
 * seeded twin (its own matrix, defaults and guardrails, kept in the browser) left with it.
 */
import { useState, type ReactNode } from "react";
import { MIN_MS, REPLY_DELAY_DEFAULT_MS, hardLimitsWords } from "@chanlytics/contracts";
import type { PolicyDials } from "@/legacy-bridge/inbox-verbs";
import { modeLabel, uiRows, type UiRow } from "@/legacy-bridge/policy-store";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { gate, type LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { SetDial, SetRow } from "./controls";
import { PolPhoneRows, PolicyTable, polMode, useSetPhone } from "./matrix";
import { autonomyVerbs } from "./verbs";

/** A step of a dial: its word, and the value it stores. */
type Step = readonly [string, number];

const AUT_DELAYS: readonly Step[] = [
  ["15s", 15000],
  ["30s", 30000],
  ["1m", MIN_MS],
  ["2m", 2 * MIN_MS],
  ["5m", 5 * MIN_MS],
];
// The confidence dial. Under Auto, a reply the receptionist is less sure about than this waits in the hold window for a
// person. Off sends everything.
const AUT_CONF: readonly Step[] = [
  ["Off", 0],
  ["60%", 0.6],
  ["75%", 0.75],
  ["90%", 0.9],
];
// The day's model budget: tokens in and out over a rolling 24 hours, from the usage events every reply writes. Over it
// the receptionist stops for the day and each new message lands in Needs you, as at the reply cap.
const AUT_BUDGET: readonly Step[] = [
  ["Off", 0],
  ["100k", 100000],
  ["250k", 250000],
  ["500k", 500000],
  ["1M", 1000000],
];
// The two hard limits that are the owner's to set (S6): automatic replies to one person in 24 hours before the
// receptionist stops and asks, and the hours it stays out of a conversation once a person steps in. Steps inside what
// the route accepts (1 to 200, 1 to 168); a value stored off these steps shows as a step of its own, never as a wrong one.
const AUT_CAP: readonly Step[] = [
  ["10", 10],
  ["20", 20],
  ["40", 40],
  ["100", 100],
];
const AUT_PAUSE: readonly Step[] = [
  ["1h", 1],
  ["4h", 4],
  ["12h", 12],
  ["24h", 24],
  ["3d", 72],
];

const withStep = (steps: readonly Step[], value: number, label: string): readonly Step[] =>
  steps.some((s) => s[1] === value) ? steps : [...steps, [label, value] as const].sort((a, b) => a[1] - b[1]);
/** A value's word on its dial, or the one it is written as where it is off the steps. */
const wordOf = (steps: readonly Step[], value: number, otherwise: string): string =>
  steps.find((s) => s[1] === value)?.[0] ?? otherwise;
const stepWords = (steps: readonly Step[]) => steps.map((s) => s[0]);

/** What a save says it did, in the words the row above it uses: one dial at a time, or the class's mode. */
function savedWords(r: UiRow, mode: string | undefined, d: PolicyDials): ReactNode {
  const { replyDelayMs, minConfidence, maxTokensDay, maxRepliesDay, pauseHours } = d;
  if (replyDelayMs !== undefined)
    return (
      <>
        <b>Hold window</b> → {wordOf(AUT_DELAYS, replyDelayMs, `${replyDelayMs / 1000}s`)} — from the next reply
      </>
    );
  if (minConfidence !== undefined)
    return (
      <>
        <b>Confidence dial</b> → {wordOf(AUT_CONF, minConfidence, `${Math.round(minConfidence * 100)}%`)} — from the
        next reply
      </>
    );
  if (maxTokensDay !== undefined)
    return (
      <>
        <b>Day&apos;s model budget</b> → {wordOf(AUT_BUDGET, maxTokensDay, `${Math.round(maxTokensDay / 1000)}k`)} —
        from the next reply
      </>
    );
  if (maxRepliesDay !== undefined)
    return (
      <>
        <b>Reply cap</b> → {maxRepliesDay} automatic replies to one person in 24 hours — from the next reply
      </>
    );
  if (pauseHours !== undefined)
    return (
      <>
        <b>Stays out after a person steps in</b> → {wordOf(AUT_PAUSE, pauseHours, `${pauseHours}h`)} — from the next
        time someone steps in
      </>
    );
  // The confirmation says what will happen, in the words the heading just used.
  return (
    <>
      <b>{r.label}</b> → {String(polMode(modeLabel(mode)).head).toLowerCase()} — from the next message
    </>
  );
}

/** A dial on its row: the row names it, and a press saves that one dial on the reply row, never its mode. */
interface DialRow {
  label: string;
  note?: string;
  hint?: ReactNode;
  steps: readonly Step[];
  value: string;
  save: (value: number) => PolicyDials;
  testid?: string;
}

function dialRow(
  d: DialRow,
  phone: boolean,
  reply: UiRow | undefined,
  put: (r: UiRow, m: undefined, d: PolicyDials) => void,
) {
  return (
    <SetRow
      key={d.label}
      label={d.label}
      note={d.note}
      hint={d.hint}
      control={(id) => (
        <SetDial
          aria-labelledby={id}
          phone={phone}
          label={d.label}
          gate={gate("autonomy")}
          value={d.value}
          options={stepWords(d.steps)}
          onChange={(v) => {
            const s = d.steps.find((x) => x[0] === v);
            if (s && reply) put(reply, undefined, d.save(s[1]));
          }}
          {...(d.testid ? { "data-testid": d.testid } : {})}
        />
      )}
    />
  );
}

export const PaneAutonomyReal = ({ flash }: { flash: (f: LegacyFlash) => void }) => {
  const read = useSurface("settings");
  const [busy, setBusy] = useState<string | null>(null);
  const phone = useSetPhone();
  if (!read) return null;
  const policies = read.policies;
  if (policies === null) {
    return (
      <FailedRead
        kind="card"
        title="Your autonomy settings couldn't be loaded"
        body="The receptionist keeps running on the settings it already has; this page just can't show them right now."
        surface="settings"
        testid="policies-failed"
      />
    );
  }
  // A value kept from before the settings read carried the policies: nothing to draw until it is read again.
  if (!policies) return null;

  const rows = uiRows(policies);
  const reply = rows.find((r) => r.id === "reply");
  const limits = (reply && reply.limits) || {};
  const delayMs = Number(limits.reply_delay_ms) || REPLY_DELAY_DEFAULT_MS;
  // The hard limits in contracts' words, which say each default, and the value each of the owner's two dials shows:
  // the stored one, or the default.
  const hard = hardLimitsWords(limits);
  const capSteps = withStep(AUT_CAP, hard.cap, String(hard.cap));
  const pauseSteps = withStep(AUT_PAUSE, hard.hours, `${hard.hours}h`);
  const minConf = Number(limits.min_confidence) || 0;
  const budget = Number(limits.max_llm_tokens_day) || 0;

  // One dial at a time, and never the mode with it (the bridge's PolicyDials).
  const put = async (r: UiRow, mode: string | undefined, dials: PolicyDials = {}) => {
    setBusy(r.cls);
    const res = await autonomyVerbs.setPolicy(r.cls, mode, dials);
    setBusy(null);
    if (!res.ok) {
      flash({
        tone: "danger",
        msg: (
          <>
            <b>Not changed</b> — {res.message}
          </>
        ),
      });
      return;
    }
    flash({ msg: savedWords(r, mode, dials) });
  };
  const putDial = (r: UiRow, m: undefined, d: PolicyDials) => void put(r, m, d);
  const putMode = (r: UiRow, m: string) => void put(r, m);

  return (
    <>
      <section className="fl-card set-card">
        <div className="fl-card-head">
          <h2 className="fl-card-title">Policy matrix</h2>
          <span className="fl-card-sub">What it may do without you. Every row is one it consults before acting.</span>
        </div>
        {phone ? (
          <PolPhoneRows rows={rows} put={putMode} busy={busy} />
        ) : (
          <PolicyTable rows={rows} put={putMode} busy={busy} />
        )}
      </section>

      <section className="fl-card set-card">
        <div className="fl-card-head">
          <h2 className="fl-card-title">Reply timing and budget</h2>
          <span className="fl-card-sub">
            The hold window applies under Veto, and under Auto below the confidence dial.
          </span>
        </div>
        {[
          {
            label: "Hold window",
            note: "How long a reply waits before it sends, so you can stop or change it from the Inbox. A booking link asked for on the phone goes out at once.",
            steps: AUT_DELAYS,
            value: wordOf(AUT_DELAYS, delayMs, `${Math.round(delayMs / 1000)}s`),
            save: (v: number) => ({ replyDelayMs: v }),
          },
          {
            label: "Send on its own only when it's sure",
            note: "Under Auto, a reply less certain than this waits in the hold window instead of going out. Off sends everything, and so does a reply with no confidence on record.",
            steps: AUT_CONF,
            value: wordOf(AUT_CONF, minConf, `${Math.round(minConf * 100)}%`),
            save: (v: number) => ({ minConfidence: v }),
          },
          {
            label: "Day's model budget",
            note: "Model tokens it may spend in a rolling 24 hours, in and out. Over the budget it stops answering for the day, and every new message lands in Needs you.",
            steps: AUT_BUDGET,
            value: wordOf(AUT_BUDGET, budget, `${Math.round(budget / 1000)}k`),
            save: (v: number) => ({ maxTokensDay: v }),
          },
        ].map((d) => dialRow(d, phone, reply, putDial))}
      </section>

      <section className="fl-card set-card">
        <div className="fl-card-head">
          <h2 className="fl-card-title">Hard limits</h2>
          <span className="fl-card-sub">{hard.sub}</span>
        </div>
        <ul className="st-bullets">
          <li>
            <Icon name="check" size={11} />
            <span>Never messages a customer who asked to stop</span>
          </li>
          <li>
            <Icon name="check" size={11} />
            <span>Refunds, rates and negotiation always go to you — locked in the database</span>
          </li>
        </ul>
        {/* The last two were Chanlytics' and could not be changed here (S6): the owner's dials now, through the same
            door as the three above. */}
        {[
          {
            label: "Replies to one person in 24 hours",
            hint: hard.replies,
            steps: capSteps,
            value: wordOf(capSteps, hard.cap, String(hard.cap)),
            save: (v: number) => ({ maxRepliesDay: v }),
            testid: "aut-reply-cap",
          },
          {
            label: "Stays out after a person steps in",
            hint: hard.pause,
            steps: pauseSteps,
            value: wordOf(pauseSteps, hard.hours, `${hard.hours}h`),
            save: (v: number) => ({ pauseHours: v }),
            testid: "aut-pause",
          },
        ].map((d) => dialRow(d, phone, reply, putDial))}
      </section>
    </>
  );
};
