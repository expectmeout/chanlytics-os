import "server-only";
import {
  ASK_FOUND_VIEW,
  ASK_LANGUAGES,
  ASK_LATELY_DAYS,
  ASK_MORNING_CARDS_MAX,
  ASK_MORNING_EDITED_QUESTION,
  ASK_MORNING_QUESTION,
  ASK_MORNING_WORDS,
  ASK_TURN_BUDGET_MS,
  DAY_MS,
  MIN_MS,
  askCardLapsed,
  dayAfterDays,
  dayInZone,
  ideasSeenOf,
  ideasWithResults,
  latelyRows,
  latelySaid,
  restedOf,
  roleAtLeast,
  settledTitles,
  type AskIdeaSeen,
  type AskLanguage,
  type AskMorningCard,
  type AskMorningDto,
  type AskProposal,
  recordOrEmpty,
  isOneOf,
} from "@chanlytics/contracts";
import { askCardsTold, getMemberViews } from "@chanlytics/db/notices";
import { askFirstAnswer, askMorningOf, askMorningsSince, askMorningWrite } from "@chanlytics/db/ask";
import { batchStatesOf, getHeldSends } from "@chanlytics/db/campaigns";
import type { Json } from "@chanlytics/db/types";
import type { RouteContext } from "../../shared/with-route";
import type { Member } from "../../shared/route";
import { env } from "../../shared/env";
import { log } from "../../shared/log";
import { serviceDb } from "../../shared/service-db";
import { load, readerContext, type ReaderContext } from "../../shared/reader";
import { getEditedSince } from "../tools/read/sequences";
import * as readers from "../../readers/facts";
import { createThread } from "../store";
import { finishAskTurn, prepareAskTurn } from "../turn";
import { listFindingCards, getSequencesAndRuns } from "./findings";

/**
 * Ask speaks first (decision 0070; contracts ask/memory/morning.ts says what Today shows): once a day, when a member who
 * acts arrives on Today, the page asks for the morning (POST ask/morning). The day is claimed through the morning's door,
 * once a member a day; the call that wins runs one Ask turn as the member, after the response has gone, in a thread of
 * their own titled with the day, asking ASK_MORNING_QUESTION in the member's language; then the door records how many
 * cards wait, and the member's own bell says so. Today reads it back (GET ask/morning): the cards still waiting and
 * fresh, at most three, which Ask found ranks; the answer's Say rides along for either deploy order, and since Today in
 * three zones (2 Nov 2026) the question asks it for no more than how many cards it made. Off unless ASK_MORNINGS says
 * on: nothing is claimed or spent.
 *
 * Since decision 0087 a morning is told what every member's mornings offered lately, Today leaves out what was settled
 * or has moved on, and what Ask noticed from the workspace's own facts is read beside it, whatever state the morning is in.
 */

/** Whether the member may have a morning: mornings on, and a member who acts (a viewer approves nothing). */
const morningOffered = (member: Pick<Member, "role">): boolean =>
  env.ASK_MORNINGS === "on" && roleAtLeast(member.role, "operator");

/** A morning claimed this long ago with no answer stopped somewhere: the turn's budget and a minute to save it. */
const MORNING_STALE_MS = ASK_TURN_BUDGET_MS + MIN_MS;

/** The workspace's zone and today, by its own clock: what a morning is claimed and read under. */
async function workspaceClock(
  ctx: RouteContext,
  member: Member,
  nowMs: number,
): Promise<{ timezone: string; day: string }> {
  const { timezone } = (await load(readerContext(ctx, member), readers.facts, undefined)).data;
  const zone = timezone || "UTC";
  return { timezone: zone, day: dayInZone(zone, nowMs).key };
}

