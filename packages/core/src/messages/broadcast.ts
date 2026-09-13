import { BROADCAST_CHUNK, BROADCAST_GAP_MS, OUTCOME_UNKNOWN, firstNameOf, parseParamSpec, purposeOfTemplate, renderTemplate, resolveParams, type ParamSpec } from "@chanlytics/contracts";
import type { BroadcastBatchCommand, BroadcastBatchPorts, ContactRow } from "./ports";

/**
 * broadcast_send: one batch of a broadcast, then the next.
 *
 * The route enrolled the recipients; this sends to up to BROADCAST_CHUNK of
 * them, re-checking each person at the wire — the one place a miss is
 * unrecoverable — and records why anyone was held back. Then it schedules
 * itself again for the rest, or closes the broadcast and tells the
 * workspace. A canceled broadcast stops at the next batch; a template that
 * is no longer approved fails it before a single send.
 */
export async function sendBroadcastBatch(ports: BroadcastBatchPorts, cmd: BroadcastBatchCommand): Promise<void> {
  const b = await ports.broadcast(cmd.broadcastId);
  if (!b) return;
  // Only a scheduled or sending broadcast goes out: a run waiting for a
  // person (pending_approval) has no job, and one that ended stays ended.
  if (b.state !== "scheduled" && b.state !== "sending") return;
  // A paused workspace (tenants.status, written by billing) sends nothing:
  // the run fails with its reason and the owner is told, rather than a
  // template going out under a subscription that stopped.
  if (await ports.workspacePaused()) {
    await ports.fail(b.id, "paused");
    await ports.alert(`Broadcast “${b.name}” not sent`, "The workspace is paused until billing resumes, so nothing went out. Resume from Settings › Billing and send it again.");
    return;
  }
  if (b.state === "scheduled") await ports.startSending(b.id);

  // The template must still be what Meta approved.
  const tpl = await ports.template(b.template_name, b.template_language);
  if (!tpl || tpl.meta_status !== "approved") {
    await ports.fail(b.id, "template_not_approved");
    await ports.alert(`Broadcast “${b.name}” stopped`, `The template “${b.template_name}” is no longer approved by WhatsApp, so nothing was sent.`);
    return;
  }
  // WHICH yes this send needs. Meta's category is the authority — it can
  // recategorise a live template — and purposeOfTemplate fails closed, so a
  // template whose category we do not have reads as marketing and needs the
  // stronger consent rather than the weaker one.
  const purpose = purposeOfTemplate(tpl.category);

  // What fills each slot: typed text once, the rest per person. The
  // workspace's own words for the slots that name it are read once.
  const specs: ParamSpec[] = Array.isArray(b.params)
    ? (b.params as unknown[]).map((p) => parseParamSpec(p) ?? { kind: "text" as const, value: String(p) })
    : [];
  const { businessName, bookingLink } = await ports.facts();
  const batch = await ports.batch(b.id, BROADCAST_CHUNK);

  let begun = 0;
  for (const r of batch) {
    // Yield before the runner's ceiling rather than be killed mid-send: no new
    // send starts after the deadline, and the follow-up job below carries the
    // rest. One person at least, so a batch that starts late still moves on.
    if (begun > 0 && ports.now() >= cmd.deadline) break;
    begun += 1;
    // FAIL CLOSED per person: a read that fails leaves them queued for the
    // next batch rather than guessing; "we could not check" is not "yes".
    let c: ContactRow | null;
    try {
      c = await ports.contact(r.contact_id);
    } catch (e) {
      console.error("broadcast_contact_unreadable", r.contact_id, e instanceof Error ? e.message : String(e));
      continue;
    }
    if (!c || c.erased_at) { await ports.mark(b.id, r.contact_id, { state: "skipped", reason: "erased" }); continue; }
    if (!c.phone_e164) { await ports.mark(b.id, r.contact_id, { state: "skipped", reason: "no_phone" }); continue; }
    // A run that died between the wire and its own bookkeeping left this
    // person a message row and a queued recipient row. Resumed (jobs/settle
    // reschedules the rest), the batch reads the row rather than sending twice:
    // they got it, and the recipient row now says so.
    const prior = await ports.alreadySent(b.id, c.id);
    // Their row records when the message actually LEFT, not when this run
    // noticed it had: the broadcast's page lists its people in that order, and
    // a resumed run stamping "now" on an hour-old send reorders the whole list.
    if (prior) { await ports.mark(b.id, r.contact_id, { state: "sent", message_id: prior.id, sent_at: prior.sentAt }); continue; }
    // The thread this send belongs to. Which yes this message needs, the
    // pause, and the workspace's status are the door's to re-read at the
    // wire, below — the one place a stale answer cannot be taken back.
    const target = await ports.target(c.phone_e164);
    if (!target) { await ports.mark(b.id, r.contact_id, { state: "skipped", reason: "no_phone" }); continue; }

    // Their own words in the slots: a first name nobody has on file reads
    // "there"; a slot nothing can fill holds the person, never a blank send.
    // A visit run's words for this person, resolved when the run was made.
    const facts = (r.facts !== null && typeof r.facts === "object" && !Array.isArray(r.facts) ? r.facts : {}) as Record<string, unknown>;
    const params = resolveParams(specs, {
      firstName: firstNameOf(c.display_name, c.wa_profile_name), businessName, bookingLink,
      visitWhen: typeof facts.visit_when === "string" ? facts.visit_when : null,
      visitService: typeof facts.visit_service === "string" ? facts.visit_service : null,
    });
    if (params.some((v) => !v)) { await ports.mark(b.id, r.contact_id, { state: "skipped", reason: "missing_value" }); continue; }
    const words = renderTemplate(tpl.body_preview, params);
    // CLAIM THIS PERSON BEFORE THE WIRE IS TOUCHED. deliver records a
    // broadcast's message only once the provider has accepted it, so a run
    // killed in between leaves no message row: `alreadySent` above finds
    // nothing, this row still says 'queued', and the resumed run sends the same
    // template to the same person a second time — the one thing a broadcast
    // must never do, and the thing the whole SPEAKS_TO_A_PERSON rule exists to
    // prevent. Written first, the row says "a run was mid-send here and nobody
    // knows how it went", and a moment later it is overwritten with the truth.
    // The trade is deliberate: it risks one person who WOULD have been sent to
    // and now is not, in the gap between two adjacent writes, to close a gap
    // the width of a call to Meta — and between those two, never twice wins.
    await ports.mark(b.id, r.contact_id, { state: "failed", reason: OUTCOME_UNKNOWN });
    // The door. It asks the one predicate with this template's purpose — a
    // promotional send needs the yes to offers, an appointment reminder the
    // yes to conversation — and it asks at the wire, whatever the route found
    // when it enrolled them; then the pause, the workspace's status, the send
    // on the tenant's credentials, and the row either way. A refusal leaves no
    // row: the person's own line says why they were held.
    const out = await ports.deliver({
      tenantId: cmd.tenantId,
      conversationId: target.conversationId,
      contactId: c.id,
      to: c.phone_e164,
      channel: "whatsapp",
      sender: "human",
      purpose,
      proactive: true,
      body: words,
      template: { name: b.template_name, language: b.template_language, params },
      // A run's message names its playbook, so a thread reads "by the Win-back playbook".
      meta: {
        source: "broadcast", broadcast_id: b.id, broadcast_name: b.name,
        ...(b.playbook_id ? { playbook_id: b.playbook_id, playbook_name: String((b.audience as { label?: unknown } | null)?.label ?? b.name) } : {}),
      },
    });
    if (out.outcome === "sent") await ports.mark(b.id, r.contact_id, { state: "sent", message_id: out.messageId });
    else if (out.outcome === "refused") await ports.mark(b.id, r.contact_id, { state: "skipped", reason: out.reason });
    else await ports.mark(b.id, r.contact_id, { state: "failed", reason: "send_failed", message_id: out.messageId });
    if (BROADCAST_GAP_MS > 0) await ports.sleep(BROADCAST_GAP_MS);
  }

  const remaining = await ports.remaining(b.id);
  if (remaining > 0) {
    // Still wanted? A cancel during this batch stops here.
    if ((await ports.state(b.id)) !== "sending") return;
    await ports.scheduleNext(b.id);
    return;
  }

  const { sent, held } = await ports.tally(b.id);
  await ports.finish(b.id, { sent, held });
  await ports.alert(
    `Broadcast “${b.name}” sent`,
    `${sent} ${sent === 1 ? "person" : "people"} got it${held ? `; ${held} held back (no recorded yes, asked to stop, no number, a person had the thread, or a run that did not finish)` : ""}. Replies land in the Inbox.`,
  );
}
