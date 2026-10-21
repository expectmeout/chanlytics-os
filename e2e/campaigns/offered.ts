import {
  campaignMessagesOf,
  isLibrarySample,
  type CampaignMessage,
  type CampaignMessageRow,
} from "../../packages/contracts/src/index";

/**
 * What the Campaigns specs expect the pages to draw of the workspace's messages, worked out from the rows by the rules
 * contracts holds and the pages apply, so the same expectation holds on a workspace with a WhatsApp number and on one with
 * none: a message is a name in a language with a version on each channel it was written for (campaignMessagesOf), and a
 * message needs no WhatsApp row. Nothing here assumes a channel.
 */

/** A template row as GET /api/v1/templates answers it, as far as a picker reads it. */
export interface TemplateRow extends CampaignMessageRow {
  variables: unknown;
  source?: string | null;
}

/** GET /api/v1/templates's body, as far as the composers and the Library read it. */
export interface TemplatesRead {
  templates: TemplateRow[];
  /**
   * The messages the route makes of EVERY row of the workspace, a WhatsApp version still in review among their versions;
   * where the answer holds none, messagesOf makes them of `templates`.
   */
  messages?: CampaignMessage[];
}

/**
 * The workspace's messages: the route's own where it answers them, else made of the rows it answered, as the pages do
 * (parts/channels.ts cmOfferedMessages). The route's are the ones to read, because a message's standing is in rows the
 * composers' list leaves out: a message whose WhatsApp version the workspace hid is hidden whole, and one whose WhatsApp
 * version is still in review is offered by the email beside it, which the rows the list keeps (approved, not hidden) cannot tell.
 */
export const messagesOf = (read: TemplatesRead): CampaignMessage[] =>
  read.messages ?? campaignMessagesOf(read.templates);

/**
 * What the Library lists of the workspace's messages (templates/group.ts listingOf): a row to each starter of the set
 * offered here, whatever of it the workspace holds; a row to each name the workspace wrote or synced, whatever languages and
 * channels it holds, and a fold for what it hid. Meta's sample is never one.
 */
export function libraryRows(
  messages: readonly CampaignMessage[],
  starterNames: readonly string[],
): { starterRows: number; customRows: number; hidden: boolean } {
  const written = messages.filter((m) => !isLibrarySample(m.name) && !starterNames.includes(m.name));
  return {
    starterRows: starterNames.length,
    customRows: new Set(written.filter((m) => !m.hidden).map((m) => m.name)).size,
    hidden: written.some((m) => m.hidden),
  };
}
