/**
 * The Campaigns lens's reach-outs, as the pages' tests hold them: the report the reach-outs route answers
 * (contracts ReachOutReportDto, `GET reports/reach-outs`'s `report`) for Harbor Studio's thirty days to Fri Sep 4, 2026, the
 * window of ./_campaign-world.mjs. Two chains of two steps write 40 emails (36 delivered, 2 bounced) to 25 businesses, 6 of
 * whom wrote back; the 30 days before wrote 30. Nothing here is a real business.
 *
 * `reachOuts(over)` is the report as a database from 00404 answers it; `beforeBusinesses()` is the same salon on a database
 * before it, which counts no businesses anywhere. Each returns a fresh object, so a test may change what it is handed.
 */

/** The counts of one step, all zero unless a test says what it wrote. */
const counts = (over = {}) => ({
  written: 0,
  delivered: 0,
  bounced: 0,
  wrote_back: 0,
  interested: 0,
  booked: 0,
  said_no: 0,
  handed: 0,
  ...over,
});
const stepOf = (id, n, over = {}) => ({ id, n, hand: null, ...counts(over) });

/** Two chains: the first writes 30 emails to 20 businesses (5 wrote back), the second 10 to 5 (1 wrote back). */
const chainsOf = () => [
  {
    root_id: "r1",
    name: "Trainers in Austin",
    state: "running",
    search: { id: "s1", name: "Personal trainers · Austin" },
    last_at: "2026-09-03T15:00:00.000Z",
    runs: 2,
    steps: [
      stepOf("p1", 0, {
        written: 18,
        delivered: 16,
        bounced: 1,
        businesses: 12,
        wrote_back: 3,
        interested: 2,
        booked: 1,
      }),
      stepOf("p2", 1, { written: 12, delivered: 11, businesses: 8, wrote_back: 2, interested: 1, said_no: 1 }),
    ],
  },
  {
    root_id: "r2",
    name: "Studios nearby",
    state: "running",
    search: null,
    last_at: "2026-09-02T15:00:00.000Z",
    runs: 1,
    steps: [
      stepOf("q1", 0, { written: 6, delivered: 5, bounced: 1, businesses: 3, wrote_back: 1, said_no: 1 }),
      stepOf("q2", 1, { written: 4, delivered: 4, businesses: 2 }),
    ],
  },
];

/** The report the route answers, for a database from 00404 (`over` replaces any key). */
export const reachOuts = (over = {}) => ({
  timezone: "America/New_York",
  days: 30,
  today: "2026-09-04",
  end: "2026-09-04",
  since: "2026-08-06",
  has_reach_out: true,
  totals: counts({
    written: 40,
    delivered: 36,
    bounced: 2,
    businesses: 25,
    wrote_back: 6,
    interested: 3,
    booked: 1,
    said_no: 2,
  }),
  before: { written: 30, delivered: 27, bounced: 1 },
  series: [
    { day: "2026-08-31", written: 10 },
    { day: "2026-09-02", written: 30 },
  ],
  chains: chainsOf(),
  angles: [
    { angle: "their rating", written: 20, businesses: 8, wrote_back: 2 },
    { angle: "mid-session calls", written: 8, businesses: 4, wrote_back: 2 },
  ],
  other_angles: { written: 0, businesses: 0, wrote_back: 0 },
  no_angle: 10,
  domains: [
    {
      host: "mail.example.com",
      state: "verified",
      held_why: null,
      held_at: null,
      sent: 40,
      delivered: 36,
      bounced: 2,
      complained: 0,
    },
  ],
  ...over,
});

/** The same salon on a database before 00404: no `businesses` anywhere, and no period before. */
export const beforeBusinesses = () => {
  const dto = reachOuts();
  delete dto.totals.businesses;
  delete dto.before;
  for (const a of dto.angles) delete a.businesses;
  delete dto.other_angles.businesses;
  for (const c of dto.chains) for (const s of c.steps) delete s.businesses;
  return dto;
};

/** A period in which nothing was written or handed in (on a database that counts businesses, so it has 0 of them). */
export const NOTHING_WRITTEN = {
  totals: counts({ businesses: 0 }),
  before: { written: 0, delivered: 0, bounced: 0 },
  chains: [],
  angles: [],
  domains: [],
  no_angle: 0,
  series: [],
};

export { counts as reachCounts, stepOf as reachStep };
