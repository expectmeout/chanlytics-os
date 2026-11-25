/**
 * The owner's two presses on an ad, from the page (the Ads plan's 4.5): Pause, and turning one back on. Each carries
 * the version the drawer was drawn from, says what it came to in a toast, and reads the page again. A pause can be
 * undone from its toast where the ad could be turned back on here (the plan's C1) or Meta had not been told yet; a
 * resume's Undo is a pause, always. A refusal is said in the words the server gave: what happened, and what to do.
 *
 * A change Meta gave no answer to is never sent again (decision 0050): the toast says it is not known yet whether
 * Meta took it, the edge has asked for the account's read, and the page looks again a few times over the next minutes
 * until that read is in. No Undo is offered on it: there is nothing known to undo.
 *
 * While AI is stopped, one press pauses every ad still on (live/stop.ts): one request, which the server answers only once
 * every pause in it is kept, each told to Meta at Meta's pace after, so a tab closed after the press leaves none running.
 * One toast says what it came to and what Meta still bills. Once AI runs again, one press turns back on the ads the stop
 * paused, the same way; Resume never does (call 21). And Cancel stops an ad made here while it is set up.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { adResumeRule, MIN_MS, SECOND_MS } from "@chanlytics/contracts";
import type { AdLiveDto } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { pressAdCancel, pressAdCheck, pressPauseAll, pressResumeStopped } from "@/bridge/verbs/ads";
import type { FrameFlash } from "../../../frame-verbs";
import type { SheetActs } from "./ad-sheet";
import { STOP, STOPPED_ADS, SHEET } from "./words";

type Press = "pause" | "resume";

/** Whether a pause of this ad can be taken back from here once Meta holds it paused. */
const mayUndoPause = (ad: AdLiveDto): boolean =>
  adResumeRule(
    {
      origin: ad.made_in_platform ? "platform" : "chanlytics",
      intent: "paused",
      platform_state: "PAUSED",
      budget_kind: ad.budget?.kind ?? null,
      budget_left_minor: ad.budget?.left_minor ?? null,
      budget_shared: ad.budget?.shared ?? null,
      ends_at: ad.ends_at,
    },
    Date.now(),
  ).ok;

/** What a press that was taken says. */
function pressSaidOf(press: Press, outcome: string, name: string): string {
  if (outcome === "sent") return press === "pause" ? SHEET.pauseUnsure(name) : SHEET.resumeUnsure(name);
  if (press === "pause") return outcome === "soon" ? SHEET.pausedSoon(name) : SHEET.paused(name);
  return outcome === "soon" ? SHEET.resumedSoon(name) : SHEET.resumed(name);
}

/** One press, to its route: null where the route was not reached. */
const sendPress = (kind: Press, id: string, version: number) =>
  api()(kind === "pause" ? "POST ads/[id]/pause" : "POST ads/[id]/resume", {
    params: { id },
    body: { version },
  }).catch(() => null);

/** What a pause of them all came to: how many each way, and the server's own words where it refused the whole. */
interface PausedAll {
  /** Paused already, or by a turning back on taken back. */
  paused: number;
  /** Kept, and Meta is told at its pace. */
  soon: number;
  /** No answer came: whether they were kept is not known. */
  unknown: number;
  refused: number;
  /** The server's words where it refused the whole press; null where each ad was refused on its own. */
  refusal: string | null;
}

/**
 * Every ad still on, paused in one press (`POST ads/pause-all`): the server keeps every pause before it answers, and Meta
 * is told at its pace, so a tab closed after the press leaves none running. Where no answer came, whether any was kept is
 * not known, and the page looks again; pressed again, each is kept once.
 */
async function pauseTogether(targets: readonly AdLiveDto[]): Promise<PausedAll> {
  const tally: PausedAll = { paused: 0, soon: 0, unknown: 0, refused: 0, refusal: null };
  const answer = await pressPauseAll(targets);
  if (answer === null) return { ...tally, unknown: targets.length };
  if (!answer.ok) return { ...tally, refused: targets.length, refusal: answer.message };
  for (const one of answer.data.ads) {
    if (one.outcome === "soon") tally.soon += 1;
    else if (one.outcome === "same" || one.outcome === "took_back") tally.paused += 1;
    else if (one.outcome === "unknown") tally.unknown += 1;
    else tally.refused += 1;
  }
  return tally;
}

/** The one toast a pause of them all says: what is paused, what waits for Meta, what is not known, or what was refused. */
function pausedAllSaid(tally: PausedAll, of: number): FrameFlash {
  if (tally.refused === of) return { tone: "warn", msg: tally.refusal ?? STOP.notTaken };
  if (tally.refused > 0) return { tone: "warn", msg: STOP.partly(of - tally.refused, of) };
  if (tally.unknown > 0) return { tone: "warn", msg: STOP.notKnown(tally.unknown) };
  return { msg: tally.soon > 0 ? STOP.pausedSoon(of) : STOP.paused(of) };
}

