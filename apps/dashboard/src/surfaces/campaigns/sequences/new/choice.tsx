/**
 * One choice of New (decision 0065): a row to press, or one only said. Its glyph, its name and its line; at its end its
 * kind or its count and the tick where it is the one chosen, or a door where it opens a page. The sheets' rows and the
 * first screen's starts are both this: the kit's ListRow under New's own class.
 */
import { Icon } from "../../../kit/icon/icon";
import { ListRow } from "../../../kit/list-row/list-row";
import { keyPress, routeDoor } from "../../../frame-verbs";

/** A row to press, as a door does: a press or a key, or nothing where it is only said. */
function pressOf(fn: (() => void) | null | undefined) {
  if (!fn) return {};
  return { role: "button" as const, tabIndex: 0, onClick: fn, onKeyDown: keyPress(fn) };
}

interface ChoiceProps {
  glyph: string;
  name: string;
  said?: string | null;
  /**
   * Its name and its line said whole, wrapping where the row is narrow: words that explain the choice, which a cut
   * would spoil (new.css .sq-nw-whole).
   */
  full?: boolean;
  /** What kind it makes, at the row's end ("Sequence", "Once"). */
  tag?: string | null;
  count?: number | null;
  on?: boolean;
  off?: boolean;
  door?: { label: string; to: string } | null;
  onPick?: (() => void) | null;
  testid: string;
}

/** What stands at the row's end: its door, or its kind, its count and its tick. */
function ChoiceEnd({ choice, place }: { choice: ChoiceProps; place: string }) {
  return (
    <span className={place}>
      {choice.door ? (
        <a className="sq-nw-door" {...routeDoor(choice.door.to)}>
          {choice.door.label}
          <Icon name="chevron" size={13} />
        </a>
      ) : (
        <>
          {choice.tag ? <span className="sq-nw-kind">{choice.tag}</span> : null}
          {choice.count !== null && choice.count !== undefined ? <b className="sq-nw-count">{choice.count}</b> : null}
          {choice.on ? <Icon name="check" size={15} /> : null}
        </>
      )}
    </span>
  );
}

/** One choice: its glyph, name and line, its kind or its count, and the tick where it is the one chosen. */
export function Choice(props: ChoiceProps) {
  const { full, name, said } = props;
  const press = props.off ? {} : pressOf(props.onPick);
  return (
    <ListRow
      mark={<Icon name={props.glyph} size={15} />}
      name={full ? <span className="sq-nw-whole">{name}</span> : name}
      said={full && said ? (place) => <div className={`${place} sq-nw-whole`}>{said}</div> : (said ?? undefined)}
      className={props.off ? "sq-nw-choice is-off" : props.on ? "sq-nw-choice is-on" : "sq-nw-choice"}
      aria-pressed={props.onPick ? !!props.on : undefined}
      data-testid={props.testid}
      end={(place) => <ChoiceEnd choice={props} place={place} />}
      {...press}
    />
  );
}
