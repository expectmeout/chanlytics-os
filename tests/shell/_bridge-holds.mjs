/**
 * The world a test draws, held where the app holds it (decision 0151). Until 25 Nov 2026 a test stood its world in on the
 * window, by the names the bridge published there (`window.__ME`, `window.__chrome`, `INBOX_DATA`); the app reads none of
 * them now, so a test hands its world to the same stores the bridge fills:
 *
 * - `who`: who is looking and at which workspace, as the workspace read holds it (bridge/who.ts): `workspaces`, `me`,
 *   `activeWorkspaceId`, `pending`, `posture`;
 * - `values`: a surface's value, as its read publishes it (surfaces/surface-values.ts): `people`, `live`, `inbox`, …;
 * - `reads`: a read the bridge holds itself (bridge/held-reads.ts): `notifications`, `reach_out_replies`;
 * - `parts`: a part the bridge installs at boot (bridge/provided.ts): `chrome`, `shell`, `clock`, `surfaceState`, …
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
];

/** Every read the bridge holds itself (held-reads.ts `HeldReads`). */
const READS = ["workspace", "notifications", "reach_out_replies"];

export function bridgeHolds({ who, values, reads, parts } = {}, { fresh = false } = {}) {
  if (fresh) {
    for (const name of PARTS) provide(name, undefined);
    for (const key of READS) holdRead(key, undefined);
  }
  if (who) holdWhoIsLooking(who);
  for (const [key, value] of Object.entries(values ?? {})) setSurfaceValue(key, value);
  for (const [key, value] of Object.entries(reads ?? {})) holdRead(key, value);
  for (const [name, part] of Object.entries(parts ?? {})) provide(name, part);
}

/* What the bridge holds, read back by a test as the app reads it. */
export { provided, heldRead, whoIsLooking, surfaceValue };
