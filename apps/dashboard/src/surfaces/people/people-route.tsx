/**
 * People's page on its App Router route (`/w/<slug>/people`, decision 0015): the address's view picked by the param the
 * way the frame's rows picked it -- the New list door, a smart list, a list kept by hand, a state, else everyone -- and the
 * one page drawn for them all. A move between two of its addresses is a pushed or replaced entry, never a request for the
 * page that is drawn (workspace.ts goToRoute), so the page follows its address here (the path the App Router page hands it), and it mounts afresh
 * where the frame did: for an address it did not write itself (a link, Back), never for one it did (the list picked, said
 * in the path by usePeopleAddress), which is the page's own state saying where it stands. Its Leads scope (`clients/leads…`)
 * is one mount across every view of it: the Leads page follows its own address (../leads/page/leads-real.tsx).
 */
import { useRef } from "react";
import { routeOfPath } from "@chanlytics/contracts";
import { demoSession, navigate } from "../legacy-verbs";
import { useSurface } from "../use-surface";
import { takeOwnAddress } from "./page/own-address";
import { usePeopleStanding } from "./page/people-head";
import { PeopleReal } from "./page/people-real";
import { LeadsReal } from "../leads/page/leads-real";
import { PipelineScope } from "./pipeline/scope";
import { addressReplace } from "./shell-verbs";
import { isPersonParam } from "./chrome";
import { ClientProfile } from "./person/person-real";

/** What the address names of the page's view: the props the rows gave the page. */
function viewOf(param: string) {
  if (param === "new-list") return { newList: true };
  if (!/^(seg|list|state):/.test(param)) return {};
  const kind = param.slice(0, param.indexOf(":"));
  return {
    initialSegment: kind === "seg" ? param.slice(4) : null,
    initialSaved: kind === "list" ? param.slice(5) : null,
    initialState: kind === "state" ? param.slice(6) : null,
  };
}

/** What the frame mounted a route under: the Pipeline's address family is one mount (where deals are off its addresses draw People), every other view its own. */
const mountOf = (route: string): string =>
  route === "clients/pipeline" || route.startsWith("clients/pipeline:") ? "clients/pipeline" : route;

/** The page mounts afresh when the address moves to one it did not write itself, as the frame remounted a view it was told of. */
function useMountKey(route: string): number {
  const last = useRef(route);
  const mounts = useRef(0);
  if (last.current !== route) {
    const own = takeOwnAddress(route);
    if (!own && mountOf(last.current) !== mountOf(route)) mounts.current += 1;
    last.current = route;
  }
  return mounts.current;
}

/**
 * A page that follows its own address moves it (the Pipeline, Leads): a push, or a replace where the cursor walks the peek
 * on (Back leaves the page, not each step). The replace is the address's own: the shell's `nav` takes a route alone.
 */
const ownGo = (to: string, opts?: { replace?: boolean }) =>
  opts?.replace ? addressReplace(to, { quiet: true }) : navigate(to);

/**
 * People › Leads: the same page, its other scope, drawn once the Leads surface has landed. The address carries the view
 * (clients/leads:s-<search>:l-<list>:c-<class>:p-<lead>), and the page follows it as a prop, under one mount.
 */
function LeadsScopePage({ param }: { param: string }) {
  const leads = useSurface("leads");
  return leads ? (
    <LeadsReal key="leads" leadsRoute={param} onNavigate={ownGo} onOpenProfile={(id) => navigate(`clients/${id}`)} />
  ) : null;
}

export function PeopleRoute({ pathname }: { pathname: string | null }) {
  const route = routeOfPath(pathname) ?? "clients";
  const param = route.includes("/") ? route.slice(route.indexOf("/") + 1) : "";
  const live = useSurface("people");
  const mount = useMountKey(route);
  const person = !!param && isPersonParam(param);
  const leads = /^leads(:|$)/.test(param);
  // The Pipeline's address draws the Pipeline where deals are on, and People's own page where they are off (0008).
  const pipeline = /^pipeline(:|$)/.test(param) && !!live?.dealsOn;
  // What the page says to the frame's head in Glass: People's standing; a person's page that its hero is the head (the
  // frame draws the date's place as the way back). The Pipeline says its own, with its act (pipeline/standing.tsx).
  // Leads says its own too, in its standing line (rail/standing.tsx).
  usePeopleStanding(person ? "person" : pipeline || leads ? null : "people");
  // A person's page reads the person itself (people-detail.ts) and never waits for People's rows; it is a new mount per person.
  if (person) return <ClientProfile key={param} id={param} />;
  if (leads) return <LeadsScopePage param={param} />;
  // A workspace's People waits for its own surface (the frame's gate); a demo session draws the sample.
  if (!live && !demoSession()) return null;
  if (pipeline)
    return (
      <PipelineScope
        key="pipeline"
        pipelineRoute={param}
        onNavigate={ownGo}
        onOpenProfile={(id) => navigate(`clients/${id}`)}
      />
    );
  return (
    <PeopleReal
      key={mount}
      {...viewOf(param)}
      onNavigate={navigate}
      onOpenProfile={(id) => navigate(`clients/${id}`)}
    />
  );
}
