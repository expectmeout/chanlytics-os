/**
 * The world a test draws, held where the app holds it (decision 0151). Until 25 Nov 2026 a test stood its world in on the
 * window, by the names the bridge published there (`window.__ME`, `window.__chrome`, `INBOX_DATA`); the app reads none of
 * them now, so a test hands its world to the same stores the bridge fills:
 *
 * - `who`: who is looking and at which workspace, as the workspace read holds it (bridge/who.ts): `workspaces`, `me`,
 *   `activeWorkspaceId`, `pending`, `posture`;
 * - `values`: a surface's value, as its read publishes it (surfaces/surface-values.ts): `people`, `live`, `inbox`, …;
 * - `reads`: a read the bridge holds itself (bridge/held-reads.ts): `notifications`, `reach_out_replies`;
 * - `parts`: a part the bridge installs at boot (bridge/provided.ts): `chrome`, `shell`, `clock`, `surfaceState`, the role
 *   store `roles`, the charter `policy`, People's `sheets`, …;
 * - `doors`: the frame's doors a page moves and asks through (surfaces/frame-doors.ts), the ones the test catches:
 *   `{ navigate: (to) => went.push(to) }`, where a page's own move went to a stand-in window's `CHANLY.nav` until
 *   26 Nov 2026. Each door handed in is set on its own and the others stay, as each was a name of its own on the window;
 *   `undefined` takes one away. A door not handed in says it is missing, as it does before the frame draws.
 *
 * `fresh` empties the bridge's parts, its reads and who is looking first, as a new window did; a surface's values are the
 * seam's, which a new window never emptied, and are left. `undefined` takes one away.
 *
 * The stores are required, as the pages require them: tsx loads the dashboard's modules as CommonJS, and a static `import`
 * of one from an .mjs is a second copy the pages never write to or read (the record registry's trap, _stub-react.mjs).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requireFromDashboard = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../apps/dashboard/src/bridge/_.js"),
);
const { provide, provided } = requireFromDashboard("./provided.ts");
const { holdRead, heldRead } = requireFromDashboard("./held-reads.ts");
const { holdWhoIsLooking, whoIsLooking } = requireFromDashboard("./who.ts");
const { setSurfaceValue, surfaceValue } = requireFromDashboard("../surfaces/surface-values.ts");
const { emptyDoors, fillDoors, takeAskedOfTheLine } = requireFromDashboard("../surfaces/frame-doors.ts");
const { installTip } = requireFromDashboard("../surfaces/frame/tip.ts");
const { hearFocusOutside } = requireFromDashboard("../surfaces/kit/focus/trap.ts");
const { roleAtLeast } = requireFromDashboard("@chanlytics/contracts");

/** Every part the bridge installs (provided.ts `BridgeParts`), so a fresh world holds none of them. */
const PARTS = [
  "surfaceState",
  "surfaceRetired",
  "surfaceGate",
  "surfaceFailed",
  "onSurfaceReady",
  "routeWaitMs",
  "refreshSurface",
  "clock",
  "tabMemory",
  "bell",
  "tip",
  "shell",
  "chrome",
  "warmPerson",
  "personNotes",
  "deal",
  "workspace",
  "tz",
  "replies",
  "href",
  "setPolicy",
  "saveSettings",
  "broadcasts",
  "refreshPlaybooks",
  "calendar",
  "billing",
  "roles",
  "policy",
  "sheets",
  "peopleScopes",
  "phoneDoor",
  "afterTheMoveMs",
  "toast",
];

/** Every read the bridge holds itself (held-reads.ts `HeldReads`). */
const READS = ["workspace", "notifications", "reach_out_replies"];

/** The doors the tests have handed in, each by its name. */
let doorsHeld = null;

/** The doors held now, or none: what a test keeps to put back when it is done (`bridgeHolds({ doors: kept })`). */
export const heldDoors = () => ({ ...(doorsHeld ?? {}) });

/**
 * The frame's door to Ask as a test catches it: `ask` hears what a page asked about (frame-doors.ts `askAbout`, which
 * opens Ask through this door with its question kept for the Line), `open` a plain open (`openAsk`, ⌘K). Until 26 Nov
 * 2026 a test stood each in on the window as `askAbout` and `appAsk`.
 */
export const askDoor = ({ ask, open } = {}) => ({
  openAsk: () => {
    const asked = takeAskedOfTheLine();
    if (asked) ask?.(asked);
    else open?.();
  },
});

export function bridgeHolds({ who, values, reads, parts, doors } = {}, { fresh = false } = {}) {
  if (fresh) {
    for (const name of PARTS) provide(name, undefined);
    for (const key of READS) holdRead(key, undefined);
    emptyDoors();
    doorsHeld = null;
  }
  if (doors) {
    doorsHeld = { ...(doorsHeld ?? {}), ...doors };
    fillDoors(doorsHeld);
  }
  if (who) holdWhoIsLooking(who);
  for (const [key, value] of Object.entries(values ?? {})) setSurfaceValue(key, value);
  for (const [key, value] of Object.entries(reads ?? {})) holdRead(key, value);
  for (const [name, part] of Object.entries(parts ?? {})) provide(name, part);
}

/* What the bridge holds, read back by a test as the app reads it. */
export { provided, heldRead, whoIsLooking, surfaceValue };

