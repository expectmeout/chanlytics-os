/**
 * AI stopped with ads still on, as one amber line with its one press (the Ads plan's G17; stop.ts says the words): at
 * the top of the Ads page, and in the ad account's card in Settings › Connections. The press is the owner's, and
 * pauses every ad still on.
 */
import { Button } from "../../../kit/button/button";
import { gate } from "../../../frame-verbs";
import { GATE } from "../model/words";
import type { StopVM } from "./stop";

/** The stop, as the hook that holds the page's read hands it over: what to say, the press, and whether it is under way. */
export interface StopHere {
  vm: StopVM;
  pauseAll: () => void;
  busy: boolean;
}

export function StopNotice({ stop, className }: { stop: StopHere; className?: string }) {
  const { vm } = stop;
  return (
    <div className={className} data-tone="warn" role="status" data-testid="ads-stop">
      <b>{vm.title}</b>
      <span>{vm.body}</span>
      {vm.press ? (
        <Button
          size="sm"
          onClick={stop.pauseAll}
          disabled={stop.busy}
          data-testid="ads-stop-pause"
          {...gate("approve", GATE.change)}
        >
          {vm.press}
        </Button>
      ) : null}
      {vm.ownerOnly ? <span data-testid="ads-stop-owner">{vm.ownerOnly}</span> : null}
    </div>
  );
}
