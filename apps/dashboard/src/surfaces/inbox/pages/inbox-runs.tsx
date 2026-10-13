/**
 * The campaign runs waiting for your word, said where the badge counts them (the wiring's second audit, S7-2). The
 * Needs-you badge counts the runs waiting for your say (an approval, or the emails a going run's check holds), and the Inbox under it listed threads only and said "Nobody's
 * waiting on you": one count, said nowhere it was counted. The band stands above Needs you while a run waits that an
 * approval can still send (needs-you.ts waitingRunsNow), in the words Today's head leads with (contracts
 * runsWaitingSentence), with the door to the run, or to Sent for several. Drawn from the kit alone.
 */
import { useCallback, useSyncExternalStore } from "react";
import { runsWaitingSentence, verbForRoute } from "@chanlytics/contracts";
import { surfaceHook } from "@/legacy-bridge/surface-status";
import { EmptyState } from "../../kit/empty/empty";
import { useNeedsYouParts, waitingRunsNow } from "../../needs-you";

// Drawn again when Sent's runs move (a run approved and another made keeps the count, and changes the door).
const useMoved = surfaceHook({ useCallback, useSyncExternalStore });

export function InboxRunsWaiting() {
  useMoved(["broadcasts"]);
  const parts = useNeedsYouParts();
  if (!parts?.runs) return null;
  const runs = waitingRunsNow();
  const [only] = runs;
  const door = runs.length === 1 && only ? `broadcasts/run:${only.id}` : "broadcasts";
  return (
    <EmptyState
      kind="line"
      glyph="bolt"
      tone="warn"
      title={runsWaitingSentence(parts.runs)}
      action={{ label: verbForRoute(door) ?? "Open Sent", to: door }}
      testid="inbox-runs-waiting"
    />
  );
}