/** The one toast turning back on the ads the stop paused says: on their way, part refused, none taken, or no answer. */
async function resumeTogether(targets: readonly AdLiveDto[]): Promise<FrameFlash> {
  const answer = await pressResumeStopped(targets);
  if (answer === null) return { tone: "warn", msg: STOPPED_ADS.notKnown(targets.length) };
  if (!answer.ok) return { tone: "warn", msg: answer.message };
  const taken = answer.data.ads.filter((one) => ["soon", "same", "took_back"].includes(one.outcome)).length;
  if (taken === 0) return { tone: "warn", msg: STOPPED_ADS.notTaken };
  return { msg: STOPPED_ADS.resumed(taken) };
}

/** Cancel, on an ad being set up: on its way, made already (and paused at once), or refused in the server's words. */
async function cancelOf(ad: AdLiveDto | undefined, id: string): Promise<FrameFlash> {
  const answer = await pressAdCancel(id);
  if (answer === null) return { tone: "warn", msg: SHEET.failed };
  if (!answer.ok) return { tone: "warn", msg: answer.message };
  const name = ad?.name ?? "";
  return answer.data.outcome === "made" ? { msg: SHEET.cancelledLate(name) } : { msg: SHEET.cancelled(name) };
}

/** When the page looks again after a change Meta gave no answer to: the account's read is asked for two minutes on. */
const UNSURE_LOOKS_MS: readonly number[] = [30 * SECOND_MS, 150 * SECOND_MS, 5 * MIN_MS];

/**
 * Check, on an ad whose last switch Meta never answered: Meta is asked what stands, by the account's own read, which a
 * couple of minutes on at the soonest; the page looks again until that read is in. Nothing is sent to Meta again.
 */
async function checkAd(
  io: { setBusy: (on: boolean) => void; flash: (flash: FrameFlash) => void; again: () => void; looks: number[] },
  id: string,
  version: number,
): Promise<void> {
  io.setBusy(true);
  const answer = await pressAdCheck(id, version);
  io.setBusy(false);
  if (answer === null) return io.flash({ tone: "warn", msg: SHEET.failed });
  if (!answer.ok) return io.flash({ tone: "warn", msg: answer.message });
  io.looks.push(...UNSURE_LOOKS_MS.map((ms) => window.setTimeout(io.again, ms)));
  return io.flash({ msg: SHEET.checked });
}

interface PressesOf {
  ads: readonly AdLiveDto[];
  /** Read the page again. */
  again: () => void;
  flash: (flash: FrameFlash) => void;
}

/** The drawer's presses, the stop's one that pauses every ad still on, and the one that turns the stop's back on. */
type AdPresses = Pick<SheetActs, "busy" | "pause" | "resume" | "check" | "cancel"> & {
  pauseAll: (ads: readonly AdLiveDto[]) => void;
  resumeStopped: (ads: readonly AdLiveDto[]) => void;
};

export function useAdPresses({ ads, again, flash }: PressesOf): AdPresses {
  const [busy, setBusy] = useState(false);
  const looks = useRef<number[]>([]);
  useEffect(() => () => looks.current.forEach((timer) => window.clearTimeout(timer)), []);
  const press = useCallback(
    async (kind: Press, id: string, version: number, undoable: boolean): Promise<void> => {
      const ad = ads.find((one) => one.id === id);
      setBusy(true);
      const answer = await sendPress(kind, id, version);
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
      return flash({ msg: pressSaidOf(kind, outcome, ad?.name ?? ""), undo: undoable ? back : null });
    },
    [ads, again, flash],
  );
  const pauseAll = useCallback(
    async (targets: readonly AdLiveDto[]): Promise<void> => {
      if (targets.length === 0) return;
      setBusy(true);
      const tally = await pauseTogether(targets);
      setBusy(false);
      again();
      if (tally.unknown > 0) looks.current.push(...UNSURE_LOOKS_MS.map((ms) => window.setTimeout(again, ms)));
      flash(pausedAllSaid(tally, targets.length));
    },
    [again, flash],
  );
  const together = useCallback(
    async (pressing: () => Promise<FrameFlash>): Promise<void> => {
      setBusy(true);
      const flashed = await pressing();
      setBusy(false);
      again();
      flash(flashed);
    },
    [again, flash],
  );
  return {
    busy,
    check: (id, version) => void checkAd({ setBusy, flash, again, looks: looks.current }, id, version),
    pause: (id, version) => void press("pause", id, version, true),
    resume: (id, version) => void press("resume", id, version, true),
    cancel: (id) =>
      void together(() =>
        cancelOf(
          ads.find((one) => one.id === id),
          id,
        ),
      ),
    pauseAll: (targets) => void pauseAll(targets),
    resumeStopped: (targets) => void (targets.length > 0 && together(() => resumeTogether(targets))),
  };
}
