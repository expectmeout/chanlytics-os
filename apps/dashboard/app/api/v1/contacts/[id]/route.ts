import { AppError, consentChangeOf, dealsAreAThing } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { read, write, workspace } from "@/server/route";
import { erasureScope, recordDecision } from "@/server/verbs";
import { removeMediaObjects, scrubErasedJobs, beginErasure, FINISHED_JOB_STATES } from "@/server/service";
import { requireUuid } from "@/server/request-guards";
import {
  CALL_COLUMNS,
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  groupMessages,
  toCallDto,
  toConversationDto,
} from "@/server/dto";
import type {
  MessageDto,
  PersonDecisionDto,
  PersonDetailDto,
  PersonEscalationDto,
  PersonRowDto,
} from "@chanlytics/contracts";
import { personLike, personVisits } from "@/server/calendar";
import { personRuns } from "@/server/broadcasts";
import { leadOfPerson } from "@/server/leads";

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * DELETE /api/v1/contacts/:id — honour a deletion request.
 *
 * privacy.html promises this and nothing implemented it. Three stores hold
 * the customer: Postgres rows, the private `media` bucket, and the scheduled
 * jobs that would still speak to them.
 *
 * The contact is the row (erasureScope): found under RLS whether or not
 * they are already erased, so a contact the caller cannot see is a 404
 * rather than a leak, and the role (owner) is judged against the contact's
 * own workspace, never a default one.
 *
 * ORDER IS THE DESIGN. The keys are read first (reads only, retryable with
 * nothing to undo). Then the BLOCK (beginErasure, 00124): from that moment the
 * wire refuses the person and the passive doors will not bring them back,
 * whatever happens to the legs below. Then the copies keyed on the number
 * (Ask turns, finished jobs) are scrubbed while the number is still in hand,
 * fail-closed, because nothing after the tombstone can find them again.
 * Storage objects go next, before the rows that name their paths, and a
 * Storage failure STOPS there rather than running the irreversible delete;
 * the person is blocked meanwhile, not live. The rows go LAST, in one
 * transaction. A crash at any point leaves the request retryable.
 */
