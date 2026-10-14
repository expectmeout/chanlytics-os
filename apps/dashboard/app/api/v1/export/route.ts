import { z } from "zod";
import { AppError, type MessageDto } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { everyoneOnce, onePerson } from "@/server/people/people";
import { tenantFacts } from "@/server/tenant";
import { CALL_COLUMNS, MESSAGE_COLUMNS, mediaPublic, toCallDto } from "@/server/dto";
import { attachmentStream, dateTag, personLabel, safeName } from "@/server/export/export";
import {
  BUNDLE_PAGE,
  consentChangeOf,
  personBundle,
  workspaceBundle,
  type BundleReaders,
} from "@/server/export/export-bundle";
import { personSections, workspaceSections } from "@/server/export/workspace-sections";
import { recordDecision } from "@/server/verbs";
import { log } from "@/server/log";
import type { RouteContext } from "@/server/with-route";

const Query = z.object({
  /**
   * One person's own copy, by their id (the wiring's second audit, R14 X5): "Download their records" on their page, for
   * when they ask what the business holds. Without it, the workspace's.
   */
  person: z.string().uuid().optional(),
});

/**
 * A large workspace's copy is minutes of reads: five, a budget of its own rather than the host's default, which could end a
 * copy part-way with the ledger already saying it was taken (the wiring's second audit, R14 X7).
 */
export const maxDuration = 300;

/**
 * GET /api/v1/export -- the workspace's own copy, as one JSON file: people, conversations with their messages and the
 * files customers sent, calls with their transcripts, the consent history, then a section for every other kind of record
 * (contracts EXPORT_OF), what each section counted and what the file does not hold. The privacy page has promised this
 * since it was written. Owners only, like the people CSV: it is the whole customer record. Read under the owner's own
 * session, page by page, and streamed, so a workspace of any size downloads without being held whole.
 *
 * GET /api/v1/export?person=<id> -- one person's own copy (R14 X5), the same file of them alone: their row, their
 * threads and the files they sent, their calls, every change to their answers, and the sections contracts
 * PERSON_EXPORT_SECTIONS names, each read for them, with what it leaves out of the workspace's and why. The owner's, as
 * the workspace's is: it is their whole record. The ledger says who took it, on their page and in the activity log.
 */
export const GET = read({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "export",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const { supabase, userId } = ctx;
    const tenantId = member.tenantId;
    const person = input?.person;
    const { name, timezone } = await tenantFacts(supabase, tenantId);
    const now = new Date();
    const opts = { workspaceId: tenantId, business: name, tz: timezone, exportedAt: now, page: BUNDLE_PAGE };
    if (person) {
      // Their row first: a person who is not in this workspace, or was erased or merged away, has no copy to take.
      const them = await onePerson(ctx, tenantId, person);
      if (!them) throw new AppError("not_found", "Person not found.");
      log.info("export.person", { user: userId, tenant_id: tenantId, person });
      // On the ledger before the first byte, on them: their page says who took a copy of their records, and when.
      await recordDecision(ctx, tenantId, "contact", person, "export", { what: "person" });
      return attachmentStream(
        `person-${safeName(personLabel(them))}-${dateTag(now, timezone)}.json`,
        personBundle(
          {
            ...customerRecord(ctx, tenantId, person),
            people: async function* () {
              yield [them];
            },
            ...personSections(supabase, tenantId, person),
          },
          { ...opts, personId: person },
        ),
        "application/json",
      );
    }
    const readers: BundleReaders = {
      ...customerRecord(ctx, tenantId),
      // Paged: one people_list call is capped at 1000 in the database, and this
      // bundle is streamed precisely so a workspace of any size downloads whole.
      // Not by offset, as the other sections are: People's order moves as
      // someone writes, so each person is read exactly once (everyoneOnce).
      people: () => everyoneOnce(ctx, tenantId),
      ...workspaceSections(supabase, tenantId),
    };
    log.info("export.workspace", { user: userId, tenant_id: tenantId });
    // On the ledger before the first byte: the copy exists once this returns.
    await recordDecision(ctx, tenantId, "workspace", tenantId, "export", { what: "workspace" });
    return attachmentStream(
      `workspace-${safeName(name)}-${dateTag(now, timezone)}.json`,
      workspaceBundle(readers, opts),
      "application/json",
    );
  },
});

/**
 * The customer record, a page at a time, read on the owner's own session: everyone's threads, their messages, the calls
 * and every consent change, or one person's alone (`person`, a uuid the query checked).
 */
function customerRecord(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  person?: string,
): Pick<BundleReaders, "conversations" | "messages" | "calls" | "consentHistory"> {
  const { supabase } = ctx;
  const rows = async <T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  };
  return {
    conversations: (offset, limit) => {
      const all = supabase
        .from("conversations")
        .select("id, contact_id, state, created_at, last_message_at, last_inbound_at")
        .eq("tenant_id", tenantId);
      return rows(
        (person ? all.eq("contact_id", person) : all)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + limit - 1),
      );
    },
    // A batch of conversations' messages in one query (R14 X7), each with its conversation and, for a file the store
    // holds, its path: the bundle lists the file with a link and never writes the path.
    messages: async (conversationIds, offset, limit) =>
      (
        await rows(
          supabase
            .from("messages")
            .select(MESSAGE_COLUMNS)
            .in("conversation_id", [...conversationIds])
            .order("conversation_id", { ascending: true })
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + limit - 1),
        )
      ).map((m) => ({
        conversation_id: m.conversation_id,
        stored_path: storedPathOf(m.media),
        id: m.id,
        direction: m.direction as MessageDto["direction"],
        sender: m.sender as MessageDto["sender"],
        type: m.type,
        body: m.body,
        media: mediaPublic(m.media),
        // A message's meta as stored, not through memberMetaOf: this is the owner's own copy of their data, and the
        // `pricing` a receipt keeps there (K8) holds the provider's category words and no amount.
        meta: m.meta as MessageDto["meta"],
        status: m.status,
        created_at: m.created_at,
        channel_ts: m.channel_ts,
        // The wire it travelled: a person's one thread holds every channel they wrote on (R14 X4).
        ...(m.channel ? { channel: m.channel } : {}),
      })),
    calls: async (offset, limit) => {
      const all = supabase.from("calls").select(CALL_COLUMNS).eq("tenant_id", tenantId);
      return (
        await rows(
          (person ? all.eq("contact_id", person) : all)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + limit - 1),
        )
      ).map(toCallDto);
    },
    // Every change to either answer: a person's are the ones about them (the event's subject is the person).
    consentHistory: async (offset, limit) => {
      const all = supabase
        .from("events")
        .select("id, subject_id, created_at, data")
        .eq("tenant_id", tenantId)
        .eq("kind", "contact.consent_changed");
      return (
        await rows(
          (person ? all.eq("subject_id", person) : all)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + limit - 1),
        )
      ).map(consentChangeOf);
    },
  };
}

/** Where a message's file is kept, once the store holds it; none for one still fetching or never fetched. */
function storedPathOf(media: unknown): string | null {
  if (!media || typeof media !== "object") return null;
  const m = media as { storage_path?: unknown; fetch_state?: unknown };
  return m.fetch_state === "stored" && typeof m.storage_path === "string" ? m.storage_path : null;
}
