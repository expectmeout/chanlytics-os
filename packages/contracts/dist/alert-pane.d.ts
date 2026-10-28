/** What the edge writes when it raises an alert: the same kinds it emails. */
declare const SERVER_NOTIFICATION_KINDS: readonly ["handoff", "deadman", "call", "number", "sweep", "job_failed", "playbook", "calendar_people", "booking_notice", "alert", "review", "billing", "template_ready", "template_blocked", "broadcast_sent", "broadcast_stopped", "leads_ready", "leads_question", "note_for_you", "reach_out_replied", "reach_out_day", "opted_out", "booking", "member_joined", "member_left", "note_to_keep", "reply_held", "ask_cards", "website_form"];
type ServerNotificationKind = (typeof SERVER_NOTIFICATION_KINDS)[number];

/**
 * The kept kinds a phone is told about. A list, not everything: a sweep's
 * health and a plain alert are the platform's news or the bell's, and a phone
 * that buzzes for them is a phone put on silent. Each member turns any of them
 * off for their own phones (memberships.push_off, 00372: `pushesFor`).
 */
declare const PUSH_KINDS: readonly ["handoff", "deadman", "call", "note_for_you", "leads_ready", "leads_question", "broadcast_sent", "broadcast_stopped", "playbook", "job_failed", "billing", "number", "review", "reach_out_replied", "reply_held", "website_form"];
type PushKind = (typeof PUSH_KINDS)[number];

/**
 * How each kept kind reaches the owner, beyond the row on the bell: by email as well, or on the bell alone.
 *
 * "email" is a kind notify() is handed and mails: to the workspace's addresses, or, for the platform's own (`alert`), to
 * Chanlytics. "bell" is a row the edge or a database function writes and no mail follows (the calendar's new people, a
 * review, a finished search, a note left for you, the day's reach-out numbers). Two kinds are written both ways and are
 * "email" because notify() is handed them: `billing` is mailed when the receptionist stops (a plan paused, a card
 * declined: S6-11) and when a number is about to go back, and its other news (a trial started or ending, the receptionist
 * back) is written to the bell and the phone alone; `leads_question`'s mail is sent by the lead runner beside the row
 * its trigger keeps.
 */