export const DELETE = write({
  scope: erasureScope,
  role: "owner",
  rate: "erase",
  handle: async ({ ctx, row: contact }) => {
    const id = contact.id;

    // Already erased: never destroy twice, but DO re-drive every leg that may
    // still be outstanding. The legs below step 4 are best effort by design --
    // they log and carry on rather than turn a finished erasure into a failure
    // -- so a transient refusal on any of them leaves the erased person's
    // words in Ask, their number in a done job's payload, or their name on a
    // policy row. All of them are deletes or overwrites keyed on the contact,
    // so repeating one that already ran costs nothing.
    //
    // The needles are empty here, nothing is left to recover them from, and
    // nothing needs them: step 2 scrubbed every copy keyed on the number before
    // anything was destroyed, fail-closed, and erase_contact scrubs the jobs it
    // cancels in the same transaction. A re-drive repeats the id-keyed legs.
    if (contact.erased_at) {
      const needles: string[] = [];
      const { error: polErr } = await ctx.supabase
        .from("policies")
        .delete()
        .eq("tenant_id", contact.tenant_id)
        .eq("subject_type", "contact")
        .eq("subject_id", id);
      if (polErr) console.error("erase_person_policy_failed", id, polErr.message);
      const { error: askErr } = await ctx.supabase.rpc("scrub_ask_for_contact", {
        p_tenant_id: contact.tenant_id,
        p_contact_id: id,
        p_needles: needles,
      });
      if (askErr) console.error("erase_ask_scrub_failed", id, askErr.message);
      const jobs = await scrubErasedJobs(contact.tenant_id, id, needles).catch((e: unknown) => {
        console.error("erase_jobs_scrub_failed", id, e instanceof Error ? e.message : e);
        return 0;
      });
      return {
        contact_id: id,
        already_erased: true,
        erased_at: contact.erased_at,
        redriven: { policy: !polErr, ask: !askErr, jobs },
      };
    }

    /* ---- 1. keys and paths, read while the rows still exist ---- */
    // THESE READS FAIL CLOSED. Nothing has been destroyed yet, so a read that
    // could not be made is a retry — and an identities read that came back
    // empty because it errored would scrub the Ask turns without the WhatsApp
    // wa_ids, leaving the customer's number quoted in an assistant's memory
    // while the owner is told the person was erased.
    const keyRead = (what: string, e: { message: string } | null): void => {
      if (e)
        throw new AppError("internal", `Could not read this person's ${what}, so nothing was deleted. Try again.`, 500);
    };
    const { data: idents, error: identErr } = await ctx.supabase
      .from("contact_identities")
      .select("external_id")
      .eq("contact_id", id);
    keyRead("WhatsApp identities", identErr);
    // Every spelling of the customer's number, as an Ask turn may quote it:
    // the WhatsApp wa_id is bare digits and a call's from_number is E.164, so
    // both are reduced to the digits.
    const threadIds = [
      ...new Set(
        [contact.phone_e164 ?? "", ...(idents ?? []).map((i) => i.external_id ?? "")].map(digits).filter(Boolean),
      ),
    ];

    const { data: calls, error: callErr } = await ctx.supabase.from("calls").select("recording").eq("contact_id", id);
    keyRead("call recordings", callErr);
    const { data: media, error: mediaErr } = await ctx.supabase
      .from("messages")
      .select("media")
      .eq("contact_id", id)
      .not("media", "is", null);
    keyRead("stored media", mediaErr);
    const paths = [
      ...new Set(
        [
          ...(calls ?? []).map((c) => (c.recording as { storage_path?: string } | null)?.storage_path),
          ...(media ?? []).map((m) => (m.media as { storage_path?: string } | null)?.storage_path),
        ].filter((p): p is string => !!p),
      ),
    ];

    /* ---- the block, before anything is destroyed ---- */
    // After the reads (they destroy nothing and a failed one is a retry with
    // nothing to undo), before the first destructive leg. Written with the
    // number still on the row: the digest the tombstone keeps is computed
    // from it. A write that could not be made is a retry too.
    try {
      await beginErasure(contact.tenant_id, id, { phone: contact.phone_e164 ?? null, email: contact.email ?? null });
    } catch (e) {
      console.error("erase_begin_failed", id, e instanceof Error ? e.message : e);
      throw new AppError(
        "internal",
        "Could not mark this person as being erased, so nothing was deleted. Try again.",
        500,
      );
    }

    /* ---- 2. the copies keyed on the number, while the number is still in hand ---- */
    // FAIL CLOSED, and BEFORE anything is destroyed. An Ask turn that quoted
    // the number and a finished job that carried it (`to_phone` in a done
    // outbound_send) are found by digits the tombstone will not hold and
    // contact_identities will no longer have, so a re-driven erasure could
    // never reach them. Scrubbed here, a transient refusal is a retry with
    // nothing to undo; scrubbed only after the rows are gone, it was a copy
    // kept for ever. Scheduled jobs are left to erase_contact, which cancels
    // and scrubs them in the same transaction as the delete; one in flight
    // finishes first, and the best-effort pass after step 4 reaches it.
    {
      const { error: askErr } = await ctx.supabase.rpc("scrub_ask_for_contact", {
        p_tenant_id: contact.tenant_id,
        p_contact_id: id,
        p_needles: [...threadIds, ...(contact.email ? [contact.email] : [])],
      });
      if (askErr) {
        console.error("erase_ask_prescrub_failed", id, askErr.message);
        throw new AppError(
          "internal",
          "The assistant's memory of this person could not be scrubbed, so nothing was deleted. Try again.",
          500,
        );
      }
      try {
        await scrubErasedJobs(contact.tenant_id, id, threadIds, FINISHED_JOB_STATES);
      } catch (e) {
        console.error("erase_jobs_prescrub_failed", id, e instanceof Error ? e.message : e);
        throw new AppError(
          "internal",
          "The finished jobs that carried this person's number could not be scrubbed, so nothing was deleted. Try again.",
          500,
        );
      }
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
          "completed. Nothing has been deleted, and repeating this request finishes the job.",
        500,
      );
    }

    /* ---- 4. the rows, in one transaction, carrying the legs into the ledger ---- */
    const { data: rpc, error: rpcErr } = await ctx.supabase.rpc("erase_contact", {
      p_contact_id: id,
      p_legs: {
        storage: { requested: storage.requested, removed: storage.removed.length },
      } as unknown as Json,
    });
    if (rpcErr) throw new Error(`erase_contact: ${rpcErr.message}`);
    // The person's own receptionist setting goes with them: a policy row scoped
    // to an erased contact is a name that outlives its erasure.
    {
      const { error: polErr } = await ctx.supabase
        .from("policies")
        .delete()
        .eq("tenant_id", contact.tenant_id)
        .eq("subject_type", "contact")
        .eq("subject_id", id);
      if (polErr) console.error("erase_person_policy_failed", id, polErr.message);
    }
    // The Ask turns that quoted them, for every member of the workspace: an
    // assistant's memory of a person is a name that outlives its erasure too.
    {
      const { data: scrubbed, error: askErr } = await ctx.supabase.rpc("scrub_ask_for_contact", {
        // The thread keys, and the address: an Ask turn can quote either. Read
        // off the row before erase_contact ran, because the row no longer has it.
        // Step 2 already scrubbed with these needles; this pass catches a turn
        // written since, and a re-driven erasure (above) scrubs by the id alone.
        p_tenant_id: contact.tenant_id,
        p_contact_id: id,
        p_needles: [...threadIds, ...(contact.email ? [contact.email] : [])],
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
      counts?: Record<string, number>;
      storage_paths?: string[];
      jobs_canceled?: number;
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
      // row on the same subject rather than an edit of the first. Best effort
      // like the legs above it: past step 4 the person IS erased, and
      // throwing here would report that as a failure and send the owner back to
      // a route that now answers `already_erased`.
      await recordDecision(ctx, contact.tenant_id, "contact", id, "erase", {
        leg: "storage_sweep",
        requested: sweep.requested,
        removed: sweep.removed.length,
        error: sweep.error,
      } as Json).catch((e: unknown) => {
        console.error("erase_sweep_decision_failed", id, e instanceof Error ? e.message : e);
      });
    }

    return {
      contact_id: id,
      erased: true,
      counts: out.counts ?? {},
      jobs_canceled: out.jobs_canceled ?? 0,
      storage: {
        requested: storage.requested + (sweep?.requested ?? 0),
        removed: storage.removed.length + (sweep?.removed.length ?? 0),
        error: sweep?.error ?? null,
      },
    };
  },
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
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const id = requireUuid(ctx.params.id, "contact");
    const tenantId = member.tenantId;
    const { data: rows, error } = await ctx.supabase.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: id });
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0] as PersonRowDto | undefined;
    if (!row) throw new AppError("not_found", "This person is not in your workspace.", 404);

    const sb = ctx.supabase;
    const [idents, convs, calls, personPol, wsPol, added, own, cfgRow, history, runs, lead, deals, anyDeal] =
      await Promise.all([
        sb
          .from("contact_identities")
          .select("channel, external_id, created_at")
          .eq("contact_id", id)
          .order("created_at"),
        sb
          .from("conversations")
          .select(CONVERSATION_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("contact_id", id)
          .order("last_message_at", { ascending: false, nullsFirst: false }),
        sb
          .from("calls")
          .select(CALL_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("contact_id", id)
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(200),
        // This person's own receptionist mode, and the workspace's, for the rail.
        sb
          .from("policies")
          .select("mode")
          .eq("tenant_id", tenantId)
          .eq("class", "reply")
          .eq("subject_type", "contact")
          .eq("subject_id", id)
          .maybeSingle(),
        sb
          .from("policies")
          .select("mode")
          .eq("tenant_id", tenantId)
          .eq("class", "reply")
          .is("subject_type", null)
          .maybeSingle(),
        // Where they came from, when it was not a message or a call: the
        // calendar sweep records the appointment that named them.
        sb
          .from("events")
          .select("data, created_at")
          .eq("tenant_id", tenantId)
          .eq("kind", "contact.added")
          .eq("subject_type", "contact")
          .eq("subject_id", id)
          .order("created_at")
          .limit(1)
          .maybeSingle(),
        // The owner's notes and their proposal link (00154): the two columns people_list does not carry.
        sb.from("contacts").select("notes, proposal_url").eq("id", id).maybeSingle(),
        // The booking link, so the profile can text it in one step.
        sb.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
        // Every change to either answer: the ledger rows the doors write, which
        // the timeline shows as evidence. Newest first, two hundred at most.
        sb
          .from("events")
          .select("id, subject_id, created_at, data")
          .eq("tenant_id", tenantId)
          .eq("kind", "contact.consent_changed")
          .eq("subject_type", "contact")
          .eq("subject_id", id)
          .order("created_at", { ascending: false })
          .limit(200),
        // The runs that named them, and the lead they were found as: what a playbook or a broadcast sent them, and the
        // way back to where the finder found them.
        personRuns(ctx, tenantId, id),
        leadOfPerson(ctx, tenantId, id),
        // Their deals, newest first, and whether any deal was ever recorded here (0004). Each is safe on an older
        // database: a table that is not there costs the section, never the profile.
        sb
          .from("deals")
          .select(
            "id, contact_id, service, stage, proposed_at, decided_at, ended_at, amount_cents, per, currency, note, version, created_at",
          )
          .eq("tenant_id", tenantId)
          .eq("contact_id", id)
          .order("created_at", { ascending: false })
          .then((r) => (r.error ? null : (r.data ?? []))),
        sb
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .then((r) => (r.error ? false : (r.count ?? 0) > 0)),
      ]);
    if (history.error) throw new Error(history.error.message);
    if (own.error) throw new Error(own.error.message);
    // Checked like the other seven. A dropped error here reads as "this
    // workspace has no booking link", which is indistinguishable on the page
    // from one that never set one -- so the "text them the link" step simply
    // vanishes for a workspace that has it configured.
    if (cfgRow.error) throw new Error(cfgRow.error.message);
    if (added.error) throw new Error(added.error.message);
    const bookingLink = (cfgRow.data?.config as { brain?: { booking_link?: unknown } } | null)?.brain?.booking_link;
    // The profile's services and its consult-first rule: whether deals are a thing here, and the page's service picker.
    const profile = (
      cfgRow.data?.config as {
        brain?: { profile?: { services?: { name: string }[]; booking_rules?: { consult_first?: string[] } } };
      } | null
    )?.brain?.profile;
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
        sb
          .from("messages")
          .select(MESSAGE_COLUMNS)
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(2000),
        sb
          .from("escalations")
          .select("id, conversation_id, reason, state, details, created_at, updated_at, resolved_by_user_id")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false }),
        sb
          .from("decisions")
          .select("id, verb, subject_type, subject_id, actor_type, actor_user_id, created_at, payload")
          .eq("subject_type", "conversation")
          .in("subject_id", convIds)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (msgs.error) throw new Error(msgs.error.message);
      if (escs.error) throw new Error(escs.error.message);
      if (decs.error) throw new Error(decs.error.message);
      byConv = groupMessages(msgs.data ?? []);
      escalations = escs.data ?? [];
      decisions = (decs.data ?? []).map((d) => ({ ...d, payload: d.payload as Record<string, unknown> | null }));
    }

    // Their appointments on the owner's calendar, when one is connected.
    // Never fatal: a feed that cannot be read costs this line, not the profile.
    const visits = await personVisits(ctx, tenantId, personLike(row)).catch((e: unknown) => {
      console.error(
        "person_visits_failed",
        JSON.stringify({ contact: id, error: e instanceof Error ? e.message : String(e) }),
      );
      return null;
    });

    const person: PersonDetailDto = {
      row: { ...row, effective_reply_mode: personPol.data?.mode ?? wsPol.data?.mode ?? null },
      identities: idents.data ?? [],
      conversations: (convs.data ?? []).map((c) => toConversationDto(c, byConv.get(c.id) ?? [], ctx.userId)),
      calls: (calls.data ?? []).map(toCallDto),
      escalations,
      decisions,
      receptionist_mode: personPol.data?.mode ?? null,
      workspace_reply_mode: wsPol.data?.mode ?? null,
      visits: visits ?? undefined,
      notes: own.data?.notes ?? null,
      proposal_url: own.data?.proposal_url ?? null,
      booking_link: typeof bookingLink === "string" && bookingLink.trim() ? bookingLink.trim() : null,
      consent_history: (history.data ?? []).map(consentChangeOf),
      campaigns: runs,
      lead,
      deals: deals ?? undefined,
      deals_on: dealsAreAThing(profile?.booking_rules?.consult_first, anyDeal),
      services: (profile?.services ?? []).map((s) => s.name),
      added: added.data
        ? {
            at: added.data.created_at,
            source: String((added.data.data as { source?: unknown } | null)?.source ?? "manual"),
            title:
              typeof (added.data.data as { title?: unknown } | null)?.title === "string"
                ? String((added.data.data as { title: string }).title)
                : null,
          }
        : undefined,
    };
    return { person };
  },
});
