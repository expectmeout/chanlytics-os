/**
 * People's page on its App Router route (`/w/<slug>/people`, decision 0015): the address's view picked by the param the
 * way the frame's rows picked it -- the New list door, a smart list, a list kept by hand, a state, else everyone -- and the
 * one page drawn for them all. A move between two of its addresses is a pushed or replaced entry, never a request for the
 * page that is drawn (workspace.ts goToRoute), so the page follows its address here (the path the App Router page hands it), and it mounts afresh
 * where the frame did: for an address it did not write itself (a link, Back), never for one it did (the list picked, said
 * in the path by usePeopleAddress), which is the page's own state saying where it stands. Its Leads scope (`clients/leads…`)
 * is one mount across every view of it: the Leads page follows its own address (../leads/page/leads-real.tsx).
 *
 * Its three scopes, People, Leads and the Pipeline, are kept: each drawn the first time it is asked for and kept mounted
 * after, hidden under React's Activity while another is shown (the strips review, 18 Oct 2026). A scope pressed again is
 * drawn as it was left, its rows, its search, its selection and its place, with nothing to build or read; a hidden one keeps
 * none of its effects running (its keys, its timers) and is drawn again in the background as its surface moves. Each is a
 * view of the deck (scope-view.ts), so the scope arriving comes in from its tab's side and the one leaving goes by a copy.
 */
import { Activity, useEffect, useRef, useState, type ReactNode } from "react";
import {
  GET_YES_PARAM,
  GET_YES_ROUTE,
  addressOf,
  parsePeopleRoute,
  peopleRoute,
  personRouteOf,
  routeOfPath,
} from "@chanlytics/contracts";
import { demoSession, navigate } from "../legacy-verbs";
import { usePartShown, useSurface } from "../use-surface";
import { takeOwnAddress } from "./page/own-address";
import { usePeopleStanding } from "./page/people-head";
import { PeopleReal } from "./page/people-real";
import { PipelineScope } from "./pipeline/scope";
import { addressReplace } from "./shell-verbs";
import { isPersonParam } from "./chrome";
import { ClientProfile } from "./person/person-real";
import { GetYesSheet } from "./sheets/get-yes-sheet";
import { viewDeck } from "../kit/motion/view-deck";
import type { ScopeView } from "./scope-view";
import { plScopes } from "./words";

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
  // Get their yes is a sheet over Everyone: the list under it is the one it was opened over.
  if (route === GET_YES_ROUTE) return "clients";
  const at = parsePeopleRoute(route);
  return at ? peopleRoute({ view: at.view }) : route;
}

/**
 * People's list mounts afresh when the address moves to a view of it the list did not write itself, as the frame remounted a
 * view it was told of. Only People's own views count: a trip to Leads or the Pipeline and back finds the list as it was.
 */
