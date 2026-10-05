/**
 * The back office's platform-wide cards (moved from legacy/pages/platform.jsx, decision 0015 step 11): who is waiting
 * to get in, whether the machinery is running, how fast the pages are, and each workspace's day. Every word is the view
 * model's, from contracts.
 */
import { useState } from "react";
import type { PageVitalsRowDto, PlatformHealth, PlatformQueueVM } from "@chanlytics/contracts";
import type { PlatformApi } from "@/legacy-bridge/platform";
import { Confirm } from "../../kit/confirm/confirm";
import type { LegacyFlash } from "../../legacy-verbs";

type Flash = (f: LegacyFlash) => void;
type WaitingRowVM = PlatformQueueVM["rows"][number];

/**
 * One person waiting. The only action arms first, like every other action on this page -- and unlike them it is not
 * undoable from here, so a mis-click leaves somebody waiting for a mail nobody will write.
 */
export function WaitingRow({
  row,
  P,
  onDone,
  flash,
}: {
  row: WaitingRowVM;
  P: PlatformApi;
  onDone: () => void;
  flash: Flash;
}) {
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const r: { ok: boolean; message: string } = await Promise.resolve()
      .then(() => P.markInvited(row.id))
      .catch(() => ({ ok: false, message: "That did not go through." }));
    setBusy(false);
    setArm(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };
  return (
    <div className="set-row" data-testid="platform-queue-row">
      <div className="set-row-info">
        <span className="set-row-label">{row.email}</span>
        <span className="set-row-hint">{[row.detail, row.waited].filter(Boolean).join(" · ")}</span>
        {arm && (
          <Confirm
            block
            question="Mark them as invited?"
            detail="Nothing is sent. This only records that somebody wrote to them, and takes them off the list."
            yes="Yes, mark them"
            no="Not now"
            busy={busy}
            onYes={() => void run()}
            onNo={() => setArm(false)}
            testid="platform-queue-invited"
          />
        )}
      </div>
      {!arm && (
        <button className="btn btn-sm" onClick={() => setArm(true)} disabled={busy} data-testid="platform-queue-mark">
          Mark as invited
        </button>
      )}
    </div>
  );
}

