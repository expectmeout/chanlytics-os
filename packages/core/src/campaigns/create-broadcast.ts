import {
  AppError,
  AUDIENCE_KINDS,
  nextOpenMoment,
  BROADCAST_MAX_RECIPIENTS,
  BROADCAST_NAME_MAX,
  BROADCAST_SCHEDULE_MAX_DAYS,
  EVERYONE_LABEL,
  PEOPLE_LISTS,
  audienceMembers,
  broadcastName,
  eligibleFor,
  emptyAudienceRefusal,
  overLimitRefusal,
  paramLabel,
  purposeOfTemplate,
  type Audience,
  type AudienceKind,
} from "@chanlytics/contracts";
import { assembleRun } from "./assemble";
import { templateValues } from "./template-values";
import type { CreateBroadcastCommand, CreateBroadcastPorts } from "./ports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An instant names its offset: "Z" or "±hh:mm". A date alone, or a wall-clock time without one, is read on the server's clock. */
const OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export interface BroadcastReceipt {
  id: string;
  name: string;
  state: "scheduled";
  recipient_count: number;
  scheduled_for: string;
  /** The time asked for (or "now") when it fell outside the hours a send may go out in, and was moved. */
  moved_from: string | null;
  decision_id: string;
}

/**
 * A person's broadcast: one approved template to the people who said yes.
 *
 * { template_id, params, audience: { kind, id }, scheduled_for?, name? }.
 * The template must be approved by WhatsApp; the values must be ones Meta
 * accepts; the audience is one of People's lists, a list kept by hand, or
 * everyone — crossed with who said yes and has a number, for the yes this
 * template's category needs. The recipients are enrolled now, so the owner
 * sees who and how many; the job re-checks each person at the wire. The
 * ledger records the decision to send. The body is judged here, in
 * sentences for the person composing: the values are judged against the
 * template Meta holds, which no schema knows.
 */
