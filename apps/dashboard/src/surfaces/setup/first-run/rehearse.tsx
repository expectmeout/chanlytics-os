/**
 * Rehearse (decision 0073, canvas 3, 3R, 3·a–3·i): the first run's third step, decision 0069's one surface on a page of its
 * own. Talk is the call in the browser (BtTalk: the microphone asked for, blocked, a dropped call, the booking link shown
 * and not sent, the free minutes said); Type is the typed try (BtTyped); either ends in How it did (BtHowItDid: each
 * answer judged against what it was told then, guesses first, a fix routed to its field, Keep, It now reads, Try
 * again). Beside it on a desk: what it reads from, and questions to try. The state is the one hook Settings' card uses
 * (useRehearsal), so the two never part.
 *
 * A review or a keep reads Setup again (the step is done at the first review; "Trained" counts the keeps). The step's
 * onward ("Looks good, go on") is the page's foot once a review is in; before one, the skip asks once (one nudge), then
 * puts the wait off for this member (REHEARSE_SKIPPED).
 */
import { useState, type ReactNode } from "react";
import { FIRST_RUN_HELPERS, type FirstRunVM, type ReceptionistCardVM } from "@chanlytics/contracts";
import { refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { BtHowItDid, BtTyped, historyOf, useRehearsal } from "../../settings/business/rehearse/rehearse";
import { BtTalk } from "../../settings/business/rehearse/talk";
import { setupVerbs } from "../surface";

const RW = FIRST_RUN_HELPERS.words.rehearse;

/** What it reads from, beside the call: the card's facts, a line each, and questions to try. */
function Using({ card }: { card: ReceptionistCardVM }): ReactNode {
  const rows = card.rows.filter(
    (r) => r.key === "open" || r.key === "knows" || r.key === "books" || r.key === "speaks",
  );
  return (
    <aside className="panel fr-pane fr-using" aria-label={RW.using} data-testid="fr-using">
      <h2 className="fr-sub">{RW.using}</h2>
      <dl className="fr-rcp-rows">
        {rows.map((r) => (
          <div key={r.key} className="fr-rcp-row">
            <dt className="fr-label">{r.label}</dt>
            <dd className={r.value ? "fr-rcp-v" : "fr-rcp-v fr-rcp-none"}>{r.value || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="fr-detail">{RW.usingNote}</p>
      <span className="fr-label">{RW.tryAsking}</span>
      <ul className="fr-asks" data-testid="fr-asks">
        {RW.asks.map((q) => (
          <li key={q} className="chip">
            {q}
          </li>
        ))}
      </ul>
      <p className="fr-detail">{RW.notSent}</p>
    </aside>
  );
}

/** The skip, before any review: once, the nudge; twice, the wait put off for this member. */
function Skip({ fr, flash, go }: { fr: FirstRunVM; flash: (f: LegacyFlash) => void; go: (to: string) => void }) {
  const [nudged, setNudged] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = fr.skip;
  if (!s) return null;
  const skip = async () => {
    if (!nudged) return setNudged(true);
    if (busy) return;
    setBusy(true);
    const r = await setupVerbs.later(FIRST_RUN_HELPERS.rehearseSkipped, true);
    setBusy(false);
    if (!r.ok) return flash(refusalToast(r, FIRST_RUN_HELPERS.words.find.notSaved));
    go("start");
  };
  return (
    <div className="fr-skip" data-testid="fr-rehearse-skip">
      {nudged ? <p className="fr-note">{s.nudge}</p> : null}
      <div className="fr-links">
        {nudged ? (
          <button type="button" className="link-btn" onClick={() => setNudged(false)} data-testid="fr-rehearse-stay">
            {s.stay}
          </button>
        ) : null}
        <button
          type="button"
          className="link-btn"
          onClick={() => void skip()}
          disabled={busy}
          data-testid="fr-rehearse-skip-go"
        >
          {nudged ? s.anyway : s.label}
        </button>
      </div>
    </div>
  );
}

export function FrRehearse(o: {
  fr: FirstRunVM;
  card: ReceptionistCardVM;
  bookingLink: string | null;
  trained: number;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
  /** The page's foot, at the end of the step's own column (page.tsx stepBody says why). */
  foot?: ReactNode;
}) {
  const { fr, card, bookingLink, trained, canEdit, flash, go } = o;
  const peek = () => void setupVerbs.peek();
  const r = useRehearsal({ onReviewed: peek, onKept: peek });
  const typing = r.mode === "type";
  return (
    <div className="fr-rehearse" data-testid="fr-rehearse" data-mode={r.mode}>
      <div className="fr-rehearse-main">
        <div className="panel fr-pane fr-rehearse-pane">
          {typing ? (
            <BtTyped
              tried={r.tried}
              text={r.text}
              setText={r.setText}
              problem={r.problem}
              busy={r.busy}
              reviewing={r.reviewing}
              reviewed={!!r.reviewed}
              fixedTyped={r.fixedTyped}
              onSend={r.sendTry}
              onReview={() => void r.review({ turns: historyOf(r.tried) }, "whatsapp")}
              onAgain={() => void r.askAgain()}
              onStartOver={r.startOver}
            />
          ) : (
            <BtTalk key={r.talkKey} bookingLink={bookingLink} onReview={r.reviewCall} reviewing={r.reviewing} />
          )}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              r.setMode(typing ? "talk" : "type");
              r.startOver();
            }}
            disabled={r.busy || r.reviewing}
            data-testid="fr-rehearse-mode"
          >
            {typing ? RW.talkInstead : RW.typeInstead}
          </button>
        </div>
        <BtHowItDid
          reviewing={r.reviewing}
          problem={r.reviewProblem}
          reviewed={r.reviewed}
          canEdit={canEdit}
          onKept={r.kept}
          askNext={r.askNext}
          trained={trained}
        />
        <p className="fr-detail" data-testid="fr-rehearse-trained">
          {RW.trained(trained)}
        </p>
        <Skip fr={fr} flash={flash} go={go} />
        {o.foot ?? null}
      </div>
      <Using card={card} />
    </div>
  );
}
