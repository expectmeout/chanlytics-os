/**
 * What the bridge installs at boot for the pages and the frame, held by name in one typed store (decision 0151).
 *
 * The bridge used to hang each of these on `window` as it installed it (`window.__clock`, `window.__shell`, the route
 * gate's four names), and a page read the window where it used one, so that a node test could stand one in and a page
 * loaded alone drew without it. That is still what is asked of them: a page asks for a part as it uses it, never when its
 * module loads, finds nothing before the bridge has installed it (a test that loads a page alone), and draws as it did
 * then; a test hands in its stand-in with `provide`. What changed is where they are held: here, typed by one interface (`BridgeParts`),
 * where no script the page did not bundle can read or replace them.
 *
 * Only what exists once the bridge has installed it belongs here: a store over the tab (the clock, the tab's memory, the
 * bell, the tip), the shell's verbs over the window, the route gate, and the verbs a page reaches without carrying their
 * code (a courier: the people page's, Sent's, the Calendar's, the inbox's), which stay in the code every page shares
 * because the frame installs them. A read's answer is the seam's (surface-values.ts, or the bridge module that reads it:
 * who.ts), and words or a rule a page can import are imported.
 *
 * This module imports nothing at run time, so the kit, the frame and every surface can import it.
 */
/**
 * Each part by its name, as the bridge installs it. The parts typed by their owner's own interface are declared beside it,
 * by the owner (`declare module "…/provided" { interface BridgeParts { clock: PageClock } }`), as each once declared its
 * window name (`declare global { interface Window }`): the store imports none of them, so it leans on nothing.
 */
export interface BridgeParts {
  /** What the registry says of a page: real, demo, or nothing it knows (surface-registry.ts installSurfaceRegistry). */
  surfaceState: (page: string, param?: string | null) => string | undefined;
  /** Where an address lands now, if it moved: a retired page, a pane that left (installSurfaceRegistry). */
  surfaceRetired: (page: string, param?: string | null) => string | undefined;
  /** The route gate (surface-registry.ts installRouteGate): whether a route's surfaces are in, its own alone with `own`. */
  surfaceGate: (page: string, param?: string | null, own?: boolean) => boolean;
  /** Whether the surface a route draws from failed to read (installRouteGate). */
  surfaceFailed: (page: string, param?: string | null) => boolean;
  /** Told when any surface's readiness moves; answers the stop (installRouteGate). */
  onSurfaceReady: (fn: () => void) => () => void;
  /** How long a page whose own surface is in waits for a band beside it (surface-registry.ts ROUTE_WAIT_MS). */
  routeWaitMs: number;
  /** Read one surface again by its key, through the runner (FrameApp.tsx): a page's Retry. */
  refreshSurface: (key: string) => Promise<void>;
  /** The one tooltip, shown at a control at once (frame/tip.ts installTip). */
  tip: { show: (el: Element) => void };
  /** Read someone before their row is pressed, and their page's code with them (people-detail.ts installPeopleCourier). */
  warmPerson: (id: string) => void;
  /** The playbooks read again after a run's verb elsewhere (campaigns/playbooks/verbs.ts installPlaybooks). */
  refreshPlaybooks: () => Promise<void>;
}

const installedParts: Partial<BridgeParts> = {};

/** Hold a part under its name: the bridge as it installs it, a test's stand-in; undefined takes it away. */
export function provide<K extends keyof BridgeParts>(name: K, part: BridgeParts[K] | undefined): void {
  if (part === undefined) delete installedParts[name];
  else installedParts[name] = part;
}

/** The part held under this name, or undefined before the bridge has installed it. */
export function provided<K extends keyof BridgeParts>(name: K): BridgeParts[K] | undefined {
  return installedParts[name];
}
