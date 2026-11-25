/**
 * The world the tests of line/ share. Split by behaviour from ask.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * Ask: the palette, the quick answers, and the turn.
 *
 * The mockup's Ask answered from a seed world through regexes; on a real
 * workspace every entry point was a "Soon" tag. Now the palette reads the
 * workspace: jumps from the cache, Today's queue as "Right now",
 * suggestions from the data, three questions answered without a model, and
 * a model turn that reads through capped view-model tools as the signed-in
 * person, answers in the Line's shape, and may name only what it read. The
 * answer's own tests are ask-answer.test.mjs; the turn's, ask-turn.test.mjs.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPORT_LENSES, lensRoute } from "@chanlytics/contracts";
import { askPages } from "../../../apps/dashboard/src/bridge/ask/jump.ts";

export const here = path.dirname(fileURLToPath(import.meta.url));

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

// The assistant's tools as the registry offers them (server/ask/tools): data, read from no source file.
export const { toApiTools, ACT_TOOL_NAMES } = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/tools/index.ts")).href
);

// The rules the model is told (prompt.ts), read as it reads them.
export const { systemBlocks } = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/prompt/prompt.ts")).href
);

export const { ASK_RULES } = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/prompt/stable-system.ts")).href
);

// The words history a turn is asked with (executed in ask-turn.test.mjs): memory.ts's, beside the live replay.
export const { foldHistory } = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/ask/memory.ts")).href
);

// Sorted by name, the acts among the reads (D11): told apart by the act names the loop itself tells apart.
// The reads of ours: the tool search is the API's own, offered last.
export const READ_TOOLS = toApiTools("owner", true).filter((t) => !ACT_TOOL_NAMES.has(t.name) && !t.type);

export const ACT_TOOLS = toApiTools("owner", true).filter((t) => ACT_TOOL_NAMES.has(t.name));

export const NOW = Date.parse("2026-09-05T15:00:00Z");

export const ID = "3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c";

export const ID2 = "9f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5d";

/* ------------------------------------------------ the jumps (Ask Rewired, Phase 7) */

// ⌘K's jumps against the pages a workspace has: every page the shell's registry calls real, and People's scopes beside
// them, is a jump away; every jump lands on a real page, where that page is now, and on a page an answer may name. The
// Pipeline is every workspace's (0008, amended 18 Oct 2026) and the back office Chanlytics staff's, read from the bit
// its own door is drawn by (Settings' rail); Memory lands on Business, where what the receptionist knows lives (#417).
// A real page added to the registry without a jump fails here.
export const { SURFACE_STATES, surfaceStateFor, surfaceRetiredTo } = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/bridge/surface-registry.ts")).href
);

export const { jumpIndexFrom } = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/bridge/ask/palette.ts")).href
);

/**
 * Every page a workspace can have, and the jump that reaches it: its label, and where it lands. The keys are the
 * registry's real routes, and People's scopes the registry routes as `clients` (SCOPES).
 */
export const REACHED = {
  today: ["Today", "today"],
  inbox: ["Inbox", "inbox"],
  conversations: ["Conversations", "conversations"],
  clients: ["People", "clients"],
  reports: ["Reports", "reports"],
  live: ["Calls", "live"],
  // The route moves to the scope (SURFACE_RETIRED), and the jump goes straight there.
  leads: ["Leads", "clients/leads"],
  // People › Lists is People's rail; `segments/<id>` still lands there.
  segments: ["Lists", "clients"],
  calendar: ["Calendar", "calendar"],
  // Campaigns, which is Sequences (decision 0060); the old Playbooks list, `outbound`, is a door to it (contracts retiredRouteOf).
  campaigns: ["Campaigns", "campaigns/sequences"],
  outbound: ["Campaigns", "campaigns/sequences"],
  "campaigns/sequences": ["Campaigns", "campaigns/sequences"],
  // Sent's list went to each sequence's History (D3): its sheets stay at their addresses, and its jump is Sequences'.
  broadcasts: ["Campaigns", "campaigns/sequences"],
  // Messages (D4: once the Library), Campaigns' other view, found by its old names (ask-palette.test.mjs) and address.
  "campaigns/messages": ["Campaigns", "campaigns/sequences"],
  messages: ["Campaigns", "campaigns/sequences"],
  // Forms (00680), Campaigns' third view (decision 0147): an address of `campaigns`, listed in SCOPES.
  "campaigns/forms": ["Forms", "campaigns/forms"],
  start: ["Setting up", "start"],
  "admin/profile": ["Profile", "admin/profile"],
  "admin/workspace": ["Settings", "admin/workspace"],
  "admin/hours": ["Hours & booking", "admin/hours"],
  "admin/files": ["Library", "campaigns/content:library"],
  "admin/content": ["Content settings", "admin/content"],
  "admin/receptionist": ["How it answers", "admin/receptionist"],
  "admin/outreach": ["Cold email", "admin/outreach"],
  "admin/team": ["Team", "admin/team"],
  "admin/autonomy": ["Autonomy", "admin/autonomy"],
  "admin/notifications": ["Notifications", "admin/notifications"],
  "admin/integrations": ["Connections", "admin/integrations"],
  "admin/billing": ["Billing", "admin/billing"],
  // The pane says it is not built and points at How it answers: Memory's jump lands there, never on it (#417).
  "admin/memory": ["AI's memory", "admin/receptionist"],
  "admin/activity": ["Activity", "admin/activity"],
  "admin/platform": ["Back office", "admin/platform"],
  "admin/partner": ["Partner", "admin/partner"],
  // People's third scope, every workspace's (0008, amended 18 Oct 2026): an address of `clients`, not a route of the
  // registry's own.
  "clients/pipeline": ["Pipeline", "clients/pipeline"],
};

// People's scopes are listed by hand: a scope is an address of `clients`, which the registry routes as one page, so a
// new scope's jump is this list's to add (surfaces/people/words.ts plScopes).
// Forms is an address of `campaigns` the same way (decision 0147), and its jump is listed by hand too.
export const SCOPES = ["clients/pipeline", "campaigns/forms"];

// Reports' lenses are addresses of `reports`, which the registry routes as one page: each lens's jump is derived from the
// lens registry (contracts REPORT_LENSES), so a lens that joins it is a jump here without a line of this table. The Ads lens is
// the one the palette does not list: it is shown where the workspace has ads (`ads_on`, a demo session for now), and a real
// workspace's palette has none of it (report-lenses.test.mjs holds that it is no jump).
for (const lens of REPORT_LENSES.filter((l) => l.id !== "overview" && l.shownWhen !== "ads_on")) {
  REACHED[lensRoute(lens.id)] = [`Reports › ${lens.label}`, lensRoute(lens.id)];
  SCOPES.push(lensRoute(lens.id));
}

/** Every page, for a person on Chanlytics' staff. */
export const EVERY = askPages({ platformAdmin: true });

export const where = (to) => {
  const [page, ...rest] = to.split("/");
  return [page, rest.length ? rest.join("/") : null];
};
