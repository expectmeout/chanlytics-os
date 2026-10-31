/**
 * People, on the workspace's actual contacts (moved whole from legacy/pages/people.jsx PeopleReal, decision 0015): the same
 * markup and classes as the mockup's page, every number a column fact from the People surface (useSurface("people")), fed
 * by the People override on the SurfaceData seam and derived by the tested rule in contracts. Nothing here scores,
 * estimates or invents: no health, no LTV, no visits, no therapist. PeopleReal is its hooks (state.ts), what it says to the
 * frame's head (people-head.tsx: its name, its sentence and its act) and to the bar (its search, page-search.ts), and the
 * elements it returns, one concern to a function (screen.tsx).
 */
import { BAR_LINE_WORDS } from "@chanlytics/contracts";
import { usePageSearch } from "../../page-search";
import { asScopeView } from "../scope-view";
import { usePeopleStanding } from "./people-head";
import { peopleAct, peopleScreen } from "./screen";
import { usePeopleState } from "./state";
import type { PeopleRealProps } from "./state";

export function PeopleReal(props: PeopleRealProps) {
  const s = usePeopleState(props);
  // The list says People's standing to the frame's head itself, since its act is the page's (Add a person, on a desk).
  usePeopleStanding("people", peopleAct(s));
  // On a desk the list's search is the bar's line (page-search.ts); a phone's is the box in its bar.
  usePageSearch(s.phone ? null : { label: BAR_LINE_WORDS.people, value: s.q, onValue: s.setQ, inputRef: s.searchRef });
  // A scope People's page keeps: its root is the deck's view (scope-view.ts).
  return asScopeView(peopleScreen(s), props.scopeView);
}
