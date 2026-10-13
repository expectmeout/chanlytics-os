/**
 * The kit's notice (kit.css, "Notice"; canvas A, one suggestion grammar): a fact the page noticed and offers to act on,
 * in an inset of its own where it lives (under a name, at a group's foot, under a list): the fact, with what it is said
 * of in bold, the source after it in the dim ink, then its one act and, where it may be put away, the × at the end.
 * `line` is its one-row form, the act beside the fact, for a notice under a list of rows (a draft waiting in a thread).
 *
 * It draws what the gallery's Notice family draws (tooling/scripts/e2e-harness/kit-gallery.mjs). `className` is for the
 * page's layout, and comes last.
 */
import type { ReactNode } from "react";
import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { cx } from "../variants";

/** The × that puts a notice away: its name, which is also its hover, its press, and whether that press is out. */
type NoticeDismiss = { label: string; onDismiss: () => void; busy?: boolean; testid?: string };

type NoticeProps = {
  /** What was noticed: a sentence, its subject in `<b>`. */
  fact: ReactNode;
  /** Where it was noticed, said after the fact ("· on the call Oct 2"); none where the fact says it. */
  source?: ReactNode;
  /** Its one act: the kit's Button at sm. None for a reader who may not act on it. */
  act?: ReactNode;
  dismiss?: NoticeDismiss | null;
  /** The one-row form, the act beside the fact. */
  line?: boolean;
  /** Its name to a screen reader: the fact in words. */
  label: string;
  className?: string;
  testid?: string;
};

/** A notice: the fact and its source, its act and its ×. */
export function Notice({
  fact,
  source = null,
  act = null,
  dismiss = null,
  line = false,
  label,
  className,
  testid,
}: NoticeProps) {
  return (
    <div
      className={cx("notice", line ? "notice-line" : "", className)}
      role="group"
      aria-label={label}
      data-testid={testid}
    >
      <p className="notice-fact">
        {fact}
        {source ? <span className="notice-src"> · {source}</span> : null}
      </p>
      {act || dismiss ? (
        <div className="notice-acts">
          {act}
          {dismiss ? (
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              className="notice-x"
              aria-label={dismiss.label}
              title={dismiss.label}
              aria-busy={dismiss.busy || undefined}
              onClick={dismiss.onDismiss}
              data-testid={dismiss.testid}
            >
              <Icon name="x" size={11} />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
