/**
 * What Today's rows send, while it can still be stopped (decision 0071, E3 and E7). A reply is the reply's own door: it
 * waits out its grace on the server (core SEND_GRACE_MS), and the row counts down the receipt's `cancelable_until` with
 * Undo, the verb's own undo (contracts replySpec, POST messages/[id]/cancel-send), for the whole of it. A reply to a
 * Google review is public the moment its door is called, so the tab holds it for the same grace before calling it, and
 * calls it at once if the tab is closed first (a keep-alive request): Undo inside the grace means nothing was posted.
 *
 * Held here, not in a row, so a row drawn again, or the section mounted again by a move back to Today, counts on.
 */
import { useSyncExternalStore } from "react";
import { SEND_GRACE_MS, sendCountdown } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/legacy-bridge/verbs/commit";

/** A send on its way: what it is, when it was pressed and when it can no longer be stopped, and how to stop it. */
interface Going {
  pressedMs: number;
  untilMs: number;
  /** Who it goes to and by what, as the row says it. */
  who: string;
  wire: string;
  /** How Undo stops it: the verb's own undo record (a reply's, a person's message's), or the review's post the tab holds. */
  stop: { kind: "reply" | "person_message"; record: Record<string, unknown> } | { kind: "review"; post: ReviewPost };
}

/** A review's reply, posted: `asTabGoes` when the tab is closing, so the request is sent to outlive it (keepalive). */
type ReviewPost = (asTabGoes: boolean) => Promise<boolean>;

/** What became of a send: on its way, gone (sent or posted), or stopped by Undo. */
type SendState = { state: "going"; going: Going } | { state: "gone"; atMs: number } | { state: "stopped" };

/** A review's grace, held in the tab: the reply's own on the server, fifteen seconds (core SEND_GRACE_MS). */
const REVIEW_GRACE_MS = SEND_GRACE_MS;
/** How often a countdown is drawn again while one runs. */
const SEND_TICK_MS = 250;

const sends = new Map<string, SendState>();
const sendHearers = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let ticker: ReturnType<typeof setInterval> | null = null;
let nowMs = Date.now();

function tellSends() {
  sendHearers.forEach((l) => l());
}

/** Count while anything is on its way; stop once nothing is. */
function tick() {
  const any = [...sends.values()].some((s) => s.state === "going");
  if (any && !ticker) {
    ticker = setInterval(() => {
      nowMs = Date.now();
      for (const [key, s] of sends)
        if (s.state === "going" && s.going.stop.kind !== "review" && nowMs >= s.going.untilMs)
          sends.set(key, { state: "gone", atMs: s.going.untilMs });
      tellSends();
      tick();
    }, SEND_TICK_MS);
  }
  if (!any && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

/**
 * Words sent through a door that holds them for its grace (a thread's reply, or a first message to a person): the
 * countdown begins from its receipt. Refused, it says why, and the address an email reply waits on a yes to, where the
 * door asked (`confirmTo`: the same words sent again naming it go).
 */
export async function sendWords(
  key: string,
  r: { kind: "reply" | "person_message"; payload: Record<string, unknown>; who: string; wire: string },
): Promise<{ ok: true } | { ok: false; message: string; confirmTo: string | null }> {
  const pressedMs = Date.now();
  const done = await commitVerb(r.kind, { ...r.payload, who: r.who });
  if (!done.ok) return { ok: false, message: done.message, confirmTo: done.confirmEmailTo ?? null };
  const record = done.undo ?? {};
  const until = typeof record.cancelable_until === "string" ? Date.parse(record.cancelable_until) : NaN;
  nowMs = Date.now();
  sends.set(key, {
    state: "going",
    going: {
      pressedMs,
      untilMs: Number.isFinite(until) ? until : pressedMs,
      who: r.who,
      wire: r.wire,
      stop: { kind: r.kind, record },
    },
  });
  tellSends();
  tick();
  return { ok: true };
}

/** The review posts the tab holds, by key, so a closed tab posts them at once (Undo is gone with the tab). */
const reviewPostsHeld = new Map<string, ReviewPost>();

/** Post what the tab still holds, as the tab goes: a keep-alive request each, which outlives the page. */
function postHeldOnLeave() {
  for (const [key, post] of reviewPostsHeld) {
    reviewPostsHeld.delete(key);
    const t = timers.get(key);
    if (t) clearTimeout(t);
    timers.delete(key);
    // Its timer is cleared, so a tab brought back from the back-forward cache never posts it twice; what it came to stands.
    void post(true).then((ok) => {
      sends.set(key, ok ? { state: "gone", atMs: Date.now() } : { state: "stopped" });
      tellSends();
    });
  }
}
let leaveHooked = false;

/** A review's reply, held for its grace and then posted by `post`, which Undo inside the grace never calls. */
export function holdReviewPost(key: string, r: { who: string; post: ReviewPost }): void {
  const pressedMs = Date.now();
  nowMs = pressedMs;
  reviewPostsHeld.set(key, r.post);
  if (!leaveHooked && typeof window !== "undefined") {
    window.addEventListener("pagehide", postHeldOnLeave);
    leaveHooked = true;
  }
  sends.set(key, {
    state: "going",
    going: {
      pressedMs,
      untilMs: pressedMs + REVIEW_GRACE_MS,
      who: r.who,
      wire: "Google",
      stop: { kind: "review", post: r.post },
    },
  });
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      reviewPostsHeld.delete(key);
      void r.post(false).then((ok) => {
        sends.set(key, ok ? { state: "gone", atMs: Date.now() } : { state: "stopped" });
        tellSends();
      });
    }, REVIEW_GRACE_MS),
  );
  tellSends();
  tick();
}

/** Undo: the reply's own undo, or the review's post never made. Refused (it went), it says why. */
export async function undoSend(key: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const s = sends.get(key);
  if (!s || s.state !== "going") return { ok: true };
  if (s.going.stop.kind === "review") {
    const t = timers.get(key);
    if (t) clearTimeout(t);
    timers.delete(key);
    reviewPostsHeld.delete(key);
    sends.set(key, { state: "stopped" });
    tellSends();
    tick();
    return { ok: true };
  }
  const r = await undoVerb(s.going.stop.kind, s.going.stop.record);
  if (!r.ok) {
    sends.set(key, { state: "gone", atMs: Date.now() });
    tellSends();
    return { ok: false, message: r.message };
  }
  sends.set(key, { state: "stopped" });
  tellSends();
  tick();
  return { ok: true };
}

/** Forget a send that was stopped, so its row draws its words again. */
export function clearSend(key: string): void {
  if (sends.get(key)?.state === "going") return;
  sends.delete(key);
  tellSends();
}

const hearSends = (on: () => void) => {
  sendHearers.add(on);
  return () => sendHearers.delete(on);
};

/** A row's send as it stands, and its countdown: the seconds left and the share of the grace still to run. */
export function useSend(key: string): { s: SendState | null; seconds: number; share: number } {
  const s = useSyncExternalStore(
    hearSends,
    () => sends.get(key) ?? null,
    () => null,
  );
  const n = useSyncExternalStore(
    hearSends,
    () => nowMs,
    () => 0,
  );
  if (!s || s.state !== "going") return { s, seconds: 0, share: 0 };
  const { seconds, share } = sendCountdown(s.going.pressedMs, s.going.untilMs, n);
  return { s, seconds, share };
}
