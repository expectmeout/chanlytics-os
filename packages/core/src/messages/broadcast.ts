import { BROADCAST_CHUNK, BROADCAST_GAP_MS, OUTCOME_UNKNOWN, firstNameOf, parseParamSpecs, purposeOfTemplate, renderTemplate, resolveParams } from "@chanlytics/contracts";
import type { Delivered } from "../deliver";
import type { BroadcastBatchCommand, BroadcastBatchPorts, ContactRow, RecipientMark, RecipientRow } from "./ports";

/**
 * How long a batch that reached nobody waits before it is tried again. The
 * rest of a run is scheduled the moment a batch ends; a batch in which every
 * read failed would otherwise schedule itself again at once, and a read that
 * keeps failing would spin the ledger until somebody canceled by hand.
 */
export const BROADCAST_STALL_RETRY_MS = 60_000;

/**
 * A failure of the wire itself rather than of one person's send: no
 * credentials, no wire for the channel in this runtime, or a provider
 * refusing the credentials outright. Nobody after it can be reached, and
 * marking each of them "WhatsApp refused" would end the run as sent.
 */
function wireIsDown(out: Extract<Delivered, { outcome: "failed" }>): boolean {
  return out.reason === "no_credentials" || out.reason === "no_sender_for_channel" || (out.reason === "provider" && (out.status === 401 || out.status === 403));
}

/**
 * The door itself threw, with the person already claimed. Nobody knows
 * whether the message left, so the claim stands; and the run stops there
 * rather than claim the next person into the same failure. The job fails
 * with the door's own error, and jobs/settle hands the people still queued
 * to a fresh run, a bounded number of times when every run dies the same way.
 */
class ThrownAtTheDoor {
  readonly error: unknown;
  constructor(error: unknown) {
    this.error = error;
  }
}

