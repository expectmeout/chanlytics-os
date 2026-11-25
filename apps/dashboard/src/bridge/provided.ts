/**
 * What the bridge installs at boot for the pages and the frame, held by name in one typed store (decision 0151).
 *
 * The bridge used to hang each of these on `window` as it installed it (`window.__clock`, `window.__shell`, the route
 * gate's four names), and a page read the window where it used one, so that a node test could stand one in and a page
 * loaded alone drew without it. That is still what is asked of them: a page asks for a part as it uses it, never when its
 * module loads, finds nothing before the bridge has installed it (a test that loads a page alone), and draws as it did
 * then; a test hands in its stand-in with `provide`. What changed is where they are held: here, typed by one interface,
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
import type { PageClock } from "./zone";
import type { TabMemory } from "./tab-memory";
import type { BellApi } from "./notifications";
import type { ChromeWords, ShellApi } from "./shell";
import type { WorkspaceApi } from "./identity";
import type { RepliesApi } from "./reach-out/replies";
import type { InboxVerbs } from "./inbox-verbs";
import type { DealMenuCourier, PersonNotesCourier } from "../surfaces/people/people-detail";
import type { BroadcastVerbs } from "../surfaces/campaigns/broadcasts/verbs";
import type { CalendarVerbs } from "../surfaces/calendar/verbs";
import type { BillingApi } from "../surfaces/settings/billing/surface";

/** Each part by its name, as the bridge installs it. */
export interface Provided {
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
  /** The business's clock: every method says the workspace's time (zone.ts installClock). */
  clock: PageClock;
  /** The tab's memory of a page's place and its work half-done (tab-memory.ts installTabMemory). */
  tabMemory: TabMemory;
  /** The bell: its rows, its read state and this device's alerts (notifications.ts installNotifications). */
  bell: BellApi;
  /** The one tooltip, shown at a control at once (frame/tip.ts installTip). */
  tip: { show: (el: Element) => void };
  /** The shell's verbs over the window: the address, sign-out, the workspace switch, Retry all, the tab's name (shell.ts). */
  shell: ShellApi;
  /** The chrome's words, as the shell installs them (shell.ts installShell). */
  chrome: ChromeWords;
  /** Read someone before their row is pressed, and their page's code with them (people-detail.ts installPeopleCourier). */
  warmPerson: (id: string) => void;
  /** A person's steps: one done or open again, and a step's day once it has come (installPeopleCourier). */
  personNotes: PersonNotesCourier;
  /** A deal's acts as a thread's Deal group offers them, and their words (installPeopleCourier). */
  deal: DealMenuCourier;
  /** The workspace's own changes an owner makes: its zone, its word for a booking (identity.ts installIdentity). */
  workspace: WorkspaceApi;
  /** A sent message's reply from a lead, as a thread shows it (reach-out/replies.ts installReplies). */
  replies: RepliesApi;
  /** A link to a route the browser follows, a policy's mode and dials, the settings saved (inbox-verbs.ts installInboxVerbs). */
  href: InboxVerbs["href"];
  setPolicy: InboxVerbs["setPolicy"];
  saveSettings: InboxVerbs["saveSettings"];
  /** Sent's verbs: a run stopped, one approved (campaigns/broadcasts/verbs.ts installBroadcasts). */
  broadcasts: BroadcastVerbs;
  /** The playbooks read again after a run's verb elsewhere (campaigns/playbooks/verbs.ts installPlaybooks). */
  refreshPlaybooks: () => Promise<void>;
  /** The Calendar's verbs the Business tab's calendar row presses (calendar/verbs.ts installCalendar). */
  calendar: CalendarVerbs;
  /** Billing's verbs and words, which the line under the top bar reads (settings/billing/surface.ts installBilling). */
  billing: BillingApi;
}

const held: Partial<Provided> = {};

/** Hold a part under its name: the bridge as it installs it, a test's stand-in; undefined takes it away. */
export function provide<K extends keyof Provided>(name: K, part: Provided[K] | undefined): void {
  if (part === undefined) delete held[name];
  else held[name] = part;
}

/** The part held under this name, or undefined before the bridge has installed it. */
export function provided<K extends keyof Provided>(name: K): Provided[K] | undefined {
  return held[name];
}
