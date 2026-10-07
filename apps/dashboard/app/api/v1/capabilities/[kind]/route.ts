import { write, workspace } from "@/server/route";
import { ActivateBody, activateCapability, deactivateCapability } from "@/server/workspace/capabilities";

/**
 * POST /api/v1/capabilities/:kind — the owner switches a capability on.
 *
 * The act, recorded: who and when, on a row per capability. Readiness is
 * computed from the workspace's records and refused when they say no, so an
 * activation is never a claim ahead of the facts; evidence stays what the
 * records show. Owners only: it is the owner's decision what the workspace
 * says is live. Activation gates nothing at runtime yet. The first run's Finish (first_run),
 * activating calls for the first time, also emails the owner that the receptionist is answering.
 *
 * The handles are activateCapability and deactivateCapability in src/server/workspace/capabilities.ts: the route is
 * their declaration (who may, how often), the verbs are what they do.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: ActivateBody,
  handle: ({ ctx, member, input }) => activateCapability(ctx, member, input),
});

/** DELETE /api/v1/capabilities/:kind — the owner switches it off again. The row stays; the history does. */
export const DELETE = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, member }) => deactivateCapability(ctx, member),
});