/**
 * broadcast_send: one batch of a broadcast, then the next.
 *
 * The route enrolled the recipients; this sends to up to BROADCAST_CHUNK of
 * them, re-checking each person at the wire — the one place a miss is
 * unrecoverable — and records why anyone was held back. Then it schedules
 * itself again for the rest, or closes the broadcast and tells the
 * workspace. A canceled broadcast stops at the next batch; a template that
 * is no longer approved fails it before a single send; a wire that is down
 * fails it at the first person it cannot reach.
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
    await ports.alert({ kind: "broadcast_stopped", route: "broadcasts", about: { type: "broadcast", id: b.id }, subject: `Broadcast “${b.name}” not sent`, body: "The workspace is paused until billing resumes, so nothing went out. Resume from Settings › Billing and send it again." });
    return;
  }
  // Only while still scheduled: a cancel that landed between the read above
  // and this write is the row's answer, and the batch sends nothing.
  if (b.state === "scheduled" && !(await ports.startSending(b.id))) return;

  // The template must still be what Meta approved.
  const tpl = await ports.template(b.template_name, b.template_language);
  if (!tpl || tpl.meta_status !== "approved") {
    await ports.fail(b.id, "template_not_approved");
    await ports.alert({ kind: "broadcast_stopped", route: "broadcasts", about: { type: "broadcast", id: b.id }, subject: `Broadcast “${b.name}” stopped`, body: `The template “${b.template_name}” is no longer approved by WhatsApp, so nothing was sent.` });
    return;
  }
  // WHICH yes this send needs. Meta's category is the authority — it can
  // recategorise a live template — and purposeOfTemplate fails closed, so a
  // template whose category we do not have reads as marketing and needs the
  // stronger consent rather than the weaker one.
  const purpose = purposeOfTemplate(tpl.category);

  // What fills each slot: typed text once, the rest per person. The
  // workspace's own words for the slots that name it are read once.
  const specs = parseParamSpecs(b.params);
  const { businessName, bookingLink } = await ports.facts();
  const batch = await ports.batch(b.id, BROADCAST_CHUNK);

  // The people on the batch and what they were already sent, read once for
  // the batch rather than once per person. FAIL CLOSED: a read that fails
  // leaves the whole batch queued rather than guessing about anyone -- "we
  // could not check" is not "yes" -- and the run waits before trying again.
  const ids = batch.map((r) => r.contact_id);
  let people = new Map<string, ContactRow>();
  let priors = new Map<string, { id: string; sentAt: string | null }>();
  let unreadable = false;
  if (ids.length > 0) {
    try {
      [people, priors] = await Promise.all([ports.contacts(ids), ports.alreadySent(b.id, ids)]);
    } catch (e) {
      unreadable = true;
      console.error("broadcast_batch_unreadable", b.id, e instanceof Error ? e.message : String(e));
    }
  }

  let begun = 0;
  let marked = 0;
  const mark = async (contactId: string, patch: RecipientMark) => {
    marked += 1;
    await ports.mark(b.id, contactId, patch);
  };
  const skip = (contactId: string, reason: string) => mark(contactId, { state: "skipped", reason });

  /** One person, to the wire and back. "stop" when the run cannot go on past them. */
  const one = async (r: RecipientRow): Promise<"go on" | "stop"> => {
    const c = people.get(r.contact_id) ?? null;
    if (!c || c.erased_at) { await skip(r.contact_id, "erased"); return "go on"; }
    if (!c.phone_e164) { await skip(r.contact_id, "no_phone"); return "go on"; }
    // A run that died between the wire and its own bookkeeping left this
    // person a message row and a queued recipient row. Resumed (jobs/settle
    // reschedules the rest), the batch reads the row rather than sending twice:
    // they got it, and the recipient row now says so.
    const prior = priors.get(c.id) ?? null;
    // Their row records when the message actually LEFT, not when this run
    // noticed it had: the broadcast's page lists its people in that order, and
    // a resumed run stamping "now" on an hour-old send reorders the whole list.
    if (prior) { await mark(r.contact_id, { state: "sent", message_id: prior.id, sent_at: prior.sentAt }); return "go on"; }
    // The thread this send belongs to. Which yes this message needs, the
    // pause, and the workspace's status are the door's to re-read at the
    // wire, below — the one place a stale answer cannot be taken back.
    const target = await ports.target(c.phone_e164);
    if (!target) { await skip(r.contact_id, "no_thread"); return "go on"; }

    // Their own words in the slots: a first name nobody has on file reads
    // "there"; a slot nothing can fill holds the person, never a blank send.
    // A visit run's words for this person, resolved when the run was made.
    const facts = (r.facts !== null && typeof r.facts === "object" && !Array.isArray(r.facts) ? r.facts : {}) as Record<string, unknown>;
    const params = resolveParams(specs, {
      firstName: firstNameOf(c.display_name, c.wa_profile_name), businessName, bookingLink,
      visitWhen: typeof facts.visit_when === "string" ? facts.visit_when : null,
      visitService: typeof facts.visit_service === "string" ? facts.visit_service : null,
    });
    if (params.some((v) => !v)) { await skip(r.contact_id, "missing_value"); return "go on"; }
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
    // row: the person's own line says why they were held. A broadcast is the
    // owner's words (the row says so) sent by the machine (the door is told so).
    const out = await ports.deliver({
      tenantId: cmd.tenantId,
      conversationId: target.conversationId,
      contactId: c.id,
      to: c.phone_e164,
      channel: "whatsapp",
      sender: "human",
      kind: "broadcast",
      purpose,
      proactive: true,
      body: words,
      template: { name: b.template_name, language: b.template_language, params },
      // A run's message names its playbook, so a thread reads "by the Win-back playbook".
      meta: {
        source: "broadcast", broadcast_id: b.id, broadcast_name: b.name,
        ...(b.playbook_id ? { playbook_id: b.playbook_id, playbook_name: String((b.audience as { label?: unknown } | null)?.label ?? b.name) } : {}),
      },
    }).catch((e: unknown) => { throw new ThrownAtTheDoor(e); });
    if (out.outcome === "sent") { await mark(r.contact_id, { state: "sent", message_id: out.messageId }); return "go on"; }
    if (out.outcome === "refused") { await skip(r.contact_id, out.reason); return "go on"; }
    await mark(r.contact_id, { state: "failed", reason: "send_failed", message_id: out.messageId });
    if (!wireIsDown(out)) return "go on";
    // The wire, not the person: the run stops here and says so, rather than
    // burning everyone still queued as refused and ending as "sent".
    const cause = out.reason === "no_credentials" ? "the number is not connected" : out.reason === "no_sender_for_channel" ? "this runtime has no WhatsApp wire" : `WhatsApp answered HTTP ${out.status}`;
    await ports.fail(b.id, "wire_unavailable");
    await ports.alert({ kind: "broadcast_stopped", route: "broadcasts", about: { type: "broadcast", id: b.id }, subject: `Broadcast “${b.name}” stopped`, body: `WhatsApp could not be reached on this workspace's number (${cause}), so the rest was not sent. Reconnect the number in Settings › Channels and send it again.` });
    return "stop";
  };

  for (const [i, r] of batch.entries()) {
    if (unreadable) break;
    // Yield before the runner's ceiling rather than be killed mid-send: no new
    // send starts after the deadline, and the follow-up job below carries the
    // rest. One person at least, so a batch that starts late still moves on.
    if (begun > 0 && ports.now() >= cmd.deadline) break;
    begun += 1;
    // FAIL CLOSED per person: a read that fails before the door — their
    // thread, the words for their slots — leaves them queued for the next
    // batch rather than guessing; and one person's failure is never the
    // batch's: the people after them are still reached. The door itself is
    // the exception (ThrownAtTheDoor).
    let verdict: "go on" | "stop";
    try {
      verdict = await one(r);
    } catch (e) {
      if (e instanceof ThrownAtTheDoor) throw e.error;
      console.error("broadcast_person_unreadable", r.contact_id, e instanceof Error ? e.message : String(e));
      continue;
    }
    if (verdict === "stop") return;
    // A breath between two sends, none after the last: the next batch is a job away.
    if (BROADCAST_GAP_MS > 0 && i < batch.length - 1) await ports.sleep(BROADCAST_GAP_MS);
  }

  const remaining = await ports.remaining(b.id);
  if (remaining > 0) {
    // Still wanted? A cancel during this batch stops here.
    if ((await ports.state(b.id)) !== "sending") return;
    // A batch that reached nobody waits before the next: every read failed,
    // and trying again this second is how a failing read spins the ledger.
    if (batch.length > 0 && marked === 0) await ports.scheduleNext(b.id, new Date(ports.now() + BROADCAST_STALL_RETRY_MS));
    else await ports.scheduleNext(b.id);
    return;
  }

  const { sent, held } = await ports.tally(b.id);
  await ports.finish(b.id, { sent, held });
  // The run FINISHED. Said as what it is, not as a job that did not finish,
  // which is what every alert from this file was kept as until 00141, so two
  // completed broadcasts were counted into Today's "6 jobs did not finish".
  await ports.alert({
    kind: "broadcast_sent",
    route: "broadcasts",
    about: { type: "broadcast", id: b.id },
    subject: `Broadcast “${b.name}” sent`,
    body: `${sent} ${sent === 1 ? "person" : "people"} got it${held ? `; ${held} held back (no recorded yes, asked to stop, no number, a person had the thread, or a run that did not finish)` : ""}. Replies land in the Inbox.`,
  });
}
