/** The words a workspace may call an appointment, in the order a picker offers them. */
declare const APPOINTMENT_WORDS: readonly ["appointment", "visit", "meeting", "session", "lesson"];
type AppointmentWord = (typeof APPOINTMENT_WORDS)[number];

/**
 * What an owner's ads are, as a reader will return them (the Ads page's DTO): the data of Campaigns › Ads, in the words the
 * rest of the product keeps. Money is an integer in the minor units of the account's currency, never a float and never
 * converted; a day is an ISO day (`2026-10-11`) and a moment an ISO timestamp with its offset; an id is Chanlytics' own (a
 * uuid) beside the platform's, and a person or a thread carries the id its own page opens by.
 *
 * Two shapes: `AdsRead`, what is true of this workspace now (its ads, accounts and people, read at one moment), and
 * `AdsConfig`, what the platforms return as choices and estimates (fixed per account, not per ad). A page draws a model of
 * both (page.ts, drawer.ts, new-ad.ts); nothing a page says is typed here as a total. The sample the mockup draws is a
 * fixture of these shapes in the dashboard (surfaces/campaigns/ads/sample.ts), and a reader will return the same.
 *
 * A root module of the package, for the server and Reports to read: types, the day arithmetic every Ads module shares, and
 * the one rule of how much an ad spends a day once its amount or end moves. Its words are words.ts's.
 */

/** The three platforms an owner's own ad accounts live on. */
type AdPlatform = "meta" | "google" | "tiktok";
/** What an ad asks a person to do: message you on WhatsApp, call you, leave their number. */
type AdDoor = "whatsapp" | "call" | "form";
/**
 * What an ad is doing, in platform-free words. `too-early` is NOT stored: the page's fold reads it from an `on` ad that
 * started fewer than TOO_EARLY_DAYS ago. `setting-up`: Turn on was pressed and Chanlytics is creating it, paused, on the
 * platform; `couldnt-finish`: that failed part way, and what was made stays paused there (named in the drawer).
 */
type AdState = "setting-up" | "couldnt-finish" | "review" | "on" | "paused" | "needs-you" | "ended" | "finished";
/** Why an ad needs the owner. */
type AdNeedsCode = "rejected" | "payment" | "paused-in-platform" | "price-changed" | "permission-lapsing" | "number-check" | "verification" | "lead-terms" | "identity" | "out-of-budget";
interface AdNeeds {
    code: AdNeedsCode;
    /** The platform's own words, verbatim, where it gave some (a rejection's policy line). */
    platformWords: string | null;
    /** price-changed: the price the ad says, and the one Services says now. */
    was: string | null;
    now: string | null;
}
/** What the platform enforces: a total for the whole run, or a daily amount until stopped. Minor units of the account's currency. */
type AdBudget = {
    mode: "total";
    amountMinor: number;
} | {
    mode: "daily";
    amountMinor: number;
};
/** Where it shows: a circle (Meta, Google) or ZIP codes (TikTok). */
type AdArea = {
    kind: "radius";
    miles: number;
} | {
    kind: "zips";
    zips: string[];
};
/** What the ad shows: a post as it is, a photo, a video (vertical for Reels and TikTok), or nothing (Google Search). */
type AdMedia = {
    kind: "post";
    postId: string;
} | {
    kind: "photo";
    label: string;
} | {
    kind: "video";
    label: string;
    vertical: boolean;
} | {
    kind: "none";
};
/** When it runs: all hours, or only while the business is open (Meta: only with a total). */
type AdSchedule = "always" | "open-hours";
/** Who the ad is shown as: the Facebook Page and Instagram handle, Google's business name, TikTok's display name. */
interface AdShownAs {
    name: string;
    handle: string | null;
}
/** One day of one ad (the account's time zone for spend, the workspace's for people; the fold never mixes them up). */
interface AdDay {
    day: string;
    spendMinor: number;
    inTouch: number;
    booked: number;
}
/** The platform's own numbers, kept off the page's face, never summed across platforms. Null is not read. */
type AdTheirs = {
    platform: "meta";
    impressions: number | null;
    reach: number | null;
    taps: number | null;
    chats: number | null;
    leads: number | null;
} | {
    platform: "google";
    impressions: number | null;
    clicks: number | null;
    calls: number | null;
    longCalls: number | null;
} | {
    platform: "tiktok";
    impressions: number | null;
    reach: number | null;
    clicks: number | null;
    leads: number | null;
};
/** The words an ad is made of (every one a sentence the owner can read and change). */
interface AdCopy {
    headline: string;
    text: string;
    headlines: string[];
    lines: string[];
    path: string;
    greeting: string;
    ready: string;
    questions: string[];
    startWith: "ready" | "questions";
    reply: string;
    thanks: string;
}
interface AdRead {
    /** Chanlytics' own id (a uuid). The address uses it. */
    id: string;
    /** The platform's id for it once made there (Meta's ad id, Google's campaign id, TikTok's ad id); null before. */
    externalId: string | null;
    /** Bumped on every change; a press carries the version it was drawn from and a stale one is refused. */
    version: number;
    name: string;
    offer: string;
    serviceId: string;
    platform: AdPlatform;
    door: AdDoor;
    state: AdState;
    needs: AdNeeds | null;
    /** False for an ad the owner made on the platform itself, adopted read-only: only Pause and Resume here. */
    madeHere: boolean;
    startDay: string;
    endDay: string;
    /** `11:59 pm` where the platform says when the last day ends, else null. */
    endsAt: string | null;
    budget: AdBudget;
    /**
     * TikTok: the last day its amount was changed there (an ISO day), or null where it never was; it takes no second change
     * for BUDGET_RULES.tiktok.waitDays after it. Absent where the platform's reader does not say, which draws no wait.
     */
    budgetChangedDay?: string | null;
    /** The account's currency, ISO 4217 (`USD`). Never converted. */
    currency: string;
    aboutADayMinor: number;
    area: AdArea;
    schedule: AdSchedule;
    shownAs: AdShownAs;
    media: AdMedia;
    /** Google: the page the ad opens (its final URL); null on Meta and TikTok. */
    opensUrl: string | null;
    /** Google: what people search, as Google grouped it (read-only). */
    searchThemes: string[];
    /** Google: searches left out for the owner (negative keywords). */
    leftOut: string[];
    approvedDay: string | null;
    /** When it was sent to the platform to check (ISO timestamp), while in review. */
    sentAt: string | null;
    theirs: AdTheirs;
    /** Chanlytics' first reply to those who wrote: the median in seconds, and how many. */
    reply: {
        medianSeconds: number;
        n: number;
    } | null;
    todaySoFar: number;
    /** When the last person (or number) arrived (ISO timestamp); the reach line says it, derived, never typed. */
    lastArrivalAt: string | null;
    copy: AdCopy;
    days: AdDay[];
}
/** One person an ad brought, with where they live in the app. */
interface AdPersonRead {
    /** The person's id in People: their page is `clients/<personId>` (see People's route words). */
    personId: string;
    /** Their conversation, where there is one: `inbox/<threadId>`. */
    threadId: string | null;
    adId: string;
    name: string;
    how: "wrote" | "number";
    day: string;
    /** ISO timestamp, where it is today. */
    at: string | null;
    said: string | null;
    /** `waiting` and `call` are on the owner; `talking` is the receptionist's. */
    talk: "waiting" | "call" | "talking" | "quiet";
    quietSince: string | null;
    /** What the calendar says of them since. */
    cal: {
        kind: "none";
    } | {
        kind: "ahead";
        day: string;
        time: string;
    } | {
        kind: "kept";
        day: string;
    } | {
        kind: "missed";
        day: string;
    } | {
        kind: "past";
        day: string;
    };
}
type AdAccountStatus = "connected" | "not-connected" | "choose" | "lapsed";
/** What one platform's account stands on, by id; the words for each id are words.ts's (never typed in data). */
type AdCheckId = "account-active" | "payment" | "page-linked" | "whatsapp-linked" | "instagram-linked" | "chanlytics-whatsapp" | "number-on-page" | "call-reporting" | "verification" | "tiktok-linked" | "privacy-link" | "yes-line" | "lead-terms" | "identity" | "post-permission" | "manager-link";
interface AdCheck {
    id: AdCheckId;
    ok: boolean;
}
interface AdAccountRead {
    platform: AdPlatform;
    status: AdAccountStatus;
    /** The account's name on the platform, null until one is chosen. */
    name: string | null;
    externalId: string | null;
    currency: string;
    /** The account's time zone (IANA): spend days are the account's. */
    timezone: string;
    checks: AdCheck[];
    /** TikTok's post permission, Meta's token: the day it lapses, or null. */
    permissionEnd: string | null;
    /** The accounts to choose from, when there are several (status `choose`). */
    choices: {
        externalId: string;
        name: string;
        currency: string;
    }[];
    /** When it was last read (ISO timestamp), or null. */
    readAt: string | null;
    /** How the last read went. */
    read: "ok" | "reading" | "failed";
}
interface AdsRead {
    business: {
        name: string;
        /** `12 Harbor St`. */
        address: string;
        /** `Harbor St`. */
        street: string;
        /** The receptionist's line. */
        line: string;
        site: string;
        /** The hosted page Google ads can open: `chanlytics.com/b/<slug>`. */
        page: string;
        /** The receptionist's hours, as words: `Mon to Sat`, `Mon to Sat, 9 AM to 6 PM`. */
        hours: string;
    };
    /** The workspace's today (ISO day) and when this was read (ISO timestamp), in the workspace's time zone. */
    today: string;
    readAt: string;
    timezone: string;
    /** The window the page counts: 30 days ending yesterday. */
    window: {
        from: string;
        to: string;
    };
    appointmentWord: AppointmentWord;
    /** Whether a calendar link is set; without one nobody can be counted as booked. */
    calendar: {
        linked: boolean;
        readAt: string | null;
    };
    accounts: AdAccountRead[];
    ads: AdRead[];
    people: AdPersonRead[];
    /** What came back of those who booked, and the appointments no person was found for. */
    cameBack: {
        ahead: number;
        kept: number;
        missed: number;
        past: number;
        unmatched: number;
    };
    /** The price note of each is verbatim from Services (`from $45`), never parsed. */
    services: {
        id: string;
        name: string;
        note: string;
        /** Whether it is a cosmetic service, which TikTok shows to people 25 and over; the name says so where this is not set. */
        cosmetic?: boolean;
    }[];
    posts: {
        id: string;
        platform: "meta" | "tiktok";
        kind: "photo" | "video";
        label: string;
        day: string;
        caption: string;
    }[];
    /** The rating line: `4.9 on Google`; null where it cannot be read. */
    rating: {
        stars: string;
        reviews: number;
        asOf: string;
    } | null;
    /** Whether the receptionist is set to never quote prices. */
    neverQuotePrices: boolean;
    /** Before any ad: how new people first reached the business (People's first touch), or null. */
    firstTouch: {
        since: string;
        rows: {
            label: string;
            n: number;
            own: boolean;
        }[];
    } | null;
}
/** What the platforms return as choices and estimates; fixed per account, not per ad. */
interface AdsConfig {
    presets: {
        id: "try" | "steady" | "more";
        label: string;
        perDayMinor: number;
        days: number;
        /** The platform's estimate of chats over the run, or null where it returns none. */
        estimate: readonly [number, number] | null;
    }[];
    areas: {
        miles: number;
        /** The platform's estimate of people in the circle, or null where it returns none. */
        people: readonly [number, number] | null;
    }[];
    /** Google's estimate at a daily amount: clicks a month, and what a click usually costs (low, high). */
    googleEstimate: {
        clicks: readonly [number, number];
        perClickMinor: readonly [number, number];
    };
    /** What a platform reads as its floor per day, from the ad account; null where it says none. */
    minPerDayMinor: Record<AdPlatform, number | null>;
}
/** What Edit changes in one press of Save: only the fields it moved. */
interface AdPatch {
    serviceId?: string;
    area?: AdArea;
    endDay?: string;
    amountMinor?: number;
    copy?: AdCopy;
    /** A new photo was chosen (the sample has none to pick). */
    photo?: boolean;
}

/**
 * Every number the Ads page judges by and every rule a platform enforces, in one place (the platforms' docs, October 2026).
 * Page-only, like the models that read them: the Ads page imports them from `@chanlytics/contracts/ads-page`. A cost is
 * said only of REPORT_MIN_N or more booked (Reports' minimum, reports/report-tiles.ts), never a number of its own.
 *
 * The data the feature lanes read is here too: how an amount may change on each platform, whether "Only while you're open"
 * can be set, and which checks a door needs before Turn on. Nothing here is a word.
 */

