import { AppError } from "@chanlytics/contracts";
import { withRoute, memberContext } from "@/server/with-route";
import { CALL_COLUMNS, toCallDto } from "@/server/dto";
import { requireUuid } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { tenantFacts } from "@/server/tenant";
import { attachment, callText, dateTag, personLabel, safeName } from "@/server/export";

/**
 * GET /api/v1/calls/:id/export — one phone call as a text file: the facts,
 * the summary, the turns with their clock. The recording itself stays behind
 * /recording; this is the words.
 */
export const GET = withRoute(async (req, ctx) => {
  const { supabase, userId, params } = ctx;
  takeRate(userId, "export");
  const id = requireUuid(params.id, "call");
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));

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
  const who = personLabel(call.contact) !== "Unknown" ? personLabel(call.contact) : call.from_e164 ?? "caller";
  console.log(JSON.stringify({ level: "info", event: "export.call", user: userId, tenant: member.tenantId, call: id, turns: call.transcript_object?.length ?? 0 }));
  return attachment(`call-${safeName(who)}-${dateTag(now, timezone)}.txt`, text, "text/plain");
});