declare const NOTIFICATION_DELIVERY: {
    readonly handoff: "email";
    readonly deadman: "email";
    readonly call: "email";
    readonly number: "email";
    readonly sweep: "email";
    readonly job_failed: "email";
    readonly playbook: "email";
    readonly calendar_people: "bell";
    readonly booking_notice: "bell";
    readonly alert: "email";
    readonly review: "bell";
    readonly billing: "email";
    readonly template_ready: "email";
    readonly template_blocked: "email";
    readonly broadcast_sent: "email";
    readonly broadcast_stopped: "email";
    readonly leads_ready: "bell";
    readonly leads_question: "email";
    readonly note_for_you: "bell";
    readonly reach_out_replied: "email";
    readonly reach_out_day: "bell";
    readonly opted_out: "email";
    readonly booking: "bell";
    readonly member_joined: "bell";
    readonly member_left: "bell";
    readonly note_to_keep: "bell";
    readonly reply_held: "bell";
    readonly ask_cards: "bell";
    readonly website_form: "email";
};
/** A kept kind that is emailed. */
type EmailedNotificationKind = {
    [K in ServerNotificationKind]: (typeof NOTIFICATION_DELIVERY)[K] extends "email" ? K : never;
}[ServerNotificationKind];
/** A kept kind that is a line in the bell and no more. */
type BellNotificationKind = Exclude<ServerNotificationKind, EmailedNotificationKind>;
/** The kinds that are always emailed: the receptionist must reach someone when a customer needs a person. */
declare const EMAIL_ALWAYS_KINDS: readonly ["handoff", "deadman"];
type EmailAlwaysKind = (typeof EMAIL_ALWAYS_KINDS)[number];
/** The kinds the business chooses to be emailed or not: every emailed kind but the always ones and the platform's own. */
type EmailChoiceKind = Exclude<EmailedNotificationKind, EmailAlwaysKind | "alert">;
/** The groups a topic stands in, by how much it asks of the owner. */
type AlertGroup = "needs_you" | "worth_knowing" | "for_you";
type EmailKindsOf<E> = E extends "always" ? EmailAlwaysKind : E extends "choice" ? EmailChoiceKind : BellNotificationKind;
type PhoneKindsOf<P> = P extends true ? PushKind : Exclude<ServerNotificationKind, PushKind>;
/** A topic whose email is `E` and whose phone is `P`: its kinds are those both say. */
interface AlertTopicOf<E extends "always" | "choice" | null, P extends boolean> {
    /** Stable: the page's test ids and the tests read it. */
    key: string;
    group: AlertGroup;
    title: string;
    /** When it is sent, in a sentence: the row's tip. */
    what: string;
    email: E;
    phone: P;
    kinds: readonly Extract<EmailKindsOf<E>, PhoneKindsOf<P>>[];
    /** What the bell's line calls it where the topic has nothing to choose (no email, and no phone of the member's). */
    onBell?: string;
}
/** One line of the page's grid. A topic with nothing to choose and nothing locked is the bell's line, not a topic. */
type AlertTopic = AlertTopicOf<"always", true> | AlertTopicOf<"always", false> | AlertTopicOf<"choice", true> | AlertTopicOf<"choice", false> | AlertTopicOf<null, true>;
/** The email_off a business holds once a topic's email is turned on or off: the rest of it as it was. */
declare function withTopicEmail(notifications: {
    email_off?: readonly unknown[] | null;
} | null | undefined, topic: AlertTopic, on: boolean): EmailChoiceKind[];
/** The push_off a member holds once a topic's phone is turned on or off: the rest of it as it was. */
declare function withTopicPush(pushOff: readonly string[], topic: AlertTopic, on: boolean): PushKind[];
/**
 * The sentences the page says around its rows. Every one is here, so a test reads the page's words where they are
 * decided.
 */
declare const ALERT_PANE_WORDS: {
    readonly where: "Where alerts reach you";
    readonly whereSub: "The bell keeps everything. Choose what else reaches you below.";
    readonly bell: "Bell";
    readonly bellValue: "Everything below, for 30 days; the newest 60 are listed";
    readonly bellOn: "Always on";
    readonly email: "Email";
    readonly emailNobody: "Nobody yet";
    readonly emailNobodyHint: "Until one is added, nobody is emailed when a customer needs a person.";
    readonly emailMore: (n: number) => string;
    readonly change: "Change";
    readonly done: "Done";
    readonly you: "you";
    readonly notOnTeam: "Not on the team";
    readonly onTeam: "On the team";
    readonly addPlaceholder: "name@yourbusiness.com";
    readonly addLabel: "Add an address to email";
    readonly teammates: "Teammates not emailed:";
    readonly emailFoot: "Each address gets what is ticked under Email. Up to 10.";
    readonly test: "Send a test";
    readonly testing: "Sending…";
    readonly testSent: (n: number) => string;
    readonly testNot: (why: "no_address" | "not_live" | "not_sent" | null) => "There is no address to send a test to." | "Tests are sent from the live app only, not from a preview." | "The test could not be sent. Try again in a minute.";
    readonly phone: (n: number) => "Your phones" | "Your phone";
    readonly phoneHint: "Signing out on a phone stops its alerts.";
    readonly browser: "This browser";
    readonly browserValue: "When someone needs you right now";
    readonly browserHint: "While Chanlytics is open in a tab.";
    readonly browserBlocked: "Your browser is blocking alerts from Chanlytics. Allow them in its settings for this site, then switch this on.";
    readonly what: "What you're told about";
    readonly whatSub: "Tick where else each one reaches you. Email is the business's; your phone is yours.";
    readonly emailHead: "Email";
    readonly emailHeadSub: "for the business";
    readonly phoneHead: "Phone";
    readonly phoneHeadSub: "yours";
    readonly always: "Always emailed: the receptionist must always reach someone.";
    readonly ownerChooses: "The owner chooses what the business is emailed.";
    readonly addFirst: "Add an address to email first.";
    readonly phoneTold: "Your phone is told this.";
    readonly notEmailed: "Not sent by email.";
    readonly notPushed: "Not sent to phones.";
    /** The bell's own line: what it holds that nothing else carries, and the topics that have nothing to choose here. */
    readonly bellLine: (also: readonly string[]) => string;
    readonly never: "Never sent: text messages, or a daily or weekly email. Today is your brief.";
    /** The address the alerts come from, said only where an operator set one (nothing in the app writes it). */
    readonly sentFrom: (from: string) => string;
};
/** Why the business's email ticks cannot be pressed just now, if they cannot: the role, a config that cannot be read, no address. */
type EmailHeld = "role" | "broken" | "no_address" | null;
/** One cell of the grid: always emailed, not sent this way, a tick (on or off, pressable or held), or told with no choice. */
type AlertCell = {
    kind: "always";
} | {
    kind: "none";
} | {
    kind: "tick";
    on: boolean;
    held: EmailHeld;
} | {
    kind: "told";
};
interface AlertGridRow {
    topic: AlertTopic;
    email: AlertCell;
    /** Null where the member has no phone: the column is not drawn. */
    phone: AlertCell | null;
}
interface AlertGridGroup {
    group: AlertGroup;
    title: string;
    rows: AlertGridRow[];
}
/**
 * The grid as the page draws it: each topic in its group, its email cell by the business's choice and who may change
 * it, its phone cell by the member's own (`phone` null where they have no phone; `choosable` false where the choice
 * cannot be saved yet, so a phone cell says what it is told and offers nothing).
 */
