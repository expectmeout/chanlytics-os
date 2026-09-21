/* global React, Icon */
// Chanlytics record kit: the fields.
//
// Each is announced as what it is. A field is a label that holds its box; a switch is role="switch" and says which
// state it is in; a choice of a few is a radiogroup, one tab stop that the arrows walk; a long list you type into is
// a combobox. None of them knows what it edits, and every word is the page's. A control that commits takes `gate`
// (window.gate(...)'s props) and spreads it after its handlers, as every committing control here does.
//
// Two tiers of tip, and the rule between them: if there is nothing to press in it, it is a chip. RecordTip is the
// chip, the app's own dark tooltip (data-bits' __tip) on a mark; RecordCard is the white card, for a tip that
// carries an act.

const { useState: useRfState, useEffect: useRfEffect } = React;

// A field: its label, the box (with its unit when it has one), and under it a hint or what is wrong with it.
//   <RecordField id="lead" label="Least notice" unit="hours" value={v} onChange={setV} hint="Empty means no rule." />
// The label holds the box, so the box is named by it, and by its unit ("Least notice hours"). `problem` is drawn by
// the one FieldError (data-bits) with the id rec-<id>-problem, which the box names in aria-describedby as it marks
// itself aria-invalid; a hint gives way to it. `rows` makes the box a textarea. onChange hands the page the words.
// Anything else (inputMode, placeholder, maxLength, disabled, onKeyDown, onBlur) goes to the box as it is.
const RecordField = ({ id, label, value, onChange, unit = null, hint = null, problem = null, rows = null, testid = null, children: _kids, ...rest }) => {
  const problemId = `rec-${id}-problem`;
  const hintId = `rec-${id}-hint`;
  const box = {
    ...rest,
    className: "rec-input",
    value: value == null ? "" : value,
    onChange: (e) => { if (onChange) onChange(e.target.value); },
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": problem ? problemId : hint ? hintId : undefined,
  };
  const control = rows ? <textarea rows={rows} {...box} /> : <input type="text" {...box} />;
  return (
    <div className="rec-field" data-testid={testid || undefined}>
      <label>
        <span className="rec-field-label">{label}</span>
        {unit ? (
          <span className="rec-input-group" data-invalid={problem ? "true" : undefined}>
            {control}
            <span className="rec-input-unit">{unit}</span>
          </span>
        ) : control}
      </label>
      {problem ? <window.FieldError id={problemId} message={problem} /> : hint ? <span className="rec-hint" id={hintId}>{hint}</span> : null}
    </div>
  );
};

// A switch: a real button with role="switch". A press asks the page for the other state. `label` names it, or
// `labelledBy` points at the words beside it that already do.
const RecordSwitch = ({ on, onChange, label = null, labelledBy = null, gate = null, testid = null }) => (
  <button
    type="button"
    role="switch"
    className="rec-switch"
    aria-checked={!!on}
    aria-label={labelledBy ? undefined : label || undefined}
    aria-labelledby={labelledBy || undefined}
    data-testid={testid || undefined}
    onClick={() => { if (onChange) onChange(!on); }}
    {...(gate || {})}
  >
    <span className="rec-knob" aria-hidden="true" />
  </button>
);

