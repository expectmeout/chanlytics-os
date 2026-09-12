import "server-only";
import { ACTIVITY_KINDS, activityWords, isActivityNoise, shiftKey, zoneMidnight, type ActivityPageDto, type ActivityRowDto } from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { tenantFacts } from "@/server/tenant";
import { teamRoster } from "@/server/service";

/** Rows per page, over both ledgers merged. */
export const ACTIVITY_PAGE = 100;

export interface ActivityFilter {
  /** A person: their own rows, and those of their threads and calls. */
  person?: string;
  /** A verb or an event kind, exactly. Naming one shows it even when it is noise. */
  kind?: string;
  /** YYYY-MM-DD, by the workspace's clock. */
  day?: string;
  offset?: number;
}

/**
 * Both ledgers for one workspace, newest first, in an owner's words.
 *
 * Read under the owner's own session (decisions_member_select,
 * events_member_select). The evidence families -- usage, webhook, ingest --
 * are left out unless asked for by name: seven hundred assistant-usage rows
 * are not what "what happened this week" means. A person's rows are their
 * own and their threads' and calls', because a decision on a conversation
 * names the conversation, not the person.
 */
export async function activityLog(ctx: RouteContext, tenantId: string, f: ActivityFilter): Promise<ActivityPageDto> {
  const sb = ctx.supabase;
  const offset = f.offset ?? 0;
  const limit = ACTIVITY_PAGE;
  const { timezone } = await tenantFacts(sb, tenantId);
  const range = f.day ? { from: new Date(zoneMidnight(timezone, f.day)).toISOString(), to: new Date(zoneMidnight(timezone, shiftKey(f.day, 1))).toISOString() } : null;

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

  // Both ledgers, over-fetched to the page's end so the merge can cut one page.
  const reach = offset + limit;
  let dq = sb.from("decisions")
    .select("id, verb, subject_type, subject_id, actor_type, actor_user_id, payload, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(reach + 1);
  let eq = sb.from("events")
    .select("id, kind, subject_type, subject_id, data, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(reach + 1);
  if (f.kind) {
    dq = dq.eq("verb", f.kind);
    eq = eq.eq("kind", f.kind);
  } else {
    for (const p of ["usage.", "webhook.", "ingest."]) eq = eq.not("kind", "like", `${p}%`);
  }
  if (range) {
    dq = dq.gte("created_at", range.from).lt("created_at", range.to);
    eq = eq.gte("created_at", range.from).lt("created_at", range.to);
  }
  if (subjects) {
    dq = dq.in("subject_id", subjects);
    eq = eq.in("subject_id", subjects);
  }
  const [decisions, events] = await Promise.all([dq, eq]);
  if (decisions.error) throw new Error(decisions.error.message);
  if (events.error) throw new Error(events.error.message);

  const rows: ActivityRowDto[] = [
    ...(decisions.data ?? []).map((d) => ({
      id: `d-${d.id}`, at: d.created_at, source: "decision" as const, kind: d.verb,
      subject_type: d.subject_type, subject_id: d.subject_id, actor_user_id: d.actor_user_id, actor_type: d.actor_type,
      text: activityWords(d.verb, d.payload),
    })),
    ...(events.data ?? [])
      // Belt and braces for a database that answers the like() differently: the rule, in code too.
      .filter((e) => f.kind || !isActivityNoise(e.kind))
      .map((e) => ({
        id: `e-${e.id}`, at: e.created_at, source: "event" as const, kind: e.kind,
        subject_type: e.subject_type, subject_id: e.subject_id, actor_user_id: null, actor_type: null,
        text: activityWords(e.kind, e.data),
      })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const page = rows.slice(offset, offset + limit);

  // Who: the member's name, else the address they signed in with. Owners read
  // this route, and the roster is theirs to see.
  const actors: Record<string, string> = {};
  const ids = new Set(page.map((r) => r.actor_user_id).filter((id): id is string => !!id));
  if (ids.size) {
    const { members } = await teamRoster(sb, tenantId);
    for (const m of members) if (ids.has(m.userId)) actors[m.userId] = m.displayName?.trim() || m.email || "A member";
  }
  return { rows: page, actors, page: { offset, limit, has_more: rows.length > offset + limit }, kinds: [...ACTIVITY_KINDS] };
}
