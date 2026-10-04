/**
 * People's parts the shell still draws by name, for the e2e harness's People record (the pipeline scenario).
 *
 * People's page is an App Router page, which only the app draws, and so are its Leads scope, the Pipeline and a person's
 * page; what the harness's mockup still draws of People is the shell's own: the strip's scopes and the deal and step sheets
 * (surfaces/people/people-globals.ts). They are TSX on the page's React, so they come in a bundle loaded after it
 * (serve-legacy.mjs `/data/people-globals-harness.js`), while the fixture (fixture-src.ts) boots People before React loads,
 * in a bundle of its own. Two bundles are two copies of the surface's store, so this one takes People from where the
 * fixture's runner puts it -- the window's `__PEOPLE`, and the event a surface lands on -- and holds it in its own, which is
 * what `usePeople` reads. Only in a record that has people.
 */
import { setSurfaceValue } from "@/surfaces/surface-values";
import type { PeopleSurface } from "@/surfaces/people/surface";

export { PEOPLE_GLOBALS } from "@/surfaces/people/people-globals";

type PeopleWindow = Window & { __PEOPLE?: PeopleSurface };

/** The People the fixture's runner published, held for the parts that read it, now and each time it lands again. */
export function followPeople(w: PeopleWindow): void {
  const hold = () => {
    if (w.__PEOPLE) setSurfaceValue("people", w.__PEOPLE);
  };
  w.addEventListener("surface:clients", hold);
  w.addEventListener("surface:people", hold);
  hold();
}
