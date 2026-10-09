/**
 * The back office's opened workspace (moved from legacy/pages/platform.jsx, decision 0015 step 11): the Setup its owner
 * sees, its lines and what may be done to each, and what has happened.
 */
import { Fragment, useState } from "react";
import { stateOf, type PlatformLineActionVM, type SetupDto } from "@chanlytics/contracts";
import type { PlatformApi, PlatformTenantDetail } from "@/legacy-bridge/platform";
import { AttnRow } from "../../kit/attention/attn-row";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordTip } from "../../kit/record/field";
import type { LegacyFlash } from "../../legacy-verbs";
import { backOffice } from "@/legacy-bridge/platform";

type Flash = (f: LegacyFlash) => void;
type PlatformLineRow = NonNullable<SetupDto["lines"]>["rows"][number];

// Every time on this page belongs to the workspace being LOOKED AT, not to the one you are signed in to: the page's
// clock speaks for the latter, and this is the one surface that crosses that line. P.clock is the same contracts clock,
// called with the zone the header names -- so the page still keeps no calendar of its own.
const pfClock = () => backOffice.verbs.clock;
const when = (iso: string | null | undefined, tz: string): string =>
  iso ? pfClock().dateYear(Date.parse(iso), tz) : "—";
const pfTime = (iso: string, tz: string) => pfClock().time(Date.parse(iso), tz);
const pfKey = (iso: string, tz: string) => pfClock().dayKey(Date.parse(iso), tz);
const pfDay = (iso: string, tz: string) => pfClock().dayLabel(Date.parse(iso), tz, Date.now());
// A Setup row's tone is its state's own (contracts/tone.ts), as the owner's page draws it.
const setupTone = (state: string) => stateOf("setup", state).tone;

/**
 * One line, and what may be done to it.
 *
 * Arm-then-confirm rather than a bare button, and the confirmation LEADS with what it spends -- because `refile` is two
 * different actions wearing one name: a rejected campaign is corrected in place for nothing, a rehearsal is replaced by a
 * real filing for about $19.50 that cannot be undone. Which one this line is offering, and what it costs, comes from the
 * contract; the page only reads it out.
 */
export function PlatformLine({
  line,
  tenantId,
  onDone,
  flash,
}: {
  line: PlatformLineRow;
  tenantId: string;
  onDone: () => void;
  flash: Flash;
}) {
  const P = backOffice.verbs;
  const [arm, setArm] = useState<PlatformLineActionVM | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = P.actions(line);
  // What KIND of filing this is, read once and behind the mark. Where it stopped is not in here: with the error, it is
  // the diagnosis somebody opened this workspace for, and it stays on the row.
  const aside = [
    line.reg_mock ? "Rehearsal filing" : "",
    line.reg_sole_prop ? "Sole proprietor" : "",
    line.step ? `Step ${line.step}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const run = async (a: PlatformLineActionVM) => {
    setBusy(true);
    const r = await P.act(a.action, tenantId, line.id);
    setBusy(false);
    setArm(null);
    // The tone follows the OUTCOME. The tone pass gave this call site `danger` unconditionally, so support pressing
    // Retry and getting "Done. This page will show it on the next read." was told so in red -- the same class of thing
    // that pass existed to fix, one flash serving both answers.
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
          <Confirm
            block
            question={P.warning(arm)}
            detail={arm.sentence}
            yes={`Yes, ${arm.label.toLowerCase()}`}
            no="Not now"
            danger={!!arm.permanent}
            busy={busy}
            onYes={() => void run(arm)}
            onNo={() => setArm(null)}
            testid={`platform-${arm.action}`}
          />
        )}
      </div>
      {actions.length > 0 && !arm && (
        <span className="bc-chips">
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

/** What has happened in the opened workspace, newest first, each day said once, in that workspace's zone. */
function PlatformEvents({ P, events, tz }: { P: PlatformApi; events: PlatformTenantDetail["events"]; tz: string }) {
  return (
    <div className="biz-group">
      <div className="biz-group-head">
        <span className="biz-group-title">What has happened</span>
        <span className="biz-group-sub">Newest first.</span>
      </div>
      {events.length === 0 ? (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">Nothing recorded for this workspace yet.</span>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}

/** One workspace, opened: the Setup its owner sees, its lines, and what has happened. */
export function PlatformDetail({
  detail,
  onClose,
  onChanged,
  flash,
}: {
  detail: PlatformTenantDetail;
  onClose: () => void;
  onChanged: () => void;
  flash: Flash;
}) {
  const P = backOffice.verbs;
  // The customer's own rows, from the customer's own function. No verbs: the buttons on Setup act on the SIGNED-IN
  // workspace, and this is not it. The LINE rows below are different -- those are the ops door, and every one of them is
  // recorded against the person who pressed it.
  const vm = P.steps({ ...detail.setup, later: [] });
  const lines = (detail.setup.lines && detail.setup.lines.rows) || [];
  // Every stamp on this card is this workspace's, and the header names the zone.
  const tz = detail.tenant.timezone;
  return (
    <section className="rec-card set-card" data-testid="platform-detail">
      <div className="rec-card-head">
        <h2 className="rec-card-title">{detail.tenant.name}</h2>
        <span className="rec-card-sub">
          {detail.tenant.slug} · {tz} · since {when(detail.tenant.created_at, tz)}
        </span>
        <LinkButton onClick={onClose} data-testid="platform-close">
          Close
        </LinkButton>
      </div>

      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-label">What their Setup says</span>
          <span className="set-row-hint">
            {vm.readiness.sentence} · {vm.done} of {vm.total} done.
          </span>
          <div className="setup-meter" aria-hidden="true">
            <span
              className="setup-meter-fill"
              style={{ width: `${vm.total ? Math.round((vm.done / vm.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>
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

      {lines.length > 0 && (
        <div className="biz-group">
          <div className="biz-group-head">
            <span className="biz-group-title">Their lines</span>
            <span className="biz-group-sub">Where each one stopped, and what can be done.</span>
          </div>
          {lines.map((l) => (
            <PlatformLine key={l.id} line={l} tenantId={detail.tenant.id} onDone={onChanged} flash={flash} />
          ))}
        </div>
      )}

      <PlatformEvents P={P} events={detail.events} tz={tz} />
    </section>
  );
}
