/**
 * Whether the Ads page's own first read is in, for what Campaigns fetches ahead of need (home/route.tsx useViewsAhead).
 *
 * Every other view of Campaigns opens on reads the document's head started (contracts PREFETCH_READS), so "the boot is in" says
 * its own reads are (workspace.ts aheadWhenIdle). Ads' is not one of them: its page asks for People's report once its code is in
 * (first-touch.ts), beside the boot or after it. So on Ads nothing held what is fetched ahead, Sequences' list and Sequences
 * drawn hidden, to wait for that report: which went first was left to how long each took, and the report is the dearest read a
 * workspace has. What is fetched ahead waits for this first, so the page's own read is never behind it
 * (e2e/campaigns/ads.spec.ts holds the order).
 *
 * A module of its own, with nothing of Ads in it: the route imports it, and Ads' page stays the chunk it is.
 */
let settleFirstRead: () => void = () => undefined;
const firstRead = new Promise<void>((resolve) => {
  settleFirstRead = resolve;
});

/** Settled once Ads' page has had its first read answered, or has said it asks for none; it stays settled for the session. */
export const waitForAdsFirstRead = (): Promise<void> => firstRead;

/** Ads' page says so: its report answered or failed, or it stands on an example or a demo, which read none. */
export const adsFirstReadAnswered = (): void => settleFirstRead();
