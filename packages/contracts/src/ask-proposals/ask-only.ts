/**
 * The kinds only Ask's cards commit (the operator, 15 Oct 2026): every kind no page presses -- a whisper and a call
 * handed over, a policy and an invite, a broadcast, a campaign and its message, a lead search and the lead
 * workbench's cards, a cold email's, a person's details, a list made, changed or deleted, a review's reply and Ask's
 * own follow-up. (A reply, a thread's verbs, a held reply's rewrite and a person's first message left this table for
 * the page's, decision 0071: Today's Need you presses them.) No page walks them, so a page's bundle never
 * carries them: the browser loads this module, its own entry (`@chanlytics/contracts/ask-only`), when Ask is installed,
 * and Ask's bridge waits for it before it hands over cards (legacy-bridge/ask.ts); addProposalSpecs (page-specs.ts)
 * puts them in the lookups. The server's table (proposals.ts) has them from the start.
 */
import { broadcastSpec, messageSpec, playbookChannelsSpec, playbookSpec } from "./campaigns";
import { followUpSpec } from "./follow-up";
import { callHandOverSpec, whisperSpec } from "./inbox";
import {
  leadAddresseeSpec,
  leadLaterSpec,
  leadListSpec,
  leadMarkSpec,
  leadSearchMoreSpec,
  leadStageSpec,
  leadsBulkSpec,
  leadsCheckSpec,
  reachOutMakeSpec,
  reachOutSaidSpec,
} from "./lead-work";
import { leadSearchSpec, peopleSearchSpec, reachOutAddSpec } from "./leads";
import { listChangeSpec, listDeleteSpec, listSpec } from "./lists";
import { personDetailsSpec } from "./person";
import { reviewReplySpec } from "./reviews";
import { inviteSpec, policySpec } from "./workspace";

/** Each kind only Ask's cards commit, by its spec. Each keeps its own type, so the kinds above operator are known. */
export const ASK_ONLY_SPECS = {
  // Live's (a reply, a held reply's rewrite and a thread's verbs are pressed on Today's Need you too: page-specs.ts).
  whisper: whisperSpec,
  call_hand_over: callHandOverSpec,
  // Settings'.
  policy: policySpec,
  invite: inviteSpec,
  // Campaigns'.
  broadcast: broadcastSpec,
  playbook: playbookSpec,
  playbook_channels: playbookChannelsSpec,
  message: messageSpec,
  // People's and its lists'.
  person_details: personDetailsSpec,
  list: listSpec,
  list_change: listChangeSpec,
  list_delete: listDeleteSpec,
  // Leads' and Reach out's.
  lead_search: leadSearchSpec,
  people_search: peopleSearchSpec,
  reach_out_add: reachOutAddSpec,
  lead_stage: leadStageSpec,
  lead_mark: leadMarkSpec,
  lead_later: leadLaterSpec,
  leads_bulk: leadsBulkSpec,
  leads_check: leadsCheckSpec,
  lead_addressee: leadAddresseeSpec,
  lead_list: leadListSpec,
  lead_search_more: leadSearchMoreSpec,
  reach_out_make: reachOutMakeSpec,
  reach_out_said: reachOutSaidSpec,
  // A review's, and Ask's own follow-up.
  review_reply: reviewReplySpec,
  follow_up: followUpSpec,
};

/** The kinds only Ask's cards commit. */
export type AskOnlyKind = keyof typeof ASK_ONLY_SPECS;
