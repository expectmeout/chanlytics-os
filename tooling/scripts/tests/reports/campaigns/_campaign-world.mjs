/**
 * The Campaigns lens's own read, as the pages' tests hold it: Harbor Studio's thirty days to Fri Sep 4, 2026 (the world of
 * ../_report-world.mjs, which the frame's read draws from), through the DTO the ledger route answers (contracts
 * CampaignLedgerDto) and the surface that holds it (`reports_campaigns`: the sends' report, the ledger, the reach-outs when
 * they were read, and the range it is of). Nothing here is a real business.
 *
 * The lens has three reads and the world keeps them apart as the surface does. CAMPAIGNS is what campaign_series answers
 * (the days' counts, the sources, the channels: 00374, 00403). SERIES is what campaign_ledger answers for the window
 * (00405: people, runs, what was held and stopped, why sends failed, each message, how soon the first reply came, how long an
 * approval waited), and STUCK what campaign_stuck answers as of now (00406), in the raw shape the database gives it. STUCK_NOW
 * is STUCK judged at NOW by the product's own rules and written out by hand: the oracle the builder is held to, and the
 * stuck half of the DTO the route answers (dtoWith).
 *
 * The facts add up, and campaign-record.test.mjs holds the sums: the 240 sends by channel, by source and by message, the
 * 180 people they reached, the 14 runs, the held, the stopped, the failed and the waits. The people and the messages agree,
 * as a real database's would: 50 sends were answered (the days' counts), and the ledger's first replies are those same 50
 * (`first_reply.n`, one per answered send of the window); 48 people wrote back, which is no more than the answered sends
 * (a person can answer two); and the messages' own replies (30 + 18 = 48) are no more than the answered sends either, since
 * they count the mature sends alone. The head says 48 people where the funnel says 50 messages, so a test that mixes the two
 * up does not pass by luck.
 */

const DAY = 86_400_000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
/** `n` plain dates from `first` on: the days campaign_series names. */
const datesFrom = (first, n) => Array.from({ length: n }, (_, i) => ymd(Date.parse(`${first}T00:00:00Z`) + i * DAY));

/** The instant the stuck half is judged at: noon at Harbor Studio on Fri Sep 4, 2026 (America/New_York, summer time). */
export const NOW = Date.parse("2026-09-04T16:00:00Z");

/** The window the route asked for and the database answered for: thirty days to today, in the salon's zone. */
export const HEAD = { timezone: "America/New_York", today: "2026-09-04", days: 30 };

/* ---------------------------------------------------------- campaign_series (the sends) */

/** [sent, delivered, read, replied, opt_ins, opt_outs] of the days that sent anything or were answered. */
const BEFORE_DAYS = {
  "2026-07-09": [40, 36, 5, 9, 2, 0],
  "2026-07-14": [34, 30, 4, 8, 2, 1],
  "2026-07-18": [28, 25, 3, 6, 1, 0],
  "2026-07-22": [30, 27, 4, 7, 2, 0],
  "2026-07-27": [32, 28, 4, 7, 2, 1],
  "2026-08-01": [26, 22, 3, 7, 2, 0],
};
const NOW_DAYS = {
  "2026-08-07": [30, 28, 4, 7, 2, 0],
  "2026-08-10": [24, 22, 3, 5, 1, 1],
  "2026-08-13": [20, 18, 2, 4, 0, 0],
  "2026-08-17": [28, 26, 4, 6, 3, 0],
  "2026-08-20": [22, 20, 3, 5, 1, 0],
  "2026-08-24": [30, 27, 4, 6, 2, 1],
  "2026-08-27": [26, 24, 3, 6, 2, 0],
  "2026-08-31": [30, 28, 4, 7, 2, 0],
  "2026-09-02": [18, 16, 2, 3, 1, 1],
  "2026-09-04": [12, 11, 2, 1, 0, 0],
};
const dayRow = (day, [sent, delivered, read, replied, opt_ins, opt_outs] = [0, 0, 0, 0, 0, 0]) => ({
  day,
  sent,
  delivered,
  read,
  replied,
  opt_ins,
  opt_outs,
});

/**
 * campaign_series for the thirty days and the thirty before them: 240 messages sent (220 delivered, 31 of WhatsApp's 120
 * read, 50 answered, 14 yeses and 3 stops) after 190 (168 delivered, 44 answered, 11 yeses and 2 stops), by source and by
 * channel.
 */
