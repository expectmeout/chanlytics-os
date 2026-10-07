/**
 * How many messages the Library holds, said once (3 Oct 2026): the Library page's head and Campaigns' home, whose Library
 * act carries the same number, both call `libraryCount`, so the two cannot say different things of one list.
 *
 * A message is a name in a language (contracts campaignMessagesOf), with a version on whichever channels it was written
 * for and perhaps none on WhatsApp, so a message written for email alone counts as one; it is counted beside the emails a
 * reach-out's chains send. Meta's own sample lives in every account and is nobody's message, and a message the workspace
 * hid is on file but not listed: neither is counted.
 */
import type { CampaignMessage } from "./campaign-message";

/** Meta's own sample, filed in every account: never listed, never counted. */
const LIBRARY_SAMPLES: ReadonlySet<string> = new Set(["hello_world"]);

/** Whether a template name is Meta's sample rather than a message of the workspace's. */
export const isLibrarySample = (name: string): boolean => LIBRARY_SAMPLES.has(name);

/** A message, as far as the count reads it. */
type CountedMessage = Pick<CampaignMessage, "name" | "hidden">;

/**
 * The Library's count: every message the page lists (one a name and language, whatever channels it has versions on) and
 * every email a reach-out writes (`emailRows`, which is none where the chains are unread or could not be). Null where the
 * messages could not be read: a read that failed is no zero.
 */
export function libraryCount(messages: readonly CountedMessage[], emailRows: number): number;
export function libraryCount(messages: readonly CountedMessage[] | null | undefined, emailRows: number): number | null;
export function libraryCount(messages: readonly CountedMessage[] | null | undefined, emailRows: number): number | null {
  if (!messages) return null;
  return messages.filter((m) => !isLibrarySample(m.name) && !m.hidden).length + emailRows;
}
