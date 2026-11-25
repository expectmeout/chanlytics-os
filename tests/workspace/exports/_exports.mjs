/**
 * The world the tests of exports/ share. Split by behaviour from exports.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * Exports: a thread as text, a call as text, everyone as a CSV.
 *
 * "Export transcript" was a menu item that opened an overlay stubbed outside
 * demos, and the privacy policy promised "access or deletion" with only the
 * deletion half built. The formatters are executed here; the routes are
 * checked for the door they keep (owner only for the list, a named workspace,
 * the rate bucket) and the wrapper for the one thing it had to learn: a
 * handler may hand back a file.
 */
import "../../_stub-react.mjs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXPORT_SECTIONS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

// Modules that build a service client on first use read these; nothing here dials it.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

export const here = path.dirname(fileURLToPath(import.meta.url));

// The link People builds to the route's file (surfaces/people/shell-verbs.ts), run in the test below.
export const { exportLink, personExportLink } = await importSrc("apps/dashboard/src/surfaces/people/shell-verbs.ts");

export const X = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/shared/export-file.ts")).href
);

export const TZ = "America/New_York";

export const OPTS = { business: "Marisa's Beauty Salon", tz: TZ, exportedAt: new Date("2026-09-05T15:04:00Z") };

export const contact = {
  id: "p1",
  display_name: null,
  wa_profile_name: "Dani 💅",
  phone_e164: "+19175550100",
  consent: null,
  dnc: false,
};

export const msg = (over) => ({
  id: "m",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "hi",
  media: null,
  meta: null,
  status: "sent",
  created_at: "2026-09-01T14:00:00Z",
  channel_ts: null,
  ...over,
});

/* ----------------------------------------------------------------------------
 * THE WHOLE WORKSPACE. The privacy page has said "an owner can export a
 * workspace's data" since it was written; three partial routes were the whole
 * of it. The bundle is composed here over readers in memory, and the route is
 * run over a database in memory: what is proved is every section, every page,
 * the door (owners, the workspace named, the export bucket) and that the file
 * parses.
 * ------------------------------------------------------------------------- */
export const B = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/export/bundle.ts")).href
);

/** The sections the bundle reads page by page (packages/db exportSectionPages): all but the six it reads its own way. */
export const PAGED = EXPORT_SECTIONS.filter(
  (s) => !["people", "conversations", "files", "calls", "consent_history", "team"].includes(s),
);

/** Readers of those sections over these rows, each recording what it was asked. */
export const pagedSections = (asked, rows = {}) =>
  Object.fromEntries(
    PAGED.map((section) => [
      section,
      async (o, l) => {
        asked.push([section, o, l]);
        return (rows[section] ?? []).slice(o, o + l);
      },
    ]),
  );

/** A person's row as People reads it (people_list), for the page's view model. */
export const PERSON_ROW = {
  display_name: "Maria Lopez",
  wa_profile_name: null,
  phone_e164: "+13055550134",
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  marketing_consent: "unknown",
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "cv1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: "2026-09-05T14:00:00Z",
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: null,
  last_inbound_at: "2026-09-05T14:00:00Z",
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: "2026-06-01T14:00:00Z",
  earliest_row_at: null,
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
};

/* ----------------------------------------------------------------------------
 * EVERYONE, EACH ONCE. People's order is the latest contact first, a moment
 * that moves whenever someone writes or calls. The pages of a copy were read
 * by offset (the bundle) or by a cursor on that moment (the CSV), so someone
 * who wrote while they were read moved past the place the next page began:
 * never exported, and by offset the person on the boundary exported twice.
 * The file looked whole. Run here over a workspace past two pages whose people
 * move while it is read, through both routes.
 * ------------------------------------------------------------------------- */

/**
 * A workspace of `n` people as people_list pages them (0021, 00276): in the kept order, the latest contact first,
 * after a cursor or an offset, at most a thousand a call, or one person by their key. `places: false` is a database
 * before 00276, whose rows carry no place and are paged by offset. `world.between(k)` runs before the k-th call answers,
 * so someone can write, or fall quiet, between two pages; `asked` is every call's arguments.
 */
export function peopleWorld(T, n, { places = true } = {}) {
  const idOf = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const people = Array.from({ length: n }, (_, i) => ({
    id: idOf(i + 1),
    at: new Date(Date.UTC(2026, 8, 1) - i * 60_000).toISOString(),
    added: "2026-01-01T00:00:00.000Z",
  }));
  // The order's comparison, falling: -1 when a comes first.
  const before = (a, b) =>
    a.at !== b.at ? (a.at > b.at ? -1 : 1) : a.added !== b.added ? (a.added > b.added ? -1 : 1) : a.id > b.id ? -1 : 1;
  const row = (p) => ({
    id: p.id,
    display_name: `Person ${p.id.slice(-4)}`,
    wa_profile_name: null,
    phone_e164: null,
    consent: "opted_in",
    dnc: false,
    ...(places ? { in_touch_at: p.at, added_at: p.added } : {}),
  });
  const world = {
    idOf,
    asked: [],
    between: () => {},
    contacts: people.map((p) => ({
      id: p.id,
      tenant_id: T,
      display_name: `Person ${p.id.slice(-4)}`,
      erased_at: null,
      merged_into_contact_id: null,
    })),
    people_list: (a) => {
      world.asked.push(a);
      world.between(world.asked.length);
      if (a.p_contact_id) return people.filter((p) => p.id === a.p_contact_id).map(row);
      const order = [...people].sort(before);
      const after = a.p_after_id ? { at: a.p_after_at, added: a.p_after_added, id: a.p_after_id } : null;
      if (after && !places) throw new Error("a database before 00276 was named a cursor");
      const from = after ? order.filter((p) => before(after, p) < 0) : order.slice(a.p_offset ?? 0);
      return from.slice(0, Math.min(a.p_limit ?? 1000, 1000)).map(row);
    },
    /** They write: the latest contact in the workspace, so the top of the order. */
    writes: (id) => {
      people.find((p) => p.id === id).at = "2026-09-02T00:00:00.000Z";
    },
    /** Their one spoken message is undone (a reply that failed): never in touch, so the bottom of the order. */
    fallsQuiet: (id) => {
      people.find((p) => p.id === id).at = "-infinity";
    },
    ids: people.map((p) => p.id),
  };
  return world;
}

/** Between the first page and the second, one the pass has not reached writes and one it has read falls quiet. */
export const movesWhileRead = (world) => (k) => {
  if (k !== 2) return;
  world.writes(world.idOf(2200));
  world.fallsQuiet(world.idOf(3));
};
