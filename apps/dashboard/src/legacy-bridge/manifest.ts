/**
 * The ordered legacy manifest — the EXACT script order of Chanlytics.html.
 * ES modules execute static imports in declaration order, so this file IS the
 * execution-order guarantee the classic <script> tags used to provide.
 * Order matters: data/ seeds globals pages/ read at module scope
 * (inbox.jsx reads CHANLY; calendar.jsx calls CHANLY.agents() over FLEET_ROSTER;
 * people-data mutates CLIENT_SEGMENTS from clients-data).
 *
 * Dropped vs the original, and since deleted from the tree: tweaks-panel.jsx
 * (replaced by the bridge's localStorage prefs) and design-canvas.jsx (never
 * loaded by Chanlytics.html).
 */
import "./seed-globals";

import "@/legacy/components/icons.jsx";
import "@/legacy/components/surface-tabs.jsx";
import "@/legacy/components/sidebar.jsx";
import "@/legacy/components/shortcuts.jsx";
import "@/legacy/components/topbar.jsx";
import "@/legacy/components/data-bits.jsx";
import "@/legacy/data/constants.jsx";
import "@/legacy/data/dashboard-data.jsx";
import "@/legacy/data/inbox-data.jsx";
import "@/legacy/data/clients-data.jsx";
import "@/legacy/data/store-data.jsx";
import "@/legacy/data/fleet-data.jsx";
import "@/legacy/data/pipeline-data.jsx";
import "@/legacy/data/conversations-data.jsx";
import "@/legacy/data/live-data.jsx";
import "@/legacy/data/calendar-data.jsx";
import "@/legacy/data/reports-data.jsx";
import "@/legacy/data/tasks-data.jsx";
import "@/legacy/data/people-data.jsx";
import "@/legacy/pages/attention-bits.jsx";
import "@/legacy/pages/dashboard-a-brief.jsx";
import "@/legacy/pages/dashboard-a-command.jsx";
import "@/legacy/pages/dashboard-a-day.jsx";
import "@/legacy/pages/dashboard-a-week.jsx";
import "@/legacy/pages/dashboard-a-live.jsx";
import "@/legacy/pages/dashboard-a-fleet.jsx";
import "@/legacy/pages/dashboard-a-ask.jsx";
import "@/legacy/pages/ask-text.jsx";
import "@/legacy/pages/ask-hooks.jsx";
import "@/legacy/pages/ask-turn.jsx";
import "@/legacy/pages/ask-home.jsx";
import "@/legacy/pages/ask-real.jsx";
import "@/legacy/pages/dashboard-a.jsx";
import "@/legacy/pages/inbox-list.jsx";
import "@/legacy/pages/inbox-thread.jsx";
import "@/legacy/pages/inbox-rail.jsx";
import "@/legacy/pages/inbox.jsx";
import "@/legacy/pages/clients-bits.jsx";
import "@/legacy/pages/clients-a.jsx";
import "@/legacy/pages/client-profile.jsx";
// leads, agent-store, agent-fleet, agent-studio, content-cal, pipeline and tasks
// are the mockup's surfaces: kept, hidden from every real workspace (the
// registry marks them demo), revisited when the product is at 100% — Ruben,
// 11 September 2026. None of their features is built before then.
import "@/legacy/pages/leads.jsx";
import "@/legacy/pages/segments.jsx";
import "@/legacy/pages/segments-real.jsx";
import "@/legacy/pages/agent-store.jsx";
import "@/legacy/pages/agent-fleet.jsx";
import "@/legacy/pages/agent-studio.jsx";
import "@/legacy/pages/outbound.jsx";
import "@/legacy/pages/outbound-real.jsx";
import "@/legacy/pages/content-cal.jsx";
import "@/legacy/pages/templates-real.jsx";
import "@/legacy/pages/messages.jsx";
import "@/legacy/pages/broadcasts.jsx";
import "@/legacy/pages/broadcasts-real.jsx";
import "@/legacy/pages/pipeline.jsx";
import "@/legacy/pages/conversations.jsx";
import "@/legacy/pages/live-monitor.jsx";
// After the mockup's console: takes the route over when the bridge feeds it.
import "@/legacy/pages/live-monitor-real.jsx";
import "@/legacy/pages/calendar.jsx";
import "@/legacy/pages/calendar-real.jsx";
import "@/legacy/pages/reports.jsx";
import "@/legacy/pages/tasks.jsx";
import "@/legacy/pages/setup.jsx";
import "@/legacy/pages/settings.jsx";
import "@/legacy/pages/billing-real.jsx";
// After the mockup's settings: the Integrations pane and the one form it opens.
import "@/legacy/pages/integrations-real.jsx";
import "@/legacy/pages/business-record.jsx";
// The back office: rendered by the settings shell, for the people who run Chanlytics.
import "@/legacy/pages/platform.jsx";
import "@/legacy/pages/activity.jsx";
import "@/legacy/pages/app-shell.jsx";

export {};
