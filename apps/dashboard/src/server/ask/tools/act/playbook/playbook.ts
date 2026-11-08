/** Playbook: playbook. */

import "server-only";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  LIST_PLAYBOOK_CLASSES,
  PLAYBOOK_CARD_REFUSALS,
  REACH_OUT_IS_NOT_A_MOMENT,
  parseListToken,
  purposeOfPlaybook,
  scheduleLine,
  messageAboutOfTrigger,
  triggerOf,
  type ListRef,
  UUID,
} from "@chanlytics/contracts";
import { playbookNameAsked } from "@chanlytics/core";
import { findTwinRefusal } from "../../../../campaigns/playbook-row";
import { AUDIENCES_CALL, namedChannels, stepNamed, str } from "../../context/tool-reads";
import { actAction, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { propose, refuse } from "../../context/context";
import {
  getAllowanceHeld,
  getBlockedOutcome,
  breathSaid,
  campaignSheet,
  cardLine,
  playbookChannelsSaid,
  getPlaybookHow,
  readReachNow,
  reachesSaid,
  underMode,
  getWordedMoment,
  type Trigger,
} from "../playbook-card";
import { cardSays, stepSays } from "../says";
import {
  APPOINTMENT_TRIGGERS,
  PROPOSABLE_STARTERS,
  PROPOSABLE_TRIGGERS,
  UNNAMED_GOES_BY,
  calendarRefusal,
  checkedPlaybook,
  endKept,
  endOf,
  endSaid,
  followUpRefusal,
  heldStarter,
  proposeOnStarter,
  proposedSaying,
  stepJudged,
  type PlaybookProposed,
} from "./params";

/**
 * A new campaign on the message step `step` of the plan writes (stepJudged): who a run reaches, counted by the
 * workspace's channels alone with the step's message, an offer, laid over them (context.ts stepMessage) and the yes it
 * needs; the month's allowance, the mode it starts with and its last day, as every new campaign's card says them. It
 * says which step makes its message and quotes the offer its values type (says.ts stepSays); a name not given is the
 * route's to give once the message is filed.
 */
async function proposeOnStep(
  toolContext: ToolContext,
  input: PlaybookProposed,
  at: { trig: Trigger; listRef: ListRef | null },
  step: number,
): Promise<ProposalOutcome> {
  const { trig, listRef } = at;
  const judged = await stepJudged(toolContext, input, trig, listRef);
  if ("refusal" in judged) return refuse(judged.refusal);
  const { cls, specs, by, clock, message, about } = judged;
  const how = await getPlaybookHow(toolContext, message, by, about);
  const reach = await readReachNow(toolContext, trig, listRef, message, how, clock.cap_per_run);
  if ("refusal" in reach) return refuse(reach.refusal);
  if (reach.blocked) return getBlockedOutcome(toolContext, trig, reach.blocked, playbookNameAsked(input.name) || null);
  const { drawn, reading, policies, listLabel, usable } = reach;
  const held = await getAllowanceHeld(toolContext, by.channels, reading, clock, purposeOfPlaybook(cls));
  const { goes, waiting } = playbookChannelsSaid(how, by, drawn.reach.by_channel, held);
  const under = underMode(cls, policies);
  const name = playbookNameAsked(input.name) || null;
  const { word, moment } = await getWordedMoment(toolContext, trig);
  const named = { trigger: trig.id, word, list: listLabel };
  const sentence = {
    where: listLabel ? `On ${listLabel}` : `${moment.label} — ${moment.hint.toLowerCase()}`,
    runs: scheduleLine(clock, word),
    breath: breathSaid(trig),
    end: endSaid(toolContext, input.until),
    goes,
    reaches: reachesSaid(purposeOfPlaybook(cls), drawn, how, named),
    sends: under.said,
    message: stepSays(step, specs),
  };
  return propose({
    kind: "playbook",
    title: `Campaign: ${name ?? moment.label}`,
    summary: `${sentence.where} · ${sentence.runs}${sentence.breath}${sentence.end}${goes} · ${waiting}${sentence.reaches} · ${sentence.sends} Says: ${sentence.message}`,
    line: cardLine(named, drawn.reach, clock, usable),
    sheet: campaignSheet({ ...sentence, waiting: [waiting] }),
    payload: {
      ...clock,
      trigger_label: moment.label,
      // Filled by the commit with the message step `step` made, before the route reads it.
      template_id: str(input.template_id, 40),
      template_name: null,
      params: specs,
      name,
      candidates: drawn.reach.will,
      policy_class: cls,
      list_id: listRef?.kind === "saved" ? listRef.id : null,
      list_key: listRef?.kind === "builtin" ? listRef.id : null,
      mode: under.mode,
      ...namedChannels(by),
      ...endKept(input.until),
    },
  });
}

async function proposePlaybook(toolContext: ToolContext, proposed: PlaybookProposed): Promise<ProposalOutcome> {
  const trig = triggerOf(str(proposed.trigger, 30));
  if (!trig) return refuse(PLAYBOOK_CARD_REFUSALS.trigger(PROPOSABLE_TRIGGERS));
  if (trig.kind === "reach_out") return refuse(REACH_OUT_IS_NOT_A_MOMENT);
  // A playbook on a list names it by its token (decision 0009): one of People's, or one of the workspace's own.
  const listRef = trig.kind === "saved" ? parseListToken(str(proposed.list, 60)) : null;
  if (trig.kind === "saved" && !listRef) return refuse(PLAYBOOK_CARD_REFUSALS.listToken(AUDIENCES_CALL));
  // Its last day, judged once and carried as the day it is from here on.
  const end = await endOf(toolContext, proposed.until);
  if ("refusal" in end) return refuse(end.refusal);
  const input = { ...proposed, until: end.until };
  const followUp = await followUpRefusal(toolContext, trig);
  if (followUp) return refuse(followUp);
  let templateId = str(input.template_id, 40);
  // The moment's starter named by its key, to file at Approve: in place of a message, never beside one.
  const starterKey = str(input.starter, 60);
  if (starterKey && templateId) return refuse(PLAYBOOK_CARD_REFUSALS.starterOrMessage);
  // The message an earlier step of Ask's plan writes, named by its token: judged before it is filed (proposeOnStep).
  const step = stepNamed(toolContext, templateId);
  // A step's message: its moment, the calendar's among it, is judged once there (stepJudged).
  if (step !== null) return proposeOnStep(toolContext, input, { trig, listRef }, step);
  if (templateId && !UUID.test(templateId)) return refuse(PLAYBOOK_CARD_REFUSALS.templateId(AUDIENCES_CALL));
  // An appointment's moment where no calendar is connected, refused before its message or its channels are read (D2).
  const notOffered = await calendarRefusal(toolContext, trig);
  if (notOffered) return refuse(notOffered);
  if (!templateId) {
    const own = await heldStarter(toolContext, trig, starterKey);
    // A starter not on file is added at the card's Approve (A0), never refused while one is offered.
    if ("starter" in own) return proposeOnStarter(toolContext, input, trig, listRef, own.starter);
    if ("refusal" in own) return refuse(own.refusal);
    templateId = own.id;
  }
  const about = messageAboutOfTrigger(trig.id);
  const saying = await proposedSaying(
    toolContext,
    input,
    templateId,
    { cls: trig.cls, onList: listRef !== null },
    about,
  );
  if ("refusal" in saying) return refuse(saying.refusal);
  const { asked, specs, picked } = saying;
  const { message } = asked;
  const checked = await checkedPlaybook(toolContext, input, trig, listRef, {
    templateId: message.anchor.id,
    specs,
    channels: picked.channels,
  });
  if ("refusal" in checked) return refuse(checked.refusal);
  // A running twin (D9), in the model's words (campaigns/playbook-row.ts findTwinRefusal). Its Approve meets the rule again
  // (startNewPlaybook), refusing a twin running since the card was made under the name it carries (under any name, for
  // a starter's or a plan step's card that names nothing), and so a press after its key's day, by the campaign its
  // first press started.
  const twin = await findTwinRefusal(
    toolContext.ctx,
    toolContext.tenantId,
    checked,
    input.name,
    PLAYBOOK_CARD_REFUSALS.twin,
  );
  if (twin) return refuse(twin);
  // By the channels it goes by: said and committed whenever they are more than WhatsApp alone by default.
  const by = { channels: checked.channels, named: picked.channels !== undefined };
  const how = await getPlaybookHow(toolContext, message, by, about);
  const reach = await readReachNow(toolContext, trig, listRef, message, how, checked.cap_per_run);
  if ("refusal" in reach) return refuse(reach.refusal);
  if (reach.blocked) return getBlockedOutcome(toolContext, trig, reach.blocked, playbookNameAsked(input.name) || null);
  const { drawn, reading, policies, listLabel, usable } = reach;
  const cls = checked.policy_class;
  const held = await getAllowanceHeld(toolContext, by.channels, reading, checked, purposeOfPlaybook(cls));
  // A tick that cannot send yet stays on the playbook, and its run holds those people until it can: the card says so.
  const { goes, waiting } = playbookChannelsSaid(how, by, drawn.reach.by_channel, held);
  const under = underMode(cls, policies);
  const sentence = cardSays(asked, specs, by, 140);
  if ("refusal" in sentence) return refuse(sentence.refusal);
  // The moment and its schedule in the workspace's word: read once the check has passed.
  const { word, moment } = await getWordedMoment(toolContext, trig);
  const named = { trigger: trig.id, word, list: listLabel };
  const pieces = {
    where: listLabel ? `On ${listLabel}` : `${moment.label} — ${moment.hint.toLowerCase()}`,
    runs: scheduleLine(checked, word),
    breath: breathSaid(trig),
    end: endSaid(toolContext, input.until),
    goes,
    reaches: reachesSaid(purposeOfPlaybook(cls), drawn, how, named),
    sends: under.said,
    message: sentence.says,
  };
  return propose({
    kind: "playbook",
    title: `Campaign: ${checked.name}`,
    summary: `${pieces.where} · ${pieces.runs}${pieces.breath}${pieces.end}${goes} · ${waiting}${pieces.reaches} · ${pieces.sends} Says: ${sentence.says}`,
    line: cardLine(named, drawn.reach, checked, usable),
    sheet: campaignSheet({ ...pieces, waiting: [waiting] }),
    payload: {
      trigger: trig.id,
      trigger_label: moment.label,
      template_id: message.anchor.id,
      template_name: message.name,
      params: specs,
      run_hour: checked.run_hour,
      cap_per_run: checked.cap_per_run,
      gap_days: checked.gap_days,
      cadence_days: checked.cadence_days,
      name: checked.name,
      candidates: drawn.reach.will,
      policy_class: cls,
      // The list it runs on, when it runs on one: the commit names it as the composer does.
      list_id: checked.list_id,
      list_key: checked.list_key,
      mode: under.mode,
      // Named only when the proposal named some: a card that named none commits as it always did.
      ...namedChannels(by),
      ...endKept(input.until),
    },
  });
}

/** A playbook, a standing rule: propose_sequence's action moment (sequence.ts), once propose_playbook. */
export const playbookAction = actAction({
  kind: "playbook",
  // Where the campaign would reach no one and a page mends what stops it: that one thing, with its door (getBlockedOutcome).
  makes: ["fix"],
  input: z.object({
    trigger: z.enum(PROPOSABLE_TRIGGERS),
    // On a list (saved_list): the list's token from sequences.lists, and what it sends.
    list: z.string().optional(),
    policy_class: z.enum(LIST_PLAYBOOK_CLASSES).optional(),
    template_id: z.string().optional(),
    params: z.array(z.string()).optional(),
    run_hour: z.number().optional(),
    cap_per_run: z.number().optional(),
    name: z.string().optional(),
    channels: z.array(z.enum(CONSENT_CHANNELS)).optional(),
    until: z.string().optional(),
    starter: z.enum(PROPOSABLE_STARTERS).optional(),
  }),
  examples: [
    { trigger: APPOINTMENT_TRIGGERS.after, starter: "after_visit_review" },
    {
      trigger: "saved_list",
      list: "seg:booked_week",
      policy_class: "campaign",
      template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
      params: ["@first_name", "@booking_link"],
      run_hour: 10,
    },
  ],
  label: "Preparing a campaign",
  words:
    `Action moment takes trigger and proposes a standing rule that sends one message to newly eligible people who said yes. trigger is quiet_30 (win-back: nothing heard in 30 days; where no calendar is connected), lapsed (win-back: no appointment in 45 days; where one is), ${APPOINTMENT_TRIGGERS.before} (a reminder the day before an appointment) or ${APPOINTMENT_TRIGGERS.after} (a check the day after), both only with a calendar connected and each sent whatever else the person hears from you that week, everyone_monthly (the month's offer), saved_list (on any list: its token from sequences with action lists in list, with policy_class campaign for an offer or reengage for a win-back), proposal_waiting (one nudge per proposal waiting past the workspace's pace; one such playbook per workspace; its message carries @proposal_link) or slot_opened (a time a cancellation frees is offered within the hour to the people who asked in the last 30 days and never booked, one batch per freed time, only with a calendar connected; its message carries @freed_when); a moment this workspace is not offered is refused in words to say. template_id is a message from sequences with action lists (any version's id), or omitted for the trigger's starter, which the card adds at Approve where the workspace lacks it (its WhatsApp version then goes for review where none is on file, which the card says), except a starter with words of its own, such as the month's offer; starter, in place of template_id, names the moment's starter to file at Approve by its key: on ${APPOINTMENT_TRIGGERS.after}, after_visit_review (a thank-you with a review ask, only where the Google listing keeps a review link) or after_visit_check (a thank-you asking how it went), taken when none is named. params are the message's values in order (typed text, or @first_name, @business_name, @booking_link, @review_link, @visit_when and @visit_service on an appointment's moment, @freed_when on a freed time, or @proposal_link), filled in for a starter except a typed one such as the month's offer; run_hour is 9 to 20 by the business's clock (default 10); cap_per_run defaults to 25; channels (whatsapp, sms, email; when none is named it goes by ` +
    UNNAMED_GOES_BY +
    ` the workspace can send on now that the message holds, as a new playbook opens in Campaigns, and the card says which, so name them only to go by fewer, or by one not ready yet) are the ones it may go by, each person once on the first it can: a channel its purpose never carries is refused, and one the workspace cannot send on yet is kept, its runs holding those people until it can; until is its last day, YYYY-MM-DD by the business's clock, today or later. A new one starts with the mode its class's Autonomy row says (decision 0064), and its first batch waits for an OK whatever that is, which the card says.`,
  build: proposePlaybook,
});
