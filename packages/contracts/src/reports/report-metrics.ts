/**
 * What each figure counts, in the words an owner reads over it: the kit's Figure draws one as the tooltip on its label (what
 * is counted, and what is not). One definition per metric id (report-tiles.ts), and `Record` makes a figure with no
 * definition a compile error, so the page never says a number it has not said the meaning of (the lenses spec, §7). The
 * words follow the SQL each figure is read from: `report_series` and `metrics_summary` (00304, with 00303's connected call,
 * first moment and first reply), `campaign_series` (00329), `receptionist_series` (00380), Google's own count (google.ts) and
 * the reviews on record (review-report.ts). Where a window is a number of days (or an hour), it is the constant the report
 * counts by, never a second spelling of it.
 */
import { DELIVERY_RECEIPTS_WORDS, REPLY_WINDOW_WORDS } from "../broadcasts/run-words";
import { MISSED_CALL_TOUCH_WORDS } from "./receptionist/receptionist-record";
import type { ReportMetric } from "./report-tiles";

const METRIC_WORDS: Record<ReportMetric, string> = {
  customer_messages:
    "Messages your customers sent you, on every channel. A call, a message sent to them, and history brought in from before Chanlytics are not counted.",
  answered_share:
    "Of the customer messages that came in, the share whose first reply was the receptionist's. A message you answered first, and one nobody answered, are not the receptionist's; a broadcast or a campaign message is nobody's answer.",
  reply_median:
    "The middle time from a customer's message to the receptionist's first reply, including the hold you set before replies go out. A message you answered first, or that nobody answered, is not counted.",
  handovers:
    "How many times the receptionist stopped and held a conversation for you, counted when it stopped, whatever the reason. A conversation held twice counts twice.",
  calls:
    "Calls to the receptionist that connected. A call that rang out or dropped before anyone spoke is not counted.",
  new_people:
    "People whose first message in their own words, or first connected call to you, fell in this period, counted once. A message you or the receptionist sent, an automatic reply or a list's mail, a call you placed, people brought in with their history, people who asked to be forgotten, and people who have not written or phoned yet are not counted.",
  booked:
    "Of the people who wrote or called in this period, how many have an appointment ahead on your calendar, or one that began no more than a day before they asked. It is a dash where no calendar is connected or it could not be read.",
  messages_sent:
    "Messages your broadcasts and campaign runs sent in this period, on every channel, one for each person reached. A reply you or the receptionist wrote is not counted.",
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
  reviews_written:
    "Reviews written in this period, with words or without, by the day Google dates them, from your Business Profile. A review Google later removes stays on record and is still counted.",
  reviews_answered:
    "Of the reviews written in this period, how many have a reply on Google, from you or the receptionist. A review with no reply yet is not answered. A reply counts as the receptionist's where the last reply Chanlytics recorded under the review was its own; every other reply is yours, written here or on Google.",
  review_reply_time:
    "The middle time from a review being written to its reply, over this period's reviews that have one. A reply you changed later counts from the change. It needs three replies to be said.",
  handover_first_reply:
    "The middle time from the receptionist handing a conversation to you, over the handovers that wanted a message, to the first message a person sent in it that went out. A handover for an opt-out or a call-back (which wants none), one nobody has replied to yet, and a message the system sent are not counted.",
  handover_settled:
    "The middle time from the receptionist handing a conversation to you to its being settled, over this period's handovers that have been. A handover for an opt-out or a call-back, one still open, and one settled before settling was recorded are not counted.",
  missed_calls_answered: `Of the people who rang in this period and found nobody (the call never connected, or reached voicemail), how many you or the receptionist reached within ${MISSED_CALL_TOUCH_WORDS}, by a message that went out or a call that got through. A person counts once, at their first such call; a call the receptionist placed, a person whose call is under ${MISSED_CALL_TOUCH_WORDS} old, and a call with no caller on record are not counted.`,
  answered_while_closed:
    "Of the customer messages that came in while your opening hours and closures say you were closed, how many the receptionist answered first. A message that came while you were open, one you answered first, and one nobody answered are not counted as answered. It is a dash until you set your opening hours.",
  waiting_on_you:
    "Conversations the receptionist flagged for a person that nobody has taken, as of now, whatever period is picked. One you or a teammate has taken over, and one put aside until later, are not counted.",
  call_backs:
    "Of the conversations waiting on you, the ones where the customer asked to be rung back, as of now, whatever period is picked. A call-back someone has taken over, or put aside until later, is not counted.",
  replies_held_back:
    "Replies the receptionist wrote in this period that the send door refused, such as a person having the thread or the customer having asked to stop. A reply you cancelled or a person answered first, which the hold counts, and a broadcast or campaign message the door held are not counted.",
  people_reached:
    "People who wrote in their own words, or phoned and were spoken to, in this period, counted once however often they did. An automatic reply, a message or call you placed, a call that rang out, people brought in with their history, and people who asked to be forgotten are not counted.",
  yeses_won:
    "The yeses people gave in this period, one for each person and each kind of message (their visit, offers, offers by email), in their own words or recorded at the desk. A merge restating a yes, a client list imported, which never records a yes, a person who asked to be forgotten, and a record merged into another are not counted.",
  stops_recorded:
    "The stops people gave in this period, one for each person and each kind of message they stopped, by their own STOP, an unsubscribe link, a complaint, the carrier or at the desk. A merge restating a stop, the end of a yes to offers that a STOP brings with it, a person who asked to be forgotten, and a record merged into another are not counted.",
  steps_overdue:
    "People whose earliest open step has a day before today, as of now, whatever period is picked. A step with no day, a step already done, and a later step of the same person are not counted.",
  steps_due_today:
    "People whose earliest open step has today for its day, as of now, whatever period is picked. A step with no day, a step already done, and a later step of the same person are not counted.",
  email_stopped_now:
    "People whose email address bounced for good, drew a complaint or was stopped by the email provider, as of now, whatever period is picked, so mail to it is no longer sent. A phone number that does not work, which Chanlytics does not record, is not counted.",
  said_yes_messages:
    "People on your Said yes to messages list, as of now, whatever period is picked: the answer People shows them, whenever it was given. A person who has asked to stop since, one on do-not-contact, and one who has not answered are not counted.",
  can_receive_offers:
    "People on your Can receive offers list, as of now, whatever period is picked: they said yes to offers and can be reached on a channel you send on now. A yes with no number or address to send to, a channel you have not connected, and a person who asked to stop are not counted.",
  opted_out_now:
    "People on your Opted out list, as of now, whatever period is picked: they asked to stop being messaged, or are on do-not-contact, whenever that was. A person who has said yes again since and is not on do-not-contact is not counted.",
  quiet_now:
    "People whose last message or call to you was more than 30 days ago, as of now, whatever period is picked. Your own messages are not theirs, and a person who has never written or phoned is not counted.",
};

/** The words over a figure's label: what it counts and what it leaves out. */
export const metricWordsOf = (metric: ReportMetric): string => METRIC_WORDS[metric];
