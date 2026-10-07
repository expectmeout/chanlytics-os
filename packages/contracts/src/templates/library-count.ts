/**
 * How many templates the Library holds, said once (3 Oct 2026): the Library page's head and Campaigns' home, whose Library
 * act carries the same number, both call `libraryCount`, so the two cannot say different things of one list.
 *
 * A template is a row, one for each language it is written in, beside the emails a reach-out's chains send. Meta's own
 * sample lives in every account and is nobody's message, and a template the workspace hid is on file but not listed: neither
 * is counted.
 */

/** Meta's own sample, filed in every account: never listed, never counted. */
const LIBRARY_SAMPLES: ReadonlySet<string> = new Set(["hello_world"]);

/** Whether a template name is Meta's sample rather than a message of the workspace's. */
export const isLibrarySample = (name: string): boolean => LIBRARY_SAMPLES.has(name);

/** A template row, as far as the count reads it. */
interface CountedTemplate {
  name: string;
  hidden_at?: string | null;
}

/**
 * The Library's count: every row of WhatsApp the page lists (a language is a row) and every email a reach-out writes
 * (`emailRows`, which is none where the chains are unread or could not be). Null where the templates could not be read:
 * a read that failed is no zero.
 */
export function libraryCount(templates: readonly CountedTemplate[], emailRows: number): number;
export function libraryCount(
  templates: readonly CountedTemplate[] | null | undefined,
  emailRows: number,
): number | null;
export function libraryCount(
  templates: readonly CountedTemplate[] | null | undefined,
  emailRows: number,
): number | null {
  if (!templates) return null;
  return templates.filter((t) => !isLibrarySample(t.name) && !t.hidden_at).length + emailRows;
}
