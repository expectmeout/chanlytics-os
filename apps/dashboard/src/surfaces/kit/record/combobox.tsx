/**
 * The record kit's combobox (moved whole from legacy/components/record-field.jsx, decision 0015).
 *
 * A box over a list that narrows as you type: role="combobox" with aria-expanded, aria-controls and
 * aria-activedescendant, so focus stays in the box while the arrows walk the list. Typing opens it with the first
 * match active; down and up walk it (down also opens it); Enter takes the one walked to; Escape closes it and says
 * it handled the key, so a fold or a sheet around it stays open. The list is part of the box and pushes what is
 * under it, so nothing is covered and no fold's edge clips it. `options` is [{ value, label, meta? }]; it matches a
 * label or a value, anywhere in it. Closed, the box shows the chosen option's label; focus selects it, so the first
 * keystroke replaces it rather than landing on the end of it, and a caret moved into it anyway searches what was typed.
 * The options are the combobox pattern's <li role="option">: a pointer presses them, a keyboard never focuses them.
 * The list itself is never a tab stop (Chrome makes a list that scrolls one), and it holds the pointer, on an option
 * or on its scroll, so focus never leaves the box for it.
 *
 * Two things a box that ADDS from a list needs (the Business tab's languages), each the page's to decide:
 * - `typed(words)` answers an option for what is typed, drawn after the matches, or null: a name the list does not hold,
 *   offered as it was typed, in the page's words ({ value: "Xhosa", label: "Add “Xhosa”" }). Not drawn when an option
 *   already has its value. Picked, it is onChange's like any other.
 * - `onKeyDown` is the page's, asked before the box's own keys and never while the box is refused; a key it takes
 *   (preventDefault) goes no further. A token field takes Backspace on an empty box to give back the last token.
 *   `e.target.value` is what the box shows, so "" is an empty box.
 * - `onLeave(words)` is handed the words typed in the box, trimmed, as focus leaves it with some there (the box closes
 *   and clears as it always did), and never while it is refused. The old form's language box added what was typed as
 *   it lost focus; a box that only closed dropped it, so a fold saved without the language typed into it. Given none,
 *   leaving throws the words away, as it always did (the timezone's box).
 */
import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Icon } from "../icon/icon";

/** One option of the list: what it is, what it says, what it goes by besides, and a quiet word beside it. */
interface ComboOption {
  value: string;
  label: string;
  meta?: ReactNode;
  also?: string;
}

interface RecordComboboxProps {
  id?: string | null;
  label: string;
  value?: string | null;
  options?: ComboOption[];
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  gate?: Record<string, unknown> | null;
  typed?: ((words: string) => ComboOption | null) | null;
  onKeyDown?: ((e: KeyboardEvent<HTMLInputElement>) => void) | null;
  onLeave?: ((words: string) => void) | null;
  testid?: string | null;
}

// What was typed into `was`, where `now` is `was` with the typing in it, anywhere; or `now` as it is.
function recTypedInto(was: string, now: string): string {
  if (!was || now.length <= was.length) return now;
  let head = 0;
  while (head < was.length && was[head] === now[head]) head += 1;
  let tail = 0;
  while (tail < was.length - head && was[was.length - 1 - tail] === now[now.length - 1 - tail]) tail += 1;
  return head + tail === was.length ? now.slice(head, now.length - tail) : now;
}

/** The id of the list's option at `i`, which the box's aria-activedescendant names. */
const optId = (boxId: string, i: number) => `rec-${boxId}-opt-${i}`;

/** The options that match what was typed: an option is found by its label, its value, and `also` (words it goes by that it does not show: a zone's cities). */
function matches(options: ComboOption[], q: string): ComboOption[] {
  return q
    ? options.filter((o) => [o.label, o.value, o.also || ""].some((t) => String(t).toLowerCase().includes(q)))
    : options;
}

/** What the list is drawn from: the box's name and ids, the options shown, the one walked to, and what a press picks. */
interface ComboList {
  label: string;
  boxId: string;
  listId: string;
  expanded: boolean;
  shown: ComboOption[];
  at: number;
  value: string | null;
  pick: (o: ComboOption) => void;
}

