import { AppError } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { recordDecision } from "@/server/verbs";
import { schedule, removeMediaObjects, rescheduleBlobErase, scrubErasedJobs } from "@/server/service";
import { requireUuid } from "@/server/request-guards";
import { CALL_COLUMNS, CONVERSATION_COLUMNS, MESSAGE_COLUMNS, groupMessages, toCallDto, toConversationDto } from "@/server/dto";
import type { MessageDto, PersonDecisionDto, PersonDetailDto, PersonEscalationDto, PersonRowDto } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * DELETE /api/v1/contacts/:id — honour a deletion request.
 *
 * privacy.html promises this and nothing implemented it. Four stores hold the
 * customer: Postgres rows, the private `media` bucket, the Vercel Blob thread,
 * and the scheduled jobs that would still speak to them.
 *
 * ORDER IS THE DESIGN. The Blob job is queued FIRST — durably, as a jobs row —
 * because its key is the customer's phone digits and after the tombstone there
 * is nowhere left to recompute it. Storage objects go SECOND, before the rows
 * that name their paths, and a Storage failure STOPS here rather than running
 * the irreversible delete. The rows go LAST, in one transaction. A crash at
 * any point leaves the request retryable; the reverse order leaves a
 * transcript in Blob that nobody can ever find again.
 */