/** What every member's mornings offered lately: read with the service client, a morning's rows being its member's. */
async function seenLately(ctx: RouteContext, member: Member, day: string): Promise<AskIdeaSeen[]> {
  try {
    const mornings = await askMorningsSince(serviceDb(), member.tenantId, dayAfterDays(day, -ASK_LATELY_DAYS));
    return ideasSeenOf(mornings.map((m) => ({ day: m.day, mine: m.user_id === ctx.userId, proposals: m.proposals })));
  } catch (e) {
    log.error("ask_morning_lately_unread", { tenant_id: member.tenantId, error: e });
    return [];
  }
}

/** What a morning reads around its own cards: what was offered lately, and what Today draws beside them. */
interface AroundMorning {
  seen: AskIdeaSeen[];
  beside: Pick<AskMorningDto, "findings" | "rested" | "lately">;
}

/** The morning's surroundings: each read that fails costs itself, never the morning. */
async function aroundMorning(
  ctx: RouteContext,
  member: Member,
  clock: { timezone: string; day: string },
  nowMs: number,
): Promise<AroundMorning> {
  const [read, offered, views] = await Promise.all([
    getSequencesAndRuns(ctx, member.tenantId),
    seenLately(ctx, member, clock.day),
    getMemberViews(ctx.supabase, { tenantId: member.tenantId, userId: ctx.userId }).catch(
      (e: unknown): Record<string, unknown> => {
        log.error("ask_findings_unread", { tenant_id: member.tenantId, error: e });
        return {};
      },
    ),
  ]);
  const seen = ideasWithResults(offered, read.runs);
  const rested = restedOf(views[ASK_FOUND_VIEW]);
  const findings = await listFindingCards(ctx, member, { ...clock, nowMs }, read, rested);
  return { seen, beside: { findings, rested, lately: latelyRows(seen, clock.day) } };
}

/** The answer's Say as stored (content.answer, v2), or nothing. */
function morningSay(answer: Json | null): { headline: string; detail: string } {
  const say =
    answer && typeof answer === "object" && !Array.isArray(answer) && answer.say && typeof answer.say === "object"
      ? recordOrEmpty(answer.say)
      : {};
  return {
    headline: typeof say.headline === "string" ? say.headline : "",
    detail: typeof say.detail === "string" ? say.detail : "",
  };
}

/** A stored card as Today reads it: an object with an id and a kind; anything else is no card. */
const isCard = (v: unknown): v is AskProposal =>
  !!v &&
  typeof v === "object" &&
  typeof Reflect.get(v, "id") === "string" &&
  typeof Reflect.get(v, "kind") === "string";

/**
 * The cards Today could offer: those nobody has pressed yet, or whose press failed (offered again, as the Line offers Try
 * again) unless what it was about moved on, still fresh enough to approve, and not settled on any morning lately.
 */
function waitingCards(proposals: Json | null, nowMs: number, settled: ReadonlySet<string>): AskMorningCard[] {
  const stored: unknown[] = Array.isArray(proposals) ? proposals : [];
  return stored
    .filter(isCard)
    .filter((p) => !p.outcome || (p.outcome.state === "failed" && !p.outcome.moved))
    .filter((p) => !askCardLapsed(p, nowMs) && !settled.has(p.title))
    .map(({ outcome: _, ...card }) => card);
}

/** A batch's states a card about it can still be pressed in: waiting for an OK, or set to go and not begun. */
const BATCH_STILL_OPEN: readonly string[] = ["pending_approval", "scheduled"];

/** The id a card's payload names, as text. */
const namedIn = (card: AskMorningCard, key: string): string => {
  const id = card.payload[key];
  return typeof id === "string" ? id : "";
};

/**
 * The cards whose subject is still as they found it: a batch still open and an email the check still holds, each read
 * now, so a card made this morning does not stand over what was decided since on another page. A read that fails keeps
 * the card, and the door still refuses a press of what has moved.
 */
