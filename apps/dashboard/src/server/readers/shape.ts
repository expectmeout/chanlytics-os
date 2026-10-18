import "server-only";
import { parseTenantConfig, type AppointmentWord, MIN_MS } from "@chanlytics/contracts";
import { connectionFor } from "../connections/google";
import { emailLineFor } from "../connections/email";
import { playbookRows } from "../campaigns/playbooks";
import { load, stamp, type Reader } from "./index";
import * as facts from "./facts";
import { channels } from "./channels";
import { lists } from "./lists";

/**
 * The shape of the workspace (the Phase 2 plan, D9): what it is set up with, never how busy it is -- the kinds of line
 * it has, whether a deal was ever recorded, whether a calendar feed and a booking link are set, whether the mailbox and
 * Google are connected, the saved lists by name and the playbooks by name and trigger. No counter that ticks, no state
 * that moves and nothing of the clock or the reader's role, so it may be kept (the kernel's rule): five minutes, per
 * workspace and person, for a context that keeps. A line's status and a playbook's state moved inside those five
 * minutes, and Ask said "running" of a campaign paused a minute before (the wiring's second audit, R13 X5-6): they are
 * read where asked. Every row is sorted, so two reads of the same workspace in any order are the same value, and the
 * block written from it is the same bytes (server/ask/context.ts shapeBlock).
 */
export interface WorkspaceShape {
  name: string;
  timezone: string;
  /** A deal was ever recorded here (readers/facts.ts hasDeals): every workspace has deals, this one has used them. */
  has_deals: boolean;
  /** What the workspace calls an appointment (readers/facts.ts businessShape). */
  appointment_word: AppointmentWord;
  calendar_feed: boolean;
  booking_link: boolean;
  /** The kinds of line it has, each once: whether each is live now is the connections' read, not kept here. */
  channels: string[];
  mailbox: boolean;
  google: boolean;
  lists: Array<{ id: string; name: string; archived: boolean }>;
  /** The playbooks by name and trigger: whether each runs now is the campaigns' read, not kept here. */
  playbooks: Array<{ id: string; name: string; trigger: string }>;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const shape: Reader<undefined, WorkspaceShape> = {
  name: "shape",
  ttlMs: 5 * MIN_MS,
  async read(rc) {
    const [f, cfg, biz, chans, email, google, saved, playbooks] = await Promise.all([
      load(rc, facts.facts, undefined).then((r) => r.data),
      load(rc, facts.config, undefined).then((r) => r.data),
      load(rc, facts.businessShape, undefined).then((r) => r.data),
      load(rc, channels, undefined).then((r) => r.data.channels),
      // The line alone: the shape says whether there is a mailbox, and nothing of how the workspace sends.
      emailLineFor(rc.ctx.supabase, rc.tenantId),
      connectionFor(rc.ctx.supabase, rc.tenantId),
      load(rc, lists, undefined).then((r) => r.data.lists),
      // The rows alone (00374's split): the shape names each by its name and trigger, and runs nothing's count.
      playbookRows(rc.ctx, rc.tenantId),
    ]);
    const config = parseTenantConfig(cfg?.config ?? null);
    const data: WorkspaceShape = {
      name: f.name,
      timezone: f.timezone,
      has_deals: biz.hasDeals,
      appointment_word: biz.word,
      calendar_feed: !!config?.calendar?.ical_url,
      booking_link: !!config?.brain?.booking_link,
      channels: [...new Set(chans.map((c) => c.kind))].sort(byText),
      mailbox: !!email.mailbox,
      google: !!google,
      lists: saved
        .map((l) => ({ id: l.id, name: l.name, archived: !!l.archived_at }))
        .sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id)),
      playbooks: playbooks
        .map((p) => ({ id: p.id, name: p.name, trigger: String(p.trigger) }))
        .sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id)),
    };
    return { data, rows: [], stamp: stamp() };
  },
};
