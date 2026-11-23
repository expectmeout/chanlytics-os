// Chanlytics — Settings › Business: the review link, a row of "Who you are" after the website.
//
// A module of its own beside the logo's and the colour's rows (logo/row.tsx, look/row.tsx): who.tsx holds as much as a
// module may. Every word is contracts' (config/review-link.ts), which also holds the rule a message's link is read by.

import { REVIEW_LINK_ROW_WORDS, normalizeLink, reviewLinkSaved, whyNotAReviewLink } from "@chanlytics/contracts";
import { gate } from "../../../frame-verbs";
import type { FrameFlash } from "../../../frame-verbs";
import { BtRow } from "../gestures/row";
import { btTextBox } from "../gestures/text-box";
import type { Brain, Config, Saver } from "../save";
import { settingsNow } from "../shell";

/** What the card hands the row, as it hands every row of its own. */
interface ReviewLinkRowProps {
  brain: Brain;
  canEdit: boolean;
  flash: (flash: FrameFlash) => void;
  saver: Saver | null;
}

/** The review link as it is stored: the web address with the https:// an owner leaves off, or what was typed. */
const btReviewLinkOf = (typed: string): string => normalizeLink(typed.trim()) || typed.trim();

/**
 * Where customers leave a review, where the owner gives a link of their own (22 Nov 2026): a message's review link is
 * this one, else the one the Google listing keeps (contracts reviewLinkFrom). A business with no listing had no review
 * ask at all until it could be given. One key of the brain, saved through the tab's saver as a patch of its own: AI
 * is told nothing of it, so its editor says nothing it will say. With none of the owner's own, the row says whether the
 * listing's link stands in (the settings read's `reviewLink`), so "Not set" is said only where a message has no link.
 */
export const BtReviewLinkRow = ({ brain, canEdit, flash, saver }: ReviewLinkRowProps) => {
  const words = REVIEW_LINK_ROW_WORDS;
  const own = typeof brain.review_link === "string" ? brain.review_link : "";
  const listed = !own && settingsNow()?.reviewLink === true;
  const door = saver
    ? {
        save: (draft: string, done: () => void) => {
          const link = btReviewLinkOf(draft);
          saver.save({
            row: "review_link",
            patch: (config: Config): Config => {
              const next: Brain = { ...(config.brain || {}) };
              if (link) next.review_link = link;
              else delete next.review_link;
              return { ...config, brain: next };
            },
            said: reviewLinkSaved(link),
            done,
            flash,
          });
        },
        pending: () => saver.pending("review_link"),
      }
    : null;
  return (
    <BtRow
      brain={brain}
      canEdit={canEdit && !!door}
      flash={flash}
      id="review_link"
      label={words.label}
      value={own ? <span className="bt-one-line">{own}</span> : null}
      empty={listed ? words.listing : words.empty}
      gate={gate("settings", words.gate)}
      initial={own}
      storedAs={btReviewLinkOf}
      check={whyNotAReviewLink}
      door={door}
      body={btTextBox({ placeholder: words.placeholder, inputMode: "url", autoComplete: "url", hint: words.hint })}
    />
  );
};
