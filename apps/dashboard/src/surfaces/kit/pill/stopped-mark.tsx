/**
 * The stopped mark (D1-stop-unseen): the small "Stopped" a person wears wherever they are offered as someone to answer or
 * contact, when they asked to stop or are on do-not-contact (contracts isOptedOutContact, carried as `stopped` or
 * `optedOut` on the row's view model). The Inbox's row and header, Conversations' row, Live's row, the Pipeline's card,
 * peek and picker, and the Calendar's panel drew nothing of it, so the owner learned a person had said STOP when the
 * reply box would not take a reply. People's row says it with its State pill; where that pill says something that
 * outranks it ("Needs you"), the mark stands beside it (contracts stopToldBesideState).
 *
 * It is the kit's one pill (StatePill) in the tone and the words contracts gives a STOP (STOP_WORDS): at rest, neutral,
 * its dot and its word, never the amber of "Needs you" (decision 0048: a STOP is news and no wait). Its hover is the
 * fact whole, "Asked to stop receiving messages". `className` is for the page's layout and comes last.
 */
import { STOP_WORDS } from "@chanlytics/contracts";
import { StatePill } from "./state-pill";

interface StoppedMarkProps {
  className?: string;
  /** The test id the mark is found by; one a page already holds for its own. */
  testid?: string;
}

/** A person who asked to stop, said once in a word beside their name. */
export function StoppedMark({ className = "", testid = "stopped-mark" }: StoppedMarkProps) {
  return (
    <StatePill
      kind="tone"
      value={STOP_WORDS.tone}
      label={STOP_WORDS.mark}
      title={STOP_WORDS.said()}
      className={className}
      testid={testid}
    />
  );
}
