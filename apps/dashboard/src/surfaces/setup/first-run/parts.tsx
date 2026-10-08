/**
 * The first run's frame parts (moved from legacy/pages/first-run.jsx, decision 0015): Live's summary (canvas R9, P8), the
 * rail of four steps across the top, and the owner's receptionist so far, beside the step on a desktop and under the strip
 * on a phone. Each is the kit's own: a pane, a quiet button, a face (by their classes: page.tsx says why), a state's pill.
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
      <div className="panel panel-flush fr-summary">
        <dl className="fr-summary-rows" data-testid="fr-live-summary">
          {lv.summary.map((r) => (
            <div key={r.key} className="fr-summary-row" data-testid={`fr-live-${r.key}`}>
              <dt className="fr-label">{r.label}</dt>
              <dd className="fr-summary-value">
                <span>{r.value}</span>
                {r.change && canEdit ? (
                  <button type="button" className="link-btn" onClick={() => r.change && leave(r.change.to)}>
                    {r.change.label}
                  </button>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="fr-quiet" data-testid="fr-live-greeting">
        {lv.greeting}
      </p>
      {brain && CanCard ? (
        <CanCard brain={brain} config={config} canEdit={false} activating={owner ? ["voice"] : null} />
      ) : null}
    </div>
  );
};

/**
 * The four steps across the top: a step done or reached opens in place; a step not reached is only its name. The step on
 * screen is the strong one (first-run.css, `aria-current`), wherever the workspace stands.
 */
export const FrRail = ({ fr, go, label }: { fr: FirstRunVM; go: (to: string) => void; label: string }) => (
  <ol className="fr-rail" aria-label={label}>
    {fr.steps.map((s) => {
      const body = (
        <>
          <span className="fr-rail-n" aria-hidden="true">
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
            <span className="fr-rail-ahead">{body}</span>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => go(s.to)}
              data-testid={`fr-rail-${s.key}`}
            >
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
  <aside className="fr-rcp" data-open={open ? "true" : undefined} aria-label={card.caption} data-testid="fr-card">
    <div className="fr-rcp-cap">{card.caption}</div>
    <div className="panel fr-rcp-pane">
      <div className="fr-rcp-head">
        <span className="face" aria-hidden="true">
          <span>{card.initials}</span>
        </span>
        <div className="fr-rcp-who">
          <b>{card.name}</b>
          <StatePill kind="setup" value={card.status.state} label={card.status.words} testid="fr-card-status" />
        </div>
      </div>
      <p className="fr-rcp-greet">
        <span className="fr-label">{card.greetingLabel}</span>“{card.greeting}”
      </p>
      <dl className="fr-rcp-rows">
        {card.rows.map((r) => (
          <div key={r.key} className="fr-rcp-row" data-testid={`fr-card-${r.key}`}>
            <dt className="fr-label">{r.label}</dt>
            <dd className={r.value ? "fr-rcp-v" : "fr-rcp-v fr-rcp-none"}>{r.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
    <p className="fr-rcp-foot">{card.foot}</p>
  </aside>
);
