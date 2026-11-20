/**
 * Settings › Connections, a workspace's own ad account: the same card Campaigns › Ads draws, with the same read, the
 * same checks and the same presses (the Ads plan's 4.10; decision 0049, call 1: an ad account's home is Connections).
 * Connect, the one question, the caret's sheet and Disconnect are the card's own (campaigns/ads/connect/use-card.tsx).
 * A demo session draws the sample's rows instead (ad-accounts.tsx).
 *
 * It stands among the page's groups by its account, as a row does: in Connected, under the Meta row, once an account is
 * connected or Meta signed Chanlytics out of it; in Available before, and while the owner has two to choose from. Its
 * name here says it is the ads, so it is never read as the Meta row beside it. The pane draws the place it goes in
 * (pane.tsx), the card is drawn into that place, and it tells the pane where it stands, so the group's count holds it.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useAdsConnection } from "../../campaigns/ads/connect/use-card";
import type { ConnectCardVM } from "../../campaigns/ads/connect/card-model";
import { CARD } from "../../campaigns/ads/connect/words";
import type { ConnectionState } from "./model/setup";

/** Where the card stands among the page's groups, and what it counts as in its group's head. */
export interface AdsPlace {
  group: "connected" | "available";
  state: ConnectionState;
}

/**
 * Where the card stands, by its account's status and the card it draws: null until the account is read. A connected
 * account with something that stops its ads, or one Meta signed Chanlytics out of, needs attention, as a row would.
 */
export function adsPlaceOf(status: string | null, vm: ConnectCardVM | null): AdsPlace | null {
  if (vm === null) return null;
  if (status === "revoked") return { group: "connected", state: "attention" };
  if (status === "connected")
    return { group: "connected", state: vm.need?.tone === "warn" ? "attention" : "connected" };
  if (vm.state === "question") return { group: "available", state: "waiting_you" };
  return { group: "available", state: vm.state === "checking" ? "waiting_them" : "none" };
}

export function RealAdAccount({
  slot,
  onPlace,
}: {
  /** The place the pane keeps for the card in its group; null until the pane has drawn it. */
  slot: HTMLElement | null;
  onPlace: (place: AdsPlace | null) => void;
}) {
  // Until the account says its own zone, a day is said in the zone of whoever is looking.
  const connection = useAdsConnection(true, Intl.DateTimeFormat().resolvedOptions().timeZone, CARD.inConnections);
  const place = adsPlaceOf(connection.account.dto?.meta?.status ?? null, connection.vm);
  const group = place?.group ?? null;
  const state = place?.state ?? null;
  // Told only when it moves: the pane draws the place in that group, and counts the card there.
  useEffect(() => {
    onPlace(group && state ? { group, state } : null);
  }, [group, state, onPlace]);
  if (slot === null) return null;
  return createPortal(
    <section className="conn-ads-real" aria-label={CARD.inConnections} data-testid="conn-ads-real">
      {connection.card}
    </section>,
    slot,
  );
}