declare function alertGrid(o: {
    notifications: {
        email_off?: readonly unknown[] | null;
    } | null | undefined;
    emailHeld: EmailHeld;
    phone: {
        pushOff: readonly string[];
        choosable: boolean;
    } | null;
}): AlertGridGroup[];
/** What the bell's line names for this member, besides its own: the topics with nothing to choose (`onBell`). */
declare function bellLineFor(hasPhone: boolean): string;
/** A phone as the page names it: what it is, and when it was last seen, never its token. */
declare function phoneLine(p: {
    platform: string;
    last_seen_at: string | null;
}, now: number): string;

declare const ALERT_ADDRESSES_MIN = 1;
/** The section as anything holding it reads it: the list may be missing on a config never saved. */
type AlertSection = {
    escalation_emails?: readonly string[] | null;
} | null | undefined;
/** The addresses alerts go to, trimmed and lowercased; empty for none. */
declare function alertAddressesOf(notifications: AlertSection): Set<string>;
/** Whether this address is emailed when the receptionist needs a person. */
declare function memberGetsAlerts(email: string | null | undefined, notifications: AlertSection): boolean;
/** Why a change to the list was refused, in the words a page says it in. */
declare const ALERT_REFUSED_WORDS: {
    readonly last: "Someone has to get alerts. Add another address on Notifications first.";
    readonly full: "Alerts go to 10 addresses at most. Take one off on Notifications first.";
    readonly address: "That doesn't look like an email address.";
};
type AlertRefusal = keyof typeof ALERT_REFUSED_WORDS;
/**
 * The section with this address on the list (`on`) or off it: the rest of the section as it was. `changed` is false
 * where the list already said so. Refused: taking off the last address, adding an eleventh, an empty address.
 */
declare function withAlertAddress<S extends {
    escalation_emails?: readonly string[] | null;
}>(notifications: S | null | undefined, email: string | null | undefined, on: boolean): {
    ok: true;
    changed: boolean;
    notifications: Omit<S, "escalation_emails"> & {
        escalation_emails: string[];
    };
} | {
    ok: false;
    reason: AlertRefusal;
};

export { ALERT_ADDRESSES_MIN, ALERT_PANE_WORDS, ALERT_REFUSED_WORDS, type AlertCell, type AlertGridGroup, type AlertTopic, type EmailHeld, alertAddressesOf, alertGrid, bellLineFor, memberGetsAlerts, phoneLine, withAlertAddress, withTopicEmail, withTopicPush };
