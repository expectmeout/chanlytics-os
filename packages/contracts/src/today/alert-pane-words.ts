/**
 * What Settings › Notifications says (decision 0040), apart from the table of what each notice kind is and how it travels
 * (notification-kinds.ts): the pane's own words, read by the pane and by the bell's line.
 */
import { ALERT_ADDRESSES_MAX } from "../config/workspace-config/alerts";
import { BELL_LIST_ROWS, BELL_WINDOW_DAYS } from "./push";

/**
 * The sentences the page says around its rows. Every one is here, so a test reads the page's words where they are
 * decided.
 */
export const ALERT_PANE_WORDS = {
  where: "Where alerts reach you",
  whereSub: "The bell keeps everything. Choose what else reaches you below.",
  bell: "Bell",
  bellValue: `Everything below, for ${BELL_WINDOW_DAYS} days · the newest ${BELL_LIST_ROWS} listed`,
  bellOn: "Always on",
  email: "Email",
  emailNobody: "Nobody yet",
  emailNobodyHint: "Until one is added, nobody is emailed when a customer needs a person.",
  emailMore: (n: number) => (n === 1 ? "and 1 more" : `and ${n} more`),
  change: "Change",
  done: "Done",
  you: "you",
  notOnTeam: "Not on the team",
  onTeam: "On the team",
  addPlaceholder: "name@yourbusiness.com",
  addLabel: "Add an address to email",
  teammates: "Teammates not emailed:",
  emailFoot: `Each address gets what is ticked under Email. Up to ${ALERT_ADDRESSES_MAX}.`,
  test: "Send a test",
  testing: "Sending…",
  testSent: (n: number) => (n === 1 ? "A test was sent to 1 address." : `A test was sent to ${n} addresses.`),
  testNot: (reason: "no_address" | "not_live" | "not_sent" | null) =>
    reason === "no_address"
      ? "There is no address to send a test to."
      : reason === "not_live"
        ? "Tests are sent from the live app only, not from a preview."
        : "Couldn't send the test. Try again in a minute.",
  phone: (n: number) => (n > 1 ? "Phones" : "Phone"),
  phoneHint: "Signing out on a phone stops its alerts.",
  browser: "This browser",
  /**
   * What reaches this browser and when, by how it gets there (decision 0137, the one switch): the server tells the
   * browser itself, Chanlytics open or closed (`push`), or this page alerts while it is open in a tab (`tab`), where the
   * browser or the deployment has no push.
   */
  browserValue: (by: "push" | "tab"): string =>
    by === "push" ? "Alerts as they happen" : "When someone needs you right now",
  browserHint: (by: "push" | "tab"): string =>
    by === "push" ? "Even when Chanlytics is closed." : "While Chanlytics is open in a tab.",
  browserBlocked:
    "Your browser is blocking alerts from Chanlytics. Allow them in its settings for this site, then switch this on.",
  /** An iPhone tells a site nothing until the site is on its Home Screen: said in the switch's place. */
  browserHomeScreen: "To be told on this iPhone, add Chanlytics to your Home Screen first.",
  what: "What you're told about",
  whatSub: "Tick where else each one reaches you. Email is the business's, and your phone is yours.",
  emailHead: "Email",
  emailHeadSub: "for the business",
  phoneHead: "Phone",
  phoneHeadSub: "yours",
  always: "Always emailed: AI must always reach someone.",
  ownerChooses: "The owner chooses what the business is emailed.",
  addFirst: "Add an address to email first.",
  /** A tick held while the last change saves. */
  saving: "Still saving the last change.",
  /** The workspace's settings could not be read: nothing on the pane can change until they are mended. */
  broken: "Couldn't load this workspace's settings. Chanlytics has to fix them before anything here can change.",
  phoneTold: "Your phone is told this.",
  notEmailed: "Not sent by email.",
  notPushed: "Not sent to phones.",
  /** The bell's own line: what it holds that nothing else carries, and the topics that have nothing to choose here. */
  bellLine: (also: readonly string[]) => {
    const all = [
      ...also,
      "people added from your calendar",
      "a booking that arrives",
      "a booking email that needs a look",
      "the day's numbers for leads at 6 PM",
      "a problem with a line",
      "a teammate who joins or leaves",
      "invitations not yet accepted",
    ];
    return `Also on the bell: ${all.slice(0, -1).join(", ")}, and ${all[all.length - 1]}.`;
  },
  never: "Never sent: text messages, or a daily or weekly email. Today is your brief.",
  /** The address the alerts come from, said only where an operator set one (nothing in the app writes it). */
  sentFrom: (from: string) => `Sent from ${from}.`,
} as const;
