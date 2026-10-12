/**
 * The kit's figure (kit.css, "Figure"; the reports lenses spec, §8): a number, what it counts, the period before beside it in
 * plain ink, and one line under it. It draws the `div` that holds a term and its definitions, so the page draws the `dl` that
 * holds several (Reports' strip). Where the words need a definition (what is counted, and what is not) the label is a stop for
 * the kit's Tooltip, never a native `title`; where the number opens something it is a door: the kit's press (press.tsx), a link
 * where it has an address and a button where it acts. A figure's CHANGE is never a tone: it is plain ink, never green or red;
 * its value is one only for what needs you (`warn`, amber) or what failed (`fail`, red), the reports lenses spec, D10.
 * A ratio says the count it is of (`n`) and the fewest that say anything (`minN`); of some, but too few, it is greyed and says
 * how few (`is-thin`, the reports lenses spec, D9), so a share of three messages is never read as a trend. Of none there is no
 * ratio, and nothing to grey.
 *
 * It draws what the gallery's Figure families draw (tooling/scripts/e2e-harness/kit-gallery.mjs): "Figure", entry for entry,
 * and "Figure, on Base UI" for the label that carries a definition. `className` is for the page's layout, and comes last.
 */
import { isThinShare } from "@chanlytics/contracts";
import type { PressAct, PressDoor } from "../press";
import { Press } from "../press";
import { Tooltip } from "../tooltip/tooltip";
import { cx } from "../variants";

/** A figure: what it counts, its number as said, and what goes beside and under it. */
export type FigureProps = {
  /** What it counts, in the words an owner uses. */
  label: string;
  /** The number as said: "17", "62%", "—". */
  value: string;
  /** The period before beside the number, in counts ("up from 7"); none where there is nothing to compare with. */
  change?: string | null;
  /** One line under the number; two lines at most. */
  meta?: string | null;
  /** What is counted and what is not, said in the kit's tooltip over the label. */
  definition?: string;
  /** Where the number opens something: a link where it has an address, a press that acts where it has none. */
  door?: PressAct | PressDoor;
  /**
   * The count a ratio is of (17 messages, 6 replies); none where the figure is no ratio or the count is not known. Some, but
   * too few (1 up to the minimum less one) greys the figure; none at all (0) is no ratio to grey, and the figure says why in
   * its own line.
   */
  n?: number | null;
  /** The fewest that say anything: a ratio of some, but fewer than this, is greyed and says how few (the reports lenses spec, D9). */
  minN?: number;
  /**
   * What the number is: `warn` for what needs you (steps overdue), `fail` for what failed (email that stopped working); none
   * for every other figure, and never green. It reads the number alone, never its change (the reports lenses spec, D10).
   */
  tone?: "warn" | "fail";
  /** What the figure is, for a page's tests and a later phase's definitions (`data-figure`). */
  id?: string;
  className?: string;
  /** The id a test finds the figure by; the label's stop, where it has one, is `<id>-term`. */
  "data-testid"?: string;
};

/** What a thin figure says under itself: how few it is of, and that they are too few to read. */
const figureThinWords = (n: number): string => `only ${n}, too few to read`;

/** A figure: a term, its number and what sits with it. */
export function Figure({
  label,
  value,
  change = null,
  meta = null,
  definition,
  door,
  n = null,
  minN,
  tone,
  id,
  className,
  "data-testid": testid,
}: FigureProps) {
  // Too few to read: only where the figure says both what it is of and the fewest that say anything. At n = 0 there is no
  // ratio to grey (its "—" and its line already say why), so a figure of some, but too few, is the one that is thin: contracts'
  // one predicate (isThinShare), which a bar of a rate and Ask's answer judge by too.
  const thin = n !== null && minN !== undefined && isThinShare(n, minN);
  const term =
    definition === undefined ? (
      label
    ) : (
      <Tooltip tip={definition}>
        <span
          className="figure-term"
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focus stop for its tip, the one way a keyboard reads what is counted
          tabIndex={0}
          aria-description={definition}
          data-testid={testid === undefined ? undefined : `${testid}-term`}
        >
          {label}
        </span>
      </Tooltip>
    );
  const number =
    door === undefined ? (
      value
    ) : (
      <Press {...door} className="figure-door">
        {value}
      </Press>
    );
  return (
    <div
      className={cx("figure", thin && "is-thin", tone && `is-${tone}`, className)}
      data-figure={id}
      data-testid={testid}
    >
      <dt className="figure-label">{term}</dt>
      <dd className="figure-value">
        {number}
        {change ? <span className="figure-change">{change}</span> : null}
      </dd>
      {meta ? <dd className="figure-meta">{meta}</dd> : null}
      {thin ? <dd className="figure-n">{figureThinWords(n)}</dd> : null}
    </div>
  );
}
