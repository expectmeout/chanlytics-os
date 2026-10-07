import "server-only";
import { defineActions } from "../context";
import { broadcastAction } from "./broadcast";
import { playbookAction } from "./playbook";
import { runAction } from "./run";

/**
 * A campaign to the people who said yes (D11): one message sent once (broadcast, once propose_broadcast), a standing
 * rule (playbook, once propose_playbook), and since Phase 4 a playbook's run that waits for a person, approved or
 * skipped (run, D11 of that plan). Each action is its own family's, under this tool; each builds a card an operator
 * may approve.
 */
export const propose_campaign = defineActions({
  name: "propose_campaign",
  description:
    "Propose a campaign to the people who said yes, as a card the person approves: one message sent once, a standing rule that sends on its own, or a playbook's run that waits for a person, approved or skipped.",
  tail: "Call action broadcast for one message sent once, reading campaigns with action audiences first for the template ids, the audiences and their counts; call action playbook for a standing rule, reading campaigns with action playbooks first for what runs and who each moment reaches; call action run for a run waiting on them, reading campaigns first for its id. When nobody can be sent a broadcast, say why: nobody said yes (point to their profiles) or the ones who did have no number to send to; never propose a broadcast to nobody. A broadcast's card includes nobody without a recorded yes and says how many it reaches; a playbook's card, once approved, runs under its class's autonomy mode, and a starter the workspace does not hold, or a typed value left blank, is refused in words.",
  actions: { broadcast: broadcastAction, playbook: playbookAction, run: runAction },
});
