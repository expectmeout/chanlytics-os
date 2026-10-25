/**
 * A workspace's Setup and lines, and what has happened in it (moved from the back office's opened workspace,
 * surfaces/settings/platform/detail.tsx, decision 0066): the Setup its owner sees, its lines and what may be done to
 * each, each act asking why before it runs; and its events, newest first, in its own zone.
 */
import { Fragment, useState } from "react";
import {
  LINE_ACTS,
  staffMay,
  stateOf,
  type ConsoleWhy,
  type PlatformLineActionVM,
  type SetupDto,
  type StaffRole,
} from "@chanlytics/contracts";
import { AttnRow } from "../kit/attention/attn-row";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { Meter } from "../kit/meter/meter";
import { RecordTip } from "../kit/record/field";
import type { LegacyFlash } from "../legacy-verbs";
import { backOffice } from "@/legacy-bridge/platform";
import { WhyAsk } from "./why";

type Flash = (f: LegacyFlash) => void;
type PlatformLineRow = NonNullable<SetupDto["lines"]>["rows"][number];
type PlatformEvent = { kind: string; category: string; subject_type: string | null; created_at: string };

// Every time on this page belongs to the workspace being LOOKED AT, not to the one you are signed in to: P.clock is the
// same contracts clock, called with the zone the header names -- so the page still keeps no calendar of its own.
const pfClock = () => backOffice.verbs.clock;
const pfTime = (iso: string, tz: string) => pfClock().time(Date.parse(iso), tz);
const pfKey = (iso: string, tz: string) => pfClock().dayKey(Date.parse(iso), tz);
const pfDay = (iso: string, tz: string) => pfClock().dayLabel(Date.parse(iso), tz, Date.now());
// A Setup row's tone is its state's own (contracts/tone.ts), as the owner's page draws it.
const setupTone = (state: string) => stateOf("setup", state).tone;

/**
 * One line, and what may be done to it.
 *
 * Armed, then asked why, and the ask LEADS with what it spends -- because `refile` is two different actions wearing one
 * name: a rejected campaign is corrected in place for nothing, a rehearsal is replaced by a real filing for about
 * $19.50 that cannot be undone. Which one this line is offering, and what it costs, comes from the contract; the page
 * only reads it out. A role that may not take the act is not offered it (staffMay); the route refuses it all the same.
 */
