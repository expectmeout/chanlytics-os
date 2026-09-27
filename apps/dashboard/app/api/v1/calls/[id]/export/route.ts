import { AppError } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { CALL_COLUMNS, toCallDto } from "@/server/dto";
import { requireUuid } from "@/server/request-guards";
import { tenantFacts } from "@/server/tenant";
import { attachment, callText, dateTag, personLabel, safeName } from "@/server/export/export";
import { recordDecision } from "@/server/verbs";

/**
 * GET /api/v1/calls/:id/export — one call as a text file: the transcript
 * and the analysis, for the business's own records. Any member, in the
 * workspace the tab named, ten a minute.
 */
export const GET = read({
  scope: workspace,
  rate: "export",
  handle: async ({ ctx, member }) => {
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
    console.log(
      JSON.stringify({
        level: "info",
        event: "export.call",
        user: userId,
        tenant: member.tenantId,
        call: id,
        turns: call.transcript_object?.length ?? 0,
      }),
    );
    await recordDecision(ctx, member.tenantId, "call", id, "export", {
      what: "call",
      turns: call.transcript_object?.length ?? 0,
    });
    return attachment(`call-${safeName(who)}-${dateTag(now, timezone)}.txt`, text, "text/plain");
  },
});