// A choice of a few, drawn as a segmented control and announced as a radiogroup. It is one tab stop, on the chosen
// option; the arrows pick the next or the one before and take focus there, wrapping at either end, and Home and End
// go to the ends, as a radiogroup's keys do. `options` is [{ value, label }].
const RecordToggleGroup = ({ label, value, options = [], onChange, gate = null, testid = null }) => {
  const at = options.findIndex((o) => o.value === value);
  const refused = !!(gate && gate["aria-disabled"]);
  const walk = (e) => {
    const n = options.length;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!n || refused || (!step && e.key !== "Home" && e.key !== "End")) return;
    e.preventDefault();
    const from = at < 0 ? 0 : at;
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (from + step + n) % n;
    if (onChange) onChange(options[next].value);
    const radios = e.currentTarget && e.currentTarget.querySelectorAll ? e.currentTarget.querySelectorAll('[role="radio"]') : [];
    if (radios[next] && radios[next].focus) radios[next].focus();
  };
  return (
    <div className="rec-seg" role="radiogroup" aria-label={label} onKeyDown={walk} data-testid={testid || undefined}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            className="rec-seg-btn"
            aria-checked={checked}
            tabIndex={checked || (at < 0 && i === 0) ? 0 : -1}
            onClick={() => { if (onChange) onChange(o.value); }}
            {...(gate || {})}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

// A box over a list that narrows as you type: role="combobox" with aria-expanded, aria-controls and
// aria-activedescendant, so focus stays in the box while the arrows walk the list. Typing opens it with the first
// match active; down and up walk it (down also opens it); Enter takes the one walked to; Escape closes it and says
// it handled the key, so a fold or a sheet around it stays open. The list is part of the box and pushes what is
// under it, so nothing is covered and no fold's edge clips it. `options` is [{ value, label, meta? }]; it matches a
// label or a value, anywhere in it. Closed, the box shows the chosen option's label.
// The options are the combobox pattern's <li role="option">: a pointer presses them, a keyboard never focuses them.
const RecordCombobox = ({ id, label, value = null, options = [], onChange, placeholder = undefined, gate = null, testid = null }) => {
  const [open, setOpen] = useRfState(false);
  const [query, setQuery] = useRfState("");
  const [active, setActive] = useRfState(0);
  const refused = !!(gate && gate["aria-disabled"]);
  const chosen = options.find((o) => o.value === value) || null;
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => String(o.label).toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q)) : options;
  const expanded = open && !refused && shown.length > 0;
  const at = Math.max(0, Math.min(active, shown.length - 1));
  const listId = `rec-${id}-list`;
  const optId = (i) => `rec-${id}-opt-${i}`;
  // A long list keeps the option walked to in view.
  useRfEffect(() => {
    if (!expanded || !document.getElementById) return;
    const el = document.getElementById(`rec-${id}-opt-${at}`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [expanded, at, id]);
  const shut = () => { setOpen(false); setQuery(""); setActive(0); };
  const pick = (o) => { shut(); if (onChange) onChange(o.value); };
  const onKey = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!expanded) { setOpen(true); setActive(Math.max(0, shown.findIndex((o) => o.value === value))); return; }
      setActive(Math.max(0, Math.min(shown.length - 1, at + (e.key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (e.key === "Enter" && expanded && shown[at]) { e.preventDefault(); pick(shown[at]); return; }
    if (e.key === "Escape" && (open || query)) { e.preventDefault(); shut(); }
  };
  return (
    <div className="rec-combo" data-open={expanded ? "true" : "false"} data-testid={testid || undefined}>
      <span className="rec-combo-field">
        <span className="rec-combo-glass" aria-hidden="true"><Icon name="search" size={12} /></span>
        <input
          type="text"
          className="rec-combo-input"
          role="combobox"
          aria-label={label}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? optId(at) : undefined}
          autoComplete="off"
          spellCheck={false}
          readOnly={refused}
          value={open ? query : chosen ? chosen.label : ""}
          placeholder={chosen ? chosen.label : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKey}
          onBlur={shut}
          {...(gate || {})}
        />
      </span>
      <ul className="rec-combo-list" role="listbox" id={listId} aria-label={label} hidden={!expanded}>
        {expanded && shown.map((o, i) => (
          <li
            key={String(o.value)}
            id={optId(i)}
            role="option"
            aria-selected={i === at}
            className="rec-combo-opt"
            data-chosen={o.value === value ? "true" : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(o)}
          >
            <span className="rec-combo-label">{o.label}</span>
            {o.meta ? <span className="rec-combo-meta">{o.meta}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

// The chip: a tip with nothing to press in it. The mark set-mark already was, given a name: a button carrying
// data-tip, which the app's one tooltip draws on hover and on focus, and which a press shows at once, at the mark,
// because a finger has no hover. `label` is the mark's name; the tip's words are its description, so a screen
// reader hears them too.
const RecordTip = ({ text, label = null, testid = null }) => (
  <button
    type="button"
    className="rec-tip"
    data-tip={text}
    aria-label={label || text}
    aria-description={label ? text : undefined}
    data-testid={testid || undefined}
    onClick={(e) => { e.stopPropagation(); if (window.__tip) window.__tip.show(e.currentTarget); }}
  >
    <Icon name="info" size={12} />
  </button>
);

// The card: a tip with something to press in it, white with a shadow. The page places it; the kit draws it.
const RecordCard = ({ title, body = null, act = null, testid = null }) => (
  <div className="rec-card-tip" role="group" aria-label={typeof title === "string" ? title : undefined} data-testid={testid || undefined}>
    <span className="rec-card-tip-title">{title}</span>
    {body ? <span className="rec-card-tip-body">{body}</span> : null}
    {act ? (
      <button type="button" className="rec-card-tip-act" onClick={act.onClick} {...(act.gate || {})}>{act.label}</button>
    ) : null}
  </div>
);

Object.assign(window, { RecordField, RecordSwitch, RecordToggleGroup, RecordCombobox, RecordTip, RecordCard });
