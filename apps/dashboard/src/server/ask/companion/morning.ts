import "server-only";
import {
  ASK_LANGUAGES,
  ASK_MORNING_CARDS_MAX,
  ASK_MORNING_QUESTION,
  ASK_MORNING_WORDS,
  ASK_TURN_BUDGET_MS,
  MIN_MS,
  askCardLapsed,
  dayInZone,
  roleAtLeast,
  type AskLanguage,
  type AskMorningCard,
  type AskMorningDto,
  type AskProposal,
} from "@chanlytics/contracts";
import { askCardsTold, askFirstAnswer, askMorningOf, askMorningWrite, type Json } from "@chanlytics/db";
import type { RouteContext } from "../../with-route";
import type { Member } from "../../route";
import { env } from "../../env";
import { log } from "../../log";
import { serviceDb } from "../../service-db";
import { load, readerContext } from "../../readers";
import * as readers from "../../readers/facts";
import { createThread } from "../store";
import { finishAskTurn, prepareAskTurn } from "../turn";

/**
 * Ask speaks first (decision 0070; contracts ask-memory/morning.ts says what Today shows): once a day, when a member who
 * acts arrives on Today, the page asks for the morning (POST ask/morning). The day is claimed through the morning's door,
 * once a member a day; the call that wins runs one Ask turn as the member, after the response has gone, in a thread of
 * their own titled with the day, asking ASK_MORNING_QUESTION in the member's language; then the door records how many
 * cards wait, and the member's own bell says so. Today reads it back (GET ask/morning): the newest answer's Say and the
 * cards still waiting and fresh, at most three. Off unless ASK_MORNINGS says on: nothing is claimed or spent.
 */

/** Whether the member may have a morning: mornings on, and a member who acts (a viewer approves nothing). */
const morningOffered = (member: Pick<Member, "role">): boolean =>
  env.ASK_MORNINGS === "on" && roleAtLeast(member.role, "operator");

/** A morning claimed this long ago with no answer stopped somewhere: the turn's budget and a minute to save it. */
const MORNING_STALE_MS = ASK_TURN_BUDGET_MS + MIN_MS;

/** The workspace's today, by its own clock: what a morning is claimed and read under. */
async function workspaceDay(ctx: RouteContext, member: Member, nowMs: number): Promise<string> {
  const { timezone } = (await load(readerContext(ctx, member), readers.facts, undefined)).data;
  return dayInZone(timezone || "UTC", nowMs).key;
}

/** The answer's Say as stored (content.answer, v2), or nothing. */
function morningSay(answer: Json | null): { headline: string; detail: string } {
  const say =
    answer && typeof answer === "object" && !Array.isArray(answer) && answer.say && typeof answer.say === "object"
      ? (answer.say as Record<string, unknown>)
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
 * The cards Today offers: those nobody has pressed yet, or whose press failed (offered again, as the Line offers Try
 * again), still fresh enough to approve, the first three.
 */
function waitingCards(proposals: Json | null, nowMs: number): AskMorningCard[] {
  const stored: unknown[] = Array.isArray(proposals) ? proposals : [];
  return stored
    .filter(isCard)
    .filter((p) => (!p.outcome || p.outcome.state === "failed") && !askCardLapsed(p, nowMs))
    .slice(0, ASK_MORNING_CARDS_MAX)
    .map(({ outcome: _, ...card }) => card);
}

/** The member's morning of today as Today reads it. */
export async function morningOf(ctx: RouteContext, member: Member, nowMs: number): Promise<AskMorningDto> {
  const day = await workspaceDay(ctx, member, nowMs);
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
  };
  if (!offered) return none;
  const row = await askMorningOf(ctx.supabase, member.tenantId, ctx.userId, day);
  if (!row) return none;
  const stalled = nowMs - Date.parse(row.made_at) > MORNING_STALE_MS;
  const running: AskMorningDto = { ...none, state: stalled ? "failed" : "writing", thread_id: row.thread_id };
  if (!row.thread_id) return running;
  const answer = await askFirstAnswer(ctx.supabase, row.thread_id);
  if (!answer) return running;
  if (answer.failed) return { ...running, state: "failed", message_id: answer.id };
  const cards = waitingCards(answer.proposals, nowMs);
  const made = Array.isArray(answer.proposals) && answer.proposals.length > 0;
  return {
    ...none,
    state: made ? "ready" : "quiet",
    thread_id: row.thread_id,
    message_id: answer.id,
    ...morningSay(answer.answer),
    cards,
  };
}

/** The language a morning is asked in: the page's, where it names one Ask speaks; else English. */
export function morningLanguage(raw: unknown): AskLanguage {
  return typeof raw === "string" && (ASK_LANGUAGES as readonly string[]).includes(raw) ? (raw as AskLanguage) : "en";
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
 * Nothing it fails at is the page's: the morning reads as failed once it has stalled (morningOf), and the log says why.
 */
async function runMorning(
  ctx: RouteContext,
  member: Member,
  m: { day: string; language: AskLanguage; title: string },
): Promise<void> {
  const tenantId = member.tenantId;
  try {
    const thread = await createThread(ctx, tenantId, m.title, null);
    await askMorningWrite(ctx.supabase, tenantId, m.day, { act: "thread", threadId: thread.id });
    const prepared = await prepareAskTurn(ctx, member, {
      text: ASK_MORNING_QUESTION,
      threadId: thread.id,
      scope: null,
      surface: "today",
      context: null,
      openedMs: null,
      answering: null,
      language: m.language,
    });
    const done = await finishAskTurn(prepared, () => {});
    const cards = done.result.failed
      ? 0
      : Math.min(done.message.proposals.filter((p) => !p.outcome).length, ASK_MORNING_CARDS_MAX);
    const answered = await askMorningWrite(ctx.supabase, tenantId, m.day, { act: "answered", cards });
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
  if (!morningOffered(member)) return { morning: await morningOf(ctx, member, nowMs), run: null };
  const day = await workspaceDay(ctx, member, nowMs);
  const claim = await askMorningWrite(ctx.supabase, member.tenantId, day, { act: "claim" });
  if (claim.refused || !claim.claimed) return { morning: await morningOf(ctx, member, nowMs), run: null };
  const morning: AskMorningDto = {
    day,
    state: "writing",
    offered: true,
    thread_id: null,
    message_id: null,
    headline: "",
    detail: "",
    cards: [],
  };
  return {
    morning,
    run: runMorning(ctx, member, { day, language: ask.language, title: morningTitle(day, ask.locale) }),
  };
}
