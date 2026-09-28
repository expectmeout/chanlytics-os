/**
 * What Settings › Notifications says the workspace is told, and when: the kinds of email the edge really sends,
 * grouped, each with the words of when it is sent. No switch is offered that no code reads (settings.jsx's own rule),
 * so these are rows, not choices. "To Chanlytics" marks the platform's alerts, which no workspace's addresses receive.
 */
export interface NotificationKindRow {
  title: string;
  /** When it is sent, in a sentence: the row's tip. */
  what: string;
  /** Sent to Chanlytics, not to the workspace's addresses. */
  platform?: true;
}

export interface NotificationKindGroup {
  title: string;
  rows: NotificationKindRow[];
}

export const NOTIFICATION_KIND_GROUPS: readonly NotificationKindGroup[] = [
  {
    title: "Customers",
    rows: [
      {
        title: "A customer needs a person",
        what: "It stopped on a thread and someone is waiting. The alert carries their message.",
      },
      { title: "Still waiting", what: "A handoff has gone unanswered for a while." },
      { title: "After every phone call", what: "Who called, how long, how it went." },
      { title: "A reply failed to send", what: "It wrote an answer and the channel refused it." },
    ],
  },
  {
    // Reach out, Part 5 (N2): what a reach-out tells its owner, each the moment it happens.
    title: "Reach-outs",
    rows: [
      {
        title: "They wrote back",
        what: "A business answered a reach-out: what the reply was read as, what was done, and the receptionist's draft when it wrote one.",
      },
      {
        title: "A reach-out waits for you",
        what: "A run is planned and waits for your yes before anything sends.",
      },
      {
        title: "A reach-out holds an email for you",
        what: "The check held an email of a run it could not pass, and it waits for your call.",
      },
      {
        title: "A sending domain is held, and when it sends again",
        what: "A domain stopped sending (bounces, a complaint, its records), which stops its runs; and when it sends again.",
      },
    ],
  },
  {
    // A switched-off number has no workspace to address, and a stalled sweep belongs to nobody's workspace. Listing
    // them beside "goes to each of these addresses" without saying so promised an email the owner never receives.
    title: "To Chanlytics",
    rows: [
      {
        title: "Messages arriving for a switched-off number",
        what: "Someone is texting a channel this workspace switched off. Goes to Chanlytics, not to the addresses above: a switched-off number has no workspace to alert.",
        platform: true,
      },
      {
        title: "Background checks",
        what: "When the watchdog over unanswered threads stops, and when it recovers. Goes to Chanlytics, not to the addresses above.",
        platform: true,
      },
    ],
  },
];
