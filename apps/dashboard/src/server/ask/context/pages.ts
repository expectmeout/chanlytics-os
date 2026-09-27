import "server-only";
import {
  REPORT_RANGES,
  dealsAreOn,
  nextRunLabel,
  setupSteps,
  toBookingReportVM,
  toBroadcastVM,
  toReportVM,
  triggerOf,
} from "@chanlytics/contracts";
import { load, type ReaderContext } from "../../readers";
import * as facts from "../../readers/facts";
import { report as reportReader } from "../../readers/report";
import { playbooks as playbooksReader } from "../../readers/playbooks";
import { broadcasts as broadcastsReader } from "../../readers/broadcasts";
import { templates as templatesReader } from "../../readers/templates";
import { channels as channelsReader } from "../../readers/channels";
import { connections as connectionsReader } from "../../readers/connections";
import { aggregateOf, idsOf, line, pageWithView, sourceOf, type ContextRow, type Provider } from "./rows";

/**
 * The rest of the pages, as their context: Reports (the numbers, no rows), Campaigns (the playbooks, the broadcasts
 * or the messages, whichever tab the page is), Settings (the pane and what the workspace runs on), Start (the step and
 * how far setup has come), and any other page, which is its address alone and reads nothing.
 */

const zone = (rc: ReaderContext) => load(rc, facts.facts, undefined).then((r) => r.data.timezone);

/** Reports: the period the page shows, its tiles and its lines, as the report tool says them. */
export const reports: Provider = async (rc, ctx) => {
  const asked = Number(ctx.view);
  const days = REPORT_RANGES.some((r) => r.days === asked) ? asked : 30;
  const r = (await load(rc, reportReader, { days })).data;
  const vm = toReportVM(r.report);
  const booking = r.booking ? toBookingReportVM(r.booking) : null;
  return {
    rows: [],
    aggregate: aggregateOf([
      `Reports, ${vm.rangeLabel}`,
      ...vm.tiles.map((t) => `${t.label}: ${t.value}${t.meta ? ` (${t.meta})` : ""}`),
      `calls: ${vm.calls.total}`,
      `new people: ${vm.people.total}`,
      booking ? (booking.present ? booking.headline : booking.sub) : null,
    ]),
  };
};

/** The playbooks the page drew, each as campaigns.playbooks says one: its moment, state, next run, what runs earned. */
async function playbookRows(rc: ReaderContext, ids: string[]) {
  const pb = (await load(rc, playbooksReader, undefined)).data;
  const byId = new Map(pb.playbooks.map((p) => [p.id, p]));
  const rows: ContextRow[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) continue;
    rows.push({
      source: sourceOf("playbook", id),
      title: p.name,
      text: line(
        [
          p.name,
          triggerOf(p.trigger)?.label ?? p.trigger,
          p.state,
          `next run ${nextRunLabel(p, pb.timezone, rc.now)}`,
          `${p.totals.runs} runs, ${p.totals.sent} sent, ${p.totals.replied} replied`,
        ],
        `outbound/${id}`,
      ),
      ref: null,
    });
  }
  const running = pb.playbooks.filter((p) => p.state === "running").length;
  return { rows, aggregate: `playbooks: ${pb.playbooks.length}, ${running} running` };
}

/** The broadcasts the page drew, each as the Broadcasts page says one: its state, when, who it went to, what came back. */
async function broadcastRows(rc: ReaderContext, ids: string[]) {
  const [list, tz] = await Promise.all([load(rc, broadcastsReader, undefined).then((r) => r.data), zone(rc)]);
  const vms = new Map(list.broadcasts.map((b) => [b.id, toBroadcastVM(b, tz, rc.now)]));
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
      ref: null,
    });
  }
  const open = [...vms.values()].filter((b) => b.open).length;
  return { rows, aggregate: `broadcasts: ${vms.size}${list.more ? " recent" : ""}, ${open} still to come` };
}

/** The messages the page drew, each as the library lists one: its name, category, status and language. */
async function templateRows(rc: ReaderContext, ids: string[]) {
  const all = (await load(rc, templatesReader, { all: true })).data.templates;
  const byId = new Map(all.map((t) => [t.id, t]));
  const rows: ContextRow[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t) continue;
    const name = t.title || t.name;
    rows.push({
      source: sourceOf("template", id),
      title: name,
      text: line([name, t.category, t.meta_status, t.language], "messages"),
      ref: null,
    });
  }
  const approved = all.filter((t) => t.meta_status === "approved").length;
  return { rows, aggregate: `messages: ${all.length}, ${approved} approved` };
}

/** Campaigns: the tab is the page (legacy-bridge/ask/context.ts), and its rows are that tab's. */
export const campaigns: Provider = async (rc, ctx) => {
  const got =
    ctx.view === "playbooks"
      ? await playbookRows(
          rc,
          idsOf(ctx, "playbook").map((r) => r.id),
        )
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