/** The window the page counts: this many days, ending yesterday. */
declare const ADS_WINDOW_DAYS = 30;
/** The newest days that are still counting: drawn lighter. */
declare const ADS_FRESH_DAYS = 3;
/** Whether the last two weeks are still settling in what an ad has: a cost is `so far` until they are not. */
declare const ADS_SETTLE_DAYS = 14;
/** An `on` ad that started fewer days ago than this is read as too early to judge (never stored). */
declare const TOO_EARLY_DAYS = 7;
/** An ad has brought enough people to be worth extending: this many booked, or for a call ad this many calls Google counted. */
declare const ADS_ASK_MIN = 10;
declare const ADS_ASK_MIN_CALLS = 20;
/** The Ask line offers to extend an ad that ends within this many days. */
declare const ADS_ASK_SOON_DAYS = 3;
/** The most days an extension runs for. */
declare const ADS_EXTEND_MAX_DAYS = 30;
/** An ad has run long enough to compare its cost with another's. */
declare const ADS_MOVE_DAYS = 14;
/** What the Ask line moves between two ads, a day, in minor units. */
declare const ADS_MOVE_STEP_MINOR = 500;
/** The gap in cost between two ads that chance alone would not give: the z of a 95% interval. */
declare const ADS_CHANCE_Z = 1.96;
/** A custom daily amount runs this many days. */
declare const ADS_OWN_DAYS = 14;
/** The amount a custom daily amount starts at, in minor units, and the miles New ad opens on. */
declare const ADS_OWN_START_MINOR = 1000;
declare const ADS_DEFAULT_MILES = 5;
/** The totals an amount's list offers, as shares of the one now; a daily amount's, in minor units. */
declare const ADS_TOTAL_STEPS: readonly number[];
declare const ADS_DAILY_CHOICES_MINOR: readonly number[];
/** The end dates offered, in days from the one it has. */
declare const ADS_END_SHIFTS: readonly number[];
/** An area a special category (a job, a loan, a home) is limited to on Meta, in miles. */
declare const ADS_SPECIAL_MILES = 15;
/** TikTok's display name counts to this many characters. */
declare const ADS_DISPLAY_NAME_MAX = 20;
/** A ZIP code is this many digits (TikTok's area is a list of them). */
declare const ADS_ZIP_DIGITS = 5;
/** The soft limits Meta states for the words, shown only near the limit (`near` is the share of the limit): Meta's, not ours. */
declare const ADS_COPY_LIMITS: {
    readonly headlineFacebook: 27;
    readonly headlineInstagram: 40;
    readonly textInstagram: 125;
    readonly near: 0.8;
};
/** Per platform, how an amount may change. */
interface BudgetRule {
    /** The most an amount may change in one step, as a share of it; null where there is no such limit. */
    maxStep: number | null;
    /** Days to wait between two changes. */
    waitDays: number;
    /** The longest a total may run, in days; null where there is no such limit. */
    totalMaxDays: number | null;
    /** The platform spends a daily amount as an average: some days more, never above a week's worth. */
    dailyIsAverage: boolean;
    /** A change of amount starts the platform's learning again. */
    changeRelearns: boolean;
}
declare const BUDGET_RULES: Record<AdPlatform, BudgetRule>;
/** Whether "Only while you're open" can be set: Meta only with a total. */
declare const SCHEDULE_NEEDS_TOTAL: Record<AdPlatform, boolean>;
/** Which checks a door needs before Turn on (ids into AdCheckId), per platform, in the order they are listed. */
declare const DOOR_NEEDS: Record<AdDoor, Partial<Record<AdPlatform, AdCheckId[]>>>;
/** The checks the account's own standing lists (the dot rows of its popover and of an ad's reach line), in order. */
declare const STANDING_CHECKS: Record<AdPlatform, AdCheckId[]>;
/** The days before a post permission lapses that it turns amber. */
declare const ADS_PERMISSION_WARN_DAYS = 7;
/** What an ad needs that does not stop it: it keeps running (`on`) while the owner sees it. */
declare const ADS_SOFT_NEEDS: readonly AdNeedsCode[];
/** Whether Chanlytics can count an ad's people: a Google call is Google's count, not matched to anyone. */
declare const countedDoor: (door: AdDoor) => boolean;
/** The ledger offers a choice of how to group its ads (by what they ask, by platform) from this many ads. */
declare const ADS_GROUP_FROM = 7;

/** What a sum of nothing is said in, and what an account that has none yet is read in: the currency most accounts are in. */
declare const ADS_DEFAULT_CURRENCY = "USD";
/** `$14`, `$1,284`, `$5.50`: whole units from 10 (and for any whole number), cents under 10 where there are some. */
declare function moneyOf(minor: number, currency: string): string;
/** An amount with its unit: `$15 a day`. */
declare const perDayOf: (minor: number, currency: string) => string;
/** What is left of a total: `$308 left of $720`. */
declare const leftOfMoney: (left: number, total: number, currency: string) => string;
/** The currency's symbol on its own: `$`, `£`. */
declare function currencySymbol(currency: string): string;
/** A whole number of units, as the minor units an amount is held in. */
declare const minorOfUnits: (units: number) => number;
/** One amount in its currency. */
interface MoneyItem {
    minor: number;
    currency: string;
}
/** The sums of amounts, one for each currency in the order they first appear. Never converted. */
declare function sumsOf(items: readonly MoneyItem[]): MoneyItem[];
/** `$847`, or `$847 + £230` where the currencies differ: each currency's sum, side by side, never converted. */
declare function sumMoney(items: readonly MoneyItem[]): string;

/** `Sat 31 Oct`. */
declare function dayWord(iso: string): string;
/** `Sat 31 Oct` as two lines for a narrow column: the weekday, then the date. */
declare function dayLines(iso: string): string[];
/** `31 Oct`. */
declare function dayShort(iso: string): string;
/** Days as a person says them: `today`, `1 day`, `6 days`. */
declare const daysWord: (n: number) => string;
/** `1 person`, `26 people`. */
declare const peopleWord: (n: number) => string;
/** `All 96`. */
declare const allWord: (n: number) => string;
/** Two initials from `Jordan P.`: `JP`. */
declare function adPersonInitials(name: string): string;
/** Where the doors go: Settings › Connections, and Reports › People. */
declare const ADS_DOORS: {
    readonly accounts: "admin/integrations";
    readonly people: "reports/people";
};
/** A door that goes to Settings says so (it is not a platform's own page). */
declare const SETTINGS_DOOR = "Open Settings \u203A Connections";
/** A platform as the owner says it. "Meta" only where billing, an account or a review is meant (PLATFORM_OWNER). */
declare const PLATFORM_WORD: Record<AdPlatform, string>;
/** The company that checks, charges and reads: where billing, an account or a review is meant. */
declare const PLATFORM_OWNER: Record<AdPlatform, string>;
/** Where the platform's ad shows, in the sentence. */
declare const PLATFORM_SURFACE: Record<AdPlatform, string>;
/** How long a platform says a check takes. */
declare const REVIEW_WITHIN: Record<AdPlatform, string>;
/** The kit Icon names the doors are drawn with. */
type Glyph = "chat" | "phone" | "list";
interface DoorWords {
    /** The door's verb, as step 1 and the group head say it. */
    label: string;
    /** The one plain line under it. */
    line: string;
    /** Where it runs. */
    runsOn: string;
    glyph: Glyph;
    /** What the number under a door is of: `wrote`, `calls · Google's count`, `left a number`. */
    unit: string;
    /** The verb a person did: `wrote`, `called`, `left a number`. */
    did: string;
    /** The phone row's word for the door. */
    short: string;
    /** The word after "so they" in the sentence. */
    chip: string;
}
declare const DOOR: Record<AdDoor, DoorWords>;
/** Doors in the order the ledger and step 1 list them. */
declare const DOOR_ORDER: readonly AdDoor[];
/** A check's words, as a dot row says it: `Payment method in Meta`. */
declare function checkWords(id: AdCheckId, platform: AdPlatform): string;
/** What to do about a check that is not met, as a step: `Add a card in Google Ads`. */
declare const checkFix: (id: AdCheckId, platform: AdPlatform) => string;
/** What the reach line says last, by door: what the ad stands on, or when the last number arrived. */
declare const REACH_NOTE: {
    whatsapp: string;
    callChecking: string;
    callApproved: string;
    form: {
        meta: string;
        google: string;
        tiktok: string;
    };
    /** When the last person got in touch, said by its day (`9:02 AM today`, `Fri 9 Oct`): a number on a form, a message on WhatsApp. */
    lastNumber: (when: string) => string;
    lastMessage: (when: string) => string;
};
/** The states an ad shows: its own, and `too-early`, which the fold reads and never stores. */
declare const STATE_WORD: Record<AdState | "too-early", string>;
declare const STATE: {
    reviewSecond: (p: AdPlatform) => string;
    settingUpSecond: (p: AdPlatform) => string;
    couldntSecond: (p: AdPlatform) => string;
    /** When it ends: today, tomorrow (in the evening where the platform ends it at a time), or the day. */
    endsWhen: (o: {
        kind: "today" | "tomorrow" | "later";
        evening: boolean;
        day: string;
    }) => string;
    ends: (when: string) => string;
    daily: (perDayText: string) => string;
    endedSecond: (day: string, booked: number, each: string | null) => string;
    finishedSecond: (total: string) => string;
    needsPayment: (p: AdPlatform) => string;
    needsRejected: (p: AdPlatform) => string;
    needsDefault: (p: AdPlatform) => string;
    needsPaused: (p: AdPlatform) => string;
    needsPrice: string;
    needsPermission: (p: AdPlatform) => string;
};
/** What a role's refusal says the press would have done ("Your role can't turn on an ad"): the money presses are the owner's. */
declare const GATE: {
    turnOn: string;
    change: string;
    end: string;
    again: string;
    resume: string;
    pause: string;
};
/** Why a press was refused: the ad changed since it was drawn, is gone, or is not Chanlytics' to change. */
declare const REFUSED: {
    stale: string;
    gone: string;
    adopted: string;
    maximum: string;
};
declare const SENTENCE: {
    show: string;
    /** An ad that has ended reads in the past. */
    showed: string;
    soPast: {
        whatsapp: string;
        call: string;
        form: string;
    };
    on: string;
    /** What comes before the area chip. */
    reach: {
        meta: string;
        google: string;
        tiktok: string;
    };
    of: (street: string) => string;
    so: string;
    upTo: string;
    inAllUntil: string;
    about: string;
    untilStop: string;
    blank: string;
    /** Shown once, above the sentence, the first time it is opened. */
    tapHint: string;
};
/** The examples the demo store draws, in the order the Example menu lists them. */
declare const ADS_EXAMPLES: readonly ["running", "needs-you", "finished", "no-calendar", "setting-up", "no-ads", "choose", "v0", "reading", "failed"];
type AdsExample = (typeof ADS_EXAMPLES)[number];
declare const EXAMPLE: {
    /** The pill's word. */
    pill: string;
    note: string;
    label: string;
    choices: {
        running: string;
        "needs-you": string;
        finished: string;
        "no-calendar": string;
        "setting-up": string;
        "no-ads": string;
        choose: string;
        v0: string;
        reading: string;
        failed: string;
    };
};

