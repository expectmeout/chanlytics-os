/**
 * The doors every page uses to move and to ask: go to a route, open Ask, open Ask about something.
 *
 * The frame owns the first two (`ChanlyticsApp`: its own move, which keeps the browser's Back and the address, and its own
 * Ask state), and Ask's third door, `askAbout`, was a function the mockup's seeded palette defined (a file of canned answers
 * the real manifest imported only for it), while the other two were assigned to `window` inside the frame's render.
 * Every Ask door on Today, Leads, Campaigns, the Inbox menu and Settings, and every cross-page link, went through a name
 * that vanished if either file moved or went, and the typed side called them with `?.`, so a missing door did nothing and
 * said nothing.
 *
 * Here they are real exports a page imports. The frame fills the bridge's registry with its doors as it renders (LegacyApp
 * hands it `fillDoors` as a prop), before the pages under it draw; a door the registry does not hold answers as a stand-in
 * window would (a test's, the standalone mockup's), else says so once (`door_missing`) and does nothing, as it always did.
 * The names the pages that have not moved read (`askAbout`, `appNavigate`, `appAsk`) are published from here by
 * seed-globals.ts, before any page loads, and go through the same registry. `backToPeople` has no JSX reader and is no
 * window name.
 *
 * Each name is a line to delete on the day its last reader moves (decision 0015, step 13: the frame itself).
 */
import type { AskScope } from "@chanlytics/contracts";
// A type only, which a bundle drops: this module imports nothing at run time, so the kit and every surface can import it.
import type { GoOptions } from "@/legacy-bridge/workspace";

/** What Ask is opened with: a question to ask, or to finish with `mode` "compose"; a conversation to open; and the scope its chip opens on. */
interface AskAbout {
  prompt?: string;
  mode?: string;
  thread?: string;
  about?: AskScope;
  /** Asked in a conversation of its own, never the one the Line still holds (a page's own search). */
  fresh?: boolean;
  /** The seeded palette's own (a demo session's): a canned answer, doors to pages and acts to run. The Line asks the prompt instead. */
  answer?: string;
  title?: string;
  links?: Array<{ label: string; to: string }>;
  actions?: Array<{ label: string; run?: () => unknown }>;
}

/**
 * What the frame holds for every page: its own move, its Ask, a person's Back to the People view they were opened from, and
 * a page's Back to wherever it was opened from (`from`, any place when absent), else `home`.
 */
interface FrameDoors {
  navigate: (route: string, opts?: GoOptions) => void;
  openAsk: () => void;
  backToPeople: () => void;
  backFrom: (home: string, from?: RegExp, opts?: GoOptions) => void;
}

/** A door a page could not find. */
type DoorName = keyof FrameDoors;

declare global {
  interface Window {
    askAbout?: (about?: AskAbout) => void;
    appAsk?: () => void;
    appNavigate?: (route: string, opts?: GoOptions) => void;
    appBackToPeople?: () => void;
  }
}

/** The frame's doors, once it has rendered; null before it, and in a stand-in window with no frame. */
let frame: FrameDoors | null = null;

/** The doors already said missing: once each, not once a press. */
const warnedDoors = new Set<DoorName>();

/** A door that is not there says so, once. */
function missing(door: DoorName): void {
  if (warnedDoors.has(door)) return;
  warnedDoors.add(door);
  console.warn("door_missing", door);
}

/** The frame fills the registry as it renders. Idempotent: its two callbacks keep their identity, and a render fills it again. */
export function fillDoors(doors: FrameDoors): void {
  frame = doors;
}

/** The doors the registry holds, for the test that every one a page uses has a filler. */
export function filledDoors(): Array<keyof FrameDoors> {
  return frame ? (Object.keys(frame) as Array<keyof FrameDoors>) : [];
}

/** Empty the registry (a test's world, drawn again). */
export function emptyDoors(): void {
  frame = null;
  warnedDoors.clear();
}

/** A function a stand-in window offers under one of the names these doors answer to, but never this module's own published one. */
function standIn<K extends "askAbout" | "appAsk" | "appBackToPeople">(name: K): NonNullable<Window[K]> | undefined {
  const v: unknown = Reflect.get(window, name);
  const own: unknown = (DOOR_NAMES as Record<string, unknown>)[name];
  return typeof v === "function" && v !== own ? (v as NonNullable<Window[K]>) : undefined;
}

/**
 * Go to a route, the way a page does: the frame's own move, which keeps its Back and its address. Without a frame, the
 * legacy page's door (`CHANLY.nav`, which a stand-in window may offer); without that, nothing, said once.
 */