/** The list under the box: it holds the pointer, so focus never leaves the box for it, and it is never a tab stop. */
function comboList({ label, boxId, listId, expanded, shown, at, value, pick }: ComboList) {
  return (
    <ul
      className="rec-combo-list"
      role="listbox"
      id={listId}
      aria-label={label}
      hidden={!expanded}
      tabIndex={-1}
      onMouseDown={(e: MouseEvent<HTMLUListElement>) => e.preventDefault()}
    >
      {expanded &&
        shown.map((o, i) => (
          // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events -- the combobox pattern: a pointer presses an option, a keyboard walks the list from the box
          <li
            key={String(o.value)}
            id={optId(boxId, i)}
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
  );
}

/** A box over a list that narrows as you type. */
export function RecordCombobox({
  id,
  label,
  value = null,
  options = [],
  onChange,
  placeholder = undefined,
  readOnly = false,
  gate = null,
  typed = null,
  onKeyDown = null,
  onLeave = null,
  testid = null,
}: RecordComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // A click that focuses the box would put the caret where it landed, undoing the selection focus made.
  const clickFocuses = useRef(false);
  // Given no `id`, the list and its options take their names from React's useId, so two comboboxes never share one.
  const autoId = useId();
  const boxId = id || autoId;
  const refused = readOnly || !!(gate && gate["aria-disabled"]);
  const chosen = options.find((o) => o.value === value) || null;
  const q = query.trim().toLowerCase();
  const matched = matches(options, q);
  const offer = q && typeof typed === "function" ? typed(query.trim()) : null;
  const shown = offer && !options.some((o) => o.value === offer.value) ? matched.concat([offer]) : matched;
  const expanded = open && !refused && shown.length > 0;
  const at = Math.max(0, Math.min(active, shown.length - 1));
  const listId = `rec-${boxId}-list`;
  // A long list keeps the option walked to in view.
  useEffect(() => {
    if (!expanded || !document.getElementById) return;
    const el = document.getElementById(optId(boxId, at));
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [expanded, at, boxId]);
  const shut = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };
  const pick = (o: ComboOption) => {
    shut();
    if (onChange) onChange(o.value);
  };
  const leave = () => {
    const words = query.trim();
    shut();
    if (words && !refused && typeof onLeave === "function") onLeave(words);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Refused (a gate's, or read-only while a save is out), the box takes no key: the arrows opened it underneath,
    // where the list was not drawn but the box went blank for the search that was not to be typed.
    if (refused) return;
    if (typeof onKeyDown === "function") {
      onKeyDown(e);
      if (e.defaultPrevented) return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!expanded) {
        setOpen(true);
        setActive(
          Math.max(
            0,
            shown.findIndex((o) => o.value === value),
          ),
        );
        return;
      }
      setActive(Math.max(0, Math.min(shown.length - 1, at + (e.key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (e.key === "Enter" && expanded && shown[at]) {
      e.preventDefault();
      pick(shown[at]);
      return;
    }
    if (e.key === "Escape" && (open || query)) {
      e.preventDefault();
      shut();
    }
  };
  return (
    <div className="rec-combo" data-open={expanded ? "true" : "false"} data-testid={testid || undefined}>
      <span className="rec-combo-field">
        <span className="rec-combo-glass" aria-hidden="true">
          <Icon name="search" size={12} />
        </span>
        <input
          type="text"
          className="rec-combo-input"
          role="combobox"
          aria-label={label}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? optId(boxId, at) : undefined}
          autoComplete="off"
          spellCheck={false}
          readOnly={refused}
          value={open ? query : chosen ? chosen.label : ""}
          placeholder={chosen ? chosen.label : placeholder}
          onMouseDown={(e: MouseEvent<HTMLInputElement>) => {
            clickFocuses.current = document.activeElement !== e.currentTarget;
          }}
          onFocus={(e: FocusEvent<HTMLInputElement>) => {
            if (e.target && e.target.select) e.target.select();
          }}
          onMouseUp={(e: MouseEvent<HTMLInputElement>) => {
            if (clickFocuses.current) {
              clickFocuses.current = false;
              e.preventDefault();
            }
          }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setQuery(open ? e.target.value : recTypedInto(chosen ? chosen.label : "", e.target.value));
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKey}
          onBlur={leave}
          {...(gate || {})}
        />
      </span>
      {comboList({ label, boxId, listId, expanded, shown, at, value, pick })}
    </div>
  );
}