declare const HEAD: {
    window: string;
    /** Under the head, desk and phone. */
    money: string;
    noAds: string;
    v0Strong: string;
    v0Rest: string;
    booked: (booked: number, of: number) => {
        strong: string;
        rest: string;
    };
    /** With no calendar link, the booked half waits. */
    touchOnly: (n: number) => {
        strong: string;
        rest: string;
    };
    read: (time: string) => string;
    v0Read: (since: string) => string;
    /** The pane line while an account is being read: `Reading Meta and Google…`. */
    reading: (list: string) => string;
    accounts: string;
    newAd: string;
    ask: string;
};
/** The line under the pane line when an account could not be read, and the press that reads it again. */
declare const ADS_READ: {
    failed: (owner: string, when: string | null) => string;
    again: string;
};
declare const STANDING: {
    connected: string;
    needsYou: string;
    off: string;
    /** An account that has to be chosen, and one whose access has lapsed. */
    choose: string;
    lapsed: string;
    account: (name: string, time: string) => string;
    reading: (name: string) => string;
    failed: (name: string, when: string) => string;
    charged: (p: AdPlatform) => string;
    door: string;
    /** The post permission turns amber 7 days before it lapses. */
    permission: (day: string) => string;
    /** An account that is connected but whose last read failed. */
    unread: string;
};
interface CountCtx {
    readAt: string;
    calendarRead: string;
    /** `an appointment`. */
    a: string;
    /** `appointment`. */
    one: string;
    /** `appointments`. */
    many: string;
}
/** The four figures' labels and definitions: the tooltip, and the sentences under "How this is counted". */
declare function figureWords(c: CountCtx): {
    spent: {
        label: string;
        def: string;
    };
    touch: {
        label: string;
        def: string;
    };
    booked: {
        label: string;
        def: string;
    };
    each: {
        label: string;
        def: string;
    };
};
declare const FIGURES: {
    /** After the cost, while the last two weeks settle. */
    soFar: string;
    spentMeta: (ads: number) => string;
    touchMeta: (wrote: number, left: number) => string;
    bookedMeta: (of: number) => string;
    eachMeta: (spent: string, n: number) => string;
    /** No calendar link: Booked waits, and the cost falls back to people in touch. */
    needsLink: string;
    eachInTouchLabel: string;
    eachInTouchMeta: (spent: string, n: number) => string;
    callsNotMatched: string;
    /** Under a dash of Spent or of the cost for each person while a platform is read: `reading Meta and Google`. */
    reading: (list: string) => string;
    /** Under Spent while a platform's last read failed: the sum holds its last numbers. */
    spentMetaStale: (ads: number, owner: string, when: string | null) => string;
    /** The door that mends a missing calendar link: the calendar is set under Settings › Business. */
    linkDoor: string;
};
/** The quiet line under the figures, and the door that opens the four definitions, the fee and the calls. */
declare const COUNTED: {
    quiet: (time: string) => string;
    door: string;
    title: string;
    fees: string;
    calls: string;
    /** How long what is counted here is kept (decision 0049). */
    kept: string;
    /** While a platform is read, the line under the figures says so. */
    reading: string;
    /** The door beside "How this is counted" that opens the Results sheet. */
    results: string;
};
declare const LEDGER: {
    heads: {
        ad: string;
        spent: string;
        touch: string;
        booked: string;
        each: string;
        state: string;
    };
    none: string;
    /** Why a review ad's numbers are dashes. */
    notStarted: string;
    notMatched: string;
    only: (n: number) => string;
    noneYet: string;
    tooFew: string;
    hint: (o: {
        lead: string;
        perDay: string;
        tail: string;
    }) => string;
    since: (day: string) => string;
    /** Under an ad that has not run yet and is not in review: when it would start. */
    starts: (day: string) => string;
    /** Under an ad the platform has: who it was sent to, and when (`today`, or the day). */
    sentTo: (owner: string, when: string) => string;
    each: (cost: string) => string;
    booked: (n: number) => string;
    calls: (n: number) => string;
    googleCount: string;
    waiting: (n: number) => string;
    /** Under the spend of an ad on a platform whose last read failed: the number is the last one read. */
    asOf: (when: string) => string;
    /** Why a number waits while its platform is read, and the short word under the dash. */
    reading: (owner: string) => string;
    readingUnit: string;
    /** An ad the owner made on the platform itself leads its hint with where. */
    madeIn: {
        meta: string;
        google: string;
        tiktok: string;
    };
};
/** How the ledger can be grouped, and the quiet line that offers it. */
declare const GROUP: {
    label: string;
    door: string;
    platform: string;
};
/** What a door's group says of itself: `1 ad · 96 new people wrote`. `people` is null while the numbers it counts are read. */
declare function groupMeta(o: {
    door: AdDoor;
    ads: number;
    people: number | null;
}): string;
/** What a platform's group says of itself: `2 ads · 96 new people in touch`; a Google group's people are calls. */
declare function platformMeta(o: {
    platform: AdPlatform;
    ads: number;
    people: number | null;
}): string;
declare const ASK: {
    not: string;
    /** The press on an ad that needs fixing opens it. */
    open: string;
    extendPress: (more: string) => string;
    extend: (o: {
        name: string;
        when: string;
        brought: string;
        end: string;
        owner: string;
        from: string;
        to: string;
    }) => string;
    extendShort: (name: string, when: string) => string;
    broughtPeople: (n: number) => string;
    broughtCalls: (n: number) => string;
    extendConfirm: (o: {
        name: string;
        end: string;
        perDay: string;
        owner: string;
        from: string;
        to: string;
        more: string;
    }) => string;
    extendToast: (name: string, end: string) => string;
    /** The ad's name, then what is wrong with it, said as the rest of a sentence (`ASK_WHY`). */
    fix: (name: string, why: string) => string;
    fixShort: (name: string, why: string) => string;
    movePress: (amount: string) => string;
    move: (o: {
        cheap: string;
        cheapEach: string;
        cheapN: number;
        dear: string;
        dearEach: string;
        dearN: number;
        amount: string;
        end: string;
        all: string;
    }) => string;
    /** `one` is the workspace's appointment word: `appointment`. */
    moveShort: (cheap: string, one: string) => string;
    moveConfirm: (o: {
        amount: string;
        dear: string;
        cheap: string;
        end: string;
    }) => string;
    moveToast: (cheap: string, amount: string) => string;
};
/** What is wrong with an ad that needs the owner, as the rest of the fix proposal's sentence: `was turned down by Meta`. */
declare const askWhy: (code: AdNeedsCode | null, owner: string) => string;
declare const TILES: {
    waiting: {
        title: string;
        empty: string;
        line: (o: {
            ad: string;
            what: string;
            note: string | null;
        }) => string;
        wrote: (day: string) => string;
        number: (day: string) => string;
        callNote: string;
        /** Where a row goes: their conversation where there is one, else their page. */
        toThread: string;
        toPerson: string;
    };
    coming: {
        title: string;
        endsEvening: string;
        ends: string;
        today: string;
        /** What is left of an ad's total waits while its platform is read. */
        reading: (owner: string) => string;
        totalReading: string;
        /** The total across ads that stop at a platform total. */
        total: (o: {
            sum: string;
            ads: number;
        }) => string;
        plus: (daily: string) => string;
    };
    cameBack: {
        title: string;
        window: string;
        /** The headline is this word and the number it counts, which stands large. */
        headline: string;
        ahead: string;
        kept: string;
        missed: string;
        past: string;
        marked: string;
        nudge: (one: string) => string;
        unmatched: (n: number, many: string) => string;
        line: (o: {
            ahead: number;
            kept: number;
            missed: number;
            past: number;
        }) => string;
    };
};
declare const PHONE: {
    line1: (spent: string, each: string | null) => string;
    line1NoCalendar: (touch: number, spent: string) => string;
    /** While a platform is read, the muted line says what waits instead of a spend it does not know. */
    line1Reading: (touch: number, list: string) => string;
    footnote: string;
    row: (platform: string, door: string) => string;
    /** The ad's line, with where its numbers were last read when the platform could not be read. */
    rowAsOf: (platform: string, door: string, when: string) => string;
    /** The people waiting on the owner, said by name: two, then how many more. */
    names: (names: readonly string[]) => string;
    /** The door to the Results sheet, which the phone has no figures strip to carry. */
    results: string;
};
declare const V0: {
    lead: (ad: number, of: number) => {
        strong: string;
        rest: string;
    };
    more: (n: number) => string;
    emptyLead: string;
    emptyLine: string;
    notes: string[];
    door: string;
    platforms: {
        meta: string;
        google: string;
        tiktok: string;
    };
    next: string;
};
declare const NO_ADS: {
    title: string;
    /** `Message you on WhatsApp · about $10 a day for 7 days · up to $70`. */
    line: (o: {
        door: string;
        perDay: string;
        days: number;
        total: string;
    }) => string;
    press: string;
    /** What stops the first ad, said as a step. The press waits for it. */
    needs: (fix: string) => string;
    connect: (owner: string) => string;
    lapsed: (owner: string) => string;
};
/** An account that has to be chosen: the card that lists the choices, each with its currency. */
declare const CHOOSE: {
    title: (owner: string) => string;
    line: string;
    choice: (name: string, currency: string) => string;
    use: string;
    done: (name: string) => string;
    /** The account was taken off the list (or never was) between the card being drawn and the press. */
    gone: string;
};

/** The lists a tapped word opens. */
declare const LIST: {
    /** What a chip is, to a screen reader: "The area: 5 miles". */
    chip: {
        offer: string;
        area: string;
        amount: string;
        end: string;
        door: string;
        platform: string;
    };
    chipSaid: (what: string, value: string) => string;
    /** A dashed blank, to a screen reader. */
    blank: string;
    amountDaily: string;
    inAll: (total: string) => string;
    /** The unit beside the box of "Your own amount": a daily amount, or a total. */
    unitDaily: string;
    unitTotal: string;
    /** A daily amount, said as the platform spends it: an average where it spends one (`about $15 a day, an average`). */
    dailyRow: (perDay: string, average: boolean) => string;
    raiseDaily: (perDay: string, average: boolean) => string;
    moreSpent: (more: string) => string;
    /** What a daily amount that moves does to a day (`about $10 a day more`): no most, so it says about. */
    dailyMore: (perDay: string) => string;
    dailyMoreHead: (perDay: string) => string;
    dailyLess: (perDay: string) => string;
    /** What a choice does to a day, over the days left to the end. */
    perDayLeft: (perDay: string) => string;
    asItIs: (perDay: string) => string;
    endsSooner: (perDay: string) => string;
    endsLater: (perDay: string) => string;
    /** A raise's two facts on a line: the most it can spend, and what a day becomes. */
    raiseSub: (o: {
        more: string;
        perDay: string;
    }) => string;
    pickDay: string;
    pickDayLabel: string;
    set: string;
};
/** What each tapped word says it changes. */
declare const CHIPS: {
    offer: (p: AdPlatform) => string;
    areaMiles: string;
    areaPeople: (lo: number, hi: number) => string;
    areaSmall: string;
    areaMeta: string;
    areaGoogle: string;
    areaTiktok: string;
    amountTitle: string;
    own: string;
    /** What a platform needs a day (`floor`, already said), or for Google's total how long it may run. */
    floor: (p: AdPlatform, floor: string | null, totalMaxDays: number | null) => string;
    belowSpent: (spent: string) => string;
    stops: (p: AdPlatform) => string;
    noRestart: string;
    dailyOver: string;
    dailyOverGoogle: string;
    /** A change of TikTok's amount: at most this share, and not within this many days of the last. */
    tiktokChange: (maxStep: number, waitDays: number) => string;
    /** Why TikTok will not take an amount: too far from the one now, or too soon after the last change. */
    tiktokStepOut: (maxStep: number) => string;
    tiktokWait: (day: string) => string;
    tiktokRange: (o: {
        lo: string;
        hi: string;
        maxStep: number;
    }) => string;
    endTitle: string;
    endLater: string;
    endGoogle: (day: string, at: string) => string;
    /** Google's total budgets run this many days at most: the date list stops at the last day. */
    googleLastDay: (o: {
        days: number;
        day: string;
    }) => string;
    /** A raise of spend is the only press that names its maximum; lowering, pausing and renaming are free. */
    raise: (total: string) => string;
    lockedWhy: string;
    formNew: string;
    googleWait: string;
};
/** TikTok's area: ZIP codes, as chips that come out and a box that takes one more. */
declare const ZIPS: {
    title: string;
    add: string;
    addPress: string;
    placeholder: (digits: number) => string;
    remove: (zip: string) => string;
    bad: (digits: number) => string;
    already: (zip: string) => string;
    none: string;
    save: string;
    /** What the list says it holds, to a screen reader. */
    held: (n: number) => string;
};
/** The Edit block: the photo and the words, which a sentence's chips do not hold. */
declare const EDIT: {
    title: string;
    photo: string;
    changePhoto: string;
    photoNew: string;
    headlineN: (n: number) => string;
    descriptionN: (n: number) => string;
    noChanges: string;
    /** How the chat starts, fixed on a running ad: `How the chat starts: They send a message you wrote for them`. */
    chatNow: (what: string, now: string) => string;
    /** The foot's line while the changes are being made. */
    tapHint: string;
};
/** The toasts a press says, each with Undo where it can be undone. */
declare const CHANGED: {
    ends: (name: string, day: string) => string;
    total: (name: string, total: string) => string;
    daily: (name: string, amount: string) => string;
    area: (name: string, area: string, owner: string) => string;
    renamed: (name: string) => string;
    saved: (name: string) => string;
    savedChecking: (o: {
        name: string;
        owner: string;
        within: string;
    }) => string;
    updated: (o: {
        name: string;
        owner: string;
        within: string;
    }) => string;
    /** A second look is asked of the platform; the ad stays as it is until it answers. */
    asked: (o: {
        owner: string;
        within: string;
    }) => string;
    retrying: (owner: string) => string;
    removing: (owner: string) => string;
    pausedTotal: (name: string, day: string) => string;
};
declare const NO_AD: {
    title: string;
    body: string;
};
declare const PEOPLE_TAB: {
    everyone: string;
    none: string;
};
/** The preview and the reach line. */
declare const SHOWN: {
    frameLabel: string;
    photo: string;
    video: string;
    adWord: string;
    consentBox: string;
    formRows: string;
    reach: string;
};
/** A reach line: its first word is the state, in the ink; the rest is the reasons, dim. */
interface ReachSaid {
    state: string;
    parts: string[];
}
declare const DRAWER: {
    /** The kicker: `Facebook and Instagram · Message you on WhatsApp`. */
    kicker: (platform: string, door: string) => string;
    next: {
        runs: (o: {
            day: string;
            left: string;
            perDay: string | null;
        }) => string;
        runsDaily: (perDayText: string) => string;
        review: (o: {
            from: string;
            to: string;
            total: string;
            perDay: string;
        }) => string;
        reviewDaily: (o: {
            from: string;
            perDay: string;
        }) => string;
        paused: (o: {
            day: string;
            left: string;
        }) => string;
        pausedDaily: (perDayText: string) => string;
        ended: (o: {
            day: string;
            spent: string;
        }) => string;
        finished: (total: string) => string;
    };
    reach: {
        running: (o: {
            owner: string;
            day: string;
            note: string;
        }) => ReachSaid;
        review: (o: {
            owner: string;
            when: string;
            note: string;
        }) => ReachSaid;
        /** When it was sent: `today 9:02 AM` on the day, else the day. */
        sentWhen: (o: {
            today: boolean;
            day: string;
            time: string;
        }) => string;
        paused: (note: string) => ReachSaid;
        needs: (first: string) => ReachSaid;
        ended: (day: string) => ReachSaid;
        read: (time: string) => string;
    };
    results: {
        header: string;
        /** The door to this ad's numbers in Reports. */
        report: string;
        wrote: string;
        calls: string;
        leftNumber: string;
        defWrote: string;
        defCalls: string;
        defNumber: string;
        countWrote: (wrote: number, booked: number) => string;
        countCalls: (calls: number) => string;
        countNumber: (n: number, booked: number) => string;
        perPerson: (spent: string, n: number) => string;
        /** A counted zero is said in words. */
        zero: (o: {
            inTouch: number;
            did: string;
            spent: string;
        }) => string;
        quietStart: (spent: string) => string;
        /** Its first words are the word that opens what each platform says about it (`many` is the appointment word, plural). */
        tooEarly: (many: string) => {
            word: string;
            rest: string;
        };
        tooEarlySheet: {
            meta: string;
            tiktok: string;
            google: string;
        };
        soFarToday: (time: string) => string;
    };
    bars: {
        legend: (did: string) => string;
        legendCalls: string;
        aria: (o: {
            n: number;
            did: string;
            days: number;
            booked: number;
        }) => string;
        ariaCalls: (o: {
            n: number;
            days: number;
        }) => string;
        ariaNone: string;
    };
    quiet: {
        reply: (median: string, n: number) => string;
        provenance: (owner: string) => string;
        provenanceCalls: string;
        /** The platform's own numbers, one press away: a list by name, each "not read yet" where the platform returned none. */
        theirsDoor: (owner: string) => string;
        theirsNote: (owner: string) => string;
        notRead: string;
        theirs: {
            saw: string;
            reached: string;
            impressions: string;
            taps: string;
            clicks: string;
            chats: string;
            numbers: string;
            calls: string;
            longCalls: string;
        };
        googleExtra: string;
        /** What people searched on Google, as it groups them, and the searches left out for the owner. */
        typedDoor: string;
        typedNote: string;
        leftOut: {
            title: string;
            note: string;
        };
    };
    people: {
        title: string;
        booked: string;
        notYet: string;
        /** The door to everyone it brought: People cannot be cut by ad yet, so it says where it goes. */
        all: (n: number) => string;
        wrote: (day: string) => string;
        wroteToday: (time: string) => string;
        number: (day: string) => string;
        waiting: (days: string) => string;
        callNumber: string;
        talking: string;
        quietSince: (day: string) => string;
        nothing: string;
        ahead: (day: string, time: string) => string;
        kept: (day: string) => string;
        missed: (day: string) => string;
        past: (day: string) => string;
        marked: string;
        notMarked: string;
        emptyCalls: string;
        emptyReview: string;
        emptyQuiet: string;
        /** Where a row goes, said in its tip: the person's page, or the conversation that waits on the owner. */
        tipPerson: (name: string) => string;
        tipConversation: (name: string) => string;
    };
    foot: {
        pause: string;
        resume: string;
        edit: string;
        again: string;
        cancel: string;
        save: string;
        /** The one press that raises what can be spent names its most. */
        saveRaise: (total: string) => string;
        saveRaiseDaily: (perDay: string) => string;
        paused: (name: string, day: string) => string;
        pausedDaily: (name: string) => string;
        resumed: (name: string) => string;
        /** The edit foot: what the changes do. */
        changes: (o: {
            n: number;
            restarts: boolean;
            owner: string;
            within: string;
        }) => string;
    };
    menu: {
        label: string;
        ask: string;
        copy: string;
        end: string;
        endConfirm: (name: string) => string;
        endPress: string;
        keep: string;
        ended: (name: string) => string;
        copied: (name: string) => string;
    };
    /** The questions a callout's press asks first, in the foot. */
    confirm: {
        update: (o: {
            owner: string;
            within: string;
        }) => string;
        updateYes: string;
        updateNo: string;
        remove: (owner: string) => string;
        removeYes: string;
        removeNo: string;
    };
    /** An ad the owner made on the platform itself: Chanlytics can pause and resume it, and nothing else. */
    adopted: (p: AdPlatform) => string;
    callout: {
        review: (p: AdPlatform) => string;
        /** An ad sent back for checking after a change: its results stay where they are. */
        recheck: (o: {
            owner: string;
            within: string;
        }) => string;
        settingUp: (p: AdPlatform) => string;
        couldntFinish: (p: AdPlatform) => string;
        couldntExits: {
            retry: string;
            remove: string;
        };
        pausedInPlatform: (p: AdPlatform) => string;
        resume: string;
        /** The price the ad says and the one Services says now; either may be missing from what was read. */
        priceChanged: (o: {
            was: string | null;
            now: string | null;
        }) => string;
        updateAd: string;
        /** The platform's own words, verbatim, in quotes. */
        rejected: (o: {
            owner: string;
            why: string;
        }) => string;
        rejectedExits: {
            fix: string;
            again: (owner: string) => string;
            fresh: string;
        };
        /** The line is the platform's own payment step: `Add a card in Google Ads`. */
        payment: (p: AdPlatform) => string;
        lapsing: (day: string | null) => string;
        renew: string;
        /** After a press, until the platform answers: the press says what it did and cannot be pressed again. */
        done: {
            again: (owner: string) => string;
            retry: string;
            remove: string;
        };
        ended: (day: string) => string;
        settling: (days: number) => string;
        settled: (days: number) => string;
        finished: (o: {
            name: string;
            total: string;
        }) => string;
        finishedBooked: (booked: number) => string;
        finishedCalls: (calls: number) => string;
        quiet: string;
    };
    edit: {
        pen: string;
        namePlaceholder: string;
    };
};
declare const PREVIEW: {
    fold: string;
    frames: readonly ["Feed", "Story", "Reel"];
    /** The capsule under the ad, in the platform's wording where it can differ by locale. */
    cta: {
        whatsapp: string;
        call: string;
        form: string;
    };
    tap: string;
    call: string;
    form: string;
    drawn: (owner: string) => string;
    receptionistWrites: string;
    replyLabel: string;
    googleCaption: (line: string) => string;
    answers: (business: string) => string;
    formFilled: string;
    formName: string;
    formPhone: string;
    consentTitle: string;
    consent: (business: string) => string;
    privacy: (site: string) => string;
    formNotice: string;
    layout: string;
    /** Drawn by the drawer and New ad's thank-you switch (owed). */
    thanksOn: string;
    thanksOff: string;
    neverQuote: string;
    excerpt: (text: string, cta: string) => string;
};

