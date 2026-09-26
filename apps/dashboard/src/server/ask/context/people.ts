import "server-only";
import {
  LEAD_CLASSES,
  LEAD_LISTS,
  LeadsQuerySchema,
  ago,
  dealPaceOf,
  dealsAreOn,
  followUpStandOf,
  isDayKey,
  isPipelineView,
  leadsRoute,
  nextStepOf,
  parseLeadsRoute,
  pipelineOf,
  pipelineViewLabel,
  poolRowOf,
  toCalendarVM,
  toLeadRowVM,
  type LeadClass,
  type LeadList,
  type PersonRowDto,
  type PersonRowVM,
  type PipelineView,
} from "@chanlytics/contracts";
import { load, type ReaderContext } from "../../readers";
import * as facts from "../../readers/facts";
import { everyone as everyoneReader } from "../../readers/everyone";
import { people as peopleReader } from "../../readers/people";
import { calendar as calendarReader } from "../../readers/calendar";
import { leads as leadsReader } from "../../readers/leads";
import { searches as searchesReader } from "../../readers/searches";
import { aggregateOf, idsOf, line, pageWithView, refOf, sourceOf, type ContextRow, type Provider } from "./rows";

/**
 * The people pages, as their context: People, the Pipeline, the Calendar and Leads. Each person is read through
 * everyone (readers/everyone.ts, every page of People under the member's RLS), the Calendar's through its own board,
 * and a lead through the Leads page's own read; a row the reader did not return is absent, and nothing names it.
 */

const zone = (rc: ReaderContext) => load(rc, facts.facts, undefined).then((r) => r.data.timezone);

/** Everyone, each as People draws their row for the member asking, with no deal where deals are off. */
async function peopleRows(rc: ReaderContext) {
  const [all, sells, tz] = await Promise.all([
    load(rc, everyoneReader, undefined).then((r) => r.data),
    load(rc, facts.sellsBy, undefined).then((r) => r.data),
    zone(rc),
  ]);
  const dealsOn = dealsAreOn(sells);
  const vm = (r: PersonRowDto) => poolRowOf(r, { tz, now: rc.now, viewer: rc.userId, dealsOn });
  return { all, dealsOn, tz, vm };
}

/** A person's line as search_people says them (tools.ts personLine): name, state, its detail, last contact, next step. */
function personLine(r: PersonRowDto, vm: PersonRowVM, tz: string, nowMs: number): string {
  const last = r.last_message_at ?? r.last_call_at;
  const step = nextStepOf(r, tz, nowMs);
  return line(
    [
      vm.name,
      vm.stateLabel,
      vm.stateDetail,
      last ? `last contact ${ago(Date.parse(last), tz, nowMs)}` : null,
      step ? `${step.words} · ${step.day.words}` : null,
    ],
    `clients/${r.id}`,
  );
}

/** People: the people on the list the page drew, and how many there are in all. */
export const people: Provider = async (rc, ctx) => {
  const { all, tz, vm } = await peopleRows(rc);
  const byId = new Map(all.map((r) => [r.id, r]));
  const rows: ContextRow[] = [];
  for (const { id } of idsOf(ctx, "person")) {
    const r = byId.get(id);
    if (!r) continue;
    const v = vm(r);
    rows.push({
      source: sourceOf("person", id),
      title: v.name,
      text: personLine(r, v, tz, rc.now.getTime()),
      ref: refOf("person", id, v.name),
    });
  }
  return {
    rows,
    aggregate: aggregateOf([`${pageWithView(ctx)}: ${rows.length} people on screen`, `people: ${all.length}`]),
  };
};

/**
 * The Pipeline: the rows the page drew, each in its group with its deal, and the line over the table, as the page
 * builds it (contracts pipelineOf over People's rows, each row's follow-up and the workspace's pace from People's first
 * page). Where deals are off the Pipeline's address draws People, and so does this.
 */
export const pipeline: Provider = async (rc, ctx) => {
  const { all, dealsOn, tz, vm } = await peopleRows(rc);
  if (!dealsOn) return people(rc, ctx);
  const first = (await load(rc, peopleReader, { q: null, offset: 0 })).data;
  const pace = dealPaceOf(first.deal_pace);
  const nowMs = rc.now.getTime();
  const fu = first.follow_up;
  const rowsVm = all.map((r) => {
    const v = vm(r);
    return fu ? { ...v, followUp: followUpStandOf(v, fu, tz, nowMs, pace) } : v;
  });
  const whole = pipelineOf(rowsVm, nowMs, tz, pace);
  const found = new Map(whole.groups.flatMap((g) => g.rows.map((row) => [row.id, { row, group: g.label }] as const)));
  const rows: ContextRow[] = [];
  for (const { id } of idsOf(ctx, "person")) {
    const hit = found.get(id);
    if (!hit) continue;
    const { row, group } = hit;
    rows.push({
      source: sourceOf("person", id),
      title: row.name,
      text: line(
        [
          row.name,
          group,
          row.service,
          row.value,
          row.inStage,
          row.chip?.words,
          row.next ? `${row.next.words} · ${row.next.when}` : null,
        ],
        `clients/${id}`,
      ),
      ref: refOf("person", id, row.name),
    });
  }
  const asked = (ctx.view ?? "").replace(/:search$/, "");
  const view: PipelineView = isPipelineView(asked) ? asked : "all";
  return {
    rows,
    aggregate: aggregateOf([
      `Pipeline, ${pipelineViewLabel(view, pace)}: ${rows.length} on screen`,
      ...whole.summary,
      ...whole.groups.map((g) => `${g.label}: ${g.count}`),
    ]),
  };
};

