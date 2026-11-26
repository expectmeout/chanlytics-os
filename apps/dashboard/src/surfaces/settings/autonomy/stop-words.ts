/**
 * Stop everything's words on Settings › Autonomy (D22 of the answers canvas): its row, read from what the stop keeps, and
 * what a press says, read from its answer (server/ask/act/stop.ts). Never "paused" while something it reached still goes out
 * on its own: what still goes, that pressing again tries again, and the one other way to do it by hand (a sequence's own
 * pause on Campaigns, the Replies row above). Once the stop is written nothing goes out on its own, and a person's own
 * reply still does, so it says both.
 *
 * Ads (the content loop PRD's 14.1, call 21): the stop pauses the ads made here itself, and says how many; an ad made in
 * Meta is told of, and paused from Ads. Resume never turns an ad on: it says how many the stop paused, and the owner's
 * own press turns them back on.
 */
import type { AskStopped } from "@chanlytics/contracts";
import { listOrEmpty, valueAt } from "@chanlytics/contracts";

/** An ad the stop paused that stands so, as the press's answer names it for the owner's own press. */
export interface StoppedAd {
  id: string;
  name: string;
  version: number;
}

/** What a press answered: whether Stop everything is wholly on, what it holds paused, replies, and what still sends. */
export interface StopPressed {
  stopped: boolean;
  paused: number;
  replies: boolean;
  left: number;
  /** The ads: made here and paused now, made here and still on, made in Meta and still on, and those it holds paused. */
  ads: { paused: number; still_on: number; in_meta: number; waiting: StoppedAd[] };
}

/** The row: what it says, and whether its press stops (a first press, or again) or resumes. */
interface StopLine {
  label: string;
  hint: string;
  press: "stop" | "resume";
}

const sequenceCount = (n: number): string => (n === 1 ? "1 sequence" : `${n} sequences`);
const isAre = (n: number): string => (n === 1 ? "is" : "are");
const itThem = (n: number): string => (n === 1 ? "it" : "them");

/** After a stop that could not stop everything: what still goes out, and the two ways to it. */
function stillGoing(sending: number, repliesGo: boolean): string {
  const clauses = [
    sending > 0 ? `${sequenceCount(sending)} ${isAre(sending)} still sending` : "",
    repliesGo ? `${sending > 0 ? "replies" : "Replies"} still go out on their own` : "",
  ].filter(Boolean);
  const byHand = [
    sending > 0 ? `pause ${itThem(sending)} on Campaigns` : "",
    repliesGo ? "set Replies above to Asks you" : "",
  ].filter(Boolean);
  return `${clauses.join(", and ")}. Press Stop everything again to try again, or ${byHand.join(" and ")}.`;
}

/** After a Resume that could not put everything back: what is still held, and the two ways to it. */
function stillHeld(paused: number, repliesWait: boolean): string {
  const clauses = [
    paused > 0 ? `${sequenceCount(paused)} ${isAre(paused)} still paused` : "",
    repliesWait ? `${paused > 0 ? "replies" : "Replies"} still wait for you` : "",
  ].filter(Boolean);
  const byHand = [
    paused > 0 ? `start ${itThem(paused)} on Campaigns` : "",
    repliesWait ? "set Replies above as you had them" : "",
  ].filter(Boolean);
  return `${clauses.join(", and ")}. Press Resume again to try again, or ${byHand.join(" and ")}.`;
}

/** The row, from what Stop everything keeps: off, wholly on, on with something still going, or not all of it back. */
/** The stop the workspace's config keeps (its `ask.stopped`), read field by field: none where it holds no time. */
export function askStoppedOf(kept: unknown): AskStopped | null {
  const at = valueAt(kept, "at");
  if (typeof at !== "string") return null;
  const words = (key: string) => listOrEmpty(valueAt(kept, key)).filter((x): x is string => typeof x === "string");
  const reply = valueAt(kept, "reply");
  const left = valueAt(kept, "left");
  const repliesLeft = valueAt(kept, "replies_left");
  const resumedAt = valueAt(kept, "resumed_at");
  return {
    at,
    playbooks: words("playbooks"),
    reply: typeof reply === "string" ? reply : null,
    ...(Array.isArray(left) ? { left: words("left") } : {}),
    ...(typeof repliesLeft === "boolean" ? { replies_left: repliesLeft } : {}),
    ...(typeof resumedAt === "string" ? { resumed_at: resumedAt } : {}),
  };
}

export function stopLineOf(kept: AskStopped | null): StopLine {
  if (!kept)
    return { label: "All sending", hint: "Pauses every send and holds replies for you, at once.", press: "stop" };
  const sending = kept.left?.length ?? 0;
  if (sending > 0 || kept.replies_left === true)
    return {
      label: "Not everything stopped",
      hint: stillGoing(sending, kept.replies_left === true),
      press: "stop",
    };
  if (kept.resumed_at)
    return {
      label: "Not everything came back",
      hint: stillHeld(kept.playbooks.length, kept.reply !== null),
      press: "resume",
    };
  return {
    label: "Everything is paused",
    hint: "Nothing goes out on its own until you resume. Your own replies still send.",
    press: "resume",
  };
}

const adsCount = (n: number): string => (n === 1 ? "1 ad" : `${n} ads`);
const wasWere = (n: number): string => (n === 1 ? "was" : "were");

/** After a stop, what came of the ads: the ones made here it paused, and any still on, with where to pause them. */
function adsStopped(ads: StopPressed["ads"]): string {
  const on = ads.still_on + ads.in_meta;
  return [
    ads.paused > 0 ? `It paused ${adsCount(ads.paused)} made here.` : "",
    ads.in_meta > 0 && ads.still_on === 0
      ? `${adsCount(ads.in_meta)} made in Meta ${ads.in_meta === 1 ? "is" : "are"} still on: pause ${itThem(ads.in_meta)} on Ads.`
      : "",
    ads.still_on > 0 ? `${adsCount(on)} ${on === 1 ? "is" : "are"} still on: pause ${itThem(on)} on Ads.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** What a press says: done, or what it could not do and the way to it. Whether it is a warning rides with the words. */
export function stopSaid(press: StopLine["press"], answer: StopPressed): { words: string; warn: boolean } {
  const ads = adsStopped(answer.ads);
  const stillOn = answer.ads.still_on + answer.ads.in_meta > 0;
  if (press === "stop")
    return answer.stopped
      ? { words: ["Everything is paused. Nothing goes out on its own.", ads].filter(Boolean).join(" "), warn: stillOn }
      : { words: `Not everything stopped. ${stillGoing(answer.left, !answer.replies)} ${ads}`.trim(), warn: true };
  const held = answer.ads.waiting.length;
  const kept = held > 0 ? ` ${adsCount(held)} ${wasWere(held)} paused with it, and stay paused.` : "";
  return answer.stopped
    ? { words: `Not everything came back. ${stillHeld(answer.paused, answer.replies)}${kept}`, warn: true }
    : { words: `Back as it was.${kept}`, warn: false };
}

/**
 * After a Resume, the ads the stop paused that stand so, as a row with the owner's own press (turning an ad on spends,
 * so Resume never does it); null where none waits.
 */
export function stoppedAdsLineOf(waiting: readonly StoppedAd[]): { hint: string; press: string } | null {
  const n = waiting.length;
  if (n === 0) return null;
  return {
    hint: `${adsCount(n)} made here ${wasWere(n)} paused with Stop everything, and ${n === 1 ? "stays" : "stay"} paused until you turn ${itThem(n)} back on.`,
    press: n === 1 ? "Turn it back on" : `Turn ${n} back on`,
  };
}
