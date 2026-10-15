import "server-only";
import { PLAYBOOK_CARD_WORDS } from "@chanlytics/contracts";
import { defineActions } from "../context";
import { broadcastAction } from "./broadcast";
import { reachOutAddAction } from "./lead-search";
import { messageAction } from "./message";
import { planAction } from "./plan";
import { playbookAction } from "./playbook";
import { playbookChangeAction, sequenceAction } from "./playbook-change";
import { playbookChannelsAction } from "./playbook-channels";
import { runAction } from "./run";

/**
 * A campaign to the people who said yes (D11): one message sent once (broadcast, once propose_broadcast), a standing
 * rule (playbook, once propose_playbook), since Phase 4 a playbook's run that waits for a person, approved or
 * skipped (run, D11 of that plan), and since 8 Oct 2026 the channels a playbook that exists goes by, changed (channels:
 * what a press on the Goes by row of its drawer does), and since 9 Oct 2026 a playbook that exists changed in place (change:
 * what its drawer's Pause, Resume and Edit of its name and clock do), and since 10 Oct 2026 a new message for the Library,
 * a version per channel (message: what the Library's New message files, whole), and since 11 Oct 2026 an offer or a whole
 * setup as one plan (plan: every card it takes, each step built by its own action here or propose_settings', from one
 * call), and since 13 Oct 2026 leads added to a reach-out fed by a list (leads, 00426: what Leads' pile and a reach-out's
 * Add leads do), and since 15 Oct 2026 a sequence that exists given a step, new words or one fewer (sequence: what its
 * page's editor does). Each action is its own family's, under this tool; each builds a card an operator may approve.
 */
export const propose_campaign = defineActions({
  name: "propose_campaign",
  description:
    "Propose a campaign to the people who said yes, as a card the person approves: one message sent once, a standing rule that sends on its own, a playbook's run that waits for a person, approved or skipped, the channels a playbook that exists goes by, changed, a playbook that exists paused, resumed, renamed or retimed, a new message for the Library that campaigns send, or leads added to a reach-out fed by a list.",
  tail: `For an offer, a promotion or a whole setup, call action plan once with the intent and leave its steps to it, never the actions below one by one. Call action message for one new message on its own; call action broadcast for one message sent once, reading campaigns with action audiences first for the template ids, the audiences and their counts; call action playbook for one standing rule, reading campaigns with action playbooks first for what runs and who each moment reaches; call action run for a run waiting on them, reading campaigns first for its id; call action channels to turn a playbook that exists on by one more channel, or off one, reading campaigns with action playbooks first for its id and the channels it goes by now. Call action change to pause, resume, rename or retime a playbook that exists, or change the values its message fills in (the month's offer's text among them), its last day or its trial, by its playbook_id from campaigns with action playbooks or the page's rows. When nobody can be sent a broadcast, say why: nobody said yes (point to their profiles) or the ones who did have no number to send to; never propose a broadcast to nobody. A broadcast's card includes nobody without a recorded yes and says how many it reaches; a playbook's card, once approved, runs under its class's autonomy mode (a new one under an auto class starts ${PLAYBOOK_CARD_WORDS.trial}), a starter the workspace does not hold yet is added at the card's Approve, a typed value left blank is refused in words, and a second running playbook on the same moment, list and message is refused unless they name it apart.`,
  actions: {
    broadcast: broadcastAction,
    playbook: playbookAction,
    run: runAction,
    channels: playbookChannelsAction,
    change: playbookChangeAction,
    message: messageAction,
    plan: planAction,
    leads: reachOutAddAction,
    sequence: sequenceAction,
  },
});
