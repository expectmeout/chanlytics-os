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
 * between lenses (the lenses spec, D18) and its id does not. The receptionist's tiles are built here; the campaigns' and
 * Google's are built where their reports are, and name their figures from this same set.
 */

/** Every figure a tile says. */
type ReportMetric = "customer_messages" | "answered_share" | "reply_median" | "handovers" | "calls" | "new_people" | "booked" | "messages_sent" | "delivered_share" | "replied_share" | "said_yes" | "asked_to_stop" | "rating" | "reviews" | "ratings_gained" | "newest_review" | "reviews_written" | "reviews_answered" | "review_reply_time" | "handover_first_reply" | "handover_settled" | "missed_calls_answered" | "answered_while_closed" | "waiting_on_you" | "call_backs" | "replies_held_back";
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
}
/** What the page's strip draws of a tile: its figure, its words, the period before beside it, and the page it opens and the count it is of where it has them. */
type ReportStripTile = Pick<ReportTileVM, "id" | "metric" | "label" | "value" | "meta" | "compare" | "door" | "n" | "minN">;

/** The words over a figure's label: what it counts and what it leaves out. */
declare const metricWordsOf: (metric: ReportMetric) => string;

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

/**
 * Reports › Receptionist — what the lens's own read says, counted once.
 *
 * The route answers the lens's parts in one DTO (receptionist-record.ts: receptionist_series, with the people sent the
 * booking link counted against the calendar and who waits on you counted by `standingOfThread`, and the workspace's hours
 * beside them). This puts them in words: the mixes (what became of the held replies, what customers asked about, the
 * language the receptionist wrote in, how calls ended), the booking link and what came of it, and the figures: your
 * first reply and the time to settle a handover, the calls nobody took and whether anyone answered within an hour, what
 * came while the business was closed, and what is stuck now. A page draws these and makes no sentence of its own; Ask says
 * what it says. A ratio carries the count it is of (REPORT_MIN_N greys it under five), and a number with no source is a
 * dash with words, never a zero. Pure: the page feeds it the DTO and the clock.
 *
 * The hold's `other` ("Did not go out") and the door's refusals (`heldBack`) overlap by design: a draft the door refused is
 * in both, so the two are never added together here or anywhere.
 */

/** One mix: its bars and the line under them, or the words for why there is none. */
interface MixPartVM {
    rows: ReportBarVM[];
    line: string | null;
    empty: string | null;
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
    /** [waiting on you, call-backs, replies held back] */
    stuck: ReceptionistFigureVM[];
    /** The reasons the door refused a reply, most first, for Ask and the figure's line. */
    heldBack: ReportBarVM[];
}
/** The lens's own parts, in words, from the DTO the route answers. */
declare function toReceptionistReportVM(dto: ReceptionistDto, opts: {
    nowMs: number;
}): ReceptionistReportVM;

export { type MixPartVM, type ReceptionistFigureVM, type ReceptionistReportVM, metricWordsOf, toReceptionistReportVM };
