/**
 * What stands over Conversations' rows (conversations-page.tsx listPane): the channels with their counts, and the head with
 * the pick-all box and the search. On a phone both stand in the frame's top, still as the rows scroll under them, the
 * channels first as the Inbox's buckets are (kit/head/under-row.tsx); elsewhere the head opens the list and the channels
 * stand under what could not be read. Moved out of the page with the phone polish (25 Nov 2026), which put them in the
 * frame's top and the page past its length.
 */
import { UnderRow } from "../../kit/head/under-row";
import { Search } from "../../kit/search/search";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { cvAddress } from "../cv-rules";
import { navigate } from "../shell";
import type { ConversationsSurface } from "../types";
import type { CvPick } from "./conversations-pick";
import { pickAll } from "./pick";

export interface CvListTopProps {
  /** A row's conversation takes the phone's screen over the list, which is held under it. */
  away: boolean;
  /** The search is the bar's line (a desk's): the list's head draws no box of its own. */
  inLine: boolean;
  channels: ConversationsSurface["CV_CHANNELS"];
  channel: string;
  counts: Record<string, number>;
  /** The rows on screen that can be picked, by the names their picks are held under. */
  canPick: string[];
  pick: CvPick;
  query: string;
  setQuery: (v: string) => void;
}

/** Whether the channels and the head stand in the frame's top: a phone's list, shown. */
const inFrameTop = (top: CvListTopProps): boolean => !top.away && !top.inLine;

/** The list's channels, each with its count. */
function ChannelTabs({ channels, channel, counts }: CvListTopProps) {
  return (
    <div className="cv-filters">
      <SubTabs
        label="Conversations by channel"
        dense
        value={channel}
        onSelect={(id) => navigate(cvAddress(id, null))}
        tabs={channels.map((ch) => ({
          id: ch.id,
          label: ch.label,
          count: counts[ch.id],
          testid: `cv-tab-${ch.id}`,
        }))}
      />
    </div>
  );
}

/** The head: the box that picks every row, and the search (on a desk the bar's line is the search). */
function ListHead({ inLine, canPick, pick, query, setQuery }: CvListTopProps) {
  return (
    <div className="cv-list-head" data-line={inLine ? "" : undefined}>
      {canPick.length > 0 &&
        pickAll({ ids: canPick, selected: pick.selected, onToggle: pick.toggle, onClear: pick.clear })}
      {/* The kit's search, Needs you's and People's capsule (it was People's old desk box, a second look on one page). */}
      {!inLine && (
        <Search
          className="cv-lookup"
          label="Search names, transcripts, messages"
          value={query}
          onChange={setQuery}
          testid="cv-search"
        />
      )}
    </div>
  );
}

/** The list's top: on a phone the channels and the head in the frame's top; elsewhere the head alone. */
export function CvListTop(top: CvListTopProps) {
  if (!inFrameTop(top)) return <ListHead {...top} />;
  return (
    <UnderRow className={top.pick.selected.length > 0 ? "cv-under picking" : "cv-under"}>
      <ChannelTabs {...top} />
      <ListHead {...top} />
    </UnderRow>
  );
}

/** The channels where the frame's top does not hold them: under the list's head and what could not be read. */
export function CvListChannels(top: CvListTopProps) {
  return inFrameTop(top) ? null : <ChannelTabs {...top} />;
}
