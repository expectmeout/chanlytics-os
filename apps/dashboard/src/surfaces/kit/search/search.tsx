/**
 * The kit's search (kit.css, "Search"): one capsule for every list a page searches, People's, Leads', the Pipeline's,
 * the Inbox's and Conversations'. It was People's phone search (surfaces/people/rail/phone-bar.tsx), the one look every
 * list's box wears now: a 38px capsule on an inset's fill, its glyph 15px and its words in the dim ink.
 *
 * It is the field, always, and the whole capsule is its label: a press anywhere on it is in the field, and a press is
 * the person asking to type, so the caret is there and, on a phone, the keyboard (Ruben, 11 Oct 2026: "when i click to
 * type it is like not very responsive"). It rested as a button until pressed on a phone, and the press only drew the
 * field in its place: the same capsule, the same words, no focus, since nothing focuses by itself on a touch screen
 * (`focusAsDrawn`), so the first tap changed nothing a person could see and the second began the typing. Nothing here
 * focuses by itself; the field takes the tap that lands on it. On a phone it types at 16px, so the phone never zooms
 * into it, and is drawn at the page's size (kit.css). From the first word the clear (×) stands in its end; a press on it
 * empties the field and keeps it in focus, and a phone's keyboard up.
 *
 * Hookless but for the field's own ref. `inputRef` is the page's, so its one keyboard listener can focus the field on /.
 * `testid` names the field; the clear is `-clear` on it. `className` is for the page's layout (where it stands and the
 * room round it), and comes last.
 */
import { useRef, type RefObject } from "react";
import { Icon } from "../icon/icon";
import { cx } from "../variants";

export type SearchProps = {
  /** What it finds: the field's placeholder and its name to a screen reader. */
  label: string;
  value: string;
  onChange: (q: string) => void;
  inputRef?: RefObject<HTMLInputElement | null> | null;
  /** The field's test id; the clear is named on it. */
  testid: string;
  className?: string;
};

/** The search: the field in its capsule, and the clear in its end once there are words in it. */
export function Search({ label, value, onChange, inputRef = null, testid, className }: SearchProps) {
  const own = useRef<HTMLInputElement | null>(null);
  const field = inputRef ?? own;
  return (
    <div className={cx("search", className)}>
      <label className="search-box">
        <Icon name="search" size={15} />
        <span className="search-field">
          <input
            ref={field}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={value}
            placeholder={label}
            aria-label={label}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testid}
          />
        </span>
        {value ? (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear the search"
            // The press leaves focus where it is: the field keeps its caret, and a phone its keyboard, through the clear.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              if (field.current) field.current.focus();
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