export function navigate(route: string, opts?: GoOptions): void {
  if (frame) {
    if (opts === undefined) frame.navigate(route);
    else frame.navigate(route, opts);
    return;
  }
  const go = window.CHANLY?.nav;
  if (!go) return missing("navigate");
  if (opts === undefined) go(route);
  else go(route, opts);
}

/** The frame's move under the window name the pages that read it use (`window.appNavigate`): frame/constants.ts `CHANLY.nav`, the Line. */
function moveByName(route: string, opts?: GoOptions): void {
  if (!frame) return missing("navigate");
  if (opts === undefined) frame.navigate(route);
  else frame.navigate(route, opts);
}

/** Open Ask as ⌘K does, keeping what is in its field; nothing where there is no frame to open it, said once. */
export function openAsk(): void {
  if (frame) return frame.openAsk();
  const open = standIn("appAsk");
  if (open) return open();
  missing("openAsk");
}

/**
 * Open Ask on a question: the Line asks it, or with `mode` "compose" leaves it in the field to finish; `thread` opens that
 * conversation as it is; `about` is the scope chip it opens with. It opens Ask, then hands it `ask:seed` (ask-real.jsx
 * useArSeedKeys). A demo session's seeded palette reads the same event, with its canned answer, links and actions.
 */
export function askAbout(about: AskAbout = {}): void {
  const own = standIn("askAbout");
  if (own) return own(about);
  openAsk();
  window.dispatchEvent(new CustomEvent("ask:seed", { detail: about }));
}

/**
 * A page's Back to where it was opened from, by the browser's own Back (the frame knows the move that opened it), so that
 * page comes back as it was left; reached any other way (a link, a reload), `home`, the address replaced where `opts` says.
 */
export function backFrom(home: string, opts?: GoOptions): void {
  if (frame) return frame.backFrom(home, undefined, opts);
  navigate(home, opts);
}

/** A person's Back: the People view they were opened from (the frame's rule), else People itself. */
export function backToPeople(): void {
  if (frame) return frame.backToPeople();
  const back = standIn("appBackToPeople");
  if (back) return back();
  navigate("clients");
}

/**
 * The window names for the pages that have not moved, which seed-globals.ts publishes before any page loads
 * by name. Every one goes through the registry.
 */
export const DOOR_NAMES = { askAbout, appAsk: openAsk, appNavigate: moveByName } as const;

/* ------------------------------------------------- a door is a link ------------------------------------------------- */

/*
 * Moved from legacy/components/data-bits.jsx (the one-system plan's step 2). A name, a face or a chip with a page of its
 * own is a link to that page: `<a {...routeDoor(to, go)}>`. Its address is in the href, so a long press, a middle click or
 * a new tab opens it too, and a plain press takes the app's own way there (`go`, else CHANLY.nav), which keeps Back the
 * app's. As a pointer reaches a door or it takes focus, its page is warmed as the sidebar's rows are (workspace.ts
 * warmRoute: a name on a thread asked for People's page on the press), and a door to a person reads them, as People's rows
 * do: their page is drawn only once it is whole, on any tab. The address and the person's read are the window's, read when
 * a door is drawn, as the JSX read them: a test stands in for either there.
 */
const RD_PERSON = /^clients\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/[a-z]+)?$/i;

/** What a link to a route spreads: the address in its href, the app's own way there on a plain press. */
interface RouteDoorProps {
  href: string;
  onClick: (e?: {
    defaultPrevented?: boolean;
    button?: number;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    preventDefault?: () => void;
  }) => void;
  onPointerEnter: (e?: { pointerType?: string }) => void;
  onFocus: () => void;
}

type DoorWindow = Window & {
  CHANLY?: {
    nav?: (route: string) => void;
    address?: { href?: (route: string) => string; warm?: (route: string) => void };
  };
  __warmPerson?: (id: string) => void;
};

/** The props of a link to `to` (see above). */
export const routeDoor = (to: string, go: ((to: string) => void) | null = null): RouteDoorProps => {
  const win = window as DoorWindow;
  const person = RD_PERSON.exec(to);
  const a = win.CHANLY && win.CHANLY.address;
  const warm = () => {
    if (person && win.__warmPerson) win.__warmPerson(person[1] ?? "");
    if (a && a.warm) a.warm(to);
  };
  return {
    href: a && a.href ? a.href(to) : `#/${to}`,
    onClick: (e) => {
      if (e && (e.defaultPrevented || (e.button ?? 0) > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
      if (e && e.preventDefault) e.preventDefault();
      if (go) go(to);
      else if (win.CHANLY && win.CHANLY.nav) win.CHANLY.nav(to);
    },
    // A finger is a scroll or a swipe first (legacy-verbs warmsOnReach).
    onPointerEnter: (e) => {
      if (!e || e.pointerType !== "touch") warm();
    },
    onFocus: warm,
  };
};
