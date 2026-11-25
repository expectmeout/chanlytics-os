/**
 * THE messages a campaign's picker lists (the one picker rule; the review of 15 Nov 2026). A sequence's step editor, New
 * and the AI's drafter each decided alone which messages to list, which channels each goes by and which row its words
 * come from, so one listed a message the Messages list hides (made in WhatsApp's own tools in a shape this product cannot
 * send whole), another dropped a message whose WhatsApp words were being checked though it holds an email, and none
 * listed one that is only being checked, though a send and a sequence's run now wait for that check.
 *
 * Here they read one answer: every message a picker may list (contracts `offered`, which is messageGoesBy), with the
 * channels it goes by, the row its words are drawn from, and whether WhatsApp is still checking it. Pure, and safe in
 * the browser: the pages' pickers (surfaces/campaigns/parts/channels.ts), the AI's drafter (server/drafts/sequence.ts),
 * the AI's own read (server/ask/tools/read/campaigns/offered.ts) and the templates reader that hands them their rows
 * (server/readers/templates.ts) all call it.
 */
import {
  campaignMessagesOf,
  messageGoesBy,
  messageHolds,
  templateOffered,
  type CampaignMessage,
  type CampaignMessageRow,
  type ConsentChannel,
} from "@chanlytics/contracts";

/** A message a picker lists, as the picker reads it. */
interface PickableMessage<Row> {
  message: CampaignMessage;
  /** The channels it goes by: those it can be sent on now, and WhatsApp while WhatsApp is still checking its words. */
  channels: ConsentChannel[];
  /** The row its words are drawn from: its version on the first of those channels, in the product's order, the rows hold. */
  row: Row;
  /** WhatsApp is still checking its WhatsApp version: whoever it reaches only by WhatsApp gets it once approved. */
  checking: boolean;
}

/**
 * The rows a campaign's picker is handed, of every row a read holds: the approved ones the workspace has not hidden
 * (contracts templateOffered, which the Inbox's pickers keep to: they send now), then the WhatsApp rows WhatsApp is still
 * checking of the messages a picker lists. The templates reader hands the server's pickers these, and the settings read
 * makes the pages' of them (surfaces/offered-templates.ts), so both draw one being checked from its WhatsApp words.
 */
export function pickerRows<Row extends CampaignMessageRow>(
  rows: readonly Row[],
  messages: readonly CampaignMessage[] = campaignMessagesOf(rows),
): Row[] {
  const checked = pickableMessages(rows, messages).flatMap((picked) => (picked.checking ? [picked.row] : []));
  return [...rows.filter(templateOffered), ...checked];
}

/** Whether WhatsApp is still checking a message's WhatsApp words: it goes by WhatsApp (messageGoesBy), and not yet. */
export const isBeingChecked = (message: Pick<CampaignMessage, "versions">): boolean =>
  messageGoesBy(message).includes("whatsapp") && !messageHolds(message).whatsapp;

/**
 * The messages a picker lists. `rows` is every row the read holds, whatever its standing: which of them a message is
 * drawn from is said here, so a row WhatsApp refused is never one. `messages` are the messages made of every row, where
 * the read carries them; else they are made of the rows. A message none of whose rows the read holds is left out.
 */
export function pickableMessages<Row extends CampaignMessageRow>(
  rows: readonly Row[],
  messages: readonly CampaignMessage[] = campaignMessagesOf(rows),
): PickableMessage<Row>[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return messages.flatMap((message) => {
    if (!message.offered) return [];
    const channels = messageGoesBy(message);
    const row = channels.flatMap((channel) => byId.get(message.versions[channel]?.id ?? "") ?? []).at(0);
    return row ? [{ message, channels, row, checking: isBeingChecked(message) }] : [];
  });
}
