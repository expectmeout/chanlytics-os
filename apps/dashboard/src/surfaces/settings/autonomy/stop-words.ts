/**
 * Stop everything's words on Settings › Autonomy (D22 of the answers canvas): its row, read from what the stop keeps, and
 * what a press says, read from its answer (server/ask/act/stop.ts). Never "paused" while something it reached still goes out
 * on its own: what still goes, that pressing again tries again, and the one other way to do it by hand (a sequence's own
 * pause on Campaigns, the Replies row above).
 */
import type { AskStopped } from "@chanlytics/contracts";

/** What a press answered: whether Stop everything is wholly on, what it holds paused, replies, and what still sends. */
export interface StopPressed {
  stopped: boolean;
  paused: number;
  replies: boolean;
  left: number;
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
    hint: `${kept.playbooks.length} paused, and replies wait for you.`,
    press: "resume",
  };
}

/** What a press says: done, or what it could not do and the way to it. Whether it is a warning rides with the words. */
export function stopSaid(press: StopLine["press"], answer: StopPressed): { words: string; warn: boolean } {
  if (press === "stop")
    return answer.stopped
      ? { words: "Everything is paused. Nothing goes out.", warn: false }
      : { words: `Not everything stopped. ${stillGoing(answer.left, !answer.replies)}`, warn: true };
  return answer.stopped
    ? { words: `Not everything came back. ${stillHeld(answer.paused, answer.replies)}`, warn: true }
    : { words: "Back as it was.", warn: false };
}
