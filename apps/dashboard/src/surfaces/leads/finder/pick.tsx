/**
 * A picker (moved from legacy/pages/leads-finder.jsx, decision 0015): a button that opens a listbox of its own. It is not in
 * PL_OVERLAY (the plan panel is the page's own overlay), so the page's keys stay awake behind it; Esc closes the picker
 * here, before the page's listener.
 */
export interface PickOption {
  id: string;
  label: string;
  note?: string;
  on?: boolean;
  apply: () => void;
}

export const LeadPick = ({
  id,
  label,
  cls,
  title,
  open,
  options,
  onOpen,
  onPick,
  inline = true,
}: {
  /** Its options under it, as a listbox (a desk); false where the sheet draws them as a step (a phone, plan-card.tsx). */
  inline?: boolean;
  id: string;
  label: string;
  cls?: string;
  title?: string;
  open: boolean;
  options: readonly PickOption[];
  onOpen: (id: string | null) => void;
  onPick: (o: PickOption) => void;
}) => (
  <span className="lf-pick">
    <button
      type="button"
      className={`tok ${cls || ""} ${open ? "open" : ""}`}
      data-testid={`plan-${id}`}
      title={title || label}
      aria-haspopup="listbox"
      aria-expanded={!!open}
      onClick={() => onOpen(open ? null : id)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          onOpen(null);
        }
      }}
    >
      {label}
    </button>
    {open && inline ? (
      <span
        className="lf-pop panel panel-pop"
        role="listbox"
        aria-label={title || label}
        data-testid={`plan-${id}-options`}
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`lf-pop-row ${o.on ? "on" : ""}`}
            role="option"
            aria-selected={!!o.on}
            data-testid={`plan-${id}-${o.id}`}
            onClick={() => {
              onOpen(null);
              onPick(o);
            }}
          >
            <span className="tab">{o.label}</span>
            {o.note ? <span className="r">{o.note}</span> : null}
          </button>
        ))}
        {options.length === 0 ? <span className="lf-pop-note">Change what I asked to change this.</span> : null}
      </span>
    ) : null}
  </span>
);
