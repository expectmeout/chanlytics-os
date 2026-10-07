/**
 * The first day of Leads (moved from legacy/pages/leads-finder.jsx, decision 0015): no search kept yet. People first --
 * the three ways they arrive, each claiming only what this tab has read -- then Find leads, the door to Ask, and the
 * suggestions Claude wrote from this workspace's own business line, each a door to Ask with its words. Never a seeded
 * example: the items are the server's, and a refused read is a note beside a door that still opens.
 *
 * Hookless, like everything else here: the line being rewritten is the page's (`leadLine`), handed down. The words it says
 * live once, in contracts (LEAD_WORDS).
 */
import type { ReactNode } from "react";
import { LEAD_WORDS, type LeadSuggestionsDto, type LeadWay } from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { gate } from "../../legacy-verbs";

type Suggestion = LeadSuggestionsDto["items"][number];

/** One suggestion: what to search, who it is for, and how reachable that kind is. */
const LeadSuggestion = ({
  item,
  onPick,
  canFind,
}: {
  item: Suggestion;
  onPick: (words: string) => void;
  canFind: boolean;
}) => (
  <div className="fr-sug" data-testid={`ld-sug-${item.category_key}`}>
    <button
      type="button"
      className="q"
      onClick={() => onPick(item.words)}
      {...(canFind ? {} : gate("find", "find businesses for you"))}
    >
      {item.words}
    </button>
    <span className="w">{item.who_for}</span>
    {item.reach ? <span className="reach">{item.reach}</span> : null}
  </div>
);

/** One way people arrive. The status is drawn only when this tab has read the fact behind it: a way never says a line is live that nobody looked at. */
const LeadWayCard = ({ way, onGo }: { way: LeadWay; onGo: (to: string) => void }) => (
  <div className="fr-way" data-testid={`ld-way-${way.id}`}>
    <b>{way.title}</b>
    <span>{way.line}</span>
    {way.status ? (
      <span className="fr-status" data-testid={`ld-way-status-${way.id}`}>
        <Icon name="check" size={12} />
        {way.status}
      </span>
    ) : null}
    {way.doors.map((d) => (
      <button key={d.id} type="button" className="fr-door" onClick={() => onGo(d.to)}>
        {d.label}
      </button>
    ))}
  </div>
);

interface FirstDayProps {
  ways?: readonly LeadWay[];
  suggestions?: LeadSuggestionsDto | null;
  canFind?: boolean;
  lineOpen?: boolean;
  lineDraft?: string;
  lineError?: string | null;
  lineBusy?: boolean;
  onPick?: (words: string) => void;
  onGo?: (to: string) => void;
  onOpenLine?: () => void;
  onLineDraft?: (draft: string) => void;
  onSaveLine?: () => void;
  onCancelLine?: () => void;
  composer?: ReactNode;
}

export const LeadsFirstDay = ({
  ways = [],
  suggestions = null,
  canFind = false,
  lineOpen = false,
  lineDraft = "",
  lineError = null,
  lineBusy = false,
  onPick = () => undefined,
  onGo = () => undefined,
  onOpenLine = () => undefined,
  onLineDraft = () => undefined,
  onSaveLine = () => undefined,
  onCancelLine = () => undefined,
  composer = null,
}: FirstDayProps) => {
  const items = (suggestions && suggestions.items) || [];
  // The server says why it could not write them (suggestions.note); a read that never landed says so itself, rather than
  // leaving the space blank.
  const note = suggestions ? suggestions.note || null : LEAD_WORDS.suggestUnavailable;
  return (
    <div className="fr" data-testid="leads-first-day">
      <h1 className="fr-h">{LEAD_WORDS.firstDay.title}</h1>
      <p className="fr-p">
        Everyone who calls, messages or books you shows up on this page by themselves, with what they asked and what
        they booked.
      </p>
      <div className="fr-ways">
        {ways.map((w) => (
          <LeadWayCard key={w.id} way={w} onGo={onGo} />
        ))}
      </div>
      <div className="ld-first-sub">{LEAD_WORDS.firstDay.sub}</div>
      {composer}
      <div>
        <div className="fr-sugs-h">
          {suggestions ? (
            <span data-testid="ld-line">{`For ${suggestions.business_line}`}</span>
          ) : (
            <span data-testid="ld-line" />
          )}
          {canFind && suggestions ? (
            <button type="button" className="fr-line-edit" onClick={onOpenLine} data-testid="ld-line-edit">
              Not right? Change it
            </button>
          ) : null}
        </div>
        {lineOpen ? (
          <form
            className="fr-line-form"
            data-testid="ld-line-form"
            onSubmit={(e) => {
              e.preventDefault();
              onSaveLine();
            }}
          >
            <input
              className="inp"
              type="text"
              value={lineDraft}
              aria-label="What this business does"
              data-testid="ld-line-input"
              onChange={(e) => onLineDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={lineBusy} data-testid="ld-line-save">
              Save
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelLine}>
              Cancel
            </button>
            <FieldError id="ld-line-error" message={lineError} testid="ld-line-error" />
          </form>
        ) : null}
        {note ? (
          <p className="fr-sugs-note" data-testid="ld-sugs-note">
            {note}
          </p>
        ) : null}
        <div className="fr-sugs">
          {items.map((it) => (
            <LeadSuggestion key={it.category_key} item={it} onPick={onPick} canFind={canFind} />
          ))}
        </div>
      </div>
      <div className="ld-first-foot" data-testid="ld-first-day-foot">
        <Icon name="lock" size={12} />
        <span>{LEAD_WORDS.firstDay.foot}</span>
      </div>
    </div>
  );
};
