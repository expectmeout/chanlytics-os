import { z } from 'zod';

interface BookingReportDto {
    /**
     * "ended": the report is of days that ended before today (days a member picked on Reports). The line is counted from
     * people as they stand now (who wrote last, and what is on the calendar), which says nothing true of a month ago, so
     * it is not counted at all for such a period, and says why.
     */
    calendar: "ok" | "unavailable" | "none" | "ended";
    days: number;
    asked: number;
    booked: number;
}

/**
 * The business's facts as fields (E4): the profile's schema and its parts (hours, closures, services, guardrails,
 * notes, booking rules), built from config-rules.ts's caps. The brain that holds the profile is brain-config.ts; the
 * prompt composed from it is compose.ts.
 */

declare const HoursSchema: z.ZodObject<{
    open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
        open: z.ZodString;
        close: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/**
 * A day the business is shut whatever the weekly grid says.
 *
 * `until` because "closed 24 December to 2 January" is ONE decision an owner
 * makes, and ten separate rows is how a holiday week ends up half-entered.
 *
 * Lenient for the same reason as IntervalSchema. Note the date regex accepts
 * 2026-11-31, which is not a day; the renderer checks that it round-trips and
 * prints the raw string when it does not, rather than confidently naming the
 * wrong date.
 */
declare const ClosureSchema: z.ZodObject<{
    date: z.ZodString;
    until: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type Hours = z.infer<typeof HoursSchema>;
type Closure = z.infer<typeof ClosureSchema>;

/** The hours and closures a workspace keeps on its profile (config.brain.profile), as the report reads them. */
interface ReportProfile {
    hours?: Record<string, Hours | undefined>;
    closures?: Closure[];
}

/** The channels a report names, in the order a chart lists them; each keeps its own colour whatever its rank.
 *  No Instagram: the messages CHECK admits none, so a report would only ever say zero (spec A5). */
type ReportChannelKey = "whatsapp" | "voice" | "email" | "sms";
interface ReportBarVM {
    id: string;
    label: string;
    value: number;
    /** 0..1 of the largest bar in its group. */
    share: number;
}

/**
 * The tiles of a report, and the words that compare them (moved out of reports.ts, which the file-length ratchet holds to 800
 * lines): a number over the period, what it is, a line under it, and the period before beside it. A tile names the figure it
 * says, by one id, where its builder builds it (`metric`): a closed set, so a tile that says what no id names is a compile
 * error rather than a lookup that falls back, and the id is what the figure is called wherever it is read (the page's
 * figures today; a definition's tooltip, Ask's block and the headline of a later phase). Not prefixed by a lens: a tile moves
 * between lenses (the lenses spec, D18) and its id does not. The receptionist's tiles are built here; the campaigns' (the lens's
 * strip) and Google's are built where their reports are, and name their figures from this same set.
 */

/** Every figure a tile says. */
type ReportMetric = "customer_messages" | "answered_share" | "reply_median" | "handovers" | "calls" | "new_people" | "booked" | "delivered_share" | "said_yes" | "asked_to_stop" | "rating" | "reviews" | "ratings_gained" | "newest_review" | "reviews_written" | "reviews_answered" | "review_reply_time" | "handover_first_reply" | "handover_settled" | "missed_calls_answered" | "answered_while_closed" | "waiting_on_you" | "call_backs" | "replies_held_back" | "people_reached" | "yeses_won" | "stops_recorded" | "steps_overdue" | "steps_due_today" | "email_stopped_now" | "said_yes_messages" | "can_receive_offers" | "opted_out_now" | "quiet_now" | "emails_written" | "emails_landed" | "emails_bounced" | "people_sent_to" | "people_wrote_back" | "runs_waiting" | "runs_failed" | "campaign_replies_waiting" | "templates_paused" | "number_health";
interface ReportTileVM {
    id: string;
    /** The figure this tile says: one id, declared by the builder of the tile. */
    metric: ReportMetric;
    label: string;
    value: string;
    meta: string;
    /** Signed change against the previous period, or null when there is no
     *  prior data to compare with (never a fabricated 0%). Ask reads it. */
    delta: {
        text: string;
        tone: "pos" | "neg" | "";
    } | null;
    /** One point per day of the current period (Ask and Today read these). */
    spark: number[];
    /** The period before, in counts ("up from 99"); null when there is nothing to compare with. */
    compare: string | null;
    /** The work page the number opens, as a route ("inbox"): the people or the messages it counts. Set where there is one. */
    door?: string;
    /** What a ratio is of (the replies a median was counted over); set on a ratio, with `minN`, and on no count. */
    n?: number;
    /** The fewest `n` that say anything (REPORT_MIN_N): a ratio of fewer is greyed on the page. */
    minN?: number;
    /**
     * What the number is, where it is not plain ink (the reports lenses spec, D10): `warn` for what needs you (steps overdue),
     * `fail` for what failed (email that stopped working). On the value alone, never its change; set on no tile but those.
     */
    tone?: "warn" | "fail";
}
/** What the page's strip draws of a tile: its figure, its words, the period before beside it, and the page it opens, the count it is of and the tone of its number where it has them. */
type ReportStripTile = Pick<ReportTileVM, "id" | "metric" | "label" | "value" | "meta" | "compare" | "door" | "n" | "minN" | "tone">;

/** The words over a figure's label: what it counts and what it leaves out. */
declare const metricWordsOf: (metric: ReportMetric) => string;

/**
 * Reports — the mix every lens draws as bars (10 Oct 2026): a count by key put in order, each given its words and its
 * share of the largest, with the line under them or the words for why there is none. Out of the Receptionist lens, which
 * drew the first, once the People lens drew its own; each lens still words its keys and its lines itself. Pure, and only
 * Reports' page reads it (PAGE_ONLY in tooling/scripts/gen/contracts-browser-entry.mjs).
 */

/** One mix: its bars and the line under them, or the words for why there is none. */
interface MixPartVM {
    rows: ReportBarVM[];
    line: string | null;
    empty: string | null;
}
/**
 * A bar that is a rate: the share it is of, the words that say what it is of, and the count it is of (`n`: the sends that have had
 * their time, the businesses an opening was the last email to) with the fewest that say anything (`minN`), so the page greys a bar of
 * fewer than five (D9). The Campaigns lens's messages and its reach-outs' angles are both these.
 */
interface RateRowVM {
    id: string;
    label: string;
    value: number;
    display: string;
    n: number;
    minN: number;
}

/** The receptionist's held drafts of a period by what became of each; `total` is all of them, `low_confidence` those held for a look. */
interface HoldCountsDto {
    total: number;
    sent: number;
    canceled: number;
    steered: number;
    overtaken: number;
    person_first: number;
    waiting: number;
    other: number;
    low_confidence: number;
}
/** The handovers of a period (escalations that were not an opt-out or a call-back) and the middles of the two times, in whole seconds. */
interface HandoverDto {
    n: number;
    /** The first message a person sent in the thread that left. */
    replied: {
        n: number;
        median_s: number | null;
    };
    /** The escalation's resolution; one with no recorded end is unknown and in neither count. */
    settled: {
        n: number;
        median_s: number | null;
    };
}
/**
 * The calls nobody took, by person at their first such call: `n` the people whose hour has passed, `touched` the ones the
 * business reached within it, `pending` the ones whose hour has not passed (in neither), `unknown` the calls with no caller.
 */
interface MissedDto {
    n: number;
    touched: number;
    pending: number;
    unknown: number;
}
/** An escalation open now, with the standing of its thread: the reader decides who is waiting. */
interface OpenEscalationDto {
    reason: string;
    created_at: string;
    state: string;
    paused_until: string | null;
    assignee_user_id: string | null;
}
/** receptionist_series's own answer (00380). */
interface ReceptionistSeriesDto {
    timezone: string;
    /** The workspace's day in that zone when the read was made: "2026-10-06". */
    today: string;
    /** The window's last day (00360): today for a period by name, an earlier day for days a member picked. */
    end?: string;
    days: number;
    hold: {
        now: HoldCountsDto;
        before: {
            total: number;
            sent: number;
        };
    };
    topics: {
        of: number;
        stamped: number;
        by_intent: Record<string, number>;
    };
    languages: {
        of: number;
        stamped: number;
        by_language: Record<string, number>;
    };
    /** The replies the send door refused, by reason. A draft it refused is in the hold's `other` too: the two overlap by design. */
    blocked: {
        total: number;
        by_reason: Record<string, number>;
    };
    call_endings: {
        total: number;
        by_reason: Record<string, number>;
    };
    handover: {
        now: HandoverDto;
        before: HandoverDto;
    };
    missed: {
        now: MissedDto;
        before: MissedDto;
    };
    /** Every customer message of the window by its day and quarter hour in the workspace's zone, and how many the receptionist answered first. */
    after_hours: {
        d: string;
        q: number;
        n: number;
        a: number;
    }[];
    /** The people sent the booking link, one row each at their first (at most 500 listed). */
    links: {
        total: number;
        people: {
            c: string;
            at: string;
        }[];
    };
    stuck: {
        open: OpenEscalationDto[];
    };
}
type LinksCalendar = BookingReportDto["calendar"];
/** The booking links, against what the calendar could say of them. */
interface LinksSentDto {
    sent: number;
    /** Of the people sent the link, how many have booked since; null where the calendar could not say. */
    booked: number | null;
    calendar: LinksCalendar;
}
/** What waits on the person looking, now. */
interface StuckNowDto {
    waiting: number;
    /** When the longest-waiting one was flagged; null with none waiting. */
    oldest_at: string | null;
    callbacks: number;
    /** The database listed as many open escalations as it ever does, so `waiting` and `callbacks` count the ones listed: at least that many. */
    capped: boolean;
}
/** What the route answers (the reader's body). `series` is null where the database has no receptionist_series yet. */
interface ReceptionistDto {
    timezone: string;
    today: string;
    end?: string;
    days: number;
    series: (Omit<ReceptionistSeriesDto, "links" | "stuck"> & {
        links: LinksSentDto;
        stuck: StuckNowDto;
    }) | null;
    profile: ReportProfile | null;
}

/** A figure of the lens: the strip's tile, with the count a ratio is of (`n`) and the page a number opens (`door`) where it has them. */
type ReceptionistFigureVM = ReportStripTile;
interface ReceptionistReportVM {
    /** False: the database has no receptionist_series yet, and the lens draws nothing of the parts below. */
    available: boolean;
    hold: MixPartVM;
    topics: MixPartVM;
    /** Null unless the receptionist wrote in two or more languages: one is no mix. */
    languages: MixPartVM | null;
    callEndings: MixPartVM;
    /** The people sent the booking link, how many have booked since where the calendar could say, and the sentence. */
    link: {
        sent: number;
        booked: number | null;
        line: string;
    };
    /** [your first reply after a handover, the time to settle one] */
    handover: ReceptionistFigureVM[];
    missed: ReceptionistFigureVM;
    /** Null where the workspace's hours could not be read; `unset` where they were and hold no open day. */
    closed: (ReceptionistFigureVM & {
        unset: boolean;
    }) | null;
    /** [needs you, call-backs, replies held back] */
    stuck: ReceptionistFigureVM[];
    /** The reasons the door refused a reply, most first, for Ask and the figure's line. */
    heldBack: ReportBarVM[];
}
/** The lens's own parts, in words, from the DTO the route answers. */
declare function toReceptionistReportVM(dto: ReceptionistDto, opts: {
    nowMs: number;
}): ReceptionistReportVM;

/**
 * A reach-out's hand step (Reach out Part 5, G20): a chain's last step may hand each lead it reaches to the team instead
 * of writing to them, as a call to make or a note, a dated step on the lead's person due the day the step runs. Its
 * shape is the database's (00228 playbooks.hand); its words are here.
 */
/** What a hand step hands over: a call to make, or a note. */
declare const HAND_KINDS: readonly ["call", "note"];
type HandKind = (typeof HAND_KINDS)[number];

/**
 * Reports › People — the book as it stands now, counted over the people pool by People's own rules.
 *
 * The window of the lens (who reached the business, how they came, what they answered) is the database's, counted over
 * days (people_series, 00395). The book is not: it is everyone People holds at this moment, and it is counted here, from
 * the same rows People draws (`people_list`'s, through the pool's builder, `poolRowsOf`) by the predicates People already
 * has, never restated. How long since a person was heard is `PersonRowVM.heardDays`; who is quiet, who said yes to
 * messages or to offers and who asked to stop are the built-in lists (`membersOf` over `BUILTIN_LISTS`, which People's rail
 * counts too); a next step's standing is `nextStep.due`; the ways a person reaches the business are `channels`; a stopped
 * address is `emailSuppressed`. A number here is a number the rail would show for the same people, which a test holds.
 *
 * Counts only: nothing of a person leaves. The book is read for no one looking (`viewer: null`), so a list that is about
 * whoever is looking could not be counted, and none of the five lists is. Pure.
 */

/** The book as it stands now: how many people, how fresh, on which lists, with which steps and by which wires. Counts only. */
interface PeopleNowDto {
    /** The live people the pool holds. */
    people: number;
    /** By how long since they last wrote or rang, in the workspace's days; `never` for someone who has done neither. */
    fresh: {
        under_7: number;
        d7_30: number;
        d31_60: number;
        d61_90: number;
        d91_up: number;
        never: number;
    };
    /** People's own lists, counted by `membersOf`. */
    lists: {
        opted_in: number;
        offers_ok: number;
        opted_out: number;
        quiet: number;
    };
    /** People whose earliest open step's day is before today / is today. */
    steps: {
        overdue: number;
        due_today: number;
    };
    /** People whose address has bounced or complained and is no longer sent to. */
    email_stopped: number;
    /** By the ways they reach the business: one wire alone, several, or none on record. */
    wires: {
        whatsapp_only: number;
        sms_only: number;
        phone_only: number;
        email_only: number;
        several: number;
        none: number;
    };
}

/** The people who reached the business in a period: all of them, and those whose first moment with it was in the same period. */
interface ReachedDto {
    people: number;
    new: number;
}
/** The people who reached the business on each wire, a person once in each wire they used: the four add to at least the people reached. */
interface ByChannelDto {
    whatsapp: number;
    sms: number;
    email: number;
    voice: number;
}
/** The answers given in the window, one a person, a kind of message and an answer: how many, by who gave it and by what it was about. */
interface AnswersDto {
    total: number;
    by_source: Record<string, number>;
    by_purpose: {
        messages: number;
        offers: number;
        email_offers: number;
    };
}
/** people_series's own answer (00395). */
interface PeopleSeriesDto {
    timezone: string;
    /** The workspace's day in that zone when the read was made: "2026-10-06". */
    today: string;
    /** The window's last day (00360): today for a period by name, an earlier day for days a member picked. */
    end?: string;
    days: number;
    /** The window (`now`) and the same number of days before it (`before`). */
    reached: {
        now: ReachedDto;
        before: ReachedDto;
    };
    by_channel: {
        now: ByChannelDto;
        before: ByChannelDto;
    };
    /** The new people of the window by the door they came through (`acquired_via`); the values add up to `reached.now.new`. */
    first_came: {
        by_via: Record<string, number>;
    };
    /** The yeses and stops of the window by who gave them and what for; the period before is totals. */
    consent: {
        now: {
            yes: AnswersDto;
            stop: AnswersDto;
        };
        before: {
            yes: number;
            stop: number;
        };
    };
    /** Addresses that stopped working in the window, a person once, by the first reason. */
    email_stopped: {
        total: number;
        by_reason: Record<string, number>;
    };
    /** The steps finished in the window, and how many of them on their day or before. */
    steps: {
        done: number;
        on_time: number;
    };
}
/** What the route answers (the reader's body). `series` is null where the database has no people_series yet; `now` is null where the book could not be counted. */
interface PeopleDto {
    timezone: string;
    today: string;
    end?: string;
    days: number;
    series: PeopleSeriesDto | null;
    now: PeopleNowDto | null;
}

/** A figure of the lens: the strip's tile, with the count a share is of (`n`), the list a count opens (`door`) and the tone of its number where it has them. */
type PeopleFigureVM = ReportStripTile;
interface PeopleReportVM {
    /** The lens's sentence; null where the window was not read, and the frame's own sentence stands. */
    head: string | null;
    /** False: the database has no people_series yet, and the lens draws nothing of the window. */
    windowAvailable: boolean;
    /** False: the people pool could not be counted, and the lens draws nothing of the book. */
    nowAvailable: boolean;
    /** [people who reached you, new people, yeses won, stops] */
    strip: PeopleFigureVM[];
    /** The window: how they reached you, how the new ones first came, how the yeses were won and the stops came, the steps done on time, the addresses that stopped. */
    channels: MixPartVM;
    firstCame: MixPartVM;
    yeses: MixPartVM;
    stops: MixPartVM;
    stepsDone: MixPartVM;
    emailStopped: MixPartVM;
    /** The book as of now: the ways people reach you, and how long since they last did. */
    wires: MixPartVM;
    fresh: MixPartVM & {
        quiet: {
            line: string;
            door: string;
            label: string;
        } | null;
    };
    /** [steps overdue, steps due today, email stopped working] */
    stuck: PeopleFigureVM[];
    /** [said yes to messages, can receive offers, opted out, quiet 30+ days] */
    stand: PeopleFigureVM[];
}
/** The lens's own parts, in words, from the DTO the route answers. */
declare function toPeopleReportVM(dto: PeopleDto): PeopleReportVM;

/** The kept rhythm card's unit: the frame's week and hours count a connected call in either direction beside the messages. */
declare const PEOPLE_RHYTHM_UNIT = "messages and calls";
/** What the kept rhythm card says, in place of a radar and a strip of zeros, for a period nobody wrote or called in. */
declare const PEOPLE_RHYTHM_EMPTY = "Nobody wrote or called in this period.";
declare const FIRST_CAME_NOBODY = "Nobody new reached you in this period.";

interface ReachOutReportCounts {
    /** Emails that left (a business with three is three). */
    written: number;
    delivered: number;
    bounced: number;
    /**
     * The businesses written to, each once, at its last email of the period (00404): the population wrote back, interested,
     * booked and said no are counts of, so a share of them is of this, never of `written`. Absent on a database before 00404.
     */
    businesses?: number;
    wrote_back: number;
    interested: number;
    booked: number;
    /**
     * The businesses whose deal naming them was won (00430): a count, never an amount, as the other outcomes are. Absent on
     * a database before it, where the cell says a dash, never a zero nobody counted.
     */
    won?: number;
    said_no: number;
    handed: number;
}
interface ReachOutReportStepDto extends ReachOutReportCounts {
    id: string;
    n: number;
    hand: HandKind | null;
}
interface ReachOutReportChainDto {
    root_id: string;
    name: string;
    state: string;
    search: {
        id: string;
        name: string;
    } | null;
    last_at: string | null;
    runs: number;
    steps: ReachOutReportStepDto[];
}
interface ReachOutReportDomainDto {
    /** Null for the emails of a domain since removed. */
    host: string | null;
    state: string | null;
    held_why: string | null;
    held_at: string | null;
    sent: number;
    delivered: number;
    /** Permanent bounces, the domain's own rule (00220 sending_domain_counts). */
    bounced: number;
    complained: number;
}
/** What `reach_out_report(tenant, days)` answers (00241). */
interface ReachOutReportDto {
    timezone: string;
    days: number;
    today: string;
    /** The report's last day (00360): today for a period by name, an earlier day for days a member picked. */
    end?: string;
    since: string;
    /** The workspace has a reach-out at all: the section is drawn only then. */
    has_reach_out: boolean;
    totals: ReachOutReportCounts;
    /** What the period before (the same count of days, ending the day before `since`) wrote: emails only, outcomes being state now (00404). */
    before?: {
        written: number;
        delivered: number;
        bounced: number;
    };
    series: Array<{
        day: string;
        written: number;
    }>;
    chains: ReachOutReportChainDto[];
    /** `businesses` (00404): the businesses whose last email had this angle; absent on a database before it. */
    angles: Array<{
        angle: string;
        written: number;
        businesses?: number;
        wrote_back: number;
    }>;
    other_angles: {
        written: number;
        businesses?: number;
        wrote_back: number;
    };
    no_angle: number;
    domains: ReachOutReportDomainDto[];
}
/** A domain's row in the Reach-outs part (H5): its state in words, and how its emails landed, as shares the lens words. */
interface ReachOutDomainRow {
    id: string;
    host: string;
    state: string;
    held: boolean;
    sent: number;
    landed: string;
    bounced: string;
    complained: string;
}

/**
 * A line of the sources table: a reach-out, then each of its steps on its own line. Every cell is words, in businesses
 * where it is a share of an outcome.
 */
interface ReachOutLensSourceLine {
    id: string;
    kind: "chain" | "step";
    name: string;
    meta: string;
    /** The chain's row on Playbooks, for a reach-out's line. */
    to: string | null;
    /** Emails written. */
    written: string;
    /** Emails landed: a share of the emails written, from five. */
    delivered: string;
    /** Businesses written to, each once at its last email. */
    businesses: string;
    /** Businesses that wrote back: a share of the businesses, from five. */
    wroteBack: string;
    interested: string;
    booked: string;
    /** Won (00430): a dash on a database before it. */
    won: string;
    saidNo: string;
    bounced: string;
    last: string;
}
interface ReachOutLensVM {
    /** Draw the part: the workspace has a reach-out. */
    present: boolean;
    /** Nothing was written or handed in the period. */
    empty: boolean;
    days: number;
    /** As the database gave them (`businesses` absent before 00404). */
    totals: ReachOutReportCounts;
    /** [emails written, landed, bounced] */
    strip: ReportStripTile[];
    /** Written, delivered, bounced: emails. */
    emails: MixPartVM;
    /** Written to, wrote back, interested, booked, said no: businesses. */
    businesses: MixPartVM;
    /**
     * The share of the businesses whose last email had each angle that wrote back. A bar is a rate: `n` is the businesses it is of
     * and `minN` the fewest that say anything, so the page greys a bar of fewer than five (D9, as the messages' rates are).
     */
    angles: {
        rows: RateRowVM[];
        line: string | null;
        empty: string | null;
    };
    domains: ReachOutDomainRow[];
    /** A day written, with what a screen reader says of it (`writtenWords`). */
    points: Array<{
        day: string;
        label: string;
        short: string;
        written: number;
        writtenWords: string;
    }>;
    table: {
        columns: string[];
        rows: Array<Array<string | number>>;
    };
    /** A line a reach-out and a line a step under it, in businesses. */
    sources: ReachOutLensSourceLine[];
    /** `sources` is the line under the sources table: each business counts once, and what came of it is as it stands now. */
    lines: {
        written: string;
        domains: string;
        empty: string;
        sources: string;
    };
}
/** The Reach-outs part's own words, from the report the route answers (and the period before it, where there is one). */
declare function toReachOutLensVM(raw: ReachOutReportDto, nowMs?: number): ReachOutLensVM;

/**
 * Reports › Campaigns — what the campaigns sent and what came of it, as facts.
 *
 * Messages sent by broadcasts and playbook runs, each channel's own delivered
 * receipts (and WhatsApp's read receipts), who wrote back afterwards, and the people who said
 * yes or asked to stop — over the period and the one before it, and the
 * current period by source and by the channel each went by (0030). Every number is a count over columns; the
 * shares are counts over counts; nothing is scored or estimated. A read is a share of WhatsApp's own sends alone:
 * a text or an email keeps no read receipt. Colors are the page's.
 */

interface CampaignDayDto {
    day: string;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    opt_ins: number;
    opt_outs: number;
}
interface CampaignSourceDto {
    id: string;
    kind: "playbook" | "broadcast";
    name: string;
    template_name: string | null;
    runs: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    last_at: string | null;
}
/** One channel's part of the current period (`campaign_series.by_channel`, 0030): a row naming none went by WhatsApp. */
interface CampaignChannelDto {
    channel: string;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
}
/** What `campaign_series(tenant, days)` returns. `series` spans TWO periods, newest last; `sources` is the current one. */
interface CampaignReportDto {
    timezone: string;
    days: number;
    span_days: number;
    today: string;
    series: CampaignDayDto[];
    sources: CampaignSourceDto[];
    /** The current period by channel, the most sent first (0030); absent from a database before it. */
    by_channel?: CampaignChannelDto[];
    error?: string;
}
/** A channel a campaign sends on, in a report's own words for it (REPORT_CHANNELS): WhatsApp, a text, an email. */
type CampaignChannelKey = Exclude<ReportChannelKey, "voice">;
/** One channel's figures in the period, as the Campaigns lens draws them (0030). */
interface CampaignChannelVM {
    channel: CampaignChannelKey;
    label: string;
    sent: number;
    delivered: number;
    deliveredPct: number | null;
    /** WhatsApp's alone, of its own sends: no other channel keeps a read receipt, so any other's is null, never a zero. */
    read: number | null;
    readPct: number | null;
    replied: number;
    repliedPct: number | null;
    /** What its bar says beside it: what it sent, and how much of it was delivered (a share from five sends, else the count: shareSaid). */
    display: string;
}
interface CampaignPointVM {
    day: string;
    label: string;
    short: string;
    sent: number;
    delivered: number;
    replied: number;
    optIns: number;
    optOuts: number;
    /** What a screen reader hears of the day's column: the day and what it sent. */
    sentWords: string;
    /** What the column's pointer adds under its number: the messages of the day that were answered; null where none were. */
    answeredWords: string | null;
}
interface CampaignSourceVM {
    id: string;
    kind: "playbook" | "broadcast";
    kindLabel: string;
    name: string;
    templateName: string | null;
    /** The template's words for people; the page may swap in the workspace's own title. */
    template: string;
    runs: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    deliveredPct: number | null;
    repliedPct: number | null;
    /** What the table says of its delivered share: a percentage from five sends, else the count ("3 of 4"); a dash for none (shareSaid). */
    deliveredWords: string;
    /** What it says of the messages answered: a percentage with the count from five sends, else the count ("1 of 3"); a dash for none. */
    repliedWords: string;
    lastLabel: string;
}
interface CampaignTotals {
    sent: number;
    delivered: number;
    /** WhatsApp's read receipts over the period (Campaigns' home draws them in its funnel). */
    read: number;
    /**
     * The sends a read is a share of: WhatsApp's own (0030), the one channel that keeps read receipts; every send from a
     * database before the channels were counted, as it always was.
     */
    readOf: number;
    replied: number;
    sends: number;
    optIns: number;
    optOuts: number;
}
interface CampaignReportVM {
    days: number;
    points: CampaignPointVM[];
    totals: CampaignTotals;
    /** The period before's messages sent, delivered and answered, and its yeses and stops: what the lens's strip sets this period beside. */
    before: {
        sent: number;
        delivered: number;
        replied: number;
        optIns: number;
        optOuts: number;
    };
    sources: CampaignSourceVM[];
    /** Nothing went out and nobody answered about offers: no send, no yes, no stop. */
    empty: boolean;
    table: {
        columns: string[];
        rows: (string | number)[][];
    };
    /** The channels that sent in the period, the most first (0030): the lens draws them where more than one did. */
    channels: CampaignChannelVM[];
    /**
     * The channels' figures as a table: each one's sent, delivered, read (WhatsApp's alone) and replies. A read that is no
     * figure is null: the kit's table draws its own dash, and its CSV an empty cell.
     */
    channelTable: {
        columns: string[];
        rows: (string | number | null)[][];
    };
    /**
     * The one sentence under each campaign card: how many runs sent it (null with none), and what a read is, where more than
     * one channel sent (null otherwise). The funnel's sentence and the figures are the Campaigns lens's own (campaigns/campaign-lens.ts).
     */
    lines: {
        sent: string | null;
        channels: string | null;
    };
}

/** The people a period's runs sent to, and how many of them wrote back: a person once, however many runs sent to them. */
interface PeopleCountsDto {
    sent_to: number;
    wrote_back: number;
}
/** The runs of a period that sent, by kind. A reach-out step's run is never here: its people are reach_out_sends. */
interface RunCountsDto {
    moment: number;
    broadcast: number;
}
/** Messages that failed after they were sent, for one cause: the channel they went by and the provider's code, or with none one word of a closed set. */
interface FailedSendDto {
    channel: string;
    code: number | null;
    kind: string | null;
    n: number;
}
/** One message's sends in the window (by the run's template and language), the ones whose reply window is over, and the answered of those. */
interface ByMessageDto {
    name: string;
    language: string;
    sent: number;
    mature: number;
    replied: number;
}
/** campaign_ledger's own answer (00405): counts, and the business's own template names; never a person's name, number or address. */
interface CampaignLedgerSeriesDto {
    timezone: string;
    /** The workspace's day in that zone when the read was made: "2026-10-06". */
    today: string;
    /** The window's last day (00360): today for a period by name, an earlier day for days a member picked. */
    end?: string;
    days: number;
    /** The window (`now`) and the same number of days before it (`before`); `counting` are the people whose reply window is not over. */
    people: {
        now: PeopleCountsDto & {
            counting: number;
        };
        before: PeopleCountsDto;
    };
    runs: {
        now: RunCountsDto;
        before: RunCountsDto;
    };
    /** People a run did not send to, dated by the run, by a reason of ours (`other` where the database held none). */
    held: {
        total: number;
        skipped: number;
        failed: number;
        by_reason: Record<string, number>;
    };
    /** The runs that failed or were canceled, the failed by their code. */
    stopped: {
        failed: number;
        canceled: number;
        by_failure: Record<string, number>;
    };
    failed_sends: {
        total: number;
        by_code: FailedSendDto[];
    };
    /** The twenty messages with most sends. */
    by_message: ByMessageDto[];
    /** The window's answered sends, by the seconds to the first answer. */
    first_reply: {
        n: number;
        median_s: number | null;
        buckets: {
            m15: number;
            h1: number;
            h4: number;
            h24: number;
            h72: number;
        };
    };
    /** The approvals made in the window, by the seconds from the run's being made to the decision. */
    approval: {
        n: number;
        median_s: number | null;
        buckets: {
            h1: number;
            h4: number;
            h24: number;
            over: number;
        };
    };
}
/** The connected WhatsApp number, as the lens says it: none connected, one that could not be read, or its health and when it was last checked. */
type CampaignNumberDto = {
    state: "none";
} | {
    state: "unread";
} | {
    state: "read";
    tone: "ok" | "warn" | "danger" | "unknown";
    can_send: boolean;
    label: string;
    checked_at: string | null;
};
/** What is stuck in the workspace's campaigns now, judged. A `capped` list reached the 500 the database lists: its count is at least that. */
interface CampaignStuckNowDto {
    /** Runs waiting for an OK; `late` are those the verb that approves them would refuse (their day has passed). */
    waiting: {
        n: number;
        late: number;
        oldest_at: string | null;
        capped: boolean;
    };
    failed: {
        n: number;
        latest: {
            name: string;
            failure: string;
            at: string;
        } | null;
        capped: boolean;
    };
    /** People who answered a campaign and whose thread waits on a person, the workspace's. */
    replies: {
        n: number;
        oldest_at: string | null;
        capped: boolean;
    };
    /** Every template Meta stopped, and the first three. */
    templates: {
        n: number;
        items: Array<{
            name: string;
            language: string;
            status: "paused" | "disabled" | "rejected";
        }>;
    };
    number: CampaignNumberDto;
}
/**
 * What the route answers (the reader's body). `series` is null where the database has no campaign_ledger yet and `stuck`
 * where it has no campaign_stuck, or where that read failed (`stuck_failed`, set only then: a function a database lacks is
 * not a failure).
 */
interface CampaignLedgerDto {
    timezone: string;
    today: string;
    end?: string;
    days: number;
    series: CampaignLedgerSeriesDto | null;
    stuck: CampaignStuckNowDto | null;
    stuck_failed?: true;
}

/** The lens's reads, by the part of the page each feeds. */
type ReadPart = "campaigns" | "ledger" | "stuck" | "reach_outs";

/** The three reads: the sends, the ledger the route answers (null where it failed), and the reach-outs (undefined in the demo). */
interface CampaignLensInput {
    campaigns: CampaignReportDto | null;
    ledger: CampaignLedgerDto | null;
    reachOuts: ReachOutReportDto | null | undefined;
}
/** A figure of the lens: the strip's tile, with the count a share is of (`n`), the page a count opens (`door`) and the tone of its number where it has them. */
type CampaignFigureVM = ReportStripTile;
interface CampaignLensVM {
    /** The lens's sentence; null where the sends could not be read. */
    head: string | null;
    /** How each read went: `missing` is a function the database lacks (no failure, no words), `none` the reach-outs of a demo. */
    reads: {
        campaigns: "ok" | "failed";
        ledger: "ok" | "missing" | "failed";
        stuck: "ok" | "missing" | "failed";
        reachOuts: "ok" | "failed" | "none";
    };
    /** One entry for each read that failed, with what stands. */
    failed: Array<{
        part: ReadPart;
        what: string;
        body: string;
    }>;
    /** Nothing went out, nothing was held, no run stopped and nobody answered: the lens draws one card, and what is stuck and the reach-outs. */
    quiet: boolean;
    /** The existing fold of the sends: the days, the channels, the sources and the tables. */
    report: CampaignReportVM | null;
    /** [people sent to, delivered, wrote back, said yes, asked to stop]; three without the ledger. */
    strip: CampaignFigureVM[];
    funnel: MixPartVM;
    held: MixPartVM;
    stopped: MixPartVM;
    failedWhy: MixPartVM;
    byMessage: {
        rows: RateRowVM[];
        line: string | null;
        empty: string | null;
    };
    /** "From 12 campaign runs and 2 one-off broadcasts." */
    runsLine: string | null;
    firstReply: MixPartVM;
    approval: MixPartVM;
    /** [runs waiting, failed runs, replies waiting, messages Meta stopped, your number]; empty where not read. */
    stuck: CampaignFigureVM[];
    /** Null where the reach-outs were not read or failed. */
    reachOuts: ReachOutLensVM | null;
}
/** The Campaigns lens's parts, in words, from its three reads and the clock. */
declare function toCampaignLensVM(input: CampaignLensInput, nowMs: number): CampaignLensVM;

export { type CampaignFigureVM, type CampaignLensInput, type CampaignLensVM, FIRST_CAME_NOBODY, type MixPartVM, PEOPLE_RHYTHM_EMPTY, PEOPLE_RHYTHM_UNIT, type PeopleFigureVM, type PeopleReportVM, type RateRowVM, type ReachOutLensSourceLine, type ReachOutLensVM, type ReceptionistFigureVM, type ReceptionistReportVM, metricWordsOf, toCampaignLensVM, toPeopleReportVM, toReachOutLensVM, toReceptionistReportVM };
