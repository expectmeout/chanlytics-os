/**
 * The ordered legacy manifest: every file a real workspace draws, in the EXACT
 * script order of Chanlytics.html, which loads these first and then
 * manifest-demo.ts's.
 * ES modules execute static imports in declaration order, so this file IS the
 * execution-order guarantee the classic <script> tags used to provide.
 * Order matters: data/ seeds globals pages/ read at module scope
 * (inbox.jsx reads CHANLY; people-data mutates CLIENT_SEGMENTS from clients-data).
 *
 * The mockup's own files (legacy/demo/) are not here: a real workspace never
 * draws them, so it never downloads them. A session that declared itself a demo
 * loads them after these, at the foot of this file.
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
// The three as the top bar's Ask button and the Line's face: before the two that draw it.
import "@/legacy/components/ask-face.jsx";
import "@/legacy/components/topbar.jsx";
import "@/legacy/components/data-bits.jsx";
import "@/legacy/components/day-agenda.jsx";
import "@/legacy/components/record-row.jsx";
import "@/legacy/components/record-field.jsx";
import "@/legacy/components/record-fold.jsx";
import "@/legacy/components/record-sheet.jsx";
// The one deal sheet (0008): after the kit it is drawn with, before the pages that open it and the shell that holds it.
import "@/legacy/components/deal-sheet.jsx";
// The step sheet (0007, amended): after the deal sheet, whose select it draws who a step is for with.
import "@/legacy/components/step-sheet.jsx";
import "@/legacy/components/message-preview.jsx";
import "@/legacy/components/template-chips.jsx";
import "@/legacy/components/campaign-bits.jsx";
import "@/legacy/components/chart-core.jsx";
import "@/legacy/components/chart-bar.jsx";
import "@/legacy/components/chart-line.jsx";
import "@/legacy/components/chart-pie.jsx";
import "@/legacy/components/chart-radar.jsx";
import "@/legacy/components/chart-radial.jsx";
import "@/legacy/components/chart-heat.jsx";
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
// The one thread, both tabs mount it: after the drawing it wraps, before the pages that use it.
import "@/legacy/pages/thread-pane.jsx";
import "@/legacy/pages/inbox-rail.jsx";
import "@/legacy/pages/inbox.jsx";
import "@/legacy/pages/clients-bits.jsx";
import "@/legacy/pages/people-table.jsx";
// People › Pipeline (0008), the third scope: its peek and its board before the scope, which draws them, and the
// scope before people.jsx, whose ClientsA draws it.
// The pieces a row, a card and the peek share (the track, the row's menu, a selection's pass), before them.
import "@/legacy/pages/pipeline-row.jsx";
import "@/legacy/pages/pipeline-peek.jsx";
import "@/legacy/pages/pipeline-board.jsx";
// New proposal: who it is for, before the one deal sheet.
import "@/legacy/pages/pipeline-new.jsx";
import "@/legacy/pages/pipeline-scope.jsx";
// Import people: the owner's sheet, before people.jsx, whose People page opens it.
import "@/legacy/pages/people-import.jsx";
// People › Leads, the real surface (moved whole from people.jsx): before people.jsx, whose ClientsA draws it.
import "@/legacy/pages/leads-real.jsx";
// People (clients-a.jsx until 26 September 2026): ClientsA, PeopleReal and the two list-page hooks.
import "@/legacy/pages/people.jsx";
// A person's deal (0008): the card the profile draws first in its left column.
import "@/legacy/pages/person-deal.jsx";
import "@/legacy/pages/client-profile.jsx";
// The Leads scope's cells, bench and map (moved whole from leads-scope.jsx): before the scope, which draws them.
import "@/legacy/pages/leads-cells.jsx";
import "@/legacy/pages/leads-bench.jsx";
import "@/legacy/pages/leads-map.jsx";
import "@/legacy/pages/leads-scope.jsx";
import "@/legacy/pages/leads-finder.jsx";
import "@/legacy/pages/leads-peek.jsx";
// A playbook's words, card and composer (moved whole from the page, outbound-real.jsx then): before it, which draws them.
import "@/legacy/pages/playbook-bits.jsx";
import "@/legacy/pages/playbook-card.jsx";
import "@/legacy/pages/playbook-composer.jsx";
// A reach-out's chain as one row (Reach out Part 4 PR 8): before the page, which draws it.
// The reach-out sheet and the Leads door to it (Reach out Part 4 PR 6): drawn by the rows below and by Leads.
import "@/legacy/pages/reach-out/reach-out-sheet.jsx";
import "@/legacy/pages/reach-out/reach-out-door.jsx";
import "@/legacy/pages/reach-out/reach-out-row.jsx";
import "@/legacy/pages/outbound.jsx";
import "@/legacy/pages/templates-real.jsx";
// A reach-out's email as a Templates row (Reach out Part 4 PR 8): before the page, which draws it.
import "@/legacy/pages/reach-out/email-template-row.jsx";
import "@/legacy/pages/messages.jsx";
// A run and the ledger of runs (moved whole from the page, broadcasts-real.jsx then): before it, which draws them.
import "@/legacy/pages/reach-out/reach-out-approval.jsx";
import "@/legacy/pages/broadcasts-run.jsx";
import "@/legacy/pages/broadcasts-ledger.jsx";
import "@/legacy/pages/broadcasts.jsx";
import "@/legacy/pages/conversations.jsx";
import "@/legacy/pages/live-monitor.jsx";
import "@/legacy/pages/calendar.jsx";
import "@/legacy/pages/reports-sections.jsx";
import "@/legacy/pages/reports.jsx";
import "@/legacy/pages/setup.jsx";
import "@/legacy/pages/first-run.jsx";
// Before the Business tab, and so before settings.jsx: what the tab's saves write, the one saver they go through, the
// one-key save and how a number is written, which the old card in settings.jsx uses too.
import "@/legacy/pages/business-tab-save.jsx";
import "@/legacy/pages/business-tab-folds.jsx";
import "@/legacy/pages/business-tab-gestures.jsx";
import "@/legacy/pages/business-tab-who.jsx";
import "@/legacy/pages/business-tab-open.jsx";
import "@/legacy/pages/business-tab-offer.jsx";
import "@/legacy/pages/business-tab-answers.jsx";
import "@/legacy/pages/business-can.jsx";
import "@/legacy/pages/business-tab-services.jsx";
import "@/legacy/pages/business-tab-prompt.jsx";
import "@/legacy/pages/business-tab-create.jsx";
import "@/legacy/pages/business-tab.jsx";
import "@/legacy/pages/settings.jsx";
import "@/legacy/pages/billing-real.jsx";
// The partner pane (0012): the offer, or the link.
import "@/legacy/pages/partner-real.jsx";
// After the mockup's settings: the Integrations pane and the one form it opens.
import "@/legacy/pages/sending-domains.jsx";
import "@/legacy/pages/integrations-real.jsx";
import "@/legacy/pages/business-record.jsx";
// The back office: rendered by the settings shell, for the people who run Chanlytics.
import "@/legacy/pages/platform.jsx";
import "@/legacy/pages/activity.jsx";
// The route table (SHELL_ROUTES, drawRoute): what each route draws, before the shell that reads it.
import "@/legacy/pages/app-routes.jsx";
import "@/legacy/pages/app-shell.jsx";

// The mockup's own files (manifest-demo.ts), after every file above and only in a session that declared itself a
// demo: window.__DEMO_MODE, which seed-globals.ts sets false wherever nothing set it first, so a real workspace never
// asks for them. Awaited, so the bridge that imports this file goes on, and the shell draws, only once they are in.
if (window.__DEMO_MODE) await import("./manifest-demo");

export {};