async function stillTrue(
  ctx: RouteContext,
  tenantId: string,
  cards: readonly AskMorningCard[],
): Promise<AskMorningCard[]> {
  const batches = cards.filter((c) => c.kind === "run").map((c) => namedIn(c, "broadcast_id"));
  const sends = cards.filter((c) => c.kind === "sequence_send_decide").map((c) => namedIn(c, "send_id"));
  if (batches.length === 0 && sends.length === 0) return [...cards];
  try {
    const [states, held] = await Promise.all([
      batchStatesOf(ctx.supabase, tenantId, batches),
      getHeldSends(ctx.supabase, tenantId, sends),
    ]);
    return cards.filter((c) => {
      if (c.kind === "run") return BATCH_STILL_OPEN.includes(states.get(namedIn(c, "broadcast_id")) ?? "");
      return c.kind !== "sequence_send_decide" || held.has(namedIn(c, "send_id"));
    });
  } catch (e) {
    log.error("ask_morning_subjects_unread", { tenant_id: tenantId, error: e });
    return [...cards];
  }
}

/** The member's morning of today as Today reads it. */
export async function getMorning(ctx: RouteContext, member: Member, nowMs: number): Promise<AskMorningDto> {
  const clock = await workspaceClock(ctx, member, nowMs);
  const { day } = clock;
  const offered = morningOffered(member);
  const none: AskMorningDto = {
    day,
    state: "none",
    offered,
    thread_id: null,
    message_id: null,
    headline: "",
    detail: "",
    cards: [],
    findings: [],
    rested: {},
    lately: [],
  };
  if (!offered) return none;
  const { seen, beside } = await aroundMorning(ctx, member, clock, nowMs);
  const asOfNow: AskMorningDto = { ...none, ...beside };
  const row = await askMorningOf(ctx.supabase, member.tenantId, ctx.userId, day);
  if (!row) return asOfNow;
  const stalled = nowMs - Date.parse(row.made_at) > MORNING_STALE_MS;
  const running: AskMorningDto = { ...asOfNow, state: stalled ? "failed" : "writing", thread_id: row.thread_id };
  if (!row.thread_id) return running;
  const answer = await askFirstAnswer(ctx.supabase, row.thread_id);
  if (!answer) return running;
  if (answer.failed) return { ...running, state: "failed", message_id: answer.id };
  const waiting = waitingCards(answer.proposals, nowMs, settledTitles(seen, day));
  const cards = (await stillTrue(ctx, member.tenantId, waiting)).slice(0, ASK_MORNING_CARDS_MAX);
  const created = Array.isArray(answer.proposals) && answer.proposals.length > 0;
  return {
    ...asOfNow,
    state: created ? "ready" : "quiet",
    thread_id: row.thread_id,
    message_id: answer.id,
    ...morningSay(answer.answer),
    cards,
  };
}

/**
 * The morning's question (decision 0078 step 2): the one that reads the member's edited cold emails on a morning after
 * they edited any since yesterday, else the plain one, so a workspace that sends no cold email, or a day with no edit,
 * spends no read or round on them and hears nothing of them. A read that fails asks the plain one, and says so.
 */
export async function getMorningQuestion(
  ctx: RouteContext,
  member: Member,
  now: Date,
  rc: ReaderContext = readerContext(ctx, member, now),
): Promise<string> {
  try {
    const since = new Date(now.getTime() - DAY_MS).toISOString();
    const { edited } = await getEditedSince(rc, ctx.userId, since);
    return edited.length > 0 ? ASK_MORNING_EDITED_QUESTION : ASK_MORNING_QUESTION;
  } catch (e) {
    log.error("ask_morning_edited_unread", { tenant_id: member.tenantId, error: e });
    return ASK_MORNING_QUESTION;
  }
}

/** The language a morning is asked in: the page's, where it names one Ask speaks; else English. */
export function morningLanguage(raw: unknown): AskLanguage {
  return typeof raw === "string" && isOneOf(ASK_LANGUAGES, raw) ? raw : "en";
}

