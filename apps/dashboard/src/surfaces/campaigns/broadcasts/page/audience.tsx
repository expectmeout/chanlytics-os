/**
 * Who the send really reaches, beside the chips that choose them (moved from legacy/pages/broadcasts.jsx, decision
 * 0015).
 */
import type { AudiencePreview } from "@chanlytics/contracts";

interface BcAudienceProps {
  sample: AudiencePreview | null;
  people: AudiencePreview["people"];
  who: number;
  onWho: (i: number) => void;
}

// Who the send really reaches, beside the chips that choose them.
//
// The count was already honest -- the chip carries it -- but a count is the one
// thing an owner cannot check. audiencePreview (contracts, broadcasts.ts) already
// names a handful of the pool and orders them on purpose: an ordinary person
// first, then the FIRST person with no name on file, because they are greeted
// "Hi there" and that is the case nobody has ever been shown; anyone held back
// comes last with the reason in the operator's own words. Those people were
// reachable only by stepping the preview's arrows, under the message, so the
// list nobody scrolled to was the list that answered "who exactly".
//
// The rows are the control and the bubble is the readout: pressing one walks the
// preview to that person, so the same press both scans and previews.
export function BcAudience({ sample, people, who, onWho }: BcAudienceProps) {
  if (!sample || people.length === 0) return null;
  const pool = sample.sending + sample.held;
  const shownHeld = people.filter((p) => p.refusal).length;
  const rest = Math.max(0, sample.held - shownHeld);
  return (
    <div className="bc-who" data-testid="bc-who">
      <div className="bc-who-count">
        <span className="bc-who-n tabular">{sample.sending.toLocaleString()}</span>
        <span className="bc-who-of">of {pool.toLocaleString()} will get it</span>
      </div>
      <span className="bc-who-bar" aria-hidden="true">
        <span
          className="bc-who-bar-send"
          style={{ width: `${pool ? Math.round((sample.sending / pool) * 100) : 0}%` }}
        />
      </span>
      <div className="bc-who-list">
        {people.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`bc-who-row${i === who ? " on" : ""}${p.refusal ? " held" : ""}`}
            aria-pressed={i === who}
            onClick={() => onWho(i)}
            data-testid="bc-who-row"
          >
            <span className="bc-who-name">{p.label}</span>
            <span className="bc-who-why">
              {p.refusal || (p.firstName ? `Greeted “Hi ${p.firstName}”` : "No name on file — greeted “Hi there”")}
            </span>
          </button>
        ))}
      </div>
      {rest > 0 && (
        <span className="bc-who-rest" data-testid="bc-who-rest">
          {rest} more held back, for the same reasons
        </span>
      )}
    </div>
  );
}
