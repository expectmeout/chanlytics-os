/** Sequence: sequence. */

import "server-only";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  LEAD_LIST_MAX,
  LEAD_REWRITE_CHANGE_MAX,
  REACH_OUT_DECISIONS,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_SAID_OUTCOMES,
  REACH_OUT_STEPS_MAX,
  SEQUENCE_DRAFT_THEN_MAX,
} from "@chanlytics/contracts";
import { actAction, defineActions } from "../../context/tool-defs";
import { broadcastAction } from "../broadcast";
import { reachOutAddAction } from "../leads/search";
import { messageAction } from "../message";
import { playbookAction } from "../playbook/playbook";
import { playbookChangeAction } from "../playbook-change";
import { playbookChannelsAction } from "../playbook-channels";
import { runAction } from "../run";
import {
  STEP_FIELDS,
  THEN_STEP,
  proposeDiscard,
  proposeLeave,
  proposeMake,
  proposeRunNow,
  proposeSendDecide,
  proposeSendSaid,
  proposeStart,
  proposeStep,
  proposeStepRemove,
  proposeWords,
} from "./steps";
import { COLD_STEP, proposeColdEmail, proposeEnd } from "./cold-email";

const SEQUENCE_ID = z.string().describe("A sequence's id, from sequences with action list.");

const STEP_ID = z.string().describe("A step's id, from sequences with action sequence.");

