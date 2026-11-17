/**
 * Whether a running sequence's steps can send their messages (Campaigns, one tab, call C3, 17 Nov 2026): the first step
 * whose message cannot go, and why. The Messages list said this of each message in its own "Needs you" (WhatsApp refused
 * it or paused it, or a campaign sends it in a language it has no version in); with Messages folded into Campaigns it is
 * said on the campaign it stops, which then needs you (words/flow.ts sequenceGroupOf), its row saying which step and why
 * (words/row-line.ts). Pure: the server's list read hands it each step's message and the workspace's messages.
 */
import type { ChannelsReady } from "../broadcasts/reach-for";
import type { CampaignMessage } from "../templates/campaign-message";
import { messageCarriedNowhere } from "../templates/carried-nowhere";
import { languageName } from "../templates/languages";
import type { SequenceMessageOffDto, SequenceRowDto } from "./dto";
import { MESSAGE_OFF_WORDS } from "./words/stopped-message";

/** A step that sends a message, as the list read hands it: its place, its message's name and language, its channels. */
export interface StepMessageRef {
  place: number;
  name: string;
  language: string;
  channels: readonly string[];
}

/** Why one step's message cannot go, or null where it can. */
function offOf(step: StepMessageRef, messages: readonly CampaignMessage[]): SequenceMessageOffDto["why"] | null {
  const named = messages.filter((m) => m.name === step.name);
  if (named.length === 0) return "gone";
  const inLanguage = named.find((m) => m.language === step.language);
  if (!inLanguage) return "no_version";
  // WhatsApp's no stops a step that goes by WhatsApp: the Messages list's own reading of a version WhatsApp holds.
  const whatsapp = step.channels.includes("whatsapp") ? inLanguage.versions.whatsapp : null;
  if (whatsapp?.status === "rejected") return "refused";
  if (whatsapp?.status === "paused" || whatsapp?.status === "disabled") return "paused";
  return null;
}

/** The first step of a sequence whose message cannot go, by place, and why; null where every step's can. */
export function sequenceMessageOff(
  steps: readonly StepMessageRef[],
  messages: readonly CampaignMessage[],
): SequenceMessageOffDto | null {
  for (const step of [...steps].sort((a, b) => a.place - b.place)) {
    const reason = offOf(step, messages);
    if (reason) return { place: step.place, why: reason, language: step.language };
  }
  return null;
}

/** What the row says of it: which step, and why its message cannot go. One word for WhatsApp's no: refused. */
export function messageOffLine(off: SequenceMessageOffDto): string {
  const step = `step ${off.place}’s message`;
  switch (off.why) {
    case "refused":
      return `WhatsApp refused ${step}`;
    case "paused":
      return `WhatsApp paused ${step}`;
    case "no_version":
      return `Step ${off.place}’s message has no ${languageName(off.language)} version`;
    case "gone":
      return `Step ${off.place}’s message is gone · pick another`;
  }
}

/**
 * What the step itself says of it, where the row names the step: on its box, the reading and the press that fixes it (its
 * sheet opens on its message, where WhatsApp's no stands with its reason and AI writes new words as it opens, the pane's
 * own, templates/version-editor.tsx); in its sheet's Now row,
 * what it means for the sends, since the message above already says WhatsApp's no. A step that goes by another channel too
 * still sends there, so the sheet says what WhatsApp holds back, never that nothing goes.
 */
export function stepOffLine(off: SequenceMessageOffDto, where: "box" | "sheet"): string {
  const box = where === "box";
  switch (off.why) {
    case "refused":
      return box ? MESSAGE_OFF_WORDS.refused : "Not on WhatsApp until it approves new words";
    case "paused":
      return box ? MESSAGE_OFF_WORDS.paused : "Not on WhatsApp while WhatsApp pauses it";
    case "no_version":
      return `It has no ${languageName(off.language)} version`;
    case "gone":
      return "Its message is gone · pick another";
  }
}

/**
 * What a sequence and its step say where a message it sends waits for a channel to carry it (call C13): quietly, as the
 * Messages list said "Waiting", never as needing you, since it goes by itself once a channel can.
 */
export const MESSAGE_WAITS_WORDS = {
  row: "Waiting · nothing can carry its message yet",
  step: "Waiting · nothing can carry it here yet",
} as const;

/**
 * Whether a running sequence sends a message that nothing can carry here now (templates/carried-nowhere.ts), by the
 * messages its steps send in their languages, each judged by the channels its step goes by, as the step's own sheet
 * judges it (a message that could go by email does not carry a step that goes by WhatsApp alone): what its row says
 * quietly. False where the business's channels or its messages were not read.
 */
export function sequenceMessageWaits(
  row: Pick<SequenceRowDto, "state" | "messages">,
  messages: readonly CampaignMessage[] | null,
  ready: ChannelsReady | null,
): boolean {
  if (row.state !== "on" || !messages || !ready) return false;
  return (row.messages ?? []).some((step) =>
    messageCarriedNowhere(
      ready,
      messages.find((m) => m.name === step.name && m.language === step.language) ?? null,
      step.channels ?? null,
    ),
  );
}
