/**
 * The kit's page head (kit.css, "Page head"): what a canvas puts above a page in Glass, the date and time in the
 * business's zone in the mono face, the page's name, and beside it the one sentence that says where the page stands
 * ("4 need you · the oldest since 2:26 PM"). A page draws it inside `<Glass>` (look/look.tsx), so Classic, whose top bar
 * carries the name, draws none of it. The name is the page's h1: the frame's focus goes to it as a page opens.
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
  className?: string;
}

export function PageHead({ dateline, title, sentence, className }: PageHeadProps) {
  return (
    <header className={cx("pg-head", className)}>
      {dateline ? <p className="pg-dateline">{dateline}</p> : null}
      <div className="pg-line">
        <h1 className="pg-title">{title}</h1>
        {sentence ? <p className="pg-sentence">{sentence}</p> : null}
      </div>
    </header>
  );
}
