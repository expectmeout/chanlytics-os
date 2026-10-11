/**
 * The kit's search (kit.css, "Search"): one capsule for every list a page searches, People's, Leads', the Pipeline's
 * and the Inbox's. It was People's phone search (surfaces/people/rail/phone-bar.tsx), the one look the Inbox's own box
 * now wears too (10 Oct 2026): a 38px capsule on an inset's fill, its glyph 15px and its words in the dim ink.
 *
 * On a phone (the kit's 900px) it rests: the capsule is a button saying what it finds, at the page's size; a press opens
 * the field in the same capsule, where it stood, its words at the same size and ink -- typed at 16px, so a phone never
 * zooms into it, and drawn at the page's (Ruben, 10 Oct 2026: the field had moved 3px, lost 61px to a Cancel beside it
 * and changed its words' size). No Cancel: from the first word typed the clear (×) stands in its end, and a field left
 * empty rests again as focus leaves it. Words in the box keep it open. On a desk it never rests: the field is drawn, at the page's size, and there is no Cancel.
 * `rests` says which, where the page knows (People's bar is a phone's only); left out, the window's width says.
 *
 * Hookless but for the width: whether it is open is the page's (`open`), so the page's one keyboard listener can open
 * it on /. `testid` names the field; the capsule at rest and the clear are `-open` and `-clear` on it. `className` is for the page's layout (where it stands and the room round it), and comes last.
 */
import { useEffect, useState, type RefObject } from "react";
import { editorBox, focusAsDrawn } from "../../legacy-verbs";
import { Icon } from "../icon/icon";
import { cx } from "../variants";

/** The kit's one phone width (kit.css), where the search rests until pressed. */
const SEARCH_RESTS_QUERY = "(max-width: 900px)";
const searchRestsNow = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(SEARCH_RESTS_QUERY).matches;

/** Whether the window is a phone's, kept current as it changes size. */
function useSearchRests(): boolean {
  const [rests, setRests] = useState(searchRestsNow);
  useEffect(() => {
    const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(SEARCH_RESTS_QUERY) : null;
    if (!mq || !mq.addEventListener) return undefined;
    const on = () => setRests(!!mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return rests;
}

export type SearchProps = {
  /** What it finds: the capsule's words at rest, the field's placeholder and its name to a screen reader. */
  label: string;
  value: string;
  onChange: (q: string) => void;
  /** The field is drawn (a press on the capsule at rest asks for it). */
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Rest as a capsule until pressed: true on a phone's bar, false on a desk; left out, the window's width says. */
  rests?: boolean;
  inputRef?: RefObject<HTMLInputElement | null> | null;
  /** The field's test id; the capsule at rest, the clear and Cancel are named on it. */
  testid: string;
  className?: string;
};

/** The search: the capsule at rest, the field once opened (or while there are words in it), and Cancel to rest again. */
export function Search({
  label,
  value,
  onChange,
  open,
  onOpen,
  rests,
  inputRef = null,
  testid,
  className,
}: SearchProps) {
  const onPhone = useSearchRests();
  const resting = rests ?? onPhone;
  if (resting && !open && !value) {
    return (
      <div className={cx("search", className)}>
        <button
          type="button"
          className="search-rest"
          aria-label={label}
          onClick={() => onOpen(true)}
          data-testid={`${testid}-open`}
        >
          <Icon name="search" size={15} />
          <span>{label}</span>
        </button>
      </div>
    );
  }
  return (
    <div className={cx("search", className)} data-rests={resting ? "" : undefined} {...(resting ? editorBox : {})}>
      <label className="search-box">
        <Icon name="search" size={15} />
        <span className="search-field">
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus={resting && open && focusAsDrawn()}
            value={value}
            placeholder={label}
            aria-label={label}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              if (resting && !value) onOpen(false);
            }}
            data-testid={testid}
          />
        </span>
        {value ? (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear the search"
            onClick={() => {
              onChange("");
              if (inputRef && inputRef.current) inputRef.current.focus();
            }}
            data-testid={`${testid}-clear`}
          >
            <Icon name="x" size={12} />
          </button>
        ) : null}
      </label>
    </div>
  );
}
