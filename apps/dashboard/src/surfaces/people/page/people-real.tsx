/**
 * People, on the workspace's actual contacts (moved whole from legacy/pages/people.jsx PeopleReal, decision 0015): the same
 * markup and classes as the mockup's page, every number a column fact from the People surface (useSurface("people")), fed
 * by the People override on the SurfaceData seam and derived by the tested rule in contracts. Nothing here scores,
 * estimates or invents: no health, no LTV, no visits, no therapist. PeopleReal is its hooks (state.ts) and the elements it
 * returns, one concern to a function (screen.tsx).
 */
import { peopleScreen } from "./screen";
import { usePeopleState } from "./state";
import type { PeopleRealProps } from "./state";

export function PeopleReal(props: PeopleRealProps) {
  return peopleScreen(usePeopleState(props));
}
