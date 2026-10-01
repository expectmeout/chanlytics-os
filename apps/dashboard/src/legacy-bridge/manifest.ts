/**
 * The ordered legacy manifest: every file a real workspace draws, in the EXACT
 * script order of Chanlytics.html, which loads these first and then
 * manifest-demo.ts's.
 * ES modules execute static imports in declaration order, so this file IS the
 * execution-order guarantee the classic <script> tags used to provide.
 * Order matters: data/ seeds globals pages/ read at module scope
 * (people-data mutates CLIENT_SEGMENTS from clients-data).
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

import "@/legacy/components/surface-tabs.jsx";
import "@/legacy/components/sidebar.jsx";
import "@/legacy/components/shortcuts.jsx";
// The three as the top bar's Ask button and the Line's face: before the two that draw it.
import "@/legacy/components/ask-face.jsx";
import "@/legacy/components/topbar.jsx";
import "@/legacy/components/data-bits.jsx";

import "@/legacy/data/constants.jsx";
import "@/legacy/data/clients-data.jsx";
import "@/legacy/data/people-data.jsx";
import "@/legacy/pages/dashboard-a-ask.jsx";
import "@/legacy/pages/ask-text.jsx";
import "@/legacy/pages/ask-hooks.jsx";
import "@/legacy/pages/ask-turn.jsx";
import "@/legacy/pages/ask-home.jsx";
import "@/legacy/pages/ask-real.jsx";
import "@/legacy/pages/clients-bits.jsx";
// People's list, its table, rail kit, hooks and import sheet are TSX (surfaces/people), and so is the Pipeline and a person's deal card;
// the parts the pages below still draw by name are published by seed-globals from people-globals.ts before any of these loads.
// People › Leads, the real surface (moved whole from people.jsx): the frame draws it (app-routes.jsx drawLeads).
import "@/legacy/pages/leads-real.jsx";
// The Leads scope's cells, bench and map (moved whole from leads-scope.jsx): before the scope, which draws them.
import "@/legacy/pages/leads-cells.jsx";
import "@/legacy/pages/leads-bench.jsx";
import "@/legacy/pages/leads-map.jsx";
import "@/legacy/pages/leads-scope.jsx";
import "@/legacy/pages/leads-finder.jsx";
// Leads while a reach-out writes (Reach out Part 6): the strip, the Stage line and the peek's block the pages above draw;
// and a list of your own (Part 7): Import leads, Write to them, and the sheets they open.
import "@/legacy/pages/reach-out/reach-out-leads.jsx";

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
