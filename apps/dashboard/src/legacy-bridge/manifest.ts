/**
 * The ordered legacy manifest: every file a real workspace draws, in the EXACT
 * script order of Chanlytics.html, which loads these first and then
 * manifest-demo.ts's.
 * ES modules execute static imports in declaration order, so this file IS the
 * execution-order guarantee the classic <script> tags used to provide.
 *
 * The mockup's own files (legacy/demo/) are not here: a real workspace never
 * draws them, so it never downloads them. That is its seeds too: the invented
 * people and leads (demo/data/clients-data, people-data) and the seeded Ask palette
 * (demo/pages/dashboard-a-ask), which a real workspace imported until 11 October
 * 2026 for the one door it hosted (Ask's `askAbout` is surfaces/frame-doors.ts now)
 * and the choice of the real Line (ask-real.jsx publishes `AskBar`). A session that
 * declared itself a demo loads them after these, at the foot of this file.
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
import "@/legacy/pages/ask-text.jsx";
import "@/legacy/pages/ask-hooks.jsx";
import "@/legacy/pages/ask-turn.jsx";
import "@/legacy/pages/ask-home.jsx";
import "@/legacy/pages/ask-real.jsx";
// People is TSX (surfaces/people): its list, its Leads scope, the Pipeline and a person's page; the parts the shell still
// draws by name are published by seed-globals from people-globals.ts before any of these loads.

// Before the Business tab, and so before settings.jsx: what the tab's saves write, the one saver they go through, the
// one-key save and how a number is written, which the old card in settings.jsx uses too.
// The route table (SHELL_ROUTES, drawRoute): what each route draws, before the shell that reads it.
import "@/legacy/pages/app-routes.jsx";
import "@/legacy/pages/app-shell.jsx";

// The mockup's own files (manifest-demo.ts), after every file above and only in a session that declared itself a
// demo: window.__DEMO_MODE, which seed-globals.ts sets false wherever nothing set it first, so a real workspace never
// asks for them. Awaited, so the bridge that imports this file goes on, and the shell draws, only once they are in.
if (window.__DEMO_MODE) await import("./manifest-demo");

export {};