/**
 * The frame's own parts a page draws with, as the boot installs them (bridge/boot/installs.ts): the one tooltip, the
 * toast every page raises (frame/flash.tsx usePPToast, the boot's `toast` step) and the focus a dialog gives back. What
 * a test called `installFrameGlobals()` for until 26 Nov 2026, less the names it put on the window, which the app no
 * longer reads. A toast a test already handed in (`parts: { toast }`) is kept, before or after. The role store is not
 * among them: a test that draws a role gives it (`parts: { roles }`, or who is looking).
 */
export function holdFrameParts() {
  hearFocusOutside();
  installTip();
  if (!provided("toast")) provide("toast", requireFromDashboard("../surfaces/frame/flash.tsx").usePPToast);
}

/**
 * The frame's own parts, as it imports them (it draws each by import since decision 0151, never by a name a test can
 * stand in): what a test finds in a tree the frame drew (`n.type === frameParts().Topbar`) or draws alone, and the
 * strip's own place, slide and swipe. Required when asked, like drawsInPlace: they are TSX, which a test loads once its
 * stub React is in place.
 */
export function frameParts() {
  const top = requireFromDashboard("../surfaces/frame/topbar/topbar.tsx");
  const bars = requireFromDashboard("../surfaces/frame/topbar/status-bars.tsx");
  const strip = requireFromDashboard("../surfaces/frame/surface-tabs.tsx");
  const sheet = requireFromDashboard("../surfaces/frame/shortcuts.tsx");
  return {
    Topbar: top.Topbar,
    LiveCallBar: bars.LiveCallBar,
    ShellStatusBar: bars.ShellStatusBar,
    Sidebar: requireFromDashboard("../surfaces/frame/sidebar/sidebar.tsx").Sidebar,
    SurfaceTabs: strip.SurfaceTabs,
    stripPlace: strip.stripPlace,
    stripSlide: strip.stripSlide,
    stripSwipe: strip.stripSwipe,
    ShortcutsSheet: sheet.ShortcutsSheet,
    openShortcuts: sheet.openShortcuts,
    AskBar: requireFromDashboard("./ask/line.tsx").AskLine,
    Icon: requireFromDashboard("../surfaces/kit/icon/icon.tsx").Icon,
  };
}

/**
 * People's parts the frame draws with, as the boot hands them (people/sheets/frame-parts.ts installPeopleFrameParts): its
 * sheets and the doors that ask for them, and its scopes, the strip's order. What a test put on the window as
 * `peoplePages` until 26 Nov 2026. Required when asked: People's TSX loads once a test's stub React is in place.
 */
export function holdPeopleParts() {
  requireFromDashboard("../surfaces/people/sheets/frame-parts.ts").installPeopleFrameParts();
}

/**
 * What react-dom does at once in a browser, here: a portal's node drawn where it stands, and a change drawn before it
 * returns (`flushSync`). This runner's react-server condition gives react-dom neither, so a test that draws a toast, a
 * menu or a held switch with no stub React of its own calls this, where it stood `ReactDOM` in on the window until
 * 26 Nov 2026. Required when called, never as this module loads: react-dom loaded before a suite's own stub React is in
 * place leaves People's rows undrawn (_stub-react.mjs).
 */
export function drawsInPlace() {
  const reactDom = requireFromDashboard("react-dom");
  reactDom.createPortal = (node) => node;
  reactDom.flushSync = (change) => change();
}

/**
 * A role store that lets the member act where `can` says (bridge/identity.ts's shape, provided as `roles`): what a test
 * hands in to draw a gate that refuses, where it stood `canDo` in on the window until 26 Nov 2026. `role` is who they act
 * as, for the words a refusal says (contracts roleGate); `atLeast` answers the rungs (`mayAtLeast`), by default contracts' own
 * ladder (roleAtLeast).
 */
export function rolesThat(can, { role = "operator", atLeast } = {}) {
  return {
    viewAsRole: null,
    myRole: () => role,
    can: (action) => !!can(action),
    mayAtLeast: atLeast ?? ((rung) => roleAtLeast(role, rung)),
  };
}

/**
 * The role store held now, changed only where a test says: `can` answers what the role may do (the gate's `canDo`, told
 * what a control asks as: `(perm, doing)`), `atLeast` the rungs (`mayAtLeast`); one named with nothing (`null`, or a kept answer that was never held) puts that one
 * back (it may do everything; contracts' ladder). With none held it starts from a viewer's store that may do everything,
 * since a page with no role store acts as a viewer and says a refusal in a viewer's words (gate.ts). What a test stood
 * `canDo` or `mayAtLeast` in for on the window until 26 Nov 2026. A new store each time, so one a test kept
 * (`provided("roles")`) is put back as it was.
 */
export function holdRoles(change = {}) {
  const now = provided("roles") ?? rolesThat(() => true, { role: "viewer" });
  const back = rolesThat(() => true, { role: now.myRole?.() ?? "viewer" });
  const store = { ...now };
  if ("can" in change) store.can = change.can ? (action, doing) => !!change.can(action, doing) : back.can;
  if ("atLeast" in change) store.mayAtLeast = change.atLeast ?? back.mayAtLeast;
  provide("roles", store);
}
