/**
 * The frame's boot as it is written (apps/dashboard/src/bridge/boot): the surfaces it reads, in its order, and the steps
 * it runs, each by the function it runs. A test asks these by import where it read FrameApp.tsx's text, which draws in a
 * browser alone (`#frame-shell`); tests/shell/boot/frame-boot.test.mjs runs the boot itself.
 *
 * Required, as the pages require them: tsx loads the dashboard's modules as CommonJS, and a static `import` of one from an
 * .mjs is a second copy, whose functions are not the ones the boot runs (_bridge-holds.mjs). So a function a test compares
 * with a step's comes from `fromDashboard` too. Neither list needs a window to load.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requireFromSrc = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/dashboard/src/_.js"),
);

/** A module of the dashboard, from `apps/dashboard/src` (`fromDashboard("bridge/zone.ts")`), as the boot holds it. */
export const fromDashboard = (file) => requireFromSrc(`./${file}`);

const { FRAME_SURFACES } = fromDashboard("bridge/boot/surfaces.ts");
const { FRAME_INSTALLS } = fromDashboard("bridge/boot/installs.ts");

/** The keys of the surfaces the frame reads, in the order it starts them. */
export const frameSurfaceKeys = () => FRAME_SURFACES.map((o) => o.key);

/** Whether the frame lists these surfaces one after another, in this order, as a group the boot starts together. */
export function listedTogether(...keys) {
  const all = frameSurfaceKeys();
  const first = all.indexOf(keys[0]);
  return first !== -1 && keys.every((key, i) => all[first + i] === key);
}

/** The step of the boot that runs this function, or null: the frame installs it as it loads, or does not. */
export const stepRunning = (fn) => FRAME_INSTALLS.find((step) => step.run === fn) ?? null;

/** Whether any step of the boot runs a function of this name: what a test says the boot does not install. */
export const bootRunsOneNamed = (name) => FRAME_INSTALLS.some((step) => step.run.name === name);

/** A step of the boot by its name (bridge/boot/installs.ts), to run on its own. */
export function bootStep(name) {
  const step = FRAME_INSTALLS.find((s) => s.name === name);
  if (!step) throw new Error(`no step of the boot is named ${name}`);
  return step;
}
