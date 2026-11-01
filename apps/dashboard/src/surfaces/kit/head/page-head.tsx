/**
 * The kit's page head (kit.css, "Page head"): what a canvas puts above a page in Glass, the date and time in the
 * business's zone in the mono face, the page's name, and beside it the one sentence that says where the page stands
 * ("4 need you · the oldest since 2:26 PM"). The name is the page's h1: the frame's focus goes to it as a page opens.
 * Where the page has one quiet act of its own (Today's Listen), it stands after the name on its line (`beside`).
 *
 * It draws what the gallery's Page head family draws (tooling/scripts/e2e-harness/kit-gallery.mjs). `className` is for
 * the page's layout, and comes last.
 */
import type { ReactNode } from "react";
import { cx } from "../variants";

interface PageHeadProps {
  /** "FRIDAY, OCTOBER 2 · 4:02 PM": said in the mono face, over the name. Nothing where the page has no clock. */
  dateline?: ReactNode;
  /** The page's name. */
  title: ReactNode;
  /** Where the page stands, in one line beside the name. */
  sentence?: ReactNode;
  /** The sentence under the name, where a name is long and a sentence is a whole one (Today's greeting). */
  stacked?: boolean;
  /** The page's one quiet act, after the name on its line (Today's Listen); a phone's frame stands it beside the bell. */
  beside?: ReactNode;
  className?: string;
}

export function PageHead({ dateline, title, sentence, stacked, beside, className }: PageHeadProps) {
  const name = <h1 className="pg-title">{title}</h1>;
  return (
    <header className={cx("pg-head", stacked && "pg-head-stacked", className)}>
      {dateline ? <p className="pg-dateline">{dateline}</p> : null}
      <div className="pg-line">
        {beside ? (
          <div className="pg-titled">
            {name}
            <span className="pg-beside">{beside}</span>
          </div>
        ) : (
          name
        )}
        {sentence ? <p className="pg-sentence">{sentence}</p> : null}
      </div>
    </header>
  );
}
