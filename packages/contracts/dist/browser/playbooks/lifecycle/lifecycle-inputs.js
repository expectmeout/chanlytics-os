import { appointmentWordOf } from "../../journey/appointment-word.js";
import { PEOPLE_LISTS } from "../../people/lists/lists.js";
import { campaignDayWords, campaignEnded, campaignRunsOn, localDate, nextRunLabel } from "../playbook-schedule.js";
import { PLAYBOOK_TRIGGERS, momentOffered, triggerOf, triggerOffered, triggerWords } from "../playbook-triggers.js";
import { LIFECYCLE_WORDS } from "./lifecycle-words.js";
const ZONE_UNSAID = "America/New_York";
function businessShapeOf(pb) {
  const calendarOn = (pb.calendar ?? "none") !== "none";
  return {
    calendar: calendarOn ? "feed" : pb.bookings_by_email === true ? "email" : "none",
    hasDeals: pb.has_deals === true,
    word: appointmentWordOf(pb.appointment_word ?? null)
  };
}
function listNameOf(p, pb) {
  if (p.list_key)
    return (pb.people_lists ?? []).find((l) => l.key === p.list_key)?.label ?? PEOPLE_LISTS.find((l) => l.id === p.list_key)?.label ?? null;
  return (pb.lists ?? []).find((l) => l.id === p.list_id)?.name ?? null;
}
function triggerLabelOf(p, pb, word) {
  if (p.trigger === "saved_list")
    return listNameOf(p, pb) ?? (pb.lists === null ? "A list that could not be read" : "A list that was deleted");
  const t = triggerOf(p.trigger);
  return t ? triggerWords(t, word).label : p.trigger;
}
function cardReadOf(p, pb, at) {
  const last = campaignEnded(p, localDate(at.tz, at.now));
  const ended = last ? campaignDayWords(last, at.tz, at.now) : null;
  return {
    // Its list was archived (00169): paused until the list is restored or the playbook moved to another.
    listArchived: p.trigger === "saved_list" && !!(pb.lists ?? []).find((l) => l.id === p.list_id)?.archived,
    triggerLabel: triggerLabelOf(p, pb, at.shape.word),
    // While the workspace is paused no time is promised: the card says so instead of "tomorrow 10:00 AM".
    next: nextRunLabel(p, at.tz, at.now, pb.ready?.paused === true),
    // Why it runs nothing here: the card says it, and every rule of the home that skips what runs nothing skips it.
    off: ended ? LIFECYCLE_WORDS.ended(ended) : null,
    ended,
    runs: campaignRunsOn(p, { tz: at.tz, now: at.now })
  };
}
export function lifecyclePlaybooksOf(pb, now) {
  const shape = businessShapeOf(pb);
  const timezone = pb.timezone || ZONE_UNSAID;
  const moments = PLAYBOOK_TRIGGERS.filter((t) => triggerOffered(t));
  const here = { calendarOn: shape.calendar === "feed" };
  return {
    shape,
    timezone,
    cards: pb.playbooks.map((p) => ({ playbook: p, read: cardReadOf(p, pb, { tz: timezone, now, shape }) })),
    moments: moments.map((t) => ({ trigger: t, offered: momentOffered(t, here) })),
    countsRead: moments.every((t) => t.kind === "saved" || !!pb.pools?.[t.id])
  };
}
export function whatsappLineOf(channels) {
  return channels?.find((c) => c.kind === "whatsapp" && c.status === "active") ?? null;
}
