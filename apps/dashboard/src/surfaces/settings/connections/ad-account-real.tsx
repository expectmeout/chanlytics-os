/**
 * Settings › Connections, a workspace's own ad account: the same card Campaigns › Ads draws, with the same read, the
 * same checks and the same presses (the Ads plan's 4.10; decision 0049, call 1: an ad account's home is Connections).
 * Connect, the one question, the caret's sheet and Disconnect are the card's own (campaigns/ads/connect/use-card.tsx).
 * A demo session draws the sample's rows instead (ad-accounts.tsx).
 */
import { useAdsConnection } from "../../campaigns/ads/connect/use-card";
import { CARD } from "../../campaigns/ads/connect/words";

export function RealAdAccount() {
  // Until the account says its own zone, a day is said in the zone of whoever is looking.
  const connection = useAdsConnection(true, Intl.DateTimeFormat().resolvedOptions().timeZone);
  return (
    <section className="conn-ads-real" aria-label={CARD.name} data-testid="conn-ads-real">
      {connection.card}
    </section>
  );
}
