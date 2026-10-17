import { visitRoute } from "../calendar/appointment-key.js";
import { pipelineRoute } from "../deals/pipeline/pipeline-views.js";
import { pipelineRowId } from "../deals/pipeline/pipeline-vm.js";
import { leadsRoute } from "../leads/lead-plan.js";
import { listToken } from "../people/lists/lists.js";
import { personTabRoute } from "../person-page/route.js";
import { lensRoute, reviewRoute } from "../reports/lenses.js";
export const RECORDS_WITHOUT_AN_ADDRESS = {
  notification: "a kept notice opens where its own row says (noticeRoute), which is the address of the record it is about; the notice has no page of its own",
  workspace: "the workspace has no page of its own: what is about it is the business's facts, its rules, its lines, its team and its bill, each a kind with its address"
};
const PANE = { channel: "admin/integrations", team: "admin/team", billing: "admin/billing" };
export function addressOf(ref) {
  switch (ref.kind) {
    case "person":
      return personTabRoute(ref.id, ref.tab ?? "overview");
    case "conversation":
      return ref.in === "conversations" ? `conversations/${ref.id}` : `inbox/th-${ref.id}`;
    case "hold":
      return `inbox/th-${ref.conversationId}`;
    case "call":
      return ref.on === "live" ? `live/${ref.id}` : `conversations/cv-${ref.id}`;
    case "visit":
      return visitRoute(ref.id, ref.day);
    case "step":
      return `clients/${ref.personId}`;
    case "deal":
      return ref.on === "pipeline" ? pipelineRoute({ peek: pipelineRowId(ref.personId, ref.dealKey ?? null) }) : `clients/${ref.personId}`;
    case "list":
      return `clients/${listToken({ kind: ref.saved ? "saved" : "builtin", id: ref.id })}`;
    case "lead":
      return leadsRoute({ peek: ref.id ?? null, searchId: ref.searchId ?? null });
    case "campaign":
    case "reach_out":
      return `campaigns/moment:${ref.id}`;
    case "send":
      return `broadcasts/run:${ref.id}`;
    case "template":
      return `campaigns/message:${ref.name}`;
    case "review":
      return ref.id ? reviewRoute(ref.id) : lensRoute("reviews");
    case "facts":
      return "admin/workspace";
    case "rules":
      return "admin/autonomy";
    case "channel":
      return PANE.channel;
    case "team":
      return PANE.team;
    case "billing":
      return PANE.billing;
  }
}
export function jobRecordOf(kind, payload) {
  const named = (key) => {
    const v = payload && typeof payload === "object" ? payload[key] : null;
    return typeof v === "string" && v ? v : null;
  };
  if (kind === "outbound_send") {
    const id = named("conversation_id");
    return id ? { route: addressOf({ kind: "conversation", id }), about: { type: "conversation", id } } : null;
  }
  if (kind === "broadcast_send") {
    const id = named("broadcast_id");
    return id ? { route: addressOf({ kind: "send", id }), about: { type: "broadcast", id } } : null;
  }
  return null;
}
