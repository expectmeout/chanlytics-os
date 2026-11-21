/**
 * The owner's changes to a running ad made here, from its drawer (the Ads plan's 4.5; decision 0050, calls 3 and 10):
 * a new total, a new last day, new miles, ending it for good, and Fix it for one Meta turned down. Each change carries
 * the version the drawer was drawn from and what Meta held then, says what it came to in a toast, and reads the page
 * again. A change Meta took, or one waiting for Meta's thirty seconds, can be taken back from its toast, drawn afresh
 * from the ad as the page last read it; ending cannot. A change Meta gave no answer to is never sent again: the page
 * looks again until the account's read has settled it. Fix it opens New ad on the draft AI's change made.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_MS, SECOND_MS, newAdRoute } from "@chanlytics/contracts";
import type { AdChangeAsk, AdLiveDto } from "@chanlytics/contracts";
import { pressAdChange, pressAdFix } from "@/bridge/verbs/ads";
import type { FrameFlash } from "../../../frame-verbs";
import { ADS_DEFAULT_CURRENCY } from "../model/money";
import { changeToastOf } from "./change-model";
import { SHEET } from "./words";

/** When the page looks again after a change Meta gave no answer to: the account's read is asked for at once. */
const UNSURE_LOOKS_MS: readonly number[] = [30 * SECOND_MS, 150 * SECOND_MS, 5 * MIN_MS];

interface ChangesOf {
  ads: readonly AdLiveDto[];
  currency: string | null;
  again: () => void;
  flash: (flash: FrameFlash) => void;
  onGo: (route: string) => void;
}

/** The drawer's changes to an ad made here. */
export interface AdChangeActs {
  /** A change, and the one that takes it back from its toast. */
  change: (id: string, ask: AdChangeAsk, back: AdChangeAsk | null) => void;
  end: (id: string) => void;
  fix: (id: string) => void;
  /** Fix it is out: AI is rewriting. */
  fixing: boolean;
  changing: boolean;
}

export function useAdChanges({ ads, currency, again, flash, onGo }: ChangesOf): AdChangeActs {
  const [changing, setChanging] = useState(false);
  const [fixing, setFixing] = useState(false);
  const looks = useRef<number[]>([]);
  // The ads as the page last read them: an Undo is drawn from the ad as it stands then, never from the press before.
  const latest = useRef(ads);
  useEffect(() => {
    latest.current = ads;
  }, [ads]);
  useEffect(() => () => looks.current.forEach((timer) => window.clearTimeout(timer)), []);
  const change = useCallback(
    async (id: string, ask: AdChangeAsk, back: AdChangeAsk | null): Promise<void> => {
      const ad = latest.current.find((one) => one.id === id);
      if (!ad) return;
      setChanging(true);
      const answer = await pressAdChange(ad, ask);
      setChanging(false);
      again();
      if (answer === null) return flash({ tone: "warn", msg: SHEET.failed });
      if (!answer.ok) return flash({ tone: "warn", msg: answer.message });
      const { outcome } = answer.data;
      if (outcome === "sent") looks.current.push(...UNSURE_LOOKS_MS.map((ms) => window.setTimeout(again, ms)));
      const toast = changeToastOf(ask, outcome, { name: ad.name, currency: currency ?? ADS_DEFAULT_CURRENCY });
      // Taken back with the ad as the page reads it by then: its new version, and what Meta holds after this change.
      const undo = toast.undoable && back !== null ? () => void change(id, back, null) : null;
      return flash({ msg: toast.msg, ...(toast.tone ? { tone: toast.tone } : {}), undo });
    },
    [again, currency, flash],
  );
  const fix = useCallback(
    async (id: string): Promise<void> => {
      setFixing(true);
      const answer = await pressAdFix(id);
      setFixing(false);
      if (answer === null) return flash({ tone: "warn", msg: SHEET.failed });
      if (!answer.ok) return flash({ tone: "warn", msg: answer.message });
      return onGo(newAdRoute());
    },
    [flash, onGo],
  );
  return {
    change: (id, ask, back) => void change(id, ask, back),
    end: (id) => void change(id, { what: "end" }, null),
    fix: (id) => void fix(id),
    fixing,
    changing,
  };
}
