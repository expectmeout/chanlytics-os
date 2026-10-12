import "server-only";
import { z } from "zod";
import {
  ACTIVITY_ACTORS,
  ACTIVITY_FAMILIES,
  ACTIVITY_KINDS,
  ACTIVITY_NOISE_KINDS,
  ACTIVITY_NOISE_PREFIXES,
  ACTIVITY_PROBLEM_KINDS,
  DECISION_VERBS,
  activityFamilyKinds,
  activityLines,
  activityWords,
  isActivityNoise,
  isUuid,
  memberWords,
  shiftKey,
  visitDateKey,
  visitRoute,
  zoneDayKey,
  zoneMidnight,
  type ActivityActor,
  type ActivityFamily,
  type ActivityMemberDto,
  type ActivityPageDto,
  type ActivityRowDto,
} from "@chanlytics/contracts";
import { activitySubjects } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { tenantFacts } from "@/server/tenant";
import { teamRoster } from "@/server/workspace/team";

/** Rows per read, over both ledgers merged. */
const ACTIVITY_PAGE = 100;

/**
 * How many rows past the page each ledger reads, so that rows sharing the
 * cursor's exact instant can be dropped without losing the ones behind them,
 * and so the merge of two ledgers always has enough of each to fill a page. A
 * boundary with fifty rows written at one microsecond does not happen; a
 * handful written in one transaction does.
 */
const TIE_SLACK = 50;

/**
 * A page is a hundred rows, and reads on while those fold to fewer lines than this (contracts activityLines), up to
 * ACTIVITY_MAX_READS reads. A hundred recordings opened in one minute are one line: a page that stopped there was one
 * line and a "Show more", and the next was the same line again (8 Oct 2026). An ordinary page folds to more lines than
 * this and costs the one read it always did.
 */
const ACTIVITY_MIN_LINES = 25;
const ACTIVITY_MAX_READS = 5;

/** A day as the route takes one: "YYYY-MM-DD". */
const DAY_ASKED = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The filter as GET activity takes it, checked (and Ask's workspace.activity, which reads the same log): a person's
 * id, a kind as the ledgers spell it, a family of kinds, only what went wrong, who did it, a day or a span of days,
 * and where the last page ended.
 */
export const ActivityQuerySchema = z.object({
  person: z.string().uuid().optional(),
  kind: z
    .string()
    .max(60)
    .regex(/^[a-z_.]+$/)
    .optional(),
  family: z.enum(ACTIVITY_FAMILIES).optional(),
  only: z.literal("problems").optional(),
  actor: z.union([z.uuid(), z.enum(ACTIVITY_ACTORS)]).optional(),
  day: z.string().regex(DAY_ASKED).optional(),
  from: z.string().regex(DAY_ASKED).optional(),
  to: z.string().regex(DAY_ASKED).optional(),
  // "<created_at>|<row id>", as a page hands back in next_cursor: the instant
  // exactly as the row carries it, a bar, then `d-` or `e-` and the ledger
  // row's own id. The zone suffix is optional because it is PostgREST's to
  // spell -- "…+00:00", "…Z" or neither -- and a cursor the page was just
  // handed must not come back refused. It is never parsed, only compared to
  // created_at, so the shape is all this has to hold.
  cursor: z
    .string()
    .max(120)
    .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-][\d:]+)?\|[de]-[\w-]+$/)
    .optional(),
});

export interface ActivityFilter {
  /** A person: their own rows, and those of their threads and calls. */
  person?: string;
  /** A verb or an event kind, exactly. Naming one shows it even when it is noise, and its rows are never folded. */
  kind?: string;
  /** Every kind of one family (contracts activityFamily); the kept records only under their own family. */
  family?: ActivityFamily;
  /** Only what failed or was stopped (contracts ACTIVITY_PROBLEM_KINDS). */
  only?: "problems";
  /** Who did it: a member's user id, the receptionist, or the system by itself. */
  actor?: string;
  /** YYYY-MM-DD, by the workspace's clock. */
  day?: string;
  /** A span of days by the workspace's clock, both ends included; either end alone is open on the other side. */
  from?: string;
  to?: string;
  /** Where the last page ended: "<created_at>|<row id>". Everything newer is already read. */
  cursor?: string;
}

