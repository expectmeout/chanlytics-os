/**
 * What the kept WhatsApp Business app brings (coexistence; decision 0073, R12, R21): its contacts into People, and its
 * one-to-one chats of the last six months into each person's thread, as before Chanlytics. One runner per source
 * (history-import.ts RUNNERS), in three moves told apart by the part they are handed:
 *
 *   ask      a connect that kept the app starts both sources (history-import.ts startWhatsappHistory); the first
 *            part of each, whose connection is the channel, asks Meta for it (smb_app_data), once, inside the 24
 *            hours Meta allows. A provider that cannot be reached is asked again by the job ledger; a refusal says
 *            so on the row.
 *   bring    what Meta sends arrives on the webhook, which keeps the delivery (the intake ledger, a week) and hands it
 *            here by its key (a `sha256:` connection). Each part brings its slice of the delivery's messages or
 *            contacts, so a chunk of any size is brought a slice a part and never races the webhook's minute. Every
 *            write is once by Meta's id or by the person, so a part tried again keeps nothing twice.
 *   settle   a day and a little after the ask, a run Meta said nothing more of is done: a phase with no chats sends
 *            nothing at all, and a row would otherwise read "Coming in" for ever.
 *
 * The ledger's rows are what the first run's "Your chats, coming in" (5B·i) and Today's "Brought in" read: the
 * contacts as people; the chats as messages, their reach, and Meta's three parts (the day before, back to 90 days,
 * back to 180). A business that declined to share is told on the row in its words, never as a failure to retry.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  contactsSyncedOf,
  sharedHistoryOf,
  type WaChangeValue,
  type WaHistoryRead,
  type WaSyncedContact,
} from "../packages/channels.js";
import { DAY_MS, HOUR_MS, IMPORT_STOPPED_WORDS, normalizePhone, type ImportSource } from "../packages/contracts.js";
import {
  PERSON_FORGOTTEN,
  importCursorOf,
  importsOf,
  keepBefore,
  noteImport,
  providerEventOf,
  resolveChannelDetailed,
  resolvePerson,
  type Database,
  type Json,
} from "../packages/db.js";
import { waCredentialsForChannel } from "../tenant-runtime.js";
import { graphRetryable, smbAppData } from "../whatsapp/meta-graph.js";
import type { Part, PartOutcome } from "./history-import.js";

type Db = SupabaseClient<Database>;

/** The two sources the kept app brings. */
type WhatsappSource = Extract<ImportSource, "whatsapp_contacts" | "whatsapp_history">;
/** What Meta calls each, both as it is asked for (smb_app_data's sync_type) and as it arrives (the webhook's field). */
const SYNC_TYPE: Record<WhatsappSource, "smb_app_state_sync" | "history"> = {
  whatsapp_contacts: "smb_app_state_sync",
  whatsapp_history: "history",
};

/** How long after the number connects Meta lets its app's contacts and chats be asked for. */
const SYNC_WINDOW_MS = DAY_MS;
/** When a run Meta has said nothing more of is called done: the window, and two hours for what is still on its way. */
export const SETTLE_AFTER_MS = DAY_MS + 2 * HOUR_MS;
/** Meta's three parts of the history: the day before the number connected, back to 90 days, back to 180. */
export const HISTORY_PARTS = 3;
/** Messages a part keeps (one door call each), and contacts it brings: well inside a part's time. */
const MESSAGES_A_PART = 80;
const CONTACTS_A_PART = 120;

/** A delivery's key in the intake ledger, as the webhook hands it on (intake/keep.ts digestId). */
const isDelivery = (connectionId: string | null): connectionId is string => !!connectionId?.startsWith("sha256:");

/** Where an ask stands, on its row: the number connected, when, and Meta's request id once it was asked. */
interface AskCursor {
  channel: string | null;
  connectedAt: string | null;
  requestId: string | null;
}

function askCursorOf(raw: Json | null): AskCursor {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return { channel: text(c.channel), connectedAt: text(c.connected_at), requestId: text(c.request_id) };
}

async function stopped(db: Db, part: Part, source: WhatsappSource, error: string): Promise<PartOutcome> {
  await noteImport(db, { tenantId: part.tenantId, source, state: "failed", error, add: true });
  return { more: false };
}

