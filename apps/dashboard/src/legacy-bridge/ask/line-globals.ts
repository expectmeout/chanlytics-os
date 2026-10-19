/**
 * The parts of the kit and of Leads only Ask's Line draws, published under the names its pages read them by: the answer's
 * charts (the answer canvas, C3: a line for one count over time, bars for a few things compared, a segment bar), the hold
 * to talk (ask-hooks.jsx), and the plan card it draws for a lead_search card (ask-turn.jsx). They were published by the
 * frame for every page (seed-globals.ts); they come with the Line now (line-code.ts).
 */
import { PROPOSAL_GATE, type ProposalGate } from "@chanlytics/contracts/page-specs";
import { BarList } from "@/surfaces/kit/charts/bar";
import { SegmentBar } from "@/surfaces/kit/charts/card";
import { LineChart } from "@/surfaces/kit/charts/line";
import { useHoldToTalk } from "@/surfaces/kit/talk/use-hold-to-talk";
import { LeadPlanCard } from "@/surfaces/leads/finder/plan-card";

declare global {
  interface Window {
    /** The gate each card checks before Approve, by its kind (contracts PROPOSAL_GATE), as the Line's cards read it. */
    PROPOSAL_GATE?: Partial<Record<string, ProposalGate>>;
  }
}

export const ASK_LINE_GLOBALS = { SegmentBar, LineChart, BarList, useHoldToTalk, LeadPlanCard, PROPOSAL_GATE };

// Each name said, so the names the shell may read can be listed (shell-names-are-published.test.mjs). The gate is the
// table itself, which Ask's own kinds join in place as they are added (contracts addProposalSpecs).
Object.assign(window, { SegmentBar, LineChart, BarList, useHoldToTalk, LeadPlanCard, PROPOSAL_GATE });