declare const NEW_AD: {
    kicker: string;
    stepOf: (n: number) => string;
    stepLabel: (n: number) => string;
    review: string;
    reviewTitle: string;
    /** The ad's name, to a screen reader. */
    nameLabel: string;
    zip: string;
    miles: (n: number) => string;
    endsAtGoogle: string;
    /** The name, drafted once the offer is chosen: `First appointment · 12 Oct`. */
    name: (offer: string, day: string) => string;
    /** The phone's sentence is clamped to two lines; this opens it. */
    sentenceMore: string;
    sentenceLess: string;
    steps: readonly ["What should people do?", "The ad", "Where and who", "Budget", "Review"];
    back: string;
    cancel: string;
    next: readonly ["Next: the ad", "Next: where and who", "Next: budget", "Next: review"];
    say: string;
    sayFirst: string;
    turnOnTotal: (total: string) => string;
    turnOnDaily: (perDayText: string) => string;
    /** After the press: the toast, and what Undo does. */
    turnOnToast: (o: {
        owner: string;
        within: string;
    }) => string;
    undone: string;
    /** What stops Turn on, said as a step; the door is Settings › Connections. */
    blocked: {
        need: (fix: string) => string;
        notConnected: (owner: string) => string;
        choose: (owner: string) => string;
        lapsed: (owner: string) => string;
    };
    needs: string;
    /** New ad opened from an ad: the name it opens with says so. */
    from: {
        copy: (name: string) => string;
        again: (name: string) => string;
        google: (name: string) => string;
    };
    /** A member who is not the owner can draft an ad; the owner turns it on. */
    askOwner: string;
    askOwnerSent: string;
    /** Google: the page the ad opens. */
    opens: {
        label: string;
        group: string;
        page: string;
        site: string;
        pageNote: string;
        siteNote: string;
        numberOnPage: string;
        hostedNote: string;
        /** The display path under the headline: the page's address, then where on it. */
        path: (host: string) => string;
    };
    step1: {
        formNote: string;
    };
    step2: {
        about: string;
        aboutLabel: string;
        aboutCaption: string;
        quoted: string;
        photo: string;
        postsLabel: {
            meta: string;
            tiktok: string;
        };
        addPhoto: string;
        addVideo: string;
        photoHint: string;
        postUse: string;
        asIs: string;
        newWords: string;
        words: string;
        headline: string;
        text: string;
        limit: (n: number, max: number, where: string) => string;
        /** The names the limit lines use for where Meta shows the words. */
        where: {
            facebook: string;
            instagram: string;
        };
        chat: string;
        chatReady: string;
        chatQuestions: string;
        chatLocked: string;
        chatShort: string;
        adjust: string;
        adjustWhat: string;
        adjustOff: string;
        frameLabel: string;
        headlines: string;
        descriptions: string;
        googleFold: string;
        googleShown: string;
        /** The other wordings Google tries, so the fold's "10 headlines and 3 descriptions" are all there. */
        googleMore: (o: {
            offer: string;
            business: string;
            price: string;
        }) => {
            headlines: string[];
            descriptions: string[];
        };
        count: (n: number, max: number) => string;
        video: string;
        /** A TikTok post used as an ad: its music has to be cleared for ads. */
        sound: string;
        newWordsVideo: string;
        formFields: string;
        formFilled: string;
        askService: string;
        askServiceHint: string;
        doubleCheck: string;
        privacyLink: string;
        privacyHint: string;
        privacyPlaceholder: string;
        privacyNeeded: string;
        completion: string;
        completions: readonly ["We'll message you on WhatsApp", "Call us", "Nothing more"];
        consentOn: string;
        consentCounsel: string;
        /** The thank-you line a form ends on: whether it promises a message within minutes. */
        thanks: string;
        thanksHint: (said: string) => string;
        thanksOnNote: string;
        /** Who the ad is shown as: read from the connection, changed in Settings. */
        shownAs: {
            label: string;
            line: (name: string, handle: string | null) => string;
            limit: (max: number) => string;
            door: string;
        };
        /** Meta: a photo or a vertical video. */
        media: {
            label: string;
            photo: string;
            video: string;
            videoNote: string;
            postsVideo: string;
        };
        /** Google: what people search, grouped by Google. */
        search: {
            label: string;
            note: string;
            leftOut: (list: readonly string[]) => string;
        };
    };
    step3: {
        runsOn: string;
        platformLabel: string;
        alsoGoogle: string;
        placementsMeta: string;
        placementsOff: string;
        placementsTiktok: string;
        placementsGoogle: string;
        area: string;
        areaGoogle: string;
        areaTiktok: (zip: string) => string;
        areaPicker: string;
        of: string;
        regulars: string;
        /** Drawn by New ad's area step (owed). */
        googleSmall: string;
        special: string;
        no: string;
        yes: string;
        yesNote: string;
        /** Drawn by New ad's area step (owed): the age lock a special category brings. */
        ages: string;
        agesWhy: string;
        agesLabel: string;
        ageLine: (floor: number) => string;
        agesWhyDefault: (owner: string) => string;
        agesWhyCosmetic: string;
        alsoGoogleNote: string;
        /** What the platform looks for, by door. */
        who: (platform: AdPlatform, door: AdDoor) => string;
    };
    step4: {
        mode: readonly ["For a set number of days", "Until I stop it"];
        modeLabel: string;
        presetsLabel: string;
        /** `Steady · about $15 a day for 20 days · up to $300 · ends Sat 31 Oct`: the label, then the rest. */
        preset: (o: {
            perDay: string;
            days: number;
            total: string;
            end: string;
        }) => string;
        presetDaily: (o: {
            perDay: string;
        }) => string;
        own: string;
        ownLabel: string;
        /** The unit beside the box: the currency's symbol, then a day. */
        ownUnit: (symbol: string) => string;
        ownNeeds: string;
        fees: string;
        dailyAbout: (perDayText: string) => string;
        estimate: (o: {
            lo: number;
            hi: number;
            days: number;
        }) => string;
        noEstimate: string;
        googleEstimate: (o: {
            clicks: readonly [number, number];
            from: string;
            to: string;
        }) => string;
        history: (each: string, people: number) => string;
        more: string;
        /** Only while the business is open: the switch, and why it is off or not a switch. */
        openOnly: (hours: string) => string;
        openOnlyOn: string;
        openOnlyOff: string;
        openOnlyMeta: string;
        openOnlyGoogle: string;
        /** What each platform says about changing the amount once the ad is on. */
        tiktokChange: (maxStep: number, waitDays: number) => string;
        googleAverage: (o: {
            day: number;
            month: number;
        }) => string;
        relearn: string;
    };
    step5: {
        kicker: (door: string) => string;
        readyLabel: string;
        ready: (parts: string) => string;
        /**
         * What the account stands on, in the words of each platform. The number on the page an ad opens is the ad's own check
         * (it follows "The ad opens", in Checked before turning on), never the account's.
         */
        readyParts: {
            meta: string[];
            google: string[];
            tiktok: string[];
        };
        forecast: (o: {
            owner: string;
            within: string;
            perDay: string;
            total: string;
            end: string;
        }) => string;
        forecastDaily: (o: {
            owner: string;
            within: string;
            perDay: string;
        }) => string;
        checked: string;
        quiet: (owner: string) => string;
        quietCalls: string;
        fix: string;
        noCalendar: string;
        /** "Checked before turning on" counts what is ready: `7 of 7 ready`. */
        count: (met: number, of: number) => string;
        setFor: string;
        /** What each door's result is called in the lowest-cost line. */
        result: {
            whatsapp: string;
            call: string;
            form: string;
        };
    };
};
/** A fourth door, quiet and not pressable, last in step 1. */
declare const BOOK_ONLINE = "Book online comes later. Chanlytics can't see inside your booking tool, so it couldn't count who booked.";
/** The rows of "Checked before turning on", in owner words. */
declare const CHECKS: {
    words: string;
    promises: string;
    price: string;
    priceQuote: string;
    rating: (line: string) => string;
    post: string;
    special: string;
    privacy: string;
    yes: string;
    noHealth: string;
    businessName: string;
    /** The words fit the platform's limits, or which one does not. */
    fits: string;
    headlineLong: (o: {
        n: number;
        max: number;
        where: string;
    }) => string;
    textLong: (o: {
        n: number;
        max: number;
        where: string;
    }) => string;
    googleLong: (o: {
        n: number;
        max: number;
        what: string;
    }) => string;
    /** The ad says a price that Services does not. */
    priceDiffers: (o: {
        said: string;
        note: string;
    }) => string;
    /** A platform account that is not ready, as a row: it stops Turn on until it is. */
    account: {
        "not-connected": (owner: string) => string;
        choose: (owner: string) => string;
        lapsed: (owner: string) => string;
    };
};
/** `4.9 on Google · 128 reviews · as of 11 Oct`. */
declare const ratingLine: (o: {
    stars: string;
    reviews: number;
    day: string;
}) => string;

type Tone = "accent" | "warn" | "info" | "ok" | "danger" | "plain";

