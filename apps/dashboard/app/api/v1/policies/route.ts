import { read, write, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { autonomy } from "@/server/readers/autonomy";
import { changePolicy, PolicyChange } from "@/server/campaigns/policy-write";

/**
 * GET /api/v1/policies — the workspace autonomy matrix (E3): the pane draws every row, the follow-ups' too (0006; 0008,
 * amended 18 Oct 2026; contracts policyClassOffered). The body is its reader's (readers/autonomy.ts).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), autonomy, undefined)).data,
});

/**
 * PUT /api/v1/policies — {class, mode}, or a dial of the reply row. Owners and
 * operators tune autonomy (the mockup's ST_PERMS says so); viewers are refused
 * here, not just hidden. A mode is refused where its class cannot honour it (R1:
 * no option without an enforcer), and the money lock lives in a DB trigger —
 * even this route cannot unlock it. Which fields may travel together depends
 * on the class, so the handler judges that, and every refusal is a sentence.
 *
 * The handle is changePolicy in src/server/campaigns/policy-write.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const PUT = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  input: PolicyChange,
  handle: ({ ctx, input, member }) => changePolicy(ctx, input, member),
});