export async function createBroadcast(
  ports: CreateBroadcastPorts,
  cmd: CreateBroadcastCommand,
): Promise<BroadcastReceipt> {
  const { now } = cmd;
  const body = cmd.body as {
    template_id?: unknown;
    params?: unknown;
    audience?: { kind?: unknown; id?: unknown } | null;
    scheduled_for?: unknown;
    name?: unknown;
  } | null;

  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  if (!UUID.test(templateId)) throw new AppError("validation", "Pick a template.");
  const kind = body?.audience?.kind;
  if (typeof kind !== "string" || !(AUDIENCE_KINDS as readonly string[]).includes(kind)) {
    throw new AppError("validation", "Pick who this goes to.");
  }
  const audienceId = typeof body?.audience?.id === "string" ? body.audience.id : null;
  if (kind === "saved" && (!audienceId || !UUID.test(audienceId))) throw new AppError("validation", "Pick a list.");
  if (kind === "list" && (!audienceId || !PEOPLE_LISTS.some((l) => l.id === audienceId)))
    throw new AppError("validation", "Pick a list.");

  // 1–2. The template, as Meta holds it; the values, as Meta will accept them.
  const { template: tpl, specs } = await templateValues(ports, { templateId, params: body?.params, visits: false });

  // 3. When, as asked: an instant with its offset. A date alone would be read
  // as midnight UTC -- the evening before, in this hemisphere -- and a
  // wall-clock time without an offset on the server's clock, not the
  // business's; either lands the send at the wrong moment with no note.
  let when = now;
  if (typeof body?.scheduled_for === "string" && body.scheduled_for) {
    const t = new Date(body.scheduled_for);
    if (Number.isNaN(t.getTime())) throw new AppError("validation", "That is not a time.");
    if (!OFFSET.test(body.scheduled_for))
      throw new AppError("validation", "Give the time with its offset, like 2026-09-20T15:00:00-04:00.");
    when = t.getTime() > now.getTime() ? t : now;
  }

  // 3b. The number, as WhatsApp has rated it. A flagged number does not
  // broadcast; asked before the people are read, which is the costly read.
  const health = await ports.number();
  if (!health) throw new AppError("conflict", "Connect a WhatsApp number first — a broadcast goes out on one.", 409);
  if (!health.canSend) throw new AppError("conflict", health.refusal!, 409);

  // 4. The audience, crossed with who said yes. With their appointments, so a
  // calendar list (Lapsed, Asked never booked) enrols exactly the people the
  // page counted.
  const rows = await ports.people(now);
  let savedIds: Set<string> | null = null;
  let label = EVERYONE_LABEL;
  if (kind === "saved") {
    const seg = await ports.savedList(audienceId!);
    if (!seg) throw new AppError("not_found", "List not found.", 404);
    savedIds = new Set(seg.memberIds);
    label = seg.name;
  } else if (kind === "list") {
    label = PEOPLE_LISTS.find((l) => l.id === audienceId)!.label;
  }
  // WHICH yes this send needs, from the template's category: the send job
  // derives the same purpose from the same column, so the audience enrolled
  // here is the audience the wire will accept.
  const purpose = purposeOfTemplate(tpl.category);
  const eligible = eligibleFor(rows, kind as AudienceKind, audienceId, savedIds, purpose);
  // Nobody to send to says which of its two causes it is: nobody on it said this yes, or the ones who did have no
  // number. So the refusal is handed everyone on the audience, before anyone is left out.
  if (eligible.length === 0)
    throw new AppError(
      "conflict",
      emptyAudienceRefusal(purpose, label, audienceMembers(rows, kind as AudienceKind, audienceId, savedIds)),
      409,
    );
  if (eligible.length > BROADCAST_MAX_RECIPIENTS)
    throw new AppError("validation", `At most ${BROADCAST_MAX_RECIPIENTS} people in one broadcast.`);
  // An audience past the day's limit is split, not silently cut.
  const over = overLimitRefusal(health, eligible.length);
  if (over) throw new AppError("validation", over);

  // 4b. Never at 3 AM. The same window the playbooks keep, by the business's
  // own clock: a time outside it -- asked for, or "now" at eleven at night --
  // moves to nine the next morning, and the receipt says so. The ceiling is
  // judged on the moment it really goes, not the one asked for.
  const tz = await ports.timezone();
  const open = nextOpenMoment(tz, when);
  const movedFrom = open.moved ? when.toISOString() : null;
  when = open.at;
  if (when.getTime() > now.getTime() + BROADCAST_SCHEDULE_MAX_DAYS * 86_400_000)
    throw new AppError("validation", `Schedule within ${BROADCAST_SCHEDULE_MAX_DAYS} days.`);
  // Named for the business's day, not the server's (UTC on Vercel).
  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, BROADCAST_NAME_MAX)
      : broadcastName(tpl.name, tz, now, tpl.title);
  const audience: Audience = { kind: kind as AudienceKind, id: audienceId, label };

  // 5. The rows, then the job, then the ledger.
  const made = await assembleRun(ports, {
    broadcast: {
      name,
      template_id: tpl.id,
      template_name: tpl.name,
      template_language: tpl.language,
      params: specs,
      audience,
      state: "scheduled",
      scheduled_for: when.toISOString(),
      recipient_count: eligible.length,
      created_by: cmd.userId,
    },
    recipients: eligible.map((p) => ({ contact_id: p.id, facts: null })),
    sendAt: when,
  });
  if (!made.ok) {
    if (made.failure === "schedule_failed")
      throw new AppError(
        "upstream_meta",
        "The send could not be scheduled. Nothing was sent; try again.",
        502,
        made.error,
      );
    // A sentence for the person either way: the row says failed, and a bare
    // error reached them as "Something went wrong" with no reason on the row.
    throw new AppError(
      "internal",
      made.failure === "run_not_created"
        ? "The broadcast could not be created. Nothing was sent; try again."
        : "The people could not be enrolled. Nothing was sent; try again.",
      500,
      made.error,
    );
  }
  const decision_id = await ports.record("broadcast", made.id, "send_broadcast", {
    name,
    template: `${tpl.name}/${tpl.language}`,
    category: tpl.category,
    audience: { kind: audience.kind, id: audience.id, label: audience.label },
    values: specs.map(paramLabel),
    recipients: eligible.length,
    scheduled_for: when.toISOString(),
    ...(movedFrom ? { moved_from: movedFrom } : {}),
  });
  return {
    id: made.id,
    name,
    state: "scheduled",
    recipient_count: eligible.length,
    scheduled_for: when.toISOString(),
    moved_from: movedFrom,
    decision_id,
  };
}
