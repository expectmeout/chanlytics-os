/**
 * What the frame draws around People's page (moved from legacy/pages/app-routes.jsx drawPeople, drawPeopleView,
 * drawNewList and drawPipeline, decision 0015): which addresses under `clients` the page takes, and the crumbs, the mount
 * and the one act of each. The frame stays mounted around it (surfaces/routes.ts).
 */
import {
  GET_YES_PARAM,
  GET_YES_WORDS,
  PERSON_ABOUT_WORDS,
  PERSON_STATE_LABELS,
  isIdentifierName,
  parseLeadsRoute,
  parsePeopleRoute,
  personRouteOf,
  shortName,
} from "@chanlytics/contracts";
import { demoCode } from "./hooks/demo";
import { surfaceValue } from "../surface-values";
import { demoSession } from "../legacy-verbs";
import { P } from "./pipeline/pipe";
import type { PeopleSurface } from "./surface";
import { heldPerson } from "./person/read";
import type { SurfaceViews } from "../routes";
import { plScopeRoute, plScopes } from "./words";

/** People's crumb: its own words, and back to the list. */
const PEOPLE_CRUMB = { label: "People", to: "clients" };

/**
 * A person's address, `clients/<id>`: any param that is not a scope (Leads, the Pipeline) or a view of People (the New
 * list door, Get their yes, a smart list, a list kept by hand, a state), as the frame's rows told them apart, in that order.
 */
export const isPersonParam = (param: string): boolean =>
  !/^(leads|pipeline)(:|$)/.test(param) &&
  param !== "new-list" &&
  param !== GET_YES_PARAM &&
  !/^(seg|list|state):/.test(param);

/**
 * Which params of `clients` the page draws: a person, the New list door, a view of People (a smart list, a list kept by
 * hand, a state), the Pipeline's address, which draws the Pipeline in every workspace, and Leads (`leads` and every view
 * of it).
 */
export const peopleTakes = (param: string): boolean =>
  isPersonParam(param) ||
  param === "new-list" ||
  param === GET_YES_PARAM ||
  /^(seg|list|state):/.test(param) ||
  /^(pipeline|leads)(:|$)/.test(param);

/**
 * A demo's People (sample.ts), once its code is in. Only a demo session's crumbs read it here, and the sample is built
 * from every part of a person's page, so it is fetched as a demo first asks rather than carried by every page's first
 * load (the loadability review, 19 Oct 2026); the crumb names its list or person from the next draw.
 */
function demoPeopleNow(): PeopleSurface | undefined {
  const sample = demoCode.now();
  if (sample) return sample.demoPeople();
  demoCode.warm();
  return undefined;
}

/** What People is, for a crumb: the surface once it has landed, else, in a demo, the sample the page draws. */
const peopleFor = (): PeopleSurface | undefined =>
  surfaceValue("people") ?? (demoSession() ? demoPeopleNow() : undefined);

/**
 * The words a view of People goes by in the crumbs, by its token alone (`seg:<id>`, `list:<id>`, `state:<tab>`, never
 * the person peeked over it): its list's own name, a state's, else what a list is called.
 */
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
  // A state is named by its words, the pill's and the list's (contracts PERSON_STATE_LABELS): "You have it", not its key's "waiting on you".
  if (stateId) return (PERSON_STATE_LABELS as Record<string, string>)[stateId] ?? stateId.replace(/_/g, " ");
  return P ? "List" : "Segment";
}

/**
 * The crumbs of the Pipeline's address (0008): the Pipeline, and under it the view the rail picked (the crumb back to
 * the Pipeline's own list, then the view's name).
 */
function pipelineCrumbs(param: string) {
  const people = surfaceValue("people");
  const at = P.parse(param);
  if (!at || at.view === "all") return [PEOPLE_CRUMB, "Pipeline"];
  return [PEOPLE_CRUMB, { label: "Pipeline", to: "clients/pipeline" }, P.viewLabel(at.view, people?.dealPace ?? null)];
}

/**
 * The crumbs of a Leads address: People, then Leads, and under it the search the view is of, by its name, once the Leads
 * surface holds it.
 */
