/* global React, Icon */
// Chanlytics record kit: the fields.
//
// Each is announced as what it is. A field is a label that holds its box; a box in a row of a list carries its name
// (RecordBox); a switch is role="switch" and says which state it is in; a choice of a few is a radiogroup, one tab stop
// that the arrows walk; a long list you type into is a combobox. None of them knows what it edits, and none has words of its own: every label, hint, option and tip here
// is the page's. A control that commits takes `gate` (window.gate(...)'s props) and spreads it after its handlers, as
// every committing control here does.
//
// Each takes `readOnly`, for the moment its fold's or its row's save is out (record-fold.jsx says why): a box keeps
// its words and its focus and takes no typing, a switch and a choice say they are not to be pressed and a press does
// nothing, and a combobox opens no list. Never `disabled`, which lets go of focus, to the page.
//
// Two tiers of tip, and the rule between them: if there is nothing to press in it, it is a chip. RecordTip is the
// chip, the app's own dark tooltip (data-bits' __tip) on a mark; RecordTipCard is the white card, for a tip that
// carries an act (named apart from .rec-card, the card a page's rows sit in).

const { useState: useRfState, useEffect: useRfEffect, useRef: useRfRef, useId: useRfId } = React;

// A field: its label, the box (with its unit when it has one), and under it a hint or what is wrong with it.
//   <RecordField id="lead" label="Least notice" unit="hours" value={v} onChange={setV} hint="Empty means no rule." />
// The label holds the box, so the box is named by it, and by its unit ("Least notice hours"). `problem` is drawn by
// the one FieldError (data-bits) with the id rec-<id>-problem, which the box names in aria-describedby as it marks
// itself aria-invalid; a hint gives way to it. Given no `id`, the field takes one from React.useId, so two fields
// never share a sentence. `rows` makes the box a textarea. onChange hands the page the words. Anything else
// (inputMode, placeholder, maxLength, readOnly, type, onKeyDown, onBlur) goes to the box as it is; the page's own
// className and aria-describedby join the field's, so a consequence line of the page's can describe the box too.
//
// The rest is gathered by hand, not with `...rest` in the parameters. The standalone mockup compiles each file with
// Babel into one shared global scope, and Babel keeps an object rest's excluded keys in a top-level `var _excluded`:
// the last file compiled wins, so every earlier rest drops the wrong keys (this one put id, label and unit on the
// <input>, with settings.jsx's SetToggle's list in force).
const REC_FIELD_OWN = new Set(["id", "label", "value", "onChange", "unit", "hint", "problem", "rows", "testid", "children"]);
const RecordField = (props) => {
  const { id, label, value, onChange, unit = null, hint = null, problem = null, rows = null, testid = null } = props;
  const autoId = useRfId();
  const rest = {};
  for (const k of Object.keys(props)) if (!REC_FIELD_OWN.has(k)) rest[k] = props[k];
  const fieldId = id || autoId;
  const problemId = `rec-${fieldId}-problem`;
  const hintId = `rec-${fieldId}-hint`;
  const describedBy = [problem ? problemId : hint ? hintId : null, rest["aria-describedby"]].filter(Boolean).join(" ");
  const box = {
    ...rest,
    className: ["rec-input", rest.className].filter(Boolean).join(" "),
    value: value == null ? "" : value,
    onChange: (e) => { if (onChange) onChange(e.target.value); },
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": describedBy || undefined,
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

// One labelled box for a row of a list: a shift's opening time, a closed day's date, a service's name. The list's header
// names the column and is not read out, so the box carries its own name (`label`, heard, never seen: "Closed from, row
// 2", "Monday closes, second shift"), and it wires what is wrong with it, its unit and the read-only state as RecordField
// does. HOOKLESS, as the rows of a list are (they come and go with their list): so it REQUIRES an `id`, and takes no name
// from React.useId. `problem` is the sentence
// drawn under the box (the one FieldError, id rec-<id>-problem, which the box names as it marks itself aria-invalid);
// `invalid` is the id of a sentence drawn ELSEWHERE that this box is wrong by (a day's two boxes share one), and marks
// the box the same without drawing it. `size="sm"` is the box at the width of a time or a number, record.css's small
// variant. `type` is the box's (a date, a time, a number); anything else (placeholder, min, inputMode, className) goes
// to the box as it is, as RecordField's rest does, and gathered the same way for the same reason. `rows` makes the box
// a textarea of that many rows, as RecordField's `rows` does, for words in a row of a list that run to sentences (a
// note's text, a message sent in the business's name); a textarea has no `type`, so it takes none.
//   <RecordBox id="closure-0-date" label="Closed from, row 1" type="date" value={c.date} onChange={…} problem={bad} />
//   <RecordBox id="note-0-text" label="Note 1, what it says" rows={3} value={n.text} onChange={…} />
const REC_BOX_OWN = new Set(["id", "label", "unit", "value", "onChange", "problem", "invalid", "readOnly", "type", "size", "rows", "testid"]);
const RecordBox = (props) => {
  const { id, label, unit = null, value, onChange, problem = null, invalid = null, readOnly = false, type = "text", size = null, rows = null, testid = null } = props;
  if (!id) throw new TypeError("RecordBox needs an id: it is hookless, so it cannot make one, and its sentence is named by it.");
  const rest = {};
  for (const k of Object.keys(props)) if (!REC_BOX_OWN.has(k)) rest[k] = props[k];
  const problemId = `rec-${id}-problem`;
  const wrong = problem ? problemId : invalid || null;
  const describedBy = [wrong, rest["aria-describedby"]].filter(Boolean).join(" ");
  const own = {
    ...rest,
    id,
    className: ["rec-input", rest.className].filter(Boolean).join(" "),
    value: value == null ? "" : value,
    onChange: (e) => { if (onChange) onChange(e.target.value); },
    "aria-label": label,
    "aria-invalid": wrong ? true : undefined,
    "aria-describedby": describedBy || undefined,
    readOnly: readOnly || undefined,
  };
  const box = rows ? <textarea {...own} rows={rows} /> : <input {...own} type={type} />;
  return (
    <span className="rec-box" data-size={size || undefined} data-testid={testid || undefined}>
      {unit ? (
        <span className="rec-input-group" data-invalid={wrong ? "true" : undefined}>
          {box}
          <span className="rec-input-unit">{unit}</span>
        </span>
      ) : box}
      {problem ? <window.FieldError id={problemId} message={problem} /> : null}
    </span>
  );
};

// A switch: a real button with role="switch". A press asks the page for the other state. `label` names it, or
// `labelledBy` points at the words beside it that already do.
// `describedBy` points at the sentence under the switch's label, where a page has one: the name says WHICH switch and
// the description says what it does, which is what a page whose sentence is not drawn at every width needs (the
// Business tab's rules fold hides its sentences under 761px and keeps them here).
const RecordSwitch = ({ on, onChange, label = null, labelledBy = null, describedBy = null, readOnly = false, gate = null, testid = null }) => (
  <button
    type="button"
    role="switch"
    className="rec-switch"
    aria-checked={!!on}
    aria-label={labelledBy ? undefined : label || undefined}
    aria-labelledby={labelledBy || undefined}
    aria-describedby={describedBy || undefined}
    aria-disabled={readOnly || undefined}
    data-testid={testid || undefined}
    onClick={() => { if (!readOnly && onChange) onChange(!on); }}
    {...(gate || {})}
  >
    <span className="rec-knob" aria-hidden="true" />
  </button>
);

// A choice of a few, drawn as a segmented control and announced as a radiogroup. It is one tab stop, on the chosen
// option; the arrows pick the next or the one before and take focus there, wrapping at either end, and Home and End
// go to the ends, as a radiogroup's keys do. `options` is [{ value, label }].
const RecordToggleGroup = ({ label, value, options = [], onChange, readOnly = false, gate = null, testid = null }) => {
  const at = options.findIndex((o) => o.value === value);
  const refused = readOnly || !!(gate && gate["aria-disabled"]);
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
            aria-disabled={readOnly || undefined}
            tabIndex={checked || (at < 0 && i === 0) ? 0 : -1}
            onClick={() => { if (!readOnly && onChange) onChange(o.value); }}
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
// label or a value, anywhere in it. Closed, the box shows the chosen option's label; focus selects it, so the first
// keystroke replaces it rather than landing on the end of it, and a caret moved into it anyway searches what was typed.
// The options are the combobox pattern's <li role="option">: a pointer presses them, a keyboard never focuses them.
// The list itself is never a tab stop (Chrome makes a list that scrolls one), and it holds the pointer, on an option
// or on its scroll, so focus never leaves the box for it.
//
// Two things a box that ADDS from a list needs (the Business tab's languages), each the page's to decide:
// - `typed(words)` answers an option for what is typed, drawn after the matches, or null: a name the list does not hold,
//   offered as it was typed, in the page's words ({ value: "Xhosa", label: "Add “Xhosa”" }). Not drawn when an option
//   already has its value. Picked, it is onChange's like any other.
// - `onKeyDown` is the page's, asked before the box's own keys and never while the box is refused; a key it takes
//   (preventDefault) goes no further. A token field takes Backspace on an empty box to give back the last token.
//   `e.target.value` is what the box shows, so "" is an empty box.
// - `onLeave(words)` is handed the words typed in the box, trimmed, as focus leaves it with some there (the box closes
//   and clears as it always did), and never while it is refused. The old form's language box added what was typed as
//   it lost focus; a box that only closed dropped it, so a fold saved without the language typed into it. Given none,
//   leaving throws the words away, as it always did (the timezone's box).

// What was typed into `was`, where `now` is `was` with the typing in it, anywhere; or `now` as it is.
const recTypedInto = (was, now) => {
  if (!was || now.length <= was.length) return now;
  let head = 0;
  while (head < was.length && was[head] === now[head]) head += 1;
  let tail = 0;
  while (tail < was.length - head && was[was.length - 1 - tail] === now[now.length - 1 - tail]) tail += 1;
  return head + tail === was.length ? now.slice(head, now.length - tail) : now;
};

const RecordCombobox = ({ id, label, value = null, options = [], onChange, placeholder = undefined, readOnly = false, gate = null, typed = null, onKeyDown = null, onLeave = null, testid = null }) => {
  const [open, setOpen] = useRfState(false);
  const [query, setQuery] = useRfState("");
  const [active, setActive] = useRfState(0);
  // A click that focuses the box would put the caret where it landed, undoing the selection focus made.
  const clickFocuses = useRfRef(false);
  // Given no `id`, the list and its options take their names from React.useId, so two comboboxes never share one.
  const autoId = useRfId();
  const boxId = id || autoId;
  const refused = readOnly || !!(gate && gate["aria-disabled"]);
  const chosen = options.find((o) => o.value === value) || null;
  const q = query.trim().toLowerCase();
  const matched = q ? options.filter((o) => String(o.label).toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q)) : options;
  const offer = q && typeof typed === "function" ? typed(query.trim()) : null;
  const shown = offer && !options.some((o) => o.value === offer.value) ? matched.concat([offer]) : matched;
  const expanded = open && !refused && shown.length > 0;
  const at = Math.max(0, Math.min(active, shown.length - 1));
  const listId = `rec-${boxId}-list`;
  const optId = (i) => `rec-${boxId}-opt-${i}`;
  // A long list keeps the option walked to in view.
  useRfEffect(() => {
    if (!expanded || !document.getElementById) return;
    const el = document.getElementById(optId(at));
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [expanded, at, boxId]);
  const shut = () => { setOpen(false); setQuery(""); setActive(0); };
  const pick = (o) => { shut(); if (onChange) onChange(o.value); };
  const leave = () => {
    const words = query.trim();
    shut();
    if (words && !refused && typeof onLeave === "function") onLeave(words);
  };
  const onKey = (e) => {
    // Refused (a gate's, or read-only while a save is out), the box takes no key: the arrows opened it underneath,
    // where the list was not drawn but the box went blank for the search that was not to be typed.
    if (refused) return;
    if (typeof onKeyDown === "function") {
      onKeyDown(e);
      if (e.defaultPrevented) return;
    }
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
          onMouseDown={(e) => { clickFocuses.current = document.activeElement !== e.currentTarget; }}
          onFocus={(e) => { if (e.target && e.target.select) e.target.select(); }}
          onMouseUp={(e) => { if (clickFocuses.current) { clickFocuses.current = false; e.preventDefault(); } }}
          onChange={(e) => { setQuery(open ? e.target.value : recTypedInto(chosen ? chosen.label : "", e.target.value)); setOpen(true); setActive(0); }}
          onKeyDown={onKey}
          onBlur={leave}
          {...(gate || {})}
        />
      </span>
      <ul className="rec-combo-list" role="listbox" id={listId} aria-label={label} hidden={!expanded} tabIndex={-1} onMouseDown={(e) => e.preventDefault()}>
        {expanded && shown.map((o, i) => (
          <li
            key={String(o.value)}
            id={optId(i)}
            role="option"
            aria-selected={i === at}
            className="rec-combo-opt"
            data-chosen={o.value === value ? "true" : undefined}
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
const RecordTipCard = ({ title, body = null, act = null, testid = null }) => (
  <div className="rec-card-tip" role="group" aria-label={typeof title === "string" ? title : undefined} data-testid={testid || undefined}>
    <span className="rec-card-tip-title">{title}</span>
    {body ? <span className="rec-card-tip-body">{body}</span> : null}
    {act ? (
      <button type="button" className="rec-card-tip-act" onClick={act.onClick} {...(act.gate || {})}>{act.label}</button>
    ) : null}
  </div>
);

Object.assign(window, { RecordField, RecordBox, RecordSwitch, RecordToggleGroup, RecordCombobox, RecordTip, RecordTipCard });
