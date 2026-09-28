/**
 * How long the phone app takes from a cold start to a Today a person can read, measured on the device. Each run stops
 * the app, starts it, and reads its Today page through DevTools until the page has its data (window.TODAY_DATA, which
 * the page publishes only once Today's reads have answered). A run says, from the moment it started the app: the
 * system's own launch measure (to the first frame), when the site answered the page, its first paint, and when Today
 * was drawn. The median of the runs closes.
 *
 *   node tooling/scripts/mobile/cold-start.mjs [--runs 5]
 *
 * Signed in (sign-in.mjs), on a preview or development build (DevTools). Every time is the device's own clock.
 */
import { pathToFileURL } from "node:url";
import {
  device,
  deviceNow,
  devtools,
  installed,
  median,
  pagesNow,
  sleep,
  startApp,
  stopApp,
  waitFor,
} from "./device.mjs";

const RUNS = 5;
/** The longest a run waits for Today before it says so. */
const TODAY_MS = 90_000;
/** Between runs: the stopped process leaves, and the next start is a cold one. */
const SETTLE_MS = 3_000;
/** How often a run reads the page. */
const LOOK_MS = 100;

/** What a run reads of the page, on the page's own clock (ms from the start of its navigation). */
const READ = `(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const paint = performance.getEntriesByName("first-contentful-paint")[0];
  return {
    origin: performance.timeOrigin,
    now: performance.now(),
    server: nav ? nav.responseStart : null,
    paint: paint ? paint.startTime : null,
    today: !!window.TODAY_DATA,
  };
})()`;

/** A page's own times, moved to the run's clock: ms from the moment the run started the app. */
export function fromTheStart(startedAt, read) {
  const page = read.origin - startedAt;
  const at = (ms) => (ms === null ? null : Math.round(page + ms));
  return { server: at(read.server), paint: at(read.paint), today: at(read.now) };
}

async function coldStart() {
  stopApp();
  await sleep(SETTLE_MS);
  const startedAt = deviceNow();
  const launch = startApp();
  const target = await waitFor(
    "the Today page",
    async () => {
      const pages = await pagesNow();
      if (pages.some((p) => new URL(p.url).pathname === "/login")) {
        throw new Error("the app is signed out: run sign-in.mjs first");
      }
      return pages.find((p) => p.url.includes("#/today")) ?? null;
    },
    TODAY_MS,
  );
  const page = devtools(target.webSocketDebuggerUrl);
  try {
    for (let look = 0; ; look++) {
      const read = await page.evaluate(READ);
      if (read.today) return { launch, ...fromTheStart(startedAt, read), atFirstLook: look === 0 };
      if (Date.now() - startedAt > TODAY_MS) throw new Error("Today's data never came");
      await sleep(LOOK_MS);
    }
  } finally {
    page.close();
  }
}

const seconds = (ms) => (ms === null ? "   -  " : `${(ms / 1000).toFixed(1).padStart(5)}s`);

async function main() {
  const at = process.argv.indexOf("--runs");
  const runs = at > 0 ? Number(process.argv[at + 1]) : RUNS;
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs takes a whole number");
  console.log(`${device()}, the app ${installed() ?? "(not installed)"}: ${runs} cold starts\n`);
  console.log("run  launch  server  paint   Today");
  const all = [];
  for (let i = 1; i <= runs; i++) {
    const r = await coldStart();
    all.push(r);
    const note = r.atFirstLook ? "  (drawn by the first look: at most this)" : "";
    console.log(
      `${String(i).padStart(3)} ${seconds(r.launch)} ${seconds(r.server)} ${seconds(r.paint)} ${seconds(r.today)}${note}`,
    );
  }
  const mid = (key) => median(all.map((r) => r[key]).filter((v) => v !== null));
  console.log(
    `med ${seconds(mid("launch"))} ${seconds(mid("server"))} ${seconds(mid("paint"))} ${seconds(mid("today"))}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