export const propose_sequence = defineActions({
  name: "propose_sequence",
  description:
    "Propose what sends on its own, as a card the person approves (every such thing is a sequence): a message sent once, a sequence at a moment of the customer journey or on a list, a whole new sequence with its steps, a step added, changed, taken away or given new words, a draft started, a sequence let go of or ended, people taken out, a batch waiting for an OK approved or skipped, a sequence paused, resumed, renamed or retimed, its channels, a new saved message, and cold email to leads.",
  tail: `For an offer, a promotion or a whole setup, call propose_plan with action offer instead. Read sequences first: action list and action sequence for what exists and its ids, action lists for who can be sent and the messages a send may use, action moments for the moments offered. When nobody can be sent a message, say why: nobody said yes (point to their profiles) or the ones who did have no number to send to, or no channel that can carry it now (the lists read says which); never propose a send to nobody. A starter the workspace does not hold yet is added at the card's Approve, a typed value left blank is refused in words, and a second running sequence on the same moment, list and message is refused unless they name it apart. A person reads campaign or sequence, never playbook or broadcast; the fields keep those names.`,
  actions: {
    once: broadcastAction,
    moment: playbookAction,
    make: actAction({
      kind: "sequence_make",
      input: z.object({
        first: z
          .record(z.string(), z.unknown())
          .describe("The first step, as action moment takes it, with its template_id."),
        then: z.array(THEN_STEP).describe(`Up to ${SEQUENCE_DRAFT_THEN_MAX} steps after the first.`),
        start: z.boolean().describe("true starts it once approved; false keeps it as a draft."),
      }),
      examples: [
        {
          first: { trigger: "quiet_30", template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70" },
          then: [{ after_days: 4, template_id: "e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81", only_if: ["no_reply"] }],
          start: false,
        },
      ],
      label: "Preparing a sequence",
      words: `Action make proposes a whole new sequence to customers: first, its first step exactly as action moment takes it (a moment or a list, its message by template_id, its clock and channels), then up to ${SEQUENCE_DRAFT_THEN_MAX} steps after it (each a wait, what must still hold, its message), and start (true starts it once approved, false keeps it as a draft). Write each message first with action message where the Library has none, in a plan.`,
      build: proposeMake,
    }),
    step: actAction({
      kind: "sequence_step",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        step_id: STEP_ID.optional(),
        template_id: z.string().optional().describe("A new step's message."),
        after_days: STEP_FIELDS.after_days.optional(),
        only_if: STEP_FIELDS.only_if,
        channels: z.array(z.enum(CONSENT_CHANNELS)).optional().describe("The channels the step goes by."),
        name: STEP_FIELDS.name,
        params: STEP_FIELDS.params,
      }),
      examples: [
        {
          sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c",
          after_days: 5,
          template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
        },
      ],
      label: "Preparing a step",
      words:
        "Action step adds a step after the last (after_days and template_id), or changes one after the first by step_id: its wait, what must still hold, its channels, name or values. A step's message is changed with action words.",
      build: proposeStep,
    }),
    step_remove: actAction({
      kind: "sequence_step_remove",
      input: z.object({ sequence_id: SEQUENCE_ID, step_id: STEP_ID }),
      examples: [
        { sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", step_id: "a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9c0d" },
      ],
      label: "Preparing the step's removal",
      words: "Action step_remove takes away a step after the first, with the steps after it.",
      build: proposeStepRemove,
    }),
    words: actAction({
      kind: "sequence_words",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        step_id: STEP_ID,
        template_id: z.string().describe("The message the step sends from now."),
        params: STEP_FIELDS.params,
      }),
      examples: [
        {
          sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c",
          step_id: "a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9c0d",
          template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
        },
      ],
      label: "Preparing the new words",
      words:
        "Action words gives a step a different message from now (write it first with action message); where WhatsApp has to approve it, the step keeps sending its own until then.",
      build: proposeWords,
    }),
    start: actAction({
      kind: "sequence_start",
      input: z.object({ sequence_id: SEQUENCE_ID }),
      examples: [{ sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c" }],
      label: "Preparing the start",
      words:
        "Action start turns a draft on: its first step runs from its next run. A paused one is resumed with action change.",
      build: proposeStart,
    }),
    run_now: actAction({
      kind: "playbook_run",
      input: z.object({ sequence_id: SEQUENCE_ID }),
      examples: [{ sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c" }],
      label: "Preparing the run",
      words:
        "Action run_now runs a sequence's first step now, as its hourly run would: it waits for an OK where its class asks.",
      build: proposeRunNow,
    }),
    change: playbookChangeAction,
    channels: playbookChannelsAction,
    batch: runAction,
    leave: actAction({
      kind: "sequence_leave",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        contact_ids: z.array(z.string()).optional().describe("People in it, by their ids."),
        lead_ids: z.array(z.string()).min(1).max(LEAD_LIST_MAX).optional().describe("Leads in it, by their ids."),
      }),
      examples: [
        { sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", contact_ids: ["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"] },
      ],
      label: "Preparing who leaves",
      words:
        "Action leave takes people or leads out of a sequence; a send of theirs not yet gone is skipped with them.",
      build: proposeLeave,
    }),
    decide: actAction({
      kind: "sequence_send_decide",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        send_id: z.string().describe("A held email's send_id, from sequences with action sequence (waiting_on_you)."),
        decision: z.enum(REACH_OUT_DECISIONS).describe("include, rewrite, skip or not_a_fit."),
        change: z
          .string()
          .max(LEAD_REWRITE_CHANGE_MAX)
          .optional()
          .describe(
            "Only with rewrite: what should change in the opening, in the words the person used; none where they said none.",
          ),
      }),
      examples: [
        {
          sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c",
          send_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
          decision: "include",
        },
      ],
      label: "Preparing the held email",
      words:
        "Action decide answers an email the check held: include lets it go as it is, rewrite writes its opening again at once (as the person says, with change) and can be undone, skip leaves it out of this batch, not_a_fit sets its business aside. Only a rewrite is undone.",
      build: proposeSendDecide,
    }),
    sent_by_hand: actAction({
      kind: "sequence_send_said",
      input: z.object({
        sequence_id: SEQUENCE_ID,
        send_id: z
          .string()
          .describe("The send_id of an email handed over to send by hand, from sequences with action sequence."),
        outcome: z.enum(REACH_OUT_SAID_OUTCOMES).describe("sent or not_sent."),
      }),
      examples: [
        {
          sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c",
          send_id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
          outcome: "sent",
        },
      ],
      label: "Preparing what became of the email",
      words:
        "Action sent_by_hand records what became of an email handed over to send by hand from the business's own inbox: sent, or not_sent. Ask them; never say one went that they did not say.",
      build: proposeSendSaid,
    }),
    discard: actAction({
      kind: "sequence_discard",
      input: z.object({ sequence_id: SEQUENCE_ID }),
      examples: [{ sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c" }],
      label: "Preparing to let it go",
      words:
        "Action discard takes away a sequence that never ran, whatever its state, or a sequence to leads that never wrote; one that ran is ended with action end, and a sequence to leads that wrote is paused with action change.",
      build: proposeDiscard,
    }),
    end: actAction({
      kind: "sequence_end",
      input: z.object({ sequence_id: SEQUENCE_ID }),
      examples: [{ sequence_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c" }],
      label: "Preparing the end",
      words:
        "Action end ends a customer's sequence that has run, for good: it sends nothing more and nobody is added to it; what it sent stays in its History. Nothing undoes it. One that never ran is let go of with action discard, and a sequence to leads is paused with action change.",
      build: proposeEnd,
    }),
    message: messageAction,
    cold_email: actAction({
      kind: "reach_out_make",
      input: z.object({
        name: z.string().describe("What Campaigns calls it."),
        search_id: z
          .string()
          .describe(
            "The search or the list of leads it writes to (leads with action searches), or a plan step's token.",
          ),
        steps: z.array(COLD_STEP).describe(`One to ${REACH_OUT_STEPS_MAX} emails, the first with a subject.`),
        gap_minutes: z
          .number()
          .int()
          .optional()
          .describe(`Minutes between two emails: one of ${REACH_OUT_GAP_MINUTES.join(", ")}.`),
        owner_sends: z
          .boolean()
          .optional()
          .describe(
            "true hands each email to the owner to send from their own inbox; false sends from the connected mailboxes. Leave it out to send from the mailboxes when one is connected, else by the owner.",
          ),
        signed_by: z.string().optional().describe("Who signs the emails."),
        include_unconfirmed: z
          .boolean()
          .optional()
          .describe("true writes to addresses the check could not confirm too."),
      }),
      examples: [
        {
          name: "Businesses near you",
          search_id: "9c2e4b6d-1f3a-4e5c-8b7d-0a1c2e3f4b5d",
          steps: [
            { subject: "A quick idea for {business_name}", body: "Hi {first_name}, ..." },
            { body: "Following up on my note last week.", after_days: 4 },
          ],
        },
      ],
      label: "Preparing a cold email sequence",
      words:
        "Action cold_email proposes a cold email sequence to the businesses of a search or a list of chosen leads (propose_leads with action list makes one): its emails, their waits and its pace, from the workspace's own mailboxes (or handed over to send by hand). Its first run is planned once approved and waits for their say before an email goes. Write like a person to one business; never claim a relationship that does not exist.",
      build: proposeColdEmail,
    }),
    leads: reachOutAddAction,
  },
});