export function PlatformLine({
  line,
  tenantId,
  role,
  onDone,
  flash,
}: {
  line: PlatformLineRow;
  tenantId: string;
  role: StaffRole;
  onDone: () => void;
  flash: Flash;
}) {
  const P = backOffice.verbs;
  const [arm, setArm] = useState<PlatformLineActionVM | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = P.actions(line).filter((a) => staffMay(role, LINE_ACTS[a.action]));
  // What KIND of filing this is, read once and behind the mark. Where it stopped is not in here: with the error, it is
  // the diagnosis somebody opened this workspace for, and it stays on the row.
  const aside = [
    line.reg_mock ? "Rehearsal filing" : "",
    line.reg_sole_prop ? "Sole proprietor" : "",
    line.step ? `Step ${line.step}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const run = async (a: PlatformLineActionVM, why: ConsoleWhy) => {
    setBusy(true);
    const r = await P.act(a.action, tenantId, line.id, why);
    setBusy(false);
    setArm(null);
    // The tone follows the OUTCOME: "Done" in green, the edge's refusal in red.
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };

  return (
    <div className="set-row" data-testid={`platform-line-${line.id}`}>
      <div className="set-row-info">
        <span className="set-row-label">
          {P.number(line.e164)}
          <span className="pf-line-kind">{line.kind}</span>
        </span>
        <span className="pf-line-states">
          <span className="pf-state">
            <span className="pf-state-of">voice</span>
            {line.voice_state || "—"}
          </span>
          <span className="pf-state">
            <span className="pf-state-of">texting</span>
            {line.sms_state || "—"}
          </span>
          {line.reg_step && (
            <span className="pf-state pf-state-stuck">
              <span className="pf-state-of">stopped at</span>
              {line.reg_step}
            </span>
          )}
          {aside && <RecordTip text={aside} label={`What else is on this line: ${aside}`} />}
        </span>
        {line.last_error && (
          <span className="pf-line-error">
            <Icon name="alert" size={11} />
            {line.last_error}
          </span>
        )}
        {arm && (
          <WhyAsk
            question={P.warning(arm)}
            detail={arm.sentence}
            yes={`Yes, ${arm.label.toLowerCase()}`}
            danger={!!arm.permanent}
            busy={busy}
            onYes={(why) => void run(arm, why)}
            onNo={() => setArm(null)}
            testid={`platform-${arm.action}`}
          />
        )}
      </div>
      {actions.length > 0 && !arm && (
        <span className="cs-acts">
          {actions.map((a) => (
            <Button
              key={a.action}
              size="sm"
              onClick={() => setArm(a)}
              disabled={busy}
              data-testid={`platform-act-${a.action}`}
            >
              {a.label}
            </Button>
          ))}
        </span>
      )}
    </div>
  );
}

/** What has happened in a workspace, newest first, each day said once, in that workspace's zone. */
export function PlatformEvents({ events, tz }: { events: readonly PlatformEvent[]; tz: string }) {
  const P = backOffice.verbs;
  if (events.length === 0)
    return (
      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-hint">Nothing recorded for this workspace yet.</span>
        </div>
      </div>
    );
  return (
    <ul className="pf-events" data-testid="platform-events">
      {events.map((e, i) => {
        const opens = i === 0 || pfKey(e.created_at, tz) !== pfKey(events[i - 1]?.created_at ?? "", tz);
        return (
          <Fragment key={`${e.created_at}-${i}`}>
            {opens && <li className="pf-day">{pfDay(e.created_at, tz)}</li>}
            <li className="pf-event">
              <span className="pf-when">{pfTime(e.created_at, tz)}</span>
              <span className="pf-said">{P.words(e.kind, {})}</span>
              <span className="pf-kind">{e.kind}</span>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}

/** The workspace's Setup, as its owner sees it, and its lines with what may be done to each. */
export function SetupAndLines({
  setup,
  tenantId,
  role,
  onChanged,
  flash,
}: {
  setup: SetupDto;
  tenantId: string;
  role: StaffRole;
  onChanged: () => void;
  flash: Flash;
}) {
  const P = backOffice.verbs;
  // The customer's own rows, from the customer's own function. No verbs: the buttons on Setup act on the SIGNED-IN
  // workspace, and this is not it. The LINE rows below are different -- those are the ops door, and every one of them is
  // written down against the person who pressed it, with why.
  const vm = P.steps({ ...setup, later: [], rests: {} });
  const lines = (setup.lines && setup.lines.rows) || [];
  return (
    <>
      <section className="rec-card set-card" data-testid="platform-detail">
        <div className="rec-card-head">
          <h2 className="rec-card-title">What their Setup says</h2>
          <span className="rec-card-sub">
            {vm.readiness.sentence} · {vm.done} of {vm.total} done.
          </span>
        </div>
        <Meter
          parts={[{ share: vm.total ? vm.done / vm.total : 0, tone: "ok" }]}
          rest
          aria-label={`${vm.done} of ${vm.total} done`}
        />
        <div className="cl-attn-list setup-rows" data-testid="platform-setup-rows">
          {vm.rows.map((r) => (
            <AttnRow
              key={r.id}
              glyph={r.icon}
              name={r.title}
              sentence={r.sentence}
              status={[r.stateWords]}
              note={r.details.join(" · ")}
              tone={setupTone(r.state)}
              testid={`platform-setup-${r.id}`}
            />
          ))}
        </div>
      </section>
      <section className="rec-card set-card" data-testid="platform-lines">
        <div className="rec-card-head">
          <h2 className="rec-card-title">Their lines</h2>
          <span className="rec-card-sub">Where each one stopped, and what can be done. Each asks why first.</span>
        </div>
        {lines.length === 0 ? (
          <div className="set-row">
            <div className="set-row-info">
              <span className="set-row-hint">No line yet.</span>
            </div>
          </div>
        ) : (
          lines.map((l) => (
            <PlatformLine key={l.id} line={l} tenantId={tenantId} role={role} onDone={onChanged} flash={flash} />
          ))
        )}
      </section>
    </>
  );
}