export const CAMPAIGNS = {
  timezone: "America/New_York",
  days: 30,
  span_days: 60,
  today: "2026-09-04",
  series: [...datesFrom("2026-07-07", 30), ...datesFrom("2026-08-06", 30)].map((d) =>
    dayRow(d, BEFORE_DAYS[d] ?? NOW_DAYS[d]),
  ),
  sources: [
    {
      id: "pb-winback",
      kind: "playbook",
      name: "Win-back",
      template_name: "winback_offer",
      runs: 12,
      sent: 120,
      delivered: 110,
      read: 14,
      replied: 28,
      last_at: "2026-09-04T13:05:00.000Z",
    },
    {
      id: "bc-spring",
      kind: "broadcast",
      name: "Spring note",
      template_name: "spring_note",
      runs: 2,
      sent: 120,
      delivered: 110,
      read: 17,
      replied: 22,
      last_at: "2026-08-20T15:00:00.000Z",
    },
  ],
  by_channel: [
    { channel: "whatsapp", sent: 120, delivered: 110, read: 31, replied: 30 },
    { channel: "sms", sent: 70, delivered: 66, read: 0, replied: 12 },
    { channel: "email", sent: 50, delivered: 44, read: 0, replied: 8 },
  ],
};

/** A period in which nothing was sent and nobody said yes or stop: every day 0, no source, no channel. */
export const CAMPAIGNS_QUIET = {
  ...CAMPAIGNS,
  series: CAMPAIGNS.series.map((d) => dayRow(d.day)),
  sources: [],
  by_channel: [],
};

/* ---------------------------------------------------------- campaign_ledger (the window) */

/** campaign_ledger's answer for the thirty days (00405): the window it was read for, and counts, never a name. */
export const SERIES = {
  timezone: "America/New_York",
  today: "2026-09-04",
  end: "2026-09-04",
  days: 30,
  people: {
    now: { sent_to: 180, wrote_back: 48, counting: 9 },
    before: { sent_to: 150, wrote_back: 41 },
  },
  runs: { now: { moment: 12, broadcast: 2 }, before: { moment: 10, broadcast: 1 } },
  held: { total: 12, skipped: 9, failed: 3, by_reason: { opted_out: 5, no_phone: 3, send_failed: 3, other: 1 } },
  stopped: { failed: 2, canceled: 1, by_failure: { paused: 1, "wire_unavailable:sms": 1 } },
  failed_sends: {
    total: 6,
    by_code: [
      { channel: "whatsapp", code: 131049, kind: null, n: 4 },
      { channel: "email", code: null, kind: "bounced", n: 2 },
    ],
  },
  by_message: [
    { name: "winback_offer", language: "en_US", sent: 120, mature: 110, replied: 30 },
    { name: "spring_note", language: "en_US", sent: 120, mature: 120, replied: 18 },
  ],
  first_reply: { n: 50, median_s: 5400, buckets: { m15: 8, h1: 14, h4: 12, h24: 11, h72: 5 } },
  approval: { n: 4, median_s: 7200, buckets: { h1: 1, h4: 1, h24: 1, over: 1 } },
};

/**
 * A window in which nothing was sent, held, stopped, failed or approved: every count 0, no message, no middle. Spread over
 * SERIES, it leaves the window (timezone, today, end, days) as it was.
 */
export const QUIET = {
  people: { now: { sent_to: 0, wrote_back: 0, counting: 0 }, before: { sent_to: 0, wrote_back: 0 } },
  runs: { now: { moment: 0, broadcast: 0 }, before: { moment: 0, broadcast: 0 } },
  held: { total: 0, skipped: 0, failed: 0, by_reason: {} },
  stopped: { failed: 0, canceled: 0, by_failure: {} },
  failed_sends: { total: 0, by_code: [] },
  by_message: [],
  first_reply: { n: 0, median_s: null, buckets: { m15: 0, h1: 0, h4: 0, h24: 0, h72: 0 } },
  approval: { n: 0, median_s: null, buckets: { h1: 0, h4: 0, h24: 0, over: 0 } },
};

/* ---------------------------------------------------------- campaign_stuck (as of now) */