/** Ask Meta for the source, once, inside its window; asked already, nothing is asked twice. */
async function askMeta(db: Db, part: Part, source: WhatsappSource, channelId: string): Promise<PartOutcome> {
  const was = askCursorOf(await importCursorOf(db, part.tenantId, source));
  if (was.requestId) return { more: false };
  const since = was.connectedAt ? Date.parse(was.connectedAt) : NaN;
  if (Number.isFinite(since) && Date.now() - since > SYNC_WINDOW_MS)
    return stopped(db, part, source, IMPORT_STOPPED_WORDS.offeredOnce);
  const creds = await waCredentialsForChannel(db, part.tenantId, channelId);
  if (creds.outcome === "unavailable") throw new Error(`the number's credentials could not be read: ${creds.error}`);
  if (creds.outcome === "absent") return stopped(db, part, source, IMPORT_STOPPED_WORDS.numberGone);
  const r = await smbAppData(creds.credentials.accessToken, creds.credentials.phoneId, SYNC_TYPE[source]);
  if (!r.ok) {
    // Meta down or busy: the job ledger asks again, inside the window. Anything else is Meta's no, said on the row.
    if (graphRetryable(r)) throw new Error(`smb_app_data ${SYNC_TYPE[source]}: ${r.error}`);
    part.log.warn("wa_history_ask_refused", { source, status: r.status, code: r.code, error: r.error });
    return stopped(db, part, source, IMPORT_STOPPED_WORDS.offeredOnce);
  }
  await noteImport(db, {
    tenantId: part.tenantId,
    source,
    state: "running",
    via: "whatsapp",
    add: true,
    cursor: {
      channel: channelId,
      connected_at: was.connectedAt,
      request_id: r.data.request_id ?? "asked",
      asked_at: new Date().toISOString(),
    },
  });
  part.log.info("wa_history_asked", { source, request_id: r.data.request_id ?? null });
  return { more: false };
}

/** A day and a little after the ask: a run still coming in is done with what came; one never asked is said so. */
async function settleRun(db: Db, part: Part, source: WhatsappSource): Promise<PartOutcome> {
  const row = (await importsOf(db, part.tenantId)).find((r) => r.source === source);
  if (!row || row.state === "done" || row.state === "failed") return { more: false };
  if (row.state === "queued") return stopped(db, part, source, IMPORT_STOPPED_WORDS.offeredOnce);
  await noteImport(db, {
    tenantId: part.tenantId,
    source,
    state: "done",
    add: true,
    ...(source === "whatsapp_history" ? { partsDone: HISTORY_PARTS } : {}),
  });
  return { more: false };
}

/**
 * The changes of a kept delivery that are this source's and this workspace's: a batch Meta sends may carry another
 * number's, whose workspace the number says (the routing the webhook did, done again here). A delivery the intake
 * ledger no longer holds (purged after a week) is none.
 */
async function changesOf(db: Db, part: Part, source: WhatsappSource, key: string): Promise<WaChangeValue[] | null> {
  const kept = await providerEventOf(db, "meta", key);
  if (!kept) return null;
  let body: { entry?: Array<{ changes?: Array<{ field?: string; value?: WaChangeValue }> }> } = {};
  try {
    body = JSON.parse(kept.body) as typeof body;
  } catch {
    return [];
  }
  const ours = new Map<string, boolean>();
  const out: WaChangeValue[] = [];
  for (const entry of body.entry ?? [])
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const number = v?.metadata?.phone_number_id;
      if (change.field !== SYNC_TYPE[source] || !v || !number) continue;
      if (!ours.has(number)) {
        const r = await resolveChannelDetailed(db, "whatsapp", number);
        if (r.lookupFailed) throw new Error("the number's workspace could not be read");
        ours.set(number, r.channel?.tenantId === part.tenantId);
      }
      if (ours.get(number)) out.push(v);
    }
  return out;
}

/** One message of the history into its person's thread, as before Chanlytics: kept, new, and whether its person is. */
async function keepMessage(db: Db, tenantId: string, m: WaHistoryRead, phase: number | null) {
  return keepBefore(db, {
    tenantId,
    channel: "whatsapp",
    external: m.thread,
    phone: normalizePhone(`+${m.thread}`),
    email: null,
    name: null,
    messageId: m.messageId,
    direction: m.direction,
    type: m.type,
    body: m.body,
    at: m.at,
    meta: { wa_type: m.rawType, history_status: m.status, history_phase: phase },
  });
}

