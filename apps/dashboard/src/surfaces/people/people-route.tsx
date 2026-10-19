/**
 * People's page on its App Router route (`/w/<slug>/people`, decision 0015): the address's view picked by the param the
 * way the frame's rows picked it -- the New list door, a smart list, a list kept by hand, a state, else everyone -- and the
 * one page drawn for them all. A move between two of its addresses is a pushed or replaced entry, never a request for the
 * page that is drawn (workspace.ts goToRoute), so the page follows its address here (the path the App Router page hands it), and it mounts afresh
 * where the frame did: for an address it did not write itself (a link, Back), never for one it did (the list picked, said
 * in the path by usePeopleAddress), which is the page's own state saying where it stands. Its Leads scope (`clients/leads…`)
 * is one mount across every view of it: the Leads page follows its own address (../leads/page/leads-real.tsx).
 */
import { useEffect, useRef, useState } from "react";
import { addressOf, parsePeopleRoute, peopleRoute, personRouteOf, routeOfPath } from "@chanlytics/contracts";
import { demoSession, navigate } from "../legacy-verbs";
import { usePartShown, useSurface } from "../use-surface";
import { takeOwnAddress } from "./page/own-address";
import { usePeopleStanding } from "./page/people-head";
import { PeopleReal } from "./page/people-real";
import { PipelineScope } from "./pipeline/scope";
import { addressReplace } from "./shell-verbs";
import { isPersonParam } from "./chrome";
import { ClientProfile } from "./person/person-real";

/**
 * What the address names of the page's view (contracts parsePeopleRoute): the props the rows gave the page, and the
 * person peeked at over it on a desk (`:p-<id>`), which the page follows as it follows its own address.
 */
function viewOf(param: string) {
  if (param === "new-list") return { newList: true };
  const at = parsePeopleRoute(`clients/${param}`);
  if (!at) return {};
  const view = at.view ?? "";
  const kind = view.slice(0, view.indexOf(":"));
  const id = view.slice(view.indexOf(":") + 1);
  return {
    initialSegment: kind === "seg" ? id : null,
    initialSaved: kind === "list" ? id : null,
    initialState: kind === "state" ? id : null,
    initialPeek: at.peek,
  };
}

/**
 * What the frame mounted a route under: the Pipeline's address family is one mount, a view of People is one with or
 * without a person peeked over it (Everyone, bare or `state:all`), and every other view its own.
 */
function mountOf(route: string): string {
  if (route === "clients/pipeline" || route.startsWith("clients/pipeline:")) return "clients/pipeline";
  const at = parsePeopleRoute(route);
  return at ? peopleRoute({ view: at.view }) : route;
}

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
  // Leads' page is a chunk of its own, asked for as its address opens, while the surface it waits for is read: People's
  // first load carries none of it (the page's ceiling, tooling/scripts/checks/bundle-budget.mjs, 11 Oct 2026).
  const [, landed] = useState(0);
  useEffect(() => {
    if (!leadsModule) void loadLeads().then(() => landed((n) => n + 1));
  }, []);
  const Page = leadsModule?.LeadsReal;
  // Leads' first part (client/page-speed.ts): its rows drawn, which wait for both its read and its chunk.
  usePartShown("leads", "table", !!(leads && Page));
  return leads && Page ? (
    <Page
      key="leads"
      leadsRoute={param}
      onNavigate={ownGo}
      onOpenProfile={(id) => navigate(addressOf({ kind: "person", id }))}
    />
  ) : null;
}

type LeadsModule = Pick<typeof import("../leads/page/leads-real"), "LeadsReal">;
let leadsModule: LeadsModule | null = null;
let leadsLoading: Promise<LeadsModule> | null = null;

/** Leads' page, loaded once for the tab, where it is first drawn. */
function loadLeads(): Promise<LeadsModule> {
  // What it reads of the module is named, so the dead-exports check (knip) sees the use.
  leadsLoading ??= import("../leads/page/leads-real").then(({ LeadsReal }) => (leadsModule = { LeadsReal }));
  return leadsLoading;
}

export function PeopleRoute({ pathname }: { pathname: string | null }) {
  const route = routeOfPath(pathname) ?? "clients";
  const param = route.includes("/") ? route.slice(route.indexOf("/") + 1) : "";
  const live = useSurface("people");
  const mount = useMountKey(route);
  const person = !!param && isPersonParam(param);
  const leads = /^leads(:|$)/.test(param);
  // The Pipeline's address draws the Pipeline, every workspace's (0008, amended 18 Oct 2026).
  const pipeline = /^pipeline(:|$)/.test(param);
  // What the page says to the frame's head in Glass: a person's page that its hero is the head (the frame draws the date's
  // place as the way back). The Pipeline says its own, with its act (pipeline/standing.tsx); Leads says its own too, in its
  // standing line (rail/standing.tsx); and People's list says its own, with its act, Add a person (page/people-real.tsx).
  // Until the list can be drawn, the route says People's name.
  const listDrawn = !!live || demoSession();
  // A person's page says its own standing (person-real.tsx: its way back, and on a desk "‹ 4 of 24 ›" beside it).
  usePeopleStanding(person || pipeline || leads || listDrawn ? null : "people");
  // People's first part (client/page-speed.ts): its table, drawn once People's read is in. Its scopes say their own.
  usePartShown("people", "table", !!live && !person && !leads && !pipeline);
  // A person's page reads the person itself (people-detail.ts) and never waits for People's rows; it is a new mount per person,
  // and one mount across their tabs (`<id>/history`, 0052), which the page follows as a prop.
  if (person) {
    const at = personRouteOf(param);
    return <ClientProfile key={at.id} id={at.id} tab={at.tab} />;
  }
  if (leads) return <LeadsScopePage param={param} />;
  // A workspace's People waits for its own surface (the frame's gate); a demo session draws the sample.
  if (!listDrawn) return null;
  if (pipeline)
    return (
      <PipelineScope
        key="pipeline"
        pipelineRoute={param}
        onNavigate={ownGo}
        onOpenProfile={(id) => navigate(addressOf({ kind: "person", id }))}
      />
    );
  return (
    <PeopleReal
      key={mount}
      {...viewOf(param)}
      onNavigate={ownGo}
      onOpenProfile={(id) => navigate(addressOf({ kind: "person", id }))}
    />
  );
}
