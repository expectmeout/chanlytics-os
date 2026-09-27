import "server-only";
import { z } from "zod";
import {
  AUDIENCE_KINDS,
  BUILTIN_LISTS,
  EVERYONE_LABEL,
  broadcastName,
  cleanParam,
  clockWhen,
  eligibleFor,
  emptyAudienceRefusal,
  exampleParams,
  parseParamSpec,
  purposeOfTemplate,
  renderTemplate,
  type ParamSpec,
} from "@chanlytics/contracts";
import { archivedListWords, poolList } from "../../../people/audience";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { lists as listsReader } from "../../../readers/lists";
import { UUID, defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

async function proposeBroadcast(
  t: ToolContext,
  input: {
    template_id: string;
    audience_kind: string;
    audience_id?: string;
    params?: string[];
    scheduled_for?: string;
    name?: string;
  },
): Promise<ProposalOutcome> {
  const templateId = str(input.template_id, 40);
  const kind = str(input.audience_kind, 10);
  const audienceId = str(input.audience_id, 60) || null;
  if (!UUID.test(templateId)) return refuse("template_id must be an id list_audiences returned");
  if (!(AUDIENCE_KINDS as readonly string[]).includes(kind))
    return refuse("audience_kind must be everyone, list or saved");
  if (kind === "list" && !BUILTIN_LISTS.some((l) => l.id === audienceId))
    return refuse("audience_id must be a People list id, as list_audiences names them");
  if (kind === "saved" && !(audienceId && UUID.test(audienceId)))
    return refuse("audience_id must be a saved list id from list_audiences");
  const specs: ParamSpec[] = [];
  for (const p of Array.isArray(input.params) ? (input.params as unknown[]) : []) {
    const spec = parseParamSpec(p);
    if (!spec) return refuse("each value is text, or @first_name, @business_name or @booking_link");
    if (spec.kind === "text") {
      const v = cleanParam(spec.value);
      if (v === null) return refuse("every typed value must be plain text under 1024 characters, without line breaks");
      specs.push({ kind: "text", value: v });
    } else {
      specs.push(spec);
    }
  }
  const params = specs;
  const { data: tpl } = await t.ctx.supabase
    .from("templates")
    .select("id, name, language, meta_status, category, variables, body_preview")
    .eq("id", templateId)
    .eq("tenant_id", t.tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!tpl || tpl.meta_status !== "approved")
    return refuse("that template is not approved by WhatsApp; list_audiences names the approved ones");
  const expected = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
  if (params.length !== expected)
    return refuse(`this template takes ${expected} value${expected === 1 ? "" : "s"}, in order`);

  // The audience, counted the way the route will count it.
  // The pool and the list the route will read, so the count here is the count it enrols: once a turn, so a listing of
  // the audiences before it read the same pool (readers/audience-pool.ts).
  const pool = (await load(t.rc, audiencePool, undefined)).data;
  // Any list, counted the way the send will count it (audience.ts poolList): a built-in or a saved list alike, and
  // one that can't be counted here refused with why. One of the workspace's own is counted from the lists the turn
  // holds (readers/lists.ts, as list_audiences read them), never read again.
  let members: Set<string> | null = null;
  let label = EVERYONE_LABEL;
  if (kind !== "everyone") {
    const kept = kind === "saved" ? (await load(t.rc, listsReader, undefined)).data.lists : undefined;
    const found = await poolList(
      t.ctx,
      t.tenantId,
      pool,
      {
        kind: kind === "list" ? "builtin" : "saved",
        id: audienceId!,
      },
      kept,
    );
    if (!found) return refuse("no such list; list_audiences names them");
    if (found.archived) return refuse(archivedListWords(found.label, "send"));
    if ("unknown" in found) return refuse(`${found.label} can't be counted here: ${found.unknown}`);
    members = new Set(found.memberIds);
    label = found.label;
  }
  const rows = members ? pool.rows.filter((r) => members!.has(r.id)) : pool.rows;
  // The same purpose the route will derive, from the same column of the same
  // template row this function already read. An assistant that proposes a
  // broadcast the route then refuses has wasted the operator's approval.
  const purpose = purposeOfTemplate(tpl.category);
  const count = eligibleFor(rows, "everyone", null, null, purpose).length;
  // In the route's words, which say which cause it is -- nobody said this yes, or the ones who did have no number.
  if (count === 0)
    return refuse(
      `nobody on "${label}" can receive this message: ${emptyAudienceRefusal(purpose, label, rows)} Say so, and name what to do about it`,
    );
  const when = str(input.scheduled_for, 40) || null;
  // With its offset: a bare date is midnight UTC, the evening before here, and
  // the route refuses it after the person approved the card.
  if (when && (Number.isNaN(Date.parse(when)) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(when)))
    return refuse("scheduled_for must be an ISO time with its offset, like 2026-09-20T15:00:00-04:00");
  const values = params;
  const words = renderTemplate(tpl.body_preview, exampleParams(values, "the business"));
  // Named for the business's day and said by its clock, as the route names it and the pages say it.
  const name = str(input.name, 80) || broadcastName(tpl.name, t.timezone, t.now);
  const whenWords = when ? clockWhen(Date.parse(when), t.timezone, t.now.getTime()) : "now";
  return propose({
    kind: "broadcast",
    title: `Broadcast to ${label}`,
    summary: `${count} ${count === 1 ? "person" : "people"} who said yes · “${tpl.name}” · ${whenWords}: ${words.slice(0, 160)}${words.length > 160 ? "…" : ""}`,
    payload: {
      template_id: tpl.id,
      template_name: tpl.name,
      audience_kind: kind,
      audience_id: audienceId,
      audience_label: label,
      params: values,
      scheduled_for: when,
      name,
      count,
    },
  });
}

export const propose_broadcast = defineAct({
  name: "propose_broadcast",
  description:
    "Propose a broadcast: one approved WhatsApp template to an audience — everyone who said yes, or any list list_audiences names (its kind and audience_id: a People list, or one of the workspace's own) — with the template's values in order (typed text, or @first_name, @business_name, @booking_link to fill per person) and an optional ISO time with its offset (2026-09-20T15:00:00-04:00, never a bare date). Read list_audiences first. It becomes a card the person approves; nobody without a recorded yes is ever included.",
  input: z.object({
    template_id: z.string(),
    audience_kind: z.enum(["everyone", "list", "saved"]),
    audience_id: z.string().optional(),
    params: z.array(z.string()).optional(),
    scheduled_for: z.string().optional(),
    name: z.string().optional(),
  }),
  label: "Preparing a broadcast",
  build: proposeBroadcast,
});
