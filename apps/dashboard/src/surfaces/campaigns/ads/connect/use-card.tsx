/**
 * The ad account's card with everything it opens, as one hook: the account's own read, the ads' read where an account
 * is held (for the names of the ads that are running), the card, its sheet from the caret, and Disconnect. Campaigns ›
 * Ads and Settings › Connections both draw this, so the two cards are one card (the Ads plan's 4.10): the same read,
 * the same checks, the same presses. While AI is stopped with ads still on (the plan's G17), it holds the press that
 * pauses them all: the Ads page draws it at its top, and the card in Settings draws it inside.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { useFrameToast } from "../../../frame-verbs";
import { adsLeftOn, aiStopOf } from "../live/stop";
import { StopNotice } from "../live/stop-notice";
import type { StopHere } from "../live/stop-notice";
import { useAdPresses } from "../live/use-press";
import { useAdsLive } from "../live/use-live";
import type { AdsLiveHere } from "../live/use-live";
import { ConnectCard } from "./card";
import { connectCard } from "./card-model";
import type { ConnectCardVM } from "./card-model";
import { CardSheet } from "./card-sheet";
import { DisconnectSheet } from "./disconnect-sheet";
import { useAdAccount } from "./use-account";
import type { AdAccountHere } from "./use-account";
import { DISCONNECT } from "./words";

/** Whether the workspace holds an ad account: connected, signed out by Meta, or let go with its ads kept. */
const holdsAccount = (account: AdAccountHere): boolean => {
  const status = account.dto?.meta?.status;
  return status === "connected" || status === "revoked" || status === "disconnected";
};

interface AdsConnection {
  account: AdAccountHere;
  /** Whether an account is held: the page then draws the workspace's own ads. */
  held: boolean;
  live: AdsLiveHere;
  /** The card's model; null while the account is not read. */
  vm: ConnectCardVM | null;
  /** The card, with its sheet and Disconnect. */
  card: ReactNode;
  /** AI stopped with ads still on, and the press that pauses them all; null otherwise. */
  stop: StopHere | null;
}

/**
 * The connection, where `on` says this page draws it; `timezone` is the zone its days are said in, `title` the name
 * its card goes by on this page, and `stopIn` whether the card itself says AI is stopped or the page does.
 */
export function useAdsConnection(on: boolean, timezone: string, title: string, stopIn: "card" | "page"): AdsConnection {
  const account = useAdAccount(on);
  const held = on && holdsAccount(account);
  const live = useAdsLive(held, `${account.dto?.meta?.status ?? ""}:${account.dto?.meta?.read_at ?? ""}`);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [toast, flash] = useFrameToast();
  const presses = useAdPresses({ ads: live.dto?.ads ?? [], again: live.again, flash });
  const stopVM = aiStopOf(live.dto);
  const dto = live.dto;
  const stop: StopHere | null =
    stopVM && dto ? { vm: stopVM, pauseAll: () => presses.pauseAll(adsLeftOn(dto)), busy: presses.busy } : null;
  const vm = connectCard(account.dto, {
    outcome: account.outcome,
    checking: account.checking,
    // The account's own zone where it names one: its days are Meta's days.
    timezone: account.dto?.meta?.timezone ?? timezone,
  });
  // What a disconnect would leave on (contracts adLeftOn), each as what it is: running, or still being checked.
  const namesOf = (state: "on" | "review") =>
    (live.dto?.ads ?? []).filter((ad) => ad.state === state).map((ad) => ad.name);
  const running = namesOf("on");
  const checking = namesOf("review");
  // Disconnect is the owner's, on an account that is connected or that Meta signed Chanlytics out of.
  const status = account.dto?.meta?.status;
  const mayLeave = account.dto?.can_connect === true && (status === "connected" || status === "revoked");
  const card =
    vm === null ? null : (
      <>
        <ConnectCard
          title={title}
          vm={vm}
          acts={{ connect: account.connect, choose: (id) => void account.choose(id), open: () => setOpen(true) }}
          stop={stopIn === "card" && stop ? <StopNotice stop={stop} className="ads-conn-need" /> : null}
        />
        <CardSheet
          open={open}
          vm={vm}
          onClose={() => setOpen(false)}
          onDisconnect={
            mayLeave
              ? () => {
                  setOpen(false);
                  setLeaving(true);
                }
              : undefined
          }
        />
        <DisconnectSheet
          open={leaving}
          account={vm.facts.at(0)?.value ?? null}
          running={running}
          checking={checking}
          canPause={status === "connected"}
          disconnect={async (pause) => {
            const answer = await account.disconnect(pause);
            // Some were paused and Meta did not confirm the rest: the page reads again, so it says which are still on.
            if (answer.outcome === "not_paused") live.again();
            return answer;
          }}
          onClose={() => setLeaving(false)}
          onDone={() => {
            setLeaving(false);
            live.again();
            flash({ msg: DISCONNECT.done });
          }}
          onFailed={(why) => flash({ tone: "warn", msg: why })}
        />
        {toast}
      </>
    );
  return { account, held, live, vm, card, stop };
}
