/**
 * Settings › Autonomy on the workspace's policies table (moved from legacy/pages/settings.jsx, decision 0015 step 11).
 *
 * Every row is a class with an enforcer -- the receptionist (replies), the playbooks (re-engage, offers), the review
 * sweep -- so every switch shown is one something honours, offering only the modes it honours. Replies is a card of its
 * own, with the two dials that only mean something under its mode (the hold window and the confidence dial) under it;
 * bookings and price questions are each one question on Settings (business/choices: the class with the switch or the
 * rule it goes with), and money, which nothing can change, is said once, on Limits (the Settings wiring review, 18 Oct
 * 2026). The dials write the reply row's limits through one route. The limits card shows the runtime's actual numbers:
 * two the charter's, the rest this workspace's own. Settings' page (settings.jsx) still
 * draws it by its old name, which seed-globals publishes (settings/globals.ts), until Settings' frame moves; the mockup's
 * seeded twin (its own matrix, defaults and guardrails, kept in the browser) left with it.
 */
import { useState, type ReactNode } from "react";
import {
  MIN_MS,
  REPLY_DELAY_DEFAULT_MS,
  budgetDial,
  hardLimitsWords,
  heldDraftsByClass,
  tokensPerReply,
  type BudgetDial,
} from "@chanlytics/contracts";
import type { PolicyDials } from "@/legacy-bridge/inbox-verbs";
import { modeLabel, uiRows, type UiRow } from "@/legacy-bridge/policy-store";
import { FailedRead } from "../../kit/empty/empty";
import { RecordRow } from "../../kit/record/row";
import { gate, type LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { BusinessLimitRows } from "../business/tab";
import { SetDial, SetRow } from "./controls";
import { AutOwnModes } from "./own-modes";
import { PolModeRow, PolPhoneRows, PolicyTable, polMode, useSetPhone } from "./matrix";
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
// The day's model budget: tokens in and out over a rolling 24 hours, from the usage events every reply writes, said on
// its dial in the replies each cap buys. Over it the receptionist stops for the day and each new message lands in Needs
// you, as at the reply cap. 0 is none.
const AUT_BUDGET_CAPS: readonly number[] = [0, 100000, 250000, 500000, 1000000];
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
function savedWords(r: UiRow, mode: string | undefined, d: PolicyDials, budget: BudgetDial): ReactNode {
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
        <b>{budget.label}</b> → {wordOf(budget.steps, maxTokensDay, String(maxTokensDay))} — from the next reply
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

/**
 * The dials Replies holds under its mode, only where the mode has them: the hold window holds a reply under Veto, and
 * under Auto one below the confidence dial; under Ask or Never neither does anything, so neither is drawn.
 */
function replyDials(reply: UiRow): DialRow[] {
  const limits = reply.limits || {};
  const delayMs = Number(limits.reply_delay_ms) || REPLY_DELAY_DEFAULT_MS;
  const minConf = Number(limits.min_confidence) || 0;
  const dials: DialRow[] = [];
  if (reply.mode === "Auto" || reply.mode === "Veto")
    dials.push({
      label: "Hold window",
      note: "How long a reply waits before it sends, so you can stop or change it from the Inbox. A booking link asked for on the phone goes out at once.",
      steps: AUT_DELAYS,
      value: wordOf(AUT_DELAYS, delayMs, `${Math.round(delayMs / 1000)}s`),
      save: (v: number) => ({ replyDelayMs: v }),
    });
  if (reply.mode === "Auto")
    dials.push({
      label: "Send on its own only when it's sure",
      note: "A reply less certain than this waits in the hold window instead of going out. Off sends everything, and so does a reply with no confidence on record.",
      steps: AUT_CONF,
      value: wordOf(AUT_CONF, minConf, `${Math.round(minConf * 100)}%`),
      save: (v: number) => ({ minConfidence: v }),
    });
  return dials;
}

/**
 * The classes the matrix does not draw: Replies has its card; bookings and price questions are asked once each on
 * Settings, where the switch or the rule they go with is (business/choices); money is said once, on Limits.
 */
const AUT_ASKED_ELSEWHERE = new Set(["reply", "booking", "faq", "money"]);

export const PaneAutonomyReal = ({ flash, row = null }: { flash: (f: LegacyFlash) => void; row?: string | null }) => {
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
  // How often the owner changed what it wrote, by the row a draft belongs to (decision 0063).
  const held = heldDraftsByClass(policies.held ?? []);
  const reply = rows.find((r) => r.id === "reply");
  const limits = (reply && reply.limits) || {};
  // The hard limits in contracts' words, which say each default, and the value each of the owner's two dials shows:
  // the stored one, or the default.
  const hard = hardLimitsWords(limits);
  const capSteps = withStep(AUT_CAP, hard.cap, String(hard.cap));
  const pauseSteps = withStep(AUT_PAUSE, hard.hours, `${hard.hours}h`);
  const budget = Number(limits.max_llm_tokens_day) || 0;
  // The budget's dial, a stored cap off its steps among them, each said in the replies it buys here.
  const budgetAt = budgetDial(
    [...new Set([...AUT_BUDGET_CAPS, budget])].sort((a, b) => a - b),
    tokensPerReply(policies.replyTokens),
  );

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
    flash({ msg: savedWords(r, mode, dials, budgetAt) });
  };
  const putDial = (r: UiRow, m: undefined, d: PolicyDials) => void put(r, m, d);
  const putMode = (r: UiRow, m: string) => void put(r, m);
  const matrix = rows.filter((r) => !AUT_ASKED_ELSEWHERE.has(r.cls));

  return (
    <>
      {reply ? (
        <section className="rec-card set-card" data-testid="aut-replies">
          <div className="rec-card-head">
            <h2 className="rec-card-title">Replies</h2>
            <span className="rec-card-sub">How each text to a customer goes out, and how long it waits for you</span>
          </div>
          <PolModeRow r={reply} put={putMode} busy={busy} held={held} />
          <AutOwnModes own={policies.ownModes} />
          {replyDials(reply).map((d) => dialRow(d, phone, reply, putDial))}
        </section>
      ) : null}

      <section className="rec-card set-card">
        <div className="rec-card-head">
          <h2 className="rec-card-title">Policy matrix</h2>
          <span className="rec-card-sub">
            What else it may do without you. Every row is one it consults before acting.
          </span>
        </div>
        {phone ? (
          <PolPhoneRows rows={matrix} put={putMode} busy={busy} held={held} />
        ) : (
          <PolicyTable rows={matrix} put={putMode} busy={busy} held={held} />
        )}
      </section>

      <section className="rec-card set-card">
        <div className="rec-card-head">
          <h2 className="rec-card-title">Limits</h2>
          <span className="rec-card-sub">{hard.sub}</span>
        </div>
        <RecordRow id="aut-hard-stop" label="Asked to stop" value="Never messaged" />
        <RecordRow
          id="aut-hard-money"
          label="Refunds, rates, negotiation"
          value="Always go to you — locked in the database"
        />
        {/* The business's limits, its own rows (17 Oct 2026: a rule about prices lived on two tabs): what it says when
            someone asks a price, the rules it always keeps, and when it hands you a customer. */}
        <BusinessLimitRows flash={flash} open={row} />
        {/* The reply cap and the pause were Chanlytics' and could not be changed here (S6): the owner's dials now,
            through the same door as the two on Replies, and the day's budget beside them. */}
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
          {
            // Said in replies at this workspace's own size of reply, kept in tokens (contracts budgetDial; the
            // Settings wiring review, item 12): "100k" and "1M" were a developer's words.
            ...budgetAt,
            value: wordOf(budgetAt.steps, budget, String(budget)),
            save: (v: number) => ({ maxTokensDay: v }),
            testid: "aut-budget",
          },
        ].map((d) => dialRow(d, phone, reply, putDial))}
      </section>
    </>
  );
};
