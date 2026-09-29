/**
 * The phone app walked end to end on an Android emulator or phone: its data cleared to the sign-in screen, signed in
 * as the e2e owner, then each tab, the bell's sheet and Back, More's drawer and a chart's CSV to the share sheet
 * (apps/mobile/.maestro/walk.yml), and last More pressed again while in front, with a touch. Every screenshot is
 * copied to --out. With --store it takes the store listing's screenshots instead (store.yml), on a display of
 * 1080 x 1920, the Play Store's phone shape, and puts the display back whatever happens.
 *
 *   node --env-file=apps/dashboard/.env.local --import tsx tooling/scripts/mobile/walk.mjs [--out <dir>] [--store]
 *
 * Needs Maestro (MAESTRO names its launcher, else `maestro` on the PATH; it runs on a JDK 17 or newer) and what
 * sign-in.mjs needs. It says which bundle it walked: clearing the app's data drops a downloaded update, which the app
 * fetches again while it signs in and runs from the walk's cold start, so an update just published may need a second
 * walk. docs/runbook.md, "Walk the phone app", has the setup.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signInTheApp } from "./sign-in.mjs";
import {
  appLog,
  clearLog,
  device,
  devtools,
  installed,
  launchOf,
  onScreen,
  pagesNow,
  shell,
  tap,
  waitFor,
} from "./device.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FLOWS = path.join(REPO, "apps/mobile/.maestro");
/** The Play Store's phone shape, 9:16. */
const STORE_DISPLAY = "1080x1920";
const ANSWER_MS = 10_000;

/** A command, through the shell on Windows (Maestro's launcher is a .bat there), each argument quoted for it. */
function run(command, args) {
  const windows = process.platform === "win32";
  const quote = (a) => (windows && /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
  const done = spawnSync(quote(command), args.map(quote), { stdio: "inherit", shell: windows });
  return done.status ?? 1;
}

/** One of the app's flows, its artifacts under `out`. Throws with where to look when it fails. */
function maestro(flow, out) {
  const args = ["--no-ansi", "--device", process.env.ANDROID_SERIAL, "test", "--test-output-dir", out];
  if (run(process.env.MAESTRO || "maestro", [...args, path.join(FLOWS, flow)]) !== 0) {
    throw new Error(`${flow} failed: Maestro's screenshots and log are under ${out}`);
  }
}

/**
 * More pressed again while in front, as a finger does it: a selected tab takes no click, which is why the flow cannot.
 * The page must hear the shell ask for its drawer (legacy-bridge/app-bridge.ts `shell:menu`), and draw it.
 */
async function moreAgain() {
  const target = (await pagesNow()).find((p) => p.url.includes("#/reports"));
  if (!target) throw new Error("More's page is not Reports, where the walk leaves it");
  const page = devtools(target.webSocketDebuggerUrl);
  try {
    await page.evaluate(`window.__walkAsks = 0; addEventListener("shell:menu", () => window.__walkAsks++); true`);
    // The bar's item is the lowest "More" on the screen: a page may say the word too.
    const [item] = onScreen(/^More$/).sort((a, b) => b.y - a.y);
    if (!item) throw new Error("no More in the tab bar");
    tap(item);
    await waitFor(
      "the page to hear More pressed again",
      async () => (await page.evaluate("window.__walkAsks")) > 0,
      ANSWER_MS,
    );
    await waitFor("More's drawer", () => onScreen(/Your account/).length > 0, ANSWER_MS);
  } finally {
    page.close();
  }
  shell("input", "keyevent", "KEYCODE_BACK");
}

/**
 * Every screenshot the flows took, copied flat into `to`, in name order. `rename` maps a flow's name for a shot to
 * the one it takes here: the sign-in screen is the walk's first shot and the listing's sixth.
 */
function collectShots(from, to, rename = {}) {
  fs.mkdirSync(to, { recursive: true });
  const shots = fs
    .readdirSync(from, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".png") && f.split(/[\\/]/).includes("takeScreenshot"));
  const names = shots.map((f) => rename[path.basename(f)] ?? path.basename(f));
  shots.forEach((f, i) => fs.copyFileSync(path.join(from, f), path.join(to, names[i])));
  return names.sort();
}

/** The bundle a launch ran, in words. */
function bundleOf(launch) {
  if (!launch) return "unknown (the app said nothing of its launch)";
  if (launch.embedded) return "the build's own bundle";
  return `update ${launch.update}, published ${launch.publishedAt}, on ${launch.channel}`;
}

async function main() {
  const store = process.argv.includes("--store");
  const at = process.argv.indexOf("--out");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const out = path.resolve(at > 0 ? process.argv[at + 1] : path.join(os.tmpdir(), `chanlytics-walk-${stamp}`));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "chanlytics-maestro-"));

  console.log(`${device()}, the app ${installed() ?? "(not installed)"}${store ? ", the store's screenshots" : ""}`);
  if (store) shell("wm", "size", STORE_DISPLAY);
  try {
    maestro("sign-in-screen.yml", work);
    console.log(`signed in: ${await signInTheApp()}`);
    clearLog();
    maestro(store ? "store.yml" : "walk.yml", work);
    const bundle = bundleOf(launchOf(appLog()));
    if (!store) await moreAgain();
    const shots = collectShots(work, out, store ? { "0-sign-in.png": "6-sign-in.png" } : {});
    console.log(`\nwalked: ${bundle}`);
    if (!store) console.log("More pressed again: the page heard the shell and drew its drawer");
    console.log(`${shots.length} screenshots in ${out}:\n  ${shots.join("\n  ")}`);
  } finally {
    if (store) shell("wm", "size", "reset");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