/** Where a page ended: the last row's instant and its id. */
interface Cut {
  at: string;
  id: string;
}

/** Newest first, and a row's id breaks a tie -- so the order is the same on both sides of a page edge. */
const newestFirst = (a: Cut, b: Cut): number => {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
};

/**
 * Which kinds a read is narrowed to, ledger by ledger: null is every kind (less the noise, for events), and an empty
 * list is a ledger with nothing to say, which is not read at all.
 */
interface Narrowed {
  verbs: string[] | null;
  kinds: string[] | null;
}

const VERBS = new Set<string>(DECISION_VERBS);

function narrowedTo(f: ActivityFilter): Narrowed {
  // A kind by name is asked of both ledgers as it always was: a kind this build does not know is still a row.
  if (f.kind) return { verbs: [f.kind], kinds: [f.kind] };
  const named = f.family
    ? activityFamilyKinds(f.family).filter((k) => f.family === "records" || !isActivityNoise(k))
    : f.only === "problems"
      ? [...ACTIVITY_PROBLEM_KINDS]
      : null;
  if (!named) return { verbs: null, kinds: null };
  return { verbs: named.filter((k) => VERBS.has(k)), kinds: named.filter((k) => !VERBS.has(k)) };
}

const isActor = (v: string): v is ActivityActor => (ACTIVITY_ACTORS as readonly string[]).includes(v);

/** The stored hand each actor that is not a member is: the receptionist is `ai`, the system `system`. */
const ACTOR_TYPE: Record<ActivityActor, string> = { receptionist: "ai", system: "system" };

/** The member an event's own data names (`by`, contracts event-data.ts), where it names one. */
function eventBy(data: unknown): string | null {
  const by = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).by : null;
  return typeof by === "string" && isUuid(by) ? by : null;
}

/** What one read is asked for: the workspace, the filter as parsed, and what it resolves to. */
interface Ask {
  ctx: RouteContext;
  tenantId: string;
  f: ActivityFilter;
  narrowed: Narrowed;
  range: { from: string | null; to: string | null } | null;
  subjects: string[] | null;
}

/** One read of the decisions ledger from `cut`; nothing where the filter leaves it nothing to say. */
async function decisionsFrom(a: Ask, cut: Cut | null): Promise<ActivityRowDto[]> {
  const { f, narrowed, range, subjects } = a;
  if (narrowed.verbs?.length === 0) return [];
  let q = a.ctx.supabase
    .from("decisions")
    .select("id, verb, subject_type, subject_id, actor_type, actor_user_id, payload, created_at")
    .eq("tenant_id", a.tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACTIVITY_PAGE + 1 + TIE_SLACK);
  if (narrowed.verbs)
    q = narrowed.verbs.length === 1 ? q.eq("verb", narrowed.verbs[0] ?? "") : q.in("verb", narrowed.verbs);
  if (f.actor) q = isActor(f.actor) ? q.eq("actor_type", ACTOR_TYPE[f.actor]) : q.eq("actor_user_id", f.actor);
  if (range?.from) q = q.gte("created_at", range.from);
  if (range?.to) q = q.lt("created_at", range.to);
  // lte, not lt: a row written in the same microsecond as the cursor's is
  // still ahead of it in the order, and the merge's own filter is what drops it.
  if (cut) q = q.lte("created_at", cut.at);
  if (subjects) q = q.in("subject_id", subjects);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: `d-${d.id}`,
    at: d.created_at,
    source: "decision" as const,
    kind: d.verb,
    subject_type: d.subject_type,
    subject_id: d.subject_id,
    actor_user_id: d.actor_user_id,
    actor_type: d.actor_type,
    text: activityWords(d.verb, d.payload),
    category: null,
  }));
}

/**
 * One read of the events ledger from `cut`. An event has no hand of its own, so the receptionist and the system
 * narrow it to nothing; a member narrows it to the events whose data names them (`by`).
 */
