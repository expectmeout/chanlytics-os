/**
 * Today's chrome (routes.ts): its crumb, and what its head says from the frame's first draw (kit/head/standing.ts
 * HeadFirst). The head drew the crumb, "Today", until the page was read, then the greeting in its place, or on a phone
 * nothing and a greeting of the page's own lower down: two headlines on every load, the second 7 seconds after the first
 * on a phone (Ruben, 31 Oct 2026: "only one", in the old Today's type). The greeting needs only who is signed in and the
 * business's clock, which the frame holds before any page is read, so the address says it from the first draw, in the page
 * head's own type, and the page says the same words once it is in (pages/today-head.tsx). Listen stands at the end of the
 * sentence under the greeting, which the page says, so the greeting's line holds nothing that comes later. Words alone,
 * read off the window as asked: the frame's route table loads this module before any page, so it draws nothing and takes no hook as it
 * loads (today/shell.ts takes React's for `useMoved`, which a test's stand-in React must be in place before).
 */
import type { PageClock } from "@/legacy-bridge/zone";
import type { HeadFirst } from "../kit/head/standing";
import { windowObject } from "../legacy-verbs";

/**
 * Who is signed in (`window.__ME`, the workspace's read), for the greeting, and the business's clock (`window.__clock`, as
 * shell.ts reads it).
 */
const signedInMember = () => windowObject<{ display_name?: string | null }>("__ME");
const businessClock = () => windowObject<PageClock>("__clock");

/** "Good morning, Marisa": by the hour in the business's zone, to the first name; without a name, the greeting alone. */
export function todayGreeting(nowMs: number, zone: string, displayName: string | null | undefined): string {
  const hour = Number(
    new Date(nowMs).toLocaleTimeString("en-US", { hour: "numeric", hour12: false, timeZone: zone }).slice(0, 2),
  );
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (displayName ?? "").trim().split(/\s+/)[0];
  return first ? `${hello}, ${first}` : hello;
}

/** The greeting now, to the member signed in, by the business's clock. */
export const todayGreetingNow = (): string =>
  todayGreeting(Date.now(), businessClock()?.zone() ?? "UTC", signedInMember()?.display_name);

/** Today's one crumb, one array, so the head is told it once. */
const TODAY_CRUMBS = ["Today"];

/** The head the address says first: the greeting. */
function todayHead(): HeadFirst {
  return { title: todayGreetingNow() };
}

/** What the frame draws around Today: its crumb, and its head from the first draw. */
export function todayChrome() {
  return { crumbs: TODAY_CRUMBS, head: todayHead() };
}
