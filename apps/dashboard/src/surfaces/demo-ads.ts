/**
 * What the demo samples share, and import nothing, so no sample pulls another into its page's chunk.
 *
 * The zone a demo session's samples say their moments in: the made-up studio is in New York, so the samples of the
 * surfaces that draw one (the Calendar, People, Reports and Campaigns' broadcasts) say the same hour.
 */
export const DEMO_ZONE = "America/New_York";

/**
 * The two ads that brought the demo's people: the id, name and platform the People and Inbox samples say brought
 * someone (the Ads page's own sample went on 20 Nov 2026).
 */
export const DEMO_ADS = {
  spring: { id: "5b0e8c1a-3f2d-4c1e-9a7b-1d2e3f4a5b6c", name: "Spring offer", platform: "meta" },
  saturday: { id: "2d8f4e67-1a93-4c05-b8e2-9a7d3c5f1e08", name: "Saturday video", platform: "tiktok" },
} as const;