/** Who is knocking: the waiting list, one line when nobody is waiting. */
export function PlatformQueueCard({
  waiting,
  P,
  onDone,
  flash,
}: {
  waiting: PlatformQueueVM;
  P: PlatformApi;
  onDone: () => void;
  flash: Flash;
}) {
  return (
    <section className="fl-card set-card" data-testid="platform-queue">
      <div className="fl-card-head">
        <h2 className="fl-card-title">Waiting to get in</h2>
        <span className="fl-card-sub set-says" data-testid="platform-queue-words">
          {waiting.sentence}
        </span>
      </div>
      {waiting.rows.length > 0 && (
        <>
          <div className="set-row">
            <div className="set-row-info">
              <span className="set-row-hint" data-testid="platform-queue-note">
                {waiting.note}
              </span>
            </div>
          </div>
          <div className="cl-attn-list" data-testid="platform-queue-rows">
            {waiting.rows.map((w) => (
              <WaitingRow key={w.id} row={w} P={P} onDone={onDone} flash={flash} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The machinery under every workspace. The database has answered this for months and nothing in the product showed it:
 * the clocks and the job backlog were read by the health sweep and by the keyless /api/health, both of which speak to a
 * monitor outside the product. It belongs HERE and not on an owner's page -- both counts are platform-wide, so a salon
 * owner told "forty jobs are late" has been shown something that is not about them and that they cannot act on.
 */
export function PlatformHealthCard({ P, health }: { P: PlatformApi; health: PlatformHealth | null }) {
  if (!health) return null;
  return (
    <section className="fl-card set-card" data-testid="platform-health">
      <div className="fl-card-head">
        <h2 className="fl-card-title">The platform</h2>
        <span className="fl-card-sub set-says" data-testid="platform-health-words">
          {P.healthWords(health)}
        </span>
      </div>
      {health.unhealthy.length > 0 && (
        <div className="cl-attn-list" data-testid="platform-health-clocks">
          {health.unhealthy.map((u) => (
            <div className="set-row" key={u.sweep}>
              <div className="set-row-info">
                <span className="set-row-label">{u.sweep}</span>
                <span className="set-row-hint">{u.detail || "This clock is not running."}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * How fast the pages are (00255): the 75th percentile of what people's own browsers measured as each page loaded and
 * answered, so the bundle's budget is judged against what they see. Platform-wide, like the clocks above it; a read that
 * failed says so here and takes nothing else with it; an overview that predates the timings has none, and draws no
 * card, and a list that could not be read says so once, above. Every word is the view model's (contracts
 * pageVitalsWords).
 */
function PlatformVitalsCard({
  P,
  rows,
  problem,
}: {
  P: PlatformApi;
  rows: PageVitalsRowDto[] | null | undefined;
  problem: string | null;
}) {
  if (problem || rows === undefined) return null;
  const pace = P.vitalsWords(rows);
  return (
    <section className="fl-card set-card" data-testid="platform-vitals">
      <div className="fl-card-head">
        <h2 className="fl-card-title">How fast the pages are</h2>
        <span className="fl-card-sub set-says" data-testid="platform-vitals-words">
          {pace.sentence}
        </span>
      </div>
      {pace.lines.length > 0 && (
        <div className="cl-attn-list" data-testid="platform-vitals-lines">
          {pace.lines.map((l) => (
            <div className="set-row" key={l.metric}>
              <div className="set-row-info">
                <span className="set-row-label">{l.label}</span>
                <span className="set-row-hint" data-tone={l.tone}>
                  {l.hint}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {pace.pages.length > 0 && (
        <div className="cl-attn-list" data-testid="platform-vitals-pages">
          {pace.pages.map((pg) => (
            <div className="set-row" key={pg.page}>
              <div className="set-row-info">
                <span className="set-row-label">{pg.page}</span>
                <span className="set-row-hint">{pg.hint}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Each workspace's day, counted (00277 platform_metrics): the newest day the nightly rollup counted, a line per
 * workspace, the ones whose customers got no answer at all first. Read from the overview this tab holds (peekList), so
 * the page's own reads are unchanged; an overview that predates it draws no card. Every word is the view model's
 * (contracts platformDaysWords).
 */
function PlatformDaysCard({ P, problem }: { P: PlatformApi; problem: string | null }) {
  const held = P.peekList ? P.peekList() : null;
  const rows = held && held.ok ? held.days : undefined;
  if (problem || rows === undefined) return null;
  const work = P.daysWords(rows);
  return (
    <section className="fl-card set-card" data-testid="platform-days">
      <div className="fl-card-head">
        <h2 className="fl-card-title">Each workspace's day</h2>
        <span className="fl-card-sub set-says" data-testid="platform-days-words">
          {work.sentence}
        </span>
      </div>
      {work.lines.length > 0 && (
        <div className="cl-attn-list" data-testid="platform-days-lines">
          {work.lines.map((l) => (
            <div className="set-row" key={l.tenantId}>
              <div className="set-row-info">
                <span className="set-row-label">{l.name}</span>
                <span className="set-row-hint" data-tone={l.tone}>
                  {[l.answers, l.receptionist, l.failures].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** The platform's work, below its health: how fast the pages are, and each workspace's day. */
export function PlatformWorkCards({
  P,
  vitals,
  problem,
}: {
  P: PlatformApi;
  vitals: PageVitalsRowDto[] | null | undefined;
  problem: string | null;
}) {
  return (
    <>
      <PlatformVitalsCard P={P} rows={vitals} problem={problem} />
      <PlatformDaysCard P={P} problem={problem} />
    </>
  );
}
