/**
 * Whether Campaigns › Ads is drawn here (the Ads plan's 6.2): the server's `ads` on the settings read
 * (server/connections/ads-ready.ts readAdsShown). The one answer the pages ask as they draw (surfaces/campaigns/ads/shown.ts)
 * and AI's jumps ask (bridge/ask/palette.ts), read off the settings surface either holds. A leaf that imports nothing, so
 * the strip's chrome, which reads it, makes no import circle through the bridge.
 */
export const adsShownIn = (surface: { settings: { ads: boolean } | null } | null | undefined): boolean =>
  surface?.settings?.ads === true;
