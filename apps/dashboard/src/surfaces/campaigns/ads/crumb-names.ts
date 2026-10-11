/**
 * The names of the ads the Ads page holds, for the frame's crumb (MOCKUP until the wiring lane reads real ones): the store
 * remembers them on every read, and `campaigns/routes.ts` asks for one by id. It imports nothing, so the route chunk the frame
 * loads for every page holds no sample and no model: a crumb names an ad the page has read, else it names none.
 */
const NAMES = new Map<string, string>();

/** The ads the page now holds, by id: what a renamed ad's crumb follows. */
export function rememberAdNames(ads: readonly { id: string; name: string }[]): void {
  NAMES.clear();
  for (const ad of ads) NAMES.set(ad.id, ad.name);
}

/** The name of an ad the page has read, or null where it has read none by that id. */
export const adNameOf = (id: string): string | null => NAMES.get(id) ?? null;
