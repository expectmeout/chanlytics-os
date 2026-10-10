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
type ReportMetric = "customer_messages" | "answered_share" | "reply_median" | "handovers" | "calls" | "new_people" | "booked" | "messages_sent" | "delivered_share" | "replied_share" | "said_yes" | "asked_to_stop" | "rating" | "reviews" | "ratings_gained" | "newest_review" | "reviews_written" | "reviews_answered" | "review_reply_time" | "handover_first_reply" | "handover_settled" | "missed_calls_answered" | "answered_while_closed" | "waiting_on_you" | "call_backs" | "replies_held_back" | "people_reached" | "yeses_won" | "stops_recorded" | "steps_overdue" | "steps_due_today" | "email_stopped_now" | "said_yes_messages" | "can_receive_offers" | "opted_out_now" | "quiet_now";
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

/**
 * Reports › People — the book as it stands now, counted over the people pool by People's own rules.
 *
 * The window of the lens (who reached the business, how they came, what they answered) is the database's, counted over
 * days (people_series, 00393). The book is not: it is everyone People holds at this moment, and it is counted here, from
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
/** people_series's own answer (00393). */
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

/**
 * Reports › People — what the lens's own read says, counted once.
 *
 * The route answers the lens's two halves in one DTO (people-record.ts): the window, from the database (people_series, 00393:
 * who reached the business and how, how the new ones first came, the yeses and stops they gave, the addresses that stopped
 * working, the steps finished on time), and the book as it stands now, from the people pool by People's own rules
 * (people-now.ts). This puts them in words: the head, the four figures against the period before, the mixes, the book's
 * wires and freshness, what is stuck and where the book stands. A page draws these and makes no sentence of its own; Ask
 * says what it says. A share carries the count it is of (REPORT_MIN_N greys it under five), a part with nothing in it says
 * so in words and never as a zero percentage, and either half stands without the other. Pure: the page feeds it the DTO.
 *
 * The window is "people", not "messages": report_series counts messages and calls day by day, and a person who wrote ten
 * times is one here. The book is "as of now, whatever period is picked", and says so wherever it is drawn.
 */

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

export { FIRST_CAME_NOBODY, type MixPartVM, PEOPLE_RHYTHM_EMPTY, PEOPLE_RHYTHM_UNIT, type PeopleFigureVM, type PeopleReportVM, type ReceptionistFigureVM, type ReceptionistReportVM, metricWordsOf, toPeopleReportVM, toReceptionistReportVM };
