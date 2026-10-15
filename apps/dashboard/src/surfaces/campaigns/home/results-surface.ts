/**
 * Campaigns' own numbers (spec 2026-10-09 §4.5): the campaigns' last 30 days (GET reports/campaigns, campaign_series with
 * each campaign's `sources`) and the reach-outs' (GET reports/reach-outs, with each chain's own totals by its root), read
 * where Campaigns is drawn and nowhere else, so no other page's boot pays for a campaign_series call. Part of the
 * SurfaceData seam; the home reads it through `useSurface("campaign_results")`.
 *
 * A period surface (reports/period-surface.ts, as Today's headline and the Reviews lens are): read on demand as its page
 * comes on screen, and again then once it has aged. It follows one fixed period, Campaigns' own
 * (contracts CAMPAIGNS_RESULTS_PERIOD), whatever Reports shows: 30 days ending today, so neither read names a last day.
 *
 * Each read fails alone: the home says "—" where its numbers would be, and the other stands. A message or a run moves
 * the replies and the sends: read again while Campaigns is on screen, 800 ms after the last (Reports' debounce), and once
 * when it comes back (surface-registry.ts onlyOnItsPage), never on another page.
 */
import {
  CAMPAIGNS_RESULTS_PERIOD,
  lifecycleChainsOf,
  toCampaignReportVM,
  type CampaignReportDto,
  type LifecycleChains,
  type LifecycleReport,
} from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import { COUNTED_RECEIPTS, RECEIPTS_QUIET_MS } from "@/legacy-bridge/surface-realtime";
import { periodSurface } from "../../reports/period-surface";

/** What the home reads of its own 30 days: each null where its read failed, the other standing. */
export interface CampaignResultsSurface {
  /** The period both were read over, by its one name (contracts reportRangeKey): Campaigns' own. */
  period: typeof CAMPAIGNS_RESULTS_PERIOD;
  report: LifecycleReport | null;
  chains: LifecycleChains | null;
  fetchedAt: number;
}

/** The campaign report as the home reads it: the totals of its funnel, what each channel sent, and each campaign's own. */
function resultsReportOf(dto: CampaignReportDto): LifecycleReport {
  const vm = toCampaignReportVM(dto);
  // What each channel sent (0030), the most first, for the line under the funnel; none from a database before it.
  const byChannel = vm.channels.map((c) => ({ channel: c.channel, sent: c.sent }));
  return {
    days: vm.days,
    totals: vm.totals,
    // None from a server from before a report carried them, as toCampaignReportVM reads them.
    sources: (dto.sources ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      sent: s.sent,
      replied: s.replied,
      lastAt: s.last_at,
    })),
    ...(byChannel.length > 0 ? { byChannel } : {}),
  };
}

export const campaignResults = periodSurface({
  key: "campaign_results",
  // One fixed period, never the one Reports shows: the ledger's "Last 30 days" and What came back say 30 days.
  shown: () => CAMPAIGNS_RESULTS_PERIOD,
  of: (value) => value.period,
  read: async (period): Promise<CampaignResultsSurface> => {
    const [campaigns, reachOuts] = await Promise.all([
      read("GET reports/campaigns", { query: { period } }).catch((e: unknown) => e as Error),
      read("GET reports/reach-outs", { query: { period } }).catch((e: unknown) => e as Error),
    ]);
    if (campaigns instanceof Error) console.error("campaign_results_campaigns_fetch_failed", campaigns.message);
    if (reachOuts instanceof Error) console.error("campaign_results_reach_outs_fetch_failed", reachOuts.message);
    return {
      period,
      report: campaigns instanceof Error ? null : resultsReportOf(campaigns.report),
      // Each chain's own totals as the ledger reads them (contracts lifecycleChainsOf), as Ask's context of the page does.
      chains: reachOuts instanceof Error ? null : lifecycleChainsOf(reachOuts.chains),
      fetchedAt: Date.now(),
    };
  },
  // Read again only while Campaigns is on screen, 800 ms after the last change (Reports' debounce, reports/surface.ts), and
  // once when it comes back (surface-registry.ts). What moves the numbers: the messages a reply is, the runs a send is, a
  // reach-out's reply read or undone (What came back counts the chains' replies, 0047), and a person's answer: What came back
  // counts who said yes and who asked to stop, by the unsubscribe link, a carrier's STOP or a teammate's hand (the wiring's
  // second audit, S3-2). A person made is no answer: only an update of one is heard (the feed tells it when an answer moved).
  // Heard on Campaigns alone. And the receipts its funnel's Delivered and Read count, once a run's receipts quieten (S3-5).
  // And a deal won (counted once in the reach-outs' report) and the mailboxes a chain's emails left from (decision 0056).
  live: {
    reads: ["conversation", "hold", "send", "reach_out", "person", "deal", "channel"],
    fresh: "its-page",
    when: (c) => c.table !== "contacts" || c.event !== "INSERT",
    omit: [
      {
        tables: ["lines", "capability_activations", "business_records"],
        why: "it counts what each number and mailbox sent; a line's saga, an activation and the carriers' record are none of its figures",
      },
    ],
    debounceMs: 800,
    refreshOnMessageStatuses: COUNTED_RECEIPTS,
    receiptsQuietMs: RECEIPTS_QUIET_MS,
  },
});

export const campaignResultsOverride = campaignResults.override;