async function eventsFrom(a: Ask, cut: Cut | null): Promise<ActivityRowDto[]> {
  const { f, narrowed, range, subjects } = a;
  if (narrowed.kinds?.length === 0 || (f.actor && isActor(f.actor))) return [];
  let q = a.ctx.supabase
    .from("events")
    .select("id, kind, category, subject_type, subject_id, data, created_at")
    .eq("tenant_id", a.tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACTIVITY_PAGE + 1 + TIE_SLACK);
  if (narrowed.kinds) {
    q = narrowed.kinds.length === 1 ? q.eq("kind", narrowed.kinds[0] ?? "") : q.in("kind", narrowed.kinds);
  } else {
    for (const p of ACTIVITY_NOISE_PREFIXES) q = q.not("kind", "like", `${p}%`);
    for (const k of ACTIVITY_NOISE_KINDS) q = q.neq("kind", k);
  }
  if (f.actor) q = q.filter("data->>by", "eq", f.actor);
  if (range?.from) q = q.gte("created_at", range.from);
  if (range?.to) q = q.lt("created_at", range.to);
  if (cut) q = q.lte("created_at", cut.at);
  if (subjects) q = q.in("subject_id", subjects);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (
    (data ?? [])
      // Belt and braces for a database that answers the like() differently: the rule, in code too.
      .filter((e) => narrowed.kinds !== null || !isActivityNoise(e.kind))
      .map((e) => {
        const by = eventBy(e.data);
        return {
          id: `e-${e.id}`,
          at: e.created_at,
          source: "event" as const,
          kind: e.kind,
          subject_type: e.subject_type,
          subject_id: e.subject_id,
          // The member an event's data names did it (contact.added's `by`, a consent answer's): the log says who.
          actor_user_id: by,
          actor_type: by ? "user" : null,
          text: activityWords(e.kind, e.data),
          category: e.category,
        };
      })
  );
}

/** One read of both ledgers from `cut`, merged: a page of rows, and whether more is behind it. */
async function readFrom(a: Ask, cut: Cut | null): Promise<{ rows: ActivityRowDto[]; more: boolean }> {
  const [decisions, events] = await Promise.all([decisionsFrom(a, cut), eventsFrom(a, cut)]);
  const merged = [...decisions, ...events].sort(newestFirst);
  const after = cut ? merged.filter((r) => newestFirst(r, cut) > 0) : merged;
  return { rows: after.slice(0, ACTIVITY_PAGE), more: after.length > ACTIVITY_PAGE };
}

/** The span of instants a day, or a span of days, covers by the workspace's clock; null for no day asked. */
function rangeOf(f: ActivityFilter, timezone: string): Ask["range"] {
  const from = f.day ?? f.from ?? null;
  const to = f.day ?? f.to ?? null;
  if (!from && !to) return null;
  return {
    from: from ? new Date(zoneMidnight(timezone, from)).toISOString() : null,
    to: to ? new Date(zoneMidnight(timezone, shiftKey(to, 1))).toISOString() : null,
  };
}

