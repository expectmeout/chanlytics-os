import "server-only";
import {
  addressOf,
  chainResultsOf,
  dealsAreOn,
  lifecycleChainStateOf,
  lifecycleChainsOf,
  lifecycleStateOf,
  nextRunLabel,
  plural,
  reportDaysAsked,
  reportRangeOfKey,
  sentResultsOfSource,
  setupSteps,
  toBookingReportVM,
  toBroadcastVM,
  toReportVM,
  triggerOf,
  type AskContextRowKind,
  type LifecycleRowResults,
} from "@chanlytics/contracts";
import { load, type ReaderContext } from "../../readers";
import * as facts from "../../readers/facts";
import type { ReportWindow } from "@chanlytics/db";
import { report as reportReader, reportWindowFor } from "../../readers/report";
import { playbooks as playbooksReader, reachOutChains } from "../../readers/playbooks";
import { broadcasts as broadcastsReader } from "../../readers/broadcasts";
import { chainLastDays, lastDaysBySource, lastDaysOf } from "../../readers/campaign-report";
import { templates as templatesReader } from "../../readers/templates";
import { channels as channelsReader } from "../../readers/channels";
import { connections as connectionsReader } from "../../readers/connections";
import { aggregateOf, idsOf, line, pageWithView, refsOf, sourceOf, type ContextRow, type Provider } from "./rows";

/**
 * The rest of the pages, as their context: Reports (the numbers, no rows), Campaigns (the playbooks, the broadcasts
 * or the messages, whichever tab the page is), Settings (the pane and what the workspace runs on), Start (the step and
 * how far setup has come), and any other page, which is its address alone and reads nothing. A row is cited as its
 * reader gave it: a playbook, a reach-out as its first step's playbook, a Broadcasts row as a broadcast (the page's own
 * word for it is run), a template.
 */

const zone = (rc: ReaderContext) => load(rc, facts.facts, undefined).then((r) => r.data.timezone);

/**
 * The window the page shows, as the report routes read one. Reports' view is a count of days for a period by name (any
 * whole count the report can read, so Month is described over the days it has run), or the days a member picked, said
 * by their one name (`2026-09-01~2026-09-20`, contracts reportRangeKey). Days that are no window (to come, too many) are
 * read as thirty days, as a view that says nothing is.
 */
async function windowShown(rc: ReaderContext, view: string | null | undefined): Promise<ReportWindow> {
  const picked = reportRangeOfKey(view);
  if (picked !== null && typeof picked !== "string")
    return reportWindowFor(rc, picked).catch(() => ({ days: 30, end: null }));
  return { days: reportDaysAsked(view) ?? 30, end: null };
}

/** Reports: the period the page shows, its tiles and its lines, as the report tool says them. */
export const reports: Provider = async (rc, ctx) => {
  const r = (await load(rc, reportReader, await windowShown(rc, ctx.view))).data;
  const vm = toReportVM(r.report, { profile: r.profile });
  const booking = r.booking ? toBookingReportVM(r.booking) : null;
  return {
    rows: [],
    aggregate: aggregateOf([
      // A period that ends today by its count, as ever; days a member picked by their dates, so Ask says which days.
      `Reports, ${vm.live ? vm.rangeLabel : vm.period.now}`,
      ...vm.tiles.map((t) => `${t.label}: ${t.value}${t.meta ? ` (${t.meta})` : ""}`),
      `calls: ${vm.calls.total}`,
      `new people: ${vm.people.total}`,
      // The booking line: its count; where none was taken, why; and for days that ended, that it is not counted for
      // them (its reason alone, "It follows people…", names nothing here).
      booking
        ? booking.present
          ? booking.headline
          : booking.calendar === "ended"
            ? `Booked: ${booking.headline}`
            : booking.sub
        : null,
    ]),
  };
};

/**
 * A row's last 30 days in its line, in its row's words (contracts sentResultsOfSource, chainResultsOf): what it sent and
 * how many replied, or the businesses a reach-out wrote to and how many wrote back (its emails written where the
 * businesses were not counted, a database before 00404); nothing sent; or, unread or not counted, said so, never
 * all-time totals.
 */
function lastDaysPart(r: LifecycleRowResults | null): string {
  if (r === null || r === "uncounted") return "30d: not read";
  if (r === "none") return "30d: nothing sent";
  if (r.kind === "sent") return `30d: ${r.sent} sent, ${r.replied} replied`;
  return r.businesses === null
    ? `30d: ${r.written} written, ${r.wroteBack} wrote back`
    : `30d: ${plural(r.businesses, "business", "businesses")}, ${r.wroteBack} wrote back`;
}

