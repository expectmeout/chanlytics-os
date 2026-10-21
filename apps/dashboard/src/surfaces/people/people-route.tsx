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
 * A person's page is drawn over them, not in their place: the scope it was opened from is held where it was under it (kit
 * motion/held-list.ts), and is there again as it was left, the row you were on where it stood, as the person goes by any
 * Back (Ruben, 20 Oct 2026). It had been taken down with the other two, and built again and put back after a fade.
 */
import { Activity, useEffect, useRef, type ReactNode } from "react";
import {
  GET_YES_PARAM,
  GET_YES_ROUTE,
  addressOf,
  LIFECYCLE_WORDS,
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
import { peekCode } from "./peek/peek-code";
import { dealSheetCode } from "./pipeline/peek-code";
import { peekPerson, profileCode, warmPerson } from "./people-detail";
import { GetYesSheet } from "./sheets/get-yes-sheet";
import { FailedRead } from "../kit/empty/empty";
import { carriedOver, pushesOver, useHeldList, type Arrival } from "../kit/motion/held-list";
import { viewDeck } from "../kit/motion/view-deck";
import type { ScopeView } from "./scope-view";
import { plScopes } from "./words";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { aheadWhenIdle, routeOnScreen } from "@/legacy-bridge/workspace";

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
function LeadsScopePage({
  param,
  scopeView,
  onOpenProfile,
}: {
  param: string;
  scopeView?: ScopeView;
  onOpenProfile: (id: string) => void;
}) {
  const leads = useSurface("leads");
  // Leads' page is a chunk of its own, asked for as its address opens, while the surface it waits for is read: People's
  // first load carries none of it (the page's ceiling, tooling/scripts/checks/bundle-budget.mjs, 11 Oct 2026).
  const Page = useCode(leadsCode, true).loaded?.LeadsReal;
  // Leads' first part (client/page-speed.ts): its rows drawn, which wait for both its read and its chunk.
  usePartShown("leads", "table", !!(leads && Page));
  // Until both are in, it says so where it will stand: the page keeps its scopes, so the frame's reading pane does not stand
  // in for this one (frame/shell-hooks.ts readsInPlace).
  return leads && Page ? (
    <Page key="leads" leadsRoute={param} scopeView={scopeView} onNavigate={ownGo} onOpenProfile={onOpenProfile} />
  ) : (
    <div className="route-reading" role="status">
      {LIFECYCLE_WORDS.reading}
    </div>
  );
}

/**
 * Leads' page, loaded once for the tab, where it is first drawn or ahead of it; one that failed is asked for again. What
 * it reads of the module is named, so the dead-exports check (knip) sees the use.
 */
const leadsCode = codeOnce(() => import("../leads/page/leads-real").then(({ LeadsReal }) => ({ LeadsReal })));

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
    if (!ready || leadsCode.now()) return undefined;
    return aheadWhenIdle(leadsCode.warm, LEADS_AHEAD_MS);
  }, [ready]);
}

// A person's address as the tab opens on it: the page's code is fetched now, beside People's own (people-detail.ts profileCode).
if (typeof window !== "undefined") {
  const opened = routeOnScreen();
  const param = opened.startsWith("clients/") ? opened.slice("clients/".length) : "";
  if (param && isPersonParam(param)) profileCode.warm();
}

/** How long People's list waits for an idle moment before it loads a person's page all the same. */
const PROFILE_AHEAD_MS = 3000;

/**
 * A person's page, the peek beside the rows (peek/peek-code.tsx) and the Pipeline's deal sheet (pipeline/peek-code.tsx)
 * loaded ahead, once People's list (or the Pipeline) is drawn and the page is idle: a pick or a press on a person finds
 * them in.
 */
function useProfileAhead(ready: boolean): void {
  useEffect(() => {
    if (!ready || (profileCode.now() && peekCode.now() && dealSheetCode.now())) return undefined;
    return aheadWhenIdle(() => {
      profileCode.warm();
      peekCode.warm();
      dealSheetCode.warm();
    }, PROFILE_AHEAD_MS);
  }, [ready]);
}

/**
 * How a person's page comes in over the scope it was opened from (kit/motion/held-list.ts): the page a thumb carries back
 * (one person is on the screen at a time), worn as a thumb carrying it wears it (its swipe's `onGrab`, person-real.tsx).
 */
const PERSON_ARRIVES: Arrival = {
  page: () => document.querySelector<HTMLElement>(".cl-profile"),
  going: carriedOver,
};

/** How long a press on a phone waits for a person the tab has not read, so the page pushed in over the list is theirs. */
const PUSH_WAIT_MS = 300;
/** Presses on a person, counted: the one waiting is the last, and a later one takes its place. */
let presses = 0;