/**
 * The morning thread's title: the day, as the member's browser writes a date (`locale`, a BCP 47 tag it sent), so the
 * rail reads "Tuesday, October 21" or "martes, 21 de octubre" with no words of ours. A tag Intl does not take is en-US.
 */
function morningTitle(day: string, locale: unknown): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  // A tag Intl cannot read at all ("en_US!") is a RangeError there, and en-US here.
  let tag = "en-US";
  try {
    if (typeof locale === "string" && locale.length <= 35)
      tag = Intl.DateTimeFormat.supportedLocalesOf([locale]).at(0) ?? "en-US";
  } catch {
    tag = "en-US";
  }
  return new Intl.DateTimeFormat(tag, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    Date.UTC(y, m - 1, d),
  );
}

/**
 * The morning's turn, run once the day is claimed: the thread made and named on the day, the turn asked as the member
 * and saved as any turn is, then the waiting cards counted on the day and, when any wait, the member's own bell told.
 * Nothing it fails at is the page's: the morning reads as failed once it has stalled (getMorning), and the log says why.
 */
async function runMorning(
  ctx: RouteContext,
  member: Member,
  message: { day: string; language: AskLanguage; title: string; lately: string },
): Promise<void> {
  const tenantId = member.tenantId;
  try {
    const thread = await createThread(ctx, tenantId, message.title, null);
    await askMorningWrite(ctx.supabase, tenantId, message.day, { act: "thread", threadId: thread.id });
    const prepared = await prepareAskTurn(ctx, member, {
      text: await getMorningQuestion(ctx, member, new Date()),
      threadId: thread.id,
      scope: null,
      surface: "today",
      context: null,
      openedMs: null,
      answering: null,
      language: message.language,
      lately: message.lately,
    });
    const done = await finishAskTurn(prepared, () => {});
    const cards = done.result.failed
      ? 0
      : Math.min(done.message.proposals.filter((p) => !p.outcome).length, ASK_MORNING_CARDS_MAX);
    const answered = await askMorningWrite(ctx.supabase, tenantId, message.day, { act: "answered", cards });
    if (answered.recorded && cards > 0)
      await askCardsTold(serviceDb(), {
        tenantId,
        userId: ctx.userId,
        threadId: thread.id,
        ...ASK_MORNING_WORDS.bell(cards),
      }).catch((e: unknown) => log.error("ask_morning_told_failed", { tenant_id: tenantId, error: e }));
  } catch (e) {
    log.error("ask_morning_failed", { tenant_id: tenantId, error: e });
  }
}

/**
 * Today asks for the member's morning (POST ask/morning): the day claimed, and, for the call that won it, the turn to run
 * after the response (`run`, for the route's `after`). Every other call (a second tab, a later arrival, mornings off, a
 * member who does not act) is answered with the morning as it stands.
 */
export async function startMorning(
  ctx: RouteContext,
  member: Member,
  ask: { language: AskLanguage; locale: unknown },
  nowMs: number,
): Promise<{ morning: AskMorningDto; run: Promise<void> | null }> {
  if (!morningOffered(member)) return { morning: await getMorning(ctx, member, nowMs), run: null };
  const clock = await workspaceClock(ctx, member, nowMs);
  const { day } = clock;
  const claim = await askMorningWrite(ctx.supabase, member.tenantId, day, { act: "claim" });
  if (claim.refused || !claim.claimed) return { morning: await getMorning(ctx, member, nowMs), run: null };
  const { seen, beside } = await aroundMorning(ctx, member, clock, nowMs);
  const morning: AskMorningDto = {
    day,
    state: "writing",
    offered: true,
    thread_id: null,
    message_id: null,
    headline: "",
    detail: "",
    cards: [],
    ...beside,
  };
  return {
    morning,
    run: runMorning(ctx, member, {
      day,
      language: ask.language,
      title: morningTitle(day, ask.locale),
      lately: latelySaid(seen),
    }),
  };
}
