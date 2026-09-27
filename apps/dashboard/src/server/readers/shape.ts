import "server-only";
import { dealsAreOn, parseTenantConfig, MIN_MS } from "@chanlytics/contracts";
import { connectionFor } from "../connections/google";
import { emailSetupFor } from "../connections/email";
import { listPlaybooks } from "../campaigns/playbooks";
import { load, stamp, type Reader } from "./index";
import * as facts from "./facts";
import { channels } from "./channels";
import { lists } from "./lists";

/**
 * The shape of the workspace (the Phase 2 plan, D9): what it is set up with, never how busy it is -- the channels it
 * has and whether each is live, whether deals are on, whether a calendar feed and a booking link are set, whether the
 * mailbox and Google are connected, the saved lists by name and the playbooks by name, trigger and state. No counter
 * that ticks and nothing of the clock or the reader's role, so it may be kept (the kernel's rule): five minutes, per
 * workspace and person, for a context that keeps. Every row is sorted, so two reads of the same workspace in any
 * order are the same value, and the block written from it is the same bytes (server/ask/context.ts shapeBlock).
 */
export interface WorkspaceShape {
  name: string;
  timezone: string;
  deals_on: boolean;
  calendar_feed: boolean;
  booking_link: boolean;
  channels: Array<{ kind: string; status: string }>;
  mailbox: boolean;
  google: boolean;
  lists: Array<{ id: string; name: string; archived: boolean }>;
  playbooks: Array<{ id: string; name: string; trigger: string; state: string }>;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const shape: Reader<undefined, WorkspaceShape> = {
  name: "shape",
  ttlMs: 5 * MIN_MS,
  async read(rc) {
    const [f, cfg, sells, chans, email, google, saved, playbooks] = await Promise.all([
      load(rc, facts.facts, undefined).then((r) => r.data),
      load(rc, facts.config, undefined).then((r) => r.data),
      load(rc, facts.sellsBy, undefined).then((r) => r.data),
      load(rc, channels, undefined).then((r) => r.data.channels),
      emailSetupFor(rc.ctx.supabase, rc.tenantId),
      connectionFor(rc.ctx.supabase, rc.tenantId),
      load(rc, lists, undefined).then((r) => r.data.lists),
      listPlaybooks(rc.ctx, rc.tenantId),
    ]);
    const config = parseTenantConfig(cfg?.config ?? null);
    const data: WorkspaceShape = {
      name: f.name,
      timezone: f.timezone,
      deals_on: dealsAreOn(sells),
      calendar_feed: !!config?.calendar?.ical_url,
      booking_link: !!config?.brain?.booking_link,
      channels: chans
        .map((c) => ({ kind: c.kind, status: c.status }))
        .sort((a, b) => byText(a.kind, b.kind) || byText(a.status, b.status)),
      mailbox: !!email.mailbox,
      google: !!google,
      lists: saved
        .map((l) => ({ id: l.id, name: l.name, archived: !!l.archived_at }))
        .sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id)),
      playbooks: playbooks
        .map((p) => ({ id: p.id, name: p.name, trigger: String(p.trigger), state: String(p.state) }))
        .sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id)),
    };
    return { data, rows: [], stamp: stamp() };
  },
};