/**
 * The playbooks the page drew, each as campaigns.playbooks says one: its last 30 days as its row on Campaigns says them
 * (D35), first after its name so no cut reaches them; its state and next run; and its moment, where it is not its name.
 * A citation opens its drawer.
 */
async function playbookContextRows(rc: ReaderContext, ids: string[]) {
  const [read, sources] = await Promise.all([load(rc, playbooksReader, undefined), lastDaysBySource(rc)]);
  const pb = read.data;
  const byId = new Map(pb.playbooks.map((p) => [p.id, p]));
  const refs = refsOf(read.rows);
  const rows: ContextRow[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) continue;
    // Nothing sent is the row's own rule (sentResultsOfSource): a reply to an older send is no sending in these days.
    const days = lastDaysOf(sources, id);
    const moment = triggerOf(p.trigger)?.label ?? p.trigger;
    rows.push({
      source: sourceOf("playbook", id),
      title: p.name,
      text: line(
        [
          p.name,
          lastDaysPart(days ? sentResultsOfSource(days) : null),
          // The campaign's state as the home says it (lifecycleStateOf), a run waiting included, paused or not.
          lifecycleStateOf(p).words,
          `next run ${nextRunLabel(p, pb.timezone, rc.now, pb.ready?.paused === true)}`,
          moment.trim().toLowerCase() === p.name.trim().toLowerCase() ? null : moment,
        ],
        `campaigns/moment:${id}`,
      ),
      ref: refs.get(id) ?? null,
    });
  }
  const running = pb.playbooks.filter((p) => p.state === "running").length;
  return { rows, aggregate: `playbooks: ${pb.playbooks.length}, ${running} running` };
}

/**
 * The reach-outs the ledger drew (A2), each as GET reach-outs lists it: its last 30 days as its row says them (what it
 * wrote, how many wrote back), whether it runs, and a run of it waiting on the person. Its drawer is a campaign's; a
 * citation names it as its first step's playbook, as its reader gives it.
 */
async function chainContextRows(rc: ReaderContext, ids: string[]) {
  const [read, totals] = await Promise.all([load(rc, reachOutChains, undefined), chainLastDays(rc)]);
  const byRoot = new Map(read.data.chains.map((c) => [c.root_id, c]));
  const refs = refsOf(read.rows);
  const chains = lifecycleChainsOf(totals);
  const rows: ContextRow[] = [];
  for (const id of ids) {
    const c = byRoot.get(id);
    if (!c) continue;
    rows.push({
      source: sourceOf("reach_out", id),
      title: c.name,
      text: line(
        [c.name, lastDaysPart(chains ? chainResultsOf(id, chains) : null), lifecycleChainStateOf(c).words],
        `campaigns/moment:${id}`,
      ),
      ref: refs.get(id) ?? null,
    });
  }
  return { rows, aggregate: `reach-outs: ${byRoot.size}` };
}

/** The broadcasts the page drew, each as the Broadcasts page says one: its state, when, who it went to, what came back. */
async function broadcastRows(rc: ReaderContext, ids: string[]) {
  const [read, tz] = await Promise.all([load(rc, broadcastsReader, undefined), zone(rc)]);
  const list = read.data;
  const vms = new Map(list.broadcasts.map((b) => [b.id, toBroadcastVM(b, tz, rc.now)]));
  const refs = refsOf(read.rows);
  const rows: ContextRow[] = [];
  for (const id of ids) {
    const b = vms.get(id);
    if (!b) continue;
    rows.push({
      source: sourceOf("run", id),
      title: b.name,
      text: line(
        [
          b.name,
          b.stateLabel,
          b.when,
          `${b.recipient_count} people`,
          `${b.counts.sent} sent`,
          b.deliveredPct === null ? null : `${b.deliveredPct}% delivered`,
        ],
        `broadcasts/run:${id}`,
      ),
      ref: refs.get(id) ?? null,
    });
  }
  const open = [...vms.values()].filter((b) => b.open).length;
  return { rows, aggregate: `broadcasts: ${vms.size}${list.more ? " recent" : ""}, ${open} still to come` };
}

