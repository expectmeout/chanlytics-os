import "server-only";
import { defineActions } from "../context";
import { broadcastAction } from "./broadcast";
import { playbookAction } from "./playbook";

/**
 * A campaign to the people who said yes (D11): one message sent once (broadcast, once propose_broadcast) or a standing
 * rule (playbook, once propose_playbook). Each action is its own family's, moved under this tool unchanged; both build
 * a card an operator may approve.
 */
export const propose_campaign = defineActions({
  name: "propose_campaign",
  description:
    "Propose a campaign to the people who said yes, as a card the person approves: one message sent once, or a standing rule that sends on its own. Action broadcast takes template_id, one approved WhatsApp template, and sends it to an audience, everyone who said yes or any list campaigns with action audiences names (audience_kind everyone; list for a People list, with its id as audience_id; saved for one of the workspace's own, with its audience_id), with params as the template's values in order (typed text, or @first_name, @business_name or @booking_link to fill per person), an optional scheduled_for as an ISO time with its offset (2026-09-20T15:00:00-04:00, never a bare date), and an optional name. Action playbook takes trigger and makes a standing rule that sends one approved WhatsApp template to newly eligible people who said yes: trigger is quiet_30 (win-back), new_week (welcome), phoned_only (save our number), lapsed (no visit in 45 days), everyone_monthly (the month's offer), saved_list (on any list: its token from campaigns with action audiences in list, one of People's or one of the workspace's own, with policy_class campaign for an offer or reengage for a win-back), or, where deals are on, proposal_waiting (the proposal follow-up: one nudge per proposal waiting past the workspace's pace, one such playbook per workspace, its message carrying the proposal's link as @proposal_link); template_id is an approved template, or omitted for the trigger's starter when the workspace holds it; params are the template's values in order (typed text, or @first_name, @business_name, @booking_link, @proposal_link), filled in for a starter except a typed one such as the month's offer; run_hour is 9 to 20 by the business's clock (default 10) and cap_per_run defaults to 25. Call action broadcast for one message sent once, reading campaigns with action audiences first for the template ids, the audiences and their counts; call action playbook for a standing rule, reading campaigns with action playbooks first for what runs and who each moment reaches. When nobody can be sent a broadcast, say why: nobody said yes (point to their profiles) or the ones who did have no number to send to; never propose a broadcast to nobody. A broadcast's card includes nobody without a recorded yes and says how many it reaches; a playbook's card, once approved, runs under its class's autonomy mode, and a starter the workspace does not hold, or a typed value left blank, is refused in words.",
  actions: { broadcast: broadcastAction, playbook: playbookAction },
});
