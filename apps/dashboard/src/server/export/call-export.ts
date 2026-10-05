/**
 * One call as a text file (app/api/v1/calls/:id/export): the transcript and the analysis, for the business's own
 * records. The export is written to the ledger as a decision. The route declares who may and how often.
 */
import { AppError } from "@chanlytics/contracts";
import { CALL_COLUMNS, toCallDto } from "@/server/dto";
import { requireUuid } from "@/server/request-guards";
import { tenantFacts } from "@/server/tenant";
import { attachment, callText, dateTag, personLabel, safeName } from "@/server/export/export";
import { recordDecision } from "@/server/verbs";
import { log } from "@/server/log";
import type { Member, Params } from "@/server/route";
import type { RouteContext } from "@/server/with-route";

export async function exportCall(ctx: RouteContext & { params: Params }, member: Member) {
  const { supabase, userId, params } = ctx;
  const id = requireUuid(params.id, "call");
  const { data, error } = await supabase
    .from("calls")
    .select(CALL_COLUMNS)
    .eq("id", id)
    .eq("tenant_id", member.tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", "Call not found.");
  const call = toCallDto(data);
  const { name, timezone } = await tenantFacts(supabase, member.tenantId);
  const now = new Date();
  const text = callText(call, { business: name, tz: timezone, exportedAt: now });
  const who = personLabel(call.contact) !== "Unknown" ? personLabel(call.contact) : (call.from_e164 ?? "caller");
  log.info("export.call", {
    user: userId,
    tenant_id: member.tenantId,
    call: id,
    turns: call.transcript_object?.length ?? 0,
  });
  await recordDecision(ctx, member.tenantId, "call", id, "export", {
    what: "call",
    turns: call.transcript_object?.length ?? 0,
  });
  return attachment(`call-${safeName(who)}-${dateTag(now, timezone)}.txt`, text, "text/plain");
}
