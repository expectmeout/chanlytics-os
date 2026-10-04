/**
 * The first run's frame parts (moved from legacy/pages/first-run.jsx, decision 0015): Live's summary (canvas R9, P8), the
 * rail of four steps across the top, and the owner's receptionist so far, beside the step on a desktop and under the strip
 * on a phone.
 */
import type { FirstRunLiveVM, FirstRunVM, ReceptionistCardVM } from "@chanlytics/contracts";
import type { WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { businessPart } from "../shell";
import type { CardBrain } from "./inputs";

interface LiveProps {
  lv: FirstRunLiveVM;
  config: WorkspaceSettings | null;
  brain: CardBrain | null;
  canEdit: boolean;
  owner: boolean;
  leave: (to: string) => void;
}

/**
 * Live (contracts first-run-live.ts): what the owner set up, in four lines with a way to change each, the greeting every
 * caller hears, and what it will and will not do -- the Business tab's own card (borrowed by name until that tab moves),
 * reading calls as live since Finish is what records them so. Setup's optional rows follow, as they did.
 */
export const FrLive = ({ lv, config, brain, canEdit, owner, leave }: LiveProps) => {
  const CanCard = businessPart("BtCanCard");
  return (
    <div className="fr-line-step" data-testid="fr-live">
      <dl className="fr-live-summary" data-testid="fr-live-summary">
        {lv.summary.map((r) => (
          <div key={r.key} className="fr-live-row" data-testid={`fr-live-${r.key}`}>
            <dt className="fr-line-label">{r.label}</dt>
            <dd className="fr-live-value">
              {r.value}
              {r.change && canEdit ? (
                <>
                  {" "}
                  <button type="button" className="fr-find-link" onClick={() => r.change && leave(r.change.to)}>
                    {r.change.label}
                  </button>
                </>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="fr-code-off" data-testid="fr-live-greeting">
        {lv.greeting}
      </p>
      {brain && CanCard ? (
        <CanCard brain={brain} config={config} canEdit={false} activating={owner ? ["voice"] : null} />
      ) : null}
    </div>
  );
};

/** The four steps across the top: a step done or on screen opens in place; a step not reached is only its name. */
export const FrRail = ({ fr, go, label }: { fr: FirstRunVM; go: (to: string) => void; label: string }) => (
  <ol className="fr-rail" aria-label={label}>
    {fr.steps.map((s) => {
      const body = (
        <>
          <span className="fr-rail-mark" aria-hidden="true">
            {s.state === "done" ? <Icon name="check" size={10} /> : s.number}
          </span>
          <span className="fr-rail-name">{s.name}</span>
        </>
      );
      return (
        <li
          key={s.key}
          className="fr-rail-step"
          data-state={s.state}
          aria-current={s.key === fr.shown.key ? "step" : undefined}
        >
          {s.state === "ahead" ? (
            <span className="fr-rail-btn">{body}</span>
          ) : (
            <button type="button" className="fr-rail-btn" onClick={() => go(s.to)} data-testid={`fr-rail-${s.key}`}>
              {body}
            </button>
          )}
        </li>
      );
    })}
  </ol>
);

/** The owner's receptionist, so far: beside the step on a desktop; under the strip, once opened, on a phone. */
export const FrCard = ({ card, open }: { card: ReceptionistCardVM; open: boolean }) => (
  <aside className="fr-card" data-open={open ? "true" : undefined} aria-label={card.caption} data-testid="fr-card">
    <div className="fr-card-cap">{card.caption}</div>
    <div className="fr-card-box">
      <div className="fr-card-head">
        <span className="fr-card-av" aria-hidden="true">
          {card.initials}
        </span>
        <div className="fr-card-who">
          <b>{card.name}</b>
          <StatePill kind="setup" value={card.status.state} label={card.status.words} testid="fr-card-status" />
        </div>
      </div>
      <p className="fr-card-greet">
        <span className="fr-card-k">{card.greetingLabel}</span>“{card.greeting}”
      </p>
      <dl className="fr-card-rows">
        {card.rows.map((r) => (
          <div key={r.key} className="fr-card-row" data-testid={`fr-card-${r.key}`}>
            <dt className="fr-card-k">{r.label}</dt>
            <dd className={r.value ? "fr-card-v" : "fr-card-v is-empty"}>{r.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
    <p className="fr-card-foot">{card.foot}</p>
  </aside>
);
