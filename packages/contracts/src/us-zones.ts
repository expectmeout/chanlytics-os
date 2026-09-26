/**
 * A US state's time zone, for the hours a business keeps (Reach out, Part 3). One zone per state, the one most of
 * its people live in. Where a state straddles two (the Florida panhandle, Indiana's and Michigan's western corners,
 * Kentucky, Tennessee's east, western Texas, Kansas, Nebraska, the Dakotas, Oregon, Idaho), a business on the far side
 * reads an hour off; the send window keeps half an hour clear of each end (lead-hours.ts), which absorbs most of it.
 * The finder is US-only (leads.region is a two-letter state, core/leads/clean.ts), so a region outside this map has
 * no zone, and the timetable falls back to the workspace's.
 */
export const US_STATE_ZONES = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
  PR: "America/Puerto_Rico",
} as const;

export type UsStateCode = keyof typeof US_STATE_ZONES;

export function zoneOfRegion(region: string | null | undefined): string | null {
  const code = (region ?? "").trim().toUpperCase();
  return (US_STATE_ZONES as Record<string, string>)[code] ?? null;
}