function leadsCrumbs(param: string) {
  const leads = surfaceValue("leads");
  const at = parseLeadsRoute(param);
  const search = leads && at && at.searchId ? leads.searches.find((s) => s.id === at.searchId) : null;
  return search ? [PEOPLE_CRUMB, { label: "Leads", to: "clients/leads" }, search.name] : [PEOPLE_CRUMB, "Leads"];
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
 * The top bar's Ask on a person's page (canvas A): about them by their first name, a stand-in's business whole, and
 * Ask's own words for someone known only by a number or not read yet.
 */
function personAsk(id: string): string | null {
  const p = peopleFor()?.rows.find((r) => r.id === id) ?? heldPerson(id);
  if (!p || isIdentifierName(p.name)) return null;
  return PERSON_ABOUT_WORDS.askAbout(p.standIn ? p.name : shortName(p.name));
}

/**
 * People | Leads | Pipeline, the page's scopes, as the views the frame draws (PRD 6.1), every workspace's. None until
 * People has landed, so the strip is drawn once.
 */
function scopeViews(picked: "people" | "leads" | "pipeline"): SurfaceViews | null {
  const people = peopleFor();
  if (!people) return null;
  const tabs = plScopes().map((s) => ({
    id: s.id,
    label: s.label,
    to: plScopeRoute(s.id),
    testid: `scope-${s.id}`,
  }));
  return { name: "people", label: "Which people", testid: "people-scope", picked, tabs };
}

/**
 * The crumbs, the mount, the act and the views of an address. The mount is one for People's three scopes, every view of
 * People, the Pipeline's address and every view of Leads, because the page keeps the three mounted and shows the one asked
 * for (people-route.tsx, the strips review of 18 Oct 2026): a scope pressed is drawn as it was left, and its move is the
 * page's own, inside the frame's view. It follows its own address too: a list picked is said in the path by the page, and a
 * page mounted afresh for each would lose its toast and its selection with every pick.
 */
export function peopleChrome({ param, backToPeople }: { param: string | null; backToPeople: unknown }) {
  // Everyone, with or without a person peeked over it (`state:all:p-<id>`): the list's own chrome.
  const at = param ? parsePeopleRoute(`clients/${param}`) : null;
  if (!param || (at && !at.view)) {
    // "Add client" opens the Ask overlay, which is demo theater; a real workspace gains people when they write or phone.
    return {
      crumbs: ["People"],
      mount: "clients",
      act: { ask: true, label: "Add client", glyph: "plus" },
      views: scopeViews("people"),
    };
  }
  // Its People is the profile's own Back (on a phone the only one: the crumb says ‹ People and the page draws none). A person is
  // People's mount too: their page is drawn over the list it was opened from, which stays where it was under it and is there
  // again, as it was left, when they go (people-route.tsx; Ruben, 20 Oct 2026). Each person is a page of their own inside it,
  // and their tabs (`<id>/history`, 0052) are their page too.
  if (isPersonParam(param)) {
    const { id } = personRouteOf(param);
    return {
      crumbs: [{ ...PEOPLE_CRUMB, go: backToPeople }, personName(id)],
      mount: "clients",
      ask: personAsk(id),
    };
  }
  if (param === GET_YES_PARAM)
    return { crumbs: [PEOPLE_CRUMB, GET_YES_WORDS.title], mount: "clients", views: scopeViews("people") };
  if (param === "new-list")
    return { crumbs: [PEOPLE_CRUMB, "New list"], mount: "clients", views: scopeViews("people") };
  if (/^pipeline(:|$)/.test(param)) {
    return {
      crumbs: pipelineCrumbs(param),
      mount: "clients",
      views: scopeViews("pipeline"),
    };
  }
  // Every view of Leads is People's mount: the page follows its address (`p-<lead>` is the lead open over the view).
  if (/^leads(:|$)/.test(param)) return { crumbs: leadsCrumbs(param), mount: "clients", views: scopeViews("leads") };
  // A view of People, with or without a person peeked over it: named by its token.
  return { crumbs: [PEOPLE_CRUMB, viewLabel(at?.view ?? param)], mount: "clients", views: scopeViews("people") };
}
