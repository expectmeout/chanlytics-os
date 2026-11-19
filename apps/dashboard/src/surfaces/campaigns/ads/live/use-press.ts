/**
 * The owner's two presses on an ad, from the page (the Ads plan's 4.5): Pause, and turning one back on. Each carries
 * the version the drawer was drawn from, says what it came to in a toast, and reads the page again. A pause can be
 * undone from its toast where the ad could be turned back on here (the plan's C1) or Meta had not been told yet; a
 * resume's Undo is a pause, always. A refusal is said in the words the server gave: what happened, and what to do.
 */
import { useCallback, useState } from "react";
import { adResumeRule } from "@chanlytics/contracts";
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

/** What a press that worked says. */
function saidOf(press: Press, outcome: string, name: string): string {
  const waiting = outcome === "soon" || outcome === "sent";
  if (press === "pause") return waiting ? SHEET.pausedSoon(name) : SHEET.paused(name);
  return waiting ? SHEET.resumedSoon(name) : SHEET.resumed(name);
}

interface PressesOf {
  ads: readonly AdLiveDto[];
  /** Read the page again. */
  again: () => void;
  flash: (flash: FrameFlash) => void;
}

export function useAdPresses({ ads, again, flash }: PressesOf): SheetActs {
  const [busy, setBusy] = useState(false);
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
      // A pause Meta has not been told of yet is always the owner's to take back; one Meta holds, only under the rule.
      const back =
        kind === "resume" || outcome === "soon" || (ad !== undefined && mayUndoPause(ad))
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