declare const CONNECT: {
    title: string;
    /** The card's second line while the page draws the Ads fixtures. */
    sub: string;
    off: string;
    connect: string;
    disconnect: string;
    change: string;
    use: string;
    cancel: string;
    /** Not connected: what connecting does, and who bills. */
    line: (p: AdPlatform) => string;
    /** The press of Connect in the demo: it says nothing was connected. */
    signIn: (p: AdPlatform) => string;
    /** `USD · New York time · set by the account`: the account's own, which Chanlytics follows and cannot change. */
    facts: (currency: string, zone: string) => string;
    read: (time: string) => string;
    reading: string;
    readFailed: (when: string) => string;
    ready: string;
    allReady: string;
    needYou: (n: number) => string;
    managerOk: string;
    managerNot: string;
    /** TikTok's post permission, a day it runs until. */
    permission: (day: string) => string;
    /** Ads the owner made on the platform itself, shown in Ads and read-only there (decision 7). */
    adopted: (p: AdPlatform, n: number) => string;
    /** Disconnect while an ad runs is refused (decision 8). */
    refused: (n: number) => string;
    refusedDoor: string;
    refusedOk: string;
    disconnectQ: (p: AdPlatform) => string;
    disconnectDetail: string;
    disconnectYes: string;
    disconnectNo: string;
    disconnected: (p: AdPlatform) => string;
    /** The choice of an account: its question, and the toast of choosing one. */
    which: (p: AdPlatform) => string;
    using: (p: AdPlatform, name: string) => string;
    /** Decision 9: the owner's setting that pauses ads, off unless chosen. */
    pause: {
        label: string;
        line: string;
        on: string;
        off: string;
    };
    /** What a role that may not press says it would have done. */
    gate: {
        connect: string;
        change: string;
        disconnect: string;
        pause: string;
    };
};
/** One thing an account stands on: in order (a green dot), or not (an amber ring, with the step that mends it). */
interface ReadyRowVM {
    id: AdCheckId;
    text: string;
    tone: "ok" | "warn";
    fix: string | null;
}
/** One account to choose among: its id, its name, and its currency (the platform's, never converted). */
interface ConnectChoiceVM {
    value: string;
    label: string;
    hint: string;
}
/** One platform's row. */
interface ConnectRowVM {
    id: AdPlatform;
    /** `Facebook and Instagram`. */
    title: string;
    /** The account's name on the platform, where one is chosen. */
    detail: string | null;
    icon: string;
    status: AdAccountStatus;
    tone: Tone;
    stateWords: string;
    /** `USD · New York time · set by the account`; null where no account is chosen. */
    facts: string | null;
    /** `Read 9:19 AM`, or how the read stands. */
    read: string | null;
    ready: ReadyRowVM[];
    /** The fold's mark: `2 need you`, or `all in order`. */
    readyMark: string;
    /** Not connected: what connecting does. */
    line: string | null;
    /** Ads made on the platform itself and shown here read-only. */
    adopted: string | null;
    /** The accounts there are to choose from, and the one in use. */
    choices: ConnectChoiceVM[];
    chosen: string | null;
    /** Ads that are on, in review or being set up on this platform: Disconnect is refused while there are any. */
    running: number;
}
/** The three platforms' rows, in the Ads page's order, over the accounts and ads a reader returned. */
declare function connectModel(input: {
    accounts: readonly AdAccountRead[];
    ads: readonly AdRead[];
    today: string;
}): ConnectRowVM[];

/** A tone for a dot or a line: green only for `ok`, amber only for `warn` (Needs you), red only for a failed account. */
type AdTone = "ok" | "warn" | "plain" | "fail";
/** A ledger number, the short unit line under it where the unit is not obvious, and the reason it is a dash. */
interface CellVM {
    value: string;
    unit: string | null;
    why: string | null;
}
/** A state as the ledger and the drawer say it: a dot, one word, a dim second line. */
interface StateVM {
    word: string;
    tone: AdTone;
    second: string | null;
}
/** One of the figures (kit Figure's props, field for field). */
interface FigureVM {
    id: "spent" | "touch" | "booked" | "each";
    label: string;
    value: string;
    /** Beside the number in plain ink: `so far`. */
    change: string | null;
    meta: string | null;
    definition: string;
    n: number | null;
    minN: number;
}
/** A door: the words, and where it goes. */
interface DoorVM {
    words: string;
    to: string;
}
/** One dot row of what a platform, or a door, stands on. */
interface StandRowVM {
    text: string;
    tone: "ok" | "warn";
    door: DoorVM | null;
    /** A dim line after the words, where one helps (New ad: who puts the number on the page the ad opens). */
    note?: string | null;
    /** What to do about a row that is not met, said as a step (`Add a payment method in Meta`). */
    fix?: string | null;
}
/** A platform's standing: a word and a 7px dot (filled ok, amber ring warn, hollow ring off), and its rows. */
interface StandingVM {
    id: AdPlatform;
    name: string;
    state: "ok" | "warn" | "off";
    word: string;
    /** `Harbor Studio ad account · read 9:19 AM`; null where nothing is connected. */
    account: string | null;
    rows: StandRowVM[];
    /** `Charged to your card by Meta. Chanlytics never holds your ad money.` */
    note: string;
    door: DoorVM;
}
/** A word of the sentence that can be tapped; `blank` is a dashed blank in New ad's unfinished sentence. */
type ChipId = "offer" | "area" | "amount" | "end" | "door" | "platform";
type SentencePart = {
    text: string;
} | {
    chip: string;
    id: ChipId;
    value: string;
    blank: boolean;
};
/** What a sentence is made of. A null leaves its clause out (New ad's sentence grows a step at a time). */
interface SentenceInput {
    /** Null is the dashed blank. */
    offer: string | null;
    platform: AdPlatform | null;
    door: AdDoor;
    /** The area chip's word: `5 miles`, `these ZIP codes`. */
    area: string | null;
    /** The street Google's sentence names: `Harbor St`. */
    street: string;
    budget: AdBudget | null;
    /** The currency the amount is in. */
    currency: string;
    /** The end day of a total; null with a daily amount. */
    endDay: string | null;
    /** New ad: the platform and the door are words that open their step. A running ad's are plain text. */
    chips: "new" | "running";
    /** An ad that has ended reads in the past: `Showed … so they messaged you on WhatsApp, up to $720 in all until …`. */
    past?: boolean;
}
declare const DASH: string;
declare const PLATFORMS: readonly AdPlatform[];
declare const sum: (xs: readonly number[]) => number;
/** The account of a platform, if the workspace has one. */
declare const adAccountOf: (read: AdsRead, platform: AdPlatform) => AdAccountRead | undefined;
/** Whether a platform's account is connected and chosen. */
declare const isConnected: (read: AdsRead, platform: AdPlatform) => boolean;
/** Whether a check of an account is met. A check the account does not list is not met. */
declare const checkOk: (acct: AdAccountRead | undefined, id: AdCheckId) => boolean;
/** Whether Chanlytics can count an ad's people: a Google ad's calls are Google's count, not matched to anyone. */
declare const counted: (ad: AdRead) => boolean;
/** Whether the platform has approved an ad at least once: until then nothing is spent and nothing is counted. */
declare const started: (ad: AdRead) => boolean;
/** The state an ad is read as: its own, or `too-early` where it is on and started fewer than a week ago. */
declare function viewState(ad: AdRead, today: string): AdRead["state"] | "too-early";
/** `9:19 AM`, by the workspace's clock, from an ISO timestamp; empty for text that is no time. */
declare function timeOf(iso: string, timezone: string): string;
/** The workspace's day of an ISO timestamp: `2026-10-11`; empty for text that is no time. */
declare function dayOfIso(iso: string, timezone: string): string;
/** When the page was read, as the pane line says it: `9:19 AM`. */
declare const readTime: (read: AdsRead) => string;
/** A person as the page names them: the name, and the initials of their face. */
declare const adPersonWho: (name: string) => {
    name: string;
    initials: string;
};
/** The Service an ad is about, by id. */
declare const adServiceOf: (read: AdsRead, id: string) => AdsRead["services"][number] | undefined;
/** `5 miles`, `these ZIP codes`: the word the area is in the sentence and the lists. */
declare const areaWord: (area: AdArea) => string;
/** The platforms a door runs on: WhatsApp on Meta, calls on Google, a form on Meta or TikTok. */
declare const platformsFor: (door: AdDoor) => readonly AdPlatform[];
/** The platform and where it shows, as a ledger's hint leads with: `Facebook and Instagram · a form`. */
declare function leadOf(o: {
    platform: AdPlatform;
    door: AdDoor;
    area: AdArea;
}): string;
declare const totalOf: (ad: AdRead) => number | null;
/** The cost for each person who booked, in minor units: from REPORT_MIN_N booked, else none. */
declare const costEach: (spentMinor: number, booked: number) => number | null;
/** One ad's numbers over the window, and what it has spent in all. */
interface Totals {
    spentMinor: number;
    inTouch: number;
    booked: number;
    days: number;
    lifetimeMinor: number;
}
declare function totalsOf(ad: AdRead, read: AdsRead): Totals;
declare const leftOfAd: (ad: AdRead, t: Totals) => number | null;
/** Whether the last two weeks are still settling in what these ads have: a cost is `so far` until they are not. */
declare const settling: (ads: readonly AdRead[], today: string) => boolean;
declare const endsWhenOf: (ad: AdRead, today: string) => string;
/** The dim line of an ad that needs the owner: what it is. */
declare function needsSecond(ad: AdRead): string;
declare function adStateOf(ad: AdRead, t: Totals, read: AdsRead): StateVM;
declare function countCtx(read: AdsRead): CountCtx;
/** What one platform stands on (its dot rows), as the standing popover and an ad's reach line draw them. */
declare function accountRows(read: AdsRead, platform: AdPlatform): StandRowVM[];
/** What the ad itself changes about what its door needs: where a Google ad opens, and whether TikTok's is made from a post. */
interface NeedsChoice {
    /** Google: the page the ad opens. Chanlytics puts the number on its own page; on the owner's site it must already be there. */
    opens?: "page" | "site";
    /** TikTok: whether the ad is made from a post, which needs the post permission (left out, the account's own row stands). */
    post?: boolean;
}
/** What a door needs on a platform, as dot rows: an amber one has the door that mends it. */
declare function doorNeeds(read: AdsRead, door: AdDoor, platform: AdPlatform, choice?: NeedsChoice): StandRowVM[];
/** The first check a door needs that an account does not meet, or null where it meets them all. */
declare function firstMissing(acct: AdAccountRead | undefined, door: AdDoor, platform: AdPlatform): AdCheckId | null;
/** The first door whose needs are all met, else the first door. */
declare const firstReadyDoor: (read: AdsRead) => AdDoor;
/** The smallest preset: the one a first ad starts on. */
declare const smallestPreset: (config: AdsConfig) => AdsConfig["presets"][number] | undefined;
/** What the reach line says last: what the ad stands on, or for a form when the last number arrived. */
declare function reachNoteOf(ad: AdRead, read: AdsRead): string;
/** Whether words quote a price (a currency sign and a digit): the one pattern, for the warning that the receptionist never quotes one. */
declare const quotesPrice: (text: string) => boolean;
/** Whether an ad's words quote a price: the Service's own note, or any price in the headline. */
declare function adQuotes(copy: AdCopy, priceNote: string): boolean;
/**
 * The one sentence an ad is read back as: `Show [Spring offer] on Facebook and Instagram to people within [5 miles], so
 * they message you on WhatsApp, up to [$720] in all until [Sat 31 Oct].` A word that can change is a chip; on a running ad
 * the platform and the door are plain text (they cannot change). New ad leaves a clause out until its step is done.
 */
declare function sentenceParts(i: SentenceInput): SentencePart[];

