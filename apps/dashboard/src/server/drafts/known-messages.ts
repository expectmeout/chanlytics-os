/**
 * The business's own messages the AI's drafter is offered (the one picker rule, 15 Nov 2026): what a sequence's step
 * editor and New list, by the same function (lib/pickable-messages.ts pickableMessages), each keyed for the model and
 * drawn from the row of the first channel it goes by. It decided alone before, and offered no message whose WhatsApp
 * words were being checked, even one that holds an email. One being checked is among them now (`beingChecked`): a send and a
 * sequence's run wait for that check, and the drafter is told it goes there once approved. The ready-made starters
 * follow them (drafts/known-starters.ts).
 */
import "server-only";
import { defaultSlotKinds, slotLabels, type CampaignMessage, type CampaignMessageRow } from "@chanlytics/contracts";
import { pickableMessages } from "@/lib/pickable-messages";
import type { KnownMessage } from "../campaigns/sequences/draft-judge";

/** The composers' read as the drafter takes it: its rows, and the messages made of every row. */
export interface KnownMessagesRead {
  templates: (CampaignMessageRow & { variables: unknown; body_preview?: string | null })[];
  messages: CampaignMessage[];
}

/** The messages a step may send, each keyed for the model in the order the read holds them. */
export function knownMessagesOf(read: KnownMessagesRead): KnownMessage[] {
  return pickableMessages(read.templates, read.messages).map(({ message, channels, row, checking }, at) => ({
    key: `k${at + 1}`,
    templateId: row.id,
    title: message.title,
    body: (row.body_preview ?? "").trim(),
    offer: message.purpose === "marketing",
    // In the order a draft says its channels: WhatsApp, email, text.
    channels: (["whatsapp", "email", "sms"] as const).filter((channel) => channels.includes(channel)),
    slots: defaultSlotKinds(row),
    labels: slotLabels(row),
    ...(checking ? { beingChecked: true } : {}),
  }));
}
