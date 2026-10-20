/**
 * The ordered legacy manifest: every file a real workspace draws, in the order
 * the shared global scope requires. The standalone harness loads the same files
 * from this list (its server writes Chanlytics.html's from it:
 * tooling/scripts/serve-legacy.mjs).
 * ES modules execute static imports in declaration order, so this file IS the
 * execution-order guarantee the classic <script> tags used to provide.
 *
 * The mockup's own files (legacy/demo/: Agents, Content, the Deal board, the seeded
 * Lists and Ask palette, and the invented people and leads they read) were deleted on
 * 17 October 2026 (the closed-loop audit's S2, Ruben's word): no workspace drew them.
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

import "@/legacy/data/constants.jsx";
// Ask's Line (the five pages/ask-*.jsx) is a chunk of its own, fetched once the frame is idle or the Line is first opened
// (ask/line.tsx, published as the shell's AskBar by seed-globals).
// People is TSX (surfaces/people): its list, its Leads scope, the Pipeline and a person's page; the parts the shell still
// draws by name are published by seed-globals from people-globals.ts before any of these loads.

// Before the Business tab, and so before settings.jsx: what the tab's saves write, the one saver they go through, the
// one-key save and how a number is written, which the old card in settings.jsx uses too.
// The route table (SHELL_ROUTES, drawRoute): what each route draws, before the shell that reads it.
import "@/legacy/pages/app-routes.jsx";
import "@/legacy/pages/app-shell.jsx";

export {};