/**
 * campaign_stuck's answer (00406), as the database gives it at NOW. Three runs wait for an OK: a reach-out's step (made for
 * a day gone by, never refused: the rule's own exemption), a win-back made for yesterday (its day has passed) and one made
 * for today. One run failed. Three people answered a campaign and their threads are flagged: the first has an open
 * escalation and nobody, the second needs a person, and the third is a teammate's. Two WhatsApp messages Meta stopped.
 */
export const STUCK = {
  runs_waiting: [
    {
      id: "run-reach",
      name: "Trainers in Austin",
      kind: "reach_out",
      playbook_id: "step-1",
      run_for: "2026-09-02",
      trigger: null,
      audience_kind: "reach_out",
      created_at: "2026-09-02T15:00:00.000Z",
      recipient_count: 0,
    },
    {
      id: "run-late",
      name: "Win-back",
      kind: "moment",
      playbook_id: "pb-winback",
      run_for: "2026-09-03",
      trigger: "quiet_30",
      audience_kind: "playbook",
      created_at: "2026-09-03T14:00:00.000Z",
      recipient_count: 14,
    },
    {
      id: "run-today",
      name: "Win-back",
      kind: "moment",
      playbook_id: "pb-winback",
      run_for: "2026-09-04",
      trigger: "quiet_30",
      audience_kind: "playbook",
      created_at: "2026-09-04T13:00:00.000Z",
      recipient_count: 9,
    },
  ],
  runs_failed: [
    {
      id: "run-failed",
      name: "Spring note",
      kind: "broadcast",
      failure: "paused",
      finished_at: "2026-09-02T15:00:00.000Z",
    },
  ],
  replies: [
    {
      state: "open",
      paused_until: null,
      assignee_user_id: null,
      open_escalation: true,
      replied_at: "2026-09-03T10:00:00.000Z",
    },
    {
      state: "needs_human",
      paused_until: null,
      assignee_user_id: null,
      open_escalation: false,
      replied_at: "2026-08-30T10:00:00.000Z",
    },
    {
      state: "open",
      paused_until: null,
      assignee_user_id: "user-teammate",
      open_escalation: true,
      replied_at: "2026-09-01T10:00:00.000Z",
    },
  ],
  templates: [
    { name: "winback_offer", language: "en_US", status: "paused", quality: "YELLOW" },
    { name: "spring_note", language: "en_US", status: "rejected", quality: null },
  ],
};

/** A connected number whose rating is good and that Meta holds nothing against, read at six on Friday morning. */
export const NUMBER = {
  state: "read",
  tone: "ok",
  can_send: true,
  label: "Number quality: good · up to 1,000 new conversations a day",
  checked_at: "2026-09-04T10:00:00.000Z",
};

/** STUCK judged at NOW, with NUMBER: the stuck half of what the route answers. */
export const STUCK_NOW = {
  waiting: { n: 3, late: 1, oldest_at: "2026-09-02T15:00:00.000Z", capped: false },
  failed: {
    n: 1,
    latest: { name: "Spring note", failure: "paused", at: "2026-09-02T15:00:00.000Z" },
    capped: false,
  },
  replies: { n: 2, oldest_at: "2026-08-30T10:00:00.000Z", capped: false },
  templates: {
    n: 2,
    items: [
      { name: "winback_offer", language: "en_US", status: "paused" },
      { name: "spring_note", language: "en_US", status: "rejected" },
    ],
  },
  number: NUMBER,
};

/* ---------------------------------------------------------- what the route answers, and the surface that holds it */

/**
 * What the ledger route answers for the thirty days: SERIES (or what `over` puts in its place; `null` is a database with no
 * campaign_ledger yet) and the stuck half (`stuck`; null is a database with no campaign_stuck, or one that failed).
 */
export const dtoWith = (over = {}, stuck = STUCK_NOW) => ({
  timezone: SERIES.timezone,
  today: SERIES.today,
  end: SERIES.end,
  days: SERIES.days,
  series: over === null ? null : { ...SERIES, ...over },
  stuck,
});

/**
 * The surface's value: the sends' report, the ledger DTO and the range it is of, by its one name. The reach-outs are absent, as
 * the demo's are; a test of that part puts its own in `over`.
 */
export const held = (ledger = dtoWith(), key = "30d", over = {}) => ({ campaigns: CAMPAIGNS, ledger, key, ...over });
