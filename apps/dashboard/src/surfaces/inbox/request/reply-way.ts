/**
 * How a request can be answered, from how its person can be written to (the send door's answer, GET people/[id]/reach).
 *
 * A module of its own and pure: the request's page reads it, and a test runs it with no page.
 */
import { CHANNEL_WORDS, type PersonReachDto, type WriteWay } from "@chanlytics/contracts";

/**
 * The way a reply to them goes: the chat they already have while it is open for a member's own words (the canvas's
 * call 12), else an email. Null where neither can carry one now, with the email door's own reason. `unchecked` where
 * the door could not be asked just now: that is no reason, so the page says it could not check and offers to again,
 * and never that nothing can be sent.
 */
export function replyWayOf(reach: PersonReachDto | null): {
  way: WriteWay | null;
  why: string | null;
  unchecked: boolean;
} {
  if (!reach) return { way: null, why: null, unchecked: false };
  const chat = reach.ways.find((w) => w.wire === "whatsapp" && w.ok && w.carries === "words" && !w.starts);
  const email = reach.ways.find((w) => w.wire === "email");
  if (chat) return { way: chat, why: null, unchecked: false };
  if (email?.ok) return { way: email, why: null, unchecked: false };
  // The one sentence for a road nobody could ask about (contracts' channel words): told from a reason by being it.
  if (email?.hold === "not_ready" && email.why === CHANNEL_WORDS.unchecked)
    return { way: null, why: null, unchecked: true };
  return { way: null, why: email?.why ?? null, unchecked: false };
}
