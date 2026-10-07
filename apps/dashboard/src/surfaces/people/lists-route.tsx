/**
 * A list's own address, `/w/<slug>/lists/<id>` (decision 0015, condition 6: the route says the product's word): on a real
 * workspace Lists is a view of People, so the address lands on People with that list picked, by People's own rule
 * (plListRoute: `clients/list:<id>` for a kept one, `clients/seg:<id>` for a smart one, its own address for one People
 * doesn't have), so Playbooks' list, an answer's jump and a kept address still arrive. Replaced, not pushed, so Back leaves
 * People rather than bouncing through the old route. A cold load draws the shell's own reading pane until People's surface
 * has landed, which says which list an id names; a demo session keeps the mockup's seeded Lists page (the frame's table).
 */
import { useEffect, useRef } from "react";
import { routeOfPath } from "@chanlytics/contracts";
import { goToRoute } from "@/legacy-bridge/workspace";
import { useSurface } from "../use-surface";
import { plListRoute } from "./words";

export function ListsRoute({ pathname }: { pathname: string | null }) {
  const route = routeOfPath(pathname) ?? "segments";
  const id = route.includes("/") ? route.slice(route.indexOf("/") + 1) : "";
  const people = useSurface("people");
  // Once for the list an address names: a later page of People, or its refresh, does not replace the address again.
  const went = useRef<string | null>(null);
  useEffect(() => {
    if (!people || went.current === id) return;
    went.current = id;
    goToRoute(plListRoute(id), { replace: true });
  }, [people, id]);
  return (
    <div className="route-reading" role="status">
      Reading…
    </div>
  );
}
