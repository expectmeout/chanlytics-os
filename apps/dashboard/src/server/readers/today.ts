import "server-only";
import {
  NEED_YOU_DONE_VERBS,
  type CallDto,
  type ConversationDto,
  type EscalationDto,
  type LeadSearchDto,
  type MetricsSummaryDto,
  type FormHeldDto,
  type FormOpenRequestDto,
  type PreviewTriedDto,
  type TodayAiReadDto,
  type TodayPeopleDto,
  lookedAtOf,
  parseTenantConfigResult,
  todayPeopleOf,
} from "@chanlytics/contracts";
import { listBookedByAiSince } from "@chanlytics/db/calendar";
import { getTodayDoneCount } from "@chanlytics/db/people";
import { findConfigRow } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import { memberViews } from "./notifications";
import type { GoingRunRow, WaitingRunRow } from "@chanlytics/db/campaigns";
import { load, readerStamp, type Reader, type ReaderContext } from "../shared/reader";
import { goingRuns, waitingRuns } from "./broadcasts";
import { findHeldThreadsBeyond } from "./inbox";
import { metrics } from "./metrics";
import { conversations } from "./conversations";
import { escalations } from "./escalations";
import { calls } from "./calls";
import { searches } from "./searches";
import { formRequestsOpen } from "./forms";
import { previewsTried } from "./leads";
import * as facts from "./facts";
import { people, peopleCount } from "./people";
import { PEOPLE_PAGE } from "../people/people";
import { log } from "@/server/shared/log";

interface TodayRead {
  metrics: MetricsSummaryDto;
  /** The newest hundred, as the Today page reads them. */
  conversations: ConversationDto[];
  /** The open escalations, newest first: one whose thread is not among the hundred is still a customer waiting. */
  escalations: Array<EscalationDto & { conversation_id: string }>;
  /** Null: the calls read failed, which is its own state on the page, never none. */
  calls: CallDto[] | null;
  /** Null: the searches read failed, and the queue says nothing about them. */
  searches: LeadSearchDto[] | null;
  /** The runs waiting for a word (toTodayVM counts those that still wait: runsThatWait); null where the read failed. */
  runs: WaitingRunRow[] | null;
  /** The threads of open holds past the hundred, read by their ids; null where that read failed. */
  heldThreads: ConversationDto[] | null;
  /** The runs set to go on their own in the next day (decision 0064: Going today); null where the read failed. */
  going: GoingRunRow[] | null;
  /** The leads who tried their own receptionist lately (decision 0079); null where the read failed. */
  previewsTried: PreviewTriedDto[] | null;
  /** The requests sent through a form that nobody has answered (00680); null where the read failed. */
  formRequests: FormOpenRequestDto[] | null;
  /** Each form's entries held for a look that nobody has looked at in three days (the same read); null: not read. */
  formHeld: FormHeldDto[] | null;
  /** What Today says of AI beside the day (Working for you, W1 to W3): each part null where its read failed. */
  ai: TodayAiReadDto;
}

/** The most visits AI booked today that Today carries: the AI sheet names the newest, and counts since a look. */
const BOOKED_BY_AI_MAX = 50;

/**
 * What Today says of AI beside the day's read (contracts today/ai.ts): the visits AI booked since the business's midnight,
 * whether Stop everything is on, and when this member last looked at Today. Each is additive: one that fails is null and
 * logged, and the day stands.
 */
async function aiBeside(rc: ReaderContext, since: string): Promise<TodayAiReadDto> {
  const db = rc.ctx.supabase;
  const [booked, stopped, looked] = await Promise.all([
    listBookedByAiSince(db, rc.tenantId, since, BOOKED_BY_AI_MAX)
      .then((rows) => rows.map(({ client_name, ...row }) => ({ ...row, who: client_name })))
      .catch(logAndGoOn("today's AI bookings", null)),
    findConfigRow(db, rc.tenantId)
      .then(({ data }) => {
        const parsed = parseTenantConfigResult(data?.config ?? null);
        return parsed.ok ? !!parsed.config.ask?.stopped : null;
      })
      .catch(logAndGoOn("today's stop", null)),
    load(rc, memberViews, undefined)
      .then((views) => lookedAtOf(views.data))
      .catch(logAndGoOn("today's last look", null)),
  ]);
  return { booked, stopped, looked_at: looked };
}

/**
 * How many things the members dealt with today (db getTodayDoneCount), by Need you's door; null, logged, where it could not be
 * read. The business's day starts where metrics_summary says it does (its `window.since`, as the bookings' count reads
 * it), the read the day already makes (shared through the turn): no row of the workspace's is read again for it, and the
 * day's start is not worked out a second time here. The page's alone (GET today's route reads it beside the day): Ask's
 * day does not say it.
 */
export async function findDoneToday(rc: ReaderContext): Promise<number | null> {
  try {
    const { window } = (await load(rc, metrics, { days: 1 })).data.metrics;
    return await getTodayDoneCount(rc.ctx.supabase, {
      tenantId: rc.tenantId,
      since: window.since,
      verbs: NEED_YOU_DONE_VERBS,
    });
  } catch (err) {
    log.error("today_done_fetch_failed", { tenant_id: rc.tenantId, error: err });
    return null;
  }
}

