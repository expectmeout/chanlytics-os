import "server-only";
import {
  ACTIVITY_KINDS,
  ACTIVITY_NOISE_PREFIXES,
  activityWords,
  isActivityNoise,
  shiftKey,
  zoneMidnight,
  type ActivityPageDto,
  type ActivityRowDto,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { tenantFacts } from "@/server/tenant";
import { teamRoster } from "@/server/workspace/team";

/** Rows per page, over both ledgers merged. */
export const ACTIVITY_PAGE = 100;

/**
 * How many rows past the page each ledger reads, so that rows sharing the
 * cursor's exact instant can be dropped without losing the ones behind them,
 * and so the merge of two ledgers always has enough of each to fill a page. A
 * boundary with fifty rows written at one microsecond does not happen; a
 * handful written in one transaction does.
 */
const TIE_SLACK = 50;

export interface ActivityFilter {
  /** A person: their own rows, and those of their threads and calls. */
  person?: string;
  /** A verb or an event kind, exactly. Naming one shows it even when it is noise. */
  kind?: string;
  /** YYYY-MM-DD, by the workspace's clock. */
  day?: string;
  /** Where the last page ended: "<created_at>|<row id>". Everything newer is already read. */
  cursor?: string;
}

/** Newest first, and a row's id breaks a tie -- so the order is the same on both sides of a page edge. */
const newestFirst = (a: { at: string; id: string }, b: { at: string; id: string }): number => {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
};

/**
 * Both ledgers for one workspace, newest first, in an owner's words.
 *
 * Read under the owner's own session (decisions_member_select,
 * events_member_select). The evidence families -- usage, webhook, ingest --
 * are left out unless asked for by name: seven hundred assistant-usage rows
 * are not what "what happened this week" means. A person's rows are their
 * own and their threads' and calls', because a decision on a conversation
 * names the conversation, not the person.
 *
 * Paged by a CURSOR, not by an offset. Offsets made every page read the whole
 * log above it -- both ledgers were asked for `offset + limit` rows, merged,
 * sorted and then cut, so the fifth page read a thousand rows to show a
 * hundred, and the tenth read two thousand. A cursor asks each ledger for one
 * page from where the last one ended, so the fiftieth page costs what the
 * first one did.
 */
export async function activityLog(ctx: RouteContext, tenantId: string, f: ActivityFilter): Promise<ActivityPageDto> {
  const sb = ctx.supabase;
  const limit = ACTIVITY_PAGE;
  const bar = f.cursor ? f.cursor.indexOf("|") : -1;
  const cut = bar > 0 ? { at: f.cursor!.slice(0, bar), id: f.cursor!.slice(bar + 1) } : null;

  // The workspace's zone decides where a day starts, and nothing else here
  // needs it: a log with no day filter should not pay for that read.
  const range = f.day
    ? await (async () => {
        const { timezone } = await tenantFacts(sb, tenantId);
        return {
          from: new Date(zoneMidnight(timezone, f.day!)).toISOString(),
          to: new Date(zoneMidnight(timezone, shiftKey(f.day!, 1))).toISOString(),
        };
      })()
    : null;

  let subjects: string[] | null = null;
  if (f.person) {
    const [convs, calls] = await Promise.all([
      sb.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", f.person),
      sb.from("calls").select("id").eq("tenant_id", tenantId).eq("contact_id", f.person),
    ]);
    if (convs.error) throw new Error(convs.error.message);
    if (calls.error) throw new Error(calls.error.message);
    subjects = [f.person, ...(convs.data ?? []).map((c) => c.id), ...(calls.data ?? []).map((k) => k.id)];
  }

  // One page from each ledger, plus the room a tie at the edge needs.
  const reach = limit + 1 + TIE_SLACK;
  let dq = sb
    .from("decisions")
    .select("id, verb, subject_type, subject_id, actor_type, actor_user_id, payload, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(reach);
  let eq = sb
    .from("events")
    .select("id, kind, subject_type, subject_id, data, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(reach);
  if (f.kind) {
    dq = dq.eq("verb", f.kind);
    eq = eq.eq("kind", f.kind);
  } else {
    for (const p of ACTIVITY_NOISE_PREFIXES) eq = eq.not("kind", "like", `${p}%`);
  }
  if (range) {
    dq = dq.gte("created_at", range.from).lt("created_at", range.to);
    eq = eq.gte("created_at", range.from).lt("created_at", range.to);
  }
  if (cut) {
    // lte, not lt: a row written in the same microsecond as the cursor's is
    // still ahead of it in the order, and the filter below is what drops it.
    dq = dq.lte("created_at", cut.at);
    eq = eq.lte("created_at", cut.at);
  }
  if (subjects) {
    dq = dq.in("subject_id", subjects);
    eq = eq.in("subject_id", subjects);
  }
  // The roster goes out WITH the ledgers rather than after them. It used to
  // wait for the merge to know whether any row had a member on it, which put a
  // whole round trip end to end on a page that nearly always has one -- and on
  // the page a person is already waiting in front of. It is only awaited where
  // it was before, so a roster that refuses still refuses the read; the catch
  // is for the case where no row names a member and nothing awaits it at all.
  const roster = teamRoster(sb, tenantId);
  roster.catch(() => {});
  const [decisions, events] = await Promise.all([dq, eq]);
  if (decisions.error) throw new Error(decisions.error.message);
  if (events.error) throw new Error(events.error.message);

  const merged: ActivityRowDto[] = [
    ...(decisions.data ?? []).map((d) => ({
      id: `d-${d.id}`,
      at: d.created_at,
      source: "decision" as const,
      kind: d.verb,
      subject_type: d.subject_type,
      subject_id: d.subject_id,
      actor_user_id: d.actor_user_id,
      actor_type: d.actor_type,
      text: activityWords(d.verb, d.payload),
    })),
    ...(events.data ?? [])
      // Belt and braces for a database that answers the like() differently: the rule, in code too.
      .filter((e) => f.kind || !isActivityNoise(e.kind))
      .map((e) => ({
        id: `e-${e.id}`,
        at: e.created_at,
        source: "event" as const,
        kind: e.kind,
        subject_type: e.subject_type,
        subject_id: e.subject_id,
        actor_user_id: null,
        actor_type: null,
        text: activityWords(e.kind, e.data),
      })),
  ].sort(newestFirst);
  const after = cut ? merged.filter((r) => newestFirst(r, cut) > 0) : merged;
  const page = after.slice(0, limit);

  // Who: the member's name, else the address they signed in with. Owners read
  // this route, and the roster is theirs to see.
  const actors: Record<string, string> = {};
  const ids = new Set(page.map((r) => r.actor_user_id).filter((id): id is string => !!id));
  if (ids.size) {
    const { members } = await roster;
    for (const m of members) if (ids.has(m.userId)) actors[m.userId] = m.displayName?.trim() || m.email || "A member";
  }
  const last = page[page.length - 1];
  return {
    rows: page,
    actors,
    page: { limit, has_more: after.length > limit, next_cursor: last ? `${last.at}|${last.id}` : null },
    kinds: [...ACTIVITY_KINDS],
  };
}
