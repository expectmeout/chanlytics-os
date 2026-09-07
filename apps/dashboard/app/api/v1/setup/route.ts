import { withRoute, memberContext } from "@/server/with-route";
import { getTenantConfig } from "@chanlytics/db";
import { parseTenantConfigResult, starterByName, type SetupDto } from "@chanlytics/contracts";
import { calendarWeek } from "@/server/calendar";
import { teamRoster } from "@/server/service";
import { linesFor, linesStatus } from "@/server/lines";

/**
 * GET /api/v1/setup — what the workspace has, for the Setup page.
 *
 * Every field is a fact the workspace holds right now: the config row, the
 * channels, the templates Meta approved, whether the calendar feed can be
 * read, who is on the team, where alerts go, how many people said yes, and
 * whether the owner has asked a person at Chanlytics for a line. The page
 * turns these into rows with contracts/setup.ts; nothing here is a stored
 * "done" flag. Members read; the role rides along so the page knows who
 * may act.
 */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const { supabase } = ctx;
  const tenantId = member.tenantId;
  const now = new Date();

  const [cfgRow, channels, lastMsg, lastCall, templates, calendar, team, yes, requested, lineRows, lineStatus] = await Promise.all([
    getTenantConfig(supabase, tenantId),
    supabase.from("tenant_channels").select("kind, status, number_e164, config").eq("tenant_id", tenantId),
    supabase.from("messages").select("channel_ts, created_at").eq("tenant_id", tenantId).eq("direction", "inbound").eq("channel", "whatsapp")
      .order("channel_ts", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("calls").select("started_at").eq("tenant_id", tenantId).eq("direction", "inbound")
      .order("started_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("templates").select("name, meta_status, hidden_at").eq("tenant_id", tenantId),
    calendarWeek(ctx, tenantId, { from: null, days: 7 }, now, { canAct: false }).catch(() => null),
    teamRoster(supabase, tenantId, member.role),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("consent", "opted_in").is("erased_at", null),
    supabase.from("notifications").select("created_at").eq("tenant_id", tenantId).eq("subject_type", "setup")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    linesFor(supabase, tenantId),
    linesStatus(),
  ]);
  if (channels.error) throw new Error(channels.error.message);
  if (lastMsg.error) throw new Error(lastMsg.error.message);
  if (lastCall.error) throw new Error(lastCall.error.message);
  if (templates.error) throw new Error(templates.error.message);
  if (yes.error) throw new Error(yes.error.message);
  if (requested.error) throw new Error(requested.error.message);

  // The config, as the parser reads it — a broken row is its own fact.
  const parsed = cfgRow ? parseTenantConfigResult(cfgRow.config) : null;
  const cfg = parsed && parsed.ok ? parsed.config : null;
  const brain = cfg?.brain ?? null;
  const profile = brain?.profile ?? null;
  const business: SetupDto["business"] = {
    name: brain?.business_name ?? null,
    hours: !!profile?.hours && Object.keys(profile.hours).length > 0,
    services: profile?.services?.length ?? 0,
    bookingLink: !!brain?.booking_link,
    address: !!profile?.address,
    handoff: profile?.handoff_number ?? null,
    broken: !!parsed && !parsed.ok,
  };

  const byKind = (kind: string) => (channels.data ?? []).find((c) => c.kind === kind) ?? null;
  const wa = byKind("whatsapp");
  const voice = byKind("voice");
  const waCfg = (wa?.config && typeof wa.config === "object" && !Array.isArray(wa.config) ? wa.config : {}) as Record<string, unknown>;

  const approved = (templates.data ?? []).filter((t) => t.meta_status === "approved" && !t.hidden_at);
  const pending = (templates.data ?? []).filter((t) => t.meta_status === "pending" && !t.hidden_at);

  const setup: SetupDto = {
    business,
    channels: {
      whatsapp: {
        present: !!wa,
        active: wa?.status === "active",
        number: wa?.number_e164 ?? null,
        quality: typeof waCfg.quality_rating === "string" ? (waCfg.quality_rating as string) : null,
        lastInboundAt: lastMsg.data?.channel_ts ?? lastMsg.data?.created_at ?? null,
      },
      voice: {
        present: !!voice,
        active: voice?.status === "active",
        number: voice?.number_e164 ?? null,
        lastInboundAt: lastCall.data?.started_at ?? null,
      },
    },
    templates: {
      approved: approved.length,
      pending: pending.length,
      startersApproved: approved.filter((t) => starterByName(t.name) !== null).length,
    },
    calendar: { state: calendar?.feed.state ?? "none" },
    team: {
      members: team.members.length,
      invitesOpen: team.invites.length,
      alertEmails: cfg?.notifications?.escalation_emails?.length ?? 0,
    },
    consent: { yes: yes.count ?? 0 },
    requests: { line: requested.data?.created_at ?? null },
    lines: { rows: lineRows, ready: lineStatus.ready, provider: lineStatus.provider, costs: { local_number_month_usd: lineStatus.costs.local_number_month_usd } },
  };
  return { setup, role: member.role };
});