/**
 * Today, as the page makes the day (GET today, Today in three zones: one request where the page made six) and as Ask
 * reads it: the day's metrics, the newest hundred conversations, the open escalations, the calls, the searches and the
 * runs waiting for approval, read at once; then, only where an open hold's thread is outside the hundred, those threads
 * by their ids (findHeldThreadsBeyond, the Inbox's own read, which the turn cache shares). Every part but the first three is
 * additive, as on the page: a failed read is null, logged under the page's own event, and the rest stands (a hold whose
 * thread was not read counts as waiting). The requests sent through a form that nobody has answered ride the same way. The brief is then said with the runs and the held threads beside it
 * (toTodayVM's `beside`), so Ask's Today counts what the badge counts (the wiring's second audit, S7-1 and S7-7). What the
 * page alone says beside the day (done today, the workspace's word) GET today's route reads.
 */
export const today: Reader<undefined, TodayRead> = {
  name: "today",
  async read(rc) {
    const [m, c, e, k, s, r, g, t, f] = await Promise.all([
      load(rc, metrics, { days: 1 }),
      load(rc, conversations, { ids: null }),
      load(rc, escalations, { state: "open" }),
      load(rc, calls, {}).catch((err: unknown) => {
        log.error("today_calls_fetch_failed", { error: err });
        return null;
      }),
      load(rc, searches, undefined).catch((err: unknown) => {
        log.error("today_searches_fetch_failed", { error: err });
        return null;
      }),
      load(rc, waitingRuns, undefined).catch((err: unknown) => {
        log.error("today_runs_fetch_failed", { error: err });
        return null;
      }),
      load(rc, goingRuns, undefined).catch((err: unknown) => {
        log.error("today_runs_fetch_failed", { error: err });
        return null;
      }),
      load(rc, previewsTried, undefined).catch((err: unknown) => {
        log.error("today_previews_fetch_failed", { error: err });
        return null;
      }),
      load(rc, formRequestsOpen, undefined).catch((err: unknown) => {
        log.error("today_form_requests_fetch_failed", { error: err });
        return null;
      }),
    ]);
    const [held, ai] = await Promise.all([
      findHeldThreadsBeyond(rc, c.data.conversations, e.data.escalations),
      aiBeside(rc, m.data.metrics.window.since),
    ]);
    if (held.threads === null) log.error("today_held_threads_fetch_failed", { asked: held.missing.length });
    return {
      data: {
        metrics: m.data.metrics,
        conversations: c.data.conversations,
        escalations: e.data.escalations,
        calls: k ? k.data.calls : null,
        searches: s ? s.data.searches : null,
        runs: r ? r.data.runs : null,
        heldThreads: held.threads,
        going: g ? g.data.runs : null,
        previewsTried: t ? t.data.previews : null,
        formRequests: f ? f.data.requests : null,
        formHeld: f ? f.data.held : null,
        ai,
      },
      rows: [...c.rows, ...(k?.rows ?? []), ...(r?.rows ?? []), ...(g?.rows ?? [])],
      stamp: readerStamp(),
    };
  },
};

/**
 * What Today draws from People, as its first read carries it (GET today/people; contracts today/people.ts): People's lists
 * counted as the rail counts them, how many are in People, and the people Ask found's checks and To do's steps due can
 * name, so neither waits for People's whole book (Today knows its shape at its first draw, 13 Nov 2026). Worked out over
 * People's first page, read as GET contacts reads it, with the same arguments: a turn that answers both (GET open, which
 * opens Today) reads People once. For the member asking, at the turn's moment, in the business's zone. A workspace-wide
 * read of People, so no row of its own: the people it names are People's rows, cited where People is read.
 *
 * Where People holds more than a page, all it says is how many there are (`whole: false`), which the page's own count
 * says (readers/people.ts peopleCount, the turn's one count, which the page reads beside its rows): it answers once the
 * count is in, and waits for none of the page's thousand rows, their appointments or what the member has seen of them,
 * which it would not say (16 Nov 2026). The page is started with the count all the same, so where People holds one page
 * it waits for nothing more than it did, and a turn that answers GET contacts too (GET open) still reads People once.
 */
export const todayPeople: Reader<undefined, TodayPeopleDto> = {
  name: "todayPeople",
  async read(rc) {
    const page = load(rc, people, { q: null, offset: 0, after: null, thread: null }).then((r) => r.data);
    // Held from now: a page that fails while the count answers on its own is no unhandled refusal.
    page.catch(() => {});
    const [total, zone] = await Promise.all([
      load(rc, peopleCount, { q: null }).then((r) => r.data),
      load(rc, facts.facts, undefined).then((r) => r.data.timezone),
    ]);
    // More than a page, as the page's own read tells it (has_more: a full page with more counted than it holds).
    if (total > PEOPLE_PAGE) return { data: { whole: false, total }, rows: [], stamp: readerStamp() };
    const first = await page;
    return {
      data: todayPeopleOf(
        first,
        { whole: !first.page.has_more, total: first.page.total },
        { tz: zone, now: rc.now, viewer: rc.userId },
      ),
      rows: [],
      stamp: readerStamp(),
    };
  },
};