/** What the page adds up over the window, from the same rows every ad's own numbers come from. */
interface PageTotals {
    /** What each ad spent, in its currency: summed by currency, never converted. */
    spent: MoneyItem[];
    /** Ads that have spent anything. */
    spentAds: number;
    /** People Chanlytics can count: calls are left out. */
    touch: number;
    wrote: number;
    left: number;
    booked: number;
    /** What the ads whose people Chanlytics counts spent: the cost for each person divides this. */
    eachSpend: MoneyItem[];
    /** The cost for each person who booked, where the counted ads share one currency and enough booked; else null. */
    each: MoneyItem | null;
}
declare function pageTotals(read: AdsRead): PageTotals;
/** The cost for each person in touch, where no calendar says who booked: the same spend over the people counted. */
declare const eachInTouch: (p: PageTotals) => MoneyItem | null;
interface AdWaitingRowVM {
    personId: string;
    /** Their conversation, where there is one: `inbox/<threadId>`. */
    threadId: string | null;
    adId: string;
    name: string;
    initials: string;
    /** `Spring offer · wrote Mon 5 Oct`. */
    line: string;
    /** The amber days: `6 days`. */
    since: string;
    /** Where the row goes: their conversation where there is one (`inbox/<threadId>`), else their page (`clients/<personId>`). */
    open: string;
    /** Where it goes, said as the row's tip. */
    tip: string;
}
interface ComingRowVM {
    adId: string;
    /** `Mon 12 Oct` as its lines (the weekday, then the date), or `Today`. */
    when: string[];
    name: string;
    /** `ends that evening`; empty where the row says only why. */
    said: string;
    why: string;
}
interface CameBackRowVM {
    id: "ahead" | "kept" | "missed" | "past";
    label: string;
    n: number;
    /** `marked by your team`. */
    note: string | null;
}
interface TilesVM {
    waiting: {
        title: string;
        rows: AdWaitingRowVM[];
        empty: string;
    };
    coming: {
        title: string;
        rows: ComingRowVM[];
        total: string;
        plus: string | null;
    };
    cameBack: {
        title: string;
        window: string;
        /** Whether a calendar link is set. Without one nobody can be counted as booked: the headline's number is not a count (draw a dash). */
        linked: boolean;
        /** The word and the number it counts, which stands large: `Booked`, 26. */
        headline: {
            label: string;
            n: number;
        };
        rows: CameBackRowVM[];
        /** What to do next; with no calendar link, why there is nothing to count. */
        nudge: string;
        unmatched: string | null;
        /** The phone's one line: `Ahead 5 · Kept 14 · Missed 2 · Past 5`; none where there is nothing to count. */
        line: string | null;
    };
}
/** The three tiles; `reading` is the platforms being read, whose numbers wait. */
declare function tilesOf(read: AdsRead, reading?: readonly AdPlatform[]): TilesVM;
interface PhoneVM {
    line1: string;
    /** `2 people from your ads are waiting on you`; null where nobody is. */
    needs: string | null;
    /** Who waits, by name: `Jordan P. · Amy G.`; null where nobody does. */
    names: string | null;
    /** The longest wait, in amber: `6 days`. */
    since: string | null;
    footnote: string;
}
/** The phone page's lines. `reading` is the platforms being read: the muted line says so instead of a spend it does not know. */
declare function phoneOf(p: PageTotals, read: AdsRead, waiting: readonly AdWaitingRowVM[], reading?: readonly AdPlatform[]): PhoneVM;
interface V0VM {
    /** The lead line (bold part, rest); null where there is nothing to say yet. */
    lead: {
        strong: string;
        rest: string;
    } | null;
    muted: string | null;
    /** The empty workspace's two lines, instead of the lead. */
    empty: {
        lead: string;
        line: string;
    } | null;
    /** BarList rows; `own` is the one in ink, the rest in one quiet hue. */
    rows: {
        label: string;
        n: number;
        own: boolean;
    }[];
    notes: string[];
    door: DoorVM;
    platforms: {
        id: AdPlatform;
        name: string;
        line: string;
        word: string;
    }[];
    next: string;
}
declare function v0Of(read: AdsRead): V0VM;
/** What stops the first ad: the step, and the door that mends it. The press waits for it. */
interface BlockedVM {
    text: string;
    door: DoorVM;
}
/** An account that has to be chosen: its choices, each with the currency it is charged in. */
interface ChooseVM {
    platform: AdPlatform;
    title: string;
    line: string;
    use: string;
    choices: {
        externalId: string;
        label: string;
        name: string;
    }[];
}
interface NoAdsVM {
    title: string;
    line: string;
    press: string;
    checklist: StandRowVM[];
    /** The first need the door's account does not meet, else null: the press is stopped while it stands. */
    blocked: BlockedVM | null;
    /** The accounts waiting to be chosen; while there is one, the card for the first ad is not drawn. */
    choose: ChooseVM[];
}
/** The first ad's card: the door it would start on, what that door needs, and the smallest amount it would run on. */
declare function noAdsOf(read: AdsRead, config: AdsConfig): NoAdsVM;

interface HeadVM {
    /** The bold part of the sentence: `26 of 114`. Empty where the sentence has none. */
    strong: string;
    rest: string;
    /** The money-calm line under the head (desk and phone). Null where nothing is spent. */
    money: string | null;
}
/** The popover under "How this is counted ›": the four definitions, then the fee and the calls sentences. */
interface CountedVM {
    quiet: string;
    door: string;
    title: string;
    items: {
        label: string | null;
        text: string;
    }[];
}
/**
 * What a press on the Ask line changes (the store's answerAsk): a longer run and a bigger total, or an amount a day moved
 * from one ad to another until the day the second ends.
 */
type AskApply = {
    kind: "extend";
    adId: string;
    endDay: string;
    totalMinor: number;
} | {
    kind: "move";
    fromId: string;
    toId: string;
    perDayMinor: number;
    untilDay: string;
};
/** The Ask line: one proposal, one sentence, two presses. It exists only when it can say something true. */
interface AskVM {
    kind: "fix" | "extend" | "move";
    adId: string;
    text: string;
    /** The phone's last row. */
    short: string;
    press: string;
    dismiss: string;
    /** The whole consequence, said before the press is final; null where the press only opens the ad. */
    confirm: string | null;
    toast: string;
    apply: AskApply | null;
}
/** One ad as a ledger row (desk) and a phone row. */
interface AdRowVM {
    id: string;
    name: string;
    /** `Facebook and Instagram · about $15 a day · since 14 Sep`. */
    hint: string;
    door: AdRead["door"];
    glyph: Glyph;
    /** The dot's tone beside the name. */
    tone: AdTone;
    spent: CellVM;
    inTouch: CellVM;
    booked: CellVM;
    each: CellVM;
    state: StateVM;
    /** An ad that runs and has something to say to the owner: its second line is that, not its end. */
    alert: boolean;
    /** Under the name below 1000px of page: `96` and `wrote`. */
    fold: {
        value: string;
        unit: string;
    } | null;
    /** The ad's address, for the row's door. */
    open: string;
    phone: {
        line: string;
        endTop: string;
        endSub: string | null;
    };
}
/** How the ledger's ads are grouped: by what they ask people to do, or by the platform they run on. */
type AdsGroupBy = "door" | "platform";
/** The ring's glyph of a group: a door's own, or a plain one for a platform (never its logo). */
type GroupGlyph = Glyph | "users" | "search" | "video";
interface GroupVM {
    /** What the group is: a door (`whatsapp`) or a platform (`meta`). */
    key: string;
    glyph: GroupGlyph;
    /** `Message you on WhatsApp` (the head sets it in caps). */
    caps: string;
    /** `1 ad · 96 new people wrote`. */
    meta: string;
    rows: AdRowVM[];
}
/** An account whose last read failed: the line under the pane line, and the press that reads it again. */
interface FailedVM {
    platform: AdPlatform;
    /** `Meta's numbers could not be read · as of Sat 6 PM`. */
    line: string;
    again: string;
}
/** The quiet choice of how to group the ledger, offered from ADS_GROUP_FROM ads. */
interface GroupByVM {
    label: string;
    value: AdsGroupBy;
    options: {
        value: AdsGroupBy;
        label: string;
    }[];
}
interface AdsVM {
    /** Nothing connected (v0), a connected account with no ad yet, or ads. */
    mode: "v0" | "none" | "ads";
    head: HeadVM;
    /** The pane line: `Last 30 days · read 9:19 AM`. */
    pane: string;
    standing: StandingVM[];
    /** The four figures; none in v0 or with no ads. */
    figures: FigureVM[];
    counted: CountedVM | null;
    ask: AskVM | null;
    /** Accounts whose last read failed, a line each under the pane line. */
    failed: FailedVM[];
    /** Whether an account is being read: its spend, and the cost for each person, wait. */
    reading: boolean;
    /** The door to the calendar link, while none is set. */
    link: DoorVM | null;
    /** The choice of how to group the ledger, once there are ads enough to need one. */
    groupBy: GroupByVM | null;
    groups: GroupVM[];
    tiles: TilesVM | null;
    phone: PhoneVM | null;
    v0: V0VM | null;
    noAds: NoAdsVM | null;
}
/** What the ads so far cost for each person who booked, where 10 or more booked: New ad says it under the budget. */
declare function earlierCost(read: AdsRead): {
    each: string;
    people: number;
} | null;
/**
 * The page: v0 (nothing connected), the first ad's card (connected, no ads yet), or the ads. `by` is how the ledger groups
 * its ads; before ADS_GROUP_FROM ads they are grouped by what they ask.
 */
declare function adsModel(read: AdsRead, config: AdsConfig, by?: AdsGroupBy): AdsVM;

/** The sentence behind `Too early to judge`: its word opens what each platform says about it. */
interface JudgeVM {
    /** The first words, which open the sheet; null where the line is plain. */
    word: string | null;
    rest: string;
    /** The sheet behind the word; null otherwise. */
    sheet: string | null;
}
interface ResultsVM {
    header: string;
    /** `96 wrote · 23 booked`. */
    count: string;
    all: {
        words: string;
        to: string;
    } | null;
    facts: FigureVM[];
    /** A counted zero, a quiet start, or too early to judge, said in words. */
    line: JudgeVM | null;
}
/** One column of the bar a day. */
interface DayVM {
    day: string;
    /** `Sun 27 Sep`. */
    label: string;
    inTouch: number;
    booked: number;
    /** Before the ad existed: a hairline only. */
    before: boolean;
    /** One of the newest three days: drawn lighter. */
    fresh: boolean;
    today: boolean;
    /** The bar's height, 0 to 1, against the busiest day. */
    h: number;
    /** The filled inner part: the share booked since, 0 to 1. */
    f: number;
}
declare function resultsOf(ad: AdRead, t: Totals, o: {
    read: AdsRead;
    tooEarly: boolean;
    reportTo: string;
}): ResultsVM;
interface BarsVM {
    /** The 30 days of the window, then today (an outline, marked `so far today`). */
    days: DayVM[];
    legend: string;
    aria: string;
    todayNote: string;
}
declare function adBarsOf(ad: AdRead, t: Totals, read: AdsRead): BarsVM;
/** One of the platform's own numbers: what it is called, and the number, or that it was not read. */
interface TheirsRowVM {
    label: string;
    value: string;
    known: boolean;
}
/** The platform's own numbers, by name, never summed with ours; the line says whose count they are. */
interface TheirsVM {
    /** The quiet door's words: `Meta's numbers`. */
    door: string;
    rows: TheirsRowVM[];
    note: string;
}
/** What people searched on Google, as it groups them, and the searches left out for the owner: read, never changed here. */
interface TypedVM {
    door: string;
    themes: string[];
    note: string;
    left: {
        title: string;
        terms: string[];
        note: string;
    } | null;
}
interface QuietVM {
    reply: string | null;
    replyGrey: boolean;
    provenance: string;
    /** The platform's own numbers, a press away; null before it has approved the ad. */
    theirs: TheirsVM | null;
    /** Google: what people typed; null for the others and before anything ran. */
    typed: TypedVM | null;
    extra: string | null;
}
declare function quietOf(ad: AdRead): QuietVM;
type ThreadVM = {
    kind: "chat";
    title: string;
    greeting: string;
    ready: string | null;
    questions: string[];
    reply: string;
    replyLabel: string;
    note: string;
} | {
    kind: "call";
    title: string;
    line: string;
} | {
    kind: "form";
    title: string;
    fields: {
        label: string;
        note: string;
    }[];
    consent: {
        title: string;
        text: string;
    };
    privacy: string;
    notice: string;
    layout: string | null;
    thanks: string;
};
interface PreviewVM {
    frame: "feed" | "search" | "video";
    platform: AdPlatform;
    door: AdDoor;
    /** `How it reads`. */
    fold: string;
    /** The closed fold's two-line excerpt. */
    excerpt: string;
    /** Who the ad is shown as. */
    business: string;
    /** A feed ad's headline; Google's three joined ` | `. */
    headline: string;
    headlines: string[];
    text: string;
    /** Google's two description lines. */
    lines: string[];
    path: string;
    /** The capsule under the ad. */
    cta: string;
    caption: string;
    /** Feed | Story | Reel; none where the frame is one shape. */
    frames: string[];
    thread: ThreadVM;
    /** The amber line where the ad quotes a price and the receptionist never does. */
    warn: string | null;
}
declare function adPreviewOf(ad: AdRead, read: AdsRead): PreviewVM;
interface AdPersonRowVM {
    /** The person's id in People: their page is `clients/<personId>`. */
    personId: string;
    /** Their conversation, where there is one: `inbox/<threadId>`. */
    threadId: string | null;
    name: string;
    initials: string;
    /** `Wrote Mon 5 Oct`. */
    when: string;
    said: string | null;
    /** The conversation's fact, shown only where there is no appointment. */
    talk: {
        text: string;
        tone: "warn" | "plain";
    } | null;
    cal: {
        text: string;
        tone: "plain";
        note: string | null;
    };
    booked: boolean;
    /** Where the row goes, and what its tip says of it: the conversation that waits on the owner, else the person's page. */
    door: {
        to: string;
        tip: string;
    };
}
interface PeopleVM {
    title: string;
    total: number;
    filters: {
        id: "booked" | "not-yet";
        label: string;
        n: number;
    }[];
    /** All of those shown, in the order: waiting for you, booked, talking, quiet. */
    rows: AdPersonRowVM[];
    all: {
        words: string;
        to: string;
    } | null;
    empty: string | null;
}
declare function adPeopleOf(ad: AdRead, t: Totals, o: {
    read: AdsRead;
    peopleTo: string;
}): PeopleVM;

/**
 * What the tapped words' lists are made of, and what Edit's foot says of its changes (page-only): the areas and the ZIP codes,
 * the amounts with what each does to a day and which the platform will not take, the end dates with the same, and the one
 * press that raises what can be spent, which names its most. Apart from drawer-parts.ts only for the file limit; drawer.ts
 * hands every name a page needs on. Pure, like the rest of the models: the rules are rules.ts's, the words words-drawer.ts's.
 */