/** The chats' slice of this part: kept a message at a time, then the row's counts, reach and parts. */
async function bringHistory(db: Db, part: Part, values: WaChangeValue[]): Promise<PartOutcome> {
  const reads = values.map(sharedHistoryOf);
  const messages = reads.flatMap((h) => h.messages);
  const phase = reads.reduce<number | null>((p, h) => (h.phase === null ? p : Math.max(p ?? 0, h.phase)), null);
  const progress = reads.reduce<number | null>(
    (p, h) => (h.progress === null ? p : Math.max(p ?? 0, h.progress)),
    null,
  );
  if (reads.some((h) => h.declined) && !messages.length)
    return stopped(db, part, "whatsapp_history", IMPORT_STOPPED_WORDS.notShared);
  const from = (part.n - 1) * MESSAGES_A_PART;
  const slice = messages.slice(from, from + MESSAGES_A_PART);
  let kept = 0;
  let people = 0;
  let oldest: string | null = null;
  const note = async (state: "running" | "done", partsDone: number) =>
    noteImport(db, {
      tenantId: part.tenantId,
      source: "whatsapp_history",
      state,
      via: "whatsapp",
      counts: { messages: kept, people },
      add: true,
      partsDone,
      partsTotal: HISTORY_PARTS,
      oldest,
    });
  const row = (await importsOf(db, part.tenantId)).find((r) => r.source === "whatsapp_history");
  const more = from + MESSAGES_A_PART < messages.length;
  const complete = !more && (progress ?? 0) >= 100;
  // Phase n arriving says the n before it are in; all of it says the three are. Never fewer than the row says.
  const partsDone = Math.max(row?.parts_done ?? 0, complete ? HISTORY_PARTS : (phase ?? 0));
  const state = complete || row?.state === "done" ? "done" : "running";
  for (const m of slice) {
    if (Date.now() >= part.until) {
      // Out of time: what was kept is counted now, and the part is tried again (what it kept is matched, not kept again).
      await note("running", partsDone);
      throw new Error("a history part ran out of time");
    }
    const r = await keepMessage(db, part.tenantId, m, phase);
    if (r.kept) kept++;
    if (r.newPerson) people++;
    if (!oldest || m.at < oldest) oldest = m.at;
  }
  await note(state, partsDone);
  return { more };
}

/** One contact into People, as a client list's: asserted, an import, never a yes; a forgotten person stays forgotten. */
async function bringContact(db: Db, tenantId: string, c: WaSyncedContact): Promise<boolean> {
  const phone = normalizePhone(c.phone);
  if (!phone) return false;
  try {
    const r = await resolvePerson(db, {
      tenantId,
      phone,
      email: null,
      name: c.name,
      assurance: "asserted",
      source: "import",
      detail: { via: "whatsapp", from: "contacts" },
    });
    return r.outcome === "new";
  } catch (e) {
    if ((e as { code?: unknown }).code === PERSON_FORGOTTEN) return false;
    throw e;
  }
}

/** The contacts' slice of this part, then the row: done with each batch, the people added to what came before. */
async function bringContacts(db: Db, part: Part, values: WaChangeValue[]): Promise<PartOutcome> {
  const contacts = values.flatMap(contactsSyncedOf);
  const from = (part.n - 1) * CONTACTS_A_PART;
  const slice = contacts.slice(from, from + CONTACTS_A_PART);
  let added = 0;
  const more = from + CONTACTS_A_PART < contacts.length;
  for (const c of slice) {
    if (Date.now() >= part.until) {
      await noteImport(db, {
        tenantId: part.tenantId,
        source: "whatsapp_contacts",
        state: "running",
        counts: { people: added },
        add: true,
      });
      throw new Error("a contacts part ran out of time");
    }
    if (await bringContact(db, part.tenantId, c)) added++;
  }
  await noteImport(db, {
    tenantId: part.tenantId,
    source: "whatsapp_contacts",
    state: more ? "running" : "done",
    via: "whatsapp",
    counts: { people: added },
    add: true,
  });
  return { more };
}

/** A part of a kept delivery: its slice of this source, brought. */
async function bring(db: Db, part: Part, source: WhatsappSource, key: string): Promise<PartOutcome> {
  const values = await changesOf(db, part, source, key);
  if (values === null) {
    part.log.error("wa_history_delivery_gone", { source, delivery: key });
    return { more: false };
  }
  if (!values.length) return { more: false };
  return source === "whatsapp_history" ? bringHistory(db, part, values) : bringContacts(db, part, values);
}

/** The runner for one of the kept app's sources: the ask, its settling, or a delivery's slice. */
function runnerFor(source: WhatsappSource) {
  return async (db: Db, part: Part): Promise<PartOutcome> => {
    if (isDelivery(part.connectionId)) return bring(db, part, source, part.connectionId);
    if (!part.connectionId) return stopped(db, part, source, IMPORT_STOPPED_WORDS.numberGone);
    return part.n === 1 ? askMeta(db, part, source, part.connectionId) : settleRun(db, part, source);
  };
}

export const whatsappContactsPart = runnerFor("whatsapp_contacts");
export const whatsappHistoryPart = runnerFor("whatsapp_history");
