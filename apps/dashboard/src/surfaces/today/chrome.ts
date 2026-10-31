/**
 * Today's chrome (routes.ts): its crumb, and what its head says from the frame's first draw (kit/head/standing.ts
 * HeadFirst). The head drew the crumb, "Today", until the page was read, then the greeting in its place, or on a phone
 * nothing and a greeting of the page's own lower down: two headlines on every load, the second 7 seconds after the first
 * on a phone (Ruben, 31 Oct 2026: "only one", in the old Today's type). The greeting needs only who is signed in and the
 * business's clock, which the frame holds before any page is read, so the address says it from the first draw, in the page
 * head's own type, and the page says the same words once it is in (pages/today-head.tsx). On a phone the head also holds
 * the seat of Listen, the page's act at the greeting's right, so nothing moves as it comes. Words alone, read off the
 * window as asked: the frame's route table loads this module before any page, so it draws nothing and takes no hook as it
 * loads (today/shell.ts takes React's for `useMoved`, which a test's stand-in React must be in place before).
 */
import type { PageClock } from "@/legacy-bridge/zone";
import type { HeadFirst } from "../kit/head/standing";
import { windowObject } from "../legacy-verbs";
import { todayOnPhone } from "./phone";

/** Who is signed in (`window.__ME`, the workspace's read) and the business's clock (`window.__clock`), as shell.ts reads them. */
const signedInMember = () => windowObject<{ display_name?: string | null }>("__ME");
const businessClock = () => windowObject<PageClock>("__clock");
/** Whether Ask's voice can play here (`window.__ask`, today/shell.ts askSpeech): Listen's seat is held only where it can. */
const askSpeaks = (): boolean => windowObject<{ canSpeak?: () => boolean }>("__ask")?.canSpeak?.() === true;

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

/** The class of Listen's seat, the frame's and the page's alike (phone.css): one width for the seat and the button. */
export const LISTEN_SEAT = "tb-listen-seat";

/** Today's one crumb, one array, so the head is told it once. */
const TODAY_CRUMBS = ["Today"];

/** The head the address says first: the greeting, and on a phone where Ask speaks, Listen's seat beside it. */
function todayHead(): HeadFirst {
  const title = todayGreetingNow();
  return todayOnPhone() && askSpeaks() ? { title, seat: LISTEN_SEAT } : { title };
}

/** What the frame draws around Today: its crumb, and its head from the first draw. */
export function todayChrome() {
  return { crumbs: TODAY_CRUMBS, head: todayHead() };
}
