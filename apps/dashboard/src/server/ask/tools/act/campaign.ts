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
    "Propose a campaign to the people who said yes, as a card the person approves: one message sent once, or a standing rule that sends on its own.",
  tail: "Call action broadcast for one message sent once, reading campaigns with action audiences first for the template ids, the audiences and their counts; call action playbook for a standing rule, reading campaigns with action playbooks first for what runs and who each moment reaches. When nobody can be sent a broadcast, say why: nobody said yes (point to their profiles) or the ones who did have no number to send to; never propose a broadcast to nobody. A broadcast's card includes nobody without a recorded yes and says how many it reaches; a playbook's card, once approved, runs under its class's autonomy mode, and a starter the workspace does not hold, or a typed value left blank, is refused in words.",
  actions: { broadcast: broadcastAction, playbook: playbookAction },
});
