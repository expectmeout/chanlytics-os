import "server-only";
import type { CalendarWeekDto } from "@chanlytics/contracts";
import { calendarSources, weekFrom, type CalendarSources } from "../calendar";
import { load, stamp, type Reader, type RowRef } from "./index";
import * as facts from "./facts";

/**
 * The calendar's one read for a span (server/calendar.ts calendarSources) with the zone and the settings the turn
 * already holds (readers/facts.ts), so a turn reads the tenant once however many of its reads say "today". Its data
 * carries neither the feed's address nor the raw settings (server/calendar.ts CalendarSources), and it is never an
 * answer: `calendar` below and the calendar route assemble what is answered from it. It writes nothing (D7): the
 * route puts the feed's people in People between this read and the board, when its caller may act.
 */
export const sources: Reader<{ from: string | null; days: number; fresh: boolean }, CalendarSources> = {
  name: "calendarSources",
  async read(rc, { from, days, fresh }) {
    const { timezone } = (await load(rc, facts.facts, undefined)).data;
    const settings = (await load(rc, facts.config, undefined)).data;
    const data = await calendarSources(rc.ctx, rc.tenantId, { from, days }, rc.now, {
      fresh,
      timezone,
      config: settings?.config ?? null,
    });
    return { data, rows: [], stamp: stamp() };
  },
};

/**
 * GET calendar as the route answers a read that puts nobody in People (a viewer's): the board's week for a span by
 * the business's clock -- what the feed says is taken, the hours and closures, and the windows the receptionist would
 * offer from the turn's clock. For Ask, which never writes. Each person its days name is a row a citation may name,
 * once, by the name the board gives them, and opens on their profile.
 */
export const calendar: Reader<{ from: string | null; days: number }, { calendar: CalendarWeekDto }> = {
  name: "calendar",
  async read(rc, { from, days }) {
    const s = (await load(rc, sources, { from, days, fresh: false })).data;
    const week = weekFrom(s, s.people, rc.now);
    const rows: RowRef[] = [];
    const named = new Set<string>();
    for (const d of week.days)
      for (const it of d.items)
        if (it.person && !named.has(it.person.id)) {
          named.add(it.person.id);
          rows.push({ kind: "person", id: it.person.id, route: `clients/${it.person.id}`, label: it.person.name });
        }
    return { data: { calendar: week }, rows, stamp: stamp() };
  },
};