/** A person's subjects: themselves, and their threads and calls (a decision on a conversation names the conversation). */
async function subjectsOf(ctx: RouteContext, tenantId: string, person: string): Promise<string[]> {
  const sb = ctx.supabase;
  const [convs, calls] = await Promise.all([
    sb.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", person),
    sb.from("calls").select("id").eq("tenant_id", tenantId).eq("contact_id", person),
  ]);
  if (convs.error) throw new Error(convs.error.message);
  if (calls.error) throw new Error(calls.error.message);
  return [person, ...(convs.data ?? []).map((c) => c.id), ...(calls.data ?? []).map((k) => k.id)];
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
 *
 * Paged by a CURSOR, not by an offset. Offsets made every page read the whole
 * log above it -- both ledgers were asked for `offset + limit` rows, merged,
 * sorted and then cut, so the fifth page read a thousand rows to show a
 * hundred, and the tenth read two thousand. A cursor asks each ledger for one
 * page from where the last one ended, so the fiftieth page costs what the
 * first one did.
 *
 * A page says what its rows are about by name and where they open (packages/db activitySubjects), who did them (the roster), and
 * reads on while its rows fold to a handful of lines (ACTIVITY_MIN_LINES).
 */
export async function activityLog(ctx: RouteContext, tenantId: string, f: ActivityFilter): Promise<ActivityPageDto> {
  const sb = ctx.supabase;
  const bar = f.cursor ? f.cursor.indexOf("|") : -1;
  const first: Cut | null = bar > 0 && f.cursor ? { at: f.cursor.slice(0, bar), id: f.cursor.slice(bar + 1) } : null;

  // The roster goes out WITH the ledgers rather than after them. It used to
  // wait for the merge to know whether any row had a member on it, which put a
  // whole round trip end to end on a page that nearly always has one -- and on
  // the page a person is already waiting in front of. A roster that refuses
  // still refuses the read where a row names a member; the catch is for the
  // case where none does and nothing awaits it at all.
  const roster = teamRoster(sb, tenantId);
  roster.catch(() => {});
  // The workspace's zone decides where a day starts: for a day asked for, and for the lines a page folds to. A log
  // with no day asked reads it beside its first page, never before it.
  const zone = tenantFacts(sb, tenantId).then((t) => t.timezone);
  zone.catch(() => {});
  const [subjects, zoneFirst] = await Promise.all([
    f.person ? subjectsOf(ctx, tenantId, f.person) : null,
    f.day || f.from || f.to ? zone : null,
  ]);
  const range = zoneFirst ? rangeOf(f, zoneFirst) : null;
  const ask: Ask = { ctx, tenantId, f, narrowed: narrowedTo(f), range, subjects };

  const page: ActivityRowDto[] = [];
  let cut = first;
  let more = true;
  for (let read = 0; read < ACTIVITY_MAX_READS && more; read += 1) {
    const [got, timezone] = await Promise.all([readFrom(ask, cut), zone]);
    page.push(...got.rows);
    more = got.more;
    const end = got.rows[got.rows.length - 1];
    if (!end) break;
    cut = { at: end.at, id: end.id };
    const dayOf = (at: string): string => zoneDayKey(Date.parse(at), timezone);
    if (activityLines(page, dayOf, !f.kind).length >= ACTIVITY_MIN_LINES) break;
  }

  // Who: the member's name, else the address they signed in with. Owners read
  // this route, and the roster is theirs to see.
  const actors: Record<string, string> = {};
  const ids = new Set(page.map((r) => r.actor_user_id).filter((id): id is string => !!id));
  const about = page.flatMap((r) =>
    r.subject_type && r.subject_id ? [{ type: r.subject_type, id: r.subject_id }] : [],
  );
  const [team, said, timezone] = await Promise.all([
    ids.size
      ? roster.then((r) => r.members)
      : roster.then(
          (r) => r.members,
          () => [],
        ),
    activitySubjects(sb, tenantId, about),
    zone,
  ]);
  const members: ActivityMemberDto[] = team.map((m) => ({
    id: m.userId,
    name: memberWords({ email: m.email, display_name: m.displayName }).name,
  }));
  for (const m of members) if (ids.has(m.id)) actors[m.id] = m.name;
  const last = page[page.length - 1];
  return {
    rows: page,
    actors,
    subjects: said.names,
    // A message and an escalation open their thread, a deal its person, a visit its panel on its day (by the
    // business's clock), a template its message in the Library (by its name): the pages the row's own subject cannot name.
    doors: {
      ...Object.fromEntries(Object.entries(said.threads).map(([key, id]) => [key, `inbox/th-${id}`])),
      ...Object.fromEntries(Object.entries(said.people).map(([key, id]) => [key, `clients/${id}`])),
      ...Object.fromEntries(
        Object.entries(said.visits).map(([key, start]) => [
          key,
          visitRoute(key.slice(key.indexOf(":") + 1), visitDateKey(start, timezone)),
        ]),
      ),
      ...Object.fromEntries(Object.entries(said.library).map(([key, name]) => [key, `campaigns/message:${name}`])),
    },
    members,
    page: { limit: ACTIVITY_PAGE, has_more: more, next_cursor: last ? `${last.at}|${last.id}` : null },
    kinds: [...ACTIVITY_KINDS],
  };
}
