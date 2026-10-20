/**
 * People's two sheets as the frame publishes them (people-globals.ts): the deal sheet (0008) and the step sheet (0007,
 * amended), each drawn once by the frame (frame/app-shell.tsx) and asked for from anywhere by name (`window.openDealSheet`,
 * `window.openStepSheet`: the person's card, a thread, the Calendar's visit, the Pipeline). Their code is a chunk of its own
 * (code.ts), fetched once the frame is idle, or at once when a sheet is asked for before that: in the frame it was
 * about 17 KB, compressed, that every first load parsed before any page could draw (the loadability review, 19 Oct 2026).
 *
 * A sheet hears its ask as an event (`deal:sheet`, `step:sheet`), so an ask is announced only once its host listens: each
 * host here says so from its own effect, which runs after the sheet's own (a child's effects run before its parent's).
 */
import { useEffect, useState, type ComponentType } from "react";
import { aheadWhenIdle } from "@/legacy-bridge/workspace";
import { codeOnce } from "@/lib/code-once";

type SheetsCode = typeof import("./code");
type Sheet = "deal" | "step";

/** The two sheets' code: fetched once and shared; a fetch that failed is asked for again by the next ask. */
const sheetsCode = codeOnce(() => import("./code"));

/** A promise kept until its host listens, and the call that keeps it. */
function heldUntilHeard(): { heard: Promise<void>; hear: () => void } {
  let hear = () => {};
  const heard = new Promise<void>((r) => {
    hear = r;
  });
  return { heard, hear };
}

const hostHeard: Record<Sheet, { heard: Promise<void>; hear: () => void }> = {
  deal: heldUntilHeard(),
  step: heldUntilHeard(),
};

/** The hosts waiting for their code, each woken at once by an ask that comes before the frame is idle. */
const hostsWaiting = new Set<() => void>();

/** Whether a sheet was asked for: from then on a host fetches its code as it mounts, never waiting for an idle frame. */
let sheetAsked = false;

/** A host that draws nothing until its sheet's code is in, then the sheet's own host, from then on. */
function sheetHost(sheet: Sheet, pick: (m: SheetsCode) => ComponentType): ComponentType {
  function Host() {
    // A host mounted again (a workspace switched) draws the sheet at once where its code is in, so it listens before any ask.
    const [Real, setReal] = useState<ComponentType | null>(() => {
      const m = sheetsCode.now();
      return m ? pick(m) : null;
    });
    useEffect(() => {
      if (Real) {
        hostHeard[sheet].hear();
        return undefined;
      }
      let live = true;
      const load = () => {
        hostsWaiting.delete(load);
        void sheetsCode().then(
          (m) => {
            if (live) setReal(() => pick(m));
          },
          () => {},
        );
      };
      // Asked for already (before this host mounted, or before its effect ran): the ask waits on this host, so now.
      if (sheetAsked) {
        load();
        return () => {
          live = false;
        };
      }
      hostsWaiting.add(load);
      const cancel = aheadWhenIdle(load);
      return () => {
        live = false;
        hostsWaiting.delete(load);
        cancel();
      };
    }, [Real]);
    return Real ? <Real /> : null;
  }
  Host.displayName = `${sheet === "deal" ? "Deal" : "Step"}SheetHost`;
  return Host;
}

export const DealSheetHost = sheetHost("deal", (m) => m.DealSheetHost);
export const StepSheetHost = sheetHost("step", (m) => m.StepSheetHost);

/** An ask, made once its sheet's host listens: its code is fetched now where it was not yet. */
function askOnceHeard(sheet: Sheet, ask: (m: SheetsCode) => void): void {
  sheetAsked = true;
  for (const load of [...hostsWaiting]) load();
  void Promise.all([sheetsCode(), hostHeard[sheet].heard]).then(
    ([m]) => ask(m),
    () => {},
  );
}

/**
 * The deal sheet asked for, published as `window.openDealSheet`: the ask reaches the sheet (deal-sheet.tsx openDealSheet)
 * once its host listens. True when it names a person and a move.
 */
export function askDealSheet(ask: Parameters<SheetsCode["openDealSheet"]>[0] = {}): boolean {
  if (!ask.personId || !ask.mode) return false;
  askOnceHeard("deal", (m) => m.openDealSheet(ask));
  return true;
}

/**
 * The step sheet asked for, published as `window.openStepSheet`: the ask reaches the sheet (step-sheet.tsx openStepSheet)
 * once its host listens. True when it names a person, or several.
 */
export function askStepSheet(ask: Parameters<SheetsCode["openStepSheet"]>[0] = {}): boolean {
  if (!ask.personId && !ask.personIds?.some((id) => typeof id === "string" && id)) return false;
  askOnceHeard("step", (m) => m.openStepSheet(ask));
  return true;
}
