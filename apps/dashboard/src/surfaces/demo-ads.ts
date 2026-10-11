/**
 * The two ads that brought the demo's people (MOCKUP): the id, name and platform the Ads page's fixtures give them
 * (campaigns/ads/sample.ts: SPRING and SATURDAY, whose people carry the People and thread ids the demo's People and Inbox
 * samples use). The People and Inbox samples say which ad brought someone from here, and import nothing, so neither pulls the
 * Ads page's sample into its own chunk; tooling/scripts/tests/ads/ads-connect.test.mjs holds the three equal.
 */
export const DEMO_ADS = {
  spring: { id: "5b0e8c1a-3f2d-4c1e-9a7b-1d2e3f4a5b6c", name: "Spring offer", platform: "meta" },
  saturday: { id: "2d8f4e67-1a93-4c05-b8e2-9a7d3c5f1e08", name: "Saturday video", platform: "tiktok" },
} as const;