/**
 * A person opened from a scope of People. On a phone their page is pushed in over the list it was opened from
 * (kit/motion/held-list.ts), which takes the page as the address moves: a person the tab had not read, or whose page's
 * code was not in yet, drew the pane any page on its way draws, and slid in after it. There the press waits, up to
 * PUSH_WAIT_MS, for both, the row lit under the finger meanwhile (Ruben, 20 Oct 2026); past it the page opens all the same
 * and slides in as it arrives (clients.css person-over). A person read already opens at once, and so does every press
 * where nothing is pushed (a desk, reduced motion). A press made while one waits takes its place, and a wait the member
 * left by moving elsewhere opens nothing.
 */
function openPerson(id: string, list: HTMLElement | null): void {
  const go = () => navigate(addressOf({ kind: "person", id }));
  if ((profileCode.now() && peekPerson(id)) || !pushesOver(list)) {
    go();
    return;
  }
  const mine = ++presses;
  const from = routeOnScreen();
  let done = false;
  const open = () => {
    if (done) return;
    done = true;
    if (presses === mine && routeOnScreen() === from) go();
  };
  void Promise.all([profileCode(), warmPerson(id)]).then(open, open);
  window.setTimeout(open, PUSH_WAIT_MS);
}

/**
 * A person's page, once its chunk is in: the shell's quiet words while it comes (the page's own read is out beside it,
 * people-detail.ts), and the failed read with its Retry where the chunk could not be fetched. `over`: opened over the list
 * it was opened from, which it comes in over.
 */
function PersonPage({ id, tab, over }: ReturnType<typeof personRouteOf> & { over: boolean }) {
  const { loaded, failed, retry } = useCode(profileCode, true);
  if (loaded) return <loaded.ClientProfile id={id} tab={tab} over={over} />;
  if (failed) return <FailedRead kind="line" what="this person" onRetry={retry} testid="person-code-failed" />;
  return (
    <div className="route-reading" role="status">
      {LIFECYCLE_WORDS.reading}
    </div>
  );
}

type Scope = "people" | "leads" | "pipeline";
/** The scopes in the strip's order, which says the side a scope comes in from (frame/surface-tabs.tsx stripPlace reads the same). */
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
 * view it was left on), the side the scope shown comes in from (the scope before it, on the draw that changes it), and the
 * root of the one on the screen, which a person's page opened from it holds under it.
 */
function useKeptScopes(scope: Scope | null, param: string) {
  const asked = useRef(new Set<Scope>());
  const at = useRef<Record<Scope, string>>({ people: "", leads: "leads", pipeline: "pipeline" });
  const before = useRef<Scope | null>(null);
  // Each scope's root as React shows it (null as it hides it), beside the deck's one seat for them all: one ref a scope.
  const roots = useRef<Partial<Record<Scope, HTMLElement | null>>>({});
  const refs = useRef<Partial<Record<Scope, (el: HTMLElement | null) => void>>>({});
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
  const refOf = (s: Scope) =>
    (refs.current[s] ??= (el) => {
      roots.current[s] = el;
      seat(el);
    });
  const viewOfScope = (s: Scope): ScopeView => ({ ref: refOf(s), slide: s === scope ? slide : undefined });
  const shown = (): HTMLElement | null =>
    Object.values(roots.current).find((el) => !!el && el.isConnected && el.getClientRects().length > 0) ?? null;
  return { asked: asked.current, at: at.current, viewOfScope, shown };
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
  // People's list or the Pipeline on screen: the strip's other scope, Leads, is loaded ahead of its press, and so is a
  // person's page, the list's most common next move.
  useLeadsAhead(!!live && !person && !leads);
  useProfileAhead(!!live && !person);
  // A person's page over the scope it was opened from: that scope is held where it was under it, and put back there as
  // they go (kit motion/held-list.ts). A person opened over a list comes in over it; one stepped to from a person, or
  // opened by a link, is drawn where they stand.
  const over = useHeldList(person, kept.shown, PERSON_ARRIVES);
  const onOpenProfile = (id: string) => openPerson(id, kept.shown());
  // A person's page reads the person itself (people-detail.ts) and never waits for People's rows; it is a new mount per person,
  // and one mount across their tabs (`<id>/history`, 0052), which the page follows as a prop.
  const at = person ? personRouteOf(param) : null;
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
              onOpenProfile={onOpenProfile}
            />
          ) : null}
        </KeptScope>
      )}
      {kept.asked.has("leads") && (
        <KeptScope shown={scope === "leads"}>
          <LeadsScopePage param={kept.at.leads} scopeView={kept.viewOfScope("leads")} onOpenProfile={onOpenProfile} />
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
            onOpenProfile={onOpenProfile}
          />
        </KeptScope>
      )}
      {at ? <PersonPage key={at.id} id={at.id} tab={at.tab} over={over} /> : null}
    </>
  );
}
