/**
 * What each figure counts, in the words an owner reads over it: the kit's Figure draws one as the tooltip on its label (what
 * is counted, and what is not). One definition per metric id (report-tiles.ts), and `Record` makes a figure with no
 * definition a compile error, so the page never says a number it has not said the meaning of (the lenses spec, §7). The
 * words follow the SQL each figure is read from: `report_series` and `metrics_summary` (00304, with 00303's connected call,
 * first moment and first reply), `campaign_series` (00329) and Google's own count (google.ts). Where a window is a number
 * of days, it is the constant the report counts by, never a second spelling of it.
 */
import { DELIVERY_RECEIPTS_WORDS, REPLY_WINDOW_WORDS } from "../broadcasts/run-words";
import type { ReportMetric } from "./report-tiles";

const METRIC_WORDS: Record<ReportMetric, string> = {
  customer_messages:
    "Messages your customers sent you, on every channel. A call, a message sent to them, and history brought in from before Chanlytics are not counted.",
  answered_share:
    "Of the customer messages that came in, the share whose first reply was the receptionist's. A message you answered first, and one nobody answered, are not the receptionist's; a broadcast or a playbook message is nobody's answer.",
  reply_median:
    "The middle time from a customer's message to the receptionist's first reply, including the hold you set before replies go out. A message you answered first, or that nobody answered, is not counted.",
  handovers:
    "How many times the receptionist stopped and held a conversation for you, counted when it stopped, whatever the reason. A conversation held twice counts twice.",
  calls:
    "Calls to the receptionist that someone spoke on. A call that rang out or dropped before anyone spoke is not counted.",
  new_people:
    "People whose first message, in either direction, or first connected call fell in this period. People brought in with their history, people who asked to be forgotten, and people with no message or call yet are not counted.",
  booked:
    "Of the people who wrote or called in this period, how many have an appointment ahead on your calendar, or one that began no more than a day before they asked. It is a dash where no calendar is connected or it could not be read.",
  messages_sent:
    "Messages your broadcasts and playbook runs sent in this period, on every channel, one for each person reached. A reply you or the receptionist wrote is not counted.",
  delivered_share: `Of the messages sent, the share the channel reports as delivered or read (${DELIVERY_RECEIPTS_WORDS}). A message with no receipt yet is not counted as delivered.`,
  replied_share: `Of the messages sent, the share the person answered in their own words ${REPLY_WINDOW_WORDS}. A note the system wrote, and a program writing from their address, are not their words.`,
  said_yes:
    "People who said yes to being messaged in this period, in their own words or recorded at the desk, counted once a day each.",
  asked_to_stop:
    "People who asked to stop being messaged in this period, by STOP, an unsubscribe link or at the desk, counted once a day each.",
  rating:
    "Your Google rating as of the last check: the average of every rating Google holds for your listing, not only this period's.",
  reviews: "How many ratings Google counts for your listing as of the last check, with words or without.",
  ratings_gained:
    "How many ratings Google's count rose by in this period, from the daily checks Chanlytics keeps: new ratings, with words or without. It needs two days of readings.",
  newest_review:
    "The newest of the five reviews Google shows for your listing, and when it was written. Google shows five at most.",
};

/** The words over a figure's label: what it counts and what it leaves out. */
export const metricWordsOf = (metric: ReportMetric): string => METRIC_WORDS[metric];