/** The Calendar's span from its view, "2026-09-21/7"; none is the page's own week. */
function spanOf(view: string | null | undefined): { from: string | null; days: number } {
  const m = /^(\d{4}-\d{2}-\d{2})\/(\d{1,2})$/.exec(view ?? "");
  if (!m || !isDayKey(m[1])) return { from: null, days: 7 };
  return { from: m[1], days: Math.min(14, Math.max(1, Number(m[2]))) };
}

/** The Calendar: the people its board names in the span the page drew, each with what they have on it, and the span. */
export const calendar: Provider = async (rc, ctx) => {
  const vm = toCalendarVM((await load(rc, calendarReader, spanOf(ctx.view))).data.calendar, rc.now);
  const named = new Map<string, { name: string; on: string[] }>();
  for (const d of vm.days)
    for (const b of [...d.allDay, ...d.blocks])
      if (b.person) {
        const had = named.get(b.person.id) ?? { name: b.person.name, on: [] };
        had.on.push(`${d.long} ${b.time} ${b.title}`.trim());
        named.set(b.person.id, had);
      }
  const rows: ContextRow[] = [];
  for (const { id } of idsOf(ctx, "person")) {
    const p = named.get(id);
    if (!p) continue;
    rows.push({
      source: sourceOf("person", id),
      title: p.name,
      text: line([p.name, ...p.on], `clients/${id}`),
      ref: refOf("person", id, p.name),
    });
  }
  const taken = vm.days.reduce((n, d) => n + d.allDay.length + d.blocks.length, 0);
  const open = vm.days.reduce((n, d) => n + d.windows.length, 0);
  const closed = vm.days.filter((d) => d.closed.yes).map((d) => d.long);
  return {
    rows,
    aggregate: aggregateOf([
      `Calendar, ${vm.rangeLabel}`,
      vm.feed.line,
      `taken: ${taken}`,
      `open times: ${open}`,
      closed.length ? `closed: ${closed.join(", ")}` : null,
    ]),
  };
};

/** Leads' view from its address and the page's view ("ready/qualified"): the list, the class and the search. */
function leadsQueryOf(ctx: { route: string; view?: string | null }) {
  const parsed = parseLeadsRoute(ctx.route);
  const [list, cls] = (ctx.view ?? "").split("/");
  const onList = (LEAD_LISTS as readonly string[]).includes(list) ? (list as LeadList) : (parsed?.list ?? "all");
  const onClass = (LEAD_CLASSES as readonly string[]).includes(cls) ? (cls as LeadClass) : (parsed?.cls ?? null);
  return { list: onList, cls: onClass, searchId: parsed?.searchId ?? null };
}

/** Leads: the leads the page drew, each as its row says it, the rail's counts and the searches waiting on the owner. */
export const leads: Provider = async (rc, ctx) => {
  const v = leadsQueryOf(ctx);
  // The page's own query; one the schema refuses reads the Leads page as it opens, never nothing.
  const asked = LeadsQuerySchema.safeParse({
    list: v.list,
    ...(v.cls ? { class: v.cls } : {}),
    ...(v.searchId ? { search: v.searchId } : {}),
  });
  const query = asked.success ? asked.data : LeadsQuerySchema.parse({});
  const [page, found, tz] = await Promise.all([
    load(rc, leadsReader, query).then((r) => r.data),
    load(rc, searchesReader, undefined).then((r) => r.data),
    zone(rc),
  ]);
  const byId = new Map(page.rows.map((r) => [r.id, r]));
  const rows: ContextRow[] = [];
  for (const { id } of idsOf(ctx, "lead")) {
    const r = byId.get(id);
    if (!r) continue;
    const vm = toLeadRowVM(r, tz, rc.now);
    rows.push({
      source: sourceOf("lead", id),
      title: vm.name,
      text: line(
        [vm.name, vm.category, vm.area, vm.fitLabel, vm.stageLabel, vm.emailWord],
        leadsRoute({ searchId: v.searchId, list: v.list, cls: v.cls, peek: id }),
      ),
      ref: null,
    });
  }
  const c = found.counts;
  const waiting = found.searches.filter((s) => s.round?.state === "waiting_on_owner").length;
  return {
    rows,
    aggregate: aggregateOf([
      `${pageWithView(ctx)}: ${rows.length} leads on screen`,
      `all: ${c.all}`,
      `ready: ${c.ready}`,
      `nurture: ${c.nurture}`,
      `converted: ${c.converted}`,
      `said no: ${c.said_no}`,
      `not a fit: ${c.not_a_fit}`,
      `searches: ${found.searches.length}`,
      waiting ? `${waiting} ${waiting === 1 ? "search" : "searches"} waiting for your answer` : null,
    ]),
  };
};
