/**
 * The reach split as a bar (the Campaigns review's item 18): a thin bar of the people a campaign reaches, one part for each
 * channel that reaches anyone (WhatsApp, text, email, always in that order), each part's width its share of the people
 * reached and its colour the channel's own on the chart palette (parts/channels.ts cmChannelColour), so a channel is the
 * same colour here as in Reports. It is the kit's Meter, which says what it shows to a screen reader (`role="img"`, and an
 * `aria-label` that says the split in words) and is the one place a share becomes a width, and the kit's Tooltip, which says
 * the same on hover and on keyboard focus ("12 on WhatsApp, 12 by email"). Drawn only where the campaign goes by more than
 * WhatsApp alone (the To line's clause is its twin, parts/channels.ts cmReachBy), and not at all where nobody is reached.
 */
import { reachBarParts, reachBarWords, reachByWords, type ReachSplit } from "@chanlytics/contracts";
import { Meter } from "../../kit/meter/meter";
import { Tooltip } from "../../kit/tooltip/tooltip";
import { cmChannelColour } from "./channels";

interface CmSplitBarProps {
  split: ReachSplit;
  /** The page's layout class, and the bar's test id. */
  className?: string;
  testid: string;
}

/** The people reached, by channel: a thin bar, its words on hover and on focus. */
export function CmSplitBar({ split, className, testid }: CmSplitBarProps) {
  const parts = reachBarParts(split);
  if (parts.length === 0) return null;
  return (
    <Tooltip tip={reachByWords(split)}>
      <Meter
        size="sm"
        tabIndex={0}
        className={className}
        data-testid={testid}
        parts={parts.map((p) => ({ share: p.share, color: cmChannelColour(p.channel) }))}
        aria-label={reachBarWords(split)}
      />
    </Tooltip>
  );
}