export const DELETE = withRoute(async (_req, ctx) => {
  const id = requireUuid(ctx.params.id, "contact");
  takeRate(ctx.userId, "erase");

  // RLS scopes this read to the caller's workspaces, so a contact they cannot
  // see is a 404 rather than a leak. The ROLE is then decided against the
  // contact's own tenant, never a default workspace — passing it as `wanted`
  // also clears memberContext's `ambiguous` flag, which requireRole rejects.
  const { data: contact, error } = await ctx.supabase
    .from("contacts")
    .select("id, tenant_id, phone_e164, erased_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!contact) throw new AppError("not_found", "Contact not found.");
  requireRole(await memberContext(ctx, contact.tenant_id), "owner");

  // Already erased: never destroy twice, but DO re-drive a leg that is still
  // outstanding. This is the whole retry story for a failed Blob delete.
  if (contact.erased_at) {
    const retry = await rescheduleBlobErase(contact.tenant_id, id);
    return {
      contact_id: id, already_erased: true, erased_at: contact.erased_at,
      blob: retry ? { job_id: retry.jobId, state: "scheduled" } : { state: "settled" },
    };
  }

  /* ---- 1. keys and paths, read while the rows still exist ---- */
  const { data: idents } = await ctx.supabase
    .from("contact_identities").select("external_id").eq("contact_id", id);
  // apps/edge/lib/store.ts keys threads on phone DIGITS: the WhatsApp path uses
  // the wa_id (bare digits) and the Retell path strips the leading "+" from a
  // from_number that has already been proven E.164, so both equal the digits.
  const threadIds = [...new Set(
    [contact.phone_e164 ?? "", ...(idents ?? []).map((i) => i.external_id ?? "")]
      .map(digits).filter(Boolean),
  )];

  const { data: calls } = await ctx.supabase
    .from("calls").select("recording").eq("contact_id", id);
  const { data: media } = await ctx.supabase
    .from("messages").select("media").eq("contact_id", id).not("media", "is", null);
  const paths = [...new Set([
    ...(calls ?? []).map((c) => (c.recording as { storage_path?: string } | null)?.storage_path),
    ...(media ?? []).map((m) => (m.media as { storage_path?: string } | null)?.storage_path),
  ].filter((p): p is string => !!p))];

  /* ---- 2. Blob FIRST: queued durably before anything is destroyed ---- */
  let blob: Json;
  try {
    const { jobId } = await schedule(contact.tenant_id, "blob_thread_erase", new Date(), {
      contact_id: id, namespace: contact.tenant_id, thread_ids: threadIds,
    } as unknown as Json);
    blob = { job_id: jobId, state: "scheduled", threads: threadIds.length };
  } catch (e) {
    // Refusing here is the honest outcome: nothing has been deleted, so the
    // owner retries rather than being told a partial erasure succeeded.
    console.error("erase_blob_schedule_failed", id, e instanceof Error ? e.message : e);
    throw new AppError(
      "internal",
      "Could not queue the stored-conversation erase, so nothing was deleted. Try again.",
      500,
    );
  }

  /* ---- 3. Storage, before the rows that name it ---- */
  const storage = await removeMediaObjects(paths);
  if (storage.error) {
    // Step 4 is irreversible and it deletes the only rows that still name these
    // objects. Stop while the request is entirely retryable rather than leaving
    // a recording behind with nothing pointing at it.
    console.error("erase_storage_failed", id, storage.error);
    throw new AppError(
      "internal",
      "The stored recordings and media could not be removed, so the erasure was not " +
      "completed. The conversation itself has not been deleted; the stored-conversation " +
      "copy is already queued for removal, and repeating this request finishes the job.",
      500,
    );
  }

  /* ---- 4. the rows, in one transaction, carrying the legs into the ledger ---- */
  const { data: rpc, error: rpcErr } = await ctx.supabase.rpc("erase_contact", {
    p_contact_id: id,
    p_legs: {
      blob,
      storage: { requested: storage.requested, removed: storage.removed.length },
    } as unknown as Json,
  });
  if (rpcErr) throw new Error(`erase_contact: ${rpcErr.message}`);
  // The person's own receptionist setting goes with them: a policy row scoped
  // to an erased contact is a name that outlives its erasure.
  {
    const { error: polErr } = await ctx.supabase.from("policies").delete()
      .eq("tenant_id", contact.tenant_id).eq("subject_type", "contact").eq("subject_id", id);
    if (polErr) console.error("erase_person_policy_failed", id, polErr.message);
  }
  // The Ask turns that quoted them, for every member of the workspace: an
  // assistant's memory of a person is a name that outlives its erasure too.
  {
    const { data: scrubbed, error: askErr } = await ctx.supabase.rpc("scrub_ask_for_contact", {
      p_tenant_id: contact.tenant_id, p_contact_id: id, p_needles: threadIds,
    });
    if (askErr) console.error("erase_ask_scrub_failed", id, askErr.message);
    else console.log(JSON.stringify({ level: "info", event: "erase_ask_scrubbed", contact: id, messages: scrubbed }));
  }
  // The jobs that carried their number or words. erase_contact cancels what
  // is still scheduled; done, failed and canceled rows kept `to_phone` and
  // `body` in their payload forever.
  const jobsScrubbed = await scrubErasedJobs(contact.tenant_id, id, threadIds).catch((e: unknown) => {
    console.error("erase_jobs_scrub_failed", id, e instanceof Error ? e.message : e);
    return 0;
  });
  console.log(JSON.stringify({ level: "info", event: "erase_jobs_scrubbed", contact: id, jobs: jobsScrubbed }));
  const out = rpc as unknown as {
    counts?: Record<string, number>; storage_paths?: string[]; jobs_canceled?: number;
  };

  /* ---- 5. anything that landed during the window ----
     The RPC's set is the authoritative one (it also sees messages and calls
     reached only through the conversation). A call ingested between step 3 and
     step 4 would otherwise leave audio behind. remove() on an absent key is a
     no-op, so re-listing an already-removed path costs nothing. */
  const missed = (out.storage_paths ?? []).filter((p) => !paths.includes(p));
  const sweep = missed.length ? await removeMediaObjects(missed) : null;
  if (sweep) {
    // decisions has no UPDATE policy for a session, so a late leg is a second
    // row on the same subject rather than an edit of the first.
    await recordDecision(ctx, contact.tenant_id, "contact", id, "erase", {
      leg: "storage_sweep", requested: sweep.requested,
      removed: sweep.removed.length, error: sweep.error,
    } as Json);
  }

  return {
    contact_id: id,
    erased: true,
    counts: out.counts ?? {},
    jobs_canceled: out.jobs_canceled ?? 0,
    blob,
    storage: {
      requested: storage.requested + (sweep?.requested ?? 0),
      removed: storage.removed.length + (sweep?.removed.length ?? 0),
      error: sweep?.error ?? null,
    },
  };
});

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/contacts/:id — one person, in full.
 *
 * The same row the list shows (people_list narrowed to this contact) plus
 * everything the profile renders from: identities, conversations with their
 * messages, calls, escalations, and the operator decisions on those threads.
 * RLS floors every read; the workspace named on the request is the door.
 */
export const GET = withRoute(async (req, ctx) => {
  const id = requireUuid(ctx.params.id, "contact");
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const { data: rows, error } = await ctx.supabase.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: id });
  if (error) throw new Error(error.message);
  const row = (rows ?? [])[0] as PersonRowDto | undefined;
  if (!row) throw new AppError("not_found", "This person is not in your workspace.", 404);

  const sb = ctx.supabase;
  const [idents, convs, calls, personPol, wsPol] = await Promise.all([
    sb.from("contact_identities").select("channel, external_id, created_at").eq("contact_id", id).order("created_at"),
    sb.from("conversations").select(CONVERSATION_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", id)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    sb.from("calls").select(CALL_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", id)
      .order("started_at", { ascending: false, nullsFirst: false }).limit(200),
    // This person's own receptionist mode, and the workspace's, for the rail.
    sb.from("policies").select("mode").eq("tenant_id", tenantId).eq("class", "reply")
      .eq("subject_type", "contact").eq("subject_id", id).maybeSingle(),
    sb.from("policies").select("mode").eq("tenant_id", tenantId).eq("class", "reply")
      .is("subject_type", null).maybeSingle(),
  ]);
  if (idents.error) throw new Error(idents.error.message);
  if (personPol.error) throw new Error(personPol.error.message);
  if (wsPol.error) throw new Error(wsPol.error.message);
  if (convs.error) throw new Error(convs.error.message);
  if (calls.error) throw new Error(calls.error.message);

  const convIds = (convs.data ?? []).map((c) => c.id);
  let byConv = new Map<string, MessageDto[]>();
  let escalations: PersonEscalationDto[] = [];
  let decisions: PersonDecisionDto[] = [];
  if (convIds.length) {
    const [msgs, escs, decs] = await Promise.all([
      // Newest-first so a cap drops the oldest history; groupMessages restores order.
      sb.from("messages").select(MESSAGE_COLUMNS).in("conversation_id", convIds)
        .order("created_at", { ascending: false }).limit(2000),
      sb.from("escalations").select("id, conversation_id, reason, state, details, created_at, updated_at, resolved_by_user_id")
        .in("conversation_id", convIds).order("created_at", { ascending: false }),
      sb.from("decisions").select("id, verb, subject_type, subject_id, actor_type, actor_user_id, created_at, payload")
        .eq("subject_type", "conversation").in("subject_id", convIds)
        .order("created_at", { ascending: false }).limit(500),
    ]);
    if (msgs.error) throw new Error(msgs.error.message);
    if (escs.error) throw new Error(escs.error.message);
    if (decs.error) throw new Error(decs.error.message);
    byConv = groupMessages(msgs.data ?? []);
    escalations = escs.data ?? [];
    decisions = (decs.data ?? []).map((d) => ({ ...d, payload: d.payload as Record<string, unknown> | null }));
  }

  const person: PersonDetailDto = {
    row: { ...row, effective_reply_mode: personPol.data?.mode ?? wsPol.data?.mode ?? null },
    identities: idents.data ?? [],
    conversations: (convs.data ?? []).map((c) => toConversationDto(c, byConv.get(c.id) ?? [], ctx.userId)),
    calls: (calls.data ?? []).map(toCallDto),
    escalations,
    decisions,
    receptionist_mode: personPol.data?.mode ?? null,
    workspace_reply_mode: wsPol.data?.mode ?? null,
  };
  return { person };
});