/** The messages the page drew, each as the library lists one: its name, category, status and language. */
async function templateRows(rc: ReaderContext, ids: string[]) {
  const read = await load(rc, templatesReader, { all: true });
  const all = read.data.templates;
  const byId = new Map(all.map((t) => [t.id, t]));
  const refs = refsOf(read.rows);
  const rows: ContextRow[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t) continue;
    const name = t.title || t.name;
    rows.push({
      source: sourceOf("template", id),
      title: name,
      // Its own address in the Library, by name, as its row's (the templates reader): the message, not the list.
      text: line([name, t.category, t.meta_status, t.language], addressOf({ kind: "template", name: t.name })),
      ref: refs.get(id) ?? null,
    });
  }
  const approved = all.filter((t) => t.meta_status === "approved").length;
  return { rows, aggregate: `messages: ${all.length}, ${approved} approved` };
}

/**
 * The home's rows (a view of `playbooks`, then the ledger's status, group and search), in the ledger's order: its
 * campaigns as campaigns.playbooks says them, its reach-outs as GET reach-outs lists them, and its one-off sends as Sent's
 * rows say them, each a row a citation names.
 */
async function ledgerRows(rc: ReaderContext, ctx: Parameters<Provider>[1]) {
  const ids = (kind: AskContextRowKind) => idsOf(ctx, kind).map((r) => r.id);
  const runs = ids("run");
  const chains = ids("reach_out");
  const [pb, sent, reach] = await Promise.all([
    playbookContextRows(rc, ids("playbook")),
    runs.length ? broadcastRows(rc, runs) : null,
    chains.length ? chainContextRows(rc, chains) : null,
  ]);
  const at = new Map(ctx.rows.map((r, i) => [sourceOf(r.kind, r.id), i]));
  const rows = [...pb.rows, ...(reach?.rows ?? []), ...(sent?.rows ?? [])].sort(
    (a, b) => (at.get(a.source) ?? 0) - (at.get(b.source) ?? 0),
  );
  return { rows, aggregate: aggregateOf([pb.aggregate, reach?.aggregate]) };
}

/**
 * Campaigns: the home's ledger (its campaigns and one-off sends), Sent's runs or the Library's messages, whichever the
 * page is (legacy-bridge/ask/context.ts), and its rows are that page's.
 */
export const campaigns: Provider = async (rc, ctx) => {
  const got = ctx.view?.startsWith("playbooks")
    ? await ledgerRows(rc, ctx)
    : ctx.view === "broadcasts"
      ? await broadcastRows(
          rc,
          idsOf(ctx, "run").map((r) => r.id),
        )
      : await templateRows(
          rc,
          idsOf(ctx, "template").map((r) => r.id),
        );
  return {
    rows: got.rows,
    aggregate: aggregateOf([`${pageWithView(ctx)}: ${got.rows.length} on screen`, got.aggregate]),
  };
};

/** Settings: the pane the page is on, and what the workspace runs on: its name, its zone, its lines, its deals. */
export const settings: Provider = async (rc, ctx) => {
  const [f, chans, sells] = await Promise.all([
    load(rc, facts.facts, undefined).then((r) => r.data),
    load(rc, channelsReader, undefined).then((r) => r.data.channels),
    load(rc, facts.sellsBy, undefined).then((r) => r.data),
  ]);
  return {
    rows: [],
    aggregate: aggregateOf([
      pageWithView(ctx),
      f.name,
      f.timezone,
      `lines: ${chans.length ? chans.map((c) => `${c.kind} ${c.status}`).join(", ") : "none"}`,
      `deals ${dealsAreOn(sells) ? "on" : "off"}`,
    ]),
  };
};

/** Start: the step the page is on, and how far setup has come, as the Setup page says it (contracts setupSteps). */
export const start: Provider = async (rc, ctx) => {
  const { setup } = (await load(rc, connectionsReader, undefined)).data;
  // What the member put off rides on their own saved view, which the page reads apart: none is put off here.
  const vm = setupSteps({ ...setup, later: [] }, rc.now.getTime());
  return {
    rows: [],
    aggregate: aggregateOf([
      pageWithView(ctx),
      vm.readiness.sentence,
      `${vm.done} of ${vm.total} set up`,
      vm.next ? `next: ${vm.next.title}` : null,
    ]),
  };
};

/** Any other page: its address, and nothing read. */
export const other: Provider = async (_rc, ctx) => ({
  rows: [],
  aggregate: aggregateOf([`${pageWithView(ctx)}: ${ctx.route || "the page"}`, "nothing on it is read here"]),
});