/** The word a tapped area hands back: the miles of a circle (`5`), or the ZIP codes (`zips:10001,10003`). */
declare const areaValueOf: (area: AdArea) => string;
/** The area a word names (areaValueOf's other way). */
declare function areaOfValue(value: string): AdArea;
/** What is wrong with a ZIP code typed to add, in words; null where it can be added. */
declare function zipIssue(text: string, have: readonly string[]): string | null;
interface AreaOption {
    miles: number;
    label: string;
    /** `About 30,000 to 55,000 people · Meta's estimate`, where Meta returned one. */
    people: string | null;
}
/** One amount in the list: what it says, what it does to a day, and why the platform will not take it, if it will not. */
interface AmountOption {
    minor: number;
    label: string;
    /** What this choice changes (a day's spend, the most that can be spent); the reason, when it is refused. */
    sub: string | null;
    current: boolean;
    /** Above the amount now: the one kind of press that names its most. */
    raise: boolean;
    /** The platform's rule that stops it, in its words; null where it is allowed. */
    refused: string | null;
}
/** One end date in the list, with what it does to a day over the days left. */
interface EndOption {
    day: string;
    label: string;
    sub: string;
    current: boolean;
}
/** What a typed amount may be (the box of "Your own amount"), in minor units. */
interface OwnAmount {
    minMinor: number;
    /** Null where the platform bounds it by nothing but the account. */
    maxMinor: number | null;
    /** Why no amount can be typed now (TikTok's wait), else null. */
    refused: string | null;
    /** The line under the box, where the platform bounds the amount. */
    hint: string | null;
}
/** What the tapped words' lists are made of. Amounts are minor units of `currency`. */
interface EditVM {
    areas: AreaOption[];
    /** The ZIP codes of the area now, where it is a list of them (TikTok); null for a circle. */
    zips: string[] | null;
    /** The amount is a daily one (about $15 a day), not a total. */
    daily: boolean;
    /** Totals (or daily amounts) to choose from, ascending; those above the current one are raises. */
    amounts: AmountOption[];
    currentMinor: number;
    /** The platform's floor a day, read from the ad account; null where it states none. */
    floorMinor: number | null;
    spentMinor: number;
    currency: string;
    own: OwnAmount;
    minEnd: string;
    endDay: string;
    /** The end dates offered, none for a daily amount (it has no end). */
    ends: EndOption[];
    /** Google: the last day a total can run to (90 days from the start); null where there is none. */
    lastEnd: string | null;
    /** What each choice changes, one note a line. */
    notes: Record<"offer" | "area" | "amount" | "end", string[]>;
}
/**
 * The lists of an ad's tapped words. `saved` is the ad as the platform has it, where `ad` is the ad as an unsaved edit would
 * make it: what the platform takes of an amount is measured from what it holds, never from a draft.
 */
declare function editOf(ad: AdRead, t: Totals, o: {
    read: AdsRead;
    config: AdsConfig;
    saved?: AdRead;
}): EditVM;
/** What a draft does to what can be spent, where it raises it: by how much, to what, and whether that is a total. */
declare function raiseOf(ad: AdRead, next: AdRead): {
    total: boolean;
    to: number;
    by: number;
} | null;
/** Edit's foot: its line, and the primary's words. */
interface EditFootVM {
    say: string;
    save: string;
}
/**
 * Edit's foot over a draft: `n` changes, whether they send the ad back for checking, and, where the draft raises the total,
 * the most that can then be spent, which the primary names too (`Save · raise to $900`). Lowering, and every other change,
 * is plain `Save changes`: a raise of spend is the only press that names its most. A raised daily amount has no most, so it
 * says about.
 */
declare function editFootOf(o: {
    ad: AdRead;
    next: AdRead;
    patch: AdPatch;
    n: number;
}): EditFootVM;

/**
 * One ad's drawer (page-only), in Option B's order: kicker, name, callout, what's left, the sentence, the reach line, the
 * results and the bar a day, the preview, the people it brought, what the tapped words change. Pure, like the rest of the
 * models: `adModel(ad, read, config)` reads an `AdRead` in the `AdsRead` it was read with, and the lists and blocks are
 * drawer-parts.ts's and drawer-edit.ts's (apart from this only for the file limit; this hands every name a page needs on).
 */

/** A press a callout offers. `again` asks the platform to look at a turned-down ad again; the ad stays as it is. */
type CalloutActId = "resume" | "update" | "fix" | "again" | "fresh" | "retry" | "remove";
interface CalloutVM {
    tone: AdTone;
    text: string;
    door: DoorVM | null;
    /** `done` is what the press says of itself once pressed, until the platform answers. */
    acts: {
        id: CalloutActId;
        label: string;
        done: string;
    }[];
}
interface ReachVM {
    tone: AdTone;
    /** `On`, `In review`, `Ended Sat 10 Oct`: the first word of the line, in the ink. */
    state: string;
    /** `Meta approved it Mon 14 Sep`, `last message arrived 8:41 AM today`: the reasons, dim. */
    parts: string[];
    rows: StandRowVM[];
    read: string;
}
/** A press in the foot. An ad the owner made on the platform itself has only Pause and Resume. */
type FootAct = "pause" | "resume" | "edit" | "again";
interface AdDrawerVM {
    id: string;
    kicker: string;
    name: string;
    state: StateVM;
    platform: AdRead["platform"];
    door: AdRead["door"];
    owner: string;
    /** `usually within a day`. */
    within: string;
    /** False for an ad the owner made on the platform itself: only Pause and Resume are here. */
    madeHere: boolean;
    /** `Made in Meta Ads Manager. Chanlytics can pause and resume it; change it in Meta.`; null for an ad made here. */
    adopted: string | null;
    /** The foot: Pause | Edit (running), Resume | Edit (paused), Run it again (done); fewer where the ad is not ours or not made. */
    mode: "running" | "paused" | "done";
    foot: FootAct[];
    callout: CalloutVM | null;
    /** `Runs to Sat 31 Oct · $308 left of $720 · about $15 a day`. */
    next: string;
    sentence: SentencePart[];
    reach: ReachVM;
    results: ResultsVM;
    bars: BarsVM;
    quiet: QuietVM;
    preview: PreviewVM;
    people: PeopleVM;
    edit: EditVM;
    endConfirm: string;
    /** The questions a callout's press asks first. */
    confirm: {
        update: string;
        remove: string;
    };
    /** Where New ad opens from this ad: a copy of it, and to run it again. */
    go: {
        copy: string;
        again: string;
    };
}
/**
 * One ad's drawer, in Option B's order: kicker, name, callout, what's left, the sentence, the reach line, results, preview,
 * people. `ad` is the ad as it would be (an Edit draft applied); `saved` is the ad as the platform has it, which what the
 * platform takes of an amount is measured from (it is `ad` where nothing is being edited).
 */
declare function adModel(ad: AdRead, read: AdsRead, config: AdsConfig, saved?: AdRead): AdDrawerVM;

interface ShownAsVM {
    label: string;
    /** `Harbor Studio · @harborstudio`. */
    line: string;
    /** `Up to 25 characters`, where the platform limits the name. */
    limit: string | null;
    /** Read-only here: the door is Settings › Connections. */
    door: DoorVM;
}
interface OpensVM {
    label: string;
    group: string;
    picked: AdDraft["opens"];
    choices: {
        id: AdDraft["opens"];
        label: string;
        address: string;
    }[];
    note: string;
}
interface SearchVM {
    label: string;
    themes: string[];
    leftOut: string;
    note: string;
}
type ScheduleVM = {
    kind: "switch";
    label: string;
    hint: string;
    on: boolean;
    locked: boolean;
} | {
    kind: "line";
    text: string;
};
interface AgesVM {
    label: string;
    /** `18 and over`, locked: nobody chooses it here. */
    line: string;
    why: string;
    floor: number;
}
interface SetForVM {
    label: string;
    rows: string[];
}
/** One row of "Checked before turning on": a red one stops Turn on and says what to do about it, with its door. */
interface CheckRowVM {
    text: string;
    tone: "ok" | "warn" | "fail";
    note: string | null;
    door: DoorVM | null;
    /** What a red row says to do, as the press's reason: `Add a payment method in Meta to continue`. */
    block: string | null;
}
interface CheckedVM {
    /** `7 of 7 ready`. */
    said: string;
    met: number;
    of: number;
    rows: CheckRowVM[];
}
/** Where the page goes once an ad is on: the Google one, from the new ad, where "Also run on Google" was pressed. */
declare const adFollowOn: (draft: AdDraft, id: string) => string | null;

type Post = AdsRead["posts"][number];
type Preset = AdsConfig["presets"][number];
/** What New ad has chosen so far. `newAdDefaults` fills it; every press in a step changes one field. */
interface AdDraft {
    door: AdDoor;
    platform: AdPlatform;
    serviceId: string;
    /** The post the ad is made from, or null for a photo (or a video) of the owner's own. */
    postId: string | null;
    postMode: "as-is" | "new-words";
    /** Meta: a photo, or a vertical video for Reels and Stories. TikTok's is always a video; Google's shows neither. */
    format: "photo" | "video";
    areaMiles: number;
    /** Whether the ad is about a job, a loan or a home: asked per ad, never inferred. */
    special: boolean;
    /** `total` is "For a set number of days"; `daily` is "Until I stop it". */
    mode: "total" | "daily";
    presetId: Preset["id"] | "own";
    /** The daily amount of "Your own amount", in minor units. */
    ownPerDayMinor: number;
    startWith: "ready" | "questions";
    /** Words typed over the drafted ones (the photo path); null keeps the drafted words. */
    headline: string | null;
    text: string | null;
    /** A name typed over the drafted one; null keeps `First appointment · 12 Oct`. */
    name: string | null;
    /** Google: the page the ad opens, the hosted one or the business's own site. */
    opens: "page" | "site";
    /** Only while the business is open. Meta can keep to it only with a total (`scheduleAllowed`), Google's call button always does. */
    schedule: "always" | "open-hours";
    /** Meta: "Let Meta adjust my photo and wording"; off, so the photo and words stay the owner's. */
    adjust: boolean;
    /** A form: "Ask them to double-check before sending". */
    doubleCheck: boolean;
    /** A form: the thank-you line promises a message within minutes (else it says they will hear back). */
    thanks: boolean;
    /** Meta: "Also run on Google" was pressed; once this one is on, the Google one is set up from it (`adFollowOn`). */
    alsoGoogle: boolean;
}
/** The newest post that can run on a platform as an ad: an Instagram post on Meta, a video on TikTok, none on Google. */
declare function newestPostFor(posts: readonly Post[], platform: AdPlatform, kind?: Post["kind"]): Post | undefined;
/**
 * New ad opens already filled from the workspace: the top Service, the newest post that can run as an ad, 5 miles, the first
 * door whose needs are all met, and the smallest preset for a first ad.
 */
declare function newAdDefaults(read: AdsRead, config: AdsConfig): AdDraft;
/**
 * New ad filled from an ad: a copy of it, to run it again once it has ended (both keep its door, platform, offer, area and
 * amount), or the same offer on Google's Call door (keeps its offer and area). The words of a copy are the ad's own, and the
 * name it opens with says where it came from.
 */
declare function newAdFrom(ad: AdRead, how: "copy" | "again" | "google", read: AdsRead): AdDraft;
/** Every word an ad says of itself: its headline, text, chat, reply and thank-you, drafted from one Service and the business. */
declare function starterCopy(o: {
    service: string;
    price: string;
    business: Pick<AdsRead["business"], "name" | "address" | "site" | "hours">;
    door: AdDoor;
    word: AppointmentWord;
}): AdCopy;
/**
 * The draft as an ad in review, sent to the platform at the moment the page was read: what the ledger draws when Turn on is
 * pressed. Its id is the caller's (the composer's is a placeholder, the store gives the row its own).
 */
declare function draftAd(draft: AdDraft, read: AdsRead, config: AdsConfig, id: string): AdRead;
/** One preset row of step 4. */
interface PresetVM {
    id: Preset["id"];
    label: string;
    /** `about $15 a day for 20 days · up to $300 · ends Sat 31 Oct`; in "Until I stop it", without the days and the total. */
    rest: string;
    perDayMinor: number;
    days: number;
    totalMinor: number;
    endDay: string;
}
interface NewAdVM {
    /** The draft as an ad in review. */
    ad: AdRead;
    /** The same ad as the drawer reads it: the preview, the forecast. A Meta video is drawn in the vertical frame. */
    drawer: AdDrawerVM;
    /** `First appointment · 12 Oct`: the name drafted, which a typed one replaces. */
    name: string;
    /** The ad as one sentence, filled in from the first step. */
    sentence: SentencePart[];
    presets: PresetVM[];
    /** What "Your own amount" would run as, once chosen (a preset's line without its label); null with no amount. */
    ownRest: string | null;
    /** The unit beside the box of "Your own amount": `$ a day`. */
    ownUnit: string;
    /** Under the presets: Meta's estimate (or that it can't give one yet), Google's; null for TikTok. */
    estimate: string | null;
    /** The earlier ads' cost, where 10 or more booked from them. */
    history: string | null;
    /** The budget step's quiet lines, from the platform. */
    lines: string[];
    /** Step 5's forecast: when it starts and what it can spend. */
    forecast: string;
    /** The foot's one press: `Turn on · up to $300`. */
    turnOn: string;
    /** What the door needs on the platform it runs on (step 1), derived from the account's checks. */
    needs: StandRowVM[];
    /** Step 2 on the Call door: where the ad opens. */
    opens: OpensVM | null;
    /** Step 2, under the preview: who the ad is shown as, and the door to change it. */
    shownAs: ShownAsVM;
    /** Step 2 on the Call door: what people search, and what is left out for the owner. */
    search: SearchVM | null;
    /** Step 3: the age floor, locked, with its why; null where the platform sets none (Google). */
    ages: AgesVM | null;
    /** Step 4, behind "More choices": only while the business is open. */
    schedule: ScheduleVM;
    /** What stops Turn on: an account not ready, or a need not met, with the door that mends it; null where nothing does. */
    blocked: {
        text: string;
        door: DoorVM;
    } | null;
    ready: {
        tone: "ok" | "warn";
        said: string;
        rows: StandRowVM[];
    };
    /** Step 5: "Checked before turning on" with its count. */
    checked: CheckedVM;
    /** Step 5: what Chanlytics set for the owner on this platform. */
    setFor: SetForVM;
    /** The most it can spend, in minor units; null with a daily amount. */
    totalMinor: number | null;
    perDayMinor: number;
    currency: string;
    days: number;
    startDay: string;
    endDay: string;
}
/** Everything the steps say that depends on what has been chosen. */
declare function newAdModel(draft: AdDraft, read: AdsRead, config: AdsConfig): NewAdVM;

