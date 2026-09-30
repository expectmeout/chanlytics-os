/**
 * What the frame draws around People's page (moved from legacy/pages/app-routes.jsx drawPeople, drawPeopleView,
 * drawNewList and drawPipeline, decision 0015): which addresses under `clients` the page takes, and the crumbs, the mount
 * and the one act of each. The frame stays mounted around it (surfaces/routes.ts).
 */
import { surfaceValue } from "../surface-values";
import { demoSession } from "../legacy-verbs";
import { P } from "./pipeline/pipe";
import { peopleSample } from "./sample";
import type { PeopleSurface } from "./surface";
import { heldPerson } from "./person/read";

/** People's crumb: its own words, and back to the list. */
const PEOPLE_CRUMB = { label: "People", to: "clients" };

/**
 * A person's address, `clients/<id>`: any param that is not a scope (Leads, the Pipeline) or a view of People (the New
 * list door, a smart list, a list kept by hand, a state), as the frame's rows told them apart, in that order.
 */
export const isPersonParam = (param: string): boolean =>
  !/^(leads|pipeline)(:|$)/.test(param) && param !== "new-list" && !/^(seg|list|state):/.test(param);

/**
 * Which params of `clients` the page draws: a person, the New list door, a view of People (a smart list, a list kept by
 * hand, a state) and the Pipeline's address, which draws the Pipeline where deals are on and People where they are off.
 * Not Leads: the frame's table draws that.
 */
export const peopleTakes = (param: string): boolean =>
  isPersonParam(param) || param === "new-list" || /^(seg|list|state):/.test(param) || /^pipeline(:|$)/.test(param);

/** What People is, for a crumb: the surface once it has landed, else, in a demo, the sample the page draws. */
const peopleFor = (): PeopleSurface | undefined =>
  surfaceValue("people") ?? (demoSession() ? peopleSample() : undefined);

/** The words a view of People goes by in the crumbs: its list's own name, a state's, else what a list is called. */
function viewLabel(param: string): string {
  const P = peopleFor();
  const kind = param.slice(0, param.indexOf(":"));
  const segId = kind === "seg" ? param.slice(4) : null;
  const savedId = kind === "list" ? param.slice(5) : null;
  const stateId = kind === "state" ? param.slice(6) : null;
  const surfaceList = segId && P ? P.lists.find((l) => l.id === segId) : null;
  const savedMeta = savedId && P ? P.saved.find((l) => l.id === savedId) : null;
  if (surfaceList) return surfaceList.label;
  if (savedMeta) return savedMeta.name;
  if (stateId) return stateId.replace(/_/g, " ");
  return P ? "List" : "Segment";
}

/**
 * The crumbs of the Pipeline's address (0008): People's own where deals are off, where the address draws People; else
 * the Pipeline, and under it the view the rail picked (the crumb back to the Pipeline's own list, then the view's name).
 */
function pipelineCrumbs(param: string) {
  const people = surfaceValue("people");
  if (!people?.dealsOn) return ["People"];
  const at = P.parse(param);
  if (!at || at.view === "all") return [PEOPLE_CRUMB, "Pipeline"];
  return [PEOPLE_CRUMB, { label: "Pipeline", to: "clients/pipeline" }, P.viewLabel(at.view, people.dealPace ?? null)];
}

/**
 * A person's crumb: their name in People, else the copy this tab holds of them, else "Profile". The frame draws its crumbs
 * again when People lands (it reads the surface's value), so a profile opened cold names them once their row is here.
 */
function personName(id: string): string {
  const row = peopleFor()?.rows.find((r) => r.id === id);
  if (row) return row.name;
  const held = heldPerson(id);
  return held ? held.name : "Profile";
}

/**
 * The crumbs, the mount and the act of an address. The mount is one for every view of People and one for the Pipeline's
 * address, drawn as the Pipeline or, where deals are off, as People, because the page follows its own address
 * (people-route.tsx): a list picked is said in the path by the page, and a page mounted afresh for each would lose its
 * toast and its selection with every pick.
 */
export function peopleChrome({ param, backToPeople }: { param: string | null; backToPeople: unknown }) {
  if (!param) {
    // "Add client" opens the Ask overlay, which is demo theater; a real workspace gains people when they write or phone.
    return { crumbs: ["People"], mount: "clients", act: { ask: true, label: "Add client", glyph: "plus" } };
  }
  // Its People is the profile's own Back (on a phone the only one: the crumb says ‹ People and the page draws none). A person is
  // a mount of their own: the frame keys it by the whole route.
  if (isPersonParam(param)) return { crumbs: [{ ...PEOPLE_CRUMB, go: backToPeople }, personName(param)] };
  if (param === "new-list") return { crumbs: [PEOPLE_CRUMB, "New list"], mount: "clients" };
  if (/^pipeline(:|$)/.test(param)) return { crumbs: pipelineCrumbs(param), mount: "clients/pipeline" };
  return { crumbs: [PEOPLE_CRUMB, viewLabel(param)], mount: "clients" };
}
