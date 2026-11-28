/**
 * A launch's switches (launch.ts; decision 0050, calls 5, 6 and 11): every part switched on from the bottom, the ads, the
 * ad set, the campaign, so the last switch is the one that lets the ad start. Each is kept as going before Meta is asked
 * for it and as done once Meta answered, so a run that dies with one out is known to have sent it: the next pass asks
 * Meta what it holds before it sends anything. What stops a switch is read fresh before each one.
 */
import { metaAdSwitchRequest, metaConfirmed } from "@chanlytics/channels/ads";
import { isAdLaunchCancelled } from "@chanlytics/db/ads";
import { isSendingStopped } from "@chanlytics/db/workspace";
import { readWayIn } from "../chat/answered.js";
import {
  LAST_SWITCH,
  readCampaignBack,
  hasRoom,
  keepStep,
  letGoFor,
  metaWordsOf,
  send,
  switchedOf,
  unanswered,
  type Pass,
  type Step,
  type Stopping,
} from "./pass.js";

/**
 * What stops the next switch, read fresh before each one: no room left in this pass; AI stopped, since nobody would answer
 * the people it brings (0050, call 11); a cancel its owner pressed meanwhile, so none goes after they said stop; and, just
 * before the first, a way in that closed since the press, of the exact number the ad names (call 11). Null: switch it.
 */
async function checkBeforeSwitch(pass: Pass, first: boolean): Promise<Step | null> {
  if (!hasRoom(pass)) return { wait: true };
  if (await isSendingStopped(pass.db, pass.who.tenantId)) return { stop: "ai_stopped", said: null };
  if (await isAdLaunchCancelled(pass.db, pass.who.tenantId, pass.ad.id)) return { stop: "cancelled", said: null };
  if (first && (await readWayIn(pass.db, pass.who.tenantId, pass.approved.whatsapp)) !== "open")
    return { stop: "way_in", said: null };
  return null;
}

/** One part's switch: what the pass calls it, and Meta's id for the part. */
interface PartSwitch {
  key: string;
  id: string;
}

/** What one part's switch came to: the next part's turn, the ad made (null), or how the pass ended. */
type Switched = Step | "next" | null;

/**
 * A switch a run before this one kept as going and never kept the answer of: Meta is asked what it holds before anything
 * is sent. `on`: the switch went, and is never sent again. `paused`: Meta never took it. Else how the pass ended, where
 * Meta could not be read just now; a part Meta's answer does not name is read again, never guessed.
 */
async function switchHeld(
  pass: Pass,
  built: { campaign: string; set: string; ads: string[] },
  part: PartSwitch,
): Promise<"on" | "paused" | Exclude<Step, { id: string }>> {
  const held = await readCampaignBack(pass, built, "switched");
  if (!("sets" in held)) return held;
  const paused =
    part.key === LAST_SWITCH
      ? held.paused
      : part.key === "set"
        ? held.sets.find((one) => one.id === part.id)?.paused
        : held.ads.find((one) => one.id === part.id)?.paused;
  if (paused === undefined) return { wait: true };
  return paused ? "paused" : "on";
}

/** No switch of the launch is out, as this pass knows it: Meta holds the part paused, or the door let the launch go. */
function noSwitchOut(pass: Stopping): void {
  pass.launch.switching = null;
}

/** A switch kept as done: the next part's turn, or the ad made where it was the last. */
async function switchDone(pass: Pass, done: Set<string>, part: PartSwitch): Promise<Switched> {
  done.add(part.key);
  const kept = await keepStep(pass, { launch: { step: "switch", switched: [...done], switching: null } });
  // The last switch went before its cancel was seen: the ad is made and paused at once (ad_launch_keep), so its own
  // pause, followed at Meta's pace, stops it, never a removal that may not land while it runs.
  if (kept === "cancelled" && part.key === LAST_SWITCH) return null;
  return kept === "going" ? "next" : letGoFor(kept);
}

/**
 * One part switched on, once. Kept as going before Meta is asked, so a run that dies with it out is known to have sent
 * it; where Meta took nothing of it (refused, held back, its sign-in gone) it is kept as no longer out.
 */
async function switchPart(pass: Pass, done: Set<string>, part: PartSwitch): Promise<Switched> {
  const out = await keepStep(pass, { launch: { step: "switch", switching: part.key } });
  if (out !== "going") {
    // Let go of before it went: nothing of it is out, and the stop is an ordinary one.
    noSwitchOut(pass);
    return letGoFor(out);
  }
  const { token, appSecret } = pass.who.signIn;
  const answer = await send(pass, `switch_${part.key}`, metaAdSwitchRequest(token, appSecret, part.id, "ACTIVE"));
  if (answer.fault !== null && answer.fault !== "silent") {
    await keepStep(pass, { launch: { switching: null } });
    if (answer.fault === "revoked") return { revoked: true };
    if (answer.fault === "slowed") return { wait: true };
    return { stop: "refused", said: metaWordsOf(answer) };
  }
  // Unanswered, it went or it did not: it is never sent again, and the account's read says which.
  if (answer.fault === "silent" || !metaConfirmed(answer.json)) await unanswered(pass);
  return switchDone(pass, done, part);
}

/** Every part switched on from the bottom, each once: the ads, the ad set, the campaign. How the pass ended, or done. */
export async function activateAll(
  pass: Pass,
  built: { campaign: string; set: string; ads: string[] },
): Promise<Step | null> {
  const done = new Set(switchedOf(pass.launch));
  const order: PartSwitch[] = [
    ...built.ads.map((id, nth) => ({ key: `ad:${nth + 1}`, id })),
    { key: "set", id: built.set },
    { key: LAST_SWITCH, id: built.campaign },
  ];
  for (const part of order) {
    if (done.has(part.key)) continue;
    let outcome: Switched = "next";
    if (pass.launch.switching === part.key) {
      // Out since a run that died: Meta's word first. Paused there, it is sent as any switch is, after what stops one.
      const held = await switchHeld(pass, built, part);
      if (held !== "on" && held !== "paused") return held;
      if (held === "on") outcome = await switchDone(pass, done, part);
      else noSwitchOut(pass);
    }
    if (!done.has(part.key)) {
      const stops = await checkBeforeSwitch(pass, done.size === 0);
      if (stops) return stops;
      outcome = await switchPart(pass, done, part);
    }
    if (outcome !== "next") return outcome;
  }
  return null;
}