/**
 * Ads' addresses (`campaigns/ads…`), the second of Campaigns' two views (Messages | Ads): the page, an ad open in its drawer,
 * the New ad composer and the Results sheet. One param holds them, as Leads' does under People (`clients/leads:…`):
 *
 *   campaigns/ads                     the page
 *   campaigns/ads:ad:<id>             an ad open in its drawer, pushed so Back closes it
 *   campaigns/ads:new                 the New ad composer, on the door it opens on (WhatsApp)
 *   campaigns/ads:new:<door>          the same, on a door: `whatsapp`, `call` or `form`
 *   campaigns/ads:new:copy:<id>       New ad filled from an ad, as a copy               (Make a copy)
 *   campaigns/ads:new:again:<id>      New ad filled to run an ended ad again            (Run it again)
 *   campaigns/ads:new:google:<id>     New ad on Google's Call door, with this ad's offer (Also run on Google)
 *   campaigns/ads:results             the Results sheet over the page
 *
 * A word the view does not know is the page (a link must never land on nothing). A root module of the package: Reports,
 * People and Campaigns' routes link here, and the frame's route chunk reads `ADS_WORDS`, so none of it is page-only.
 */

/** What results are narrowed to: every ad, the ads of one platform, or one ad. */
type AdsScope = {
    kind: "all";
} | {
    kind: "platform";
    platform: AdPlatform;
} | {
    kind: "ad";
    id: string;
};

/** The days a fold is of, and what it is narrowed to. */
interface ResultsAt {
    from: string;
    to: string;
    scope: AdsScope;
}
/** One choice of the scope list: the word the address and the list keep, what it is called, and what it narrows to. */
interface ResultsScopeVM {
    key: string;
    kind: AdsScope["kind"];
    scope: AdsScope;
    label: string;
}
/** One day of the two lanes. */
interface ResultsDayVM {
    day: string;
    /** `Mon 5 Oct`. */
    label: string;
    /** `5`. */
    short: string;
    /** Whole units of the one currency; null where the ads are paid in several. */
    spent: number | null;
    /** What the ads spent that day, as money is said (each currency its own). */
    spentWords: string;
    inTouch: number;
    booked: number;
    /** In touch and not booked (yet). */
    waiting: number;
    /** Google's count, not people. */
    calls: number;
    /** One of the last 14 days: a person can still book. */
    settling: boolean;
}
/** By day: the spend lane above, the people lane below with the booked part filled. */
interface ResultsDaysVM {
    rows: ResultsDayVM[];
    /** The one currency the spend lane is drawn in, null where the ads are paid in several. */
    currency: string | null;
    spentAria: string;
    peopleAria: string;
    /** Under the lanes: the days still settling, the calls left out, the currencies not drawn as one. */
    notes: string[];
}
interface ResultsStepVM {
    id: "touch" | "reply" | "booked";
    label: string;
    /** Null where it is not read. */
    n: number | null;
    display: string;
    why: string | null;
}
/** A row of the platform and door tables: the page's cells, over the ads of one platform or one door. */
interface ResultsRowVM {
    id: string;
    label: string;
    ads: number;
    spent: string;
    inTouch: CellVM;
    booked: CellVM;
    each: CellVM;
}
/** What one platform says of its ads: a row each, in the platform's own columns. Never added together. */
interface ResultsTheirsVM {
    platform: AdPlatform;
    title: string;
    columns: string[];
    rows: {
        id: string;
        name: string;
        cells: string[];
    }[];
    /** `Read 9:19 AM.` where the account says when it was read. */
    read: string | null;
}
interface AdsResultsVM {
    scope: AdsScope;
    /** The scope as the list keeps it (`all`, `platform:meta`, `ad:<id>`). */
    scopeKey: string;
    scopeWord: string;
    scopes: ResultsScopeVM[];
    /** The days counted: the days asked for, ending yesterday at the latest. */
    window: {
        from: string;
        to: string;
        days: number;
    };
    /** Nothing to draw: the words for why, and the sections below are empty. */
    empty: {
        title: string;
        body: string;
    } | null;
    /** The sentence at the head; null where there is nothing to draw. */
    head: {
        strong: string;
        rest: string;
    } | null;
    /** `11 Sep – 10 Oct · 30 days · read 9:19 AM`. */
    pane: string;
    /** The page's four figures over these days. */
    figures: FigureVM[];
    /** The quiet line under them: spend is as each platform reports it. */
    quiet: string | null;
    /** The head's numbers, for the Overview's one fact. */
    totals: {
        spent: string;
        spentAny: boolean;
        touch: number;
        booked: number | null;
        calls: number;
    };
    days: ResultsDaysVM | null;
    funnel: ResultsStepVM[] | null;
    /** What came of the appointments: the page's tile for the same people, or the reason it is not read for these. */
    cameBack: ({
        title: string;
    } & ({
        tile: TilesVM["cameBack"];
    } | {
        why: string;
    })) | null;
    byPlatform: ResultsRowVM[];
    byDoor: ResultsRowVM[];
    byAd: AdRowVM[];
    theirs: {
        cards: ResultsTheirsVM[];
        why: string | null;
    };
}
/**
 * The results of some of an owner's ads over some days: the head, the four figures, by day, the funnel, what came of the
 * appointments, the platform, door and ad tables, and what each platform says. A scope that names an ad this read does not have, a
 * workspace with no ad, and days with nothing spent or counted each say so in `empty` and leave the sections out.
 */
declare function adsResultsOf(read: AdsRead, config: AdsConfig, at: ResultsAt): AdsResultsVM;
/** The Overview's Worth-knowing line over these days: what the ads brought. Null where there is nothing to say. */
declare function adsFactOf(vm: AdsResultsVM): {
    text: string;
    sub: string;
} | null;

declare const RESULTS: {
    /** The sheet: the quiet line it opens under, and its name. */
    kicker: string;
    title: string;
    scope: {
        label: string;
        all: string;
        platforms: string;
        ads: string;
    };
    /** The foot's door, and the empty lens's door. */
    fullReport: string;
    openAds: string;
    /** Under the head: what the days cover, and when the numbers were read. */
    pane: (o: {
        dates: string;
        days: number;
        readAt: string | null;
    }) => string;
    /** What the head says the results are of: `your ads`, `your Google ads`, an ad's own name. */
    of: {
        all: string;
        platform: (platform: string) => string;
        ad: (name: string) => string;
    };
    /** The head: the page's sentence, said of whatever the results are narrowed to. */
    head: {
        booked: (o: {
            booked: number;
            touch: number;
            of: string;
        }) => {
            strong: string;
            rest: string;
        };
        touchOnly: (o: {
            touch: number;
            of: string;
        }) => {
            strong: string;
            rest: string;
        };
        /** Only Google's calls stand here: its count, and not people. */
        calls: (o: {
            calls: number;
            of: string;
        }) => {
            strong: string;
            rest: string;
        };
        quiet: (o: {
            of: string;
        }) => {
            strong: string;
            rest: string;
        };
    };
    /** By day: two small charts, what was spent and who it brought. */
    days: {
        title: string;
        spent: string;
        spentTitle: string;
        peopleTitle: string;
        booked: string;
        waiting: string;
        peopleLine: string;
        spentAria: (o: {
            total: string;
            days: number;
        }) => string;
        peopleAria: (o: {
            people: number;
            booked: number;
            days: number;
        }) => string;
        /** A tooltip's line for a day still settling. */
        settlingDay: string;
        /** `a` is the workspace's appointment word with its article: `an appointment`. */
        settling: (days: number, a: string) => string;
        callsNote: (n: number) => string;
        severalCurrencies: string;
        columns: {
            day: string;
            spent: string;
            people: string;
            booked: string;
            calls: string;
        };
    };
    /** From first contact to booked: people only. */
    funnel: {
        title: string;
        line: string;
        touch: string;
        reply: string;
        booked: string;
        columns: string[];
        /** The middle step is the receptionist's first reply, which is counted over the last 30 days. */
        replyWindow: string;
        replyOf: string;
    };
    /** What came of the appointments: the page's own rows, when they are of the same people. */
    cameBack: {
        /** `many` is the workspace's appointment word, plural. */
        title: (many: string) => string;
        forAll: string;
        forThirty: string;
        columns: string[];
    };
    /** The tables. */
    byPlatform: {
        title: string;
        line: string;
    };
    byDoor: {
        title: string;
        line: string;
    };
    byAd: {
        title: string;
    };
    heads: {
        platform: string;
        door: string;
        ad: string;
        ads: string;
        spent: string;
        touch: string;
        booked: string;
        each: string;
        state: string;
    };
    /** The ads a row of the platform and door tables stands for. */
    adsCount: (n: number) => string;
    /** What the platforms say: one card each, never added together. */
    theirs: {
        title: string;
        line: string;
        card: (owner: string) => string;
        read: (time: string) => string;
        dash: string;
        window: string;
        ad: string;
        columns: {
            meta: {
                seen: string;
                taps: string;
                chats: string;
                leads: string;
            };
            google: {
                clicks: string;
                calls: string;
                longCalls: string;
            };
            tiktok: {
                seen: string;
                taps: string;
                leads: string;
            };
        };
    };
    /** Where there is nothing to draw (days with nothing in them say it in the lens registry's words). */
    empty: {
        noAds: {
            title: string;
            body: string;
        };
    };
    /** The Overview's one fact: what the ads brought over the same days, and the door to them. */
    fact: {
        brought: (n: number) => string;
        nobody: string;
        sub: (o: {
            booked: number | null;
            spent: string;
        }) => string;
        door: string;
    };
};

export { ADS_ASK_MIN, ADS_ASK_MIN_CALLS, ADS_ASK_SOON_DAYS, ADS_CHANCE_Z, ADS_COPY_LIMITS, ADS_DAILY_CHOICES_MINOR, ADS_DEFAULT_CURRENCY, ADS_DEFAULT_MILES, ADS_DISPLAY_NAME_MAX, ADS_DOORS, ADS_END_SHIFTS, ADS_EXAMPLES, ADS_EXTEND_MAX_DAYS, ADS_FRESH_DAYS, ADS_GROUP_FROM, ADS_MOVE_DAYS, ADS_MOVE_STEP_MINOR, ADS_OWN_DAYS, ADS_OWN_START_MINOR, ADS_PERMISSION_WARN_DAYS, ADS_READ, ADS_SETTLE_DAYS, ADS_SOFT_NEEDS, ADS_SPECIAL_MILES, ADS_TOTAL_STEPS, ADS_WINDOW_DAYS, ADS_ZIP_DIGITS, ASK, type AdDraft, type AdDrawerVM, type AdPersonRowVM, type AdRowVM, type AdTone, type AdWaitingRowVM, type AdsExample, type AdsGroupBy, type AdsResultsVM, type AdsVM, type AmountOption, type AreaOption, type AskApply, type AskVM, BOOK_ONLINE, BUDGET_RULES, type BarsVM, type BlockedVM, type BudgetRule, CHANGED, CHECKS, CHIPS, CHOOSE, CONNECT, COUNTED, type CalloutActId, type CalloutVM, type CellVM, type CheckRowVM, type ChipId, type ChooseVM, type ComingRowVM, type ConnectChoiceVM, type ConnectRowVM, type CountCtx, type CountedVM, DASH, DOOR, DOOR_NEEDS, DOOR_ORDER, DRAWER, type DayVM, type DoorVM, EDIT, EXAMPLE, type EditFootVM, type EditVM, type EndOption, FIGURES, type FailedVM, type FigureVM, type FootAct, GATE, GROUP, type Glyph, type GroupByVM, type GroupGlyph, type GroupVM, HEAD, type HeadVM, type JudgeVM, LEDGER, LIST, type MoneyItem, NEW_AD, NO_AD, NO_ADS, type NewAdVM, type NoAdsVM, type OwnAmount, PEOPLE_TAB, PHONE, PLATFORMS, PLATFORM_OWNER, PLATFORM_SURFACE, PLATFORM_WORD, PREVIEW, type PageTotals, type PeopleVM, type PhoneVM, type PresetVM, type PreviewVM, type QuietVM, REACH_NOTE, REFUSED, RESULTS, REVIEW_WITHIN, type ReachSaid, type ReachVM, type ReadyRowVM, type ResultsAt, type ResultsDayVM, type ResultsDaysVM, type ResultsRowVM, type ResultsScopeVM, type ResultsStepVM, type ResultsTheirsVM, type ResultsVM, SCHEDULE_NEEDS_TOTAL, SENTENCE, SETTINGS_DOOR, SHOWN, STANDING, STANDING_CHECKS, STATE, STATE_WORD, type SentenceInput, type SentencePart, type StandRowVM, type StandingVM, type StateVM, TILES, TOO_EARLY_DAYS, type TheirsRowVM, type TheirsVM, type ThreadVM, type TilesVM, type Totals, type TypedVM, V0, type V0VM, ZIPS, accountRows, adAccountOf, adBarsOf, adFollowOn, adModel, adPeopleOf, adPersonInitials, adPersonWho, adPreviewOf, adQuotes, adServiceOf, adStateOf, adsFactOf, adsModel, adsResultsOf, allWord, areaOfValue, areaValueOf, areaWord, askWhy, checkFix, checkOk, checkWords, connectModel, costEach, countCtx, counted, countedDoor, currencySymbol, dayLines, dayOfIso, dayShort, dayWord, daysWord, doorNeeds, draftAd, eachInTouch, earlierCost, editFootOf, editOf, endsWhenOf, figureWords, firstMissing, firstReadyDoor, groupMeta, isConnected, leadOf, leftOfAd, leftOfMoney, minorOfUnits, moneyOf, needsSecond, newAdDefaults, newAdFrom, newAdModel, newestPostFor, noAdsOf, pageTotals, peopleWord, perDayOf, phoneOf, platformMeta, platformsFor, quietOf, quotesPrice, raiseOf, ratingLine, reachNoteOf, readTime, resultsOf, sentenceParts, settling, smallestPreset, started, starterCopy, sum, sumMoney, sumsOf, tilesOf, timeOf, totalOf, totalsOf, v0Of, viewState, zipIssue };
