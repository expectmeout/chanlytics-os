/**
 * The parts of the kit and of Leads only Ask's Line draws, published under the names its pages read them by: the answer's
 * charts (the answer canvas, C3: a line for one count over time, bars for a few things compared, a segment bar), the hold
 * to talk (ask-hooks.jsx), and what a search's card draws and sends (ask-turn.jsx; contracts leads/search/search-card.ts:
 * its rows, its one press, and the cards a newer one sets aside as an answer lands). They were published by the frame for
 * every page (seed-globals.ts); they come with the Line now (line-code.ts).
 */
import { SEARCH_CARD_REPLACED, searchCardView, withAnswerLanded } from "@chanlytics/contracts";
import { PROPOSAL_GATE, type ProposalGate } from "@chanlytics/contracts/page-specs";
import { BarList } from "@/surfaces/kit/charts/bar";
import { SegmentBar } from "@/surfaces/kit/charts/card";
import { LineChart } from "@/surfaces/kit/charts/line";
import { useHoldToTalk } from "@/surfaces/kit/talk/use-hold-to-talk";

declare global {
  interface Window {
    /** The gate each card checks before Approve, by its kind (contracts PROPOSAL_GATE), as the Line's cards read it. */
    PROPOSAL_GATE?: Partial<Record<string, ProposalGate>>;
  }
}

/**
 * A search's card in Ask (Ruben, 23 Oct 2026: the card is read, and a change is said to Ask): what it draws and sends, and
 * the conversation once an answer lands, the card it replaced set aside with the words it then says.
 */
const LeadCards = { view: searchCardView, landed: withAnswerLanded, replaced: SEARCH_CARD_REPLACED };

export const ASK_LINE_GLOBALS = { SegmentBar, LineChart, BarList, useHoldToTalk, LeadCards, PROPOSAL_GATE };

// Each name said, so the names the shell may read can be listed (shell-names-are-published.test.mjs). The gate is the
// table itself, which Ask's own kinds join in place as they are added (contracts addProposalSpecs).
Object.assign(window, { SegmentBar, LineChart, BarList, useHoldToTalk, LeadCards, PROPOSAL_GATE });
