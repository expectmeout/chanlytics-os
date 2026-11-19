/**
 * The owner's two presses on an ad, from the page (the Ads plan's 4.5): Pause, and turning one back on. Each carries
 * the version the drawer was drawn from, says what it came to in a toast, and reads the page again. A pause can be
 * undone from its toast where the ad could be turned back on here (the plan's C1) or Meta had not been told yet; a
 * resume's Undo is a pause, always. A refusal is said in the words the server gave: what happened, and what to do.
 *
 * A change Meta gave no answer to is never sent again (decision 0050): the toast says it is not known yet whether
 * Meta took it, the edge has asked for the account's read, and the page looks again a few times over the next minutes
 * until that read is in. No Undo is offered on it: there is nothing known to undo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { adResumeRule, MIN_MS, SECOND_MS } from "@chanlytics/contracts";
import type { AdLiveDto } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import type { FrameFlash } from "../../../frame-verbs";
import type { SheetActs } from "./ad-sheet";
import { SHEET } from "./words";

type Press = "pause" | "resume";

/** Whether a pause of this ad can be taken back from here once Meta holds it paused. */
const mayUndoPause = (ad: AdLiveDto): boolean =>
  adResumeRule(
    {
      origin: ad.made_in_platform ? "platform" : "chanlytics",
      platform_state: "PAUSED",
      budget_kind: ad.budget?.kind ?? null,
      budget_left_minor: ad.budget?.left_minor ?? null,
      budget_shared: ad.budget?.shared ?? null,
      ends_at: ad.ends_at,
    },
    Date.now(),
  ).ok;

/** What a press that was taken says. */
function saidOf(press: Press, outcome: string, name: string): string {
  if (outcome === "sent") return press === "pause" ? SHEET.pauseUnsure(name) : SHEET.resumeUnsure(name);
  if (press === "pause") return outcome === "soon" ? SHEET.pausedSoon(name) : SHEET.paused(name);
  return outcome === "soon" ? SHEET.resumedSoon(name) : SHEET.resumed(name);
}

/** When the page looks again after a change Meta gave no answer to: the account's read is asked for two minutes on. */
const UNSURE_LOOKS_MS: readonly number[] = [30 * SECOND_MS, 150 * SECOND_MS, 5 * MIN_MS];

interface PressesOf {
  ads: readonly AdLiveDto[];
  /** Read the page again. */
  again: () => void;
  flash: (flash: FrameFlash) => void;
}

export function useAdPresses({ ads, again, flash }: PressesOf): SheetActs {
  const [busy, setBusy] = useState(false);
  const looks = useRef<number[]>([]);
  useEffect(() => () => looks.current.forEach((timer) => window.clearTimeout(timer)), []);
  const press = useCallback(
    async (kind: Press, id: string, version: number, undoable: boolean): Promise<void> => {
      const ad = ads.find((one) => one.id === id);
      setBusy(true);
      const answer = await api()(kind === "pause" ? "POST ads/[id]/pause" : "POST ads/[id]/resume", {
        params: { id },
        body: { version },
      }).catch(() => null);
      setBusy(false);
      again();
      if (answer === null) return flash({ tone: "warn", msg: SHEET.failed });
      if (!answer.ok) return flash({ tone: "warn", msg: answer.message });
      const { outcome, version: next } = answer.data;
      if (outcome === "sent") looks.current.push(...UNSURE_LOOKS_MS.map((ms) => window.setTimeout(again, ms)));
      // A pause Meta has not been told of yet is always the owner's to take back; one Meta holds, only under the rule;
      // one Meta gave no answer to, never: what stands is not known.
      const back =
        outcome !== "sent" && (kind === "resume" || outcome === "soon" || (ad !== undefined && mayUndoPause(ad)))
          ? () => void press(kind === "pause" ? "resume" : "pause", id, next, false)
          : null;
      return flash({ msg: saidOf(kind, outcome, ad?.name ?? ""), undo: undoable ? back : null });
    },
    [ads, again, flash],
  );
  return {
    busy,
    pause: (id, version) => void press("pause", id, version, true),
    resume: (id, version) => void press("resume", id, version, true),
  };
}
