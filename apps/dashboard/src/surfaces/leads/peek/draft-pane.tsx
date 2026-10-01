/**
 * The draft (moved from legacy/pages/leads-peek.jsx, decision 0015; PRD 9.3). To, Subject and the body are shown as
 * written, never as fields: the mailto: the route built is the one the mail app opens, and a body edited here would need
 * encoding the page must not do. Shorter and Warmer ask the route again with what is on screen; the owner does their own
 * editing where they will send it.
 */
import { LEAD_WORDS as W } from "@chanlytics/contracts";
import type { LeadPeekVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import type { DraftState, PeekActs } from "./types";

interface DraftProps {
  vm: LeadPeekVM;
  draft?: DraftState | null;
  busy: boolean;
  on: PeekActs;
}

export const LeadDraftPane = ({ vm, draft, busy, on }: DraftProps) => {
  const d: DraftState = draft || {};
  return (
    <>
      <div className="pk-top">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="peek-draft-back"
          onClick={on.onBack}
        >{`${W.backTo} ${vm.short}`}</button>
      </div>
      <div className="pk-body">
        <div className="pk-draft">
          {d.refusal ? (
            <div className="field-error" role="alert" data-testid="peek-draft-error">
              {d.refusal}
            </div>
          ) : null}
          <div className="pk-field">
            <span className="l">{W.to}</span>
            <span className="pk-rv" data-testid="peek-draft-to">
              {d.to || vm.reach.email.address}
            </span>
          </div>
          <div className="pk-field">
            <span className="l">{W.subject}</span>
            <span className="pk-rv" data-testid="peek-draft-subject">
              {d.subject || ""}
            </span>
          </div>
          <div className="pk-text" data-testid="peek-draft-body">
            {d.busy ? W.draftWriting : d.body || ""}
          </div>
          <div className="pk-tone">
            <span className="pk-label">{W.draftRewrite}</span>
            {W.tones.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ask-follow-chip${d.tone === t.id ? " on" : ""}`}
                disabled={busy || d.busy || !d.body}
                data-testid={`peek-tone-${t.id}`}
                onClick={() => on.onTone(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="pk-foot-note">
            <Icon name="shield" size={12} />
            <span data-testid="peek-draft-note">{W.draftNote}</span>
          </div>
        </div>
      </div>
      <div className="pk-foot">
        <a
          className="btn btn-primary btn-sm"
          href={d.mailto || "#"}
          data-testid="peek-open-mail"
          aria-disabled={!d.mailto}
          onClick={on.onOpenMail}
        >
          <Icon name="mail" size={12} />
          {W.draftOpen}
        </a>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!d.body}
          data-testid="peek-copy-draft"
          onClick={on.onCopyDraft}
        >
          {W.copy}
        </button>
        <span className="sp" />
        <span className="pk-rn">{W.draftFrom}</span>
      </div>
    </>
  );
};