function useMountKey(route: string, ofPeople: boolean): number {
  const last = useRef(route);
  const mounts = useRef(0);
  if (ofPeople && last.current !== route) {
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
function LeadsScopePage({ param, scopeView }: { param: string; scopeView?: ScopeView }) {
  const leads = useSurface("leads");
  // Leads' page is a chunk of its own, asked for as its address opens, while the surface it waits for is read: People's
  // first load carries none of it (the page's ceiling, tooling/scripts/checks/bundle-budget.mjs, 11 Oct 2026).
  const [, landed] = useState(0);
  useEffect(() => {
    if (!leadsModule)
      void loadLeads().then(
        () => landed((n) => n + 1),
        () => undefined,
      );
  }, []);
  const Page = leadsModule?.LeadsReal;
  // Leads' first part (client/page-speed.ts): its rows drawn, which wait for both its read and its chunk.
  usePartShown("leads", "table", !!(leads && Page));
  // Until both are in, it says so where it will stand: the page keeps its scopes, so the frame's reading pane does not stand
  // in for this one (app-shell.jsx readsInPlace).
  return leads && Page ? (
    <Page
      key="leads"
      leadsRoute={param}
      scopeView={scopeView}
      onNavigate={ownGo}
      onOpenProfile={(id) => navigate(addressOf({ kind: "person", id }))}
    />
  ) : (
    <div className="route-reading" role="status">
      Reading…
    </div>
  );
}

type LeadsModule = Pick<typeof import("../leads/page/leads-real"), "LeadsReal">;
let leadsModule: LeadsModule | null = null;
let leadsLoading: Promise<LeadsModule> | null = null;

/** Leads' page, loaded once for the tab, where it is first drawn or ahead of it; one that failed is asked for again. */
function loadLeads(): Promise<LeadsModule> {
  // What it reads of the module is named, so the dead-exports check (knip) sees the use.
  leadsLoading ??= import("../leads/page/leads-real").then(
    ({ LeadsReal }) => (leadsModule = { LeadsReal }),
    (e: unknown) => {
      leadsLoading = null;
      throw e;
    },
  );
  return leadsLoading;
}

/** How long People's page waits for an idle moment before it loads Leads' page all the same. */
const LEADS_AHEAD_MS = 2000;

/**
 * Leads' page loaded ahead, once People's own is drawn and the page is idle: the strip's press on Leads, or a swipe to
 * it, finds its page here. Its first press in a document waited for the chunk and drew an empty page meanwhile (field
 * data, 18 Oct 2026: 24 of 65 phone moves to Leads, 340-404 ms against 239-269 held). People's first load still carries
 * none of it: the chunk is asked for after People's rows are on screen.
 */
function useLeadsAhead(ready: boolean): void {
  useEffect(() => {
    if (!ready || leadsModule) return undefined;
    const go = () => void loadLeads().catch(() => undefined);
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(go, { timeout: LEADS_AHEAD_MS });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(go, LEADS_AHEAD_MS);
    return () => clearTimeout(t);
  }, [ready]);
}

type Scope = "people" | "leads" | "pipeline";
/** The scopes in the strip's order, which says the side a scope comes in from (surface-tabs.jsx stripPlace reads the same). */
const SCOPE_ORDER: readonly string[] = plScopes().map((s) => s.id);
/** The deck's one seat for People's scopes. */
const SCOPE_SEAT = "people-scope";

/**
 * Get their yes over People's list (`clients/get-yes`, the Campaigns wiring review's lane 7): drawn from the first time it
 * is asked for, so it leaves the way it came, and nothing of it before. Its Close is People's list, in its place: Back from
 * there is where the sheet was opened from, never the sheet again.
 */
function GetYesOver({ open }: { open: boolean }) {
  const asked = useRef(open);
  if (open) asked.current = true;
  return asked.current ? <GetYesSheet open={open} onClose={() => addressReplace("clients", { quiet: false })} /> : null;
}

/** A scope kept: drawn while it is shown, hidden and kept while another is. */
function KeptScope({ shown, children }: { shown: boolean; children: ReactNode }) {
  return <Activity mode={shown ? "visible" : "hidden"}>{children}</Activity>;
}

/**
 * Which scopes have been asked for (each is kept from then), the address each was last at (a hidden scope keeps drawing the
 * view it was left on), and the side the scope shown comes in from: the scope before it, on the draw that changes it.
 */
function useKeptScopes(scope: Scope | null, param: string) {
  const asked = useRef(new Set<Scope>());
  const at = useRef<Record<Scope, string>>({ people: "", leads: "leads", pipeline: "pipeline" });
  const before = useRef<Scope | null>(null);
  if (scope) {
    asked.current.add(scope);
    at.current[scope] = param;
  }
  const was = before.current;
  useEffect(() => {
    if (scope) before.current = scope;
  });
  const slide: ScopeView["slide"] =
    scope && was && was !== scope
      ? SCOPE_ORDER.indexOf(scope) > SCOPE_ORDER.indexOf(was)
        ? "next"
        : "prev"
      : undefined;
  const seat = viewDeck.view(SCOPE_SEAT);
  const viewOfScope = (s: Scope): ScopeView => ({ ref: seat, slide: s === scope ? slide : undefined });
  return { asked: asked.current, at: at.current, viewOfScope };
}

export function PeopleRoute({ pathname }: { pathname: string | null }) {
  const route = routeOfPath(pathname) ?? "clients";
  const param = route.includes("/") ? route.slice(route.indexOf("/") + 1) : "";
  const live = useSurface("people");
  const person = !!param && isPersonParam(param);
  const leads = /^leads(:|$)/.test(param);
  // The Pipeline's address draws the Pipeline, every workspace's (0008, amended 18 Oct 2026).
  const pipeline = /^pipeline(:|$)/.test(param);
  const scope: Scope | null = person ? null : leads ? "leads" : pipeline ? "pipeline" : "people";
  const mount = useMountKey(route, scope === "people");
  const kept = useKeptScopes(scope, param);
  // What the page says to the frame's head in Glass: a person's page that its hero is the head (the frame draws the date's
  // place as the way back). The Pipeline says its own, with its act (pipeline/standing.tsx); Leads says its own too, in its
  // standing line (rail/standing.tsx); and People's list says its own, with its act, Add a person (page/people-real.tsx).
  // Until the list can be drawn, the route says People's name.
  const listDrawn = !!live || demoSession();
  // A person's page says its own standing (person-real.tsx: its way back, and on a desk "‹ 4 of 24 ›" beside it).
  usePeopleStanding(person || pipeline || leads || listDrawn ? null : "people");
  // People's first part (client/page-speed.ts): its table, drawn once People's read is in. Its scopes say their own.
  usePartShown("people", "table", !!live && !person && !leads && !pipeline);
  // People's list or the Pipeline on screen: the strip's other scope, Leads, is loaded ahead of its press.
  useLeadsAhead(!!live && !person && !leads);
  // A person's page reads the person itself (people-detail.ts) and never waits for People's rows; it is a new mount per person,
  // and one mount across their tabs (`<id>/history`, 0052), which the page follows as a prop.
  if (person) {
    const at = personRouteOf(param);
    return <ClientProfile key={at.id} id={at.id} tab={at.tab} />;
  }
  return (
    <>
      {kept.asked.has("people") && (
        <KeptScope shown={scope === "people"}>
          {/* A workspace's People waits for its own surface (the frame's gate); a demo session draws the sample. */}
          {listDrawn ? (
            <PeopleReal
              key={mount}
              {...viewOf(kept.at.people)}
              scopeView={kept.viewOfScope("people")}
              onNavigate={ownGo}
              onOpenProfile={(id) => navigate(addressOf({ kind: "person", id }))}
            />
          ) : null}
        </KeptScope>
      )}
      {kept.asked.has("leads") && (
        <KeptScope shown={scope === "leads"}>
          <LeadsScopePage param={kept.at.leads} scopeView={kept.viewOfScope("leads")} />
        </KeptScope>
      )}
      <GetYesOver open={param === GET_YES_PARAM} />
      {kept.asked.has("pipeline") && listDrawn && (
        <KeptScope shown={scope === "pipeline"}>
          <PipelineScope
            key="pipeline"
            pipelineRoute={kept.at.pipeline}
            scopeView={kept.viewOfScope("pipeline")}
            onNavigate={ownGo}
            onOpenProfile={(id) => navigate(addressOf({ kind: "person", id }))}
          />
        </KeptScope>
      )}
    </>
  );
}
