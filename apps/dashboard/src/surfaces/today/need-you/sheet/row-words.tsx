/**
 * What a row of Need you says, whatever page draws it (moved from need-you/people-rows.tsx, 15 Nov 2026), beside its line
 * (row-line.ts): Today's queue and its sheet, and the Inbox's Needs you, which draws the rows of the one count that are no
 * conversation it holds (a search's question, a hold whose conversation it could not read), so the two say one thing in
 * one grammar (the kit's AttnRow). Kept apart from the rows' work (rows.tsx), which the Inbox never loads.
 */
import type { ReactElement } from "react";
import {
  NEED_YOU_WORDS as W,
  answerWithinMsOf,
  namesAPerson,
  needYouVerbOf,
  needYouWaitOf,
  phoneAsWritten,
  tollFreeNumber,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { AttnRow } from "../../../kit/attention/attn-row";
import { businessTrailFor } from "../../../people/business-trail";
import { surfaceValue } from "../../../surface-values";
import type { Nav } from "../../../waits/wait-rows";
import { needYouLineOf, reviewStars } from "./row-line";

/** The glyph of the wire a row came by, before what they want: the kit's Icon by the words a row shows. */
const VIA_GLYPH: Record<TodayQueueRowVM["channel"], string> = {
  WhatsApp: "chat",
  Text: "chat",
  Phone: "phone",
  Email: "mail",
  Instagram: "instagram",
  Leads: "search",
  "Next step": "check",
  Calendar: "calendar",
  Google: "star",
};

/**
 * The business's own target for answering people (Settings › Autonomy, "Answer people within"), from the settings read
 * the page borrows: a wait past it is the amber. A day until that read lands, as before an owner could set it.
 */
function answerWithin(): number {
  const reply = surfaceValue("settings")?.policies?.rows.find((r) => r.class === "reply");
  return answerWithinMsOf(reply?.limits);
}

/** How long, or a review's stars where a wait would stand. */
function waitOf(row: TodayQueueRowVM) {
  if (row.kind === "review") {
    const rating = row.review?.rating;
    return { words: [row.channel, rating ? reviewStars(rating) : ""].filter(Boolean).join(" · "), long: false };
  }
  return needYouWaitOf(row, W.held.goesAlone, answerWithin());
}

/**
 * What a row says whatever it asks: who or what, the wire for a screen reader, how long, what it is about (contracts
 * needYouLineOf, which says a to-do by its job). Someone waiting on you says no state line: how long is beside the name, and
 * why it was handed over is said beside it once the row is open (row.why), never behind a mark nobody could read (the 10/10
 * read, 2 Nov 2026). A search waiting for your OK keeps its line, as the runs beside it do ("nothing is spent while it
 * waits").
 */
export function rowWords(row: TodayQueueRowVM) {
  const face = namesAPerson(row) ? { person: { name: row.who, initials: row.initials } } : { initials: row.initials };
  const verb = needYouVerbOf(row);
  const waits = verb === "reply" || verb === "call";
  const line = needYouLineOf(row);
  return {
    ...face,
    name: line.name,
    trail: namesAPerson(row) && row.kind !== "step" ? businessTrailFor(row.person_id) : null,
    // No glyph is drawn (his call D2, 9 Nov 2026): a screen reader still hears the wire.
    via: { glyph: VIA_GLYPH[row.channel], words: [row.channel, row.via].filter(Boolean).join(", ") },
    wait: waitOf(row),
    sentence: line.sentence,
    saidTone: line.tone,
    quoted: line.quoted,
    lead: row.lead,
    status: waits ? [] : row.status,
    note: "",
    tone: row.tone,
    testid: `queue-${row.kind}`,
  };
}

/**
 * Someone past a week, as their own row says them on Today and in the Inbox's Needs you: a toll-free number says so
 * beside it, a number's face is already the phone so no wire is said twice, and how long is in the plain ink, since
 * past a week is what the row is and the amber is for who waits now.
 */
export function olderWords(row: TodayQueueRowVM) {
  const words = rowWords(row);
  return {
    ...words,
    trail: tollFreeNumber(row.phone ?? row.who) ? W.older.tollFree : words.trail,
    via: phoneAsWritten(row.who) ? null : words.via,
    wait: words.wait ? { words: words.wait.words, long: false } : null,
  };
}

/**
 * A row whose one press is its door, the verb its own (a call worth a listen, a search's question, a lead who tried, a hold
 * the page holds no conversation of): it opens where its row says, and nothing is worked in place.
 */
export function doorRow(row: TodayQueueRowVM, nav: Nav): ReactElement {
  const go = () => nav(row.cta.to);
  return (
    <AttnRow
      key={row.id}
      {...rowWords(row)}
      cta={{ label: row.cta.label, kind: "ghost", onClick: go }}
      also={null}
      onOpen={go}
    />
  );
}
