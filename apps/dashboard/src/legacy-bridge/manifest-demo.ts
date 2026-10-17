/**
 * The mockup's own files (legacy/demo/), which no real workspace draws, in the order they load:
 *
 *   - the invented people the mockup's pages read (clients-data: CLIENTS, CLIENT_SEGMENTS and the consent registry;
 *     people-data: LEADS, the segments' metadata and guardrails, the scripted lead arrival), which people-data adds
 *     its lead segments to: before every file that reads them. They rode every workspace's route bundle until 11 October
 *     2026, behind a flag nothing set outside a demo;
 *   - the surfaces the registry marks demo (Agents: store, fleet, studio, tasks; Content; the Deal board), kept and
 *     hidden from every real workspace, revisited when the product is at 100% (Ruben, 11 September 2026; none of
 *     their features is built before then);
 *   - the seeded Ask palette (dashboard-a-ask), whose canned answers read all of the above, and which the demo's `AskBar`
 *     chooses over the real Line (ask-real.jsx, which a real workspace's `AskBar` is);
 *   - the seeded twin of three real pages (outbound, broadcasts, live-monitor), each published as the
 *     `*Seed` its real page draws only where the bridge has not fed it, which a real workspace's route gate never lets
 *     it reach;
 *   - the seeded Lists (segments.jsx), drawn only where the address is not a real workspace's (a real workspace's
 *     lists are a view of People, app-routes.jsx drawListsAsPeople);
 *   - and the seed only they read (tasks-data).
 *
 * Loaded by manifest.ts, behind a dynamic import, after every file it lists, and only in a session that declared
 * itself a demo (window.__DEMO_MODE). Chanlytics.html, the standalone mockup, is such a session: its server writes the
 * files manifest.ts lists and then these into it (tooling/scripts/serve-legacy.mjs), in that order.
 */
import "@/legacy/demo/data/clients-data.jsx";
import "@/legacy/demo/data/people-data.jsx";
import "@/legacy/demo/data/dashboard-data.jsx";
import "@/legacy/demo/data/store-data.jsx";
import "@/legacy/demo/data/fleet-data.jsx";
import "@/legacy/demo/data/pipeline-data.jsx";
import "@/legacy/demo/data/reports-data.jsx";
import "@/legacy/demo/data/tasks-data.jsx";
import "@/legacy/demo/pages/dashboard-a-ask.jsx";
import "@/legacy/demo/pages/segments.jsx";
import "@/legacy/demo/pages/agent-store.jsx";
import "@/legacy/demo/pages/agent-fleet.jsx";
import "@/legacy/demo/pages/agent-studio.jsx";
import "@/legacy/demo/pages/content-cal.jsx";
import "@/legacy/demo/pages/pipeline.jsx";

import "@/legacy/demo/pages/tasks.jsx";

export {};
