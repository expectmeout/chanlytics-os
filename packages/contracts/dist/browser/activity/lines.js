import { activitySubjectHome, workspaceChangeDoor } from "./subjects.js";
import {
  CALL_MISSED_WORDS,
  CALL_UNANSWERED_WORDS,
  REACH_OUT_EMAILED_WORDS,
  activityKindWords
} from "../workspace/activity.js";
const rows = (many) => ({ counts: "rows", many });
const subjects = (many) => ({ counts: "subjects", many });
const FOLD_WORDS = {
  // decisions: what one member, or the receptionist, did again and again
  approve: rows((n) => `Approved ${n} replies`),
  edit: rows((n) => `Edited ${n} replies`),
  reply: rows((n) => `Replied ${n} times from the dashboard`),
  archive: subjects((n) => `Archived ${n} threads`),
  wake: subjects((n) => `Woke ${n} threads`),
  resolve: rows((n) => `Resolved ${n} escalations`),
  open_recording: subjects((n) => `Listened to ${n} calls' recordings`),
  whisper: rows((n) => `Whispered to the phone receptionist ${n} times`),
  consent_change: rows((n) => `Recorded ${n} consent answers`),
  // One row per part of fifty (00170): the parts are one import, and each part's counts are a press away.
  import: rows((n) => `Imported people from a spreadsheet, in ${n} parts`),
  // events: the day's routine
  "message.received": rows((n) => `${n} messages came in`),
  "message.sent": rows((n) => `${n} messages went out`),
  "contact.added": subjects((n) => `${n} people were added`),
  "contact.named": subjects((n) => `${n} people were named`),
  "contact.business_linked": subjects((n) => `${n} people were linked to a business`),
  "contact.business_unlinked": subjects((n) => `${n} people were unlinked from a business`),
  "contact.noted": rows((n) => `${n} notes were written`),
  "contact.note_changed": rows((n) => `${n} notes were changed`),
  "contact.note_removed": rows((n) => `${n} notes were taken away`),
  "contact.note_seen": rows((n) => `${n} notes were read by the ones they were for`),
  "contact.note_suggested": rows((n) => `The receptionist suggested ${n} notes`),
  "contact.note_kept": rows((n) => `${n} suggested notes were kept`),
  "contact.note_dismissed": rows((n) => `${n} suggested notes were dismissed`),
  "settings.fact_suggested": rows((n) => `The receptionist suggested ${n} notes from your corrections`),
  "settings.fact_kept": rows((n) => `${n} notes from corrections were kept`),
  "settings.fact_dismissed": rows((n) => `${n} notes from corrections were dismissed`),
  "settings.fix_kept": rows((n) => `${n} changes from rehearsals were kept`),
  "ask.memory_kept": rows((n) => `Ask kept ${n} things to remember`),
  "ask.memory_changed": rows((n) => `${n} things Ask remembers were changed`),
  "ask.memory_forgotten": rows((n) => `${n} things Ask remembered were forgotten`),
  "contact.note_done": rows((n) => `${n} steps were done`),
  "contact.note_undone": rows((n) => `${n} steps were opened again`),
  "contact.consent_changed": rows((n) => `${n} consent answers changed`),
  "contact.email_set": subjects((n) => `${n} people's email addresses changed`),
  "conversation.reopened": subjects((n) => `${n} threads reopened`),
  "conversation.pause_expired": rows((n) => `${n} pauses ended`),
  "conversation.snooze_expired": rows((n) => `${n} snoozes ended`),
  // A call that never connected is not one that was recorded: each says its own, and folds with its own.
  "call.recorded": {
    counts: "subjects",
    split: (row) => row.text,
    many: (n, newest) => newest.text === CALL_MISSED_WORDS ? `${n} calls were missed` : newest.text === CALL_UNANSWERED_WORDS ? `${n} calls we placed did not connect` : `${n} calls were recorded`
  },
  "lead.kept": subjects((n) => `${n} leads were kept from Needs review`),
  "lead.excluded": subjects((n) => `${n} leads were left out of Needs review`),
  "lead.put_back": subjects((n) => `${n} leads were put back in Needs review`),
  // What was decided is the sentence, so each decision folds with its own: "… was skipped · 40 times".
  "reach_out.send_decided": {
    counts: "rows",
    split: (row) => row.text,
    many: (n, newest) => `${newest.text} \xB7 ${n} times`
  },
  "appointment.booked": rows((n) => `${n} bookings arrived by email`),
  "lead.emailed": {
    counts: "subjects",
    split: (row) => row.text,
    many: (n, newest) => newest.text === REACH_OUT_EMAILED_WORDS ? `${n} emails went to leads` : `${n} leads were marked as emailed`
  },
  "lead.call": rows((n) => `${n} calls to leads were logged`),
  "google.reviews": rows((n) => `New Google reviews were read ${n} times`),
  "playbook.run": rows((n) => `Campaigns ran ${n} times`)
};
export const ACTIVITY_FOLD_KINDS = Object.keys(FOLD_WORDS);
const FOLD_MIN = 2;
const handOf = (r) => r.actor_user_id ?? r.actor_type ?? "";
function lineKey(r, day) {
  const words = FOLD_WORDS[r.kind];
  if (!words) return `@${r.id}`;
  return [day, r.kind, handOf(r), words.split ? words.split(r) : ""].join("|");
}
function foldTitle(members, words) {
  const newest = members[0];
  if (!newest) return "";
  const n = words.counts === "rows" ? members.length : new Set(members.map((m) => m.subject_id ? `${m.subject_type ?? ""}:${m.subject_id}` : `@${m.id}`)).size;
  return n === 1 ? `${activityKindWords(newest.kind)} \xB7 ${members.length} times` : words.many(n, newest);
}
export function activityLines(list, dayOf, fold = true) {
  const order = [];
  const byKey = /* @__PURE__ */ new Map();
  for (const r of list) {
    const k = fold ? lineKey(r, dayOf(r.at)) : `@${r.id}`;
    const bucket = byKey.get(k);
    if (bucket) bucket.push(r);
    else {
      byKey.set(k, [r]);
      order.push(k);
    }
  }
  const lines = [];
  for (const k of order) {
    const members = byKey.get(k) ?? [];
    const newest = members[0];
    if (!newest) continue;
    const words = FOLD_WORDS[newest.kind];
    if (!words || members.length < FOLD_MIN) {
      for (const r of members) lines.push({ key: r.id, row: r, count: 1, title: null, members: [r], since: null });
      continue;
    }
    lines.push({
      key: k,
      row: newest,
      count: members.length,
      title: foldTitle(members, words),
      members,
      since: members[members.length - 1]?.at ?? null
    });
  }
  return lines;
}
export function activityRowsForLines(list, dayOf, max, fold = true) {
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    if (!r) continue;
    const k = fold ? lineKey(r, dayOf(r.at)) : `@${r.id}`;
    if (seen.has(k)) continue;
    if (seen.size >= max) return i;
    seen.add(k);
  }
  return list.length;
}
export function activityDoor(r) {
  const home = activitySubjectHome(r.subject_type);
  if (home && "door" in home) return home.door(r.subject_id);
  return (r.subject_type === "workspace" || r.subject_type === "tenant") && r.kind ? workspaceChangeDoor(r.kind) : null;
}
export function activityMemberWords(row, about) {
  if (!about) return row.text;
  return row.text === activityKindWords(row.kind) ? about : `${row.text} \xB7 ${about}`;
}
